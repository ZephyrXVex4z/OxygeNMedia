// seguidores.js
// Sistema de seguidores, asimétrico (tipo Instagram/Twitter): seguir a alguien no
// requiere que te siga de vuelta, y no reemplaza al sistema de amistades — conviven,
// son cosas independientes. Un doc por relación de seguimiento, ID determinístico
// "{seguidorUid}_{seguidoUid}" para que nunca se duplique.
//
// Los contadores (seguidoresCount/siguiendoCount) viven desnormalizados en el
// documento del usuario en /usuarios, y se mantienen con runTransaction para que
// el conteo nunca se desincronice del documento real de seguimiento.

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, deleteDoc, getDocs, collection,
  query, where, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { crearNotificacion } from "./notificaciones.js";

function idSeguimiento(seguidorUid, seguidoUid) {
  return `${seguidorUid}_${seguidoUid}`;
}

// Devuelve true si "miUid" ya sigue a "otroUid"
export async function siguiendoA(miUid, otroUid) {
  const snap = await getDoc(doc(db, "seguidores", idSeguimiento(miUid, otroUid)));
  return snap.exists();
}

// Empieza a seguir a otro usuario. Crea el doc de relación y sube ambos contadores
// (siguiendoCount de quien sigue, seguidoresCount de quien es seguido) atómicamente.
export async function seguirUsuario(miUid, miNombre, otroUid, otroNombre) {
  if (miUid === otroUid) throw new Error("No puedes seguirte a ti mismo.");

  const refRelacion = doc(db, "seguidores", idSeguimiento(miUid, otroUid));
  const refMi = doc(db, "usuarios", miUid);
  const refOtro = doc(db, "usuarios", otroUid);

  await runTransaction(db, async (tx) => {
    const snapRelacion = await tx.get(refRelacion);
    if (snapRelacion.exists()) return; // ya lo sigue, no hace nada

    const snapMi = await tx.get(refMi);
    const snapOtro = await tx.get(refOtro);
    if (!snapMi.exists() || !snapOtro.exists()) throw new Error("Usuario no encontrado.");

    tx.set(refRelacion, {
      seguidorUid: miUid,
      seguidoUid: otroUid,
      fecha: serverTimestamp()
    });
    tx.update(refMi, { siguiendoCount: (snapMi.data().siguiendoCount || 0) + 1 });
    tx.update(refOtro, { seguidoresCount: (snapOtro.data().seguidoresCount || 0) + 1 });
  });

  await crearNotificacion({
    paraUid: otroUid,
    tipo: "nuevo_seguidor",
    deUid: miUid,
    deNombre: miNombre,
    texto: `${miNombre} empezó a seguirte`,
    dataExtra: {}
  });
}

// Deja de seguir a otro usuario. Baja ambos contadores atómicamente (nunca negativos).
export async function dejarDeSeguir(miUid, otroUid) {
  const refRelacion = doc(db, "seguidores", idSeguimiento(miUid, otroUid));
  const refMi = doc(db, "usuarios", miUid);
  const refOtro = doc(db, "usuarios", otroUid);

  await runTransaction(db, async (tx) => {
    const snapRelacion = await tx.get(refRelacion);
    if (!snapRelacion.exists()) return; // ya no lo seguía, no hace nada

    const snapMi = await tx.get(refMi);
    const snapOtro = await tx.get(refOtro);

    tx.delete(refRelacion);
    if (snapMi.exists()) {
      tx.update(refMi, { siguiendoCount: Math.max(0, (snapMi.data().siguiendoCount || 0) - 1) });
    }
    if (snapOtro.exists()) {
      tx.update(refOtro, { seguidoresCount: Math.max(0, (snapOtro.data().seguidoresCount || 0) - 1) });
    }
  });
}

// Lista de UIDs que "uid" sigue (útil para armar un feed "de quienes sigo", a futuro)
export async function listarSiguiendo(uid) {
  const snap = await getDocs(query(collection(db, "seguidores"), where("seguidorUid", "==", uid)));
  return snap.docs.map(d => d.data().seguidoUid);
}

// Lista de UIDs que siguen a "uid"
export async function listarSeguidores(uid) {
  const snap = await getDocs(query(collection(db, "seguidores"), where("seguidoUid", "==", uid)));
  return snap.docs.map(d => d.data().seguidorUid);
}
