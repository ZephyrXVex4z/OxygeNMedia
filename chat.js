// chat.js
// Sistema de chat privado y grupal en tiempo real

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { hayBloqueoEntre } from "./bloqueos.js";
import { crearReporte, TIPO_OBJETIVO, MOTIVOS_POR_TIPO } from "./reportes.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
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
  if (!user || cuentaBloqueada(perfil).bloqueada) {
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
  document.querySelector(".layout").classList.add("mostrando-chat");

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
      const puedoBorrar = esMio || usuarioActual.rol === "admin";
      const bubble = document.createElement("div");
      bubble.className = "msg-bubble " + (esMio ? "mine" : "theirs");
      bubble.dataset.mensajeId = docSnap.id;

      if (m.eliminado) {
        bubble.innerHTML = `
          ${!esMio && chatData.tipo === "grupo" ? `<span class="autor">${m.autorNombre}</span>` : ""}
          <em style="opacity:0.6;">Este mensaje fue eliminado</em>
        `;
        messagesDiv.appendChild(bubble);
        return;
      }

      // Guardamos texto y autor directamente en el dataset de la burbuja: si el usuario
      // reporta este mensaje, necesitamos capturar el texto EXACTO que se está mostrando
      // ahora mismo, sin depender de una consulta nueva a Firestore que podría llegar
      // tarde (el remitente pudo editarlo o borrarlo justo después).
      bubble.dataset.textoActual = m.texto;
      bubble.dataset.autorId = m.autorId;
      bubble.dataset.autorNombre = m.autorNombre || "";

      const menuBtn = `<span class="msg-menu-btn" data-abrir-menu="${docSnap.id}">⋮</span>`;

      bubble.innerHTML = `
        ${!esMio && chatData.tipo === "grupo" ? `<span class="autor">${m.autorNombre}</span>` : ""}
        <span class="msg-texto">${escapeHtml(m.texto)}</span>
        ${m.editado ? `<span class="msg-editado">(editado)</span>` : ""}
        ${menuBtn}
        <div class="msg-menu hidden" id="menu-${docSnap.id}">
          ${esMio ? `<button data-editar="${docSnap.id}">Editar</button>` : ""}
          ${puedoBorrar ? `<button data-borrar="${docSnap.id}" class="danger-text">Eliminar</button>` : ""}
          ${!esMio ? `<button data-reportar-mensaje="${docSnap.id}" class="danger-text">🚩 Reportar</button>` : ""}
        </div>
      `;
      messagesDiv.appendChild(bubble);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    conectarAccionesMensajes();
  });
}

function conectarAccionesMensajes() {
  messagesDiv.querySelectorAll("[data-abrir-menu]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = document.getElementById("menu-" + btn.dataset.abrirMenu);
      const yaAbierto = !menu.classList.contains("hidden");
      messagesDiv.querySelectorAll(".msg-menu").forEach(m => m.classList.add("hidden"));
      if (!yaAbierto) menu.classList.remove("hidden");
    });
  });

  messagesDiv.querySelectorAll("[data-editar]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      iniciarEdicionMensaje(btn.dataset.editar);
    });
  });

  messagesDiv.querySelectorAll("[data-borrar]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("¿Eliminar este mensaje?")) return;
      await updateDoc(doc(db, "chats", chatActivoId, "mensajes", btn.dataset.borrar), {
        eliminado: true,
        texto: ""
      });
    });
  });

  messagesDiv.querySelectorAll("[data-reportar-mensaje]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const bubble = btn.closest(".msg-bubble");
      abrirModalReporteMensaje({
        mensajeId: btn.dataset.reportarMensaje,
        chatId: chatActivoId,
        textoActual: bubble.dataset.textoActual,
        autorId: bubble.dataset.autorId,
        autorNombre: bubble.dataset.autorNombre
      });
    });
  });
}

document.addEventListener("click", () => {
  messagesDiv.querySelectorAll(".msg-menu").forEach(m => m.classList.add("hidden"));
});

