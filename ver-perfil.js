// ver-perfil.js
// Buscar usuarios por @username y ver su perfil completo

import { db } from "./firebase-config.js";
import { observarSesion } from "./auth.js";
import {
  collection, doc, getDoc, addDoc, getDocs, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;
let perfilVisto = null; // { uid, nombre, username, ... } del perfil que se está mostrando

const buscadorCard = document.getElementById("buscadorCard");
const perfilCard = document.getElementById("perfilCard");
const buscarUsername = document.getElementById("buscarUsername");
const resultadosBusqueda = document.getElementById("resultadosBusqueda");

const verAvatarImg = document.getElementById("verAvatarImg");
const verAvatarInicial = document.getElementById("verAvatarInicial");
const verNombre = document.getElementById("verNombre");
const verUsername = document.getElementById("verUsername");
const verRoles = document.getElementById("verRoles");
const verDescripcion = document.getElementById("verDescripcion");
const btnChatearDesdeAqui = document.getElementById("btnChatearDesdeAqui");
const btnVolverBusqueda = document.getElementById("btnVolverBusqueda");

observarSesion((user, perfil) => {
  if (!user || !perfil || perfil.aprobado !== true) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver perfiles. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };

  // Si viene un ?uid=xxx en la URL, muestra directo ese perfil
  const params = new URLSearchParams(location.search);
  const uidParam = params.get("uid");
  if (uidParam) {
    mostrarPerfil(uidParam);
  }
});

// ============ BÚSQUEDA POR @USERNAME ============

let debounceBusqueda = null;
buscarUsername.addEventListener("input", () => {
  clearTimeout(debounceBusqueda);
  const texto = buscarUsername.value.trim().replace(/^@/, "").toLowerCase();
  if (texto.length < 2) {
    resultadosBusqueda.innerHTML = "";
    return;
  }
  debounceBusqueda = setTimeout(() => buscarPorUsername(texto), 300);
});

async function buscarPorUsername(texto) {
  const snap = await getDocs(query(collection(db, "usuarios"), where("aprobado", "==", true)));
  const resultados = [];
  snap.forEach(docSnap => {
    const u = docSnap.data();
    if (u.username && u.username.toLowerCase().includes(texto)) {
      resultados.push({ uid: docSnap.id, ...u });
    }
  });

  resultadosBusqueda.innerHTML = "";
  if (resultados.length === 0) {
    resultadosBusqueda.innerHTML = "<div class='empty'>No se encontraron usuarios con ese @.</div>";
    return;
  }

  resultados.forEach(u => {
    const row = document.createElement("div");
    row.className = "search-result";
    const inicial = (u.nombre || "?")[0].toUpperCase();
    row.innerHTML = `
      ${u.fotoURL
        ? `<img class="search-avatar" src="${u.fotoURL}" onerror="this.outerHTML='<div class=&quot;search-avatar&quot;>${inicial}</div>'">`
        : `<div class="search-avatar">${inicial}</div>`}
      <div class="search-info">
        <div class="nombre">${u.nombre}</div>
        <div class="username">@${u.username}</div>
      </div>
    `;
    row.addEventListener("click", () => mostrarPerfilDatos(u));
    resultadosBusqueda.appendChild(row);
  });
}

// ============ MOSTRAR PERFIL ============

async function mostrarPerfil(uid) {
  if (uid === usuarioActual.uid) {
    location.href = "perfil.html";
    return;
  }
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) {
    resultadosBusqueda.innerHTML = "<div class='empty'>Ese usuario no existe.</div>";
    return;
  }
  mostrarPerfilDatos({ uid, ...snap.data() });
}

function mostrarPerfilDatos(u) {
  perfilVisto = u;

  buscadorCard.classList.add("hidden");
  perfilCard.classList.remove("hidden");

  verNombre.textContent = u.nombre || "Sin nombre";
  verUsername.textContent = u.username ? "@" + u.username : "";

  if (u.fotoURL) {
    verAvatarImg.src = u.fotoURL;
    verAvatarImg.classList.remove("hidden");
    verAvatarInicial.classList.add("hidden");
    verAvatarImg.onerror = () => {
      verAvatarImg.classList.add("hidden");
      verAvatarInicial.classList.remove("hidden");
    };
  } else {
    verAvatarImg.classList.add("hidden");
    verAvatarInicial.classList.remove("hidden");
    verAvatarInicial.textContent = (u.nombre || "?")[0].toUpperCase();
  }

  const roles = u.rolesPerfil || [];
  verRoles.innerHTML = roles.length
    ? roles.map(r => `<span class="role-chip">${r}</span>`).join("")
    : "";

  if (u.descripcion) {
    verDescripcion.textContent = u.descripcion;
    verDescripcion.classList.remove("hidden");
  } else {
    verDescripcion.classList.add("hidden");
  }
}

btnVolverBusqueda.addEventListener("click", () => {
  perfilCard.classList.add("hidden");
  buscadorCard.classList.remove("hidden");
  perfilVisto = null;
});

// ============ CHATEAR DESDE EL PERFIL ============

btnChatearDesdeAqui.addEventListener("click", async () => {
  if (!perfilVisto) return;
  btnChatearDesdeAqui.disabled = true;

  try {
    // Busca si ya existe un chat privado entre ambos
    const q = query(
      collection(db, "chats"),
      where("tipo", "==", "privado"),
      where("miembros", "array-contains", usuarioActual.uid)
    );
    const snap = await getDocs(q);
    let existente = null;
    snap.forEach(docSnap => {
      const c = docSnap.data();
      if (c.miembros.includes(perfilVisto.uid)) existente = docSnap.id;
    });

    if (existente) {
      location.href = "chat.html?abrir=" + existente;
      return;
    }

    const nuevoChat = {
      tipo: "privado",
      miembros: [usuarioActual.uid, perfilVisto.uid],
      nombresUsuarios: { [usuarioActual.uid]: usuarioActual.nombre, [perfilVisto.uid]: perfilVisto.nombre },
      creadoPor: usuarioActual.uid,
      fechaCreacion: serverTimestamp(),
      ultimoMensaje: "",
      ultimaActividad: serverTimestamp()
    };
    const ref = await addDoc(collection(db, "chats"), nuevoChat);
    location.href = "chat.html?abrir=" + ref.id;
  } catch (err) {
    alert("Error al iniciar chat: " + err.message);
    btnChatearDesdeAqui.disabled = false;
  }
});

