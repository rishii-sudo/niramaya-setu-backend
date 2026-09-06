import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { offlineCryptoProvider, AesGcmOfflineCryptoProvider } from '../src/security/crypto/offline-crypto.js';
import { sessionManager } from '../src/security/session/session-manager.js';
import { securityAuditLogger } from '../src/security/audit/security-audit-logger.js';
import { anomalyDetector } from '../src/security/monitoring/anomaly-detector.js';
import { AccessControlService } from '../src/security/authorization/access-control.js';
import { ReferralStatus, UserRole } from '@prisma/client';
import { hashAadhaar, maskAadhaar } from '../src/security/crypto/aadhaar-token.js';

describe('🛡️ NIRAMAYA SETU — PHASE 3 ADVANCED SECURITY REGRESSION TEST SUITE', () => {
  const accessControl = new AccessControlService();

  beforeEach(() => {
    sessionManager.reset();
    securityAuditLogger.reset();
    anomalyDetector.reset();
  });

  // =========================================================================
  // 1. Session Security & Revocation Tests
  // =========================================================================
  describe('SEC3-01: Session Lifecycle & Token Revocation', () => {
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3ItMSIsInJvbGUiOiJBU0hBIn0.test_sig';

    it('1. Token Revocation: Explicitly revoked token is marked as revoked', () => {
      assert.equal(sessionManager.isTokenRevoked(testToken), false);
      sessionManager.revokeToken(testToken, 3600, 'USER_LOGOUT');
      assert.equal(sessionManager.isTokenRevoked(testToken), true);
    });

    it('2. User-Wide Revocation: Invalidation affects all tokens issued prior to revocation time', () => {
      const userId = 'usr-asha-1024';
      const oldIssueTime = Math.floor(Date.now() / 1000) - 300; // 5 mins ago
      
      assert.equal(sessionManager.isUserSessionRevoked(userId, oldIssueTime), false);
      
      sessionManager.revokeAllUserSessions(userId);
      
      // Old token is now revoked
      assert.equal(sessionManager.isUserSessionRevoked(userId, oldIssueTime), true);
      
      // Newly issued token after revocation is valid
      const newIssueTime = Math.floor(Date.now() / 1000) + 10;
      assert.equal(sessionManager.isUserSessionRevoked(userId, newIssueTime), false);
    });

    it('3. Null/Empty Token Defense: Rejects empty or undefined token strings safely', () => {
      assert.equal(sessionManager.isTokenRevoked(''), true);
      assert.equal(sessionManager.isTokenRevoked(null as any), true);
    });
  });

  // =========================================================================
  // 2. Offline AES-256-GCM Envelope Encryption Tests
  // =========================================================================
  describe('SEC3-02: Offline Envelope Encryption (AES-256-GCM + PBKDF2)', () => {
    const sensitiveData = JSON.stringify({
      patientName: 'Suresh Patil',
      vitals: { systolicBp: 160, diastolicBp: 100, spo2: 92.5 },
      village: 'Karjat Rural',
    });
    const correctPin = '7894';
    const wrongPin = '1234';

    it('4. Round-Trip Encryption: Successfully encrypts and decrypts sensitive payload', () => {
      const envelope = offlineCryptoProvider.encrypt(sensitiveData, correctPin);
      
      assert.equal(envelope.version, 1);
      assert.equal(envelope.algorithm, 'AES-256-GCM-PBKDF2-SHA256');
      assert.equal(typeof envelope.salt, 'string');
      assert.equal(typeof envelope.iv, 'string');
      assert.equal(typeof envelope.tag, 'string');
      assert.equal(typeof envelope.ciphertext, 'string');
      
      // Decrypt with correct PIN
      const decrypted = offlineCryptoProvider.decrypt(envelope, correctPin);
      assert.equal(decrypted, sensitiveData);
    });

    it('5. Wrong Key Rejection: Decryption fails with authentication tag mismatch when given wrong PIN', () => {
      const envelope = offlineCryptoProvider.encrypt(sensitiveData, correctPin);
      assert.throws(() => {
        offlineCryptoProvider.decrypt(envelope, wrongPin);
      }, /Decryption failed: integrity authentication tag mismatch/);
    });

    it('6. Ciphertext Tampering Rejection: Modifying ciphertext bit triggers authentication tag error', () => {
      const envelope = offlineCryptoProvider.encrypt(sensitiveData, correctPin);
      
      // Flip a hex character in ciphertext
      const tamperedHex = envelope.ciphertext.slice(0, -2) + (envelope.ciphertext.slice(-2) === 'aa' ? 'bb' : 'aa');
      const tamperedEnvelope = { ...envelope, ciphertext: tamperedHex };

      assert.throws(() => {
        offlineCryptoProvider.decrypt(tamperedEnvelope, correctPin);
      }, /Decryption failed: integrity authentication tag mismatch/);
    });

    it('7. Auth Tag Tampering Rejection: Modifying auth tag fails authentication tag verification', () => {
      const envelope = offlineCryptoProvider.encrypt(sensitiveData, correctPin);
      
      const tamperedTag = '00000000000000000000000000000000';
      const tamperedEnvelope = { ...envelope, tag: tamperedTag };

      assert.throws(() => {
        offlineCryptoProvider.decrypt(tamperedEnvelope, correctPin);
      }, /Decryption failed: integrity authentication tag mismatch/);
    });

    it('8. Unique IV & Salt: Encrypting the same plaintext twice produces distinct salts, IVs, and ciphertexts', () => {
      const env1 = offlineCryptoProvider.encrypt(sensitiveData, correctPin);
      const env2 = offlineCryptoProvider.encrypt(sensitiveData, correctPin);

      assert.notEqual(env1.salt, env2.salt);
      assert.notEqual(env1.iv, env2.iv);
      assert.notEqual(env1.ciphertext, env2.ciphertext);
    });

    it('9. Key Rotation: Re-encrypts envelope under new PIN without intermediate leakage', () => {
      const envelope = offlineCryptoProvider.encrypt(sensitiveData, 'oldPin999');
      const rotatedEnvelope = offlineCryptoProvider.rotateKey(envelope, 'oldPin999', 'newPin888');

      assert.notEqual(envelope.salt, rotatedEnvelope.salt);
      assert.equal(offlineCryptoProvider.decrypt(rotatedEnvelope, 'newPin888'), sensitiveData);
    });
  });

  // =========================================================================
  // 3. Tamper-Evident Security Audit Log Tests
  // =========================================================================
  describe('SEC3-03: Tamper-Evident Cryptographic Hash-Chain Audit Log', () => {
    it('10. Hash Chain Genesis & Linking: Events sequentially link via previousHash', () => {
      const e1 = securityAuditLogger.logEvent({
        eventType: 'LOGIN_SUCCESS',
        actorId: 'usr-1',
        actorRole: 'ASHA',
        result: 'SUCCESS',
      });

      const e2 = securityAuditLogger.logEvent({
        eventType: 'PATIENT_RECORD_ACCESSED',
        actorId: 'usr-1',
        resourceType: 'PATIENT',
        resourceId: 'pat-1',
        result: 'SUCCESS',
      });

      assert.equal(e1.previousHash, '0000000000000000000000000000000000000000000000000000000000000000');
      assert.equal(e2.previousHash, e1.currentHash);

      const verification = securityAuditLogger.verifyChainIntegrity();
      assert.equal(verification.valid, true);
      assert.equal(verification.totalEvents, 2);
    });

    it('11. Tamper Detection: Modifying any field in an earlier event breaks the chain integrity check', () => {
      securityAuditLogger.logEvent({
        eventType: 'LOGIN_SUCCESS',
        actorId: 'usr-1',
        result: 'SUCCESS',
      });

      securityAuditLogger.logEvent({
        eventType: 'PATIENT_RECORD_ACCESSED',
        actorId: 'usr-1',
        resourceId: 'pat-1',
        result: 'SUCCESS',
      });

      const events = securityAuditLogger.getEvents();
      // Malicious actor modifies an event in place
      (events[0] as any).actorId = 'attacker-spoofed-id';

      const verification = securityAuditLogger.verifyChainIntegrity();
      assert.equal(verification.valid, false);
      assert.equal(verification.brokenIndex, 0);
    });

    it('12. Sensitive Field Redaction: Automatically redacts password/aadhaar/token keywords in metadata', () => {
      const event = securityAuditLogger.logEvent({
        eventType: 'LOGIN_FAILURE',
        actorId: 'test_user',
        result: 'FAILURE',
        metadata: {
          attemptedPassword: 'SuperSecretPassword123',
          rawAadhaarNumber: '123456789012',
          safeField: 'Attempted from Chrome Mobile',
        },
      });

      assert.equal(event.metadata?.attemptedPassword, '[REDACTED]');
      assert.equal(event.metadata?.rawAadhaarNumber, '[REDACTED]');
      assert.equal(event.metadata?.safeField, 'Attempted from Chrome Mobile');
    });
  });

  // =========================================================================
  // 4. Deterministic Rule-Based Anomaly Detection Tests
  // =========================================================================
  describe('SEC3-04: Deterministic Rule-Based Anomaly Detection', () => {
    it('13. Brute Force Anomaly: Triggers HIGH severity alert on >= 5 failed logins within window', () => {
      const username = 'dr_target';
      for (let i = 0; i < 4; i++) {
        const alert = anomalyDetector.recordFailedLogin(username, '10.0.0.1');
        assert.equal(alert, null);
      }

      // 5th failure triggers alert
      const fifthAlert = anomalyDetector.recordFailedLogin(username, '10.0.0.1');
      assert.notEqual(fifthAlert, null);
      assert.equal(fifthAlert?.severity, 'HIGH');
      assert.equal(fifthAlert?.ruleId, 'ANOMALY-001');
    });

    it('14. Recovery Anomaly: Triggers MEDIUM alert if user logs in successfully after multiple failures', () => {
      const username = 'asha_recovering';
      anomalyDetector.recordFailedLogin(username);
      anomalyDetector.recordFailedLogin(username);
      anomalyDetector.recordFailedLogin(username);

      const alert = anomalyDetector.recordSuccessfulLogin(username);
      assert.notEqual(alert, null);
      assert.equal(alert?.severity, 'MEDIUM');
      assert.equal(alert?.ruleId, 'ANOMALY-002');
    });

    it('15. Patient Enumeration Anomaly: Triggers HIGH alert when actor accesses >= 20 distinct records rapidly', () => {
      const actorId = 'worker-probe-01';
      for (let i = 1; i < 20; i++) {
        const alert = anomalyDetector.recordPatientAccess(actorId, `patient-${i}`);
        assert.equal(alert, null);
      }

      const twentiethAlert = anomalyDetector.recordPatientAccess(actorId, 'patient-20');
      assert.notEqual(twentiethAlert, null);
      assert.equal(twentiethAlert?.severity, 'HIGH');
      assert.equal(twentiethAlert?.ruleId, 'ANOMALY-003');
    });

    it('16. Authorization Probing Anomaly: Triggers CRITICAL alert after 3 BOLA/auth failures', () => {
      const actorId = 'rogue-actor';
      anomalyDetector.recordAuthorizationFailure(actorId, 'PATIENT', 'pat-1');
      anomalyDetector.recordAuthorizationFailure(actorId, 'PATIENT', 'pat-2');
      
      const thirdFail = anomalyDetector.recordAuthorizationFailure(actorId, 'PATIENT', 'pat-3');
      assert.notEqual(thirdFail, null);
      assert.equal(thirdFail?.severity, 'CRITICAL');
      assert.equal(thirdFail?.ruleId, 'ANOMALY-004');
    });
  });

  // =========================================================================
  // 5. Referral State Machine & Authorization Tests
  // =========================================================================
  describe('SEC3-05: Referral State Machine & Cross-Facility Isolation', () => {
    it('17. Terminal State Protection: Cannot transition out of COMPLETED or CANCELLED', () => {
      assert.throws(() => {
        accessControl.validateReferralTransition(ReferralStatus.COMPLETED, ReferralStatus.ISSUED);
      }, /Invalid referral state transition/);

      assert.throws(() => {
        accessControl.validateReferralTransition(ReferralStatus.CANCELLED, ReferralStatus.ACKNOWLEDGED);
      }, /Invalid referral state transition/);
    });

    it('18. Valid Lifecycle Path: Allows ISSUED -> IN_TRANSIT -> ACKNOWLEDGED -> COMPLETED', () => {
      assert.doesNotThrow(() => {
        accessControl.validateReferralTransition(ReferralStatus.ISSUED, ReferralStatus.IN_TRANSIT);
        accessControl.validateReferralTransition(ReferralStatus.IN_TRANSIT, ReferralStatus.ACKNOWLEDGED);
        accessControl.validateReferralTransition(ReferralStatus.ACKNOWLEDGED, ReferralStatus.COMPLETED);
      });
    });

    it('19. Aadhaar Tokenization Security: Hash is 64-char HMAC and mask hides 8 digits', () => {
      const token = hashAadhaar('234567891234');
      const mask = maskAadhaar('234567891234');
      assert.equal(token.length, 64);
      assert.equal(mask, 'XXXX-XXXX-1234');
    });
  });
});
