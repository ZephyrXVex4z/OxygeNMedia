// muro-app.js
// Lógica de la página muro.html

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { listarAmigos } from "./amistades.js";
import {
  crearPublicacion, obtenerFeed, borrarPublicacion,
  yaDioLike, alternarLike, obtenerComentarios, agregarComentario, borrarComentario
} from "./muro.js";
import { collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;
let modoFeed = "general"; // "general" | "amigos"
let uidsAmigos = null; // se calcula la primera vez que se pide el feed de amigos
let recursoCitadoActual = null; // { id, titulo, categoria } | null

const inputTexto = document.getElementById("inputTexto");
const btnToggleImagen = document.getElementById("btnToggleImagen");
const extraImagen = document.getElementById("extraImagen");
const inputImagenURL = document.getElementById("inputImagenURL");
const btnCitarRecurso = document.getElementById("btnCitarRecurso");
const citaPreview = document.getElementById("citaPreview");
const btnPublicar = document.getElementById("btnPublicar");
const listaFeed = document.getElementById("listaFeed");
const emptyFeed = document.getElementById("emptyFeed");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver el muro. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  cargarFeed();
});

// ============ COMPOSER ============

btnToggleImagen.addEventListener("click", () => {
  extraImagen.classList.toggle("hidden");
  if (!extraImagen.classList.contains("hidden")) inputImagenURL.focus();
});

btnCitarRecurso.addEventListener("click", async () => {
  const snap = await getDocs(query(collection(db, "recursos"), where("visible", "==", true), limit(30)));
  const recursos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (recursos.length === 0) {
    alert("No hay recursos disponibles para citar todavía.");
    return;
  }

  const opciones = recursos.map((r, i) => `${i + 1}. ${r.titulo}`).join("\n");
  const eleccion = prompt("¿Qué recurso quieres citar? Escribe el número:\n\n" + opciones);
  const idx = parseInt(eleccion, 10) - 1;
  if (isNaN(idx) || !recursos[idx]) return;

  const r = recursos[idx];
  recursoCitadoActual = { id: r.id, titulo: r.titulo, categoria: r.categoria || "General" };
  renderCitaPreview();
});

function renderCitaPreview() {
  if (!recursoCitadoActual) {
    citaPreview.innerHTML = "";
    return;
  }
  citaPreview.innerHTML = `
    <div class="cita-recurso-preview">
      <span>📎 Citando: <strong>${recursoCitadoActual.titulo}</strong></span>
      <span style="cursor:pointer; color:var(--danger);" id="quitarCita">✕</span>
    </div>
  `;
  document.getElementById("quitarCita").addEventListener("click", () => {
    recursoCitadoActual = null;
    renderCitaPreview();
  });
}

btnPublicar.addEventListener("click", async () => {
  const texto = inputTexto.value.trim();
  const imagenURL = inputImagenURL.value.trim();

  if (!texto && !imagenURL && !recursoCitadoActual) {
    alert("Escribe algo, agrega una imagen, o cita un recurso antes de publicar.");
    return;
  }

  btnPublicar.disabled = true;
  try {
    await crearPublicacion({
      autorId: usuarioActual.uid,
      autorNombre: usuarioActual.nombre,
      autorFotoURL: usuarioActual.fotoURL || "",
      texto,
      imagenURL,
      recursoCitado: recursoCitadoActual
    });

    inputTexto.value = "";
    inputImagenURL.value = "";
    extraImagen.classList.add("hidden");
    recursoCitadoActual = null;
    renderCitaPreview();

    cargarFeed();
  } catch (err) {
    alert("Error al publicar: " + err.message);
  }
  btnPublicar.disabled = false;
});

// ============ TABS DE FEED ============

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    modoFeed = btn.dataset.feed;
    cargarFeed();
  });
});

// ============ CARGAR Y RENDERIZAR FEED ============

async function cargarFeed() {
  listaFeed.innerHTML = "Cargando...";
  emptyFeed.classList.add("hidden");

  let soloDeUids = null;
  if (modoFeed === "amigos") {
    if (uidsAmigos === null) {
      const amigos = await listarAmigos(usuarioActual.uid);
      uidsAmigos = amigos.map(a => a.uid);
    }
    soloDeUids = [...uidsAmigos, usuarioActual.uid];
  }

  const publicaciones = await obtenerFeed({ cantidad: 30, soloDeUids });

  if (publicaciones.length === 0) {
    listaFeed.innerHTML = "";
    emptyFeed.classList.remove("hidden");
    return;
  }

  listaFeed.innerHTML = publicaciones.map(p => renderPost(p)).join("");
  conectarEventosFeed(publicaciones);
}

