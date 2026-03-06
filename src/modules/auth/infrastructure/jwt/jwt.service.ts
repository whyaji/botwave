import { sign, verify } from 'hono/jwt';

import env from '@/src/config/env';

/**
 * JWT Token Payload for Access Token (panel)
 */
export interface AccessTokenPayload {
  sub: number; // User ID
  email: string;
  role: string; // superadmin | admin | user
  iat: number; // Issued at
  exp: number; // Expires at
  [key: string]: unknown; // Index signature for JWT compatibility
}

/**
 * JWT Token Payload for Refresh Token
 */
export interface RefreshTokenPayload {
  sub: number; // User ID
  tokenId: string; // Unique token ID for revocation
  iat: number;
  exp: number;
  [key: string]: unknown; // Index signature for JWT compatibility
}

/**
 * JWT Service
 * Handles JWT token generation and verification
 */
export class JwtService {
  private readonly secret: string;
  private readonly accessTokenExpiresIn: number; // 1 hour
  private readonly refreshTokenExpiresIn: number; // 7 days

  constructor() {
    this.secret = env.JWT_SECRET;
    this.accessTokenExpiresIn = env.JWT_EXPS ? parseInt(env.JWT_EXPS, 10) : 3600;
    this.refreshTokenExpiresIn = env.JWT_REFRESH_EXPS ? parseInt(env.JWT_REFRESH_EXPS, 10) : 604800;
  }

  /**
   * Generate access token
   */
  async generateAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.accessTokenExpiresIn; // 1 hour in seconds

    const tokenPayload = {
      ...payload,
      iat: now,
      exp,
    } as AccessTokenPayload;

    return await sign(tokenPayload, this.secret, 'HS256');
  }

  /**
   * Generate refresh token
   */
  async generateRefreshToken(userId: number, tokenId: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.refreshTokenExpiresIn; // 7 days in seconds

    const tokenPayload: RefreshTokenPayload = {
      sub: userId,
      tokenId,
      iat: now,
      exp,
    };

    return await sign(tokenPayload, this.secret, 'HS256');
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await verify(token, this.secret, 'HS256');
      return payload as unknown as AccessTokenPayload;
    } catch (error) {
      // ✅ FIX: Include original error details for better debugging
      throw new Error(
        `Invalid or expired token: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await verify(token, this.secret, 'HS256');
      return payload as unknown as RefreshTokenPayload;
    } catch (error) {
      // ✅ FIX: Include original error details for better debugging
      throw new Error(
        `Invalid or expired refresh token: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

// Export singleton instance
export const jwtService = new JwtService();
