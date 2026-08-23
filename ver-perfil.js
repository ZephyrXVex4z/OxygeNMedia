// ver-perfil.js
// Buscar usuarios por @username y ver su perfil completo

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import {
  collection, doc, getDoc, addDoc, getDocs, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { obtenerEstadoAmistad, enviarSolicitudAmistad, aceptarSolicitudAmistad, eliminarAmistad, contarAmigos } from "./amistades.js";
import { insigniaVerificado } from "./verificados.js";
import { siguiendoA, seguirUsuario, dejarDeSeguir, listarSeguidores, listarSiguiendo } from "./seguidores.js";
import { crearReporte, TIPO_OBJETIVO, MOTIVOS_POR_TIPO } from "./reportes.js";
import { yoBloqueeA, bloquearUsuario, desbloquearUsuario } from "./bloqueos.js";

let usuarioActual = null;
let perfilVisto = null; // { uid, nombre, username, ... } del perfil que se está mostrando

const buscadorCard = document.getElementById("buscadorCard");
const perfilCard = document.getElementById("perfilCard");
const buscarUsername = document.getElementById("buscarUsername");
const resultadosBusqueda = document.getElementById("resultadosBusqueda");

const verAvatarImg = document.getElementById("verAvatarImg");
const verAvatarInicial = document.getElementById("verAvatarInicial");
const verNombre = document.getElementById("verNombre");
const verInsignias = document.getElementById("verInsignias");
const verUsername = document.getElementById("verUsername");
const verSeguidores = document.getElementById("verSeguidores");
const verRoles = document.getElementById("verRoles");
const verDescripcion = document.getElementById("verDescripcion");
const btnChatearDesdeAqui = document.getElementById("btnChatearDesdeAqui");
const btnAmistad = document.getElementById("btnAmistad");
const btnSeguir = document.getElementById("btnSeguir");
const btnReportarUsuario = document.getElementById("btnReportarUsuario");
const btnBloquearUsuario = document.getElementById("btnBloquearUsuario");
const btnVolverBusqueda = document.getElementById("btnVolverBusqueda");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
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
  // Nota: esto trae todos los usuarios aprobados y filtra en el navegador.
  // Funciona bien para decenas/cientos de usuarios (un salón o escuela).
  // Si el proyecto creciera mucho, convendría buscar con un campo indexado exacto.
  const snap = await getDocs(query(collection(db, "usuarios"), where("aprobado", "==", true)));
  const resultados = [];
  snap.forEach(docSnap => {
    const u = docSnap.data();
    const coincideUsername = u.username && u.username.toLowerCase().includes(texto);
    const coincideNombre = u.nombre && u.nombre.toLowerCase().includes(texto);
    if (coincideUsername || coincideNombre) {
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
  if (verInsignias) verInsignias.innerHTML = insigniaVerificado(u);
  verUsername.textContent = u.username ? "@" + u.username : "";
  if (verSeguidores) {
    actualizarTextoSeguidores(u);
    verSeguidores.onclick = () => abrirListaSeguidores(u);
  }

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

  actualizarBotonAmistad();
  actualizarBotonSeguir();
  actualizarBotonBloquear();
}

// ============ BLOQUEAR ============

async function actualizarBotonBloquear() {
  if (!btnBloquearUsuario) return;
  btnBloquearUsuario.disabled = true;
  btnBloquearUsuario.textContent = "Cargando...";

  const bloqueado = await yoBloqueeA(usuarioActual.uid, perfilVisto.uid);
  btnBloquearUsuario.textContent = bloqueado ? "🚫 Desbloquear usuario" : "🚫 Bloquear usuario";
  btnBloquearUsuario.disabled = false;
}

if (btnBloquearUsuario) {
  btnBloquearUsuario.addEventListener("click", async () => {
    if (!perfilVisto) return;
    const yaBloqueado = await yoBloqueeA(usuarioActual.uid, perfilVisto.uid);

    if (!yaBloqueado && !confirm(`¿Bloquear a ${perfilVisto.nombre}? No podrá escribirte por chat ni seguirte. No se le notificará.`)) return;

    btnBloquearUsuario.disabled = true;
    try {
      if (yaBloqueado) {
        await desbloquearUsuario(usuarioActual.uid, perfilVisto.uid);
      } else {
        await bloquearUsuario(usuarioActual.uid, perfilVisto.uid);
      }
      await actualizarBotonBloquear();
    } catch (err) {
      alert("Error: " + err.message);
      btnBloquearUsuario.disabled = false;
    }
  });
}

// ============ SEGUIDORES / SEGUIDOS: contador + lista (con privacidad) ============

async function actualizarTextoSeguidores(u) {
  const amigosCount = await contarAmigos(u.uid);
  verSeguidores.textContent = `${u.seguidoresCount || 0} seguidores · ${u.siguiendoCount || 0} seguidos · ${amigosCount} amigos`;
}

// Un perfil puede marcar "seguidoresPrivados" para que nadie más vea SU lista de
// seguidores/seguidos (el número sigue siendo público, solo se oculta el detalle de
// quiénes son). El dueño del perfil y los admins siempre pueden verla igual.
function puedeVerListaDe(u) {
  if (!u.seguidoresPrivados) return true;
  if (usuarioActual.uid === u.uid) return true;
  if (usuarioActual.rol === "admin") return true;
  return false;
}

async function abrirListaSeguidores(u) {
  if (!puedeVerListaDe(u)) {
    alert("Este usuario mantiene su lista de seguidores/seguidos en privado.");
    return;
  }

  let modal = document.getElementById("modalListaSeguidores");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalListaSeguidores";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;";
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.innerHTML = ""; });
  }

  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:22px;max-width:420px;width:100%;max-height:75vh;overflow-y:auto;">
      <h3 style="margin-top:0;">${u.nombre}</h3>
      <div style="display:flex; gap:8px; margin-bottom:14px;">
        <button id="tabListaSeguidores" style="flex:1;">Seguidores (${u.seguidoresCount || 0})</button>
        <button id="tabListaSiguiendo" class="secondary" style="flex:1;">Siguiendo (${u.siguiendoCount || 0})</button>
      </div>
      <div id="contenidoListaSeguidores">Cargando...</div>
    </div>
  `;

  const contenido = document.getElementById("contenidoListaSeguidores");
  const tabSeguidores = document.getElementById("tabListaSeguidores");
  const tabSiguiendo = document.getElementById("tabListaSiguiendo");

  async function pintarLista(uids) {
    if (uids.length === 0) {
      contenido.innerHTML = "<div class='empty'>Nadie por aquí todavía.</div>";
      return;
    }
    const perfiles = await Promise.all(uids.map(async (uid) => {
      const snap = await getDoc(doc(db, "usuarios", uid));
      return snap.exists() ? { uid, ...snap.data() } : null;
    }));
    contenido.innerHTML = perfiles.filter(Boolean).map(p => `
      <div class="search-result" data-ir-perfil="${p.uid}">
        <div class="search-info">
          <div class="nombre">${p.nombre}${insigniaVerificado(p)}</div>
          <div class="username">@${p.username || "—"}</div>
        </div>
      </div>
    `).join("");
    contenido.querySelectorAll("[data-ir-perfil]").forEach(el => {
      el.addEventListener("click", () => {
        modal.innerHTML = "";
        mostrarPerfil(el.dataset.irPerfil);
      });
    });
  }

  tabSeguidores.addEventListener("click", async () => {
    tabSeguidores.className = ""; tabSiguiendo.className = "secondary";
    contenido.innerHTML = "Cargando...";
    pintarLista(await listarSeguidores(u.uid));
  });
  tabSiguiendo.addEventListener("click", async () => {
    tabSiguiendo.className = ""; tabSeguidores.className = "secondary";
    contenido.innerHTML = "Cargando...";
    pintarLista(await listarSiguiendo(u.uid));
  });

  pintarLista(await listarSeguidores(u.uid));
}

async function actualizarBotonSeguir() {
  if (!btnSeguir) return;
  btnSeguir.disabled = true;
  btnSeguir.textContent = "Cargando...";

  const yaSigue = await siguiendoA(usuarioActual.uid, perfilVisto.uid);
  btnSeguir.textContent = yaSigue ? "✓ Siguiendo (dejar de seguir)" : "➕ Seguir";
  btnSeguir.disabled = false;
}

if (btnSeguir) {
  btnSeguir.addEventListener("click", async () => {
    if (!perfilVisto) return;
    btnSeguir.disabled = true;
    try {
      const yaSigue = await siguiendoA(usuarioActual.uid, perfilVisto.uid);
      if (yaSigue) {
        await dejarDeSeguir(usuarioActual.uid, perfilVisto.uid);
        perfilVisto.seguidoresCount = Math.max(0, (perfilVisto.seguidoresCount || 0) - 1);
      } else {
        await seguirUsuario(usuarioActual.uid, usuarioActual.nombre, perfilVisto.uid, perfilVisto.nombre);
        perfilVisto.seguidoresCount = (perfilVisto.seguidoresCount || 0) + 1;
      }
      if (verSeguidores) verSeguidores.textContent = `${perfilVisto.seguidoresCount || 0} seguidores · ${perfilVisto.siguiendoCount || 0} seguidos`;
      await actualizarBotonSeguir();
    } catch (err) {
      alert("Error: " + err.message);
      btnSeguir.disabled = false;
    }
  });
}

// ============ REPORTAR USUARIO ============

if (btnReportarUsuario) {
  btnReportarUsuario.addEventListener("click", () => {
    if (!perfilVisto) return;
    abrirModalReporteUsuario();
  });
}

function abrirModalReporteUsuario() {
  let modal = document.getElementById("modalReporteUsuario");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalReporteUsuario";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;";
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.innerHTML = ""; });
  }

  const motivos = MOTIVOS_POR_TIPO.usuario;
  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:22px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;">
      <h3 style="margin-top:0;">Reportar usuario</h3>
      <p style="font-size:12px;color:var(--text-dim);margin-top:-8px;">
        Vas a reportar a <strong>${perfilVisto.nombre}</strong>. Un administrador revisará tu reporte.
      </p>

      <label style="font-size:13px;color:var(--text-dim);display:block;margin-bottom:4px;">Motivo</label>
      <select id="selectMotivoReporteUsuario" style="width:100%;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px;margin-bottom:12px;">
        <option value="">Selecciona un motivo...</option>
        ${motivos.map(m => `<option value="${m}">${m}</option>`).join("")}
      </select>

      <label style="font-size:13px;color:var(--text-dim);display:block;margin-bottom:4px;">Proporcione más información (opcional)</label>
      <textarea id="inputInfoReporteUsuario" placeholder="Ej: El nombre indica una grosería" style="width:100%;min-height:70px;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px;resize:vertical;margin-bottom:14px;"></textarea>

      <div id="errorReporteUsuario" style="display:none;color:var(--danger);font-size:12px;margin-bottom:10px;"></div>

      <div style="display:flex;gap:8px;">
        <button id="btnCancelarReporteUsuario" type="button" class="secondary" style="flex:1;">Cancelar</button>
        <button id="btnEnviarReporteUsuario" type="button" style="flex:1;">Enviar reporte</button>
      </div>
    </div>
  `;

  document.getElementById("btnCancelarReporteUsuario").addEventListener("click", () => { modal.innerHTML = ""; });
  document.getElementById("btnEnviarReporteUsuario").addEventListener("click", async () => {
    const select = document.getElementById("selectMotivoReporteUsuario");
    const info = document.getElementById("inputInfoReporteUsuario");
    const errorEl = document.getElementById("errorReporteUsuario");
    const btn = document.getElementById("btnEnviarReporteUsuario");

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
        objetivoTipo: TIPO_OBJETIVO.USUARIO,
        objetivoId: perfilVisto.uid,
        objetivoAutorUid: perfilVisto.uid,
        objetivoAutorNombre: perfilVisto.nombre,
        motivo: select.value,
        infoAdicional: info.value.trim()
      });
      modal.innerHTML = "";
      alert("Reporte enviado. Gracias por ayudar a mantener segura la comunidad.");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Enviar reporte";
    }
  });
}

