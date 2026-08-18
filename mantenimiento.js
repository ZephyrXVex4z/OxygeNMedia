// mantenimiento.js
// Modo mantenimiento: bloquea el acceso al sitio para usuarios normales,
// dejando pasar solo a admins. Un único documento en Firestore controla el estado.

import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const REF_MANTENIMIENTO = () => doc(db, "configuracion", "mantenimiento");

// Activa el modo mantenimiento con un motivo y un rango horario de texto libre
// (ej. "3:00 PM a 5:00 PM"), quedando registrado quién lo activó.
export async function activarMantenimiento({ motivo, horario, adminUid, adminNombre }) {
  await setDoc(REF_MANTENIMIENTO(), {
    activo: true,
    motivo: motivo || "",
    horario: horario || "",
    activadoPor: adminUid,
    activadoPorNombre: adminNombre,
    fecha: serverTimestamp()
  });
}

export async function desactivarMantenimiento() {
  await setDoc(REF_MANTENIMIENTO(), { activo: false }, { merge: true });
}

// Trae el estado actual. Si el documento no existe todavía, se considera
// "sin mantenimiento" por defecto (no bloquea nada).
export async function obtenerEstadoMantenimiento() {
  const snap = await getDoc(REF_MANTENIMIENTO());
  if (!snap.exists()) return { activo: false };
  return snap.data();
}

