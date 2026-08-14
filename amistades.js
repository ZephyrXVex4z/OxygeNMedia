// amistades.js
// Módulo compartido para el sistema de solicitudes de amistad.

import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { crearNotificacion } from "./notificaciones.js";

// ID determinístico: siempre los dos UIDs ordenados alfabéticamente, unidos por "_"
// Así nunca se duplica una amistad sin importar quién la consulte o cree primero.
function idAmistad(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// Devuelve el estado actual entre dos usuarios: null | "pendiente" | "aceptada"
// y quién la solicitó (útil para saber si "yo" puedo aceptar o solo cancelar)
export async function obtenerEstadoAmistad(miUid, otroUid) {
  const id = idAmistad(miUid, otroUid);
  const snap = await getDoc(doc(db, "amistades", id));
  if (!snap.exists()) return null;
  return { id, ...snap.data() };
}

// Envía una solicitud de amistad y genera la notificación correspondiente
export async function enviarSolicitudAmistad(miUid, miNombre, otroUid, otroNombre) {
  const id = idAmistad(miUid, otroUid);
  await setDoc(doc(db, "amistades", id), {
    usuarios: [miUid, otroUid],
    estado: "pendiente",
    solicitadoPor: miUid,
    fecha: serverTimestamp()
  });

  await crearNotificacion({
    paraUid: otroUid,
    tipo: "solicitud_amistad",
    deUid: miUid,
    deNombre: miNombre,
    texto: `${miNombre} te envió una solicitud de amistad`,
    dataExtra: { amistadId: id }
  });
}

// Acepta una solicitud pendiente y notifica a quien la envió originalmente
export async function aceptarSolicitudAmistad(amistadId, miUid, miNombre, deUid, deNombre) {
  await updateDoc(doc(db, "amistades", amistadId), { estado: "aceptada" });
  await crearNotificacion({
    paraUid: deUid,
    tipo: "amistad_aceptada",
    deUid: miUid,
    deNombre: miNombre,
    texto: `${miNombre} aceptó tu solicitud de amistad`,
    dataExtra: { amistadId }
  });
}

// Rechaza una solicitud pendiente, o elimina una amistad ya aceptada
export async function eliminarAmistad(amistadId) {
  await deleteDoc(doc(db, "amistades", amistadId));
}

// Trae la lista de amigos (aceptados) del usuario, con datos básicos de cada uno
export async function listarAmigos(miUid) {
  const snap = await getDocs(query(
    collection(db, "amistades"),
    where("usuarios", "array-contains", miUid),
    where("estado", "==", "aceptada")
  ));

  const amigos = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const otroUid = data.usuarios.find(u => u !== miUid);
    const perfilSnap = await getDoc(doc(db, "usuarios", otroUid));
    if (perfilSnap.exists()) {
      amigos.push({ uid: otroUid, amistadId: docSnap.id, ...perfilSnap.data() });
    }
  }
  return amigos;
}

