# OxygeNMedia

Red social comunitaria: perfiles con roles personalizables, sistema de amistades, chat privado y grupal en tiempo real, muro de recursos compartidos por la comunidad, juegos subidos por usuarios, créditos digitales internos, y moderación con historial de acciones.

Construida como una PWA (instalable en el celular) con **HTML/CSS/JS puro** (sin frameworks, sin build step) sobre **Firebase** (Auth + Firestore), hosteada en **GitHub Pages**.

> **Nota sobre el enfoque del proyecto**: OxygeNMedia nació como una plataforma escolar de recursos con acceso controlado, y está evolucionando hacia una red social de propósito general. Esta transición está **en progreso** — el código actual todavía refleja varias decisiones del enfoque anterior (aprobación manual de cuentas, recursos con contenido de pago como pieza central). Ver la sección [De plataforma escolar a red social](#de-plataforma-escolar-a-red-social-transición-en-curso) para el estado real de esa migración.

---

## Índice

1. [Stack y por qué](#stack-y-por-qué)
2. [De plataforma escolar a red social (transición en curso)](#de-plataforma-escolar-a-red-social-transición-en-curso)
3. [Cómo correr el proyecto](#cómo-correr-el-proyecto)
4. [Estructura de archivos](#estructura-de-archivos)
5. [Módulos compartidos](#módulos-compartidos-el-corazón-del-código)
6. [Colecciones de Firestore](#colecciones-de-firestore)
7. [Cómo funciona la seguridad](#cómo-funciona-la-seguridad)
8. [El sistema de créditos, en detalle](#el-sistema-de-créditos-en-detalle)
9. [Convenciones del proyecto](#convenciones-del-proyecto)
10. [Problemas conocidos y limitaciones](#problemas-conocidos-y-limitaciones)
11. [Cómo desplegar cambios](#cómo-desplegar-cambios)
12. [Roadmap](#roadmap)

---

## Stack y por qué

| Pieza | Qué usamos | Por qué |
|---|---|---|
| Frontend | HTML + CSS + JS vanilla, ES modules | Sin build step, cualquiera lo edita directo en GitHub o localmente, sin `npm install` |
| Hosting | GitHub Pages | Gratis, ya integrado con el repo |
| Backend | Firebase Auth + Firestore | Gratis en capa Spark, sin necesitar servidor propio |
| Storage de archivos | **No usamos Firebase Storage** | Activa el plan Blaze (pide tarjeta) incluso dentro de la capa gratuita. En su lugar, las imágenes se referencian por URL externa (Imgur u otro hosting de imágenes) |
| PWA | `manifest.json` + `service-worker.js` | Instalable en el celular sin pasar por Play Store / App Store |

**Importante**: no hay Cloud Functions ni backend propio corriendo código de servidor. Toda la lógica vive en el navegador del usuario, y la seguridad real la dan las **Firestore Security Rules** — no confíes nunca en validaciones que solo estén en el JS del cliente, ese código lo puede leer y manipular cualquiera.

---

## De plataforma escolar a red social (transición en curso)

El proyecto está migrando de enfoque. Esta sección existe para que cualquiera que llegue nuevo sepa qué es visión y qué es realidad **hoy**.

### Hacia dónde va
- Registro **abierto**, sin depender de que un admin apruebe manualmente cada cuenta nueva
- Los "recursos" (contenido con precio, aprobación de contenido) dejan de ser el centro de la experiencia y pasan a ser una función secundaria/opcional
- El perfil, el muro social, las amistades y el chat pasan a ser el corazón del producto

### Cómo está el código realmente ahora mismo
- **El registro sigue siendo cerrado**: toda cuenta nueva se crea con `aprobado: false` y necesita que un admin la apruebe manualmente desde el panel (`admin.html` → pestaña "Usuarios pendientes"). Esto **no se ha cambiado todavía**.
- **Los recursos siguen siendo una pieza central del código**: `recursos/{id}` + su subcolección protegida, el sistema de compra con créditos, y varias páginas (`publicar-recurso.html`, `mis-recursos.html`) están construidas alrededor de esto.
- Las piezas de red social (`perfil.html`, `amigos.html`, `ver-perfil.html`, `chat.html`, `billetera.html`) ya existen y funcionan de forma independiente a los recursos — no dependen unas de otras, así que sí se puede usar el sitio como red social hoy, con recursos simplemente como una sección más dentro del menú.

### Qué falta tocar para que el código refleje la nueva visión
Ninguno de estos cambios está hecho todavía — quedan documentados aquí para quien continúe el trabajo:

1. **Abrir el registro**: decidir si se elimina la aprobación manual por completo, o se deja como opción configurable. Afecta la función `registrarUsuario` en `auth.js` y varias reglas de Firestore que hoy verifican `aprobado == true` como condición de acceso a casi todo (chat, perfiles, amistades, sugerencias, juegos) — si se abre el registro, hay que decidir si esas reglas pasan a verificar solo "tiene sesión iniciada" en vez de "está aprobado".
2. **Bajarle prioridad a "recursos"** en la navegación: hoy `index.html` (la página de entrada) muestra la lista de recursos como vista principal después de iniciar sesión. Si el nuevo centro es el perfil/muro social, esa pantalla de entrada debería cambiar.
3. Posiblemente agregar un **muro/feed** de publicaciones tipo red social (hoy no existe — lo que más se le parece es el foro de `sugerencias.html`, que no fue diseñado para eso).

---

## Cómo correr el proyecto

No hay entorno de desarrollo local tradicional. El flujo de trabajo real de este proyecto es:

1. Editar archivos directo (en GitHub web, o localmente y luego subir)
2. Subir los `.html`/`.js` modificados a la raíz del repo de GitHub (GitHub Pages sirve desde `/ (root)`, no desde `/public`)
3. Si se tocaron las reglas de Firestore (`firestore.rules`), copiar y pegar su contenido en **Firebase Console → Firestore Database → Reglas → Publicar** (no hay CLI/terminal disponible en el flujo de trabajo actual, así que esto se hace manualmente cada vez)
4. Probar en `https://<usuario>.github.io/<repo>/`

No hay `npm run dev` ni servidor local — se prueba directo contra el Firebase de producción. Ten cuidado al probar cosas destructivas (borrar usuarios, etc.).

### Firebase del proyecto

- Proyecto: `workwebschool-5646f`
- La configuración (`apiKey`, etc.) vive en `firebase-config.js` — **no es secreta**, está diseñada para ir pública en el frontend. La seguridad real la dan las Firestore Rules, no esa clave.

---

## Estructura de archivos

Cada "sección" del sitio es un par `.html` + `.js` independiente (páginas multi-archivo clásicas, no SPA):

```
firebase-config.js       → inicializa Firebase, exporta `auth` y `db`. Todo lo demás importa de aquí.
auth.js                  → login, registro, sesión, caché de perfil, restablecer contraseña
notificaciones.js        → crear/escuchar notificaciones (campanita)
amistades.js             → enviar/aceptar/rechazar solicitudes de amistad
logs.js                  → registrar y leer el historial de moderación
wallet.js                → todo el sistema de créditos: saldo, transferencias, compras

index.html + app.js      → página de entrada: login/registro, lista de recursos, drawer de navegación
                            (candidata a rediseño una vez que el enfoque de red social avance — ver roadmap)
admin.html + admin.js    → panel de administración (todas las pestañas de moderación)
chat.html + chat.js      → chat privado y grupal en tiempo real — pieza central del enfoque social
perfil.html + perfil.js  → editar el propio perfil (nombre, @, foto, bio, roles) — pieza central del enfoque social
ver-perfil.html + .js    → buscar y ver el perfil de otros, enviar solicitud de amistad
amigos.html + amigos.js  → lista de amigos aceptados
solicitudes.html + .js   → solicitudes de amistad recibidas/enviadas (vista dedicada, sin depender de índices)
billetera.html + .js     → saldo propio, transferencias, historial de movimientos
juegos.html + juegos.js  → subir/jugar juegos HTML de la comunidad (sandbox)
sugerencias.html + .js   → foro de sugerencias (con opción de anónimo)
publicar-recurso.html/.js → formulario simplificado para que cualquier usuario publique un recurso GRATIS
mis-recursos.html + .js  → editar/borrar los recursos que un usuario normal publicó

manifest.json             → metadata de la PWA (nombre, íconos, colores)
service-worker.js         → cachea archivos estáticos para carga rápida / soporte offline parcial
icon-192.png, icon-512.png → íconos de la app

firestore.rules            → reglas de seguridad (fuente de verdad de qué puede hacer quién)
firestore.indexes.json     → índices compuestos necesarios (documentación; hay que crearlos a mano en consola)
firebase.json               → config de Firebase Hosting (no se usa activamente, se usa GitHub Pages)
```

---

## Módulos compartidos (el corazón del código)

Estos archivos no tienen HTML propio — los importa cualquier página que los necesite. Si vas a tocar lógica de negocio, probablemente está aquí:

### `auth.js`
- `observarSesion(callback)` — el patrón que usa **cada página** para saber quién está logueado. Cachea el perfil en `sessionStorage` para que cambiar de página no tarde 3-5 segundos esperando ida y vuelta a Firestore cada vez.
- `cuentaBloqueada(perfil)` — decide si una cuenta debe tratarse como bloqueada (no aprobada, o suspendida y la suspensión no venció). Se usa al inicio de cada página protegida. **Este es el punto exacto que hay que tocar si se abre el registro** — hoy "no aprobada" cuenta como bloqueada.
- `registrarUsuario`, `iniciarSesion`, `cerrarSesion`, `enviarCorreoRestablecer`.

### `wallet.js`
Todo el sistema de créditos. Usa `runTransaction` de Firestore para que las operaciones de dinero sean atómicas (o pasan completas, o no pasan). Funciones: `obtenerSaldo`, `transferirCredito`, `adminAjustarSaldo`, `comprarRecursoConSaldo`, `obtenerHistorial`.

### `notificaciones.js` / `amistades.js` / `logs.js`
Módulos pequeños y enfocados, cada uno con su propia colección de Firestore. Se importan donde haga falta.

---

## Colecciones de Firestore

| Colección | Qué guarda | Quién escribe |
|---|---|---|
| `usuarios/{uid}` | Perfil completo: nombre, email, rol, aprobado, suspendido, saldo, username, fotoURL, descripción, rolesPerfil, recursosComprados | El propio usuario (campos no sensibles), el admin (todo) |
| `recursos/{id}` | Contenido compartido por la comunidad (datos públicos: título, precio, categoría, etc.) | Admin (cualquier precio), usuario normal (solo gratis) |
| `recursos/{id}/contenidoProtegido/data` | El contenido real (texto + imagen) — **subcolección separada a propósito**, con sus propias reglas, para que el contenido de pago nunca llegue al navegador de quien no pagó | Autor del recurso, admin |
| `chats/{id}` + `chats/{id}/mensajes/{id}` | Chats privados y grupales, con mensajes editables/eliminables | Miembros del chat |
| `sugerencias/{id}` | Foro de sugerencias, con opción de autor anónimo | Cualquier aprobado (crear), admin (borrar/marcar revisada) |
| `juegos/{id}` | Juegos HTML subidos, con el HTML completo guardado como texto | Admin (auto-aprobado), usuario normal (queda pendiente) |
| `rolesDisponibles/{id}` | Roles de perfil (ej. "Matemático"), propuestos por usuarios, aprobados por admin | Usuario (proponer), admin (aprobar) |
| `notificaciones/{id}` | Notificaciones por usuario (campanita) | Quien la origina, para el destinatario |
| `amistades/{uidA_uidB}` | Relación de amistad, ID determinístico (los dos UIDs ordenados y unidos) | Ambas partes involucradas |
| `transacciones/{id}` | Historial de todo movimiento de dinero — nunca se edita ni borra | Quien envía (transferencia), admin (ajustes) |
| `logs/{id}` | Historial de acciones de moderación (suspensiones, etc.) — solo lectura para admins, nadie lo edita/borra | Admin |

---

## Cómo funciona la seguridad

**Regla de oro del proyecto**: el JavaScript del cliente decide qué *mostrar*, pero las **Firestore Rules** deciden qué está *permitido*. Cualquier validación que solo exista en el `.js` (ej. "este botón está deshabilitado") es únicamente cosmética — alguien con la consola del navegador abierta puede saltársela. Por eso:

- El precio de un recurso creado por un usuario normal se fuerza a `0` **en las reglas**, no solo se oculta el campo en el formulario.
- El contenido de pago vive en una subcolección con reglas propias que Firestore evalúa en el servidor — no llega al navegador de quien no pagó, ni siquiera "oculto en el HTML".
- Suspender una cuenta la trata como "no aprobada" en cada página (`cuentaBloqueada`), y además el read de otros usuarios en las reglas también revisa que no esté suspendido.

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

Estas funciones se repiten dentro de cada bloque `match` (Firestore Rules no comparte funciones entre bloques `match` fácilmente en este formato). Si cambias la lógica de "qué es un admin" — o, más relevante ahora, si cambias qué significa "tener acceso" al abrir el registro — hay que tocarla en **cada bloque**, búscala con `grep -n "esAprobadoUsuario\|esAdminUsuario"` en `firestore.rules` antes de asumir que un solo cambio basta. Esto va a ser el trabajo más tedioso (aunque mecánico) de la transición a registro abierto.

### Errores de "Missing or insufficient permissions" — causas típicas ya vividas en este proyecto

1. **Falta un índice compuesto.** Cualquier query que combine `where(...)` + `orderBy(...)` en campos distintos necesita un índice compuesto que Firestore no crea solo. El error en consola trae un link que lo crea con un clic — hay que esperar 1-5 min a que diga "Enabled". *(Nota: como no hay terminal disponible en el flujo de trabajo, no se puede correr `firebase deploy --only firestore:indexes`; los índices se crean a mano en la consola web cada vez.)*
2. **Reglas no publicadas.** Subir archivos a GitHub no toca las reglas de Firestore — son sistemas separados. Hay que copiar el contenido de `firestore.rules` y pegarlo en Firebase Console → Firestore → Reglas → Publicar cada vez que cambien.
3. **`resource.data` es `null` en un `create`** — si una regla de lectura depende de `resource.data.algo` para decidir si un documento *inexistente* se puede leer (ej. verificar si ya existe una amistad antes de crearla), hay que usar `!exists(...)` explícitamente en vez de solo `resource.data`, o la regla truena en vez de simplemente decir "no existe".
4. **HTML y JS desincronizados.** Si `admin.js` espera un elemento (`document.getElementById(...)`) que no existe todavía en el `admin.html` que está en línea (porque se subió una versión vieja del HTML), el script entero se rompe desde esa línea y *todo* deja de funcionar, no solo esa función — el error en consola apunta a la línea exacta (`admin.js:79`, por ejemplo). Cuando varios archivos dependen entre sí, hay que subirlos **todos juntos**, no uno por uno.

---

## El sistema de créditos, en detalle

Es la parte más delicada del proyecto porque mueve "dinero" (créditos internos, representan pagos en efectivo hechos en persona).

- El admin da/quita saldo manualmente cuando alguien le paga en efectivo (`adminAjustarSaldo`).
- Los usuarios pueden transferirse crédito entre ellos (`transferirCredito`) — esta parte encaja bien con el enfoque de red social (piénsalo como "propinas" o intercambios entre usuarios).
- Comprar contenido de pago con saldo lo descuenta y desbloquea al instante (`comprarRecursoConSaldo`).
- Todo movimiento queda en `transacciones`, que nadie puede editar ni borrar (colección de solo-agregar).

### Limitación de seguridad honesta (léela antes de confiar ciegamente en el sistema)

Sin Cloud Functions (que requieren activar el plan Blaze / dar una tarjeta), Firestore Rules **no puede verificar de forma matemáticamente perfecta** que una transferencia P2P sea atómica en el sentido de "si sumo a Juan, es porque a María se le restó exactamente lo mismo en la misma operación" — cada documento se evalúa de forma independiente. El diseño actual:

- Permite a cualquiera **restar** de su propio saldo (nunca puede quedar negativo).
- Permite a cualquiera **sumar** al saldo de otro (para recibir transferencias).
- Deja rastro completo y permanente en `transacciones` con el UID de quien originó cada movimiento.

Esto significa que, en teoría, alguien con conocimientos técnicos que manipule las llamadas directas a la API (saltándose la interfaz) podría intentar sumarse saldo sin la resta correspondiente. En la práctica esto no es explotable por accidente ni por un usuario común, y cualquier abuso quedaría registrado y sería revertible manualmente por el admin. Si el proyecto crece (más relevante aún si se abre el registro a más gente), la solución correcta es mover la lógica de transferencias a una Cloud Function (requiere plan Blaze).

---

## Convenciones del proyecto

- **Idioma**: todo el código (nombres de variables, comentarios, colecciones de Firestore) está en español, consistente con que el público del sitio también lo es. No mezclar a mitad de camino.
- **Estilo visual**: tema oscuro fijo, paleta definida por variables CSS al inicio de cada `<style>`:
  ```css
  --bg: #0f1420; --card: #1a2233; --border: #2a3550; --accent: #5b8def;
  --text: #e8ecf5; --text-dim: #8b96b0; --success: #4caf7d; --danger: #e35d5d; --warn: #e0a941;
  ```
  Cada página redeclara estas variables en su propio `<style>` (no hay un CSS compartido en archivo aparte) — si cambias la paleta, hay que tocar cada archivo.
- **Imágenes**: siempre por URL externa (recomendado: Imgur, con el link que empieza `i.imgur.com/...` y termina en la extensión, no el link a la página del post). Nunca subida de archivo binario a Firebase, porque activaría el plan de pago.
- **Layout mobile-first fijo**: páginas tipo "dashboard" (`index.html`, `admin.html`, `chat.html`) usan `height: 100dvh` + `overflow: hidden` en el body, con un `.content-area` interno que hace el scroll — así se sienten como app nativa sin scroll de página completa. Páginas tipo formulario largo (`perfil.html`, `publicar-recurso.html`, etc.) usan scroll normal de página completa, que es más apropiado ahí.
- **Menú de navegación**: `index.html` tiene un drawer lateral (`☰`) que centraliza los enlaces a todas las secciones. Si agregas una página nueva que un usuario deba poder visitar, agrégala al array `links` dentro del script de `index.html`.
- **Confirmaciones destructivas**: cualquier acción que borre algo usa `confirm()` nativo del navegador antes de ejecutar. Es básico pero consistente en todo el proyecto.

---

## Problemas conocidos y limitaciones

- **La campanita de notificaciones necesita un índice compuesto** (`notificaciones`: `paraUid` + `fecha`) que documentamos en `firestore.indexes.json` pero que hay que crear manualmente en la consola — si nunca se creó, el badge de número nunca aparece aunque el resto del sitio funcione bien. La página `solicitudes.html` fue construida a propósito **sin** depender de este índice (ordena en JavaScript en vez de en la query) como alternativa confiable.
- **No hay muro/feed social todavía** — la pieza que más se le acerca (`sugerencias.html`) fue diseñada como buzón de sugerencias, no como un feed de publicaciones. Si el nuevo enfoque lo requiere, es una colección y una página nuevas.
- **No hay búsqueda de mensajes dentro de un chat** — solo scroll manual.
- **El admin no tiene un dashboard de métricas** (usuarios totales, dinero en circulación, contenido más popular) — toda esa información existe en Firestore pero no hay una vista agregada todavía.
- **Los juegos corren en `<iframe sandbox="allow-scripts">`**, que bloquea acceso a cookies/Firebase/navegación externa, pero no hay revisión automática de contenido — la aprobación de juegos de usuarios normales depende del criterio del admin al probarlos manualmente (hay un botón "Probar" en el panel antes de aprobar).
- **Sin backend real**: cualquier feature que necesite lógica "de confianza total" (ej. verificación de pagos externos, envío de correos personalizados, cron jobs) no se puede hacer sin añadir Cloud Functions o un servicio externo.

---

## Cómo desplegar cambios

1. Edita el/los archivo(s) necesario(s).
2. Si tocaste `firestore.rules`: cópialo completo y pégalo en **Firebase Console → Firestore Database → Reglas → Publicar**. Espera unos segundos.
3. Si agregaste una query nueva con `where` + `orderBy` combinados: prepárate para crear un índice la primera vez que se use (aparecerá el error con el link en la consola del navegador).
4. Sube los archivos `.html`/`.js` modificados a la raíz del repo en GitHub (reemplazando, no duplicando).
5. Espera 1-2 minutos de propagación de GitHub Pages.
6. Prueba con `Ctrl+Shift+R` (recarga forzada sin caché) — los navegadores cachean agresivamente los `.js`, y es fácil pensar que algo "no funcionó" cuando en realidad seguía cargando la versión vieja desde caché.
7. Si tocaste varios archivos que dependen entre sí (ej. un `.html` y su `.js`), súbelos **todos juntos** en el mismo momento — una combinación de versión vieja + nueva puede romper todo el script silenciosamente.

---

## Roadmap

### Transición a red social (prioridad actual)
- Abrir el registro (quitar o hacer opcional la aprobación manual) — ver [la sección de transición](#de-plataforma-escolar-a-red-social-transición-en-curso) para el detalle técnico de qué archivos toca
- Rediseñar `index.html` para que el centro sea el perfil/actividad social, no la lista de recursos
- Evaluar si construir un muro/feed de publicaciones tipo red social

### Ideas pendientes de antes (siguen vigentes)
- Dashboard de estadísticas para el admin (usuarios activos, dinero circulante, contenido más popular)
- Notificaciones automáticas para más eventos (contenido aprobado, juego aprobado, rol aprobado) — el sistema (`notificaciones.js`) ya soporta cualquier tipo, solo falta llamarlo desde los lugares correspondientes
- Avisar al usuario cuando se aprueba su cuenta (hoy se entera hasta que refresca la página) — relevante solo mientras el registro siga siendo cerrado
- Búsqueda de mensajes dentro de un chat

---

## Preguntas frecuentes de alguien nuevo en el proyecto

**¿Por qué el README habla de "escuela" en varios lados si ahora es una red social?**
Porque el código de hoy todavía tiene esa forma — el cambio de enfoque está decidido pero no completamente implementado. Ver la sección de transición para el detalle exacto de qué falta.

**¿Por qué no hay `npm install` ni build?**
Porque el proyecto usa ES modules nativos del navegador y los SDKs de Firebase vía CDN (`<script type="module">` + imports desde `gstatic.com`). No hay bundler, no hay paso de compilación. Es intencional: mantiene el proyecto simple de editar directo en GitHub.

**¿Dónde está la contraseña / API key secreta de Firebase?**
No existe tal cosa en este proyecto. El `apiKey` en `firebase-config.js` es público por diseño de Firebase — la seguridad depende 100% de las Firestore Rules.

**¿Por qué no usamos Firebase Storage para las imágenes?**
Activarlo pide vincular una tarjeta (plan Blaze), aunque el uso se quede dentro de la capa gratuita. Se optó por URLs externas (Imgur) para no requerir eso.

**Encontré una función `esAdminUsuario()` repetida 8 veces en `firestore.rules`, ¿es un error?**
No, es una limitación del formato de reglas de Firestore — las funciones declaradas dentro de un bloque `match` no se comparten automáticamente con otros bloques `match` al mismo nivel sin repetirlas. Es intencional y consistente en todo el archivo.
