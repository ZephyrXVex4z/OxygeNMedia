// admin.js
// Lógica del panel de administración: CRUD de recursos, aprobación de usuarios

import { db } from "./firebase-config.js";
import { observarSesion, cerrarSesion } from "./auth.js";
import { registrarLog, obtenerLogsRecientes } from "./logs.js";
import { adminAjustarSaldo, crearTarjetaRegalo, listarTarjetasRegalo } from "./wallet.js";
import { publicarActualizacion, editarActualizacion, borrarActualizacion, listarActualizaciones } from "./actualizaciones.js";
import { activarMantenimiento, desactivarMantenimiento, obtenerEstadoMantenimiento } from "./mantenimiento.js";
import { listarReportesPendientes, listarReportesResueltos, resolverReporte, descartarReporte } from "./reportes.js";
import { adminOtorgarVerificacionDorada, adminOtorgarVerificacionAzul, insigniaVerificado } from "./verificados.js";
import { borrarPublicacion, borrarComentario } from "./muro.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc,
  query, where, orderBy, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const deniedView = document.getElementById("deniedView");
const adminPanel = document.getElementById("adminPanel");
let adminActual = null;

document.getElementById("btnLogout").addEventListener("click", cerrarSesion);

// --- Control de acceso: solo admin puede ver este panel ---
observarSesion((user, perfil) => {
  if (!user || !perfil || perfil.rol !== "admin") {
    deniedView.classList.remove("hidden");
    adminPanel.classList.add("hidden");
    return;
  }
  adminActual = { uid: user.uid, ...perfil };
  deniedView.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  cargarRecursos();
  cargarPendientes();
  cargarTodos();
  cargarRolesPendientes();
  cargarJuegosPendientesAdmin();
  cargarLogs();
  cargarTarjetas();
  cargarNovedadesAdmin();
  cargarEstadoMantenimiento();
  cargarReportes();
  cargarVerificados();
});

// --- Tabs ---
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tabRecursos").classList.add("hidden");
    document.getElementById("tabUsuarios").classList.add("hidden");
    document.getElementById("tabTodos").classList.add("hidden");
    document.getElementById("tabRoles").classList.add("hidden");
    document.getElementById("tabJuegos").classList.add("hidden");
    document.getElementById("tabRegistro").classList.add("hidden");
    document.getElementById("tabTarjetas").classList.add("hidden");
    document.getElementById("tabNovedades").classList.add("hidden");
    document.getElementById("tabReportes").classList.add("hidden");
    document.getElementById("tabVerificaciones").classList.add("hidden");
    document.getElementById("tabMantenimiento").classList.add("hidden");
    document.getElementById("tab" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)).classList.remove("hidden");
  });
});

// ============ RECURSOS ============

const rTitulo = document.getElementById("rTitulo");
const rDescripcion = document.getElementById("rDescripcion");
const rContenido = document.getElementById("rContenido");
const rCategoria = document.getElementById("rCategoria");
const rPrecio = document.getElementById("rPrecio");
const rImagenURL = document.getElementById("rImagenURL");
const rImagenPreview = document.getElementById("rImagenPreview");
const rImagenContenidoURL = document.getElementById("rImagenContenidoURL");
const rImagenContenidoPreview = document.getElementById("rImagenContenidoPreview");
const rGratis = document.getElementById("rGratis");
const rPublico = document.getElementById("rPublico");
const rVisible = document.getElementById("rVisible");
const recursoId = document.getElementById("recursoId");
const formTitulo = document.getElementById("formTitulo");
const btnCancelarEdicion = document.getElementById("btnCancelarEdicion");
const msgRecurso = document.getElementById("msgRecurso");

