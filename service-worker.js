// service-worker.js
// Cachea los archivos estáticos del sitio para que cargue rápido y sea instalable como PWA.
// Los datos de Firebase (Auth, Firestore) siempre requieren internet, esto no los afecta.

const CACHE_NAME = "ayuda-escolar-v1";
const ARCHIVOS_ESTATICOS = [
  "./index.html",
  "./admin.html",
  "./chat.html",
  "./app.js",
  "./admin.js",
  "./chat.js",
  "./auth.js",
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
// si falla (sin internet), usa lo que haya en caché
self.addEventListener("fetch", (event) => {
  // No interceptar llamadas a Firebase/Google — esas siempre deben ir directo a la red
  if (event.request.url.includes("firestore.googleapis.com") ||
      event.request.url.includes("googleapis.com") ||
      event.request.url.includes("gstatic.com")) {
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
