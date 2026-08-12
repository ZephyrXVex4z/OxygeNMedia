// app.js
// Carga y muestra los recursos disponibles para el estudiante que inició sesión

import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let todosLosRecursos = [];
let perfilActual = null;

const grid = document.getElementById("resourceGrid");
const emptyState = document.getElementById("emptyState");
const filtroCategoria = document.getElementById("filtroCategoria");
const filtroTipo = document.getElementById("filtroTipo");

export async function cargarRecursos(perfil) {
  perfilActual = perfil;

  const q = query(
    collection(db, "recursos"),
    where("visible", "==", true),
    orderBy("fechaSubida", "desc")
  );

  const snap = await getDocs(q);
  todosLosRecursos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  poblarFiltroCategorias();
  render();
}

function poblarFiltroCategorias() {
  const categorias = [...new Set(todosLosRecursos.map(r => r.categoria).filter(Boolean))];
  filtroCategoria.innerHTML = '<option value="">Todas las categorías</option>' +
    categorias.map(c => `<option value="${c}">${c}</option>`).join("");
}

function render() {
  const catSeleccionada = filtroCategoria.value;
  const tipoSeleccionado = filtroTipo.value;

  let lista = todosLosRecursos.filter(r => {
    if (catSeleccionada && r.categoria !== catSeleccionada) return false;
    if (tipoSeleccionado === "gratis" && !r.esGratis) return false;
    if (tipoSeleccionado === "pago" && r.esGratis) return false;
    return true;
  });

  grid.innerHTML = "";
  emptyState.classList.toggle("hidden", lista.length > 0);

  lista.forEach(r => {
    const yaComprado = (perfilActual.recursosComprados || []).includes(r.id);
    const card = document.createElement("div");
    card.className = "resource-card";

    let contenidoBoton = "";
    if (r.esGratis || yaComprado) {
      contenidoBoton = `<button onclick="verDetalle('${r.id}')">Ver contenido</button>`;
    } else {
      contenidoBoton = `<button class="secondary" disabled>💵 $${r.precio} MXN — pagar en la escuela</button>`;
    }

    card.innerHTML = `
      ${r.imagenURL ? `<img src="${r.imagenURL}" alt="${r.titulo}" style="width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:10px;" onerror="this.style.display='none'">` : ""}
      <div>
        <span class="badge categoria">${r.categoria || "General"}</span>
        <span class="badge ${r.esGratis ? "gratis" : "pago"}">${r.esGratis ? "Gratis" : "$" + r.precio + " MXN"}</span>
      </div>
      <h3>${r.titulo}</h3>
      <p>${r.descripcion || ""}</p>
      ${contenidoBoton}
    `;
    grid.appendChild(card);
  });
}

// Muestra el contenido completo de un recurso (una vez que es accesible)
window.verDetalle = function(id) {
  const r = todosLosRecursos.find(x => x.id === id);
  if (!r) return;

  let modal = document.getElementById("detalleModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "detalleModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px;";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#1a2233;border:1px solid #2a3550;border-radius:14px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;">
      ${r.imagenURL ? `<img src="${r.imagenURL}" style="width:100%;border-radius:10px;margin-bottom:14px;" onerror="this.style.display='none'">` : ""}
      <h2 style="margin-top:0;">${r.titulo}</h2>
      <p style="white-space:pre-wrap;color:#e8ecf5;">${r.contenido || "Este recurso aún no tiene contenido cargado."}</p>
      <button onclick="document.getElementById('detalleModal').remove()" style="margin-top:10px;">Cerrar</button>
    </div>
  `;
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

filtroCategoria.addEventListener("change", render);
filtroTipo.addEventListener("change", render);
