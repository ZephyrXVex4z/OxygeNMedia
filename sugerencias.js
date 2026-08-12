// sugerencias.js
// Caja de sugerencias tipo foro: cualquier usuario aprobado puede enviar y leer

import { db } from "./firebase-config.js";
import { observarSesion } from "./auth.js";
import {
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;

const textoSugerencia = document.getElementById("textoSugerencia");
const checkAnonimo = document.getElementById("checkAnonimo");
const btnEnviarSugerencia = document.getElementById("btnEnviarSugerencia");
const listaSugerencias = document.getElementById("listaSugerencias");
const emptySugerencias = document.getElementById("emptySugerencias");

observarSesion((user, perfil) => {
  if (!user || !perfil || perfil.aprobado !== true) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver esta sección. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  escucharSugerencias();
});

btnEnviarSugerencia.addEventListener("click", async () => {
  const texto = textoSugerencia.value.trim();
  if (!texto) return;

  const esAnonimo = checkAnonimo.checked;

  btnEnviarSugerencia.disabled = true;
  try {
    await addDoc(collection(db, "sugerencias"), {
      texto: texto,
      autorId: esAnonimo ? null : usuarioActual.uid,
      autorNombre: esAnonimo ? "Anónimo" : usuarioActual.nombre,
      fecha: serverTimestamp(),
      estado: "pendiente"
    });
    textoSugerencia.value = "";
    checkAnonimo.checked = false;
  } catch (err) {
    alert("Error al enviar: " + err.message);
  }
  btnEnviarSugerencia.disabled = false;
});

function escucharSugerencias() {
  const q = query(collection(db, "sugerencias"), orderBy("fecha", "desc"));

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      listaSugerencias.innerHTML = "";
      emptySugerencias.classList.remove("hidden");
      return;
    }
    emptySugerencias.classList.add("hidden");

    listaSugerencias.innerHTML = "";
    snap.forEach(docSnap => {
      const s = docSnap.data();
      const fecha = s.fecha ? s.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

      const item = document.createElement("div");
      item.className = "sugerencia-item";
      item.innerHTML = `
        <div class="sugerencia-meta">
          <span>${escapeHtml(s.autorNombre)} · ${fecha}</span>
          <span class="badge-estado ${s.estado === "revisada" ? "revisada" : ""}">${s.estado === "revisada" ? "Revisada" : "Pendiente"}</span>
        </div>
        <div class="sugerencia-texto">${escapeHtml(s.texto)}</div>
      `;
      listaSugerencias.appendChild(item);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

