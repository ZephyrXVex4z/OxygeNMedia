// wallet.js
// Sistema de créditos digitales: saldo, transferencias P2P, admin dar/quitar,
// y compra automática de recursos de pago con el saldo.

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, getDocs, query, where,
  orderBy, limit, serverTimestamp, runTransaction, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { crearNotificacion } from "./notificaciones.js";

// Trae el saldo actual de un usuario (0 si no tiene el campo todavía)
export async function obtenerSaldo(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return 0;
  return snap.data().saldo || 0;
}

// Transferir crédito de un usuario a otro.
// Usa runTransaction: lee ambos saldos, valida, y escribe ambos cambios de forma
// atómica — si algo falla a medias, Firestore revierte todo automáticamente.
export async function transferirCredito(deUid, deNombre, paraUid, paraNombre, monto, motivo = "") {
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (deUid === paraUid) throw new Error("No puedes transferirte a ti mismo.");

  const refDe = doc(db, "usuarios", deUid);
  const refPara = doc(db, "usuarios", paraUid);

  await runTransaction(db, async (tx) => {
    const snapDe = await tx.get(refDe);
    const snapPara = await tx.get(refPara);

    if (!snapDe.exists() || !snapPara.exists()) throw new Error("Usuario no encontrado.");

    const saldoDe = snapDe.data().saldo || 0;
    if (saldoDe < monto) throw new Error("No tienes saldo suficiente.");

    const saldoPara = snapPara.data().saldo || 0;

    tx.update(refDe, { saldo: saldoDe - monto });
    tx.update(refPara, { saldo: saldoPara + monto });
  });

  await addDoc(collection(db, "transacciones"), {
    tipo: "transferencia",
    deUid, deNombre, paraUid, paraNombre, monto, motivo,
    adminUid: null,
    fecha: serverTimestamp()
  });

  await crearNotificacion({
    paraUid,
    tipo: "transferencia_recibida",
    deUid,
    deNombre,
    texto: `${deNombre} te transfirió $${monto}${motivo ? " — " + motivo : ""}`,
    dataExtra: { monto }
  });
}

// El admin da o quita saldo directamente (sin necesitar saldo previo de nadie)
export async function adminAjustarSaldo(adminUid, adminNombre, objetivoUid, objetivoNombre, monto, motivo = "") {
  // monto puede ser positivo (dar) o negativo (quitar)
  const refObjetivo = doc(db, "usuarios", objetivoUid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(refObjetivo);
    if (!snap.exists()) throw new Error("Usuario no encontrado.");
    const saldoActual = snap.data().saldo || 0;
    const nuevoSaldo = saldoActual + monto;
    if (nuevoSaldo < 0) throw new Error("Ese usuario no tiene suficiente saldo para quitarle esa cantidad.");
    tx.update(refObjetivo, { saldo: nuevoSaldo });
  });

  await addDoc(collection(db, "transacciones"), {
    tipo: monto >= 0 ? "admin_dar" : "admin_quitar",
    deUid: null, deNombre: "",
    paraUid: objetivoUid, paraNombre: objetivoNombre,
    monto: Math.abs(monto), motivo,
    adminUid: adminUid,
    fecha: serverTimestamp()
  });

  await crearNotificacion({
    paraUid: objetivoUid,
    tipo: monto >= 0 ? "credito_recibido" : "credito_removido",
    deUid: adminUid,
    deNombre: adminNombre,
    texto: monto >= 0
      ? `Un administrador te dio $${monto} de crédito${motivo ? " — " + motivo : ""}`
      : `Un administrador te quitó $${Math.abs(monto)} de crédito${motivo ? " — " + motivo : ""}`,
    dataExtra: { monto }
  });
}

// Comprar un recurso de pago usando el saldo del usuario.
// Descuenta el saldo y marca el recurso como comprado, todo en una sola transacción.
export async function comprarRecursoConSaldo(uid, nombre, recursoId, precio, tituloRecurso) {
  const refUsuario = doc(db, "usuarios", uid);
  const refRecurso = doc(db, "recursos", recursoId);

  await runTransaction(db, async (tx) => {
    const snapUsuario = await tx.get(refUsuario);
    const snapRecurso = await tx.get(refRecurso);

    if (!snapUsuario.exists()) throw new Error("Usuario no encontrado.");
    if (!snapRecurso.exists()) throw new Error("Recurso no encontrado.");

    const saldoActual = snapUsuario.data().saldo || 0;
    if (saldoActual < precio) throw new Error("No tienes saldo suficiente para este recurso.");

    const compradoPorActual = snapRecurso.data().compradoPor || [];
    if (compradoPorActual.includes(uid)) throw new Error("Ya tienes acceso a este recurso.");

    const recursosCompradosActual = snapUsuario.data().recursosComprados || [];

    tx.update(refUsuario, {
      saldo: saldoActual - precio,
      recursosComprados: [...recursosCompradosActual, recursoId]
    });
    tx.update(refRecurso, {
      compradoPor: [...compradoPorActual, uid]
    });
  });

  await addDoc(collection(db, "transacciones"), {
    tipo: "compra_recurso",
    deUid: uid, deNombre: nombre,
    paraUid: null, paraNombre: "",
    monto: precio,
    motivo: "Compra: " + tituloRecurso,
    adminUid: null,
    dataExtra: { recursoId },
    fecha: serverTimestamp()
  });
}

