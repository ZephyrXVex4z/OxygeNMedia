// actualizaciones.js
// Registro de actualizaciones/novedades del sitio, publicadas solo por admins.

import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

export async function publicarActualizacion({ titulo, descripcion, version, tipo, adminUid, adminNombre }) {
  await addDoc(collection(db, "actualizaciones"), {
    titulo,
    descripcion: descripcion || "",
    version: version || "",
    tipo: tipo || "mejora",
    creadoPor: adminUid,
    creadoPorNombre: adminNombre,
    fecha: serverTimestamp()
  });
}

export async function editarActualizacion(id, { titulo, descripcion, version, tipo }) {
  await updateDoc(doc(db, "actualizaciones", id), { titulo, descripcion, version, tipo });
}

export async function borrarActualizacion(id) {
  await deleteDoc(doc(db, "actualizaciones", id));
}

export async function listarActualizaciones() {
  const snap = await getDocs(query(collection(db, "actualizaciones"), orderBy("fecha", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

