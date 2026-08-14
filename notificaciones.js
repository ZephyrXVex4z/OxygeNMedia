// notificaciones.js
// Módulo compartido: crear notificaciones y escuchar las propias en tiempo real.
// Se importa desde cualquier página que necesite la campanita o disparar notificaciones.

import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// Crea una notificación para otro usuario (o para uno mismo, en casos como "recurso aprobado")
export async function crearNotificacion({ paraUid, tipo, deUid = null, deNombre = "", texto, dataExtra = {} }) {
  if (!paraUid) return;
  await addDoc(collection(db, "notificaciones"), {
    paraUid, tipo, deUid, deNombre, texto,
    dataExtra, leida: false, fecha: serverTimestamp()
  });
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
