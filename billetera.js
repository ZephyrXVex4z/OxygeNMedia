// billetera.js
// Página de billetera: saldo, transferencias, historial.

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { obtenerSaldo, transferirCredito, obtenerHistorial, canjearTarjetaRegalo } from "./wallet.js";
import { comprarVerificacionDorada, PRECIO_VERIFICACION_DORADA } from "./verificados.js";
import { CATALOGO_RECOMPENSAS, obtenerEstadoCupoMensual, canjearRecompensa } from "./recompensas.js";
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;
let destinatarioSeleccionado = null; // { uid, nombre }

const saldoActual = document.getElementById("saldoActual");
const textoVerificacionDorada = document.getElementById("textoVerificacionDorada");
const btnComprarVerificacion = document.getElementById("btnComprarVerificacion");
const msgVerificacion = document.getElementById("msgVerificacion");
const buscarDestinatario = document.getElementById("buscarDestinatario");
const resultadosBusqueda = document.getElementById("resultadosBusqueda");
const destinatarioSeleccionadoDiv = document.getElementById("destinatarioSeleccionado");
const inputMonto = document.getElementById("inputMonto");
const inputMotivo = document.getElementById("inputMotivo");
const btnTransferir = document.getElementById("btnTransferir");
const msgTransferir = document.getElementById("msgTransferir");
const listaHistorial = document.getElementById("listaHistorial");
const emptyHistorial = document.getElementById("emptyHistorial");
const inputCodigoTarjeta = document.getElementById("inputCodigoTarjeta");
const btnCanjear = document.getElementById("btnCanjear");
const msgCanjear = document.getElementById("msgCanjear");
const estadoCupoRecompensas = document.getElementById("estadoCupoRecompensas");
const gridRecompensas = document.getElementById("gridRecompensas");
const msgRecompensas = document.getElementById("msgRecompensas");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver tu billetera. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  refrescarSaldo();
  cargarHistorial();
  actualizarCardVerificacion(perfil);
  cargarTiendaRecompensas();
});

// ============ VERIFICACIÓN DORADA ============

function actualizarCardVerificacion(perfil) {
  if (perfil.verificadoDorado) {
    textoVerificacionDorada.textContent = "Ya tienes la verificación dorada. ¡Gracias por apoyar a la comunidad!";
    btnComprarVerificacion.classList.add("hidden");
  } else {
    textoVerificacionDorada.textContent = `Destaca tu perfil con la insignia dorada por $${PRECIO_VERIFICACION_DORADA} Ox2. También puedes solicitarla directamente a un administrador si prefieres pagar por otro medio.`;
    btnComprarVerificacion.classList.remove("hidden");
  }
}

btnComprarVerificacion.addEventListener("click", async () => {
  if (!confirm(`¿Comprar la verificación dorada por $${PRECIO_VERIFICACION_DORADA} Ox2? Se descontará de tu saldo.`)) return;

  btnComprarVerificacion.disabled = true;
  msgVerificacion.style.display = "none";
  try {
    await comprarVerificacionDorada(usuarioActual.uid, usuarioActual.nombre);
    usuarioActual.verificadoDorado = true;
    actualizarCardVerificacion(usuarioActual);
    msgVerificacion.textContent = "¡Felicidades! Ya tienes tu verificación dorada 🥇";
    msgVerificacion.className = "msg ok";
    msgVerificacion.style.display = "block";
    refrescarSaldo();
    cargarHistorial();
  } catch (err) {
    msgVerificacion.textContent = err.message;
    msgVerificacion.className = "msg error";
    msgVerificacion.style.display = "block";
  }
  btnComprarVerificacion.disabled = false;
});

async function refrescarSaldo() {
  const saldo = await obtenerSaldo(usuarioActual.uid);
  saldoActual.textContent = "$" + saldo;
}

// ============ BUSCAR DESTINATARIO ============

let debounceBusqueda = null;
buscarDestinatario.addEventListener("input", () => {
  clearTimeout(debounceBusqueda);
  const texto = buscarDestinatario.value.trim().replace(/^@/, "").toLowerCase();
  if (texto.length < 2) {
    resultadosBusqueda.innerHTML = "";
    return;
  }
  debounceBusqueda = setTimeout(() => buscarUsuarios(texto), 300);
});

