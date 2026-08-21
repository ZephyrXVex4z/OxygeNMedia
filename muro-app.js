// muro-app.js
// Lógica de la página muro.html

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { listarAmigos } from "./amistades.js";
import {
  crearPublicacion, editarPublicacion, obtenerFeed, borrarPublicacion,
  yaDioLike, alternarLike, listarQuienesDieronLike,
  obtenerComentarios, agregarComentario, borrarComentario,
  repostearPublicacion
} from "./muro.js";
import { insigniaVerificado } from "./verificados.js";
import { crearReporte, TIPO_OBJETIVO, MOTIVOS_POR_TIPO } from "./reportes.js";
import { collection, getDocs, query, where, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// Caché simple de perfiles de autores (uid -> {rol, verificadoDorado, verificadoAzul})
// para no pedir el documento completo del usuario cada vez que se pinta un post/comentario.
// Solo se guardan los campos que afectan la insignia.
const cacheInsignias = new Map();
async function obtenerInsigniaHTML(autorId) {
  if (cacheInsignias.has(autorId)) return cacheInsignias.get(autorId);
  try {
    const snap = await getDoc(doc(db, "usuarios", autorId));
    const html = snap.exists() ? insigniaVerificado(snap.data()) : "";
    cacheInsignias.set(autorId, html);
    return html;
  } catch {
    return "";
  }
}

let usuarioActual = null;
let modoFeed = "general"; // "general" | "amigos"
let uidsAmigos = null;
let recursoCitadoActual = null;
let editandoPubId = null; // si no es null, el composer está en modo "editar" esta publicación
let ultimoDocFeed = null;
let filtroHashtagActual = null;
let publicacionesEnMemoria = new Map(); // pubId -> datos, para acceder rápido (repost, editar, etc.)

const CLAVE_BORRADOR = "oxygenmedia_borrador_post";

const inputTexto = document.getElementById("inputTexto");
const btnToggleImagen = document.getElementById("btnToggleImagen");
const extraImagen = document.getElementById("extraImagen");
const inputImagenURL = document.getElementById("inputImagenURL");
const previewImagen = document.getElementById("previewImagen");
const btnCitarRecurso = document.getElementById("btnCitarRecurso");
const citaPreview = document.getElementById("citaPreview");
const btnPublicar = document.getElementById("btnPublicar");
const listaFeed = document.getElementById("listaFeed");
const emptyFeed = document.getElementById("emptyFeed");
const btnCargarMas = document.getElementById("btnCargarMas");

const modalCitarRecurso = document.getElementById("modalCitarRecurso");
const buscarRecursoCitar = document.getElementById("buscarRecursoCitar");
const resultadosCitarRecurso = document.getElementById("resultadosCitarRecurso");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver el muro. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  cargarBorrador();
  cargarFeed();

  const params = new URLSearchParams(location.search);
  const tagInicial = params.get("tag");
  if (tagInicial) aplicarFiltroHashtag(tagInicial);
});

// ============ BORRADOR AUTOMÁTICO ============

function cargarBorrador() {
  try {
    const guardado = localStorage.getItem(CLAVE_BORRADOR);
    if (guardado) inputTexto.value = guardado;
  } catch {}
}

let debounceBorrador = null;
inputTexto.addEventListener("input", () => {
  clearTimeout(debounceBorrador);
  debounceBorrador = setTimeout(() => {
    try {
      if (inputTexto.value.trim()) {
        localStorage.setItem(CLAVE_BORRADOR, inputTexto.value);
      } else {
        localStorage.removeItem(CLAVE_BORRADOR);
      }
    } catch {}
  }, 400);
});

function limpiarBorrador() {
  try { localStorage.removeItem(CLAVE_BORRADOR); } catch {}
}

// ============ COMPOSER: IMAGEN ============

btnToggleImagen.addEventListener("click", () => {
  extraImagen.classList.toggle("hidden");
  if (!extraImagen.classList.contains("hidden")) inputImagenURL.focus();
});

