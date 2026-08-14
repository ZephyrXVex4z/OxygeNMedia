// amigos.js
// Lista de amigos del usuario, con accesos directos a perfil y chat.

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { listarAmigos, eliminarAmistad } from "./amistades.js";
import {
  collection, addDoc, getDocs, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;

const listaAmigos = document.getElementById("listaAmigos");
const emptyAmigos = document.getElementById("emptyAmigos");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver tus amigos. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  cargarAmigos();
});

async function cargarAmigos() {
  const amigos = await listarAmigos(usuarioActual.uid);

  if (amigos.length === 0) {
    listaAmigos.innerHTML = "";
    emptyAmigos.classList.remove("hidden");
    return;
  }
  emptyAmigos.classList.add("hidden");

  listaAmigos.innerHTML = "";
  amigos.forEach(amigo => {
    const inicial = (amigo.nombre || "?")[0].toUpperCase();
    const row = document.createElement("div");
    row.className = "friend-item";
    row.innerHTML = `
      ${amigo.fotoURL
        ? `<img class="friend-avatar" src="${amigo.fotoURL}" onerror="this.outerHTML='<div class=&quot;friend-avatar&quot;>${inicial}</div>'">`
        : `<div class="friend-avatar">${inicial}</div>`}
      <div class="friend-info">
        <div class="nombre">${amigo.nombre}</div>
        <div class="username">${amigo.username ? "@" + amigo.username : ""}</div>
      </div>
      <div class="friend-actions">
        <button class="secondary" data-ver-perfil="${amigo.uid}">Perfil</button>
        <button data-chatear="${amigo.uid}" data-nombre="${amigo.nombre}">💬</button>
        <button class="secondary" data-quitar="${amigo.amistadId}" data-nombre-quitar="${amigo.nombre}">✕</button>
      </div>
    `;
    listaAmigos.appendChild(row);
  });

  listaAmigos.querySelectorAll("[data-ver-perfil]").forEach(btn => {
    btn.addEventListener("click", () => {
      location.href = "ver-perfil.html?uid=" + btn.dataset.verPerfil;
    });
  });

  listaAmigos.querySelectorAll("[data-chatear]").forEach(btn => {
    btn.addEventListener("click", () => iniciarChat(btn.dataset.chatear, btn.dataset.nombre));
  });

  listaAmigos.querySelectorAll("[data-quitar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Quitar a " + btn.dataset.nombreQuitar + " de tus amigos?")) return;
      await eliminarAmistad(btn.dataset.quitar);
      cargarAmigos();
    });
  });
}

// Mismo patrón que en ver-perfil.js: busca o crea un chat privado y navega a él
async function iniciarChat(otroUid, otroNombre) {
  const q = query(
    collection(db, "chats"),
    where("tipo", "==", "privado"),
    where("miembros", "array-contains", usuarioActual.uid)
  );
  const snap = await getDocs(q);
  let existente = null;
  snap.forEach(docSnap => {
    const c = docSnap.data();
    if (c.miembros.includes(otroUid)) existente = docSnap.id;
  });

  if (existente) {
    location.href = "chat.html?abrir=" + existente;
    return;
  }

  const nuevoChat = {
    tipo: "privado",
    miembros: [usuarioActual.uid, otroUid],
    nombresUsuarios: { [usuarioActual.uid]: usuarioActual.nombre, [otroUid]: otroNombre },
    creadoPor: usuarioActual.uid,
    fechaCreacion: serverTimestamp(),
    ultimoMensaje: "",
    ultimaActividad: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "chats"), nuevoChat);
  location.href = "chat.html?abrir=" + ref.id;
}
