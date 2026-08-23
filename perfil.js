// perfil.js
// Edición de perfil: nombre, @username único, foto, descripción, y roles

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { iniciarAyudaImagen } from "./ayuda-imagen.js";
import {
  doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;
let perfilActual = null;
let rolesAprobadosDisponibles = [];

const avatarPreview = document.getElementById("avatarPreview");
const avatarInicial = document.getElementById("avatarInicial");
const nombreActual = document.getElementById("nombreActual");
const usernameActual = document.getElementById("usernameActual");
const useridActual = document.getElementById("useridActual");

const inputNombre = document.getElementById("inputNombre");
const inputUsername = document.getElementById("inputUsername");
const usernameMsg = document.getElementById("usernameMsg");
const inputFotoURL = document.getElementById("inputFotoURL");
const inputDescripcion = document.getElementById("inputDescripcion");
const checkSeguidoresPrivados = document.getElementById("checkSeguidoresPrivados");

const rolesActuales = document.getElementById("rolesActuales");
const rolesDisponiblesLista = document.getElementById("rolesDisponiblesLista");
const inputNuevoRol = document.getElementById("inputNuevoRol");
const btnProponerRol = document.getElementById("btnProponerRol");
const proponerRolMsg = document.getElementById("proponerRolMsg");

const btnGuardarPerfil = document.getElementById("btnGuardarPerfil");
const msgGuardado = document.getElementById("msgGuardado");

let misRolesPerfil = [];       // roles ya aprobados que tiene el usuario
let misRolesPendientes = [];   // roles que propuso y esperan aprobación

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para ver tu perfil. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid };
  perfilActual = perfil;
  cargarDatosEnFormulario();
  iniciarAyudaImagen();
  cargarRolesDisponibles().then(() => sincronizarRolesPendientesAprobados());
});

// Si alguno de mis roles "pendientes" ya fue aprobado por el admin,
// lo movemos automáticamente a roles activos
async function sincronizarRolesPendientesAprobados() {
  const pendientesActuales = perfilActual.rolesPendientes || [];
  if (pendientesActuales.length === 0) return;

  const yaAprobados = pendientesActuales.filter(r => rolesAprobadosDisponibles.includes(r));
  if (yaAprobados.length === 0) return;

  const nuevosRolesPerfil = [...new Set([...(perfilActual.rolesPerfil || []), ...yaAprobados])];
  const nuevosPendientes = pendientesActuales.filter(r => !yaAprobados.includes(r));

  await updateDoc(doc(db, "usuarios", usuarioActual.uid), {
    rolesPerfil: nuevosRolesPerfil,
    rolesPendientes: nuevosPendientes
  });

  perfilActual.rolesPerfil = nuevosRolesPerfil;
  perfilActual.rolesPendientes = nuevosPendientes;
  misRolesPerfil = nuevosRolesPerfil;
  misRolesPendientes = nuevosPendientes;
  renderRolesActuales();
  renderRolesDisponibles();
}

function cargarDatosEnFormulario() {
  nombreActual.textContent = perfilActual.nombre || "";
  usernameActual.textContent = perfilActual.username ? "@" + perfilActual.username : "Sin @ configurado";
  useridActual.textContent = "ID: " + usuarioActual.uid;

  inputNombre.value = perfilActual.nombre || "";
  inputUsername.value = perfilActual.username || "";
  inputFotoURL.value = perfilActual.fotoURL || "";
  inputDescripcion.value = perfilActual.descripcion || "";
  checkSeguidoresPrivados.checked = perfilActual.seguidoresPrivados || false;

  actualizarAvatar();

  misRolesPerfil = perfilActual.rolesPerfil || [];
  misRolesPendientes = perfilActual.rolesPendientes || [];
  renderRolesActuales();
}

function actualizarAvatar() {
  const url = inputFotoURL.value.trim();
  if (url) {
    avatarPreview.src = url;
    avatarPreview.classList.remove("hidden");
    avatarInicial.classList.add("hidden");
    avatarPreview.onerror = () => {
      avatarPreview.classList.add("hidden");
      avatarInicial.classList.remove("hidden");
    };
  } else {
    avatarPreview.classList.add("hidden");
    avatarInicial.classList.remove("hidden");
    const inicial = (inputNombre.value.trim()[0] || "?").toUpperCase();
    avatarInicial.textContent = inicial;
  }
}
inputFotoURL.addEventListener("input", actualizarAvatar);
inputNombre.addEventListener("input", actualizarAvatar);

// ============ VALIDACIÓN DE USERNAME ÚNICO ============

let debounceUsername = null;
inputUsername.addEventListener("input", () => {
  // Normaliza mientras escribe: minúsculas, sin espacios ni símbolos raros
  inputUsername.value = inputUsername.value.toLowerCase().replace(/[^a-z0-9_.]/g, "");
  clearTimeout(debounceUsername);
  usernameMsg.style.display = "none";
  debounceUsername = setTimeout(validarUsername, 400);
});

async function validarUsername() {
  const valor = inputUsername.value.trim();
  if (!valor) {
    usernameMsg.textContent = "";
    usernameMsg.style.display = "none";
    return true;
  }
  if (valor.length < 3) {
    usernameMsg.textContent = "Debe tener al menos 3 caracteres.";
    usernameMsg.className = "field-msg error";
    return false;
  }
  // Si no cambió respecto al actual, está bien sin checar duplicados
  if (valor === perfilActual.username) {
    usernameMsg.textContent = "";
    usernameMsg.style.display = "none";
    return true;
  }

  const q = query(collection(db, "usuarios"), where("username", "==", valor));
  const snap = await getDocs(q);
  if (!snap.empty) {
    usernameMsg.textContent = "Ese @ ya está en uso.";
    usernameMsg.className = "field-msg error";
    return false;
  }

  usernameMsg.textContent = "Disponible ✓";
  usernameMsg.className = "field-msg ok";
  return true;
}

