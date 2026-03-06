# WebSocket — Real-time instance events

External services can subscribe to WhatsApp events for a specific instance over a WebSocket connection. Events include incoming messages, presence updates, and other Baileys/WhatsApp lifecycle events.

## Endpoint

```
ws://<host>/ws/instance/<instanceId>?token=<accessToken>
```

- **`<host>`:** Same as your API host (e.g. `localhost:8080`).
- **`<instanceId>`:** Numeric instance ID (same as in `/api/instances`).
- **`token`:** JWT **access token** (same value as in `Authorization: Bearer <accessToken>`). Required; connection is rejected if missing or invalid.

## Connection flow

1. Obtain an access token via `POST /api/auth/login` or `POST /api/auth/refresh`.
2. Open WebSocket: `new WebSocket(\`ws://host/ws/instance/${instanceId}?token=${accessToken}\`)`.
3. Handle incoming messages: each message is a JSON string (event payload from the WhatsApp connection).
4. On token expiry, close the socket and reconnect with a new token (from refresh).

## Behavior

- **Server → client:** Server pushes JSON-stringified events. Structure depends on Baileys/WhatsApp event types (e.g. messages, presence, connection updates).
- **Client → server:** No specific message format is required; the server uses this channel only to push events.
- **Reconnection:** If the connection drops, reconnect using the same URL. Use a new token after refresh.

## Errors (HTTP/upgrade)

- **401 Missing token** — `token` query parameter not provided.
- **401 Invalid or expired token** — JWT invalid or expired.
- **400 Invalid instance id** — `instanceId` in path is not a valid number.

These are returned during the HTTP upgrade; the WebSocket connection will not be established.

## Example (browser)

```js
const instanceId = 1;
const accessToken = 'eyJ...';
const ws = new WebSocket(`ws://localhost:8080/ws/instance/${instanceId}?token=${accessToken}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};

ws.onclose = (event) => {
  console.log('Closed', event.code, event.reason);
};
```

Other services (Node, Python, etc.) should use the same URL and pass the JWT in the `token` query parameter.