function mostrarMsg(el, texto, tipo) {
  el.textContent = texto;
  el.className = "msg " + tipo;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

const rImagenURL_input = rImagenURL;
rImagenURL_input.addEventListener("input", () => {
  const url = rImagenURL_input.value.trim();
  if (url) {
    rImagenPreview.src = url;
    rImagenPreview.classList.remove("hidden");
  } else {
    rImagenPreview.classList.add("hidden");
  }
});

rImagenContenidoURL.addEventListener("input", () => {
  const url = rImagenContenidoURL.value.trim();
  if (url) {
    rImagenContenidoPreview.src = url;
    rImagenContenidoPreview.classList.remove("hidden");
  } else {
    rImagenContenidoPreview.classList.add("hidden");
  }
});

function limpiarFormRecurso() {
  recursoId.value = "";
  rTitulo.value = "";
  rDescripcion.value = "";
  rContenido.value = "";
  rCategoria.value = "";
  rPrecio.value = "";
  rImagenURL.value = "";
  rImagenPreview.classList.add("hidden");
  rImagenContenidoURL.value = "";
  rImagenContenidoPreview.classList.add("hidden");
  rGratis.checked = false;
  rPublico.checked = false;
  rVisible.checked = true;
  formTitulo.textContent = "Nuevo recurso";
  btnCancelarEdicion.classList.add("hidden");
}

btnCancelarEdicion.addEventListener("click", limpiarFormRecurso);

document.getElementById("btnGuardarRecurso").addEventListener("click", async () => {
  if (!rTitulo.value.trim()) {
    mostrarMsg(msgRecurso, "El título es obligatorio.", "err");
    return;
  }

  const dataPublica = {
    titulo: rTitulo.value.trim(),
    descripcion: rDescripcion.value.trim(),
    categoria: rCategoria.value.trim() || "General",
    precio: Number(rPrecio.value) || 0,
    imagenURL: rImagenURL.value.trim(),
    esGratis: rGratis.checked,
    esPublico: rPublico.checked,
    visible: rVisible.checked
  };

  const dataProtegida = {
    contenido: rContenido.value.trim(),
    imagenContenidoURL: rImagenContenidoURL.value.trim()
  };

  try {
    let idUsado = recursoId.value;
    if (idUsado) {
      await updateDoc(doc(db, "recursos", idUsado), dataPublica);
      mostrarMsg(msgRecurso, "Recurso actualizado.", "ok");
    } else {
      dataPublica.fechaSubida = serverTimestamp();
      dataPublica.compradoPor = [];
      dataPublica.subidoPor = adminActual.uid;
      dataPublica.subidoPorNombre = adminActual.nombre;
      const ref = await addDoc(collection(db, "recursos"), dataPublica);
      idUsado = ref.id;
      mostrarMsg(msgRecurso, "Recurso creado.", "ok");
    }
    // El contenido protegido siempre vive en el mismo documento fijo "data" dentro de la subcolección
    await setDoc(doc(db, "recursos", idUsado, "contenidoProtegido", "data"), dataProtegida);

    limpiarFormRecurso();
    cargarRecursos();
  } catch (err) {
    mostrarMsg(msgRecurso, "Error: " + err.message, "err");
  }
});

async function cargarRecursos() {
  const snap = await getDocs(query(collection(db, "recursos"), orderBy("fechaSubida", "desc")));
  const tbody = document.getElementById("tablaRecursos");
  const empty = document.getElementById("emptyRecursos");
  tbody.innerHTML = "";

  if (snap.empty) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  snap.forEach(docSnap => {
    const r = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.titulo}</td>
      <td>${r.categoria || ""}</td>
      <td><span class="badge ${r.esGratis ? "gratis" : "pago"}">${r.esGratis ? "Gratis" : "$" + r.precio}</span></td>
      <td><span class="badge ${r.esPublico ? "publico" : "privado"}">${r.esPublico ? "Público" : "Privado"}</span> ${!r.visible ? "<span class='badge privado'>Oculto</span>" : ""}</td>
      <td class="row-actions">
        <button class="secondary" data-edit="${docSnap.id}">Editar</button>
        <button class="danger" data-del="${docSnap.id}">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const snap2 = await getDocs(query(collection(db, "recursos"), where("__name__", "==", btn.dataset.edit)));
      for (const d of snap2.docs) {
        const r = d.data();
        recursoId.value = d.id;
        rTitulo.value = r.titulo || "";
        rDescripcion.value = r.descripcion || "";
        rCategoria.value = r.categoria || "";
        rPrecio.value = r.precio || "";
        rImagenURL.value = r.imagenURL || "";
        if (r.imagenURL) {
          rImagenPreview.src = r.imagenURL;
          rImagenPreview.classList.remove("hidden");
        } else {
          rImagenPreview.classList.add("hidden");
        }

        // El contenido protegido vive en una subcolección aparte
        const protegidoSnap = await getDoc(doc(db, "recursos", d.id, "contenidoProtegido", "data"));
        const protegido = protegidoSnap.exists() ? protegidoSnap.data() : {};
        rContenido.value = protegido.contenido || "";
        rImagenContenidoURL.value = protegido.imagenContenidoURL || "";
        if (protegido.imagenContenidoURL) {
          rImagenContenidoPreview.src = protegido.imagenContenidoURL;
          rImagenContenidoPreview.classList.remove("hidden");
        } else {
          rImagenContenidoPreview.classList.add("hidden");
        }

        rGratis.checked = !!r.esGratis;
        rPublico.checked = !!r.esPublico;
        rVisible.checked = r.visible !== false;
        formTitulo.textContent = "Editando: " + r.titulo;
        btnCancelarEdicion.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });


  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar este recurso permanentemente?")) return;
      await deleteDoc(doc(db, "recursos", btn.dataset.del));
      cargarRecursos();
    });
  });
}

// ============ USUARIOS PENDIENTES ============

async function cargarPendientes() {
  const snap = await getDocs(query(collection(db, "usuarios"), where("aprobado", "==", false)));
  const tbody = document.getElementById("tablaPendientes");
  const empty = document.getElementById("emptyPendientes");
  tbody.innerHTML = "";

  if (snap.empty) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  snap.forEach(docSnap => {
    const u = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td class="row-actions">
        <button class="success" data-approve="${docSnap.id}">Aprobar</button>
        <button class="danger" data-reject="${docSnap.id}">Rechazar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-approve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "usuarios", btn.dataset.approve), { aprobado: true });
      cargarPendientes();
      cargarTodos();
    });
  });

  tbody.querySelectorAll("[data-reject]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Rechazar y borrar esta solicitud?")) return;
      await deleteDoc(doc(db, "usuarios", btn.dataset.reject));
      cargarPendientes();
      cargarTodos();
    });
  });
}

// ============ TODOS LOS USUARIOS ============