// ============ ROLES ============

async function cargarRolesDisponibles() {
  const snap = await getDocs(query(collection(db, "rolesDisponibles"), where("aprobado", "==", true)));
  rolesAprobadosDisponibles = snap.docs.map(d => d.data().nombre);
  renderRolesDisponibles();
}

function renderRolesActuales() {
  rolesActuales.innerHTML = "";
  misRolesPerfil.forEach(rol => {
    const chip = document.createElement("span");
    chip.className = "role-chip";
    chip.innerHTML = `${rol} <span data-quitar-rol="${rol}">✕</span>`;
    rolesActuales.appendChild(chip);
  });
  misRolesPendientes.forEach(rol => {
    const chip = document.createElement("span");
    chip.className = "role-chip pendiente";
    chip.innerHTML = `${rol} (esperando aprobación) <span data-quitar-pendiente="${rol}">✕</span>`;
    rolesActuales.appendChild(chip);
  });
  if (misRolesPerfil.length === 0 && misRolesPendientes.length === 0) {
    rolesActuales.innerHTML = "<span style='color:var(--text-dim); font-size:13px;'>Aún no tienes roles.</span>";
  }

  rolesActuales.querySelectorAll("[data-quitar-rol]").forEach(el => {
    el.addEventListener("click", () => {
      misRolesPerfil = misRolesPerfil.filter(r => r !== el.dataset.quitarRol);
      renderRolesActuales();
    });
  });
  rolesActuales.querySelectorAll("[data-quitar-pendiente]").forEach(el => {
    el.addEventListener("click", () => {
      misRolesPendientes = misRolesPendientes.filter(r => r !== el.dataset.quitarPendiente);
      renderRolesActuales();
    });
  });
}

function renderRolesDisponibles() {
  const noAgregados = rolesAprobadosDisponibles.filter(r => !misRolesPerfil.includes(r));
  rolesDisponiblesLista.innerHTML = "";
  if (noAgregados.length === 0) {
    rolesDisponiblesLista.innerHTML = "<span style='color:var(--text-dim); font-size:12px;'>No hay roles disponibles para agregar todavía.</span>";
    return;
  }
  noAgregados.forEach(rol => {
    const opt = document.createElement("span");
    opt.className = "role-option";
    opt.textContent = "+ " + rol;
    opt.addEventListener("click", () => {
      misRolesPerfil.push(rol);
      renderRolesActuales();
      renderRolesDisponibles();
    });
    rolesDisponiblesLista.appendChild(opt);
  });
}

btnProponerRol.addEventListener("click", async () => {
  const nombreRol = inputNuevoRol.value.trim();
  if (!nombreRol) return;

  if (rolesAprobadosDisponibles.some(r => r.toLowerCase() === nombreRol.toLowerCase()) ||
      misRolesPendientes.some(r => r.toLowerCase() === nombreRol.toLowerCase())) {
    proponerRolMsg.textContent = "Ese rol ya existe o ya lo propusiste.";
    proponerRolMsg.className = "field-msg error";
    return;
  }

  try {
    await addDoc(collection(db, "rolesDisponibles"), {
      nombre: nombreRol,
      creadoPor: usuarioActual.uid,
      aprobado: false
    });
    misRolesPendientes.push(nombreRol);
    renderRolesActuales();
    inputNuevoRol.value = "";
    proponerRolMsg.textContent = "Rol propuesto. Un admin debe aprobarlo.";
    proponerRolMsg.className = "field-msg ok";
  } catch (err) {
    proponerRolMsg.textContent = "Error: " + err.message;
    proponerRolMsg.className = "field-msg error";
  }
});

// ============ GUARDAR PERFIL ============

btnGuardarPerfil.addEventListener("click", async () => {
  const nombre = inputNombre.value.trim();
  if (!nombre) {
    msgGuardado.textContent = "El nombre no puede estar vacío.";
    msgGuardado.className = "msg-guardado error";
    return;
  }

  const usernameValido = await validarUsername();
  if (!usernameValido) {
    msgGuardado.textContent = "Corrige el @ antes de guardar.";
    msgGuardado.className = "msg-guardado error";
    return;
  }

  btnGuardarPerfil.disabled = true;
  try {
    await updateDoc(doc(db, "usuarios", usuarioActual.uid), {
      nombre: nombre,
      username: inputUsername.value.trim(),
      fotoURL: inputFotoURL.value.trim(),
      descripcion: inputDescripcion.value.trim(),
      seguidoresPrivados: checkSeguidoresPrivados.checked,
      rolesPerfil: misRolesPerfil,
      rolesPendientes: misRolesPendientes
    });

    perfilActual = { ...perfilActual, nombre, username: inputUsername.value.trim(), fotoURL: inputFotoURL.value.trim(), descripcion: inputDescripcion.value.trim(), seguidoresPrivados: checkSeguidoresPrivados.checked, rolesPerfil: misRolesPerfil, rolesPendientes: misRolesPendientes };
    cargarDatosEnFormulario();

    msgGuardado.textContent = "Perfil actualizado ✓";
    msgGuardado.className = "msg-guardado ok";
  } catch (err) {
    msgGuardado.textContent = "Error al guardar: " + err.message;
    msgGuardado.className = "msg-guardado error";
  }
  btnGuardarPerfil.disabled = false;
});
