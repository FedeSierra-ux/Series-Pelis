# Login simple para Series-Pelis — opciones (v0.15)

> Investigación, sin tocar el repo. Fecha: 2026-10-14. Escala: ~10 casas, varias personas y dispositivos
> por casa, la TV con control remoto como caso difícil. Todo sobre Cloudflare Pages + Pages Functions + D1.

## TL;DR

- **Recomendación: Opción A — "Código de casa" + vincular la TV mostrando un código/QR que se aprueba desde el celular.**
  Sin contraseñas, sin mails, sin terceros, entra en el plan gratis y la TV **no tipea nada**.
- Lo que más pesa en la decisión es **la TV**: ninguna opción "de verdad" (contraseña, mail, Google, passkey,
  Cloudflare Access) es cómoda con el control remoto. Todas terminan necesitando la misma pieza: **vincular la TV
  desde un dispositivo que ya tiene la sesión iniciada**. Esa pieza se construye una vez y sirve para cualquier opción.
- Cloudflare Access parece "cero código", pero en la TV y en la PWA instalada trae más problemas que soluciones.
- La cuenta es **la casa**; los perfiles van adentro de la casa, después (ver final).

---

## 0. Pieza común: vincular un dispositivo (sobre todo la TV)

Patrón tipo *device flow* (RFC 8628), al revés de lo que se pensaba al principio: **la TV muestra el código, el
celular lo aprueba**. Así la TV no tipea nada y el código no sirve para entrar sin estar logueado.

**Flujo en la TV**
1. La TV abre la app sin sesión → pantalla "Vincular este televisor": código grande `482 913` + QR a
   `https://<sitio>/vincular?c=482913` + "Abrí Series-Pelis en tu celular → Vincular TV".
2. La TV espera (consulta cada 3–5 s). El usuario **no toca nada** con el control.
3. Cuando lo aprueban: "¡Listo! Esta TV quedó vinculada a Casa Pérez". Entra.

**Flujo en el celular (ya logueado)**
1. Escanea el QR (o Ajustes → Vincular TV y tipea los 6 dígitos).
2. Ve "¿Vincular **TV · Chrome en Android TV** a **Casa Pérez**?" → **Aceptar**.

**Qué hay que construir**
- `POST /api/pair/start` (TV, sin sesión): crea el pedido con `code` (6 dígitos, único entre los activos) y un
  `poll_secret` de 32 bytes que **solo recibe la TV**. Ambos se guardan **hasheados** (SHA-256). Vence a los 10 min.
- `POST /api/pair/approve {code}` (celular, con sesión): asocia el pedido a la casa de la sesión.
- `POST /api/pair/poll {poll_secret}` (TV): si está aprobado, crea la sesión, manda la cookie y **borra el pedido**
  (un solo uso). Si no, `{"status":"pending"}`.

**Seguridad**
- Adivinar el código no alcanza: hay que **estar logueado** para aprobarlo y el que recibe la sesión es quien
  tiene el `poll_secret`. Tope: 5 códigos mal puestos por sesión cada 10 min; el pedido muere a los 10 min.
- Riesgo conocido del patrón ("phishing de código de dispositivo": alguien te muestra *su* código para que lo
  apruebes). Mitigación: la pantalla de aprobación muestra qué dispositivo es y para qué casa; a esta escala es bajo.
- Variante inversa (el celular muestra el código y la TV lo tipea con el teclado numérico del control): sirve como
  plan B si la TV no puede leer QR… pero ahí el código sí es una credencial para cualquiera, y hay que limitar
  intentos por IP con más cuidado. Preferir la de arriba.

## Sesiones (iguales para todas las opciones propias)

- **Sesión opaca en D1, no JWT**: un solo dominio, y lo importante es poder **revocar al instante** un dispositivo.
- Token de 32 bytes al azar en una cookie `__Host-sp_s`; en D1 se guarda solo su hash.
  `HttpOnly; Secure; SameSite=Lax; Path=/`. El prefijo `__Host-` obliga a `Secure` + `Path=/` y prohíbe `Domain`.
- Duración: **1 año deslizante en la TV**, 6 meses en PC/celular. `last_seen_at` se actualiza como mucho 1 vez
  por día (ahorra escrituras de D1).
- **Revocar**: Ajustes → "Dispositivos de la casa": lista (nombre, último uso) con "Cerrar sesión" (borra la fila).
  "Cerrar todas" para cuando se pierde un celular. El admin (vos) puede borrar cualquiera.
