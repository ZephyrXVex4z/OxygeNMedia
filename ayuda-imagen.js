// ayuda-imagen.js
// Componente reutilizable: un botón "¿No sabes cómo subir una imagen?" que abre un
// modal con 2-3 servicios gratuitos (sin registro) donde el usuario puede subir su
// imagen y conseguir el link directo, para luego pegarlo en el campo correspondiente
// (foto de perfil, imagen de post, imagen de recurso, etc.).
//
// Uso: en cualquier HTML que tenga un <input> de URL de imagen, agrega justo debajo
// un botón con la clase "btn-ayuda-imagen" y el atributo data-target apuntando al id
// del input donde se debe pegar el link. Luego, en el <script type="module">, importa
// e invoca iniciarAyudaImagen() una sola vez.
//
// Ejemplo en el HTML:
//   <input type="text" id="inputFotoURL" placeholder="https://...">
//   <button type="button" class="btn-ayuda-imagen" data-target="inputFotoURL">
//     ¿No sabes cómo subir una imagen? Toca aquí
//   </button>
//
// Ejemplo en el JS:
//   import { iniciarAyudaImagen } from "./ayuda-imagen.js";
//   iniciarAyudaImagen();

const SERVICIOS = [
  {
    nombre: "Postimages",
    url: "https://postimages.org/",
    descripcion: "El más simple. Sin cuenta, sin límite de imágenes."
  },
  {
    nombre: "ImgBB",
    url: "https://imgbb.com/",
    descripcion: "Muy popular y estable. Tampoco pide cuenta para subir."
  },
  {
    nombre: "Freeimage.host",
    url: "https://freeimage.host/",
    descripcion: "Buena alternativa si alguno de los otros dos falla."
  }
];

let modalEl = null;
let targetInputId = null;

function construirModal() {
  modalEl = document.createElement("div");
  modalEl.id = "modalAyudaImagen";
  modalEl.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;z-index:300;padding:16px;";
  document.body.appendChild(modalEl);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) cerrarModalAyudaImagen();
  });

  modalEl.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:22px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;color:var(--text);">
      <h3 style="margin-top:0;">¿Cómo subo mi imagen?</h3>
      <p style="font-size:13px;color:var(--text-dim);margin-top:-8px;">
        Elige uno de estos sitios gratuitos. No necesitas crear cuenta:
      </p>

      <ol style="font-size:13px;color:var(--text-dim);padding-left:18px;margin-bottom:16px;">
        <li>Toca uno de los sitios de abajo (se abre en otra pestaña)</li>
        <li>Sube tu imagen ahí (arrastrarla o "Seleccionar archivo")</li>
        <li>Copia el <strong>link directo</strong> que te den (a veces dice "Direct link" o "Enlace directo")</li>
        <li>Vuelve aquí y pega ese link en el campo</li>
      </ol>

      <div id="listaServiciosAyudaImagen"></div>

      <button type="button" id="btnCerrarAyudaImagen" class="secondary" style="width:100%;margin-top:16px;">Cerrar</button>
    </div>
  `;

  const lista = modalEl.querySelector("#listaServiciosAyudaImagen");
  lista.innerHTML = SERVICIOS.map(s => `
    <a href="${s.url}" target="_blank" rel="noopener noreferrer"
       style="display:block;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;text-decoration:none;color:var(--text);">
      <div style="font-weight:600;font-size:14px;">${s.nombre} ↗</div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">${s.descripcion}</div>
    </a>
  `).join("");

  modalEl.querySelector("#btnCerrarAyudaImagen").addEventListener("click", cerrarModalAyudaImagen);
}

function abrirModalAyudaImagen(inputId) {
  targetInputId = inputId;
  if (!modalEl) construirModal();
  modalEl.style.display = "flex";
}

function cerrarModalAyudaImagen() {
  if (modalEl) modalEl.style.display = "none";
  targetInputId = null;
}

// Engancha el modal a todos los botones .btn-ayuda-imagen presentes en la página.
// Se puede llamar más de una vez sin duplicar listeners (usa un data-attribute
// como candado, igual que se hizo para el bug de comentarios duplicados).
export function iniciarAyudaImagen() {
  document.querySelectorAll(".btn-ayuda-imagen").forEach(btn => {
    if (btn.dataset.ayudaImagenListo === "true") return;
    btn.dataset.ayudaImagenListo = "true";
    btn.addEventListener("click", () => abrirModalAyudaImagen(btn.dataset.target));
  });
}

