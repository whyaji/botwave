import 'dotenv/config';

import { jwtService } from '@/src/modules/auth/infrastructure/jwt/jwt.service';
import {
  reconnectPreviouslyConnectedInstances,
  subscribe,
} from '@/src/services/wa/instance-manager';

import env from './config/env';
import app from './index';
import { scheduleJobsCleanup } from './services/queue/jobs-cleanup-queue';
import { startWorker } from './worker';

const WS_PATH_PREFIX = '/ws/instance/';

type WSData = {
  instanceId: number;
  unsubscribe?: () => void;
};

const server = Bun.serve<WSData>({
  port: parseInt(env.PORT, 10) || 8080,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') === 'websocket' && url.pathname.startsWith(WS_PATH_PREFIX)) {
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response('Missing token', { status: 401 });
      }
      const instanceIdStr = url.pathname.slice(WS_PATH_PREFIX.length).replace(/\/$/, '');
      const instanceId = parseInt(instanceIdStr, 10);
      if (Number.isNaN(instanceId)) {
        return new Response('Invalid instance id', { status: 400 });
      }
      try {
        jwtService.verifyAccessToken(token);
      } catch {
        return new Response('Invalid or expired token', { status: 401 });
      }
      const upgraded = srv.upgrade(req, {
        data: { instanceId },
      });
      if (!upgraded) {
        return new Response('Upgrade failed', { status: 500 });
      }
      return undefined;
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const data = ws.data;
      const instanceId = data.instanceId;
      data.unsubscribe = subscribe(instanceId, (msg) => {
        try {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify(msg));
          }
        } catch {
          // ignore
        }
      });
    },
    message() {
      // no-op: we only push from server
    },
    close(ws) {
      const data = ws.data;
      if (data.unsubscribe) {
        data.unsubscribe();
      }
    },
  },
});

startWorker();
scheduleJobsCleanup().catch((err) => console.error('Schedule jobs cleanup failed:', err));
reconnectPreviouslyConnectedInstances().catch((err) =>
  console.error('Reconnect of previously connected instances failed:', err)
);
console.log(`BotWave server running at http://localhost:${server.port}`);