- CSRF: `SameSite=Lax` + el `fromOwnSite()` que ya existe en `functions/_lib.ts` en todos los POST.
- El service worker ya tiene `navigateFallbackDenylist: [/^\/api\//]`: `/api/*` nunca se cachea. Mantenerlo así.
- Tenant: el `house_id` sale **siempre de la sesión**, nunca del pedido. D1 no tiene RLS → todas las consultas
  pasan por un helper que agrega `WHERE house_id = ?`, y un test que intenta leer datos de otra casa.

**Tablas D1 mínimas (comunes)**

| Tabla | Para qué |
|---|---|
| `houses(id, name, created_at)` | La cuenta = la casa |
| `sessions(token_hash PK, house_id, label, ua, created_at, last_seen_at, expires_at)` | Una fila por dispositivo |
| `pair_requests(code_hash, poll_hash, house_id NULL, label, attempts, expires_at)` | Vincular TV |
| `auth_events(id, house_id, type, ip, ua, ts)` | Auditoría: logins, fallos, vinculaciones, revocaciones |
| `rate_limits(key, window_start, count)` | Topes por IP / por sesión (ver abajo) |

**Rate limit**: el binding de rate limit de Workers existe (ventanas de 10 o 60 s, contador por ubicación), pero la
doc no dice si anda en Pages Functions ni en el plan gratis. A esta escala alcanza con contar en D1 (`rate_limits`)
+ el `memoryRateLimit()` que ya existe. Un login fallido = 1–2 escrituras: no mueve la aguja frente a 100.000/día.

---

## Opción A — Código de casa (invitación), sin contraseña ⭐

**Idea**: vos creás cada casa y le pasás un código largo (o un link). Quien lo pone queda logueado en esa casa.

**PC / celular**
1. Te llega por WhatsApp: `https://<sitio>/unirse#GATO-LUNA-7K2P-RX` (el código va en el `#`: no viaja en
   `Referer` ni queda en logs).
2. Toca el link → "Entrar a **Casa Pérez**" → **Entrar**. Listo (o pega el código a mano en "Tengo un código").

**TV**: pieza común (código/QR aprobado desde el celular). Cero tipeo.

**Qué construir**
- Tabla `invites(code_hash, house_id, created_at, expires_at NULL, revoked_at NULL)`.
- `POST /api/join {code}` → crea sesión. Crear casas/códigos: endpoint admin con secreto `ADMIN_KEY` (igual que
  `REPORT_ADMIN_KEY`) o directo con `wrangler d1 execute`. "Generar código nuevo" invalida el anterior.
- Pantalla de dispositivos + vincular TV (pieza común).

**Seguridad**
- El código es un secreto compartido de la casa: **≥ 50 bits** (p. ej. 10 caracteres base32 sin ambiguos, o 4
  palabras). Con tope de 10 intentos/IP/hora la fuerza bruta es imposible.
- Si se filtra (lo reenvían a quien no era): ves un dispositivo raro en la lista → lo cerrás y rotás el código.
  Los dispositivos ya vinculados siguen andando.
- No hay recuperación de cuenta que atacar: "perdí todo" = te piden un código nuevo.

**Costo**: $0. **Esfuerzo: S–M** (la mayor parte es la pieza común). **Riesgos**: el código circula por WhatsApp;
no identifica personas (para eso están los perfiles, que de todos modos no son seguridad).

## Opción B — Usuario + contraseña (por casa) + código para la TV

**PC / celular**: "Usuario" + "Contraseña" → Entrar. **TV**: pieza común.

**Qué construir**: `users(house_id, username UNIQUE, pass_hash, salt, iters, failed_count, locked_until)`,
`/api/login`, `/api/logout`, cambio de contraseña, **reseteo hecho por el admin** (no hay mail).

**Hash en Workers**
- WebCrypto trae **PBKDF2**; workerd le pone **tope de iteraciones** a propósito (contra DoS; el error es
  `iteration counts above N are not supported`, y en producción se reporta N = 100.000). OWASP pide 600.000 para
  PBKDF2-SHA256 → **no se llega**.
- Plan gratis: **10 ms de CPU por pedido**. 100.000 iteraciones de PBKDF2-SHA256 probablemente se pasen → hay que
  medir; si se pasa, bajar iteraciones o pagar Workers Paid. Argon2/scrypt vía WASM o `node:crypto` son peores en CPU.