async function cargarTodos() {
  const snap = await getDocs(collection(db, "usuarios"));
  const tbody = document.getElementById("tablaTodos");
  tbody.innerHTML = "";

  snap.forEach(docSnap => {
    const u = docSnap.data();
    const estaSuspendido = u.suspendido === true;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td>${u.rol}</td>
      <td>
        <span class="badge ${u.aprobado ? "gratis" : "pago"}">${u.aprobado ? "Aprobado" : "Pendiente"}</span>
        ${estaSuspendido ? `<span class="badge pago" style="background:rgba(227,93,93,0.15); color:var(--danger);">Suspendido</span>` : ""}
      </td>
      <td style="font-weight:600; color:var(--success);">$${u.saldo || 0}</td>
      <td class="row-actions">
        <button class="secondary" data-pagos="${docSnap.id}">Pagos</button>
        <button class="secondary" data-saldo="${docSnap.id}" data-nombre-saldo="${u.nombre}" data-saldo-actual="${u.saldo || 0}">💰 Saldo</button>
        ${u.rol !== "admin"
          ? `<button class="secondary" data-makeadmin="${docSnap.id}">Hacer admin</button>`
          : ""}
        ${estaSuspendido
          ? `<button class="success" data-reactivar="${docSnap.id}" data-nombre="${u.nombre}">Reactivar</button>`
          : `<button class="danger" data-suspender="${docSnap.id}" data-nombre="${u.nombre}">Suspender</button>`}
        <button class="danger" data-deluser="${docSnap.id}">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-saldo]").forEach(btn => {
    btn.addEventListener("click", () => abrirModalSaldo(btn.dataset.saldo, btn.dataset.nombreSaldo, Number(btn.dataset.saldoActual)));
  });
  tbody.querySelectorAll("[data-pagos]").forEach(btn => {
    btn.addEventListener("click", () => abrirModalPagos(btn.dataset.pagos, btn.closest("tr")));
  });

  tbody.querySelectorAll("[data-makeadmin]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Convertir a este usuario en administrador?")) return;
      await updateDoc(doc(db, "usuarios", btn.dataset.makeadmin), { rol: "admin" });
      cargarTodos();
    });
  });

  tbody.querySelectorAll("[data-suspender]").forEach(btn => {
    btn.addEventListener("click", () => { reporteEnSuspensionActual = null; abrirModalSuspender(btn.dataset.suspender, btn.dataset.nombre); });
  });

  tbody.querySelectorAll("[data-reactivar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Reactivar la cuenta de " + btn.dataset.nombre + "?")) return;
      await updateDoc(doc(db, "usuarios", btn.dataset.reactivar), {
        suspendido: false,
        suspensionMotivo: "",
        suspensionHasta: null
      });
      await registrarLog({
        tipo: "levantar_suspension",
        adminUid: adminActual.uid,
        adminNombre: adminActual.nombre,
        objetivoUid: btn.dataset.reactivar,
        objetivoNombre: btn.dataset.nombre,
        detalle: "Cuenta reactivada"
      });
      cargarTodos();
    });
  });

  tbody.querySelectorAll("[data-deluser]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar este usuario? (Esto no borra su cuenta de acceso, solo su perfil)")) return;
      await deleteDoc(doc(db, "usuarios", btn.dataset.deluser));
      cargarTodos();
    });
  });
}

// ============ SUSPENSIÓN DE CUENTAS ============

const modalSuspender = document.getElementById("modalSuspender");
const suspenderUsuarioNombre = document.getElementById("suspenderUsuarioNombre");
const suspenderMotivo = document.getElementById("suspenderMotivo");
const suspenderDuracion = document.getElementById("suspenderDuracion");
let usuarioASuspenderId = null;
let usuarioASuspenderNombre = null;
// Si la suspensión se abrió desde la pestaña de Reportes, guarda qué reporte
// resolver también al confirmar (se limpia siempre al abrir el modal de otro lado).
let reporteEnSuspensionActual = null;

function abrirModalSuspender(uid, nombre) {
  usuarioASuspenderId = uid;
  usuarioASuspenderNombre = nombre;
  suspenderUsuarioNombre.textContent = "Suspender a " + nombre;
  suspenderMotivo.value = "";
  suspenderDuracion.value = "7";
  modalSuspender.classList.remove("hidden");
}

document.getElementById("btnCancelarSuspender").addEventListener("click", () => {
  modalSuspender.classList.add("hidden");
  reporteEnSuspensionActual = null;
});

document.getElementById("btnConfirmarSuspender").addEventListener("click", async () => {
  if (!usuarioASuspenderId) return;
  const motivo = suspenderMotivo.value.trim();
  const duracion = suspenderDuracion.value;

  let hasta = null;
  if (duracion !== "permanente") {
    const dias = Number(duracion);
    hasta = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  }

  try {
    await updateDoc(doc(db, "usuarios", usuarioASuspenderId), {
      suspendido: true,
      suspensionMotivo: motivo,
      suspensionHasta: hasta
    });

    await registrarLog({
      tipo: "suspension",
      adminUid: adminActual.uid,
      adminNombre: adminActual.nombre,
      objetivoUid: usuarioASuspenderId,
      objetivoNombre: usuarioASuspenderNombre,
      detalle: (duracion === "permanente" ? "Suspensión permanente" : `Suspensión por ${duracion} días`) +
               (motivo ? ` — Motivo: ${motivo}` : "")
    });

    // Si esta suspensión vino de resolver un reporte, márcalo como resuelto también
    if (reporteEnSuspensionActual) {
      await resolverReporte(
        reporteEnSuspensionActual, adminActual.uid, adminActual.nombre,
        `Usuario suspendido${motivo ? " — Motivo: " + motivo : ""}.`
      );
      reporteEnSuspensionActual = null;
      cargarReportes();
    }

    modalSuspender.classList.add("hidden");
    cargarTodos();
  } catch (err) {
    alert("Error al suspender: " + err.message);
  }
});

// ============ PAGOS (recursosComprados) ============

const modalPagos = document.getElementById("modalPagos");
const listaPagos = document.getElementById("listaPagos");
const pagosUsuarioNombre = document.getElementById("pagosUsuarioNombre");
const btnGuardarPagos = document.getElementById("btnGuardarPagos");
const btnCerrarPagos = document.getElementById("btnCerrarPagos");

let usuarioPagosActualId = null;
let usuarioPagosComprasAnteriores = [];

