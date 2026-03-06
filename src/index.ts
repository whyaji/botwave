import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

import { corsMiddleware } from './common/middleware/cors.middleware';
import { errorMiddleware } from './common/middleware/error.middleware';
import { appsRoutes } from './routes/apps.routes';
import { authRoutes } from './routes/auth.routes';
import { instancesRoutes } from './routes/instances.routes';
import { jobsRoutes } from './routes/jobs.routes';
import { sendRoutes } from './routes/send.routes';
import { usersRoutes } from './routes/users.routes';

const app = new Hono();

app.use('*', corsMiddleware);
app.use('*', errorMiddleware);

app.route('/api/auth', authRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/instances', instancesRoutes);
app.route('/api/apps', appsRoutes);
app.route('/api/jobs', jobsRoutes);
app.route('/api/v1/send', sendRoutes);

// Serve static files from the built frontend (catch-all for SPA routing)
app.get('*', serveStatic({ root: './frontend/dist' }));

// Fallback to index.html for client-side routing
app.get('*', serveStatic({ path: './frontend/dist/index.html' }));

export default app;