async function buscarUsuarios(texto) {
  const snap = await getDocs(query(collection(db, "usuarios"), where("aprobado", "==", true)));
  const resultados = [];
  snap.forEach(docSnap => {
    if (docSnap.id === usuarioActual.uid) return;
    const u = docSnap.data();
    const coincideNombre = u.nombre && u.nombre.toLowerCase().includes(texto);
    const coincideUsername = u.username && u.username.toLowerCase().includes(texto);
    if (coincideNombre || coincideUsername) resultados.push({ uid: docSnap.id, ...u });
  });

  resultadosBusqueda.innerHTML = "";
  resultados.slice(0, 8).forEach(u => {
    const inicial = (u.nombre || "?")[0].toUpperCase();
    const row = document.createElement("div");
    row.className = "search-result";
    row.innerHTML = `
      ${u.fotoURL
        ? `<img class="search-avatar" src="${u.fotoURL}" onerror="this.outerHTML='<div class=&quot;search-avatar&quot;>${inicial}</div>'">`
        : `<div class="search-avatar">${inicial}</div>`}
      <span>${u.nombre} ${u.username ? "· @" + u.username : ""}</span>
    `;
    row.addEventListener("click", () => seleccionarDestinatario(u.uid, u.nombre));
    resultadosBusqueda.appendChild(row);
  });
}

function seleccionarDestinatario(uid, nombre) {
  destinatarioSeleccionado = { uid, nombre };
  buscarDestinatario.value = "";
  resultadosBusqueda.innerHTML = "";
  destinatarioSeleccionadoDiv.innerHTML = `
    <div class="selected-user">
      <span>Enviando a: <strong>${nombre}</strong></span>
      <span class="quitar" id="quitarDestinatario">✕</span>
    </div>
  `;
  document.getElementById("quitarDestinatario").addEventListener("click", () => {
    destinatarioSeleccionado = null;
    destinatarioSeleccionadoDiv.innerHTML = "";
  });
}

// ============ TRANSFERIR ============

btnTransferir.addEventListener("click", async () => {
  msgTransferir.className = "msg";
  msgTransferir.style.display = "none";

  if (!destinatarioSeleccionado) {
    mostrarMsg("Selecciona a quién le vas a transferir.", "error");
    return;
  }
  const monto = Number(inputMonto.value);
  if (!monto || monto <= 0) {
    mostrarMsg("Escribe un monto válido.", "error");
    return;
  }

  btnTransferir.disabled = true;
  try {
    await transferirCredito(
      usuarioActual.uid, usuarioActual.nombre,
      destinatarioSeleccionado.uid, destinatarioSeleccionado.nombre,
      monto, inputMotivo.value.trim()
    );
    mostrarMsg(`Transferiste $${monto} a ${destinatarioSeleccionado.nombre}.`, "ok");
    inputMonto.value = "";
    inputMotivo.value = "";
    destinatarioSeleccionado = null;
    destinatarioSeleccionadoDiv.innerHTML = "";
    refrescarSaldo();
    cargarHistorial();
  } catch (err) {
    mostrarMsg(err.message, "error");
  }
  btnTransferir.disabled = false;
});

function mostrarMsg(texto, tipo) {
  msgTransferir.textContent = texto;
  msgTransferir.className = "msg " + tipo;
}

// ============ CANJEAR TARJETA DE REGALO ============

inputCodigoTarjeta.addEventListener("input", () => {
  inputCodigoTarjeta.value = inputCodigoTarjeta.value.toUpperCase();
});

btnCanjear.addEventListener("click", async () => {
  const codigo = inputCodigoTarjeta.value.trim();
  msgCanjear.style.display = "none";

  if (!codigo) {
    mostrarMsgCanjear("Escribe el código de la tarjeta.", "error");
    return;
  }

  btnCanjear.disabled = true;
  try {
    const monto = await canjearTarjetaRegalo(codigo, usuarioActual.uid, usuarioActual.nombre);
    mostrarMsgCanjear(`¡Listo! Se agregaron $${monto} a tu saldo.`, "ok");
    inputCodigoTarjeta.value = "";
    refrescarSaldo();
    cargarHistorial();
  } catch (err) {
    mostrarMsgCanjear(err.message, "error");
  }
  btnCanjear.disabled = false;
});