inputImagenURL.addEventListener("input", () => {
  const url = inputImagenURL.value.trim();
  if (url) {
    previewImagen.src = url;
    previewImagen.classList.remove("hidden");
    previewImagen.onerror = () => previewImagen.classList.add("hidden");
  } else {
    previewImagen.classList.add("hidden");
  }
});

// ============ COMPOSER: CITAR RECURSO (modal con buscador) ============

let todosLosRecursosParaCitar = null;

btnCitarRecurso.addEventListener("click", async () => {
  modalCitarRecurso.classList.remove("hidden");
  buscarRecursoCitar.value = "";
  resultadosCitarRecurso.innerHTML = "Cargando...";

  if (!todosLosRecursosParaCitar) {
    const snap = await getDocs(query(collection(db, "recursos"), where("visible", "==", true), limit(60)));
    todosLosRecursosParaCitar = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  renderResultadosCitar(todosLosRecursosParaCitar);
  buscarRecursoCitar.focus();
});

document.getElementById("btnCerrarModalCitar").addEventListener("click", () => {
  modalCitarRecurso.classList.add("hidden");
});

buscarRecursoCitar.addEventListener("input", () => {
  const texto = buscarRecursoCitar.value.trim().toLowerCase();
  const filtrados = !texto
    ? todosLosRecursosParaCitar
    : todosLosRecursosParaCitar.filter(r => (r.titulo || "").toLowerCase().includes(texto));
  renderResultadosCitar(filtrados);
});

function renderResultadosCitar(recursos) {
  if (!recursos || recursos.length === 0) {
    resultadosCitarRecurso.innerHTML = "<div style='color:var(--text-dim); font-size:13px; text-align:center; padding:20px;'>No se encontraron recursos.</div>";
    return;
  }
  resultadosCitarRecurso.innerHTML = recursos.slice(0, 20).map(r => `
    <div class="recurso-resultado" data-elegir-recurso="${r.id}">
      <div class="titulo">${r.titulo}</div>
      <div class="meta">${r.categoria || "General"} · ${r.esGratis ? "Gratis" : "$" + r.precio}</div>
    </div>
  `).join("");

  resultadosCitarRecurso.querySelectorAll("[data-elegir-recurso]").forEach(el => {
    el.addEventListener("click", () => {
      const r = recursos.find(x => x.id === el.dataset.elegirRecurso);
      recursoCitadoActual = { id: r.id, titulo: r.titulo, categoria: r.categoria || "General" };
      renderCitaPreview();
      modalCitarRecurso.classList.add("hidden");
    });
  });
}

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

// ============ PUBLICAR / EDITAR ============

btnPublicar.addEventListener("click", async () => {
  const texto = inputTexto.value.trim();
  const imagenURL = inputImagenURL.value.trim();

  if (!texto && !imagenURL && !recursoCitadoActual) {
    alert("Escribe algo, agrega una imagen, o cita un recurso antes de publicar.");
    return;
  }

  btnPublicar.disabled = true;
  try {
    if (editandoPubId) {
      await editarPublicacion(editandoPubId, { texto, imagenURL, recursoCitado: recursoCitadoActual });
      editandoPubId = null;
      btnPublicar.textContent = "Publicar";
    } else {
      await crearPublicacion({
        autorId: usuarioActual.uid,
        autorNombre: usuarioActual.nombre,
        autorFotoURL: usuarioActual.fotoURL || "",
        texto, imagenURL, recursoCitado: recursoCitadoActual
      });
    }

    inputTexto.value = "";
    inputImagenURL.value = "";
    extraImagen.classList.add("hidden");
    previewImagen.classList.add("hidden");
    recursoCitadoActual = null;
    renderCitaPreview();
    limpiarBorrador();

    resetearFeed();
    cargarFeed();
  } catch (err) {
    alert("Error al publicar: " + err.message);
  }
  btnPublicar.disabled = false;
});

function iniciarEdicion(pubId) {
  const p = publicacionesEnMemoria.get(pubId);
  if (!p) return;
  editandoPubId = pubId;
  inputTexto.value = p.texto || "";
  inputImagenURL.value = p.imagenURL || "";
  if (p.imagenURL) {
    extraImagen.classList.remove("hidden");
    previewImagen.src = p.imagenURL;
    previewImagen.classList.remove("hidden");
  }
  recursoCitadoActual = p.recursoCitado || null;
  renderCitaPreview();
  btnPublicar.textContent = "Guardar cambios";
  inputTexto.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============ TABS DE FEED ============

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    modoFeed = btn.dataset.feed;
    filtroHashtagActual = null;
    resetearFeed();
    cargarFeed();
  });
});

