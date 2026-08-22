// notificaciones.js
// Módulo compartido: crear notificaciones y escuchar las propias en tiempo real.
// Se importa desde cualquier página que necesite la campanita o disparar notificaciones.

import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { enviarPush } from "./push.js";

// Crea una notificación para otro usuario (o para uno mismo, en casos como "recurso aprobado")
// y, además, dispara una notificación push real vía OneSignal para ese mismo usuario.
export async function crearNotificacion({ paraUid, tipo, deUid = null, deNombre = "", texto, dataExtra = {} }) {
  if (!paraUid) return;
  await addDoc(collection(db, "notificaciones"), {
    paraUid, tipo, deUid, deNombre, texto,
    dataExtra, leida: false, fecha: serverTimestamp()
  });

  // El push se envía "en segundo plano": si falla (ej. el usuario nunca activó
  // notificaciones), no debe romper la acción principal que la originó.
  enviarPush(paraUid, "OxygeNMedia", texto, urlSegunTipo(tipo)).catch(() => {});
}

function urlSegunTipo(tipo) {
  const base = location.origin + location.pathname.replace(/[^/]+$/, "");
  const mapa = {
    solicitud_amistad: "solicitudes.html",
    amistad_aceptada: "amigos.html",
    like_publicacion: "muro.html",
    comentario_publicacion: "muro.html",
    mencion_publicacion: "muro.html",
    transferencia_recibida: "billetera.html",
    credito_recibido: "billetera.html",
    credito_removido: "billetera.html"
  };
  return base + (mapa[tipo] || "index.html");
}

// Escucha en tiempo real las notificaciones del usuario actual.
// callback recibe la lista completa (más recientes primero) cada vez que cambia algo.
export function escucharNotificaciones(uid, callback) {
  const q = query(
    collection(db, "notificaciones"),
    where("paraUid", "==", uid),
    orderBy("fecha", "desc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

export async function marcarNotificacionLeida(notifId) {
  await updateDoc(doc(db, "notificaciones", notifId), { leida: true });
}

export async function marcarTodasLeidas(lista) {
  const pendientes = lista.filter(n => !n.leida);
  await Promise.all(pendientes.map(n => updateDoc(doc(db, "notificaciones", n.id), { leida: true })));
}

export async function borrarNotificacion(notifId) {
  await deleteDoc(doc(db, "notificaciones", notifId));
}

// Borra TODAS las notificaciones del usuario de una sola vez (equivalente a
// marcarTodasLeidas, pero eliminándolas por completo en vez de solo marcarlas).
export async function borrarTodasLasNotificaciones(lista) {
  await Promise.all(lista.map(n => deleteDoc(doc(db, "notificaciones", n.id))));
}
