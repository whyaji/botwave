# Authentication

External services can use **JWT** (dashboard/management) or **API Key** (sending messages only).

## JWT (Dashboard / management APIs)

Used for: `/api/auth`, `/api/users`, `/api/instances`, `/api/apps`, `/api/jobs`.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Success (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "expiresIn": 3600,
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "User Name",
      "role": "admin"
    }
  }
}
```

- Use `accessToken` in the `Authorization` header for all subsequent requests:  
  `Authorization: Bearer <accessToken>`
- Use `refreshToken` with `POST /api/auth/refresh` when the access token expires (`expiresIn` is in seconds).

### Refresh token

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

Returns the same shape as login: `accessToken`, `refreshToken`, `expiresIn`, `user`.

### Current user

```http
GET /api/auth/me
Authorization: Bearer <accessToken>
```

Returns the authenticated user profile (id, email, name, role, isActive, createdAt, updatedAt).

### Errors

- `401` — Invalid credentials, invalid/expired token, or missing `Authorization: Bearer ...`
- `400` — Validation error (e.g. invalid email format); `details` may contain field errors

---

## API Key (Send API only)

Used for: **`/api/v1/send/text`** and **`/api/v1/send/file`** only.

- Create an **App** via `POST /api/apps` (with JWT). The response includes `apiKey` — **store it securely; it is not returned again.**
- Send requests with header: **`x-api-key: <apiKey>`** (or `X-API-Key`).

No Bearer token is required for send endpoints; the API key identifies the app and its linked WhatsApp instance.

### Errors

- `401` — Missing or invalid `x-api-key`
- `403` — App exists but is inactive