function aplicarFiltroHashtag(tag) {
  filtroHashtagActual = tag;
  resetearFeed();
  cargarFeed();
}

function resetearFeed() {
  ultimoDocFeed = null;
  publicacionesEnMemoria.clear();
}

// ============ CARGAR Y RENDERIZAR FEED ============

async function cargarFeed(esCargarMas = false) {
  if (!esCargarMas) {
    listaFeed.innerHTML = "Cargando...";
    emptyFeed.classList.add("hidden");
    btnCargarMas.classList.add("hidden");
  }

  let soloDeUids = null;
  if (modoFeed === "amigos") {
    if (uidsAmigos === null) {
      const amigos = await listarAmigos(usuarioActual.uid);
      uidsAmigos = amigos.map(a => a.uid);
    }
    soloDeUids = [...uidsAmigos, usuarioActual.uid];
  }

  const { publicaciones, ultimoDoc, hayMas } = await obtenerFeed({
    cantidad: 15,
    soloDeUids,
    cursorUltimoDoc: esCargarMas ? ultimoDocFeed : null,
    hashtag: filtroHashtagActual
  });

  ultimoDocFeed = ultimoDoc;
  publicaciones.forEach(p => publicacionesEnMemoria.set(p.id, p));

  if (!esCargarMas && publicaciones.length === 0) {
    listaFeed.innerHTML = "";
    emptyFeed.classList.remove("hidden");
    btnCargarMas.classList.add("hidden");
    return;
  }

  const html = publicaciones.map(p => renderPost(p)).join("");
  if (esCargarMas) {
    listaFeed.insertAdjacentHTML("beforeend", html);
  } else {
    listaFeed.innerHTML = html;
  }

  conectarEventosFeed(publicaciones);
  btnCargarMas.classList.toggle("hidden", !hayMas);
}

btnCargarMas.addEventListener("click", () => cargarFeed(true));

// ============ RENDER DE UN POST ============

