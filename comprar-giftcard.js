// comprar-giftcard.js
// Vitrina de tarjetas de regalo Ox2. Cada una abre WhatsApp con un mensaje
// prellenado para coordinar el pago directamente con un administrador.

import { observarSesion, cuentaBloqueada } from "./auth.js";

const NUMERO_WHATSAPP = "529844681306";

const DENOMINACIONES = [
  { usd: 5,  creditos: 200,  bono: 10,  imagen: "giftcard-5.png" },
  { usd: 10, creditos: 400,  bono: 20,  imagen: "giftcard-10.png" },
  { usd: 20, creditos: 800,  bono: 40,  imagen: "giftcard-20.png" },
  { usd: 50, creditos: 2000, bono: 100, imagen: "giftcard-50.png" }
];

const gridTarjetas = document.getElementById("gridTarjetas");

// La vitrina requiere sesión para saber a nombre de quién se coordina la compra,
// pero no bloquea la vista si aún no está aprobado -- alguien puede querer comprar
// una gift card como parte de solicitar acceso.
observarSesion((user, perfil) => {
  renderTarjetas(perfil?.nombre || null);
});

function renderTarjetas(nombreUsuario) {
  gridTarjetas.innerHTML = DENOMINACIONES.map(d => {
    const total = d.creditos + d.bono;
    const mensaje = construirMensaje(d, nombreUsuario);
    const linkWhatsapp = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensaje)}`;

    return `
      <div class="gc-card">
        <div class="gc-image-wrap">
          <img src="${d.imagen}" alt="Tarjeta de regalo $${d.usd} USD" onerror="this.classList.add('broken')">
          <div class="gc-fallback">
            <span style="font-size:28px;">🎁</span>
            <span>Imagen no disponible</span>
          </div>
        </div>
        <div class="gc-body">
          <div class="gc-price">$${d.usd} USD</div>
          <div class="gc-credits"><b>${d.creditos} Ox2</b> de crédito</div>
          <div class="gc-bonus">✦ +${d.bono} Ox2 de bono — recibes ${total} en total</div>
          <a href="${linkWhatsapp}" target="_blank" rel="noopener" class="gc-buy-btn">
            <button style="width:100%;">Comprar por WhatsApp</button>
          </a>
        </div>
      </div>
    `;
  }).join("");
}

function construirMensaje(d, nombreUsuario) {
  const saludo = nombreUsuario ? `Hola, soy ${nombreUsuario}.` : "Hola,";
  return `${saludo} Quisiera comprar una tarjeta de regalo Ox2 de $${d.usd} USD (${d.creditos} + ${d.bono} de bono = ${d.creditos + d.bono} Ox2).`;
}

