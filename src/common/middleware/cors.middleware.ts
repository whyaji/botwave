import { Context, Next } from 'hono';

import env from '@/src/config/env';

/**
 * CORS middleware
 * Handles Cross-Origin Resource Sharing headers
 */
export async function corsMiddleware(c: Context, next: Next) {
  const origin = c.req.header('Origin');

  // Allow requests from allowed origins or all origins in development
  const isDevelopment = env.NODE_ENV === 'development';

  // ✅ Debug logging disabled to prevent log flooding
  // if (isDevelopment) {
  //   console.log('[CORS] Development mode - allowing origin:', origin);
  // }
  const allowedOrigins = isDevelopment
    ? ['*'] // Allow all origins in development
    : [
        'http://localhost:8685',
        'http://localhost:8785',
        env.APP_URL,
        // Add production origins here
      ];

  // Set CORS headers - always set in development, or if origin is allowed
  if (isDevelopment) {
    // In development, always allow any origin
    c.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    // In production, check if origin is in allowed list
    if (origin && allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      // No origin header (e.g., same-origin or Postman)
      c.header('Access-Control-Allow-Origin', '*');
    }
    // If origin is not allowed, don't set the header (browser will block)
  }

  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-API-Key'
  );
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    // Return 204 with CORS headers
    // Headers are already set above using c.header()
    // Use newResponse to preserve headers
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': isDevelopment
          ? origin || '*'
          : origin && allowedOrigins.includes(origin)
            ? origin
            : '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-API-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();
}