async function abrirModalPagos(userId, filaTr) {
  usuarioPagosActualId = userId;

  // Datos del usuario: nombre y sus compras actuales
  const usuarioSnap = await getDocs(query(collection(db, "usuarios"), where("__name__", "==", userId)));
  let usuarioData = null;
  usuarioSnap.forEach(d => usuarioData = d.data());
  if (!usuarioData) return;

  pagosUsuarioNombre.textContent = "Recursos pagados — " + usuarioData.nombre;
  const comprados = usuarioData.recursosComprados || [];
  usuarioPagosComprasAnteriores = comprados;

  // Solo recursos de paga (esGratis === false)
  const recursosSnap = await getDocs(query(collection(db, "recursos"), where("esGratis", "==", false)));

  if (recursosSnap.empty) {
    listaPagos.innerHTML = "<p style='color:var(--text-dim); font-size:13px;'>No hay recursos de paga creados todavía.</p>";
  } else {
    listaPagos.innerHTML = "";
    recursosSnap.forEach(docSnap => {
      const r = docSnap.data();
      const marcado = comprados.includes(docSnap.id);
      const row = document.createElement("div");
      row.className = "checkbox-row";
      row.innerHTML = `
        <input type="checkbox" id="pago_${docSnap.id}" value="${docSnap.id}" ${marcado ? "checked" : ""}>
        <label style="margin:0" for="pago_${docSnap.id}">${r.titulo} — $${r.precio} MXN</label>
      `;
      listaPagos.appendChild(row);
    });
  }

  modalPagos.classList.remove("hidden");
}

btnCerrarPagos.addEventListener("click", () => {
  modalPagos.classList.add("hidden");
  usuarioPagosActualId = null;
});

btnGuardarPagos.addEventListener("click", async () => {
  if (!usuarioPagosActualId) return;
  const seleccionados = [...listaPagos.querySelectorAll("input[type=checkbox]:checked")].map(el => el.value);
  const anteriores = usuarioPagosComprasAnteriores || [];

  const agregados = seleccionados.filter(id => !anteriores.includes(id));
  const quitados = anteriores.filter(id => !seleccionados.includes(id));

  try {
    // 1. Actualiza el array del usuario (para que el admin vea fácil qué compró)
    await updateDoc(doc(db, "usuarios", usuarioPagosActualId), { recursosComprados: seleccionados });

    // 2. Actualiza compradoPor en cada recurso afectado (esto es lo que valida la regla de seguridad)
    for (const recursoId of agregados) {
      await updateDoc(doc(db, "recursos", recursoId), { compradoPor: arrayUnion(usuarioPagosActualId) });
    }
    for (const recursoId of quitados) {
      await updateDoc(doc(db, "recursos", recursoId), { compradoPor: arrayRemove(usuarioPagosActualId) });
    }

    modalPagos.classList.add("hidden");
    usuarioPagosActualId = null;
  } catch (err) {
    alert("Error al guardar: " + err.message);
  }
});

// ============ ROLES PENDIENTES ============

async function cargarRolesPendientes() {
  const snap = await getDocs(query(collection(db, "rolesDisponibles"), where("aprobado", "==", false)));
  const tbody = document.getElementById("tablaRolesPendientes");
  const empty = document.getElementById("emptyRoles");
  tbody.innerHTML = "";

  if (snap.empty) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  snap.forEach(docSnap => {
    const r = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.nombre}</td>
      <td class="row-actions">
        <button class="success" data-approve-rol="${docSnap.id}">Aprobar</button>
        <button class="danger" data-reject-rol="${docSnap.id}">Rechazar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-approve-rol]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "rolesDisponibles", btn.dataset.approveRol), { aprobado: true });
      cargarRolesPendientes();
    });
  });

  tbody.querySelectorAll("[data-reject-rol]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Rechazar este rol propuesto?")) return;
      await deleteDoc(doc(db, "rolesDisponibles", btn.dataset.rejectRol));
      cargarRolesPendientes();
    });
  });
}

// ============ JUEGOS PENDIENTES ============

async function cargarJuegosPendientesAdmin() {
  const snap = await getDocs(query(collection(db, "juegos"), where("aprobado", "==", false)));
  const tbody = document.getElementById("tablaJuegosPendientes");
  const empty = document.getElementById("emptyJuegosAdmin");
  tbody.innerHTML = "";

  if (snap.empty) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  snap.forEach(docSnap => {
    const j = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${j.nombre}</td>
      <td>${j.subidoPorNombre}</td>
      <td class="row-actions">
        <button class="secondary" data-probar-juego="${docSnap.id}">Probar</button>
        <button class="success" data-approve-juego="${docSnap.id}">Aprobar</button>
        <button class="danger" data-reject-juego="${docSnap.id}">Rechazar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-probar-juego]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const snap2 = await getDocs(query(collection(db, "juegos"), where("__name__", "==", btn.dataset.probarJuego)));
      snap2.forEach(d => {
        const j = d.data();
        const w = window.open("", "_blank");
        w.document.write(j.html);
      });
    });
  });

  tbody.querySelectorAll("[data-approve-juego]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "juegos", btn.dataset.approveJuego), { aprobado: true });
      cargarJuegosPendientesAdmin();
    });
  });

  tbody.querySelectorAll("[data-reject-juego]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Rechazar y borrar este juego?")) return;
      await deleteDoc(doc(db, "juegos", btn.dataset.rejectJuego));
      cargarJuegosPendientesAdmin();
    });
  });
}

// ============ REGISTRO DE MODERACIÓN (LOGS) ============

const ETIQUETAS_TIPO_LOG = {
  suspension: "🚫 Suspensión",
  levantar_suspension: "✅ Reactivación",
  aprobacion_usuario: "👤 Usuario aprobado",
  borrado_mensaje: "🗑️ Mensaje borrado",
  borrado_sugerencia: "🗑️ Sugerencia borrada",
  borrado_recurso: "🗑️ Recurso borrado",
  admin_dar: "💰 Saldo otorgado",
  admin_quitar: "💸 Saldo removido",
  tarjeta_creada: "🎁 Tarjeta de regalo creada",
  mantenimiento_activado: "🛠️ Mantenimiento activado",
  mantenimiento_desactivado: "✅ Mantenimiento desactivado"
};

