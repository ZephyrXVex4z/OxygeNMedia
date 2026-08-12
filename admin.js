// admin.js
// Lógica del panel de administración: CRUD de recursos, aprobación de usuarios

import { db } from "./firebase-config.js";
import { observarSesion, cerrarSesion } from "./auth.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc,
  query, where, orderBy, serverTimestamp, arrayUnion, arrayRemove
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
  cargarRolesPendientes();
});

// --- Tabs ---
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tabRecursos").classList.add("hidden");
    document.getElementById("tabUsuarios").classList.add("hidden");
    document.getElementById("tabTodos").classList.add("hidden");
    document.getElementById("tabRoles").classList.add("hidden");
    document.getElementById("tab" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.remove("hidden");
  });
});

// ============ RECURSOS ============

const rTitulo = document.getElementById("rTitulo");
const rDescripcion = document.getElementById("rDescripcion");
const rContenido = document.getElementById("rContenido");
const rCategoria = document.getElementById("rCategoria");
const rPrecio = document.getElementById("rPrecio");
const rImagenURL = document.getElementById("rImagenURL");
const rImagenPreview = document.getElementById("rImagenPreview");
const rImagenContenidoURL = document.getElementById("rImagenContenidoURL");
const rImagenContenidoPreview = document.getElementById("rImagenContenidoPreview");
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

const rImagenURL_input = rImagenURL;
rImagenURL_input.addEventListener("input", () => {
  const url = rImagenURL_input.value.trim();
  if (url) {
    rImagenPreview.src = url;
    rImagenPreview.classList.remove("hidden");
  } else {
    rImagenPreview.classList.add("hidden");
  }
});

rImagenContenidoURL.addEventListener("input", () => {
  const url = rImagenContenidoURL.value.trim();
  if (url) {
    rImagenContenidoPreview.src = url;
    rImagenContenidoPreview.classList.remove("hidden");
  } else {
    rImagenContenidoPreview.classList.add("hidden");
  }
});

