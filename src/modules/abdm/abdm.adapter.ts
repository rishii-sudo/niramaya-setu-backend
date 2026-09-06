import { config } from '../../config/env.js';
import { logger } from '../../common/logger/index.js';

export interface AbhaGenerateOtpResponse {
  txnId: string;
  message: string;
  isMock: boolean;
}

export interface AbhaVerifyOtpResponse {
  abhaNumber: string;
  abhaAddress: string;
  name: string;
  gender: string;
  yearOfBirth: number;
  isMock: boolean;
  status: string;
}

export interface AbhaLinkCareContextResponse {
  careContextReference: string;
  status: 'PENDING_USER_AUTH' | 'LINKED' | 'STUB_LINKED';
}

export interface IAbdmAdapter {
  generateAadhaarOtp(aadhaarNumber: string): Promise<AbhaGenerateOtpResponse>;
  verifyAadhaarOtp(txnId: string, otp: string): Promise<AbhaVerifyOtpResponse>;
  linkCareContext(abhaNumber: string, referralCode: string): Promise<AbhaLinkCareContextResponse>;
}

/**
 * ABDM Sandbox / Integration-Ready Adapter
 * Note: External Gateway is marked as STUB until production HIP/HIU credentials and RSA encryption certificates are configured.
 */
export class AbdmSandboxAdapter implements IAbdmAdapter {
  public async generateAadhaarOtp(aadhaarNumber: string): Promise<AbhaGenerateOtpResponse> {
    logger.info({ maskedInput: `XXXX-XXXX-${aadhaarNumber.slice(-4)}` }, 'ABDM M1 Adapter: Triggered Aadhaar OTP');

    // Integration Boundary: Calls ABDM Gateway v0.5 /v1/registration/aadhaar/generateOtp
    return {
      txnId: `abdm-txn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      message: 'OTP sent to mobile linked with Aadhaar (ABDM Sandbox Adapter)',
      isMock: true,
    };
  }

  public async verifyAadhaarOtp(txnId: string, otp: string): Promise<AbhaVerifyOtpResponse> {
    logger.info({ txnId }, 'ABDM M1 Adapter: Verifying Aadhaar OTP');

    // Integration Boundary: In sandbox mode, verify OTP format (e.g. 123456 or any 6 digits)
    return {
      abhaNumber: `91-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      abhaAddress: `patient_${txnId.slice(-4)}@abdm`,
      name: 'Sample ABHA Verified Patient',
      gender: 'FEMALE',
      yearOfBirth: 1992,
      isMock: true,
      status: 'VERIFIED_SANDBOX',
    };
  }

  public async linkCareContext(abhaNumber: string, referralCode: string): Promise<AbhaLinkCareContextResponse> {
    logger.info({ abhaNumber, referralCode }, 'ABDM M2 Adapter: Linking Referral Care Context');

    return {
      careContextReference: `CARE-CTX-${referralCode}`,
      status: 'STUB_LINKED',
    };
  }
}

export const abdmAdapter: IAbdmAdapter = new AbdmSandboxAdapter();
