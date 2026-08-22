// publicar-recurso.js
// Permite a cualquier usuario aprobado publicar un recurso GRATIS.
// El admin sigue usando admin.html para recursos de paga o edición avanzada.

import { db } from "./firebase-config.js";
import { observarSesion, cuentaBloqueada } from "./auth.js";
import { iniciarAyudaImagen } from "./ayuda-imagen.js";
import {
  collection, doc, addDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let usuarioActual = null;

const rTitulo = document.getElementById("rTitulo");
const rDescripcion = document.getElementById("rDescripcion");
const rContenido = document.getElementById("rContenido");
const rCategoria = document.getElementById("rCategoria");
const rImagenURL = document.getElementById("rImagenURL");
const btnPublicar = document.getElementById("btnPublicar");
const msg = document.getElementById("msg");

observarSesion((user, perfil) => {
  if (!user || cuentaBloqueada(perfil).bloqueada) {
    document.body.innerHTML = "<div style='padding:60px;text-align:center;color:#8b96b0;'>Debes iniciar sesión y estar aprobado para publicar recursos. <br><br><a href='index.html' style='color:#5b8def;'>Volver al sitio</a></div>";
    return;
  }
  usuarioActual = { uid: user.uid, ...perfil };
  iniciarAyudaImagen();
});

btnPublicar.addEventListener("click", async () => {
  const titulo = rTitulo.value.trim();
  const contenido = rContenido.value.trim();

  if (!titulo) { mostrarMsg("Ponle un título al recurso.", "error"); return; }
  if (!contenido) { mostrarMsg("Escribe el contenido del recurso.", "error"); return; }

  btnPublicar.disabled = true;
  try {
    const dataPublica = {
      titulo: titulo,
      descripcion: rDescripcion.value.trim(),
      categoria: rCategoria.value.trim() || "General",
      precio: 0,
      imagenURL: rImagenURL.value.trim(),
      esGratis: true,
      esPublico: false,
      visible: true,
      subidoPor: usuarioActual.uid,
      subidoPorNombre: usuarioActual.nombre,
      fechaSubida: serverTimestamp(),
      compradoPor: []
    };

    const ref = await addDoc(collection(db, "recursos"), dataPublica);
    await setDoc(doc(db, "recursos", ref.id, "contenidoProtegido", "data"), {
      contenido: contenido,
      imagenContenidoURL: ""
    });

    mostrarMsg("¡Recurso publicado! Redirigiendo...", "ok");
    setTimeout(() => { location.href = "index.html"; }, 1200);
  } catch (err) {
    mostrarMsg("Error al publicar: " + err.message, "error");
    btnPublicar.disabled = false;
  }
});

function mostrarMsg(texto, tipo) {
  msg.textContent = texto;
  msg.className = "msg " + tipo;
}