async function cargarLogs() {
  const logs = await obtenerLogsRecientes(100);
  const tbody = document.getElementById("tablaLogs");
  const empty = document.getElementById("emptyLogs");
  tbody.innerHTML = "";

  if (logs.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  logs.forEach(log => {
    const fecha = log.fecha ? log.fecha.toDate().toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fecha}</td>
      <td>${log.adminNombre}</td>
      <td>${ETIQUETAS_TIPO_LOG[log.tipo] || log.tipo}${log.objetivoNombre ? " — " + log.objetivoNombre : ""}</td>
      <td style="font-size:12px; color:var(--text-dim);">${log.detalle || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============ GESTIÓN DE SALDO (ADMIN) ============

const modalSaldo = document.getElementById("modalSaldo");
const saldoUsuarioNombre = document.getElementById("saldoUsuarioNombre");
const saldoUsuarioActual = document.getElementById("saldoUsuarioActual");
const saldoMonto = document.getElementById("saldoMonto");
const saldoMotivo = document.getElementById("saldoMotivo");
const msgSaldo = document.getElementById("msgSaldo");

let usuarioSaldoId = null;
let usuarioSaldoNombre = null;

function abrirModalSaldo(uid, nombre, saldoActual) {
  usuarioSaldoId = uid;
  usuarioSaldoNombre = nombre;
  saldoUsuarioNombre.textContent = "Gestionar saldo — " + nombre;
  saldoUsuarioActual.textContent = "Saldo actual: $" + saldoActual;
  saldoMonto.value = "";
  saldoMotivo.value = "";
  msgSaldo.style.display = "none";
  modalSaldo.classList.remove("hidden");
}

document.getElementById("btnCerrarSaldo").addEventListener("click", () => {
  modalSaldo.classList.add("hidden");
});

async function procesarAjusteSaldo(signo) {
  const monto = Number(saldoMonto.value);
  if (!monto || monto <= 0) {
    msgSaldo.textContent = "Escribe un monto válido.";
    msgSaldo.className = "msg error";
    msgSaldo.style.display = "block";
    return;
  }

  try {
    await adminAjustarSaldo(
      adminActual.uid, adminActual.nombre,
      usuarioSaldoId, usuarioSaldoNombre,
      monto * signo, saldoMotivo.value.trim()
    );

    await registrarLog({
      tipo: signo > 0 ? "admin_dar" : "admin_quitar",
      adminUid: adminActual.uid,
      adminNombre: adminActual.nombre,
      objetivoUid: usuarioSaldoId,
      objetivoNombre: usuarioSaldoNombre,
      detalle: `${signo > 0 ? "Dio" : "Quitó"} $${monto}${saldoMotivo.value.trim() ? " — " + saldoMotivo.value.trim() : ""}`
    });

    modalSaldo.classList.add("hidden");
    cargarTodos();
  } catch (err) {
    msgSaldo.textContent = err.message;
    msgSaldo.className = "msg error";
    msgSaldo.style.display = "block";
  }
}

document.getElementById("btnDarSaldo").addEventListener("click", () => procesarAjusteSaldo(1));
document.getElementById("btnQuitarSaldo").addEventListener("click", () => procesarAjusteSaldo(-1));

// ============ TARJETAS DE REGALO ============

const montoNuevaTarjeta = document.getElementById("montoNuevaTarjeta");
const btnCrearTarjeta = document.getElementById("btnCrearTarjeta");
const codigoGeneradoBox = document.getElementById("codigoGeneradoBox");
const codigoGeneradoTexto = document.getElementById("codigoGeneradoTexto");

btnCrearTarjeta.addEventListener("click", async () => {
  const monto = Number(montoNuevaTarjeta.value);
  if (!monto || monto <= 0) {
    alert("Escribe un monto válido.");
    return;
  }

  btnCrearTarjeta.disabled = true;
  try {
    const codigo = await crearTarjetaRegalo(adminActual.uid, adminActual.nombre, monto);
    codigoGeneradoTexto.textContent = codigo;
    codigoGeneradoBox.classList.remove("hidden");
    montoNuevaTarjeta.value = "";

    await registrarLog({
      tipo: "tarjeta_creada",
      adminUid: adminActual.uid,
      adminNombre: adminActual.nombre,
      objetivoUid: null,
      objetivoNombre: "",
      detalle: `Tarjeta ${codigo} por $${monto}`
    });

    cargarTarjetas();
  } catch (err) {
    alert("Error al crear la tarjeta: " + err.message);
  }
  btnCrearTarjeta.disabled = false;
});

async function cargarTarjetas() {
  const tarjetas = await listarTarjetasRegalo();
  const tbody = document.getElementById("tablaTarjetas");
  const empty = document.getElementById("emptyTarjetas");
  tbody.innerHTML = "";

  if (tarjetas.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tarjetas.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:monospace; font-size:12px;">${t.id}</td>
      <td>$${t.monto}</td>
      <td><span class="badge ${t.canjeada ? "pago" : "gratis"}" style="${t.canjeada ? "background:rgba(224,169,65,0.15); color:var(--warn);" : ""}">${t.canjeada ? "Canjeada" : "Disponible"}</span></td>
      <td style="font-size:12px; color:var(--text-dim);">${t.canjeadaPorNombre || "—"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============ NOVEDADES / REGISTRO DE ACTUALIZACIONES ============

const ETIQUETAS_TIPO_NOVEDAD = {
  nueva_funcion: "✨ Nueva función",
  mejora: "⚙️ Mejora",
  arreglo: "🛠️ Arreglo"
};

const novedadEditId = document.getElementById("novedadEditId");
const novedadTipo = document.getElementById("novedadTipo");
const novedadTitulo = document.getElementById("novedadTitulo");
const novedadDescripcion = document.getElementById("novedadDescripcion");
const novedadVersion = document.getElementById("novedadVersion");
const novedadFormTitulo = document.getElementById("novedadFormTitulo");
const btnPublicarNovedad = document.getElementById("btnPublicarNovedad");
const btnCancelarEdicionNovedad = document.getElementById("btnCancelarEdicionNovedad");
const msgNovedad = document.getElementById("msgNovedad");

function limpiarFormNovedad() {
  novedadEditId.value = "";
  novedadTipo.value = "mejora";
  novedadTitulo.value = "";
  novedadDescripcion.value = "";
  novedadVersion.value = "";
  novedadFormTitulo.textContent = "Publicar novedad";
  btnPublicarNovedad.textContent = "Publicar";
  btnCancelarEdicionNovedad.classList.add("hidden");
}

btnCancelarEdicionNovedad.addEventListener("click", limpiarFormNovedad);

btnPublicarNovedad.addEventListener("click", async () => {
  const titulo = novedadTitulo.value.trim();
  if (!titulo) {
    mostrarMsgNovedad("El título es obligatorio.", "error");
    return;
  }

  btnPublicarNovedad.disabled = true;
  try {
    if (novedadEditId.value) {
      await editarActualizacion(novedadEditId.value, {
        titulo,
        descripcion: novedadDescripcion.value.trim(),
        version: novedadVersion.value.trim(),
        tipo: novedadTipo.value
      });
      mostrarMsgNovedad("Novedad actualizada.", "ok");
    } else {
      await publicarActualizacion({
        titulo,
        descripcion: novedadDescripcion.value.trim(),
        version: novedadVersion.value.trim(),
        tipo: novedadTipo.value,
        adminUid: adminActual.uid,
        adminNombre: adminActual.nombre
      });
      mostrarMsgNovedad("Novedad publicada.", "ok");
    }
    limpiarFormNovedad();
    cargarNovedadesAdmin();
  } catch (err) {
    mostrarMsgNovedad("Error: " + err.message, "error");
  }
  btnPublicarNovedad.disabled = false;
});

function mostrarMsgNovedad(texto, tipo) {
  msgNovedad.textContent = texto;
  msgNovedad.className = "msg " + tipo;
  msgNovedad.style.display = "block";
  setTimeout(() => { msgNovedad.style.display = "none"; }, 3000);
}

async function cargarNovedadesAdmin() {
  const lista = await listarActualizaciones();
  const tbody = document.getElementById("tablaNovedades");
  const empty = document.getElementById("emptyNovedades");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  lista.forEach(a => {
    const fecha = a.fecha ? a.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-size:12px; color:var(--text-dim);">${fecha}</td>
      <td>${ETIQUETAS_TIPO_NOVEDAD[a.tipo] || a.tipo}</td>
      <td>${a.titulo}${a.version ? ` <span style="color:var(--text-dim); font-size:11px;">(${a.version})</span>` : ""}</td>
      <td class="row-actions">
        <button class="secondary" data-editar-novedad="${a.id}">Editar</button>
        <button class="danger" data-borrar-novedad="${a.id}">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);

    tr.querySelector("[data-editar-novedad]").addEventListener("click", () => {
      novedadEditId.value = a.id;
      novedadTipo.value = a.tipo || "mejora";
      novedadTitulo.value = a.titulo || "";
      novedadDescripcion.value = a.descripcion || "";
      novedadVersion.value = a.version || "";
      novedadFormTitulo.textContent = "Editando: " + a.titulo;
      btnPublicarNovedad.textContent = "Guardar cambios";
      btnCancelarEdicionNovedad.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    tr.querySelector("[data-borrar-novedad]").addEventListener("click", async () => {
      if (!confirm("¿Borrar esta novedad?")) return;
      await borrarActualizacion(a.id);
      cargarNovedadesAdmin();
    });
  });
}

// ============ REPORTES ============

const tablaReportes = document.getElementById("tablaReportes");
const emptyReportes = document.getElementById("emptyReportes");
const tablaReportesResueltos = document.getElementById("tablaReportesResueltos");
const emptyReportesResueltos = document.getElementById("emptyReportesResueltos");

const ETIQUETA_TIPO_REPORTE = { usuario: "👤 Usuario", publicacion: "📝 Publicación", comentario: "💬 Comentario" };

async function cargarReportes() {
  const reportes = await listarReportesPendientes();
  emptyReportes.classList.toggle("hidden", reportes.length > 0);

  tablaReportes.innerHTML = reportes.map(r => {
    const fecha = r.fecha ? r.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    let accionesContenido = "";

    if (r.objetivoTipo === "publicacion") {
      accionesContenido = `<button class="danger" data-borrar-pub-reporte="${r.id}" data-pub-id="${r.objetivoId}">Borrar publicación</button>`;
    } else if (r.objetivoTipo === "comentario") {
      accionesContenido = `<button class="danger" data-borrar-com-reporte="${r.id}" data-pub-id="${r.objetivoExtraId}" data-com-id="${r.objetivoId}">Borrar comentario</button>`;
    }

    return `
      <tr>
        <td>${fecha}</td>
        <td>${ETIQUETA_TIPO_REPORTE[r.objetivoTipo] || r.objetivoTipo}</td>
        <td>${r.objetivoAutorNombre || "—"}</td>
        <td>${r.reportanteNombre}</td>
        <td>${r.motivo}</td>
        <td style="max-width:200px; font-size:12px; color:var(--text-dim);">${r.infoAdicional || "—"}</td>
        <td style="display:flex; flex-direction:column; gap:4px; min-width:150px;">
          ${accionesContenido}
          <button class="danger" data-suspender-reporte="${r.id}" data-uid="${r.objetivoAutorUid}" data-nombre="${r.objetivoAutorNombre}">Suspender usuario</button>
          <button class="secondary" data-descartar-reporte="${r.id}">Descartar</button>
        </td>
      </tr>
    `;
  }).join("");

  tablaReportes.querySelectorAll("[data-borrar-pub-reporte]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta publicación? Esta acción no se puede deshacer.")) return;
      try {
        await borrarPublicacion(btn.dataset.pubId);
        await resolverReporte(btn.dataset.borrarPubReporte, adminActual.uid, adminActual.nombre, "Publicación borrada por un administrador.");
        cargarReportes();
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });

  tablaReportes.querySelectorAll("[data-borrar-com-reporte]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar este comentario? Esta acción no se puede deshacer.")) return;
      try {
        await borrarComentario(btn.dataset.pubId, btn.dataset.comId);
        await resolverReporte(btn.dataset.borrarComReporte, adminActual.uid, adminActual.nombre, "Comentario borrado por un administrador.");
        cargarReportes();
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });

  // Suspender usuario: reutiliza el mismo modal que ya existe en la pestaña
  // "Todos los usuarios". Al confirmar la suspensión ahí, marcamos el reporte
  // como resuelto por separado (el modal no sabe que viene de un reporte).
  tablaReportes.querySelectorAll("[data-suspender-reporte]").forEach(btn => {
    btn.addEventListener("click", () => {
      reporteEnSuspensionActual = btn.dataset.suspenderReporte;
      abrirModalSuspender(btn.dataset.uid, btn.dataset.nombre);
    });
  });

  tablaReportes.querySelectorAll("[data-descartar-reporte]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Descartar este reporte sin tomar ninguna acción?")) return;
      await descartarReporte(btn.dataset.descartarReporte, adminActual.uid, adminActual.nombre);
      cargarReportes();
    });
  });

  cargarReportesResueltos();
}