function mostrarMsgCanjear(texto, tipo) {
  msgCanjear.textContent = texto;
  msgCanjear.className = "msg " + tipo;
  msgCanjear.style.display = "block";
}

// ============ HISTORIAL ============

async function cargarHistorial() {
  const historial = await obtenerHistorial(usuarioActual.uid);

  if (historial.length === 0) {
    listaHistorial.innerHTML = "";
    emptyHistorial.classList.remove("hidden");
    return;
  }
  emptyHistorial.classList.add("hidden");

  listaHistorial.innerHTML = historial.map(t => {
    const esRecibido = t.paraUid === usuarioActual.uid;
    const fecha = t.fecha ? t.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

    let texto = "";
    if (t.tipo === "transferencia") {
      texto = esRecibido ? `Recibido de ${t.deNombre}` : `Enviado a ${t.paraNombre}`;
    } else if (t.tipo === "admin_dar") {
      texto = "Crédito otorgado por un admin";
    } else if (t.tipo === "admin_quitar") {
      texto = "Crédito removido por un admin";
    } else if (t.tipo === "compra_recurso") {
      texto = t.motivo || "Compra de recurso";
    } else if (t.tipo === "canje_tarjeta") {
      texto = "🎁 " + (t.motivo || "Tarjeta de regalo canjeada");
    } else if (t.tipo === "compra_verificacion") {
      texto = "🥇 " + (t.motivo || "Compra de verificación dorada");
    }

    const esPositivo = esRecibido || t.tipo === "admin_dar" || t.tipo === "canje_tarjeta";
    return `
      <div class="historial-item">
        <div class="historial-desc">
          <div class="principal">${texto}${t.motivo && t.tipo === "transferencia" ? " — " + t.motivo : ""}</div>
          <div class="fecha">${fecha}</div>
        </div>
        <div class="historial-monto ${esPositivo ? "positivo" : "negativo"}">${esPositivo ? "+" : "-"}$${t.monto}</div>
      </div>
    `;
  }).join("");
}

// ============ TIENDA DE RECOMPENSAS (Ox2 gratis -> tarjetas de regalo reales) ============

async function cargarTiendaRecompensas() {
  const { restanteMxn, agotado } = await obtenerEstadoCupoMensual();

  estadoCupoRecompensas.textContent = agotado
    ? "😔 El cupo de recompensas de este mes ya se agotó. Vuelve el próximo mes."
    : `Quedan $${restanteMxn} MXN de cupo de recompensas este mes.`;

  gridRecompensas.innerHTML = CATALOGO_RECOMPENSAS.map(r => `
    <div style="border:1px solid var(--border); border-radius:var(--radius); padding:12px; text-align:center;">
      <div style="font-size:13px; font-weight:600; margin-bottom:4px;">${r.nombre}</div>
      <div style="font-size:12px; color:var(--success); margin-bottom:8px;">${r.costoOx2} Ox2</div>
      <button data-canjear-recompensa="${r.id}" ${agotado ? "disabled" : ""} style="width:100%; font-size:12px; padding:7px;">
        ${agotado ? "Sin cupo" : "Canjear"}
      </button>
    </div>
  `).join("");

  gridRecompensas.querySelectorAll("[data-canjear-recompensa]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.canjearRecompensa;
      const recompensa = CATALOGO_RECOMPENSAS.find(r => r.id === id);
      if (!confirm(`¿Canjear ${recompensa.costoOx2} Ox2 por "${recompensa.nombre}"? Un administrador te contactará para entregarte el código.`)) return;

      btn.disabled = true;
      msgRecompensas.style.display = "none";
      try {
        await canjearRecompensa(usuarioActual.uid, usuarioActual.nombre, id);
        msgRecompensas.textContent = "¡Listo! Tu canje quedó pendiente — un administrador te contactará pronto con tu código.";
        msgRecompensas.className = "msg ok";
        msgRecompensas.style.display = "block";
        refrescarSaldo();
        cargarHistorial();
        cargarTiendaRecompensas();
      } catch (err) {
        msgRecompensas.textContent = err.message;
        msgRecompensas.className = "msg error";
        msgRecompensas.style.display = "block";
        btn.disabled = false;
      }
    });
  });
}
