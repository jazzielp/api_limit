# Referencia de la API de api_limit

`api_limit` es una API JSON de Express 5 para registrar cuentas, verificar direcciones de email,
iniciar sesión con contraseña, gestionar perfiles, gestionar claves de API y acceder a un recurso de
ejemplo protegido por clave de API con una cuota diaria por usuario.

## Vista general

| Elemento | Valor |
|---|---|
| URL base local | `http://localhost:3000` por defecto |
| Prefijo de versión de la API | Ninguno |
| Tipo de contenido de las solicitudes | `application/json` para solicitudes con cuerpo |
| Formato de respuesta | JSON, excepto las respuestas exitosas `204 No Content` |
| Documentación interactiva | `/docs` |
| Contrato OpenAPI 3.1 | `/openapi.json` |
| Autenticación de cuenta | `Authorization: Bearer <access-token>` |
| Autenticación del recurso protegido | `X-API-Key: <api-key>` |
| Cuota diaria del recurso protegido | 100 solicitudes por usuario y día UTC |

El operador del despliegue define la URL base de producción. Las rutas de este documento son relativas
a esa URL.

## Contenido

- [Inicio rápido](#inicio-rápido)
- [Autenticación](#autenticación)
- [Resumen de endpoints](#resumen-de-endpoints)
- [Límites de solicitudes](#límites-de-solicitudes)
- [Validación y errores](#validación-y-errores)
- [Verificación de email y restablecimiento de contraseña](#verificación-de-email-y-restablecimiento-de-contraseña)
- [Referencia del entorno](#referencia-del-entorno)
- [Desarrollo local](#desarrollo-local)

## Inicio rápido

1. Instala las dependencias y prepara la base de datos según se describe en la sección [desarrollo local](#desarrollo-local).
2. Inicia la API con `pnpm dev`.
3. Abre `http://localhost:3000/docs` para consultar la Scalar API Reference interactiva, o recupera el
   contrato legible por máquinas desde `http://localhost:3000/openapi.json`.
4. Confirma que el proceso está activo y que la base de datos está lista:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

Una instancia lista devuelve:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "status": "ready",
  "checks": {
    "database": "ok"
  }
}
```

El registro no produce inmediatamente un token de acceso. La cuenta debe completar la verificación del
email antes de poder iniciar sesión:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123"}'

curl -X POST http://localhost:3000/auth/verify-email \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","code":"123456"}'

curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123"}'
```

Con el JWT devuelto, crea una clave de API y úsala en el recurso protegido:

```bash
curl -X POST http://localhost:3000/api-keys \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"production-client"}'

curl -i http://localhost:3000/protected \
  -H 'X-API-Key: <api-key>'
```

## Autenticación

### Tokens de acceso JWT

Usa un JWT para `/users/*` y `/api-keys/*`:

```http
Authorization: Bearer <access-token>
```

El token solo lo devuelve `POST /auth/login`. Para iniciar sesión se requiere una dirección de email
verificada. Los tokens caducan después de `ACCESS_TOKEN_TTL_MINUTES` y se validan contra el issuer y la
audience configurados. No existe un endpoint de refresh token.

Cambiar o restablecer una contraseña incrementa la versión de token de la cuenta e invalida todos los
JWT emitidos antes de ese cambio. Un token invalidado devuelve `401` con un código de error distinto:

```json
{
  "error": {
    "message": "Invalid or expired token",
    "code": "TOKEN_VERSION_MISMATCH"
  }
}
```

Inicia sesión de nuevo con la nueva contraseña para obtener un token utilizable.

Los tokens malformados o caducados devuelven `401`:

```json
{
  "error": {
    "message": "Invalid or expired token",
    "code": "UNAUTHORIZED"
  }
}
```

Si falta el header o no comienza con `Bearer `, se devuelve:

```json
{
  "error": {
    "message": "Missing or invalid authorization header",
    "code": "UNAUTHORIZED"
  }
}
```

### Claves de API

Usa una clave de API únicamente para `/protected`:

```http
X-API-Key: apk_<key-material>
```

Crea, lista y revoca claves de API con un JWT. La clave en texto plano aparece una sola vez en la
respuesta de creación; el servidor almacena únicamente su hash SHA-256 y las respuestas de listado nunca
la contienen. Si falta la clave, se devuelve `401` con `Missing API key`; una clave desconocida o revocada
devuelve `401` con `Invalid API key`. Ambas usan el código de error `UNAUTHORIZED`.

Los cambios de contraseña no revocan las claves de API. Revoca las claves explícitamente con
`DELETE /api-keys/:id`.

## Resumen de endpoints

| Método | Ruta | Autenticación | Éxito |
|---|---|---|---|
| `GET` | `/health` | Ninguna | `200` |
| `GET` | `/health/ready` | Ninguna | `200` |
| `POST` | `/auth/register` | Ninguna | `201` |
| `POST` | `/auth/login` | Ninguna | `200` |
| `POST` | `/auth/verify-email` | Ninguna | `200` |
| `POST` | `/auth/resend-verification` | Ninguna | `200` |
| `POST` | `/auth/forgot-password` | Ninguna | `204` |
| `POST` | `/auth/reset-password` | Ninguna | `204` |
| `GET` | `/users/me` | JWT | `200` |
| `PATCH` | `/users/me` | JWT | `200` |
| `POST` | `/users/me/change-password` | JWT | `204` |
| `POST` | `/api-keys` | JWT | `201` |
| `GET` | `/api-keys` | JWT | `200` |
| `DELETE` | `/api-keys/:id` | JWT | `204` |
| `GET` | `/protected` | Clave de API | `200` |

Los seis endpoints `/auth/*` también usan el [límite de intentos de autenticación](#límite-de-intentos-de-autenticación).

## Endpoints de salud

### `GET /health`

Devuelve el estado de actividad del proceso. No consulta la base de datos.

**Solicitud**

```bash
curl http://localhost:3000/health
```

**Respuesta: `200 OK`**

```json
{
  "status": "ok"
}
```

### `GET /health/ready`

Ejecuta `SELECT 1` en PostgreSQL e informa si la API está lista para atender solicitudes que usan la base
de datos.

**Solicitud**

```bash
curl http://localhost:3000/health/ready
```

**Respuesta: `200 OK`**

```json
{
  "status": "ready",
  "checks": {
    "database": "ok"
  }
}
```

**Respuesta: `503 Service Unavailable`**

```json
{
  "status": "not ready",
  "checks": {
    "database": "unavailable"
  }
}
```

## Endpoints de cuenta y autenticación

### `POST /auth/register`

Crea una cuenta sin verificar y envía un código de verificación de seis dígitos.

**Cuerpo de la solicitud**

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | Obligatorio; dirección de email válida |
| `password` | string | Obligatorio; al menos 8 caracteres |

Las direcciones de email aceptadas se almacenan en minúsculas. La validación ocurre antes de la
normalización, por lo que una dirección válida con espacios se rechaza en lugar de recortarse y aceptarse.

```json
{
  "email": "alice@example.com",
  "password": "Password123"
}
```

**Respuesta: `201 Created`**

```json
{
  "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
  "email": "alice@example.com",
  "createdAt": "2026-08-07T18:00:00.000Z"
}
```

La respuesta no contiene un token. Completa la verificación del email y luego inicia sesión.

**Respuesta: `409 Conflict`**

```json
{
  "error": {
    "message": "Email already registered",
    "code": "CONFLICT"
  }
}
```

### `POST /auth/login`

Autentica una cuenta verificada y devuelve un JWT.

**Cuerpo de la solicitud**

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | Obligatorio; dirección de email válida |
| `password` | string | Obligatorio; al menos 8 caracteres |

```json
{
  "email": "alice@example.com",
  "password": "Password123"
}
```

**Respuesta: `200 OK`**

```json
{
  "token": "<signed-jwt>",
  "user": {
    "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
    "email": "alice@example.com",
    "emailVerifiedAt": "2026-08-07T18:02:00.000Z"
  }
}
```

Las combinaciones de email y contraseña inválidas devuelven la misma respuesta para evitar revelar si
existe una cuenta:

**Respuesta: `401 Unauthorized`**

```json
{
  "error": {
    "message": "Invalid credentials",
    "code": "UNAUTHORIZED"
  }
}
```

**Respuesta: `403 Forbidden`**

```json
{
  "error": {
    "message": "Email not verified. Please verify your email before logging in.",
    "code": "EMAIL_NOT_VERIFIED"
  }
}
```

### `POST /auth/verify-email`

Verifica una cuenta con el código enviado durante el registro o mediante el endpoint de reenvío.

**Cuerpo de la solicitud**

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | string | Obligatorio; dirección de email válida |
| `code` | string | Obligatorio; exactamente 6 caracteres |

```json
{
  "email": "alice@example.com",
  "code": "123456"
}
```

**Respuesta: `200 OK`**

```json
{
  "message": "Email verified"
}
```

Por privacidad e idempotencia, un email desconocido, una cuenta ya verificada o una cuenta sin un registro
de verificación activo también reciben esta respuesta `200`.

Los códigos caducan después de 30 minutos y permiten cinco intentos fallidos. Un código incorrecto antes
de agotar los intentos devuelve:

```json
{
  "error": {
    "message": "Invalid verification code",
    "code": "VALIDATION_ERROR"
  }
}
```

Un código caducado o un número de intentos agotado devuelve `400` con `Invalid or expired verification code`
y el mismo código `VALIDATION_ERROR`.

### `POST /auth/resend-verification`

Reemplaza el código de verificación activo y reinicia su caducidad y el límite de cinco intentos.

**Cuerpo de la solicitud**

```json
{
  "email": "alice@example.com"
}
```

`email` es obligatorio y debe ser una dirección de email válida.

**Respuesta: `200 OK`**

```json
{
  "message": "If your email is registered, a new code has been sent"
}
```

La misma respuesta se devuelve para emails desconocidos y cuentas ya verificadas. Para una cuenta sin
verificar, los reenvíos tienen además un intervalo de espera de un minuto:

**Respuesta: `429 Too Many Requests`**

```json
{
  "error": {
    "message": "Please wait before resending",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

Esta respuesta del intervalo de espera del servicio **no** incluye `Retry-After`. La misma operación también
puede devolver `429` del limitador compartido de intentos de autenticación; solo la respuesta de ese limitador
incluye `Retry-After`.

### `POST /auth/forgot-password`

Crea un token de restablecimiento de contraseña de un solo uso y envía una URL de restablecimiento si la
cuenta existe.

**Cuerpo de la solicitud**

```json
{
  "email": "alice@example.com"
}
```

`email` es obligatorio y debe ser una dirección de email válida.

**Respuesta: `204 No Content`**

La respuesta no tiene cuerpo. Los emails desconocidos y registrados reciben la misma respuesta. Solicitar
un nuevo restablecimiento elimina cualquier token de restablecimiento anterior sin usar de la cuenta. El
nuevo token caduca después de 15 minutos.

### `POST /auth/reset-password`

Consume un token de restablecimiento de contraseña y establece una nueva contraseña.

**Cuerpo de la solicitud**

| Campo | Tipo | Reglas |
|---|---|---|
| `token` | string | Obligatorio; al menos 1 carácter |
| `password` | string | Obligatorio; al menos 8 caracteres |

```json
{
  "token": "<reset-token-from-email>",
  "password": "NewPassword123"
}
```

**Respuesta: `204 No Content`**

La respuesta no tiene cuerpo. Un restablecimiento exitoso invalida todos los tokens de restablecimiento sin
usar de la cuenta y todos los JWT emitidos antes del restablecimiento.

**Respuesta: `400 Bad Request`**

```json
{
  "error": {
    "message": "Invalid or expired reset token",
    "code": "VALIDATION_ERROR"
  }
}
```

## Endpoints de usuario

Todos los endpoints de usuario requieren un JWT en el header `Authorization`.

### `GET /users/me`

Devuelve el perfil de la cuenta actual.

**Solicitud**

```bash
curl http://localhost:3000/users/me \
  -H 'Authorization: Bearer <access-token>'
```

**Respuesta: `200 OK`**

```json
{
  "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
  "email": "alice@example.com",
  "name": "Alice",
  "emailVerifiedAt": "2026-08-07T18:02:00.000Z",
  "createdAt": "2026-08-07T18:00:00.000Z",
  "updatedAt": "2026-08-07T18:05:00.000Z"
}
```

`name` puede ser `null` cuando todavía no se ha establecido.

### `PATCH /users/me`

Actualiza el nombre visible de la cuenta actual.

**Cuerpo de la solicitud**

| Campo | Tipo | Reglas |
|---|---|---|
| `name` | string | Opcional; cuando está presente, al menos 1 carácter |

```json
{
  "name": "Alice Smith"
}
```

**Respuesta: `200 OK`**

```json
{
  "id": "4da7a04e-e5c7-42c9-8e5a-bf98f1a5352e",
  "email": "alice@example.com",
  "name": "Alice Smith",
  "emailVerifiedAt": "2026-08-07T18:02:00.000Z",
  "createdAt": "2026-08-07T18:00:00.000Z",
  "updatedAt": "2026-08-07T18:10:00.000Z"
}
```

Enviar `null` o una cadena vacía para `name` no es válido. Actualmente, la API acepta un objeto vacío como
una actualización sin cambios.

### `POST /users/me/change-password`

Cambia la contraseña después de comprobar la contraseña actual.

**Cuerpo de la solicitud**

| Campo | Tipo | Reglas |
|---|---|---|
| `currentPassword` | string | Obligatorio; al menos 1 carácter |
| `newPassword` | string | Obligatorio; al menos 8 caracteres |

```json
{
  "currentPassword": "Password123",
  "newPassword": "NewPassword123"
}
```

**Respuesta: `204 No Content`**

La respuesta no tiene cuerpo. Todos los JWT existentes, incluido el token usado para esta solicitud, quedan
invalidados después del cambio.

**Respuesta: `401 Unauthorized`**

```json
{
  "error": {
    "message": "Invalid current password",
    "code": "UNAUTHORIZED"
  }
}
```

## Endpoints de claves de API

Todos los endpoints del ciclo de vida de las claves de API requieren un JWT en el header `Authorization`.

### `POST /api-keys`

Crea una clave de API para la cuenta actual.

**Cuerpo de la solicitud**

```json
{
  "name": "production-client"
}
```

`name` es obligatorio y debe contener al menos un carácter.

**Respuesta: `201 Created`**

```json
{
  "id": "83cd2ba5-58a9-43ce-b501-61388152c3d9",
  "name": "production-client",
  "key": "apk_<key-material>",
  "createdAt": "2026-08-07T18:15:00.000Z"
}
```

Almacena `key` de forma segura cuando se devuelva. No se puede recuperar mediante la API.

### `GET /api-keys`

Lista las claves de API activas y no revocadas de la cuenta actual, empezando por las más recientes.

**Solicitud**

```bash
curl http://localhost:3000/api-keys \
  -H 'Authorization: Bearer <access-token>'
```

**Respuesta: `200 OK`**

```json
[
  {
    "id": "83cd2ba5-58a9-43ce-b501-61388152c3d9",
    "name": "production-client",
    "createdAt": "2026-08-07T18:15:00.000Z",
    "lastUsedAt": "2026-08-07T18:16:00.000Z"
  },
  {
    "id": "f1797df7-e6e1-4f78-b8b8-131f69546cd9",
    "name": "unused-client",
    "createdAt": "2026-08-07T18:12:00.000Z",
    "lastUsedAt": null
  }
]
```

Una cuenta sin claves activas recibe `[]`. El uso de una clave actualiza `lastUsedAt` como máximo una vez
por minuto, por lo que esta marca de tiempo es aproximada y no un registro de auditoría por solicitud.

### `DELETE /api-keys/:id`

Revoca una de las claves de API de la cuenta actual. Usa un `id` devuelto por `GET /api-keys`.

**Solicitud**

```bash
curl -X DELETE http://localhost:3000/api-keys/83cd2ba5-58a9-43ce-b501-61388152c3d9 \
  -H 'Authorization: Bearer <access-token>'
```

**Respuesta: `204 No Content`**

La respuesta no tiene cuerpo. La clave revocada deja de autenticar inmediatamente y se omite de las
respuestas de listado posteriores.

**Respuesta: `404 Not Found`**

```json
{
  "error": {
    "message": "API key not found",
    "code": "NOT_FOUND"
  }
}
```

El mismo `404` se aplica cuando la clave no existe o pertenece a otra cuenta. Revocar una clave ya revocada
es idempotente y devuelve `204`.

## Recurso protegido

### `GET /protected`

Autentica una clave de API y consume una solicitud de la cuota diaria del usuario propietario.

**Solicitud**

```bash
curl -i http://localhost:3000/protected \
  -H 'X-API-Key: <api-key>'
```

**Respuesta: `200 OK`**

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1786147200
Content-Type: application/json; charset=utf-8

{
  "status": "ok"
}
```

Los valores numéricos del header anterior son ejemplos. `X-RateLimit-Reset` cambia con la próxima
medianoche UTC.

**Respuesta: `429 Too Many Requests`**

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1786147200
Content-Type: application/json; charset=utf-8

{
  "error": {
    "message": "Daily rate limit exceeded",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

## Límites de solicitudes

### Límite de intentos de autenticación

Cada solicitud a un endpoint `/auth/*` cuenta para un límite de 10 solicitudes por ventana de 15 minutos.
Las solicitudes exitosas no quedan excluidas. La clave combina la IP del cliente de Express con el valor
`email` del cuerpo de la solicitud. Por ello, una configuración correcta de `TRUST_PROXY` es importante
cuando la API está detrás de un proxy inverso conocido.

Es un límite de ventana fija respaldado por el almacén en memoria predeterminado de `express-rate-limit`.
Los contadores son locales a un proceso de Node.js, se reinician cuando ese proceso se reinicia y no se
comparten entre procesos ni instancias de la aplicación. Por lo tanto, un despliegue con varias instancias
necesita un almacén compartido para aplicar un límite global de intentos de autenticación.

Las respuestas de estas rutas incluyen los headers estándar de límite de solicitudes generados por
`express-rate-limit`:

```http
RateLimit-Policy: 10;w=900
RateLimit-Limit: 10
RateLimit-Remaining: 9
RateLimit-Reset: 900
```

Los headers heredados `X-RateLimit-*` están deshabilitados para las rutas de autenticación. La cuota diaria
separada de `GET /protected` usa los headers personalizados `X-RateLimit-*` documentados abajo.

`RateLimit-Remaining` y `RateLimit-Reset` varían según la solicitud. Cuando se excede el límite,
`express-rate-limit` también emite `Retry-After`, medido en segundos enteros hasta que se reinicia la
ventana fija actual. Es `900` al observarlo al inicio de una nueva ventana de 15 minutos y disminuye con el
tiempo transcurrido:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 900

{
  "error": {
    "message": "Too many attempts. Please try again after 15 minutes.",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

El intervalo de espera de un minuto de reenvío de verificación es una regla de servicio separada y puede
devolver su propio `429` antes de alcanzar este límite compartido de las rutas de autenticación. Ese
intervalo no establece `Retry-After`; los clientes no deben inferir la presencia de ese header si no está
realmente incluido.

### Límite diario de claves de API

`GET /protected` permite 100 solicitudes exitosas por usuario y día calendario UTC. Todas las claves de API
activas del mismo usuario comparten un contador. La operación del contador se serializa en PostgreSQL para
que las solicitudes simultáneas no puedan eludir la cuota.

La solicitud número 100 tiene éxito con `X-RateLimit-Remaining: 0`. Las solicitudes posteriores devuelven
`429` y no incrementan el contador. La cuota se reinicia a la próxima medianoche UTC.

| Header | Significado |
|---|---|
| `X-RateLimit-Limit` | Límite diario; actualmente `100` |
| `X-RateLimit-Remaining` | Solicitudes exitosas restantes durante el día UTC actual |
| `X-RateLimit-Reset` | Marca de tiempo Unix en segundos de la próxima medianoche UTC |

Estos headers `X-RateLimit-*` se devuelven en las respuestas exitosas y en las respuestas de `/protected`
que exceden el límite diario. Los fallos de autenticación de la clave de API ocurren antes del consumo de
la cuota y no los incluyen.

## Validación y errores

### Validación

Los cuerpos de las solicitudes se validan con Zod. Los campos desconocidos de los objetos se eliminan antes
de que el controlador reciba el cuerpo. Los fallos de validación devuelven `400 Bad Request`:

```json
{
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "issues": [
      {
        "path": ["email"],
        "message": "Invalid email address"
      },
      {
        "path": ["password"],
        "message": "Too small: expected string to have >=8 characters"
      }
    ]
  }
}
```

Cada incidencia tiene un array `path` y un `message` generado por Zod. Los clientes deben usar `path` para
asociar el campo y no deben depender de que el texto del mensaje de validación permanezca estable entre
actualizaciones de dependencias.

### Estructura de error

Los errores de la aplicación usan esta estructura:

```json
{
  "error": {
    "message": "Human-readable message",
    "code": "MACHINE_READABLE_CODE"
  }
}
```

Los errores de validación agregan `error.issues`. Los códigos legibles por máquinas implementados son:

| Código | Estado habitual | Significado |
|---|---|---|
| `VALIDATION_ERROR` | `400` | Campos de solicitud, código de verificación o token de restablecimiento inválidos |
| `UNAUTHORIZED` | `401` | JWT o clave de API ausente o inválido, inicio de sesión inválido o contraseña actual incorrecta |
| `TOKEN_VERSION_MISMATCH` | `401` | JWT invalidado por un cambio o restablecimiento de contraseña |
| `EMAIL_NOT_VERIFIED` | `403` | Credenciales de inicio de sesión correctas, pero la verificación del email está incompleta |
| `NOT_FOUND` | `404` | No se encontró el usuario o la clave de API para la cuenta autenticada |
| `CONFLICT` | `409` | El email de registro ya está en uso |
| `RATE_LIMIT_EXCEEDED` | `429` | Se excedió el límite de intentos de autenticación, reenvíos o cuota diaria |
| `INTERNAL_ERROR` | `500` | Fallo inesperado del servidor |

Un fallo inesperado se sanea:

```json
{
  "error": {
    "message": "Internal server error",
    "code": "INTERNAL_ERROR"
  }
}
```

No existe un handler personalizado para rutas no coincidentes. Una solicitud a una ruta desconocida recibe
la respuesta `404` predeterminada de Express en lugar de la estructura JSON de error de la aplicación.

## Verificación de email y restablecimiento de contraseña

### Modos de entrega

`MAIL_DRIVER=console` escribe los códigos de verificación y las URL de restablecimiento en la salida
estándar del servidor para desarrollo local. No envía emails. `MAIL_DRIVER=smtp` envía emails mediante el
servidor SMTP configurado.

Propiedades de verificación:

| Propiedad | Comportamiento |
|---|---|
| Formato del código | Cadena de seis dígitos |
| Duración | 30 minutos |
| Intentos fallidos | 5 |
| Intervalo de reenvío | 1 minuto |
| Efecto del reenvío | Reemplaza el código y restaura su duración y cantidad de intentos |

Propiedades del restablecimiento de contraseña:

| Propiedad | Comportamiento |
|---|---|
| Duración del token | 15 minutos |
| Reutilización | Un solo uso |
| Nueva solicitud | Elimina los tokens anteriores sin usar de esa cuenta |
| Restablecimiento exitoso | Marca como usados todos los tokens sin usar e invalida los JWT existentes |
| Protección contra revelación | Forgot-password devuelve `204` exista o no el email |

El servidor construye el enlace del email agregando un parámetro de consulta `token` a
`RESET_PASSWORD_URL`. El frontend de esa URL debe leer el token y enviarlo a `POST /auth/reset-password`.

## Referencia del entorno

No confirmes archivos de entorno ni credenciales reales. El comando empaquetado `pnpm start` siempre carga
un archivo `.env` físico porque ejecuta `node --env-file=.env`; mantén ese archivo fuera del control de
versiones y aprovisiónalo de forma segura. Para usar variables de entorno inyectadas directamente por una
plataforma de despliegue o un gestor de secretos sin un archivo físico, omite ese script después de compilar:

```bash
NODE_ENV=production node dist/server.js
```

| Variable | Requisito | Valor predeterminado y restricciones |
|---|---|---|
| `NODE_ENV` | Opcional | `development`; acepta `development`, `test` o `production` |
| `PORT` | Opcional | `3000`; entero de 1 a 65535 |
| `DATABASE_URL` | Obligatoria | Cadena de conexión PostgreSQL no vacía |
| `JWT_SECRET` | Obligatoria, secreta | Al menos 32 caracteres |
| `JWT_ISSUER` | Opcional | `api_limit` |
| `JWT_AUDIENCE` | Opcional | `api_limit_users` |
| `ACCESS_TOKEN_TTL_MINUTES` | Opcional | `15`; entero positivo |
| `MAIL_DRIVER` | Opcional | `console`; acepta `console` o `smtp` |
| `MAIL_FROM` | Opcional | `noreply@example.com`; dirección de email válida |
| `RESET_PASSWORD_URL` | Obligatoria en producción | URL absoluta válida; fuera de producción, fallback local `http://localhost:3000/reset-password` |
| `SMTP_HOST` | Obligatoria con SMTP | No vacía cuando `MAIL_DRIVER=smtp` |
| `SMTP_PORT` | Obligatoria con SMTP | Entero de 1 a 65535 |
| `SMTP_SECURE` | Opcional | Su valor predeterminado es `false` cuando se omite; ver la nota siguiente |
| `SMTP_USER` | Opcional | Nombre de usuario de autenticación SMTP |
| `SMTP_PASS` | Opcional, secreta | Contraseña de autenticación SMTP |
| `LOG_LEVEL` | Opcional | `info`; acepta `trace`, `debug`, `info`, `warn`, `error`, `fatal` o `silent` |
| `TRUST_PROXY` | Opcional | `false`; acepta `true`, `false`, un número de saltos o una cadena de trust-proxy de Express |

Actualmente, `SMTP_SECURE` usa la coerción booleana de JavaScript. Como los valores del entorno son cadenas,
omite la variable para obtener `false`; un valor no vacío, incluida la cadena `"false"`, se convierte en
`true`. Establece `SMTP_SECURE=true` solo para TLS implícito inmediatamente al conectarse. Cuando se omite,
la conexión comienza sin TLS y Nodemailer puede actualizarla con STARTTLS cuando el servidor lo admite.

En producción, establece `TRUST_PROXY` con el valor más restrictivo que coincida con la topología real del
proxy. Dejarlo en `false` detrás de un proxy puede agrupar a los clientes bajo la IP del proxy para la
limitación de autenticación; confiar ciegamente en los headers reenviados permite que los clientes falsifiquen
su IP.

## Desarrollo local

Los requisitos previos son Node.js 22.12.0 o posterior, pnpm y PostgreSQL. Los scripts del paquete
seleccionan su propio archivo de entorno; consulta `.env.example` para ver los marcadores, pero nunca pongas
secretos reales bajo control de versiones.

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

Comandos útiles de verificación:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

| Comando | Propósito |
|---|---|
| `pnpm dev` | Ejecutar el servidor TypeScript en modo watch con configuración de desarrollo |
| `pnpm build` | Compilar TypeScript en `dist/` |
| `pnpm start` | Ejecutar el servidor de producción compilado |
| `pnpm test` | Ejecutar Vitest una vez con configuración de pruebas |
| `pnpm test:watch` | Ejecutar Vitest en modo watch |
| `pnpm typecheck` | Comprobar los tipos sin emitir archivos |
| `pnpm lint` | Ejecutar las comprobaciones de Biome |
| `pnpm format` | Formatear archivos con Biome |
| `pnpm prisma:generate` | Generar el cliente de Prisma |
| `pnpm prisma:migrate` | Crear y aplicar migraciones de desarrollo |
| `pnpm prisma:migrate:prod` | Aplicar migraciones existentes en producción |
| `pnpm prisma:studio` | Abrir Prisma Studio |

`pnpm prisma:migrate` siempre carga `.env.development`; no migra la base de datos de pruebas. Para aplicar
migraciones existentes a la base de datos configurada en `.env.test`, ejecuta:

```bash
NODE_ENV=test node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
```

### Advertencia sobre las pruebas

Las pruebas actuales son principalmente pruebas unitarias y de rutas. Los servicios y repositorios usan
mocks, y las pruebas de rutas simulan las dependencias respaldadas por la base de datos. Por lo tanto,
ejecutar la suite no demuestra la conectividad, el estado de las migraciones, el comportamiento de SQL ni la
autenticación completa de extremo a extremo contra una instancia real de PostgreSQL.

Para comprobar la preparación del despliegue, aplica las migraciones en la base de datos objetivo y verifica
`GET /health/ready` contra la instancia en ejecución. Agrega pruebas de integración específicas cuando sea
necesario ejercitar automáticamente el comportamiento a nivel de base de datos.
