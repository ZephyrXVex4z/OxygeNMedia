// chat.js
// Sistema de chat privado y grupal en tiempo real

import { db } from "./firebase-config.js";
import { observarSesion } from "./auth.js";
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, onSnapshot,
  arrayUnion, arrayRemove, limit
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;   // { uid, ...perfil }
let chatActivoId = null;
let chatActivoData = null;
let unsubscribeMensajes = null;
let unsubscribeChatList = null;

const chatList = document.getElementById("chatList");
const noChatSelected = document.getElementById("noChatSelected");
const activeChatArea = document.getElementById("activeChatArea");
const chatTitulo = document.getElementById("chatTitulo");
const messagesDiv = document.getElementById("messages");
const inputMensaje = document.getElementById("inputMensaje");
const btnEnviar = document.getElementById("btnEnviar");
const btnGestionarMiembros = document.getElementById("btnGestionarMiembros");

// ============ SESIÓN ============

observarSesion((user, perfil) => {
  if (!user || !perfil || perfil.aprobado !== true) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para usar el chat. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  escucharListaChats();
});

// ============ LISTA DE CHATS (tiempo real) ============

function escucharListaChats() {
  const params = new URLSearchParams(location.search);
  const chatIdParaAbrir = params.get("abrir");
  let yaAutoAbrio = false;

  const q = query(
    collection(db, "chats"),
    where("miembros", "array-contains", usuarioActual.uid),
    orderBy("ultimaActividad", "desc")
  );

  unsubscribeChatList = onSnapshot(q, (snap) => {
    if (snap.empty) {
      chatList.innerHTML = "<div class='empty-sidebar'>No tienes conversaciones todavía. Inicia un chat privado o crea un grupo.</div>";
      return;
    }

    chatList.innerHTML = "";
    snap.forEach(docSnap => {
      const c = docSnap.data();
      const item = document.createElement("div");
      item.className = "chat-item" + (docSnap.id === chatActivoId ? " active" : "");

      let nombreMostrar = c.nombre;
      if (c.tipo === "privado") {
        // Muestra el nombre del OTRO usuario, no el mío
        const otroUid = c.miembros.find(m => m !== usuarioActual.uid);
        nombreMostrar = c.nombresUsuarios?.[otroUid] || "Chat privado";
      }

      item.innerHTML = `
        <span class="nombre">${c.tipo === "grupo" ? "👥 " : ""}${nombreMostrar}</span>
        <span class="preview">${c.ultimoMensaje || "Sin mensajes todavía"}</span>
      `;
      item.addEventListener("click", () => abrirChat(docSnap.id, c, nombreMostrar));
      chatList.appendChild(item);
    });

    // Si venimos de "Enviar mensaje" desde un perfil, abre ese chat automáticamente (una sola vez)
    if (chatIdParaAbrir && !yaAutoAbrio) {
      const encontrado = snap.docs.find(d => d.id === chatIdParaAbrir);
      if (encontrado) {
        yaAutoAbrio = true;
        const c = encontrado.data();
        let nombreMostrar = c.nombre;
        if (c.tipo === "privado") {
          const otroUid = c.miembros.find(m => m !== usuarioActual.uid);
          nombreMostrar = c.nombresUsuarios?.[otroUid] || "Chat privado";
        }
        abrirChat(encontrado.id, c, nombreMostrar);
      }
    }
  });
}

// ============ ABRIR UN CHAT ============

