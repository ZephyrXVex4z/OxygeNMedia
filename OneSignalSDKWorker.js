// OneSignalSDKWorker.js
// Service worker ÚNICO del sitio: además de traer el SDK de OneSignal (necesario para
// que las notificaciones push lleguen con el sitio cerrado), también cachea los
// archivos estáticos para que la PWA cargue rápido y funcione sin internet.
//
// Antes había DOS service workers separados (este, y un service-worker.js aparte que
// registraban index.html/muro.html). Dos service workers distintos no pueden controlar
// la misma raíz del sitio a la vez: el navegador solo deja activo al que se registró
// más recientemente, y como service-worker.js se registraba en el evento "load" de la
// página (después de que OneSignal ya había intentado registrar el suyo), terminaba
// ganando service-worker.js y las push dejaban de llegar con la pestaña cerrada. Debe
// vivir en la raíz del sitio con este nombre exacto -- OneSignal lo registra
// automáticamente al inicializar.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js");

const CACHE_NAME = "oxygenmedia-v1";
const ARCHIVOS_ESTATICOS = [
  "./index.html",
  "./muro.html",
  "./admin.html",
  "./chat.html",
  "./app.js",
  "./admin.js",
  "./chat.js",
  "./auth.js",
  "./muro-app.js",
  "./firebase-config.js",
  "./manifest.json"
];

// Al instalar, guarda los archivos estáticos en caché
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_ESTATICOS))
  );
  self.skipWaiting();
});

// Al activar, borra cachés viejas de versiones anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: intenta red primero (para tener siempre datos frescos),
// si falla (sin internet), usa lo que haya en caché.
// IMPORTANTE: solo intercepta peticiones GET normales del sitio — las peticiones de
// OneSignal (notificaciones push) y de Firebase siguen su propio camino sin pasar
// por esta caché, para no interferir con el SDK importado arriba.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = event.request.url;
  if (url.includes("firestore.googleapis.com") ||
      url.includes("googleapis.com") ||
      url.includes("gstatic.com") ||
      url.includes("onesignal.com")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});


