# WhatsApp Bot Wave API Documentation

## Send Messages

Base path: **`/api/v1/send`**. Auth: **`x-api-key: <apiKey>`** (from App). No JWT.

The API key determines which instance and app are used; `instanceId` and `appId` are resolved server-side.

| Method | Path                    | Description               |
| ------ | ----------------------- | ------------------------- |
| POST   | `/api/v1/send/text`     | Send text message(s)      |
| POST   | `/api/v1/send/file`     | Send file from URL        |
| POST   | `/api/v1/send/raw-file` | Send file from raw upload |

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
  - **Group:** group JID (e.g. `120363401711708233@g.us`). With API key use `GET /api/v1/get/groups`; with JWT use `GET /api/instances/:id/groups` (use the `id` field).
- **`text`**: Non-empty string.

**Sending to groups:** Use the same request format. Set `to` to the group JID (or an array including group JIDs). No extra parameters needed.

**Response:**

```json
{
  "success": true,
  "data": {
    "jobId": "42",
    "status": "queued"
  }
}
```

**Errors:** `400` if instance not connected or validation error; `401` invalid/missing API key; `403` app inactive.

---

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

- **`to`**: Same as text — phone number(s) and/or group JID(s) (from `GET /api/v1/get/groups` or `GET /api/instances/:id/groups`).
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

**Response:**

```json
{
  "success": true,
  "data": {
    "jobId": "43",
    "status": "queued"
  }
}
```

---

### POST /api/v1/send/raw-file

**Headers:** `x-api-key: <apiKey>`, `Content-Type: multipart/form-data`

**Form-Data Fields:**

- **`to`**: Phone number(s) and/or group JID(s) (string, array of strings, or comma-separated list).
- **`caption`**: Optional caption (string).
- **`file`**: The raw file to upload. Max file size: **100 MB**.

**Response:**

```json
{
  "success": true,
  "data": {
    "jobId": "44",
    "status": "queued"
  }
}
```

---

## Get (for other services)

Base path: **`/api/v1/get`**. Auth: **`x-api-key: <apiKey>`** (from App). No JWT.

Same as Send: the API key identifies the app and its linked instance. Use these endpoints to read data (e.g. groups) for that instance.

| Method | Path                 | Description                                 |
| ------ | -------------------- | ------------------------------------------- |
| GET    | `/api/v1/get/groups` | List WhatsApp groups for the app's instance |

### GET /api/v1/get/groups

**Headers:** `x-api-key: <apiKey>`

Returns all groups the instance is participating in. The instance must be **connected**.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "120363401711708233@g.us",
      "name": "My Group Name"
    }
  ]
}
```

---

## Job Status

Base path: **`/api/v1/jobs-status`**. Auth: **`x-api-key: <apiKey>`** (from App). No JWT.

| Method | Path                          | Description                                                 |
| ------ | ----------------------------- | ----------------------------------------------------------- |
| POST   | `/api/v1/jobs-status/summary` | Get job IDs grouped by status (via JSON body `ids` or `id`) |

### POST /api/v1/jobs-status/summary

**Headers:** `x-api-key: <apiKey>`, `Content-Type: application/json`

**Body:**

```json
{
  "ids": [42, 43, 44]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "Pending": [],
    "Processing": [],
    "Completed": [42, 43],
    "Failed": [44],
    "Cancelled": []
  }
}
```
