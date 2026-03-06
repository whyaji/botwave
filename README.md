# BotWave API — Documentation for External Services

This documentation is for **other services** that integrate with the BotWave (bot-wa-pnp) API: WhatsApp instance management, sending messages, and receiving real-time events.

## Overview

- **Base URL:** `http://localhost:8080` (or your deployed host; default port `8080`)
- **API prefix:** REST endpoints are under `/api/*` and `/api/v1/*`
- **Responses:** JSON. Success: `{ "success": true, "data": ... }`. Error: `{ "success": false, "error": { "code", "message", "details?" } }`

## Authentication

- **JWT:** Used for `/api/auth`, `/api/users`, `/api/instances`, `/api/apps`, `/api/jobs`. Get tokens with email/password login.
- **API Key:** Used for `/api/v1/send/*` only. Each App is tied to one WhatsApp instance; the key identifies the app and instance.

Details: [Authentication](./docs//authentication.md)

## Quick links

- [Authentication](./docs/authentication.md) — Login, refresh, API key usage
- [API Reference](./docs/API.md) — All endpoints, request/response shapes, errors
- [WebSocket](./docs/websocket.md) — Real-time events per instance

## Integration flow (other services)

1. **Get JWT** (if you need to manage resources): `POST /api/auth/login` with `email` and `password`.
2. **Create an App** (for sending): `POST /api/apps` with `name`, optional `description`, and `instanceId`. Store the returned `apiKey` (shown only once).
3. **Connect instance** (if not already): `POST /api/instances/:id/connect` (scan QR if needed).
4. **Send messages**: `POST /api/v1/send/text` or `POST /api/v1/send/file` with header `x-api-key: <apiKey>` and body (e.g. `to`, `text` or `to`, `fileUrl`).
5. **Optional — Real-time events**: Connect to `ws://host/ws/instance/:instanceId?token=<accessToken>` to receive WhatsApp events (messages, presence, etc.) for that instance.

All endpoints, request/response formats, and error codes are described in [API Reference](./API.md).