function limpiarFormRecurso() {
  recursoId.value = "";
  rTitulo.value = "";
  rDescripcion.value = "";
  rContenido.value = "";
  rCategoria.value = "";
  rPrecio.value = "";
  rImagenURL.value = "";
  rImagenPreview.classList.add("hidden");
  rImagenContenidoURL.value = "";
  rImagenContenidoPreview.classList.add("hidden");
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

  const dataPublica = {
    titulo: rTitulo.value.trim(),
    descripcion: rDescripcion.value.trim(),
    categoria: rCategoria.value.trim() || "General",
    precio: Number(rPrecio.value) || 0,
    imagenURL: rImagenURL.value.trim(),
    esGratis: rGratis.checked,
    esPublico: rPublico.checked,
    visible: rVisible.checked
  };

  const dataProtegida = {
    contenido: rContenido.value.trim(),
    imagenContenidoURL: rImagenContenidoURL.value.trim()
  };

  try {
    let idUsado = recursoId.value;
    if (idUsado) {
      await updateDoc(doc(db, "recursos", idUsado), dataPublica);
      mostrarMsg(msgRecurso, "Recurso actualizado.", "ok");
    } else {
      dataPublica.fechaSubida = serverTimestamp();
      dataPublica.compradoPor = [];
      const ref = await addDoc(collection(db, "recursos"), dataPublica);
      idUsado = ref.id;
      mostrarMsg(msgRecurso, "Recurso creado.", "ok");
    }
    // El contenido protegido siempre vive en el mismo documento fijo "data" dentro de la subcolección
    await setDoc(doc(db, "recursos", idUsado, "contenidoProtegido", "data"), dataProtegida);

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
      for (const d of snap2.docs) {
        const r = d.data();
        recursoId.value = d.id;
        rTitulo.value = r.titulo || "";
        rDescripcion.value = r.descripcion || "";
        rCategoria.value = r.categoria || "";
        rPrecio.value = r.precio || "";
        rImagenURL.value = r.imagenURL || "";
        if (r.imagenURL) {
          rImagenPreview.src = r.imagenURL;
          rImagenPreview.classList.remove("hidden");
        } else {
          rImagenPreview.classList.add("hidden");
        }

        // El contenido protegido vive en una subcolección aparte
        const protegidoSnap = await getDoc(doc(db, "recursos", d.id, "contenidoProtegido", "data"));
        const protegido = protegidoSnap.exists() ? protegidoSnap.data() : {};
        rContenido.value = protegido.contenido || "";
        rImagenContenidoURL.value = protegido.imagenContenidoURL || "";
        if (protegido.imagenContenidoURL) {
          rImagenContenidoPreview.src = protegido.imagenContenidoURL;
          rImagenContenidoPreview.classList.remove("hidden");
        } else {
          rImagenContenidoPreview.classList.add("hidden");
        }

        rGratis.checked = !!r.esGratis;
        rPublico.checked = !!r.esPublico;
        rVisible.checked = r.visible !== false;
        formTitulo.textContent = "Editando: " + r.titulo;
        btnCancelarEdicion.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
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
        <button class="secondary" data-pagos="${docSnap.id}">Pagos</button>
        ${u.rol !== "admin"
          ? `<button class="secondary" data-makeadmin="${docSnap.id}">Hacer admin</button>`
          : ""}
        <button class="danger" data-deluser="${docSnap.id}">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-pagos]").forEach(btn => {
    btn.addEventListener("click", () => abrirModalPagos(btn.dataset.pagos, btn.closest("tr")));
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

// ============ PAGOS (recursosComprados) ============

const modalPagos = document.getElementById("modalPagos");
const listaPagos = document.getElementById("listaPagos");
const pagosUsuarioNombre = document.getElementById("pagosUsuarioNombre");
const btnGuardarPagos = document.getElementById("btnGuardarPagos");
const btnCerrarPagos = document.getElementById("btnCerrarPagos");

let usuarioPagosActualId = null;
let usuarioPagosComprasAnteriores = [];

async function abrirModalPagos(userId, filaTr) {
  usuarioPagosActualId = userId;

  // Datos del usuario: nombre y sus compras actuales
  const usuarioSnap = await getDocs(query(collection(db, "usuarios"), where("__name__", "==", userId)));
  let usuarioData = null;
  usuarioSnap.forEach(d => usuarioData = d.data());
  if (!usuarioData) return;

  pagosUsuarioNombre.textContent = "Recursos pagados — " + usuarioData.nombre;
  const comprados = usuarioData.recursosComprados || [];
  usuarioPagosComprasAnteriores = comprados;

  // Solo recursos de paga (esGratis === false)
  const recursosSnap = await getDocs(query(collection(db, "recursos"), where("esGratis", "==", false)));

  if (recursosSnap.empty) {
    listaPagos.innerHTML = "<p style='color:var(--text-dim); font-size:13px;'>No hay recursos de paga creados todavía.</p>";
  } else {
    listaPagos.innerHTML = "";
    recursosSnap.forEach(docSnap => {
      const r = docSnap.data();
      const marcado = comprados.includes(docSnap.id);
      const row = document.createElement("div");
      row.className = "checkbox-row";
      row.innerHTML = `
        <input type="checkbox" id="pago_${docSnap.id}" value="${docSnap.id}" ${marcado ? "checked" : ""}>
        <label style="margin:0" for="pago_${docSnap.id}">${r.titulo} — $${r.precio} MXN</label>
      `;
      listaPagos.appendChild(row);
    });
  }

  modalPagos.classList.remove("hidden");
}

btnCerrarPagos.addEventListener("click", () => {
  modalPagos.classList.add("hidden");
  usuarioPagosActualId = null;
});

btnGuardarPagos.addEventListener("click", async () => {
  if (!usuarioPagosActualId) return;
  const seleccionados = [...listaPagos.querySelectorAll("input[type=checkbox]:checked")].map(el => el.value);
  const anteriores = usuarioPagosComprasAnteriores || [];

  const agregados = seleccionados.filter(id => !anteriores.includes(id));
  const quitados = anteriores.filter(id => !seleccionados.includes(id));

  try {
    // 1. Actualiza el array del usuario (para que el admin vea fácil qué compró)
    await updateDoc(doc(db, "usuarios", usuarioPagosActualId), { recursosComprados: seleccionados });

    // 2. Actualiza compradoPor en cada recurso afectado (esto es lo que valida la regla de seguridad)
    for (const recursoId of agregados) {
      await updateDoc(doc(db, "recursos", recursoId), { compradoPor: arrayUnion(usuarioPagosActualId) });
    }
    for (const recursoId of quitados) {
      await updateDoc(doc(db, "recursos", recursoId), { compradoPor: arrayRemove(usuarioPagosActualId) });
    }

    modalPagos.classList.add("hidden");
    usuarioPagosActualId = null;
  } catch (err) {
    alert("Error al guardar: " + err.message);
  }
});

// ============ ROLES PENDIENTES ============

async function cargarRolesPendientes() {
  const snap = await getDocs(query(collection(db, "rolesDisponibles"), where("aprobado", "==", false)));
  const tbody = document.getElementById("tablaRolesPendientes");
  const empty = document.getElementById("emptyRoles");
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
      <td>${r.nombre}</td>
      <td class="row-actions">
        <button class="success" data-approve-rol="${docSnap.id}">Aprobar</button>
        <button class="danger" data-reject-rol="${docSnap.id}">Rechazar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-approve-rol]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "rolesDisponibles", btn.dataset.approveRol), { aprobado: true });
      cargarRolesPendientes();
    });
  });

  tbody.querySelectorAll("[data-reject-rol]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Rechazar este rol propuesto?")) return;
      await deleteDoc(doc(db, "rolesDisponibles", btn.dataset.rejectRol));
      cargarRolesPendientes();
    });
  });
}
