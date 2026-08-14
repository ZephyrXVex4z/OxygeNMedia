// logs.js
// Registro de acciones de moderación: quién hizo qué, cuándo, a quién.

import { db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

export async function registrarLog({ tipo, adminUid, adminNombre, objetivoUid = null, objetivoNombre = "", detalle = "" }) {
  await addDoc(collection(db, "logs"), {
    tipo, adminUid, adminNombre, objetivoUid, objetivoNombre, detalle,
    fecha: serverTimestamp()
  });
}

export async function obtenerLogsRecientes(cantidad = 100) {
  const snap = await getDocs(query(collection(db, "logs"), orderBy("fecha", "desc"), limit(cantidad)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

