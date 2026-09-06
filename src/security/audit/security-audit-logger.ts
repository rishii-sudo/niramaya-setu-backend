import { createHash, randomUUID } from 'crypto';
import { logger } from '../../common/logger/index.js';

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'AUTHORIZATION_FAILURE'
  | 'BOLA_ATTEMPT'
  | 'PATIENT_RECORD_ACCESSED'
  | 'PATIENT_HISTORY_ACCESSED'
  | 'REFERRAL_CREATED'
  | 'REFERRAL_STATUS_UPDATED'
  | 'SYNC_MUTATION_PROCESSED'
  | 'SYNC_REPLAY_DETECTED'
  | 'SYNC_MUTATION_REJECTED'
  | 'ANOMALY_DETECTED'
  | 'SUSPICIOUS_API_ACTIVITY';

export interface SecurityEventInput {
  eventType: SecurityEventType;
  actorId?: string;
  actorRole?: string;
  facilityId?: string;
  resourceType?: string;
  resourceId?: string;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED' | 'FLAGGED';
  requestId?: string;
  clientIp?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface SecurityEvent extends SecurityEventInput {
  eventId: string;
  timestamp: string;
  sequenceNumber: number;
  previousHash: string;
  currentHash: string;
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class SecurityAuditLogger {
  private static instance: SecurityAuditLogger;
  private eventChain: SecurityEvent[] = [];
  private latestHash: string = GENESIS_HASH;

  public static getInstance(): SecurityAuditLogger {
    if (!SecurityAuditLogger.instance) {
      SecurityAuditLogger.instance = new SecurityAuditLogger();
    }
    return SecurityAuditLogger.instance;
  }

  /**
   * Generates a deterministic canonical string representation of the event
   */
  private canonicalize(event: Omit<SecurityEvent, 'currentHash'>): string {
    return JSON.stringify({
      sequenceNumber: event.sequenceNumber,
      eventId: event.eventId,
      timestamp: event.timestamp,
      eventType: event.eventType,
      actorId: event.actorId || '',
      actorRole: event.actorRole || '',
      facilityId: event.facilityId || '',
      resourceType: event.resourceType || '',
      resourceId: event.resourceId || '',
      result: event.result,
      requestId: event.requestId || '',
      clientIp: event.clientIp || '',
      metadata: event.metadata || {},
      previousHash: event.previousHash,
    });
  }

  /**
   * Computes SHA-256 hash of previous hash + canonical event
   */
  private computeHash(previousHash: string, canonicalEvent: string): string {
    return createHash('sha256')
      .update(previousHash + ':' + canonicalEvent)
      .digest('hex');
  }

  /**
   * Records a tamper-evident security event in the cryptographic chain
   */
  public logEvent(input: SecurityEventInput): SecurityEvent {
    // Redact any accidental sensitive fields in metadata
    const sanitizedMetadata: Record<string, any> = {};
    if (input.metadata) {
      for (const [k, v] of Object.entries(input.metadata)) {
        const lowerKey = k.toLowerCase();
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('aadhaar') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('notes')
        ) {
          sanitizedMetadata[k] = '[REDACTED]';
        } else {
          sanitizedMetadata[k] = v;
        }
      }
    }

    const sequenceNumber = this.eventChain.length;
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    const previousHash = this.latestHash;

    const partialEvent: Omit<SecurityEvent, 'currentHash'> = {
      ...input,
      metadata: sanitizedMetadata,
      eventId,
      timestamp,
      sequenceNumber,
      previousHash,
    };

    const canonical = this.canonicalize(partialEvent);
    const currentHash = this.computeHash(previousHash, canonical);

    const fullEvent: SecurityEvent = {
      ...partialEvent,
      currentHash,
    };

    this.eventChain.push(fullEvent);
    this.latestHash = currentHash;

    // Structured application log
    logger.info(
      {
        securityEventId: eventId,
        eventType: input.eventType,
        actorId: input.actorId,
        result: input.result,
        hash: currentHash.substring(0, 16),
      },
      'Security Audit Event Logged'
    );

    return fullEvent;
  }

  /**
   * Verifies the cryptographic integrity of the entire audit event hash chain
   */
  public verifyChainIntegrity(): {
    valid: boolean;
    brokenIndex?: number;
    totalEvents: number;
    latestHash: string;
  } {
    let expectedPreviousHash = GENESIS_HASH;

    for (let i = 0; i < this.eventChain.length; i++) {
      const event = this.eventChain[i];

      if (event.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          brokenIndex: i,
          totalEvents: this.eventChain.length,
          latestHash: this.latestHash,
        };
      }

      const canonical = this.canonicalize(event);
      const computedHash = this.computeHash(event.previousHash, canonical);

      if (event.currentHash !== computedHash) {
        return {
          valid: false,
          brokenIndex: i,
          totalEvents: this.eventChain.length,
          latestHash: this.latestHash,
        };
      }

      expectedPreviousHash = event.currentHash;
    }

    return {
      valid: true,
      totalEvents: this.eventChain.length,
      latestHash: this.latestHash,
    };
  }

  /**
   * Returns a copy of the event chain (read-only)
   */
  public getEvents(limit = 100): SecurityEvent[] {
    return this.eventChain.slice(-limit);
  }

  /**
   * Resets the chain (for unit test isolation)
   */
  public reset(): void {
    this.eventChain = [];
    this.latestHash = GENESIS_HASH;
  }
}

export const securityAuditLogger = SecurityAuditLogger.getInstance();
