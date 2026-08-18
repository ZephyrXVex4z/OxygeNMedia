// novedades.js
// Página pública del registro de actualizaciones.

import { observarSesion, cuentaBloqueada } from "./auth.js";
import { listarActualizaciones } from "./actualizaciones.js";

const listaActualizaciones = document.getElementById("listaActualizaciones");
const emptyActualizaciones = document.getElementById("emptyActualizaciones");

const ETIQUETAS = {
  nueva_funcion: "✨ Nueva función",
  mejora: "⚙️ Mejora",
  arreglo: "🛠️ Arreglo"
};

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver esto. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  cargarActualizaciones();
});

async function cargarActualizaciones() {
  const lista = await listarActualizaciones();

  if (lista.length === 0) {
    listaActualizaciones.innerHTML = "";
    emptyActualizaciones.classList.remove("hidden");
    return;
  }
  emptyActualizaciones.classList.add("hidden");

  listaActualizaciones.innerHTML = lista.map(a => {
    const fecha = a.fecha ? a.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "";
    return `
      <div class="update-item">
        <div class="update-header">
          <span class="update-tag ${a.tipo}">${ETIQUETAS[a.tipo] || a.tipo}</span>
          ${a.version ? `<span class="update-version">${a.version}</span>` : ""}
          <span class="update-fecha">${fecha}</span>
        </div>
        <div class="update-titulo">${escapeHtml(a.titulo)}</div>
        ${a.descripcion ? `<div class="update-desc">${escapeHtml(a.descripcion)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

