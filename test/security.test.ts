import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashAadhaar, maskAadhaar, generateSecureReferralCode, HmacAadhaarTokenProvider } from '../src/security/crypto/aadhaar-token.js';
import { AccessControlService } from '../src/security/authorization/access-control.js';
import { ReferralStatus, UserRole, Gender, TriageCategory } from '@prisma/client';
import { ForbiddenError, BadRequestError, NotFoundError } from '../src/common/errors/http-errors.js';
import { AuthenticatedUser } from '../src/common/types/index.js';

describe('🔒 NIRAMAYA SETU — P0 & P1 SECURITY REGRESSION TEST SUITE', () => {
  const accessControl = new AccessControlService();

  // =========================================================================
  // SEC-04: Aadhaar HMAC-SHA256 Token Tests
  // =========================================================================
  describe('SEC-04: Aadhaar HMAC-SHA256 Token Provider', () => {
    const rawAadhaar = '234567891234';
    const secretA = 'test_secret_key_environment_one_32_characters';
    const secretB = 'test_secret_key_environment_two_32_characters';

    it('1. Deterministic Token: Same Aadhaar with same secret yields identical token', () => {
      const token1 = hashAadhaar(rawAadhaar, secretA);
      const token2 = hashAadhaar(rawAadhaar, secretA);
      assert.equal(token1, token2);
      assert.equal(typeof token1, 'string');
      assert.equal(token1.length, 64); // SHA-256 hex
    });

    it('2. Keyed Protection: Changing secret changes token (prevents offline rainbow tables)', () => {
      const tokenA = hashAadhaar(rawAadhaar, secretA);
      const tokenB = hashAadhaar(rawAadhaar, secretB);
      assert.notEqual(tokenA, tokenB);
    });

    it('3. Masking Integrity: Masked string only reveals last 4 digits', () => {
      const masked = maskAadhaar(rawAadhaar);
      assert.equal(masked, 'XXXX-XXXX-1234');
      assert.equal(masked.includes(rawAadhaar), false);
    });

    it('4. Format Validation: Rejects malformed Aadhaar numbers (< 12 or > 12 digits)', () => {
      assert.throws(() => hashAadhaar('12345'), /must contain exactly 12 digits/);
      assert.throws(() => hashAadhaar('123456789012345'), /must contain exactly 12 digits/);
    });
  });

  // =========================================================================
  // SEC-08: Secure Referral Code Generation Tests
  // =========================================================================
  describe('SEC-08: Cryptographic Referral Code Generation', () => {
    it('1. Uniqueness & Entropy: Generates non-repeating 16+ char codes with date prefix', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const code = generateSecureReferralCode();
        assert.match(code, /^REF-\d{8}-[A-F0-9]{8}$/);
        assert.equal(codes.has(code), false, 'Duplicate referral code generated!');
        codes.add(code);
      }
      assert.equal(codes.size, 1000);
    });
  });

  // =========================================================================
  // SEC-02: Referral State Machine Validation Tests
  // =========================================================================
  describe('SEC-02: Referral State Machine Transition Matrix', () => {
    it('1. Valid Lifecycle: ISSUED -> IN_TRANSIT -> ACKNOWLEDGED -> COMPLETED', () => {
      assert.doesNotThrow(() => accessControl.validateReferralTransition(ReferralStatus.ISSUED, ReferralStatus.IN_TRANSIT));
      assert.doesNotThrow(() => accessControl.validateReferralTransition(ReferralStatus.IN_TRANSIT, ReferralStatus.ACKNOWLEDGED));
      assert.doesNotThrow(() => accessControl.validateReferralTransition(ReferralStatus.ACKNOWLEDGED, ReferralStatus.COMPLETED));
    });

    it('2. Valid Cancellation: ISSUED -> CANCELLED and IN_TRANSIT -> CANCELLED', () => {
      assert.doesNotThrow(() => accessControl.validateReferralTransition(ReferralStatus.ISSUED, ReferralStatus.CANCELLED));
      assert.doesNotThrow(() => accessControl.validateReferralTransition(ReferralStatus.IN_TRANSIT, ReferralStatus.CANCELLED));
    });

    it('3. Invalid Transition: CANCELLED -> COMPLETED is strictly rejected', () => {
      assert.throws(
        () => accessControl.validateReferralTransition(ReferralStatus.CANCELLED, ReferralStatus.COMPLETED),
        BadRequestError
      );
    });

    it('4. Invalid Transition: COMPLETED -> ISSUED is strictly rejected (Terminal state)', () => {
      assert.throws(
        () => accessControl.validateReferralTransition(ReferralStatus.COMPLETED, ReferralStatus.ISSUED),
        BadRequestError
      );
    });

    it('5. Invalid Transition: ISSUED -> COMPLETED (bypassing acknowledgment) is rejected', () => {
      assert.throws(
        () => accessControl.validateReferralTransition(ReferralStatus.ISSUED, ReferralStatus.COMPLETED),
        BadRequestError
      );
    });
  });

  // =========================================================================
  // SEC-01 & SEC-02: Authorization & BOLA Unit Assertions
  // =========================================================================
  describe('SEC-01 & SEC-02: Access Control & BOLA Boundaries', () => {
    const mockPatientKarjat = {
      id: 'patient-uuid-1',
      clientId: null,
      name: 'Ramesh Shinde',
      dob: new Date('1980-01-01'),
      gender: Gender.MALE,
      mobile: '9876543210',
      village: 'Karjat Rural',
      taluka: 'Karjat',
      district: 'Raigad',
      address: null,
      aadhaarToken: 'mock-token',
      maskedAadhaar: 'XXXX-XXXX-1234',
      abhaNumber: null,
      abhaAddress: null,
      registeredById: 'asha-worker-karjat-id',
      registeredFacilityId: 'subcenter-karjat-id',
      version: 1,
      syncStatus: 'SYNCED' as const,
      syncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ashaUserKarjat: AuthenticatedUser = {
      userId: 'user-asha-1',
      username: 'asha_sunita',
      role: UserRole.ASHA,
      healthWorkerId: 'asha-worker-karjat-id',
      facilityId: 'subcenter-karjat-id',
    };

    const ashaUserNeral: AuthenticatedUser = {
      userId: 'user-asha-2',
      username: 'asha_neral',
      role: UserRole.ASHA,
      healthWorkerId: 'asha-worker-neral-id',
      facilityId: 'subcenter-neral-id',
    };

    const adminUser: AuthenticatedUser = {
      userId: 'user-admin-1',
      username: 'admin_niramaya',
      role: UserRole.ADMIN,
    };

    it('1. BOLA Check: Null patient safely throws NotFoundError without leaking info', async () => {
      await assert.rejects(
        async () => accessControl.assertPatientAccess(ashaUserKarjat, null, 'READ'),
        NotFoundError
      );
    });

    it('2. BOLA Check: Unauthenticated request throws ForbiddenError', async () => {
      await assert.rejects(
        async () => accessControl.assertPatientAccess(undefined, mockPatientKarjat, 'READ'),
        ForbiddenError
      );
    });

    it('3. ADMIN Access: Admin is permitted access to patient records', async () => {
      await assert.doesNotReject(async () => accessControl.assertPatientAccess(adminUser, mockPatientKarjat, 'READ'));
    });
  });
});