- Conclusión práctica: con hash débil, la seguridad sale de **contraseñas largas generadas** + rate limit. Y en ese
  punto es… la opción A con un campo más.

**Seguridad**: mensaje único "usuario o contraseña incorrectos"; bloqueo progresivo por usuario y por IP;
Turnstile opcional en el login (gratis, hasta 20 widgets) si aparece tráfico raro.
**Costo**: $0 (con el riesgo de CPU). **Esfuerzo: M**. **Riesgos**: gente que se olvida la contraseña (soporte para
vos), contraseñas reusadas y débiles, CPU del hash en el plan gratis.

## Opción C — Código o link por email ("magic link")

**PC / celular**: pone su mail → le llega un **código de 6 dígitos** → lo tipea → entra.
Mejor código que link: en iPhone la PWA instalada tiene su propio almacenamiento; el link del mail abre Safari y la
sesión queda en Safari, no en la app.
**TV**: pieza común (tipear un mail con el control es lo que queremos evitar).

**Qué construir**: `members(email, house_id)` (lista blanca que cargás vos), `email_codes(email, code_hash,
attempts, expires_at)` con 10 min de vida, máximo 5 intentos y 3 envíos por hora por mail.

**El problema es mandar el mail**
- **Cloudflare Email Service**: mandar a cualquier destinatario requiere **Workers Paid** (USD 5/mes; 3.000 mails/mes
  incluidos, después USD 0,35 cada 1.000). En el plan gratis solo se puede mandar a **direcciones verificadas** de la
  cuenta (cada persona tendría que confirmar su mail en Email Routing) y hace falta **dominio propio** en Cloudflare.
- **Resend**: gratis 3.000/mes con tope de **100 por día**; pide **verificar un dominio propio** (la API key va como
  secreto de Cloudflare).
- En los dos casos: **dominio propio** (~USD 10/año), SPF/DKIM, y mails que caen en spam.

**Seguridad**: buena (no hay contraseñas); no revelar si el mail existe ("si está registrado, te llegó un código").
**Costo**: dominio + $0 (Resend free) o USD 5/mes. **Esfuerzo: M**. **Riesgos**: entregabilidad, dependencia de un
tercero, dominio propio obligatorio, la gente mayor que no encuentra el mail.

## Opción D — Passkeys (WebAuthn)

**PC / celular**: "Entrar con huella / cara" → listo. Muy cómodo… **después** de registrarla.
**TV**: los navegadores de TV (Tizen, webOS, Silk de Fire TV, el que traiga Android TV) **no tienen soporte confiable
de WebAuthn**: Samsung anunció passkeys para Tizen, pero no hay confirmación de que funcione en su navegador. El QR
"híbrido" de passkeys necesita que la TV sea el cliente WebAuthn con Bluetooth: no realista. → **pieza común**.

**Qué construir**: `credentials(id, house_id, public_key, sign_count, transports, created_at)`, registro y login con
`@simplewebauthn/server` (usa WebCrypto, anda en Workers), desafíos en D1 con 5 min de vida.

**Problemas**
- Hace falta **otro método para el primer ingreso** (y para recuperar): passkeys no puede ser la única opción → es
  A + D.
- La passkey queda atada al dominio (`rpID`): si después pasás de `series-pelis.pages.dev` a un dominio propio,
  **todas dejan de andar**.
- Las passkeys se sincronizan con la cuenta de Google/iCloud de cada persona: en un celular compartido de la casa
  confunde.

**Costo**: $0. **Esfuerzo: L**. **Seguridad**: la mejor (anti-phishing). **Riesgos**: complejidad y soporte para ~10
casas que no lo necesitan. Dejarla como **extra opcional** más adelante, no como login principal.

## Opción E — Cloudflare Access (Zero Trust) delante del sitio

**Idea**: Cloudflare pide el login antes de servir cualquier cosa; la app no tiene login propio.

**Datos**: gratis hasta **50 usuarios** (asientos); OTP por mail (PIN que vence a los 10 min) o Google como
proveedor. Sesión configurable de inmediata a **1 mes** (24 h por defecto). En las Functions llega el header
`Cf-Access-Jwt-Assertion` → se valida con `jose` contra `https://<equipo>.cloudflareaccess.com/cdn-cgi/access/certs`,
`aud` = tag de la app; el mail sale de `payload.email` → `members(email, house_id)` en D1.

