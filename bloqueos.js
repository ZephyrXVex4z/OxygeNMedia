// bloqueos.js
// Permite a cualquier usuario bloquear a otro por su propia cuenta, sin depender de
// que un admin actúe primero (eso ya existe vía reportes.js, y sigue disponible para
// casos que sí requieren moderación). Bloquear es unilateral y privado: la otra persona
// nunca se entera de que la bloqueaste.
//
// Efecto del bloqueo (se aplica consultando bloqueosDe() desde cada pantalla relevante):
// - El bloqueado no puede iniciarte un chat privado ni escribirte en uno ya existente.
// - Sus publicaciones/comentarios se pueden ocultar del feed si se desea (opcional,
//   ver ocultarBloqueadosDeFeed más abajo).
// - No puede seguirte ni enviarte solicitud de amistad mientras estés bloqueado.
//
// Un doc por relación, ID determinístico igual que seguidores.js, para que nunca se
// duplique sin importar quién consulte primero.

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, deleteDoc, getDocs, collection,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

function idBloqueo(miUid, otroUid) {
  return `${miUid}_${otroUid}`;
}

// ¿"miUid" bloqueó a "otroUid"? (unidireccional a propósito: que A bloqueó a B no
// significa que B bloqueó a A — cada quien decide su propio bloqueo)
export async function yoBloqueeA(miUid, otroUid) {
  const snap = await getDoc(doc(db, "bloqueos", idBloqueo(miUid, otroUid)));
  return snap.exists();
}

// ¿Existe bloqueo en CUALQUIER dirección entre estos dos? Útil para decidir si se
// pueden mandar mensajes entre sí (si cualquiera de los dos bloqueó al otro, no).
export async function hayBloqueoEntre(uidA, uidB) {
  const [snapA, snapB] = await Promise.all([
    getDoc(doc(db, "bloqueos", idBloqueo(uidA, uidB))),
    getDoc(doc(db, "bloqueos", idBloqueo(uidB, uidA)))
  ]);
  return snapA.exists() || snapB.exists();
}

export async function bloquearUsuario(miUid, otroUid) {
  if (miUid === otroUid) throw new Error("No puedes bloquearte a ti mismo.");
  await setDoc(doc(db, "bloqueos", idBloqueo(miUid, otroUid)), {
    deUid: miUid,
    aUid: otroUid,
    fecha: serverTimestamp()
  });
}

export async function desbloquearUsuario(miUid, otroUid) {
  await deleteDoc(doc(db, "bloqueos", idBloqueo(miUid, otroUid)));
}

// Lista de UIDs que "miUid" ha bloqueado (para pantallas de "Usuarios bloqueados")
export async function listarBloqueados(miUid) {
  const snap = await getDocs(query(collection(db, "bloqueos"), where("deUid", "==", miUid)));
  return snap.docs.map(d => d.data().aUid);
}

