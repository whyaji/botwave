# API Reference

Base URL: `http://localhost:8080` (or your host). All responses are JSON.

**Success:** `{ "success": true, "data": <T> }` (optional `meta` for paginated lists).  
**Error:** `{ "success": false, "error": { "code": string, "message": string, "details"?: unknown } }`

---

## Auth

| Method | Path                | Auth   | Description                                               |
| ------ | ------------------- | ------ | --------------------------------------------------------- |
| POST   | `/api/auth/login`   | None   | Login with email/password; returns access + refresh token |
| POST   | `/api/auth/refresh` | None   | Exchange refresh token for new access token               |
| GET    | `/api/auth/me`      | Bearer | Current user profile                                      |

### POST /api/auth/login

**Body:** `{ "email": string, "password": string }`  
**Response:** `data`: `{ accessToken, refreshToken, expiresIn, user: { id, email, name, role } }`

### POST /api/auth/refresh

**Body:** `{ "refreshToken": string }`  
**Response:** Same shape as login.

### GET /api/auth/me

**Headers:** `Authorization: Bearer <accessToken>`  
**Response:** `data`: user object (id, email, name, role, isActive, createdAt, updatedAt).

---

## Users

All require **JWT** and role **superadmin** or **admin**.

| Method | Path             | Description                      |
| ------ | ---------------- | -------------------------------- |
| GET    | `/api/users`     | List users (paginated, search)   |
| GET    | `/api/users/:id` | Get user by id                   |
| POST   | `/api/users`     | Create user                      |
| PUT    | `/api/users/:id` | Update user                      |
| DELETE | `/api/users/:id` | Delete user (cannot delete self) |

### GET /api/users

**Query:** `page` (default 1), `limit` (default 10, max 50), `search` (optional, matches email/name).  
**Response:** `{ success: true, data: User[], meta: { page, limit, total, totalPages } }`

### POST /api/users

**Body:** `{ "email": string, "password": string (min 6), "name": string, "role": "superadmin" | "admin" | "user" }`  
**Response:** `data`: created user (no password).

### PUT /api/users/:id

**Body:** optional `email`, `password` (min 6), `name`, `role`, `isActive` (0 or 1).  
**Response:** `data`: updated user.

---

## Instances

All require **JWT**. Instance = one WhatsApp connection (one phone/number).

| Method | Path                            | Description                                       |
| ------ | ------------------------------- | ------------------------------------------------- |
| GET    | `/api/instances`                | List all instances                                |
| GET    | `/api/instances/:id`            | Get instance by id                                |
| POST   | `/api/instances`                | Create instance                                   |
| POST   | `/api/instances/:id/connect`    | Start connection (may require QR scan)            |
| POST   | `/api/instances/:id/disconnect` | Disconnect                                        |
| GET    | `/api/instances/:id/groups`     | List WhatsApp groups (instance must be connected) |
| DELETE | `/api/instances/:id`            | Delete instance (disconnects first)               |

### POST /api/instances

**Body:** `{ "name": string, "description"?: string }`  
**Response:** `data`: instance (id, name, description, status, createdBy, createdAt, etc.). Status initially `disconnected`.

### POST /api/instances/:id/connect

Starts WhatsApp connection; if not linked, frontend typically shows QR for user to scan.  
**Response:** `data`: updated instance (status may become `connected` after QR scan).

### GET /api/instances/:id/groups

Instance must be `connected`.  
**Response:** `data`: `[{ id: string (JID), name: string }, ...]`

---

## Apps

All require **JWT**. An App links an external service to one instance and has an **API key** for the Send API.

| Method | Path                               | Description                                    |
| ------ | ---------------------------------- | ---------------------------------------------- |
| GET    | `/api/apps`                        | List apps                                      |
| GET    | `/api/apps/:id`                    | Get app by id                                  |
| POST   | `/api/apps`                        | Create app (returns `apiKey` once)             |
| PUT    | `/api/apps/:id`                    | Update app                                     |
| POST   | `/api/apps/:id/regenerate-api-key` | Regenerate API key (returns new `apiKey` once) |
| DELETE | `/api/apps/:id`                    | Delete app                                     |

### POST /api/apps

**Body:** `{ "name": string, "description"?: string, "instanceId": number }`  
**Response:** `data`: app fields **plus** `apiKey`. Store `apiKey`; it is not returned again on GET.

### PUT /api/apps/:id

**Body:** optional `name`, `description`, `instanceId`, `isActive` (0 or 1).  
**Response:** `data`: updated app (no apiKey).

### POST /api/apps/:id/regenerate-api-key

**Body:** none.  
**Response:** `data`: `{ "apiKey": string }`. The previous API key is invalidated; store the new key, it is not returned again.

---

## Jobs

