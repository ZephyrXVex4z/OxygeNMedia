// solicitudes.js
// Página dedicada de solicitudes de amistad (recibidas y enviadas).
// A propósito NO combina where+orderBy en la misma query para no depender
// de crear un índice compuesto en Firestore — ordenamos en JS tras recibir los datos.

import { db } from "./firebase-config.js";
import { observarSesion } from "./auth.js";
import { aceptarSolicitudAmistad, eliminarAmistad } from "./amistades.js";
import {
  collection, doc, getDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;

const listaRecibidas = document.getElementById("listaRecibidas");
const emptyRecibidas = document.getElementById("emptyRecibidas");
const countRecibidas = document.getElementById("countRecibidas");
const listaEnviadas = document.getElementById("listaEnviadas");
const emptyEnviadas = document.getElementById("emptyEnviadas");

observarSesion((user, perfil) => {
  if (!user || !perfil || perfil.aprobado !== true) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver esto. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  cargarSolicitudes();
});

async function cargarSolicitudes() {
  // Trae TODAS las amistades donde participo y estén pendientes (sin ordenar en la query)
  const snap = await getDocs(query(
    collection(db, "amistades"),
    where("usuarios", "array-contains", usuarioActual.uid),
    where("estado", "==", "pendiente")
  ));

  const recibidas = [];
  const enviadas = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const otroUid = data.usuarios.find(u => u !== usuarioActual.uid);
    const perfilSnap = await getDoc(doc(db, "usuarios", otroUid));
    if (!perfilSnap.exists()) continue;

    const item = {
      amistadId: docSnap.id,
      uid: otroUid,
      fecha: data.fecha,
      ...perfilSnap.data()
    };

    if (data.solicitadoPor === usuarioActual.uid) {
      enviadas.push(item);
    } else {
      recibidas.push(item);
    }
  }

  // Ordenamos en JS: más recientes primero
  const porFecha = (a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0);
  recibidas.sort(porFecha);
  enviadas.sort(porFecha);

  renderRecibidas(recibidas);
  renderEnviadas(enviadas);
}

function renderRecibidas(lista) {
  countRecibidas.classList.toggle("hidden", lista.length === 0);
  countRecibidas.textContent = lista.length;

  if (lista.length === 0) {
    listaRecibidas.innerHTML = "";
    emptyRecibidas.classList.remove("hidden");
    return;
  }
  emptyRecibidas.classList.add("hidden");

  listaRecibidas.innerHTML = lista.map(u => filaHTML(u, true)).join("");

  listaRecibidas.querySelectorAll("[data-aceptar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await aceptarSolicitudAmistad(btn.dataset.aceptar, usuarioActual.uid, usuarioActual.nombre, btn.dataset.uid, btn.dataset.nombre);
      cargarSolicitudes();
    });
  });
  listaRecibidas.querySelectorAll("[data-rechazar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await eliminarAmistad(btn.dataset.rechazar);
      cargarSolicitudes();
    });
  });
}

function renderEnviadas(lista) {
  if (lista.length === 0) {
    listaEnviadas.innerHTML = "";
    emptyEnviadas.classList.remove("hidden");
    return;
  }
  emptyEnviadas.classList.add("hidden");

  listaEnviadas.innerHTML = lista.map(u => filaHTML(u, false)).join("");

  listaEnviadas.querySelectorAll("[data-cancelar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await eliminarAmistad(btn.dataset.cancelar);
      cargarSolicitudes();
    });
  });
}

function filaHTML(u, esRecibida) {
  const inicial = (u.nombre || "?")[0].toUpperCase();
  const avatar = u.fotoURL
    ? `<img class="solicitud-avatar" src="${u.fotoURL}" onerror="this.outerHTML='<div class=&quot;solicitud-avatar&quot;>${inicial}</div>'">`
    : `<div class="solicitud-avatar">${inicial}</div>`;

  const acciones = esRecibida
    ? `<button data-aceptar="${u.amistadId}" data-uid="${u.uid}" data-nombre="${u.nombre}">Aceptar</button>
       <button class="secondary" data-rechazar="${u.amistadId}">Rechazar</button>`
    : `<button class="secondary" data-cancelar="${u.amistadId}">Cancelar</button>`;

  return `
    <div class="solicitud-item">
      ${avatar}
      <div class="solicitud-info">
        <div class="nombre">${u.nombre}</div>
        <div class="username">${u.username ? "@" + u.username : ""}</div>
      </div>
      <div class="solicitud-actions">${acciones}</div>
    </div>
  `;
}

