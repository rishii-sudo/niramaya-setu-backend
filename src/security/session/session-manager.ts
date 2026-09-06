import { createHash } from 'crypto';
import { logger } from '../../common/logger/index.js';

interface RevokedTokenEntry {
  tokenHash: string;
  revokedAt: number;
  expiresAt: number;
  reason: string;
}

export class SessionManager {
  private static instance: SessionManager;
  
  // Set of revoked token hashes with expiry
  private revokedTokens: Map<string, RevokedTokenEntry> = new Map();
  
  // Map of userId -> minimum allowed token issuance timestamp (epoch seconds)
  private userRevocationTimestamps: Map<string, number> = new Map();

  // Cleanup interval in ms (every 5 minutes)
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Schedule periodic purge of expired entries
    this.cleanupInterval = setInterval(() => this.cleanupExpiredEntries(), 5 * 60 * 1000);
    // Ensure timer doesn't keep node process alive in unit tests
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Revoke an individual JWT access token (e.g. on logout)
   */
  public revokeToken(token: string, expiresInSeconds: number = 28800, reason = 'LOGOUT'): void {
    if (!token) return;
    const tokenHash = this.hashToken(token);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + expiresInSeconds;

    this.revokedTokens.set(tokenHash, {
      tokenHash,
      revokedAt: now,
      expiresAt,
      reason,
    });

    logger.info({ tokenHash: tokenHash.substring(0, 12), reason }, 'Token successfully revoked');
  }

  /**
   * Check if a specific token has been revoked
   */
  public isTokenRevoked(token: string): boolean {
    if (!token) return true;
    const tokenHash = this.hashToken(token);
    const entry = this.revokedTokens.get(tokenHash);
    
    if (!entry) return false;

    const now = Math.floor(Date.now() / 1000);
    if (now > entry.expiresAt) {
      this.revokedTokens.delete(tokenHash);
      return false;
    }

    return true;
  }

  /**
   * Invalidate all sessions issued to a user before the current timestamp
   */
  public revokeAllUserSessions(userId: string): void {
    if (!userId) return;
    const now = Math.floor(Date.now() / 1000);
    this.userRevocationTimestamps.set(userId, now);
    logger.warn({ userId }, 'All existing sessions revoked for user');
  }

  /**
   * Validate if a user's token issuance timestamp is still valid
   */
  public isUserSessionRevoked(userId: string, tokenIssuedAtSeconds?: number): boolean {
    if (!userId) return true;
    const revokedBefore = this.userRevocationTimestamps.get(userId);
    if (!revokedBefore) return false;

    if (!tokenIssuedAtSeconds) return true;
    return tokenIssuedAtSeconds < revokedBefore;
  }

  /**
   * Purge expired token hash records from memory
   */
  public cleanupExpiredEntries(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [hash, entry] of this.revokedTokens.entries()) {
      if (now > entry.expiresAt) {
        this.revokedTokens.delete(hash);
      }
    }
  }

  /**
   * Reset session manager state (useful for tests)
   */
  public reset(): void {
    this.revokedTokens.clear();
    this.userRevocationTimestamps.clear();
  }
}

export const sessionManager = SessionManager.getInstance();