function renderPost(p) {
  const inicial = (p.autorNombre || "?")[0].toUpperCase();
  const fecha = p.fecha ? p.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const puedoBorrar = p.autorId === usuarioActual.uid || usuarioActual.rol === "admin";
  const puedoEditar = p.autorId === usuarioActual.uid;

  const textoConEnlaces = linkificarTexto(p.texto || "");

  return `
    <div class="post" data-pub-id="${p.id}" data-autor-id="${p.autorId}">
      <div class="post-header">
        ${p.autorFotoURL
          ? `<img class="post-avatar" src="${p.autorFotoURL}" onerror="this.outerHTML='<div class=&quot;post-avatar&quot;>${inicial}</div>'">`
          : `<div class="post-avatar">${inicial}</div>`}
        <div style="flex:1;">
          <div class="nombre">${p.autorNombre}<span data-insignia-post="${p.id}"></span></div>
          <div class="fecha">${fecha}</div>
        </div>
        ${puedoEditar ? `<button class="icon-only secondary" data-editar-post="${p.id}">✎</button>` : ""}
        ${puedoBorrar ? `<button class="icon-only secondary" data-borrar-post="${p.id}">🗑️</button>` : ""}
        ${!puedoEditar ? `<button class="icon-only secondary" data-reportar-post="${p.id}" title="Reportar">🚩</button>` : ""}
      </div>

      ${p.texto ? `<div class="post-texto">${textoConEnlaces}</div>` : ""}
      ${p.imagenURL ? `<img class="post-imagen" src="${p.imagenURL}" onerror="this.style.display='none'">` : ""}
      ${p.recursoCitado ? `
        <a class="cita-recurso" href="index.html">
          📎 <strong>${p.recursoCitado.titulo}</strong> — ${p.recursoCitado.categoria}
        </a>
      ` : ""}
      ${p.repostDe ? `
        <div class="cita-recurso" style="flex-direction:column; align-items:flex-start; gap:4px;">
          <span style="color:var(--text-dim); font-size:11px;">🔁 Compartido de ${p.repostDe.autorNombre}</span>
          ${p.repostDe.texto ? `<span>${escapeHtml(p.repostDe.texto)}</span>` : ""}
          ${p.repostDe.imagenURL ? `<img src="${p.repostDe.imagenURL}" style="width:100%; border-radius:var(--radius); margin-top:4px;" onerror="this.style.display='none'">` : ""}
        </div>
      ` : ""}

      <div class="post-actions">
        <button class="post-action" data-like-btn="${p.id}">🤍 <span class="like-count-num" data-like-count="${p.id}">${p.likesCount || 0}</span></button>
        <button class="post-action" data-toggle-comentarios="${p.id}">💬 ${p.comentariosCount || 0}</button>
        <button class="post-action" data-repost-btn="${p.id}">🔁 Compartir</button>
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

// Convierte #hashtags en links clickeables que filtran el feed, sin tocar el resto del texto
function linkificarTexto(texto) {
  const escapado = escapeHtml(texto);
  return escapado.replace(/#([\wáéíóúñÁÉÍÓÚÑ]+)/g, (match, tag) =>
    `<span class="hashtag-link" data-hashtag="${tag.toLowerCase()}" style="color:var(--accent); cursor:pointer; font-weight:600;">#${tag}</span>`
  );
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============ EVENTOS DEL FEED ============

function conectarEventosFeed(publicaciones) {
  publicaciones.forEach(async (p) => {
    const yaLike = await yaDioLike(p.id, usuarioActual.uid);
    const btn = listaFeed.querySelector(`[data-like-btn="${p.id}"]`);
    if (btn && yaLike) {
      btn.classList.add("liked");
      btn.innerHTML = `❤️ <span class="like-count-num" data-like-count="${p.id}">${p.likesCount || 0}</span>`;
    }

    // Insignia del autor (admin/dorada/azul), se pinta aparte para no bloquear el render inicial del feed
    const insigniaEl = listaFeed.querySelector(`[data-insignia-post="${p.id}"]`);
    if (insigniaEl) insigniaEl.innerHTML = await obtenerInsigniaHTML(p.autorId);
  });

  listaFeed.querySelectorAll("[data-like-btn]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      if (e.target.classList.contains("like-count-num")) {
        e.stopPropagation();
        mostrarQuienesDieronLike(btn.dataset.likeBtn);
        return;
      }
      const pubId = btn.dataset.likeBtn;
      const p = publicacionesEnMemoria.get(pubId);
      btn.disabled = true;
      try {
        const seAgrego = await alternarLike(pubId, usuarioActual.uid, p.autorId, p.autorNombre, usuarioActual.nombre);
        const countActual = parseInt(btn.querySelector(".like-count-num").textContent, 10) || 0;
        const nuevoCount = seAgrego ? countActual + 1 : Math.max(0, countActual - 1);
        btn.classList.toggle("liked", seAgrego);
        btn.innerHTML = `${seAgrego ? "❤️" : "🤍"} <span class="like-count-num" data-like-count="${pubId}">${nuevoCount}</span>`;
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
      resetearFeed();
      cargarFeed();
    });
  });

  listaFeed.querySelectorAll("[data-editar-post]").forEach(btn => {
    btn.addEventListener("click", () => iniciarEdicion(btn.dataset.editarPost));
  });

  listaFeed.querySelectorAll("[data-repost-btn]").forEach(btn => {
    btn.addEventListener("click", () => hacerRepost(btn.dataset.repostBtn));
  });

  listaFeed.querySelectorAll(".hashtag-link").forEach(el => {
    el.addEventListener("click", () => aplicarFiltroHashtag(el.dataset.hashtag));
  });

  listaFeed.querySelectorAll("[data-reportar-post]").forEach(btn => {
    btn.addEventListener("click", () => {
      const pubId = btn.dataset.reportarPost;
      const p = publicacionesEnMemoria.get(pubId);
      if (!p) return;
      abrirModalReporte({
        objetivoTipo: TIPO_OBJETIVO.PUBLICACION,
        objetivoId: pubId,
        objetivoAutorUid: p.autorId,
        objetivoAutorNombre: p.autorNombre
      });
    });
  });
}

