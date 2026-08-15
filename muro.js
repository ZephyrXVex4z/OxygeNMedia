// muro.js
// Feed de publicaciones tipo red social: texto + imagen + cita de recurso, likes, comentarios.

import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, deleteDoc, getDoc, getDocs, setDoc,
  query, where, orderBy, limit, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { crearNotificacion } from "./notificaciones.js";

// Crea una publicación nueva
export async function crearPublicacion({ autorId, autorNombre, autorFotoURL, texto, imagenURL, recursoCitado }) {
  await addDoc(collection(db, "publicaciones"), {
    autorId,
    autorNombre,
    autorFotoURL: autorFotoURL || "",
    texto: texto || "",
    imagenURL: imagenURL || "",
    recursoCitado: recursoCitado || null,
    likesCount: 0,
    comentariosCount: 0,
    fecha: serverTimestamp()
  });
}

// Trae publicaciones para el feed. Si se pasa uidsPermitidos (lista de UIDs de amigos + uno mismo),
// filtra solo esos autores — se usa para el modo "solo amigos". Sin esa lista, trae todo el feed general.
export async function obtenerFeed({ cantidad = 30, soloDeUids = null } = {}) {
  const snap = await getDocs(query(collection(db, "publicaciones"), orderBy("fecha", "desc"), limit(cantidad * 2)));
  let publicaciones = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (soloDeUids) {
    publicaciones = publicaciones.filter(p => soloDeUids.includes(p.autorId));
  }

  return publicaciones.slice(0, cantidad);
}

export async function borrarPublicacion(pubId) {
  await deleteDoc(doc(db, "publicaciones", pubId));
}

// ============ LIKES ============

// Devuelve true si el usuario ya le dio like a esta publicación
export async function yaDioLike(pubId, uid) {
  const snap = await getDoc(doc(db, "publicaciones", pubId, "likes", uid));
  return snap.exists();
}

// Alterna el like: si ya existe lo quita (y resta contador), si no existe lo crea (y suma).
// Usa runTransaction para que el contador y el documento de like cambien de forma atómica.
export async function alternarLike(pubId, uid, autorPubUid, autorPubNombre, miNombre) {
  const refLike = doc(db, "publicaciones", pubId, "likes", uid);
  const refPub = doc(db, "publicaciones", pubId);

  let seAgrego = false;

  await runTransaction(db, async (tx) => {
    const snapLike = await tx.get(refLike);
    const snapPub = await tx.get(refPub);
    if (!snapPub.exists()) throw new Error("Esta publicación ya no existe.");

    const likesActual = snapPub.data().likesCount || 0;

    if (snapLike.exists()) {
      tx.delete(refLike);
      tx.update(refPub, { likesCount: Math.max(0, likesActual - 1) });
      seAgrego = false;
    } else {
      tx.set(refLike, { fecha: serverTimestamp() });
      tx.update(refPub, { likesCount: likesActual + 1 });
      seAgrego = true;
    }
  });

  if (seAgrego && autorPubUid !== uid) {
    await crearNotificacion({
      paraUid: autorPubUid,
      tipo: "like_publicacion",
      deUid: uid,
      deNombre: miNombre,
      texto: `A ${miNombre} le gustó tu publicación`,
      dataExtra: { pubId }
    });
  }

  return seAgrego;
}

// ============ COMENTARIOS ============

export async function obtenerComentarios(pubId) {
  const snap = await getDocs(query(collection(db, "publicaciones", pubId, "comentarios"), orderBy("fecha", "asc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function agregarComentario(pubId, autorId, autorNombre, texto, autorPubUid, autorPubNombre) {
  const refPub = doc(db, "publicaciones", pubId);

  await addDoc(collection(db, "publicaciones", pubId, "comentarios"), {
    autorId, autorNombre, texto, fecha: serverTimestamp()
  });

  await runTransaction(db, async (tx) => {
    const snapPub = await tx.get(refPub);
    if (!snapPub.exists()) return;
    const actual = snapPub.data().comentariosCount || 0;
    tx.update(refPub, { comentariosCount: actual + 1 });
  });

  if (autorPubUid !== autorId) {
    await crearNotificacion({
      paraUid: autorPubUid,
      tipo: "comentario_publicacion",
      deUid: autorId,
      deNombre: autorNombre,
      texto: `${autorNombre} comentó tu publicación`,
      dataExtra: { pubId }
    });
  }
}

export async function borrarComentario(pubId, comentarioId) {
  await deleteDoc(doc(db, "publicaciones", pubId, "comentarios", comentarioId));

  const refPub = doc(db, "publicaciones", pubId);
  await runTransaction(db, async (tx) => {
    const snapPub = await tx.get(refPub);
    if (!snapPub.exists()) return;
    const actual = snapPub.data().comentariosCount || 0;
    tx.update(refPub, { comentariosCount: Math.max(0, actual - 1) });
  });
}

