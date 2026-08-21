// reportes.js
// Sistema de reportes: cualquier usuario puede reportar una publicación, un
// comentario, o un usuario (perfil/foto/nombre). El reporte queda en la colección
// "reportes" con estado "pendiente" hasta que un admin lo revisa y decide qué hacer
// (borrar la publicación/comentario, suspender al usuario, o descartar el reporte
// sin acción). Toda esa revisión ocurre desde el panel admin (admin.js).

import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, getDocs, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { registrarLog } from "./logs.js";

// Tipos de objetivo que se pueden reportar.
export const TIPO_OBJETIVO = {
  USUARIO: "usuario",
  PUBLICACION: "publicacion",
  COMENTARIO: "comentario"
};

// Motivos predefinidos que se muestran en el formulario de reporte, agrupados por
// tipo de objetivo (los motivos de "usuario" no tienen mucho sentido para una
// publicación, y viceversa). "Otro" siempre está disponible y usa el campo libre
// de "info adicional" como motivo completo.
export const MOTIVOS_POR_TIPO = {
  usuario: [
    "Nombre de usuario inapropiado",
    "Foto de perfil inapropiada",
    "Suplantación de identidad",
    "Cuenta de spam o falsa",
    "Acoso hacia otros usuarios",
    "Otro"
  ],
  publicacion: [
    "Contenido inapropiado o explícito",
    "Discurso de odio o discriminación",
    "Acoso o intimidación",
    "Información falsa",
    "Spam o publicidad no deseada",
    "Otro"
  ],
  comentario: [
    "Contenido inapropiado o explícito",
    "Discurso de odio o discriminación",
    "Acoso o intimidación",
    "Spam",
    "Otro"
  ]
};

// Crea un nuevo reporte. "objetivo" identifica qué se reporta:
//   { tipo: "usuario"|"publicacion"|"comentario", id, autorUid, autorNombre, extraId }
// "extraId" es opcional y se usa para comentarios (el id de la publicación que lo contiene),
// porque un comentario vive dentro de la subcolección de una publicación específica.
export async function crearReporte({
  reportanteUid, reportanteNombre,
  objetivoTipo, objetivoId, objetivoAutorUid, objetivoAutorNombre, objetivoExtraId = null,
  motivo, infoAdicional = ""
}) {
  if (!motivo) throw new Error("Selecciona un motivo para el reporte.");
  if (reportanteUid === objetivoAutorUid) throw new Error("No puedes reportar tu propio contenido.");

  await addDoc(collection(db, "reportes"), {
    reportanteUid, reportanteNombre,
    objetivoTipo,           // "usuario" | "publicacion" | "comentario"
    objetivoId,             // uid del usuario, o id de la publicación/comentario
    objetivoExtraId,        // id de la publicación padre, solo si objetivoTipo === "comentario"
    objetivoAutorUid,
    objetivoAutorNombre,
    motivo,
    infoAdicional,
    estado: "pendiente",    // "pendiente" | "resuelto" | "descartado"
    resolucion: null,       // texto de qué decidió el admin, se llena al resolver
    adminUid: null,
    adminNombre: null,
    fecha: serverTimestamp(),
    fechaResolucion: null
  });
}

// Trae todos los reportes pendientes, para la pestaña "Reportes" del panel admin.
export async function listarReportesPendientes() {
  const snap = await getDocs(
    query(collection(db, "reportes"), where("estado", "==", "pendiente"), orderBy("fecha", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Trae el historial de reportes ya resueltos/descartados (para revisar qué se decidió antes).
export async function listarReportesResueltos(cantidad = 100) {
  const snap = await getDocs(
    query(collection(db, "reportes"), where("estado", "!=", "pendiente"), orderBy("estado"), orderBy("fecha", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, cantidad);
}

// El admin marca un reporte como resuelto, dejando constancia de qué acción tomó
// (borrar contenido, suspender usuario, o ninguna acción / reporte no procedía).
// Esta función SOLO actualiza el estado del reporte — borrar la publicación o
// suspender al usuario se hace por separado con las funciones que ya existen
// (borrarPublicacion en muro.js, suspenderUsuario en admin.js), y admin.js llama
// a ambas cosas juntas cuando el admin aprieta el botón correspondiente.
export async function resolverReporte(reporteId, adminUid, adminNombre, accionTomada) {
  await updateDoc(doc(db, "reportes", reporteId), {
    estado: "resuelto",
    resolucion: accionTomada,
    adminUid, adminNombre,
    fechaResolucion: serverTimestamp()
  });

  await registrarLog({
    tipo: "reporte_resuelto",
    adminUid, adminNombre,
    objetivoUid: null,
    objetivoNombre: "",
    detalle: accionTomada
  });
}

// El admin descarta un reporte sin tomar ninguna acción (ej. no procedía).
export async function descartarReporte(reporteId, adminUid, adminNombre) {
  await updateDoc(doc(db, "reportes", reporteId), {
    estado: "descartado",
    resolucion: "Reporte descartado, sin acción.",
    adminUid, adminNombre,
    fechaResolucion: serverTimestamp()
  });
}