All require **JWT**. Jobs represent queued work (e.g. send message). Created by Send API; listed here for status.

| Method | Path            | Description                       |
| ------ | --------------- | --------------------------------- |
| GET    | `/api/jobs`     | List jobs (paginated, filterable) |
| GET    | `/api/jobs/:id` | Get job by id                     |

### GET /api/jobs

**Query:** `page`, `limit`, `type` (e.g. `send_wa_message`), `status` (e.g. `Pending`, `Processing`, `Completed`, `Failed`, `Cancelled`).  
**Response:** `{ success: true, data: Job[], meta: { page, limit, total, totalPages } }`

### GET /api/jobs/:id

**Response:** `data`: job (id, type, payload, status, createdBy, createdAt, etc.).

---

## Send (for other services)

Base path: **`/api/v1/send`**. Auth: **`x-api-key: <apiKey>`** (from App). No JWT.

The API key determines which instance and app are used; `instanceId` and `appId` are resolved server-side.

| Method | Path                | Description          |
| ------ | ------------------- | -------------------- |
| POST   | `/api/v1/send/text` | Send text message(s) |
| POST   | `/api/v1/send/file` | Send file from URL   |

### POST /api/v1/send/text

**Headers:** `x-api-key: <apiKey>`, `Content-Type: application/json`

**Body:**

```json
{
  "to": "6281234567890",
  "text": "Hello world"
}
```

Or multiple recipients:

```json
{
  "to": ["6281234567890", "120363401711708233@g.us"],
  "text": "Hello everyone"
}
```

- **`to`**: Single string or array of strings. Each entry is either:
  - **Private chat:** phone number with country code, no `+` (e.g. `6281234567890`).
  - **Group:** group JID (e.g. `120363401711708233@g.us`). Get group IDs from `GET /api/instances/:id/groups` (use the `id` field).
- **`text`**: Non-empty string.

**Sending to groups:** Use the same request format. Set `to` to the group JID (or an array including group JIDs). No extra parameters needed.

**Response:** `data`: `{ "jobId": string, "status": "queued" }`. Use job id with `GET /api/jobs/:id` (with JWT) to check completion.

**Errors:** `400` if instance not connected or validation error; `401` invalid/missing API key; `403` app inactive.

### POST /api/v1/send/file

**Headers:** `x-api-key: <apiKey>`, `Content-Type: application/json`

**Body:**

```json
{
  "to": "6281234567890",
  "fileUrl": "https://example.com/photo.jpg",
  "caption": "Optional caption",
  "fileName": "Optional filename",
  "fileType": "image"
}
```

- **`to`**: Same as text — phone number(s) and/or group JID(s) (from `GET /api/instances/:id/groups`).
- **`fileUrl`**: Public URL of the file; WhatsApp fetches and sends it.
- **`caption`**, **`fileName`**: Optional.
- **`fileType`**: Optional. One of `image`, `video`, `audio`, `document`. If omitted, the server infers the type from **`fileName`** or from the URL path (e.g. `.jpg` → image, `.mp4` → video, `.pdf` → document). Use this to force the message type when the URL has no extension.

**File type inference (when `fileType` is not set):**

| Inferred type | Extensions                             |
| ------------- | -------------------------------------- |
| image         | jpg, jpeg, png, gif, webp, bmp         |
| video         | mp4, webm, mov, avi, mkv, 3gp, m4v     |
| audio         | mp3, ogg, m4a, aac, wav, oga, opus     |
| document      | everything else (pdf, doc, docx, etc.) |

**Response:** Same as text: `{ "jobId": string, "status": "queued" }`.

---

## WebSocket (real-time events)

Connect to receive WhatsApp events (incoming messages, presence, etc.) for one instance.

- **URL:** `ws://<host>/ws/instance/<instanceId>?token=<accessToken>`
- **Auth:** `accessToken` = JWT access token (same as `Authorization: Bearer <accessToken>`).
- **Behavior:** Server pushes JSON messages; client does not need to send messages. Reconnect with same URL when token is refreshed.

See [WebSocket](./websocket.md) for details.

---

## Common error codes

| Code             | HTTP | Meaning                                        |
| ---------------- | ---- | ---------------------------------------------- |
| UNAUTHORIZED     | 401  | Missing/invalid token or API key               |
| TOKEN_EXPIRED    | 401  | JWT expired                                    |
| FORBIDDEN        | 403  | No permission or app inactive                  |
| NOT_FOUND        | 404  | Resource not found                             |
| VALIDATION_ERROR | 400  | Invalid body/query/params; see `error.details` |
| CONFLICT         | 409  | e.g. email already registered                  |
| BAD_REQUEST      | 400  | e.g. instance not connected for send           |
| INTERNAL_ERROR   | 500  | Server error                                   |
