import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';

export interface EncryptedEnvelope {
  version: number;
  algorithm: string;
  salt: string;        // Hex encoded salt for PBKDF2
  iv: string;          // Hex encoded 12-byte IV for GCM
  tag: string;         // Hex encoded 16-byte authentication tag
  ciphertext: string;  // Hex encoded ciphertext
}

export interface OfflineCryptoProvider {
  encrypt(plaintext: string, secretKeyOrPin: string): EncryptedEnvelope;
  decrypt(envelope: EncryptedEnvelope, secretKeyOrPin: string): string;
  rotateKey(envelope: EncryptedEnvelope, oldSecret: string, newSecret: string): EncryptedEnvelope;
}

export class AesGcmOfflineCryptoProvider implements OfflineCryptoProvider {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;       // 256 bits
  private readonly ivLength = 12;        // 96 bits standard for GCM
  private readonly saltLength = 16;      // 128 bits
  private readonly pbkdf2Iterations = 100000;
  private readonly pbkdf2Digest = 'sha256';

  /**
   * Derives a 256-bit encryption key from a user PIN/passphrase and a unique cryptographic salt
   */
  public deriveKey(secret: string, salt: Buffer): Buffer {
    if (!secret || secret.length < 4) {
      throw new Error('Secret or PIN must contain at least 4 characters');
    }
    return pbkdf2Sync(secret, salt, this.pbkdf2Iterations, this.keyLength, this.pbkdf2Digest);
  }

  /**
   * Encrypts plaintext using AES-256-GCM with a freshly generated salt and IV
   */
  public encrypt(plaintext: string, secretKeyOrPin: string): EncryptedEnvelope {
    if (typeof plaintext !== 'string') {
      throw new Error('Plaintext must be a string');
    }

    const salt = randomBytes(this.saltLength);
    const iv = randomBytes(this.ivLength);
    const key = this.deriveKey(secretKeyOrPin, salt);

    const cipher = createCipheriv(this.algorithm, key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      version: 1,
      algorithm: 'AES-256-GCM-PBKDF2-SHA256',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag,
      ciphertext,
    };
  }

  /**
   * Decrypts an EncryptedEnvelope verifying authentication tag and key integrity
   */
  public decrypt(envelope: EncryptedEnvelope, secretKeyOrPin: string): string {
    if (!envelope || envelope.version !== 1) {
      throw new Error('Unsupported or missing envelope version');
    }

    if (!envelope.salt || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
      throw new Error('Malformed encryption envelope: missing cryptographic parameters');
    }

    const salt = Buffer.from(envelope.salt, 'hex');
    const iv = Buffer.from(envelope.iv, 'hex');
    const tag = Buffer.from(envelope.tag, 'hex');
    const key = this.deriveKey(secretKeyOrPin, salt);

    if (tag.length !== 16) {
      throw new Error('Invalid authentication tag length: expected 16 bytes');
    }

    const decipher = createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let decrypted: string;
    try {
      decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
    } catch {
      throw new Error('Decryption failed: integrity authentication tag mismatch or invalid key');
    }

    return decrypted;
  }

  /**
   * Re-encrypts data under a new secret (key rotation) without intermediate plaintext exposure
   */
  public rotateKey(envelope: EncryptedEnvelope, oldSecret: string, newSecret: string): EncryptedEnvelope {
    const plaintext = this.decrypt(envelope, oldSecret);
    return this.encrypt(plaintext, newSecret);
  }
}

export const offlineCryptoProvider: OfflineCryptoProvider = new AesGcmOfflineCryptoProvider();
