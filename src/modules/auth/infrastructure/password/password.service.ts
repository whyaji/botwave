import bcrypt from 'bcryptjs';

import env from '@/src/config/env';

/**
 * Password Service
 * Handles password hashing and verification using bcrypt
 */
export class PasswordService {
  private readonly hashSalt: string | number;

  constructor() {
    const raw = env.HASH_SALT ?? 10;
    this.hashSalt = typeof raw === 'string' ? parseInt(raw, 10) || 10 : raw;
  }

  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.hashSalt);
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }
}

// Export singleton instance
export const passwordService = new PasswordService();
