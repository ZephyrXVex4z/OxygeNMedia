# OxygeNMedia

Red social comunitaria: perfiles con roles personalizables, sistema de amistades, chat privado y grupal en tiempo real, muro social con publicaciones/likes/comentarios/hashtags, recursos compartidos por la comunidad, juegos subidos por usuarios, un sistema de créditos digitales (Ox2) con transferencias y tarjetas de regalo, notificaciones push, temas visuales personalizables, y moderación con historial de acciones.

Construida como una PWA (instalable en el celular) con **HTML/CSS/JS puro** (sin frameworks, sin build step) sobre **Firebase** (Auth + Firestore), hosteada en **GitHub Pages**.

> **Nota sobre el enfoque del proyecto**: OxygeNMedia nació como una plataforma escolar de recursos con acceso controlado, y está evolucionando hacia una red social de propósito general. El registro **sigue siendo cerrado** (aprobación manual de cuentas) — ver [la sección de transición](#de-plataforma-escolar-a-red-social-transición-en-curso) para el detalle real de qué falta.

---

## Índice

1. [Stack y por qué](#stack-y-por-qué)
2. [De plataforma escolar a red social (transición en curso)](#de-plataforma-escolar-a-red-social-transición-en-curso)
3. [Cómo correr el proyecto](#cómo-correr-el-proyecto)
4. [Estructura de archivos](#estructura-de-archivos)
5. [Módulos compartidos](#módulos-compartidos-el-corazón-del-código)
6. [Colecciones de Firestore](#colecciones-de-firestore)
7. [Sistema de temas visuales](#sistema-de-temas-visuales)
8. [Notificaciones push (OneSignal)](#notificaciones-push-onesignal)
9. [El sistema de créditos Ox2, en detalle](#el-sistema-de-créditos-ox2-en-detalle)
10. [Cómo funciona la seguridad](#cómo-funciona-la-seguridad)
11. [Convenciones del proyecto](#convenciones-del-proyecto)
12. [Problemas conocidos y limitaciones](#problemas-conocidos-y-limitaciones)
13. [Cómo desplegar cambios](#cómo-desplegar-cambios)
14. [Roadmap](#roadmap)

---

## Stack y por qué

| Pieza | Qué usamos | Por qué |
|---|---|---|
| Frontend | HTML + CSS + JS vanilla, ES modules | Sin build step, cualquiera lo edita directo en GitHub o localmente, sin `npm install` |
| Hosting | GitHub Pages | Gratis, ya integrado con el repo |
| Backend | Firebase Auth + Firestore | Gratis en capa Spark, sin necesitar servidor propio |
| Storage de archivos | **No usamos Firebase Storage** | Activa el plan Blaze (pide tarjeta) incluso dentro de la capa gratuita. Las imágenes se referencian por URL externa (Imgur u otro hosting) |
| Notificaciones push | **OneSignal** (servicio externo gratuito) | Firebase Cloud Messaging con push real (sitio cerrado) requiere Cloud Functions → plan Blaze. OneSignal lo logra sin backend propio ni tarjeta |
| PWA | `manifest.json` + `service-worker.js` | Instalable en el celular sin pasar por Play Store / App Store |

**Importante**: no hay Cloud Functions ni backend propio corriendo código de servidor. Toda la lógica vive en el navegador del usuario, y la seguridad real la dan las **Firestore Security Rules** — no confíes nunca en validaciones que solo estén en el JS del cliente, ese código lo puede leer y manipular cualquiera.

---

## De plataforma escolar a red social (transición en curso)

### Hacia dónde va
- Registro **abierto**, sin depender de que un admin apruebe manualmente cada cuenta nueva
- Los "recursos" dejan de ser el centro de la experiencia y pasan a ser una función secundaria
- El perfil, el muro, las amistades y el chat son el corazón del producto

### Cómo está el código realmente ahora mismo
- **El registro sigue siendo cerrado**: toda cuenta nueva se crea con `aprobado: false` y necesita aprobación manual desde `admin.html` → "Usuarios pendientes". No se ha cambiado.
- **El Muro ya existe y funciona** (`muro.html`) — es la pieza social más importante construida hasta ahora: publicaciones con texto/imagen/cita de recursos, likes, comentarios, hashtags clickeables, repost, menciones @usuario, borrador automático, y feed general o solo-amigos.
- `index.html` (la página de entrada) sigue mostrando la lista de recursos como vista principal después de iniciar sesión — con el Muro ya construido, este sigue siendo el cambio pendiente más visible de la transición.
- Los "recursos" siguen siendo una pieza central del código (contenido protegido, compra con créditos, publicación por usuarios).

### Qué falta tocar para que el código refleje la nueva visión
1. **Abrir el registro**: tocar `registrarUsuario` en `auth.js` y las reglas de Firestore que verifican `aprobado == true` en casi todas las colecciones.
2. **Cambiar la pantalla de entrada**: que `index.html` muestre el Muro o el perfil en vez de la lista de recursos al iniciar sesión.
3. Seguir integrando recursos como una sección más del menú, no como la razón de ser del sitio.

---

## Cómo correr el proyecto

No hay entorno de desarrollo local tradicional:

1. Editar archivos directo (en GitHub web, o localmente y luego subir)
2. Subir los `.html`/`.js` modificados a la raíz del repo (GitHub Pages sirve desde `/ (root)`)
3. Si se tocaron `firestore.rules`: copiar y pegar su contenido en **Firebase Console → Firestore Database → Reglas → Publicar** (no hay CLI/terminal disponible en el flujo de trabajo actual)
4. Probar en `https://zephyrxvex4z.github.io/OxygeNMedia/`

No hay `npm run dev` ni servidor local — se prueba directo contra el Firebase de producción.

### Firebase del proyecto
- Proyecto: `workwebschool-5646f`
- `firebase-config.js` contiene el `apiKey` público (no es secreto, la seguridad la dan las Firestore Rules)

### OneSignal del proyecto (push)
- App ID y REST API Key viven en `push.js` — ver la sección de [notificaciones push](#notificaciones-push-onesignal) para el aviso de seguridad correspondiente

---

## Estructura de archivos

```
firebase-config.js       → inicializa Firebase, exporta `auth` y `db`
auth.js                  → login, registro, sesión, caché de perfil, restablecer contraseña, cuentaBloqueada()
notificaciones.js        → crear/escuchar notificaciones (campanita) + dispara push automáticamente
amistades.js             → enviar/aceptar/rechazar solicitudes de amistad
logs.js                  → registrar y leer el historial de moderación
wallet.js                → créditos Ox2: saldo, transferencias, compras, tarjetas de regalo
muro.js                  → publicaciones, likes, comentarios, hashtags, menciones, repost
push.js                  → notificaciones push reales vía OneSignal
temas.js                 → definición de los 5 temas visuales + lógica de aplicar/guardar
tema-inline.js            → script anti-flash de tema, se carga en el <head> de cada página
actualizaciones.js        → registro de novedades/changelog publicado por admins

index.html + app.js       → página de entrada: login/registro, lista de recursos, drawer de navegación
admin.html + admin.js     → panel de administración (todas las pestañas de moderación)
muro.html + muro-app.js   → el muro social: feed, publicar, likes, comentarios, hashtags, repost
chat.html + chat.js       → chat privado y grupal en tiempo real, con edición/borrado de mensajes
perfil.html + perfil.js   → editar el propio perfil (nombre, @, foto, bio, roles)
ver-perfil.html + .js     → buscar y ver el perfil de otros, enviar solicitud de amistad
amigos.html + amigos.js   → lista de amigos aceptados
solicitudes.html + .js    → solicitudes de amistad recibidas/enviadas
billetera.html + .js      → saldo, transferencias, canjear tarjetas de regalo, historial
comprar-giftcard.html/.js → vitrina de tarjetas de regalo Ox2, compra vía WhatsApp
novedades.html + .js      → página pública del registro de actualizaciones
juegos.html + juegos.js   → subir/jugar juegos HTML de la comunidad (sandbox)
sugerencias.html + .js    → foro de sugerencias (con opción de anónimo)
publicar-recurso.html/.js → formulario para que cualquier usuario publique un recurso GRATIS
mis-recursos.html + .js   → editar/borrar los recursos que un usuario normal publicó
terminos.html              → términos y condiciones (cuenta, créditos, tarjetas, conducta, privacidad)

manifest.json              → metadata de la PWA
service-worker.js          → cachea archivos estáticos
OneSignalSDKWorker.js       → service worker requerido por OneSignal para push
icon-192.png, icon-512.png → íconos de la app
giftcard-5/10/20/50.png     → imágenes de las 4 denominaciones de tarjetas de regalo

firestore.rules             → reglas de seguridad (fuente de verdad de qué puede hacer quién)
firestore.indexes.json      → índices compuestos necesarios (documentación; se crean a mano en consola)
firebase.json                → config de Firebase Hosting (no se usa activamente, se usa GitHub Pages)
```

---

## Módulos compartidos (el corazón del código)

### `auth.js`
- `observarSesion(callback)` — patrón que usa **cada página** para saber quién está logueado. Cachea el perfil en `sessionStorage` para que cambiar de página no tarde esperando ida y vuelta a Firestore.
- `cuentaBloqueada(perfil)` — decide si una cuenta debe tratarse como bloqueada (no aprobada, o suspendida y sin vencer). Punto exacto a tocar si se abre el registro.
- `registrarUsuario`, `iniciarSesion`, `cerrarSesion`, `enviarCorreoRestablecer`.

### `wallet.js`
Todo el sistema de créditos Ox2. Usa `runTransaction` para que las operaciones de dinero sean atómicas. Funciones: `obtenerSaldo`, `transferirCredito`, `adminAjustarSaldo`, `comprarRecursoConSaldo`, `obtenerHistorial`, `crearTarjetaRegalo`, `canjearTarjetaRegalo`, `listarTarjetasRegalo`.

### `muro.js`
El feed social. `crearPublicacion` extrae automáticamente hashtags (`#tema`) y menciones (`@usuario`) del texto y dispara notificaciones a quien corresponda. `obtenerFeed` soporta paginación por cursor y filtro por hashtag o por lista de UIDs (para el feed "solo amigos"). `alternarLike` y `agregarComentario` mantienen contadores desnormalizados en el documento del post vía transacción.

### `push.js`
Envuelve el SDK web de OneSignal: `inicializarPush()` (carga el SDK), `pedirPermisoYVincular(uid)` (debe llamarse desde un click real del usuario), `enviarPush(uid, titulo, mensaje, url)`. Ver la sección dedicada más abajo para el aviso de seguridad de la REST API Key.

### `notificaciones.js` / `amistades.js` / `logs.js` / `actualizaciones.js`
Módulos pequeños y enfocados, cada uno con su propia colección de Firestore.

---

## Colecciones de Firestore

| Colección | Qué guarda | Quién escribe |
|---|---|---|
| `usuarios/{uid}` | Perfil: nombre, email, rol, aprobado, suspendido, saldo, username, fotoURL, descripción, rolesPerfil, recursosComprados | El propio usuario (campos no sensibles), el admin (todo) |
| `recursos/{id}` + `contenidoProtegido/data` | Contenido compartido, con el contenido real en subcolección separada para que nunca llegue a quien no pagó | Admin (cualquier precio), usuario normal (solo gratis) |
| `chats/{id}` + `mensajes/{id}` | Chats privados/grupales, mensajes editables/eliminables | Miembros del chat |
| `publicaciones/{id}` + `likes/{uid}` + `comentarios/{id}` | El muro social: posts, likes, comentarios | Cualquier aprobado; likes solo el propio uid |
| `sugerencias/{id}` | Foro de sugerencias, con autor opcionalmente anónimo | Cualquier aprobado (crear), admin (borrar) |
| `juegos/{id}` | Juegos HTML subidos, el HTML completo como texto | Admin (auto-aprobado), usuario normal (queda pendiente) |
| `rolesDisponibles/{id}` | Roles de perfil propuestos por usuarios, aprobados por admin | Usuario (proponer), admin (aprobar) |
| `notificaciones/{id}` | Notificaciones por usuario (campanita + dispara push) | Quien la origina |
| `amistades/{uidA_uidB}` | Relación de amistad, ID determinístico | Ambas partes involucradas |
| `transacciones/{id}` | Historial de todo movimiento de dinero, inmutable | Quien envía, admin (ajustes) |
| `tarjetasRegalo/{codigo}` | Tarjetas de regalo, el código ES el ID del documento | Admin (crear), cualquier aprobado (canjear una vez) |
| `logs/{id}` | Historial de acciones de moderación, solo lectura admin | Admin |
| `actualizaciones/{id}` | Registro de novedades publicado por admins | Admin |

---

## Sistema de temas visuales

Cinco temas completos (colores + tipografías): **Terminal** (verde fósforo, monoespaciada), **Neobrutal** (bordes gruesos, sombras duras), **Editorial** (serif, papel crema), **Aurora** (glassmorphism, nocturno), **Minimal** (blanco y negro).

- El usuario elige su tema desde el drawer en `index.html` (único lugar con el selector visual completo, vía `temas.js`)
- La preferencia se guarda en `localStorage` (persiste entre sesiones y cierres de navegador)
- **Cada página** carga `tema-inline.js` de forma síncrona en el `<head>`, antes de pintar nada, para aplicar el tema guardado sin parpadeo del tema por defecto
- `tema-inline.js` debe mantenerse sincronizado a mano con `temas.js` si se agrega o edita un tema — son dos copias de los mismos datos por razones de rendimiento (una completa con lógica, otra mínima y síncrona)

---

## Notificaciones push (OneSignal)

Cada vez que se crea una notificación interna (`crearNotificacion` en `notificaciones.js`), también se dispara un push real vía OneSignal — llega aunque el usuario tenga el sitio cerrado.

- El usuario debe activar el permiso una vez desde el drawer ("🔔 Activar notificaciones push"), que llama `pedirPermisoYVincular(uid)` y asocia su navegador con su UID de Firebase (`OneSignal.login(uid)`)
- El envío (`enviarPush`) llama directo a la REST API de OneSignal desde el navegador de quien origina la acción — no hay backend intermediario

### Aviso de seguridad importante
La **REST API Key** de OneSignal vive expuesta en `push.js` porque no hay backend que la esconda. Esa clave permite enviar notificaciones a cualquier usuario de la app de OneSignal — cualquiera que revise el código fuente del sitio puede copiarla y usarla para mandar notificaciones push arbitrarias. Es una limitación aceptada de no tener servidor propio. **Si algo raro pasa** (notificaciones que tú no enviaste), ve a OneSignal → Settings → Keys & IDs → regenera la REST API Key y actualízala en `push.js`.

---

## El sistema de créditos Ox2, en detalle

- El admin da/quita saldo manualmente (`adminAjustarSaldo`) cuando alguien paga en efectivo, transferencia, Bitcoin u otra cripto
- Los usuarios se transfieren crédito entre ellos (`transferirCredito`)
- Comprar un recurso de pago con saldo lo descuenta y desbloquea al instante (`comprarRecursoConSaldo`)
- **Tarjetas de regalo**: el admin genera un código único (`crearTarjetaRegalo`, formato `OXY-XXXX-XXXX`, sin caracteres ambiguos como 0/O o 1/I), lo entrega a quien pagó, y esa persona lo canjea desde `billetera.html` (`canjearTarjetaRegalo`) — el código es el ID del documento, así que un mismo código nunca puede existir duplicado, y la regla de Firestore exige `canjeada == false` antes de permitir el canje
- `comprar-giftcard.html` es la vitrina pública: muestra las 4 denominaciones ($5/$10/$20/$50 USD → 200/400/800/2000 Ox2, todas con 5% de bono) y cada botón "Comprar" abre WhatsApp con un mensaje prellenado específico para esa denominación
- Todo movimiento queda en `transacciones`, colección de solo-agregar que nadie edita ni borra

### Limitación de seguridad honesta
Sin Cloud Functions, Firestore Rules no puede verificar matemáticamente que una transferencia P2P sea atómica entre dos documentos distintos — cada documento se evalúa de forma independiente. El diseño actual permite a cualquiera restar de su propio saldo (nunca queda negativo) y sumar al saldo de otro (para recibir transferencias/tarjetas), dejando rastro completo en `transacciones` con el UID de quien originó cada movimiento. No es explotable por accidente, y cualquier abuso sería detectable y revertible manualmente. La solución "perfecta" requiere Cloud Functions (plan Blaze).

---

## Cómo funciona la seguridad

**Regla de oro**: el JS del cliente decide qué *mostrar*, las **Firestore Rules** deciden qué está *permitido*.

### Patrón repetido en casi todas las reglas
```javascript
function esAprobadoUsuario() {
  return request.auth != null &&
         get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.aprobado == true;
}
function esAdminUsuario() {
  return request.auth != null &&
         get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.rol == "admin";
}
```
Se repite dentro de cada bloque `match` (no se comparte entre bloques en este formato). Si cambia la lógica de "qué es un admin" o "qué significa tener acceso" (relevante para abrir el registro), hay que tocarla en cada bloque — búscala con `grep -n "esAprobadoUsuario\|esAdminUsuario"` en `firestore.rules`.

### Errores de "Missing or insufficient permissions" — causas típicas ya vividas
1. **Falta un índice compuesto** (`where` + `orderBy` combinados). El error trae un link que lo crea con un clic; espera 1-5 min a que diga "Enabled". No hay CLI disponible, se crean a mano en consola cada vez.
2. **Reglas no publicadas** — subir a GitHub no toca Firestore, son sistemas separados.
3. **`resource.data` es `null` en un `create`** — usar `!exists(...)` explícito al verificar si un documento inexistente se puede leer (ej. amistades antes de crearse).
4. **HTML y JS desincronizados** — si el `.js` espera un elemento que no existe en la versión del `.html` que está en línea, el script entero se rompe desde esa línea. Archivos que dependen entre sí deben subirse **todos juntos**.

---

## Convenciones del proyecto

- **Idioma**: todo el código (variables, comentarios, colecciones de Firestore) en español.
- **Estilo visual**: variables CSS de tema en cada `<style>` — `--bg`, `--card`, `--border`, `--accent`, `--accent-hover`, `--text`, `--text-dim`, `--success`, `--danger`, `--warn`, `--radius`, `--card-shadow`, `--input-bg`, `--font-display`, `--font-body`, `--font-weight-heading`. Los 5 temas de `temas.js` sobreescriben todas estas.
- **Imágenes**: URL externa (Imgur con link `i.imgur.com/...`) para contenido de usuario. Las imágenes de gift cards son la única excepción — se suben directo al repo (`giftcard-5.png`, etc.) porque son activos fijos del sitio, no contenido de usuario.
- **Layout mobile-first fijo**: páginas tipo dashboard (`index.html`, `admin.html`, `chat.html`, `muro.html`) usan `height: 100dvh` + `overflow: hidden` + `.content-area` interno con scroll. Páginas tipo formulario usan scroll normal de página completa.
- **Menú de navegación**: drawer lateral (`☰`) en `index.html`, array `links` en su script. Cualquier página nueva de uso general va ahí.
- **Confirmaciones destructivas**: `confirm()` nativo antes de cualquier borrado.

---

## Problemas conocidos y limitaciones

- **La campanita de notificaciones** puede necesitar un índice compuesto (`notificaciones`: `paraUid` + `fecha`) si nunca se creó manualmente — `solicitudes.html` fue construida a propósito sin depender de él (ordena en JS) como alternativa confiable.
- **`index.html` sigue mostrando recursos como pantalla principal**, no el Muro — pendiente de la transición a red social.
- **No hay dashboard de métricas** para el admin (usuarios activos, dinero circulante, contenido más popular).
- **La REST API Key de OneSignal está expuesta** en el frontend — ver la sección de push para el detalle y qué hacer si se abusa.
- **Los juegos corren en `<iframe sandbox="allow-scripts">`** — sin revisión automática, la aprobación de juegos de usuarios normales depende del criterio del admin (hay botón "Probar" antes de aprobar).
- **Sin backend real**: verificación de pagos externos, correos personalizados, o cron jobs no son posibles sin Cloud Functions o un servicio externo.

---

## Cómo desplegar cambios

1. Edita el/los archivo(s) necesario(s).
2. Si tocaste `firestore.rules`: pégalo completo en Firebase Console → Firestore → Reglas → Publicar.
3. Si agregaste una query con `where` + `orderBy` combinados: prepárate para crear un índice la primera vez que se use.
4. Sube los archivos modificados a la raíz del repo, **todos los que dependen entre sí juntos**.
5. Espera 1-2 min de propagación de GitHub Pages.
6. Prueba con `Ctrl+Shift+R` (recarga forzada sin caché).

---

## Roadmap

### Transición a red social (prioridad actual)
- Abrir el registro (quitar o hacer opcional la aprobación manual)
- Rediseñar `index.html` para que el centro sea el Muro/perfil, no la lista de recursos

### Ideas pendientes
- Dashboard de estadísticas para el admin
- Notificaciones automáticas para más eventos (contenido aprobado, juego aprobado, rol aprobado) — `notificaciones.js` ya soporta cualquier tipo
- Avisar al usuario cuando se aprueba su cuenta
- Búsqueda de mensajes dentro de un chat
- Mover la lógica de transferencias/tarjetas a Cloud Functions si el proyecto crece (cerraría la limitación de seguridad del wallet)

---

## Preguntas frecuentes

**¿Por qué no hay `npm install` ni build?**
ES modules nativos + SDKs de Firebase vía CDN. Sin bundler ni paso de compilación, intencionalmente.

**¿Dónde está la API key secreta de Firebase?**
No existe — el `apiKey` en `firebase-config.js` es público por diseño de Firebase.

**¿Por qué no usamos Firebase Storage?**
Pide tarjeta (plan Blaze) aunque el uso se quede en la capa gratuita. Se usan URLs externas en su lugar.

**¿Por qué OneSignal y no Firebase Cloud Messaging directo?**
FCM con push real (sitio cerrado) necesita algo que dispare el envío del lado del servidor — normalmente una Cloud Function. OneSignal permite enviar directo desde el cliente vía su REST API, sin backend propio, aceptando el riesgo de exponer la REST API Key (ver sección de push).

**Encontré `esAdminUsuario()` repetida muchas veces en `firestore.rules`, ¿es un error?**
No — las reglas de Firestore no comparten funciones entre bloques `match` en este formato. Es intencional.
