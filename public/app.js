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
  alert(r.titulo + "\n\n" + (r.contenido || "Este recurso aún no tiene contenido cargado."));
};

filtroCategoria.addEventListener("change", render);
filtroTipo.addEventListener("change", render);
