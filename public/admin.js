// admin.js
// Lógica del panel de administración: CRUD de recursos, aprobación de usuarios

import { db } from "./firebase-config.js";
import { observarSesion, cerrarSesion } from "./auth.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const deniedView = document.getElementById("deniedView");
const adminPanel = document.getElementById("adminPanel");

document.getElementById("btnLogout").addEventListener("click", cerrarSesion);

// --- Control de acceso: solo admin puede ver este panel ---
observarSesion((user, perfil) => {
  if (!user || !perfil || perfil.rol !== "admin") {
    deniedView.classList.remove("hidden");
    adminPanel.classList.add("hidden");
    return;
  }
  deniedView.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  cargarRecursos();
  cargarPendientes();
  cargarTodos();
});

// --- Tabs ---
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tabRecursos").classList.add("hidden");
    document.getElementById("tabUsuarios").classList.add("hidden");
    document.getElementById("tabTodos").classList.add("hidden");
    document.getElementById("tab" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.remove("hidden");
  });
});

// ============ RECURSOS ============

const rTitulo = document.getElementById("rTitulo");
const rDescripcion = document.getElementById("rDescripcion");
const rContenido = document.getElementById("rContenido");
const rCategoria = document.getElementById("rCategoria");
const rPrecio = document.getElementById("rPrecio");
const rGratis = document.getElementById("rGratis");
const rPublico = document.getElementById("rPublico");
const rVisible = document.getElementById("rVisible");
const recursoId = document.getElementById("recursoId");
const formTitulo = document.getElementById("formTitulo");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");
const msgRecurso = document.getElementById("msgRecurso");

function mostrarMsg(el, texto, tipo) {
  el.textContent = texto;
  el.className = "msg " + tipo;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

function limpiarFormRecurso() {
  recursoId.value = "";
  rTitulo.value = "";
  rDescripcion.value = "";
  rContenido.value = "";
  rCategoria.value = "";
  rPrecio.value = "";
  rGratis.checked = false;
  rPublico.checked = false;
  rVisible.checked = true;
  formTitulo.textContent = "Nuevo recurso";
  btnCancelarEdicion.classList.add("hidden");
}

btnCancelarEdicion.addEventListener("click", limpiarFormRecurso);

document.getElementById("btnGuardarRecurso").addEventListener("click", async () => {
  if (!rTitulo.value.trim()) {
    mostrarMsg(msgRecurso, "El título es obligatorio.", "err");
    return;
  }

  const data = {
    titulo: rTitulo.value.trim(),
    descripcion: rDescripcion.value.trim(),
    contenido: rContenido.value.trim(),
    categoria: rCategoria.value.trim() || "General",
    precio: Number(rPrecio.value) || 0,
    esGratis: rGratis.checked,
    esPublico: rPublico.checked,
    visible: rVisible.checked
  };

  try {
    if (recursoId.value) {
      await updateDoc(doc(db, "recursos", recursoId.value), data);
      mostrarMsg(msgRecurso, "Recurso actualizado.", "ok");
    } else {
      data.fechaSubida = serverTimestamp();
      await addDoc(collection(db, "recursos"), data);
      mostrarMsg(msgRecurso, "Recurso creado.", "ok");
    }
    limpiarFormRecurso();
    cargarRecursos();
  } catch (err) {
    mostrarMsg(msgRecurso, "Error: " + err.message, "err");
  }
});

async function cargarRecursos() {
  const snap = await getDocs(query(collection(db, "recursos"), orderBy("fechaSubida", "desc")));
  const tbody = document.getElementById("tablaRecursos");
  const empty = document.getElementById("emptyRecursos");
  tbody.innerHTML = "";

  if (snap.empty) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  snap.forEach(docSnap => {
    const r = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.titulo}</td>
      <td>${r.categoria || ""}</td>
      <td><span class="badge ${r.esGratis ? "gratis" : "pago"}">${r.esGratis ? "Gratis" : "$" + r.precio}</span></td>
      <td><span class="badge ${r.esPublico ? "publico" : "privado"}">${r.esPublico ? "Público" : "Privado"}</span> ${!r.visible ? "<span class='badge privado'>Oculto</span>" : ""}</td>
      <td class="row-actions">
        <button class="secondary" data-edit="${docSnap.id}">Editar</button>
        <button class="danger" data-del="${docSnap.id}">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const snap2 = await getDocs(query(collection(db, "recursos"), where("__name__", "==", btn.dataset.edit)));
      snap2.forEach(d => {
        const r = d.data();
        recursoId.value = d.id;
        rTitulo.value = r.titulo || "";
        rDescripcion.value = r.descripcion || "";
        rContenido.value = r.contenido || "";
        rCategoria.value = r.categoria || "";
        rPrecio.value = r.precio || "";
        rGratis.checked = !!r.esGratis;
        rPublico.checked = !!r.esPublico;
        rVisible.checked = r.visible !== false;
        formTitulo.textContent = "Editando: " + r.titulo;
        btnCancelarEdicion.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  });

  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar este recurso permanentemente?")) return;
      await deleteDoc(doc(db, "recursos", btn.dataset.del));
      cargarRecursos();
    });
  });
}

// ============ USUARIOS PENDIENTES ============

async function cargarPendientes() {
  const snap = await getDocs(query(collection(db, "usuarios"), where("aprobado", "==", false)));
  const tbody = document.getElementById("tablaPendientes");
  const empty = document.getElementById("emptyPendientes");
  tbody.innerHTML = "";

  if (snap.empty) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  snap.forEach(docSnap => {
    const u = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td class="row-actions">
        <button class="success" data-approve="${docSnap.id}">Aprobar</button>
        <button class="danger" data-reject="${docSnap.id}">Rechazar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-approve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "usuarios", btn.dataset.approve), { aprobado: true });
      cargarPendientes();
      cargarTodos();
    });
  });

  tbody.querySelectorAll("[data-reject]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Rechazar y borrar esta solicitud?")) return;
      await deleteDoc(doc(db, "usuarios", btn.dataset.reject));
      cargarPendientes();
      cargarTodos();
    });
  });
}

// ============ TODOS LOS USUARIOS ============

async function cargarTodos() {
  const snap = await getDocs(collection(db, "usuarios"));
  const tbody = document.getElementById("tablaTodos");
  tbody.innerHTML = "";

  snap.forEach(docSnap => {
    const u = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td>${u.rol}</td>
      <td><span class="badge ${u.aprobado ? "gratis" : "pago"}">${u.aprobado ? "Aprobado" : "Pendiente"}</span></td>
      <td class="row-actions">
        ${u.rol !== "admin"
          ? `<button class="secondary" data-makeadmin="${docSnap.id}">Hacer admin</button>`
          : ""}
        <button class="danger" data-deluser="${docSnap.id}">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-makeadmin]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Convertir a este usuario en administrador?")) return;
      await updateDoc(doc(db, "usuarios", btn.dataset.makeadmin), { rol: "admin" });
      cargarTodos();
    });
  });

  tbody.querySelectorAll("[data-deluser]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar este usuario? (Esto no borra su cuenta de acceso, solo su perfil)")) return;
      await deleteDoc(doc(db, "usuarios", btn.dataset.deluser));
      cargarTodos();
    });
  });
}