function abrirChat(chatId, chatData, nombreMostrar) {
  chatActivoId = chatId;
  chatActivoData = chatData;

  noChatSelected.classList.add("hidden");
  activeChatArea.classList.remove("hidden");
  activeChatArea.style.display = "flex";

  chatTitulo.textContent = (chatData.tipo === "grupo" ? "👥 " : "") + nombreMostrar;

  const puedeGestionar = chatData.tipo === "grupo" &&
    (chatData.creadoPor === usuarioActual.uid || usuarioActual.rol === "admin");
  btnGestionarMiembros.classList.toggle("hidden", !puedeGestionar);

  // Resaltar en la lista
  document.querySelectorAll(".chat-item").forEach(el => el.classList.remove("active"));

  if (unsubscribeMensajes) unsubscribeMensajes();

  const mq = query(
    collection(db, "chats", chatId, "mensajes"),
    orderBy("fecha", "asc"),
    limit(200)
  );

  unsubscribeMensajes = onSnapshot(mq, (snap) => {
    messagesDiv.innerHTML = "";
    snap.forEach(docSnap => {
      const m = docSnap.data();
      const esMio = m.autorId === usuarioActual.uid;
      const bubble = document.createElement("div");
      bubble.className = "msg-bubble " + (esMio ? "mine" : "theirs");
      bubble.innerHTML = `
        ${!esMio && chatData.tipo === "grupo" ? `<span class="autor">${m.autorNombre}</span>` : ""}
        ${escapeHtml(m.texto)}
      `;
      messagesDiv.appendChild(bubble);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============ ENVIAR MENSAJE ============

async function enviarMensaje() {
  const texto = inputMensaje.value.trim();
  if (!texto || !chatActivoId) return;

  inputMensaje.value = "";

  await addDoc(collection(db, "chats", chatActivoId, "mensajes"), {
    autorId: usuarioActual.uid,
    autorNombre: usuarioActual.nombre,
    texto: texto,
    fecha: serverTimestamp()
  });

  await updateDoc(doc(db, "chats", chatActivoId), {
    ultimoMensaje: (chatActivoData.tipo === "grupo" ? usuarioActual.nombre + ": " : "") + texto,
    ultimaActividad: serverTimestamp()
  });
}

btnEnviar.addEventListener("click", enviarMensaje);
inputMensaje.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensaje();
});

// ============ BUSCAR USUARIOS APROBADOS ============

async function buscarUsuarios(texto) {
  if (!texto || texto.trim().length < 2) return [];
  const snap = await getDocs(query(collection(db, "usuarios"), where("aprobado", "==", true)));
  const textoLower = texto.trim().toLowerCase();
  const resultados = [];
  snap.forEach(docSnap => {
    if (docSnap.id === usuarioActual.uid) return;
    const u = docSnap.data();
    if (u.nombre && u.nombre.toLowerCase().includes(textoLower)) {
      resultados.push({ uid: docSnap.id, ...u });
    }
  });
  return resultados;
}

// ============ MODAL: NUEVO CHAT PRIVADO ============

const modalNuevoChat = document.getElementById("modalNuevoChat");
const buscarUsuarioPrivado = document.getElementById("buscarUsuarioPrivado");
const resultadosPrivado = document.getElementById("resultadosPrivado");

document.getElementById("btnNuevoChat").addEventListener("click", () => {
  buscarUsuarioPrivado.value = "";
  resultadosPrivado.innerHTML = "";
  modalNuevoChat.classList.remove("hidden");
});

let debouncePrivado = null;
buscarUsuarioPrivado.addEventListener("input", () => {
  clearTimeout(debouncePrivado);
  debouncePrivado = setTimeout(async () => {
    const resultados = await buscarUsuarios(buscarUsuarioPrivado.value);
    resultadosPrivado.innerHTML = "";
    resultados.forEach(u => {
      const row = document.createElement("div");
      row.className = "search-result";
      row.innerHTML = `<span>${u.nombre}</span><button data-start-chat="${u.uid}" data-nombre="${u.nombre}">Chatear</button>`;
      resultadosPrivado.appendChild(row);
    });
    resultadosPrivado.querySelectorAll("[data-start-chat]").forEach(btn => {
      btn.addEventListener("click", () => iniciarChatPrivado(btn.dataset.startChat, btn.dataset.nombre));
    });
  }, 300);
});

async function iniciarChatPrivado(otroUid, otroNombre) {
  // Revisa si ya existe un chat privado entre estos dos usuarios
  const q = query(
    collection(db, "chats"),
    where("tipo", "==", "privado"),
    where("miembros", "array-contains", usuarioActual.uid)
  );
  const snap = await getDocs(q);
  let existente = null;
  snap.forEach(docSnap => {
    const c = docSnap.data();
    if (c.miembros.includes(otroUid)) existente = { id: docSnap.id, data: c };
  });

  modalNuevoChat.classList.add("hidden");

  if (existente) {
    abrirChat(existente.id, existente.data, otroNombre);
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
  abrirChat(ref.id, nuevoChat, otroNombre);
}

// ============ MODAL: NUEVO GRUPO ============

const modalNuevoGrupo = document.getElementById("modalNuevoGrupo");
const nombreGrupo = document.getElementById("nombreGrupo");
const buscarUsuarioGrupo = document.getElementById("buscarUsuarioGrupo");
const resultadosGrupo = document.getElementById("resultadosGrupo");
const seleccionadosGrupo = document.getElementById("seleccionadosGrupo");
let miembrosSeleccionados = {}; // uid -> nombre

document.getElementById("btnNuevoGrupo").addEventListener("click", () => {
  nombreGrupo.value = "";
  buscarUsuarioGrupo.value = "";
  resultadosGrupo.innerHTML = "";
  seleccionadosGrupo.innerHTML = "";
  miembrosSeleccionados = {};
  modalNuevoGrupo.classList.remove("hidden");
});

let debounceGrupo = null;
buscarUsuarioGrupo.addEventListener("input", () => {
  clearTimeout(debounceGrupo);
  debounceGrupo = setTimeout(async () => {
    const resultados = await buscarUsuarios(buscarUsuarioGrupo.value);
    resultadosGrupo.innerHTML = "";
    resultados.filter(u => !miembrosSeleccionados[u.uid]).forEach(u => {
      const row = document.createElement("div");
      row.className = "search-result";
      row.innerHTML = `<span>${u.nombre}</span><button data-add="${u.uid}" data-nombre="${u.nombre}">Agregar</button>`;
      resultadosGrupo.appendChild(row);
    });
    resultadosGrupo.querySelectorAll("[data-add]").forEach(btn => {
      btn.addEventListener("click", () => {
        miembrosSeleccionados[btn.dataset.add] = btn.dataset.nombre;
        renderSeleccionados();
        btn.closest(".search-result").remove();
      });
    });
  }, 300);
});

function renderSeleccionados() {
  seleccionadosGrupo.innerHTML = "";
  Object.entries(miembrosSeleccionados).forEach(([uid, nombre]) => {
    const chip = document.createElement("span");
    chip.className = "selected-chip";
    chip.innerHTML = `${nombre} <span data-remove="${uid}">✕</span>`;
    seleccionadosGrupo.appendChild(chip);
  });
  seleccionadosGrupo.querySelectorAll("[data-remove]").forEach(el => {
    el.addEventListener("click", () => {
      delete miembrosSeleccionados[el.dataset.remove];
      renderSeleccionados();
    });
  });
}

document.getElementById("btnCrearGrupo").addEventListener("click", async () => {
  const nombre = nombreGrupo.value.trim();
  if (!nombre) { alert("Ponle un nombre al grupo."); return; }
  const miembrosUids = Object.keys(miembrosSeleccionados);
  if (miembrosUids.length === 0) { alert("Agrega al menos una persona."); return; }

  const nuevoGrupo = {
    tipo: "grupo",
    nombre: nombre,
    miembros: [usuarioActual.uid, ...miembrosUids],
    creadoPor: usuarioActual.uid,
    fechaCreacion: serverTimestamp(),
    ultimoMensaje: "",
    ultimaActividad: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "chats"), nuevoGrupo);
  modalNuevoGrupo.classList.add("hidden");
  abrirChat(ref.id, nuevoGrupo, nombre);
});

// ============ MODAL: GESTIONAR MIEMBROS ============

const modalMiembros = document.getElementById("modalMiembros");
const listaMiembrosActuales = document.getElementById("listaMiembrosActuales");
const buscarUsuarioAgregar = document.getElementById("buscarUsuarioAgregar");
const resultadosAgregar = document.getElementById("resultadosAgregar");

btnGestionarMiembros.addEventListener("click", async () => {
  await renderMiembrosActuales();
  buscarUsuarioAgregar.value = "";
  resultadosAgregar.innerHTML = "";
  modalMiembros.classList.remove("hidden");
});

async function renderMiembrosActuales() {
  const chatSnap = await getDoc(doc(db, "chats", chatActivoId));
  const c = chatSnap.data();
  chatActivoData = c;

  listaMiembrosActuales.innerHTML = "<p style='font-size:12px;color:var(--text-dim);'>Miembros actuales:</p>";
  for (const uid of c.miembros) {
    const uSnap = await getDoc(doc(db, "usuarios", uid));
    const nombre = uSnap.exists() ? uSnap.data().nombre : "Usuario";
    const row = document.createElement("div");
    row.className = "search-result";
    row.innerHTML = `<span>${nombre}${uid === c.creadoPor ? " (creador)" : ""}</span>` +
      (uid !== c.creadoPor ? `<button class="secondary" data-remove-member="${uid}">Quitar</button>` : "");
    listaMiembrosActuales.appendChild(row);
  }

  listaMiembrosActuales.querySelectorAll("[data-remove-member]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "chats", chatActivoId), {
        miembros: arrayRemove(btn.dataset.removeMember)
      });
      renderMiembrosActuales();
    });
  });
}

let debounceAgregar = null;
buscarUsuarioAgregar.addEventListener("input", () => {
  clearTimeout(debounceAgregar);
  debounceAgregar = setTimeout(async () => {
    const resultados = await buscarUsuarios(buscarUsuarioAgregar.value);
    const yaEnGrupo = chatActivoData.miembros || [];
    resultadosAgregar.innerHTML = "";
    resultados.filter(u => !yaEnGrupo.includes(u.uid)).forEach(u => {
      const row = document.createElement("div");
      row.className = "search-result";
      row.innerHTML = `<span>${u.nombre}</span><button data-add-member="${u.uid}">Agregar</button>`;
      resultadosAgregar.appendChild(row);
    });
    resultadosAgregar.querySelectorAll("[data-add-member]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await updateDoc(doc(db, "chats", chatActivoId), {
          miembros: arrayUnion(btn.dataset.addMember)
        });
        await renderMiembrosActuales();
        resultadosAgregar.innerHTML = "";
        buscarUsuarioAgregar.value = "";
      });
    });
  }, 300);
});

// ============ CERRAR MODALES ============

document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById(btn.dataset.closeModal).classList.add("hidden");
  });
});