// Historial de transacciones donde el usuario participó (enviadas o recibidas)
export async function obtenerHistorial(uid, cantidad = 50) {
  const [enviadasSnap, recibidasSnap] = await Promise.all([
    getDocs(query(collection(db, "transacciones"), where("deUid", "==", uid), limit(cantidad))),
    getDocs(query(collection(db, "transacciones"), where("paraUid", "==", uid), limit(cantidad)))
  ]);

  const mapa = new Map();
  enviadasSnap.forEach(d => mapa.set(d.id, { id: d.id, ...d.data() }));
  recibidasSnap.forEach(d => mapa.set(d.id, { id: d.id, ...d.data() }));

  return [...mapa.values()].sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));
}

// ============ TARJETAS DE REGALO ============

// Genera un código legible tipo OXY-7F3K-9QRT (sin caracteres ambiguos como 0/O, 1/I)
function generarCodigoTarjeta() {
  const alfabeto = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const grupo = () => Array.from({ length: 4 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join("");
  return `OXY-${grupo()}-${grupo()}`;
}

// El admin crea una tarjeta nueva. Reintenta con otro código si por rarísima
// coincidencia el generado ya existiera (el código es el ID del documento).
export async function crearTarjetaRegalo(adminUid, adminNombre, monto) {
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0.");

  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigoTarjeta();
    const ref = doc(db, "tarjetasRegalo", codigo);
    const yaExiste = await getDoc(ref);
    if (yaExiste.exists()) continue; // colisión rarísima, reintenta con otro código

    await setDoc(ref, {
      monto,
      creadoPor: adminUid,
      creadoPorNombre: adminNombre,
      fecha: serverTimestamp(),
      canjeada: false,
      canjeadaPor: null,
      canjeadaPorNombre: "",
      fechaCanje: null
    });

    return codigo;
  }
  throw new Error("No se pudo generar un código único, intenta de nuevo.");
}

// Canjea una tarjeta: valida que exista y no esté usada, marca como canjeada,
// y suma el saldo correspondiente al usuario. Todo en una transacción atómica.
export async function canjearTarjetaRegalo(codigo, uid, nombre) {
  const codigoNormalizado = codigo.trim().toUpperCase();
  const refTarjeta = doc(db, "tarjetasRegalo", codigoNormalizado);
  const refUsuario = doc(db, "usuarios", uid);

  let montoCanjeado = 0;

  await runTransaction(db, async (tx) => {
    const snapTarjeta = await tx.get(refTarjeta);
    if (!snapTarjeta.exists()) throw new Error("Ese código no existe. Revisa que esté bien escrito.");

    const tarjeta = snapTarjeta.data();
    if (tarjeta.canjeada) throw new Error("Esta tarjeta ya fue canjeada anteriormente.");

    const snapUsuario = await tx.get(refUsuario);
    if (!snapUsuario.exists()) throw new Error("Usuario no encontrado.");
    const saldoActual = snapUsuario.data().saldo || 0;

    montoCanjeado = tarjeta.monto;

    tx.update(refTarjeta, {
      canjeada: true,
      canjeadaPor: uid,
      canjeadaPorNombre: nombre,
      fechaCanje: serverTimestamp()
    });
    tx.update(refUsuario, { saldo: saldoActual + montoCanjeado });
  });

  await addDoc(collection(db, "transacciones"), {
    tipo: "canje_tarjeta",
    deUid: null, deNombre: "",
    paraUid: uid, paraNombre: nombre,
    monto: montoCanjeado,
    motivo: "Canje de tarjeta de regalo " + codigoNormalizado,
    adminUid: null,
    dataExtra: { codigo: codigoNormalizado },
    fecha: serverTimestamp()
  });

  return montoCanjeado;
}
// Lista todas las tarjetas creadas (para el panel de monitoreo del admin)
export async function listarTarjetasRegalo() {
  const snap = await getDocs(query(collection(db, "tarjetasRegalo"), orderBy("fecha", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