function iniciarEdicionMensaje(mensajeId) {
  const bubble = messagesDiv.querySelector(`[data-mensaje-id="${mensajeId}"]`);
  if (!bubble) return;
  const textoActual = bubble.querySelector(".msg-texto").textContent;

  bubble.innerHTML = `
    <input type="text" class="msg-edit-input" value="${textoActual.replace(/"/g, "&quot;")}">
    <div class="msg-edit-actions">
      <button data-guardar-edicion="${mensajeId}">Guardar</button>
      <button class="secondary" data-cancelar-edicion>Cancelar</button>
    </div>
  `;

  const input = bubble.querySelector(".msg-edit-input");
  input.focus();
  input.select();

  const guardar = async () => {
    const nuevoTexto = input.value.trim();
    if (!nuevoTexto) return;
    await updateDoc(doc(db, "chats", chatActivoId, "mensajes", mensajeId), {
      texto: nuevoTexto,
      editado: true
    });
  };

  bubble.querySelector("[data-guardar-edicion]").addEventListener("click", guardar);
  bubble.querySelector("[data-cancelar-edicion]").addEventListener("click", () => {
    // El siguiente snapshot de onSnapshot va a re-renderizar el mensaje original de todas formas,
    // pero forzamos un refresco inmediato por si el listener tarda
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") guardar();
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

  // En chats privados, si cualquiera de los dos bloqueó al otro, no se puede enviar
  // (mismo criterio en ambos sentidos: ni el bloqueador ni el bloqueado pueden escribirse).
  if (chatActivoData.tipo === "privado") {
    const otroUid = chatActivoData.miembros.find(m => m !== usuarioActual.uid);
    if (otroUid && await hayBloqueoEntre(usuarioActual.uid, otroUid)) {
      alert("No puedes enviar mensajes en esta conversación.");
      return;
    }
  }

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

document.getElementById("btnVolverSidebar").addEventListener("click", () => {
  document.querySelector(".layout").classList.remove("mostrando-chat");
});
inputMensaje.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensaje();
});

// ============ BUSCAR USUARIOS APROBADOS ============

async function buscarUsuarios(texto) {
  if (!texto || texto.trim().length < 2) return [];
  const snap = await getDocs(query(collection(db, "usuarios"), where("aprobado", "==", true)));
  const textoLower = texto.trim().toLowerCase().replace(/^@/, "");
  const resultados = [];
  snap.forEach(docSnap => {
    if (docSnap.id === usuarioActual.uid) return;
    const u = docSnap.data();
    const coincideNombre = u.nombre && u.nombre.toLowerCase().includes(textoLower);
    const coincideUsername = u.username && u.username.toLowerCase().includes(textoLower);
    if (coincideNombre || coincideUsername) {
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
  if (await hayBloqueoEntre(usuarioActual.uid, otroUid)) {
    modalNuevoChat.classList.add("hidden");
    alert("No puedes iniciar un chat con este usuario.");
    return;
  }

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

// ============ REPORTAR MENSAJE DE CHAT (con respaldo a prueba de borrado) ============

function abrirModalReporteMensaje({ mensajeId, chatId, textoActual, autorId, autorNombre }) {
  let modal = document.getElementById("modalReporteMensaje");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalReporteMensaje";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;";
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.innerHTML = ""; });
  }

  const motivos = MOTIVOS_POR_TIPO.mensaje_chat;
  modal.innerHTML = `
    <div style="background:var(--card, #1a2233);border:1px solid var(--border, #2a3550);border-radius:var(--radius, 14px);padding:22px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;color:var(--text, #e8ecf5);">
      <h3 style="margin-top:0;">Reportar mensaje</h3>
      <p style="font-size:12px;color:var(--text-dim, #8b96b0);margin-top:-8px;">
        Vas a reportar un mensaje de <strong>${autorNombre || "este usuario"}</strong>. Se guarda una copia
        del mensaje junto con tu reporte, así que aunque lo edite o borre después, un administrador
        podrá seguir viéndolo tal como está ahora.
      </p>

      <div style="background:var(--input-bg, #10182a);border:1px solid var(--border, #2a3550);border-radius:var(--radius, 14px);padding:10px 12px;font-size:13px;margin-bottom:14px;white-space:pre-wrap;">${(textoActual || "").replace(/</g, "&lt;")}</div>

      <label style="font-size:13px;color:var(--text-dim, #8b96b0);display:block;margin-bottom:4px;">Motivo</label>
      <select id="selectMotivoReporteMensaje" style="width:100%;padding:10px 12px;border-radius:var(--radius,14px);border:1px solid var(--border,#2a3550);background:var(--input-bg,#10182a);color:inherit;font-size:14px;margin-bottom:12px;">
        <option value="">Selecciona un motivo...</option>
        ${motivos.map(m => `<option value="${m}">${m}</option>`).join("")}
      </select>

      <label style="font-size:13px;color:var(--text-dim, #8b96b0);display:block;margin-bottom:4px;">Proporcione más información (opcional)</label>
      <textarea id="inputInfoReporteMensaje" placeholder="Contexto adicional que quieras dar" style="width:100%;min-height:70px;padding:10px 12px;border-radius:var(--radius,14px);border:1px solid var(--border,#2a3550);background:var(--input-bg,#10182a);color:inherit;font-size:14px;font-family:inherit;resize:vertical;margin-bottom:14px;"></textarea>

      <div id="errorReporteMensaje" style="display:none;color:var(--danger,#e35d5d);font-size:12px;margin-bottom:10px;"></div>

      <div style="display:flex;gap:8px;">
        <button id="btnCancelarReporteMensaje" type="button" class="secondary" style="flex:1;">Cancelar</button>
        <button id="btnEnviarReporteMensaje" type="button" style="flex:1;">Enviar reporte</button>
      </div>
    </div>
  `;

  document.getElementById("btnCancelarReporteMensaje").addEventListener("click", () => { modal.innerHTML = ""; });
  document.getElementById("btnEnviarReporteMensaje").addEventListener("click", async () => {
    const select = document.getElementById("selectMotivoReporteMensaje");
    const info = document.getElementById("inputInfoReporteMensaje");
    const errorEl = document.getElementById("errorReporteMensaje");
    const btn = document.getElementById("btnEnviarReporteMensaje");

    if (!select.value) {
      errorEl.textContent = "Selecciona un motivo antes de enviar.";
      errorEl.style.display = "block";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Enviando...";
    try {
      await crearReporte({
        reportanteUid: usuarioActual.uid,
        reportanteNombre: usuarioActual.nombre,
        objetivoTipo: TIPO_OBJETIVO.MENSAJE_CHAT,
        objetivoId: mensajeId,
        objetivoExtraId: chatId,
        objetivoAutorUid: autorId,
        objetivoAutorNombre: autorNombre,
        motivo: select.value,
        infoAdicional: info.value.trim(),
        respaldoMensaje: textoActual || ""
      });
      modal.innerHTML = "";
      alert("Reporte enviado con una copia del mensaje. Gracias por ayudar a mantener segura la comunidad.");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Enviar reporte";
    }
  });
}