// ============ REPORTAR (publicación, comentario, o usuario) ============
// Modal genérico e inyectado en el DOM la primera vez que se usa, reutilizable
// tanto para publicaciones como para comentarios (ver-perfil.js también lo usa
// para reportar usuarios, importando esta misma función).

let modalReporteEl = null;
let reporteObjetivoActual = null;

export function abrirModalReporte(objetivo) {
  reporteObjetivoActual = objetivo;

  if (!modalReporteEl) {
    modalReporteEl = document.createElement("div");
    modalReporteEl.id = "modalReporteGlobal";
    modalReporteEl.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;";
    document.body.appendChild(modalReporteEl);
    modalReporteEl.addEventListener("click", (e) => {
      if (e.target === modalReporteEl) cerrarModalReporte();
    });
  }

  const motivos = MOTIVOS_POR_TIPO[objetivo.objetivoTipo] || MOTIVOS_POR_TIPO.publicacion;
  const etiquetaTipo = {
    usuario: "usuario",
    publicacion: "publicación",
    comentario: "comentario"
  }[objetivo.objetivoTipo];

  modalReporteEl.innerHTML = `
    <div style="background:var(--card, #1a2233);border:1px solid var(--border, #2a3550);border-radius:var(--radius, 14px);padding:22px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;font-family:inherit;color:var(--text, #e8ecf5);">
      <h3 style="margin-top:0;">Reportar ${etiquetaTipo}</h3>
      <p style="font-size:12px;color:var(--text-dim, #8b96b0);margin-top:-8px;">
        Vas a reportar a <strong>${objetivo.objetivoAutorNombre || "este usuario"}</strong>. Un administrador revisará tu reporte.
      </p>

      <label style="font-size:13px;color:var(--text-dim, #8b96b0);display:block;margin-bottom:4px;">Motivo</label>
      <select id="selectMotivoReporte" style="width:100%;padding:10px 12px;border-radius:var(--radius,14px);border:1px solid var(--border,#2a3550);background:var(--input-bg,#10182a);color:inherit;font-size:14px;margin-bottom:12px;">
        <option value="">Selecciona un motivo...</option>
        ${motivos.map(m => `<option value="${m}">${m}</option>`).join("")}
      </select>

      <label style="font-size:13px;color:var(--text-dim, #8b96b0);display:block;margin-bottom:4px;">Proporcione más información (opcional)</label>
      <textarea id="inputInfoReporte" placeholder="Ej: El nombre indica una grosería" style="width:100%;min-height:70px;padding:10px 12px;border-radius:var(--radius,14px);border:1px solid var(--border,#2a3550);background:var(--input-bg,#10182a);color:inherit;font-size:14px;font-family:inherit;resize:vertical;margin-bottom:14px;"></textarea>

      <div id="errorReporte" style="display:none;color:var(--danger,#e35d5d);font-size:12px;margin-bottom:10px;"></div>

      <div style="display:flex;gap:8px;">
        <button id="btnCancelarReporte" type="button" style="flex:1;background:transparent;border:1px solid var(--border,#2a3550);color:var(--text-dim,#8b96b0);">Cancelar</button>
        <button id="btnEnviarReporte" type="button" style="flex:1;">Enviar reporte</button>
      </div>
    </div>
  `;

  document.getElementById("btnCancelarReporte").addEventListener("click", cerrarModalReporte);
  document.getElementById("btnEnviarReporte").addEventListener("click", enviarReporteActual);
}

