// juegos.js
// Sistema de juegos HTML: subida con aprobación condicional, sandbox seguro para jugar

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import {
  collection, addDoc, getDocs, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const LIMITE_BYTES = 900 * 1024; // 900 KB, deja margen bajo el límite de 1MB de Firestore

let usuarioActual = null;
let archivoLeido = null; // { nombre, contenido }
let todosLosJuegos = [];

const inputNombreJuego = document.getElementById("inputNombreJuego");
const inputDescripcionJuego = document.getElementById("inputDescripcionJuego");
const fileDropZone = document.getElementById("fileDropZone");
const fileDropText = document.getElementById("fileDropText");
const fileNameDisplay = document.getElementById("fileNameDisplay");
const inputArchivo = document.getElementById("inputArchivo");
const btnSubirJuego = document.getElementById("btnSubirJuego");
const msgSubida = document.getElementById("msgSubida");
const gridJuegos = document.getElementById("gridJuegos");
const emptyJuegos = document.getElementById("emptyJuegos");

const listaView = document.getElementById("listaView");
const jugarView = document.getElementById("jugarView");
const jugarTitulo = document.getElementById("jugarTitulo");
const gameFrame = document.getElementById("gameFrame");
const btnVolverLista = document.getElementById("btnVolverLista");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver los juegos. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  cargarJuegos();
});

// ============ SELECCIÓN DE ARCHIVO ============

fileDropZone.addEventListener("click", () => inputArchivo.click());

inputArchivo.addEventListener("change", () => {
  const file = inputArchivo.files[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".html")) {
    mostrarMsg("Solo se aceptan archivos .html", "error");
    inputArchivo.value = "";
    return;
  }
  if (file.size > LIMITE_BYTES) {
    mostrarMsg(`El archivo pesa demasiado (${Math.round(file.size/1024)} KB). Máximo 900 KB.`, "error");
    inputArchivo.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    archivoLeido = { nombre: file.name, contenido: reader.result };
    fileDropText.textContent = "Click para cambiar el archivo";
    fileNameDisplay.textContent = "✓ " + file.name + " (" + Math.round(file.size/1024) + " KB)";
    fileNameDisplay.classList.remove("hidden");
  };
  reader.readAsText(file);
});

// ============ SUBIR JUEGO ============

btnSubirJuego.addEventListener("click", async () => {
  const nombre = inputNombreJuego.value.trim();
  const descripcion = inputDescripcionJuego.value.trim();

  if (!nombre) { mostrarMsg("Ponle un nombre al juego.", "error"); return; }
  if (!archivoLeido) { mostrarMsg("Selecciona un archivo .html primero.", "error"); return; }

  const esAdmin = usuarioActual.rol === "admin";

  btnSubirJuego.disabled = true;
  try {
    await addDoc(collection(db, "juegos"), {
      nombre: nombre,
      descripcion: descripcion,
      html: archivoLeido.contenido,
      subidoPor: usuarioActual.uid,
      subidoPorNombre: usuarioActual.nombre,
      aprobado: esAdmin, // admin: se publica directo. usuario normal: queda pendiente
      fecha: serverTimestamp()
    });

    mostrarMsg(
      esAdmin ? "Juego publicado." : "Juego enviado. Un admin debe aprobarlo antes de que sea público.",
      "ok"
    );

    inputNombreJuego.value = "";
    inputDescripcionJuego.value = "";
    inputArchivo.value = "";
    archivoLeido = null;
    fileDropText.textContent = "Click para elegir tu archivo .html";
    fileNameDisplay.classList.add("hidden");

    cargarJuegos();
  } catch (err) {
    mostrarMsg("Error al subir: " + err.message, "error");
  }
  btnSubirJuego.disabled = false;
});

function mostrarMsg(texto, tipo) {
  msgSubida.textContent = texto;
  msgSubida.className = "msg " + tipo;
  setTimeout(() => { msgSubida.className = "msg"; }, 4000);
}

// ============ LISTAR JUEGOS ============

async function cargarJuegos() {
  // Trae juegos aprobados (visibles para todos) + los propios del usuario (aunque estén pendientes)
  const snapAprobados = await getDocs(query(collection(db, "juegos"), where("aprobado", "==", true)));
  const snapPropios = await getDocs(query(collection(db, "juegos"), where("subidoPor", "==", usuarioActual.uid)));

  const mapa = new Map();
  snapAprobados.forEach(d => mapa.set(d.id, { id: d.id, ...d.data() }));
  snapPropios.forEach(d => mapa.set(d.id, { id: d.id, ...d.data() }));

  todosLosJuegos = [...mapa.values()].sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));
  renderJuegos();
}

function renderJuegos() {
  gridJuegos.innerHTML = "";
  emptyJuegos.classList.toggle("hidden", todosLosJuegos.length > 0);

  todosLosJuegos.forEach(j => {
    const esPendienteMio = !j.aprobado && j.subidoPor === usuarioActual.uid;
    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <h3>${j.nombre}${esPendienteMio ? '<span class="badge-pendiente">Pendiente</span>' : ""}</h3>
      <p>${j.descripcion || "Sin descripción"}</p>
      <div class="game-meta">Por ${j.subidoPorNombre}</div>
    `;
    card.addEventListener("click", () => jugar(j));
    gridJuegos.appendChild(card);
  });
}

// ============ JUGAR (sandbox) ============

function jugar(juego) {
  jugarTitulo.textContent = juego.nombre;
  // srcdoc renderiza el HTML dentro del sandbox sin necesitar hosting del archivo
  gameFrame.srcdoc = juego.html;
  listaView.classList.add("hidden");
  jugarView.classList.remove("hidden");
}

btnVolverLista.addEventListener("click", () => {
  gameFrame.srcdoc = "";
  jugarView.classList.add("hidden");
  listaView.classList.remove("hidden");
});
