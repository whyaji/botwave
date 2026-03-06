import { createHash, randomBytes } from 'node:crypto';

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}