// ============ AMISTAD ============

let estadoAmistadActual = null; // null | { id, estado, solicitadoPor }

async function actualizarBotonAmistad() {
  btnAmistad.disabled = true;
  btnAmistad.textContent = "Cargando...";

  estadoAmistadActual = await obtenerEstadoAmistad(usuarioActual.uid, perfilVisto.uid);

  if (!estadoAmistadActual) {
    btnAmistad.textContent = "➕ Enviar solicitud de amistad";
    btnAmistad.disabled = false;
  } else if (estadoAmistadActual.estado === "pendiente") {
    if (estadoAmistadActual.solicitadoPor === usuarioActual.uid) {
      btnAmistad.textContent = "⏳ Solicitud enviada (cancelar)";
    } else {
      btnAmistad.textContent = "✅ Aceptar solicitud de amistad";
    }
    btnAmistad.disabled = false;
  } else if (estadoAmistadActual.estado === "aceptada") {
    btnAmistad.textContent = "👥 Ya son amigos (quitar)";
    btnAmistad.disabled = false;
  }
}

btnAmistad.addEventListener("click", async () => {
  if (!perfilVisto) return;
  btnAmistad.disabled = true;

  try {
    if (!estadoAmistadActual) {
      // Sin relación: enviar solicitud
      await enviarSolicitudAmistad(usuarioActual.uid, usuarioActual.nombre, perfilVisto.uid, perfilVisto.nombre);
    } else if (estadoAmistadActual.estado === "pendiente" && estadoAmistadActual.solicitadoPor === usuarioActual.uid) {
      // Yo la envié: cancelarla
      await eliminarAmistad(estadoAmistadActual.id);
    } else if (estadoAmistadActual.estado === "pendiente") {
      // El otro la envió: aceptarla
      await aceptarSolicitudAmistad(estadoAmistadActual.id, usuarioActual.uid, usuarioActual.nombre, perfilVisto.uid, perfilVisto.nombre);
    } else if (estadoAmistadActual.estado === "aceptada") {
      // Ya son amigos: quitar amistad (con confirmación)
      if (!confirm("¿Quitar a " + perfilVisto.nombre + " de tus amigos?")) {
        btnAmistad.disabled = false;
        return;
      }
      await eliminarAmistad(estadoAmistadActual.id);
    }
    await actualizarBotonAmistad();
  } catch (err) {
    alert("Error: " + err.message);
    btnAmistad.disabled = false;
  }
});

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
