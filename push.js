// push.js
// Notificaciones push reales (funcionan con el sitio cerrado) vía OneSignal.
// OneSignal es un servicio externo gratuito -- no requiere tarjeta ni backend propio.
//
// AVISO DE SEGURIDAD: la REST API Key de abajo permite enviar notificaciones a
// cualquier usuario de esta app de OneSignal. Como este proyecto no tiene backend,
// queda expuesta en el navegador de cualquiera que revise el código fuente. Es una
// limitación aceptada de no tener servidor propio -- si algo raro pasa, regenera la
// key en OneSignal (Settings -> Keys & IDs) y actualízala aquí.

const ONESIGNAL_APP_ID = "cb721455-611e-4ad4-8d26-27e3fd2f50ef";
const ONESIGNAL_REST_API_KEY = "k5riko3t5ux6vjeybz4lqw3ie";

let inicializado = false;

// Se llama una vez por página que quiera usar push (pedir permiso o enviar).
export function inicializarPush() {
  if (inicializado) return;
  inicializado = true;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  const script = document.createElement("script");
  script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  script.defer = true;
  document.head.appendChild(script);

  window.OneSignalDeferred.push(async function (OneSignal) {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true
    });
  });
}

// Pide permiso de notificaciones y vincula este navegador con el uid de Firebase.
// Debe llamarse desde un click real del usuario (los navegadores bloquean pedir
// permiso automáticamente sin interacción).
export function pedirPermisoYVincular(uid) {
  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.Notifications.requestPermission();
        const permitido = OneSignal.Notifications.permission;
        if (permitido) {
          await OneSignal.login(uid);
        }
        resolve(!!permitido);
      } catch (e) {
        resolve(false);
      }
    });
  });
}

// Revisa si el navegador actual ya tiene permiso y está vinculado
export function tienePermisoPush() {
  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function (OneSignal) {
      resolve(!!OneSignal.Notifications.permission);
    });
  });
}

// Envía una notificación push real a un usuario específico por su uid de Firebase
// (ya vinculado antes con pedirPermisoYVincular). Se llama desde el navegador de
// quien origina la acción (dar like, comentar, etc.) usando la REST API directo.
export async function enviarPush(uidDestino, titulo, mensaje, url) {
  try {
    await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": "Basic " + ONESIGNAL_REST_API_KEY
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: [uidDestino] },
        target_channel: "push",
        headings: { en: titulo, es: titulo },
        contents: { en: mensaje, es: mensaje },
        url: url || (location.origin + "/index.html")
      })
    });
  } catch (e) {
    console.warn("No se pudo enviar la notificación push:", e);
  }
}