**PC / celular**: abre el sitio → pantalla de Cloudflare → mail → PIN que llega por mail → entra.
**TV**: tiene que **tipear el mail y el PIN con el control**, y otra vez **cada mes como máximo** (o cuando el
navegador de la TV borre cookies). Para usar la pieza común habría que abrir rutas sin Access (política *Bypass*
para `/api/pair/*`) y la TV seguiría sin poder cargar el resto del sitio → dos sistemas de login mezclados.

**Problemas con la PWA** (reportados por usuarios de otras apps, no hay guía oficial):
- El service worker sirve la app desde la caché sin pasar por Cloudflare; cuando vence la cookie, los pedidos se
  redirigen a `cloudflareaccess.com` y fallan por **CORS** (incluido el `manifest`). Hay que sumar `/cdn-cgi/` al
  `navigateFallbackDenylist`, detectar el error y forzar recarga; algunos solo lo arreglaron desinstalando la PWA.
- Proteger el `pages.dev` de producción lleva un ajuste manual (la opción de Pages solo cubre las *previews*), y un
  dominio propio necesita **otra** app de Access.
- 50 asientos: ~10 casas × 3–5 personas queda justo; con un mail por casa sobra.

**Costo**: $0. **Esfuerzo: S en PC, M–L con TV y PWA.** **Riesgos**: altos justo donde más se usa (TV y PWA).
Sirve muy bien para **proteger herramientas de admin** (p. ej. leer informes), no para esta app.

## Opción F — "Ingresar con Google" + código para la TV

**PC / celular**: botón "Ingresar con Google" → elige la cuenta → vuelve logueado. Casi todos tienen Google (Android).
**TV**: pieza común.

**Qué construir**: OIDC con *authorization code + PKCE* en una Function (`/api/auth/google/start` y `/callback`):
`state` + `nonce` + `code_verifier` guardados del lado del servidor con 10 min de vida, se validan la firma del ID
token (JWKS de Google con `jose`), `iss`, `aud` y el `nonce`; `members(email, house_id)` como lista blanca (si el mail
no está → "Pedile acceso al admin"). Client ID/secret como **secretos de Cloudflare**.
Evitar el botón de Google Identity Services: carga scripts de `accounts.google.com` y rompe la CSP actual
(`script-src 'self'`).

**Google**: con solo `openid email profile` no hace falta verificar la app ni cargar "usuarios de prueba", y no
aparece la pantalla de advertencia.

**Costo**: $0. **Esfuerzo: M**. **Seguridad**: buena (Google pone el 2FA). **Riesgos**: en el iPhone con la PWA
instalada el ir y volver de Google puede abrir otra ventana y dejar la cookie afuera de la app (**probar**); quien no
tiene Google o no se acuerda la contraseña; dependés de un tercero.

---

## Comparación

| | A. Código de casa | B. Usuario + contraseña | C. Código por mail | D. Passkeys | E. CF Access | F. Google |
|---|---|---|---|---|---|---|
| Qué tipea en PC/cel | Nada (link) o un código | Usuario + contraseña | Mail + 6 dígitos | Nada (huella) | Mail + PIN | Nada (elige cuenta) |
| Qué tipea en la TV | **Nada** (aprueba el cel) | Nada (pieza común) | Nada (pieza común) | Nada (pieza común) | **Mail + PIN, cada ≤1 mes** | Nada (pieza común) |
| Necesita algo más | — | — | Dominio + proveedor de mail | Otro método para el 1.er ingreso | Ajustes de Zero Trust | Proyecto de Google Cloud |
| Costo | $0 | $0 (CPU justa) | ~USD 10/año o USD 5/mes | $0 | $0 (≤50) | $0 |
| Esfuerzo | **S–M** | M | M | L | S (PC) / M–L (TV+PWA) | M |
| Seguridad (para 10 casas) | Buena | Media (hash limitado) | Buena | Muy buena | Buena | Buena |
| Soporte para vos | Mínimo | Olvidos de contraseña | Mails en spam | Alto | Alto en TV | Bajo |
| Identifica personas | No (casa) | Opcional | Sí | Sí | Sí | Sí |

## Recomendación