function cerrarModalReporte() {
  if (modalReporteEl) modalReporteEl.innerHTML = "";
  reporteObjetivoActual = null;
}

async function enviarReporteActual() {
  const select = document.getElementById("selectMotivoReporte");
  const info = document.getElementById("inputInfoReporte");
  const errorEl = document.getElementById("errorReporte");
  const btn = document.getElementById("btnEnviarReporte");

  const motivo = select.value;
  if (!motivo) {
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
      objetivoTipo: reporteObjetivoActual.objetivoTipo,
      objetivoId: reporteObjetivoActual.objetivoId,
      objetivoAutorUid: reporteObjetivoActual.objetivoAutorUid,
      objetivoAutorNombre: reporteObjetivoActual.objetivoAutorNombre,
      objetivoExtraId: reporteObjetivoActual.objetivoExtraId || null,
      motivo,
      infoAdicional: info.value.trim()
    });
    cerrarModalReporte();
    alert("Reporte enviado. Gracias por ayudar a mantener segura la comunidad.");
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Enviar reporte";
  }
}

async function mostrarQuienesDieronLike(pubId) {
  const nombres = await listarQuienesDieronLike(pubId);
  if (nombres.length === 0) {
    alert("Nadie le ha dado like todavía.");
    return;
  }
  alert("Le dio like:\n\n" + nombres.map(n => "• " + n.nombre).join("\n"));
}

async function hacerRepost(pubId) {
  const p = publicacionesEnMemoria.get(pubId);
  if (!p) return;

  const comentario = prompt("¿Quieres agregar un comentario al compartir? (opcional)", "");
  if (comentario === null) return;

  try {
    await repostearPublicacion(p, usuarioActual.uid, usuarioActual.nombre, usuarioActual.fotoURL || "", comentario.trim());
    alert("¡Publicación compartida en tu muro!");
    resetearFeed();
    cargarFeed();
  } catch (err) {
    alert("Error al compartir: " + err.message);
  }
}

// ============ COMENTARIOS ============

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
          <span><span class="nombre">${c.autorNombre}<span data-insignia-comentario="${c.id}"></span>:</span>${escapeHtml(c.texto)}</span>
          ${(c.autorId === usuarioActual.uid || usuarioActual.rol === "admin")
            ? `<span style="cursor:pointer; color:var(--text-dim); font-size:11px; margin-left:auto;" data-borrar-comentario="${c.id}" data-pub-id="${pubId}">✕</span>`
            : `<span style="cursor:pointer; color:var(--text-dim); font-size:11px; margin-left:auto;" data-reportar-comentario="${c.id}" data-pub-id="${pubId}" data-autor-id="${c.autorId}" data-autor-nombre="${escapeHtml(c.autorNombre || '')}" title="Reportar">🚩</span>`}
        </div>
      `).join("");

  comentarios.forEach(async (c) => {
    const el = lista.querySelector(`[data-insignia-comentario="${c.id}"]`);
    if (el) el.innerHTML = await obtenerInsigniaHTML(c.autorId);
  });

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

  lista.querySelectorAll("[data-reportar-comentario]").forEach(el => {
    el.addEventListener("click", () => {
      abrirModalReporte({
        objetivoTipo: TIPO_OBJETIVO.COMENTARIO,
        objetivoId: el.dataset.reportarComentario,
        objetivoExtraId: el.dataset.pubId,
        objetivoAutorUid: el.dataset.autorId,
        objetivoAutorNombre: el.dataset.autorNombre
      });
    });
  });
}