function renderPost(p) {
  const inicial = (p.autorNombre || "?")[0].toUpperCase();
  const fecha = p.fecha ? p.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const puedoBorrar = p.autorId === usuarioActual.uid || usuarioActual.rol === "admin";

  return `
    <div class="post" data-pub-id="${p.id}" data-autor-id="${p.autorId}">
      <div class="post-header">
        ${p.autorFotoURL
          ? `<img class="post-avatar" src="${p.autorFotoURL}" onerror="this.outerHTML='<div class=&quot;post-avatar&quot;>${inicial}</div>'">`
          : `<div class="post-avatar">${inicial}</div>`}
        <div style="flex:1;">
          <div class="nombre">${p.autorNombre}</div>
          <div class="fecha">${fecha}</div>
        </div>
        ${puedoBorrar ? `<button class="icon-only secondary" data-borrar-post="${p.id}">🗑️</button>` : ""}
      </div>

      ${p.texto ? `<div class="post-texto">${escapeHtml(p.texto)}</div>` : ""}
      ${p.imagenURL ? `<img class="post-imagen" src="${p.imagenURL}" onerror="this.style.display='none'">` : ""}
      ${p.recursoCitado ? `
        <a class="cita-recurso" href="index.html">
          📎 <strong>${p.recursoCitado.titulo}</strong> — ${p.recursoCitado.categoria}
        </a>
      ` : ""}

      <div class="post-actions">
        <button class="post-action" data-like-btn="${p.id}">🤍 <span data-like-count="${p.id}">${p.likesCount || 0}</span></button>
        <button class="post-action" data-toggle-comentarios="${p.id}">💬 ${p.comentariosCount || 0}</button>
      </div>

      <div class="comentarios-box" id="comentarios-${p.id}">
        <div id="listaComentarios-${p.id}"></div>
        <div class="comentario-input-row">
          <input type="text" placeholder="Escribe un comentario..." data-input-comentario="${p.id}">
          <button data-enviar-comentario="${p.id}">Enviar</button>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function conectarEventosFeed(publicaciones) {
  // Likes: revisamos en paralelo si el usuario ya dio like a cada post visible
  publicaciones.forEach(async (p) => {
    const yaLike = await yaDioLike(p.id, usuarioActual.uid);
    const btn = listaFeed.querySelector(`[data-like-btn="${p.id}"]`);
    if (btn && yaLike) {
      btn.classList.add("liked");
      btn.innerHTML = `❤️ <span data-like-count="${p.id}">${p.likesCount || 0}</span>`;
    }
  });

  listaFeed.querySelectorAll("[data-like-btn]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pubId = btn.dataset.likeBtn;
      const p = publicaciones.find(x => x.id === pubId);
      btn.disabled = true;
      try {
        const seAgrego = await alternarLike(pubId, usuarioActual.uid, p.autorId, p.autorNombre, usuarioActual.nombre);
        const countSpan = btn.querySelector("[data-like-count]");
        const countActual = parseInt(countSpan.textContent, 10) || 0;
        const nuevoCount = seAgrego ? countActual + 1 : Math.max(0, countActual - 1);
        btn.classList.toggle("liked", seAgrego);
        btn.innerHTML = `${seAgrego ? "❤️" : "🤍"} <span data-like-count="${pubId}">${nuevoCount}</span>`;
      } catch (err) {
        alert("Error: " + err.message);
      }
      btn.disabled = false;
    });
  });

  listaFeed.querySelectorAll("[data-toggle-comentarios]").forEach(btn => {
    btn.addEventListener("click", () => abrirComentarios(btn.dataset.toggleComentarios));
  });

  listaFeed.querySelectorAll("[data-borrar-post]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta publicación?")) return;
      await borrarPublicacion(btn.dataset.borrarPost);
      cargarFeed();
    });
  });
}

async function abrirComentarios(pubId) {
  const box = document.getElementById("comentarios-" + pubId);
  const yaAbierto = box.classList.contains("open");
  box.classList.toggle("open");
  if (yaAbierto) return;

  await refrescarListaComentarios(pubId);

  const input = document.querySelector(`[data-input-comentario="${pubId}"]`);
  const btnEnviar = document.querySelector(`[data-enviar-comentario="${pubId}"]`);

  const enviar = async () => {
    const texto = input.value.trim();
    if (!texto) return;

    const postDiv = document.querySelector(`[data-pub-id="${pubId}"]`);
    const autorId = postDiv?.dataset.autorId || null;

    input.disabled = true;
    try {
      await agregarComentario(pubId, usuarioActual.uid, usuarioActual.nombre, texto, autorId, usuarioActual.nombre);
      input.value = "";
      await refrescarListaComentarios(pubId);
      const contadorBtn = document.querySelector(`[data-toggle-comentarios="${pubId}"]`);
      if (contadorBtn) {
        const actual = parseInt(contadorBtn.textContent.replace(/\D/g, ""), 10) || 0;
        contadorBtn.innerHTML = `💬 ${actual + 1}`;
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
    input.disabled = false;
  };

  btnEnviar.addEventListener("click", enviar);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });
}

async function refrescarListaComentarios(pubId) {
  const lista = document.getElementById("listaComentarios-" + pubId);
  lista.innerHTML = "Cargando...";

  const comentarios = await obtenerComentarios(pubId);
  lista.innerHTML = comentarios.length === 0
    ? "<div style='color:var(--text-dim); font-size:12px;'>Sé el primero en comentar.</div>"
    : comentarios.map(c => `
        <div class="comentario-item">
          <span><span class="nombre">${c.autorNombre}:</span>${escapeHtml(c.texto)}</span>
          ${(c.autorId === usuarioActual.uid || usuarioActual.rol === "admin")
            ? `<span style="cursor:pointer; color:var(--text-dim); font-size:11px; margin-left:auto;" data-borrar-comentario="${c.id}" data-pub-id="${pubId}">✕</span>`
            : ""}
        </div>
      `).join("");

  lista.querySelectorAll("[data-borrar-comentario]").forEach(el => {
    el.addEventListener("click", async () => {
      await borrarComentario(el.dataset.pubId, el.dataset.borrarComentario);
      await refrescarListaComentarios(pubId);
      const contadorBtn = document.querySelector(`[data-toggle-comentarios="${pubId}"]`);
      if (contadorBtn) {
        const actual = parseInt(contadorBtn.textContent.replace(/\D/g, ""), 10) || 0;
        contadorBtn.innerHTML = `💬 ${Math.max(0, actual - 1)}`;
      }
    });
  });
    }