async function cargarReportesResueltos() {
  const reportes = await listarReportesResueltos(50);
  emptyReportesResueltos.classList.toggle("hidden", reportes.length > 0);

  tablaReportesResueltos.innerHTML = reportes.map(r => {
    const fecha = r.fechaResolucion ? r.fechaResolucion.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "";
    return `
      <tr>
        <td>${fecha}</td>
        <td>${ETIQUETA_TIPO_REPORTE[r.objetivoTipo] || r.objetivoTipo}</td>
        <td>${r.objetivoAutorNombre || "—"}</td>
        <td>${r.motivo}</td>
        <td style="font-size:12px;">${r.resolucion || "—"}</td>
        <td style="font-size:12px; color:var(--text-dim);">${r.adminNombre || "—"}</td>
      </tr>
    `;
  }).join("");
}

// ============ VERIFICACIONES ============

const buscarUsuarioVerificar = document.getElementById("buscarUsuarioVerificar");
const resultadosVerificar = document.getElementById("resultadosVerificar");
const tablaVerificados = document.getElementById("tablaVerificados");
const emptyVerificados = document.getElementById("emptyVerificados");
let todosLosUsuariosCache = null;

let debounceBusquedaVerificar = null;
buscarUsuarioVerificar.addEventListener("input", () => {
  clearTimeout(debounceBusquedaVerificar);
  const texto = buscarUsuarioVerificar.value.trim().replace(/^@/, "").toLowerCase();
  if (texto.length < 2) { resultadosVerificar.innerHTML = ""; return; }
  debounceBusquedaVerificar = setTimeout(() => buscarUsuariosParaVerificar(texto), 250);
});

