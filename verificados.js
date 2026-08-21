// verificados.js
// Sistema de perfiles verificados: dos tipos independientes.
// - "azul": gratis, solo la otorga un admin (a criterio propio, ej. cuenta con relevancia/fama).
// - "dorada": de pago. Puede activarla el propio usuario pagando con su saldo Ox2
//   (comprarVerificacionDorada), o un admin puede otorgarla manualmente (ej. pago
//   recibido por WhatsApp, igual que se hace con el saldo — ver wallet.js/adminAjustarSaldo).
// Los dos tipos son independientes entre sí: un usuario puede tener una, la otra, ambas o ninguna.

import { db } from "./firebase-config.js";
import {
  doc, updateDoc, addDoc, collection, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { crearNotificacion } from "./notificaciones.js";
import { registrarLog } from "./logs.js";

// Precio en Ox2 de la verificación dorada al pagarla desde la billetera.
// Vive aquí (no en Firestore) para que sea fácil de ajustar editando un solo archivo,
// igual que se hace con las denominaciones de tarjetas de regalo en comprar-giftcard.js.
export const PRECIO_VERIFICACION_DORADA = 500;

// El usuario compra su propia verificación dorada con su saldo Ox2.
// Usa runTransaction para que el descuento de saldo y el otorgamiento de la insignia
// sean atómicos (o pasa todo, o no pasa nada) — mismo patrón que comprarRecursoConSaldo.
export async function comprarVerificacionDorada(uid, nombre) {
  const refUsuario = doc(db, "usuarios", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(refUsuario);
    if (!snap.exists()) throw new Error("Usuario no encontrado.");

    const data = snap.data();
    if (data.verificadoDorado === true) throw new Error("Ya tienes verificación dorada.");

    const saldoActual = data.saldo || 0;
    if (saldoActual < PRECIO_VERIFICACION_DORADA) {
      throw new Error(`No tienes saldo suficiente. Necesitas $${PRECIO_VERIFICACION_DORADA} Ox2.`);
    }

    tx.update(refUsuario, {
      saldo: saldoActual - PRECIO_VERIFICACION_DORADA,
      verificadoDorado: true,
      verificadoDoradoFecha: serverTimestamp(),
      verificadoDoradoOrigen: "compra"
    });
  });

  await addDoc(collection(db, "transacciones"), {
    tipo: "compra_verificacion",
    deUid: uid, deNombre: nombre,
    paraUid: null, paraNombre: "",
    monto: PRECIO_VERIFICACION_DORADA,
    motivo: "Compra de verificación dorada",
    adminUid: null,
    fecha: serverTimestamp()
  });
}

// El admin otorga o quita la verificación DORADA manualmente (ej. alguien pagó por
// WhatsApp/efectivo/cripto, igual que con el saldo). No cobra nada por su cuenta.
export async function adminOtorgarVerificacionDorada(adminUid, adminNombre, objetivoUid, objetivoNombre, otorgar) {
  await updateDoc(doc(db, "usuarios", objetivoUid), otorgar
    ? { verificadoDorado: true, verificadoDoradoFecha: serverTimestamp(), verificadoDoradoOrigen: "admin" }
    : { verificadoDorado: false, verificadoDoradoOrigen: null });

  await registrarLog({
    tipo: otorgar ? "verificacion_dorada_otorgada" : "verificacion_dorada_retirada",
    adminUid, adminNombre,
    objetivoUid, objetivoNombre,
    detalle: otorgar ? "Verificación dorada otorgada manualmente" : "Verificación dorada retirada"
  });

  await crearNotificacion({
    paraUid: objetivoUid,
    tipo: otorgar ? "verificacion_otorgada" : "verificacion_retirada",
    deUid: adminUid,
    deNombre: adminNombre,
    texto: otorgar
      ? "🥇 ¡Felicidades! Un administrador te dio la verificación dorada."
      : "Un administrador te retiró la verificación dorada.",
    dataExtra: { tipo: "dorada" }
  });
}

// El admin otorga o quita la verificación AZUL (siempre gratis, a su criterio —
// ej. cuenta con suficiente relevancia/actividad en la comunidad).
export async function adminOtorgarVerificacionAzul(adminUid, adminNombre, objetivoUid, objetivoNombre, otorgar) {
  await updateDoc(doc(db, "usuarios", objetivoUid), otorgar
    ? { verificadoAzul: true, verificadoAzulFecha: serverTimestamp() }
    : { verificadoAzul: false });

  await registrarLog({
    tipo: otorgar ? "verificacion_azul_otorgada" : "verificacion_azul_retirada",
    adminUid, adminNombre,
    objetivoUid, objetivoNombre,
    detalle: otorgar ? "Verificación azul otorgada" : "Verificación azul retirada"
  });

  await crearNotificacion({
    paraUid: objetivoUid,
    tipo: otorgar ? "verificacion_otorgada" : "verificacion_retirada",
    deUid: adminUid,
    deNombre: adminNombre,
    texto: otorgar
      ? "✅ ¡Felicidades! Un administrador te dio la verificación azul."
      : "Un administrador te retiró la verificación azul.",
    dataExtra: { tipo: "azul" }
  });
}

// Devuelve el HTML de la insignia correspondiente (o cadena vacía si no tiene ninguna).
// Orden: admin primero (es la más "alta"), luego dorada, luego azul. Un usuario puede
// tener varias a la vez (ej. un admin también puede tener la dorada).
// La insignia de ADMIN no es un campo aparte: se deriva directo de perfil.rol === "admin",
// el mismo campo que ya usa todo el proyecto (admin.js, muro-app.js, chat.js, etc.) para
// dar permisos. Así nunca puede desincronizarse — a quien se le da/quita rol de admin
// automáticamente gana/pierde la insignia, sin tocar nada más.
// Usa los PNG del set de íconos (admin-32.png, verificado-dorado-32.png, etc., en la
// raíz del proyecto) en vez de emojis, para que se vea igual en todos los dispositivos.
export function insigniaVerificado(perfil) {
  if (!perfil) return "";
  let html = "";
  if (perfil.rol === "admin") {
    html += `<img src="admin-32.png" class="badge-verificado admin" alt="Administrador" title="Administrador de OxygeNMedia">`;
  }
  if (perfil.verificadoDorado) {
    html += `<img src="verificado-dorado-32.png" class="badge-verificado dorado" alt="Verificado dorado" title="Verificado dorado">`;
  }
  if (perfil.verificadoAzul) {
    html += `<img src="verificado-azul-32.png" class="badge-verificado azul" alt="Verificado azul" title="Verificado azul">`;
  }
  return html;
}
