// auth.js
// Maneja registro, login, logout y el estado de aprobación del usuario

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// Crea una cuenta nueva (queda pendiente de aprobación por defecto)
export async function registrarUsuario(nombre, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  await setDoc(doc(db, "usuarios", uid), {
    nombre: nombre,
    email: email,
    rol: "estudiante",
    aprobado: false,
    fechaSolicitud: serverTimestamp(),
    recursosComprados: []
  });

  return uid;
}

// Inicia sesión con email y contraseña
export async function iniciarSesion(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// Cierra sesión
export async function cerrarSesion() {
  await signOut(auth);
}

// Envía un correo con enlace para restablecer la contraseña
export async function enviarCorreoRestablecer(email) {
  await sendPasswordResetEmail(auth, email);
}

// Trae el documento de Firestore del usuario actual (rol, aprobado, etc.)
export async function obtenerPerfilUsuario(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return null;
  return snap.data();
}

// Escucha cambios de sesión y ejecuta un callback con (user, perfil)
// perfil es null si no hay sesión iniciada
export function observarSesion(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    const perfil = await obtenerPerfilUsuario(user.uid);
    callback(user, perfil);
  });
}

// Traduce errores comunes de Firebase Auth a mensajes en español
export function traducirErrorAuth(error) {
  const codigo = error.code || "";
  const mapa = {
    "auth/email-already-in-use": "Ese correo ya tiene una cuenta registrada.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
    "auth/missing-email": "Escribe tu correo primero."
  };
  return mapa[codigo] || "Ocurrió un error. Intenta de nuevo.";
}