async function buscarUsuariosParaVerificar(texto) {
  if (!todosLosUsuariosCache) {
    const snap = await getDocs(collection(db, "usuarios"));
    todosLosUsuariosCache = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  }

  const resultados = todosLosUsuariosCache.filter(u =>
    (u.username && u.username.toLowerCase().includes(texto)) ||
    (u.nombre && u.nombre.toLowerCase().includes(texto))
  );

  resultadosVerificar.innerHTML = resultados.length === 0
    ? "<div class='empty'>No se encontraron usuarios.</div>"
    : resultados.map(u => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0; border-bottom:1px solid var(--border);">
          <div>
            <strong>${u.nombre}</strong> ${insigniaVerificado(u)}
            <div style="font-size:12px; color:var(--text-dim);">@${u.username || "—"}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="${u.verificadoDorado ? "danger" : "success"}" data-toggle-dorada="${u.uid}" data-nombre="${u.nombre}" data-estado="${u.verificadoDorado ? "quitar" : "dar"}">
              ${u.verificadoDorado ? "Quitar 🥇" : "Dar 🥇"}
            </button>
            <button class="${u.verificadoAzul ? "danger" : "success"}" data-toggle-azul="${u.uid}" data-nombre="${u.nombre}" data-estado="${u.verificadoAzul ? "quitar" : "dar"}">
              ${u.verificadoAzul ? "Quitar ✅" : "Dar ✅"}
            </button>
          </div>
        </div>
      `).join("");

  resultadosVerificar.querySelectorAll("[data-toggle-dorada]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const otorgar = btn.dataset.estado === "dar";
      try {
        await adminOtorgarVerificacionDorada(adminActual.uid, adminActual.nombre, btn.dataset.toggleDorada, btn.dataset.nombre, otorgar);
        todosLosUsuariosCache = null;
        buscarUsuariosParaVerificar(buscarUsuarioVerificar.value.trim().replace(/^@/, "").toLowerCase());
        cargarVerificados();
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });

  resultadosVerificar.querySelectorAll("[data-toggle-azul]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const otorgar = btn.dataset.estado === "dar";
      try {
        await adminOtorgarVerificacionAzul(adminActual.uid, adminActual.nombre, btn.dataset.toggleAzul, btn.dataset.nombre, otorgar);
        todosLosUsuariosCache = null;
        buscarUsuariosParaVerificar(buscarUsuarioVerificar.value.trim().replace(/^@/, "").toLowerCase());
        cargarVerificados();
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });
}

async function cargarVerificados() {
  const snap = await getDocs(
    query(collection(db, "usuarios"), where("verificadoDorado", "==", true))
  );
  const snapAzul = await getDocs(
    query(collection(db, "usuarios"), where("verificadoAzul", "==", true))
  );

  const mapa = new Map();
  snap.docs.forEach(d => mapa.set(d.id, { uid: d.id, ...d.data() }));
  snapAzul.docs.forEach(d => mapa.set(d.id, { uid: d.id, ...d.data() }));
  const verificados = [...mapa.values()];

  emptyVerificados.classList.toggle("hidden", verificados.length > 0);
  tablaVerificados.innerHTML = verificados.map(u => `
    <tr>
      <td>${u.nombre} <span style="font-size:11px; color:var(--text-dim);">@${u.username || "—"}</span></td>
      <td>${u.verificadoDorado ? "🥇 Sí" : "—"}</td>
      <td>${u.verificadoAzul ? "✅ Sí" : "—"}</td>
      <td style="display:flex; gap:6px;">
        ${u.verificadoDorado ? `<button class="danger" data-quitar-dorada-tabla="${u.uid}" data-nombre="${u.nombre}">Quitar 🥇</button>` : ""}
        ${u.verificadoAzul ? `<button class="danger" data-quitar-azul-tabla="${u.uid}" data-nombre="${u.nombre}">Quitar ✅</button>` : ""}
      </td>
    </tr>
  `).join("");

  tablaVerificados.querySelectorAll("[data-quitar-dorada-tabla]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await adminOtorgarVerificacionDorada(adminActual.uid, adminActual.nombre, btn.dataset.quitarDoradaTabla, btn.dataset.nombre, false);
      todosLosUsuariosCache = null;
      cargarVerificados();
    });
  });
  tablaVerificados.querySelectorAll("[data-quitar-azul-tabla]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await adminOtorgarVerificacionAzul(adminActual.uid, adminActual.nombre, btn.dataset.quitarAzulTabla, btn.dataset.nombre, false);
      todosLosUsuariosCache = null;
      cargarVerificados();
    });
  });
}

// ============ MODO MANTENIMIENTO ============

const mantMotivo = document.getElementById("mantMotivo");
const mantHorario = document.getElementById("mantHorario");
const btnActivarMantenimiento = document.getElementById("btnActivarMantenimiento");
const btnDesactivarMantenimiento = document.getElementById("btnDesactivarMantenimiento");
const msgMantenimiento = document.getElementById("msgMantenimiento");
const estadoMantenimientoBox = document.getElementById("estadoMantenimientoBox");
const estadoMantenimientoIcono = document.getElementById("estadoMantenimientoIcono");
const estadoMantenimientoTexto = document.getElementById("estadoMantenimientoTexto");

async function cargarEstadoMantenimiento() {
  const estado = await obtenerEstadoMantenimiento();
  renderEstadoMantenimiento(estado);
}

function renderEstadoMantenimiento(estado) {
  if (estado.activo) {
    estadoMantenimientoBox.style.background = "rgba(227,93,93,0.12)";
    estadoMantenimientoBox.style.border = "1px solid var(--danger)";
    estadoMantenimientoIcono.textContent = "🛠️";
    let detalle = estado.motivo ? `Motivo: ${estado.motivo}` : "";
    if (estado.horario) detalle += (detalle ? " — " : "") + estado.horario;
    if (estado.activadoPorNombre) detalle += (detalle ? " — " : "") + "Activado por " + estado.activadoPorNombre;
    estadoMantenimientoTexto.textContent = "Mantenimiento ACTIVO" + (detalle ? " · " + detalle : "");
  } else {
    estadoMantenimientoBox.style.background = "rgba(76,175,125,0.12)";
    estadoMantenimientoBox.style.border = "1px solid var(--success)";
    estadoMantenimientoIcono.textContent = "✅";
    estadoMantenimientoTexto.textContent = "El sitio está funcionando normalmente";
  }
}

btnActivarMantenimiento.addEventListener("click", async () => {
  const motivo = mantMotivo.value.trim();
  if (!motivo) {
    mostrarMsgMantenimiento("Escribe un motivo (ej. Arreglar bugs).", "error");
    return;
  }

  btnActivarMantenimiento.disabled = true;
  try {
    await activarMantenimiento({
      motivo,
      horario: mantHorario.value.trim(),
      adminUid: adminActual.uid,
      adminNombre: adminActual.nombre
    });

    await registrarLog({
      tipo: "mantenimiento_activado",
      adminUid: adminActual.uid,
      adminNombre: adminActual.nombre,
      objetivoUid: null,
      objetivoNombre: "",
      detalle: motivo + (mantHorario.value.trim() ? " — " + mantHorario.value.trim() : "")
    });

    mostrarMsgMantenimiento("Modo mantenimiento activado.", "ok");
    cargarEstadoMantenimiento();
  } catch (err) {
    mostrarMsgMantenimiento("Error: " + err.message, "error");
  }
  btnActivarMantenimiento.disabled = false;
});

btnDesactivarMantenimiento.addEventListener("click", async () => {
  btnDesactivarMantenimiento.disabled = true;
  try {
    await desactivarMantenimiento();

    await registrarLog({
      tipo: "mantenimiento_desactivado",
      adminUid: adminActual.uid,
      adminNombre: adminActual.nombre,
      objetivoUid: null,
      objetivoNombre: "",
      detalle: "Mantenimiento desactivado"
    });

    mostrarMsgMantenimiento("Modo mantenimiento desactivado.", "ok");
    mantMotivo.value = "";
    mantHorario.value = "";
    cargarEstadoMantenimiento();
  } catch (err) {
    mostrarMsgMantenimiento("Error: " + err.message, "error");
  }
  btnDesactivarMantenimiento.disabled = false;
});

function mostrarMsgMantenimiento(texto, tipo) {
  msgMantenimiento.textContent = texto;
  msgMantenimiento.className = "msg " + tipo;
  msgMantenimiento.style.display = "block";
  setTimeout(() => { msgMantenimiento.style.display = "none"; }, 3500);
}
