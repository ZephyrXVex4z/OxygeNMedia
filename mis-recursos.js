// mis-recursos.js
// Lista y edición de los recursos que el propio usuario (no admin) ha publicado.
// Siempre se mantienen gratis: el formulario no ofrece cambiar precio/tipo.

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { iniciarAyudaImagen } from "./ayuda-imagen.js";
import {
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc,
  query, where
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;
let misRecursos = [];

const listaRecursos = document.getElementById("listaRecursos");
const emptyRecursos = document.getElementById("emptyRecursos");

const modalEditar = document.getElementById("modalEditar");
const editId = document.getElementById("editId");
const editTitulo = document.getElementById("editTitulo");
const editDescripcion = document.getElementById("editDescripcion");
const editContenido = document.getElementById("editContenido");
const editCategoria = document.getElementById("editCategoria");
const editImagenURL = document.getElementById("editImagenURL");
const msgEditar = document.getElementById("msgEditar");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver esto. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  cargarMisRecursos();
});

async function cargarMisRecursos() {
  const snap = await getDocs(query(collection(db, "recursos"), where("subidoPor", "==", usuarioActual.uid)));
  misRecursos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (misRecursos.length === 0) {
    listaRecursos.innerHTML = "";
    emptyRecursos.classList.remove("hidden");
    return;
  }
  emptyRecursos.classList.add("hidden");

  listaRecursos.innerHTML = misRecursos.map(r => `
    <div class="recurso-item">
      ${r.imagenURL
        ? `<img class="recurso-thumb" src="${r.imagenURL}" onerror="this.style.display='none'">`
        : `<div class="recurso-thumb"></div>`}
      <div class="recurso-info">
        <div class="titulo">${r.titulo}${r.visible === false ? " (oculto)" : ""}</div>
        <div class="meta">${r.categoria || "General"} · Gratis</div>
      </div>
      <div class="recurso-actions">
        <button class="secondary" data-editar="${r.id}">Editar</button>
        <button class="danger" data-borrar="${r.id}">Borrar</button>
      </div>
    </div>
  `).join("");

  listaRecursos.querySelectorAll("[data-editar]").forEach(btn => {
    btn.addEventListener("click", () => abrirEdicion(btn.dataset.editar));
  });
  listaRecursos.querySelectorAll("[data-borrar]").forEach(btn => {
    btn.addEventListener("click", () => borrarRecurso(btn.dataset.borrar));
  });
}

async function abrirEdicion(id) {
  const r = misRecursos.find(x => x.id === id);
  if (!r) return;

  editId.value = id;
  editTitulo.value = r.titulo || "";
  editDescripcion.value = r.descripcion || "";
  editCategoria.value = r.categoria || "";
  editImagenURL.value = r.imagenURL || "";

  // El contenido protegido vive en su propia subcolección
  const protegidoSnap = await getDoc(doc(db, "recursos", id, "contenidoProtegido", "data"));
  editContenido.value = protegidoSnap.exists() ? (protegidoSnap.data().contenido || "") : "";

  msgEditar.style.display = "none";
  modalEditar.classList.remove("hidden");
  iniciarAyudaImagen();
}

document.getElementById("btnCancelarEdicion").addEventListener("click", () => {
  modalEditar.classList.add("hidden");
});

document.getElementById("btnGuardarEdicion").addEventListener("click", async () => {
  const id = editId.value;
  const titulo = editTitulo.value.trim();
  const contenido = editContenido.value.trim();

  if (!titulo) { mostrarMsg("El título no puede estar vacío.", "error"); return; }
  if (!contenido) { mostrarMsg("El contenido no puede estar vacío.", "error"); return; }

  try {
    // Documento público: SIEMPRE se mantiene esGratis=true y precio=0
    // (las reglas de Firestore lo exigen para que un usuario normal pueda editar)
    await updateDoc(doc(db, "recursos", id), {
      titulo,
      descripcion: editDescripcion.value.trim(),
      categoria: editCategoria.value.trim() || "General",
      imagenURL: editImagenURL.value.trim(),
      esGratis: true,
      precio: 0
    });

    await setDoc(doc(db, "recursos", id, "contenidoProtegido", "data"), {
      contenido,
      imagenContenidoURL: ""
    });

    modalEditar.classList.add("hidden");
    cargarMisRecursos();
  } catch (err) {
    mostrarMsg("Error al guardar: " + err.message, "error");
  }
});

function mostrarMsg(texto, tipo) {
  msgEditar.textContent = texto;
  msgEditar.className = "msg " + tipo;
}

async function borrarRecurso(id) {
  const r = misRecursos.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`¿Borrar "${r.titulo}" permanentemente?`)) return;

  try {
    await deleteDoc(doc(db, "recursos", id));
    cargarMisRecursos();
  } catch (err) {
    alert("Error al borrar: " + err.message);
  }
}