**Opción A + la pieza común.** Es la más simple que es razonablemente segura para ~10 casas:
- Un login = abrir un link una vez por dispositivo; la TV se vincula con el celular sin tipear.
- Nada de mails, contraseñas olvidadas, dominios propios ni terceros; todo en D1 y en el plan gratis.
- La seguridad real está en lo que importa: códigos largos que se pueden rotar, sesiones opacas que se revocan desde
  "Dispositivos", rate limit y auditoría en `auth_events`.
- Deja la puerta abierta: si un día querés identificar personas, se suma **F (Google)** o **D (passkey)** como otra
  forma de entrar a la **misma casa**, sin rehacer sesiones ni vinculación de TV.

Orden sugerido: 1) tablas + sesiones + `/api/join` + pantalla Dispositivos; 2) vincular TV (QR + polling);
3) sincronización con D1 (historial, Mi lista, Seguir viendo, ajustes, addons) por `house_id`; 4) perfiles.

**Ojo con D1 al sincronizar**: el plan gratis da 100.000 filas escritas/día (los índices suman escrituras) y
100.000 pedidos/día a las Functions. Guardar el progreso al pausar/salir y cada 1–2 min, no cada pocos segundos.

## Cómo encajan los perfiles después

- `profiles(id, house_id, name, avatar, kids, pin_hash NULL, created_at)`; los datos (`progress`, `my_list`,
  `history`, ajustes por persona) llevan `(house_id, profile_id)`. Los addons y el debrid quedan por casa.
- La sesión es **de la casa**; el perfil se elige en cada dispositivo ("¿Quién está viendo?") y se recuerda localmente.
  El servidor verifica que el `profile_id` sea de la casa de la sesión (nunca confía en el que manda el cliente).
- PIN de perfil de 4 dígitos opcional = **privacidad/infantil**, no seguridad (como Netflix).
- Si después se suma Google o passkeys, se asocian a un **perfil** (`profile_logins(profile_id, provider, subject)`)
  y entrar con eso abre la casa con ese perfil ya elegido.
- Migración desde IndexedDB: en el primer ingreso, "Subir los datos de este dispositivo a la casa / perfil X"
  (una vez, con confirmación), reusando el exportar/importar JSON que ya existe.

---

## Fuentes

- Cloudflare D1, precios y límites del plan gratis: https://developers.cloudflare.com/d1/platform/pricing/ ·
  FAQ: https://developers.cloudflare.com/d1/reference/faq
- Workers, límites (100.000 pedidos/día, 10 ms de CPU): https://developers.cloudflare.com/workers/platform/limits ·
  Pages Functions, precios: https://developers.cloudflare.com/pages/functions/pricing/
- Rate Limiting binding: https://docs.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- workerd, tope de iteraciones de PBKDF2 (`checkPbkdfLimits`):
  https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/impl.c%2B%2B
- Cloudflare Email Service, precios: https://developers.cloudflare.com/email-service/platform/pricing/
- Resend, plan gratis (3.000/mes, 100/día): https://resend.com/blog/new-free-tier
- Turnstile, planes: https://developers.cloudflare.com/turnstile/plans/
- Cloudflare Access: https://www.cloudflare.com/en-au/products/cloudflare-access ·
  OTP por mail: https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin ·
  sesiones: https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/ ·
  validar el JWT: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/ ·
  CORS: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/ ·
  Pages + Access (pages.dev de producción): https://developers.cloudflare.com/pages/platform/known-issues/
- Zero Trust gratis hasta 50 usuarios (terceros, confirmar en el panel): https://controld.com/blog/cloudflare-zero-trust-pricing/ ·
  https://costbench.com/software/business-vpn/cloudflare-zero-trust/free-plan/
- PWA detrás de Access (reportes): https://discourse.nodered.org/t/dashboard-2-0-pwa-service-worker-prevents-authentication-redirect-when-session-expires/100574 ·
  https://gramps.discourse.group/t/cannot-access-gramps-web-once-cloudflare-access-session-expires/9386 ·
  https://gitblind.noratr.app/autobrr/qui/pull/1438
- Google OAuth, scopes básicos sin lista de prueba ni advertencia: https://support.google.com/cloud/answer/15549945
- RFC 8628 (device flow, fuerza bruta del código): https://www.rfc-editor.org/rfc/rfc8628 ·
  https://www.oauth.com/oauth2-servers/device-flow/security-considerations/
- Passkeys en TV: Samsung anuncia passkeys en Tizen: https://heise.de/-9974848 · QR híbrido:
  https://www.corbado.com/blog/webauthn-passkey-qr-code.md
