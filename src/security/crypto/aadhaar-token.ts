import crypto from 'crypto';
import { config } from '../../config/env.js';

export interface IAadhaarTokenProvider {
  generateToken(rawAadhaar: string): string;
  mask(rawAadhaar: string): string;
}

/**
 * Keyed HMAC-SHA256 Token Provider
 * Note: This produces an irreversible, keyed pseudonymous lookup token.
 * It is NOT reversible encryption and protects against offline rainbow-table brute-force attacks.
 */
export class HmacAadhaarTokenProvider implements IAadhaarTokenProvider {
  constructor(private secretKey: string = config.AADHAAR_HMAC_SECRET) {}

  public generateToken(rawAadhaar: string): string {
    const cleanAadhaar = rawAadhaar.replace(/\D/g, '').trim();
    if (cleanAadhaar.length !== 12) {
      throw new Error('Invalid Aadhaar number format: must contain exactly 12 digits');
    }

    return crypto
      .createHmac('sha256', this.secretKey)
      .update(`AADHAAR_TOKEN_V1:${cleanAadhaar}`)
      .digest('hex');
  }

  public mask(rawAadhaar: string): string {
    const clean = rawAadhaar.replace(/\D/g, '').trim();
    if (clean.length === 12) {
      return `XXXX-XXXX-${clean.slice(8)}`;
    }
    return 'XXXX-XXXX-XXXX';
  }
}

export const aadhaarTokenProvider = new HmacAadhaarTokenProvider();

/**
 * Helper wrappers for backward compatibility and clean imports
 */
export function hashAadhaar(rawAadhaar: string, customSecret?: string): string {
  if (customSecret) {
    return new HmacAadhaarTokenProvider(customSecret).generateToken(rawAadhaar);
  }
  return aadhaarTokenProvider.generateToken(rawAadhaar);
}

export function maskAadhaar(rawAadhaar: string): string {
  return aadhaarTokenProvider.mask(rawAadhaar);
}

/**
 * SEC-08: Cryptographically secure, non-guessable referral code generator
 * Uses crypto.randomBytes(4) to produce 4 billion+ combinations per day
 */
export function generateSecureReferralCode(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const secureRandomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `REF-${dateStr}-${secureRandomHex}`;
}
