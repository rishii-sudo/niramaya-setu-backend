import { securityAuditLogger } from '../audit/security-audit-logger.js';
import { logger } from '../../common/logger/index.js';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnomalyAlert {
  ruleId: string;
  ruleName: string;
  severity: AnomalySeverity;
  actorId?: string;
  clientIp?: string;
  timestamp: string;
  details: string;
  metrics: Record<string, number | string>;
}

interface MetricWindowEntry {
  timestamp: number;
  value?: string;
}

export class AnomalyDetector {
  private static instance: AnomalyDetector;

  // Failed login tracking: key = username | ip -> timestamps
  private failedLogins: Map<string, MetricWindowEntry[]> = new Map();

  // Patient access tracking: key = actorId -> [timestamp, patientId]
  private patientAccesses: Map<string, Array<{ timestamp: number; patientId: string }>> = new Map();

  // Auth failures tracking: key = actorId | ip -> timestamps
  private authFailures: Map<string, MetricWindowEntry[]> = new Map();

  // Active alerts list
  private alerts: AnomalyAlert[] = [];

  // Threshold configurations
  private readonly FAILED_LOGIN_THRESHOLD = 5;       // > 5 attempts in 5 mins
  private readonly FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000;

  private readonly PATIENT_ENUM_THRESHOLD = 20;      // > 20 patients in 1 min
  private readonly PATIENT_ENUM_WINDOW_MS = 60 * 1000;

  private readonly AUTH_FAIL_THRESHOLD = 3;          // > 3 BOLA/auth fails in 5 mins
  private readonly AUTH_FAIL_WINDOW_MS = 5 * 60 * 1000;

  public static getInstance(): AnomalyDetector {
    if (!AnomalyDetector.instance) {
      AnomalyDetector.instance = new AnomalyDetector();
    }
    return AnomalyDetector.instance;
  }

  private cleanWindow<T extends { timestamp: number }>(entries: T[], windowMs: number, now: number): T[] {
    return entries.filter((e) => now - e.timestamp <= windowMs);
  }

  private raiseAlert(alert: Omit<AnomalyAlert, 'timestamp'>): AnomalyAlert {
    const fullAlert: AnomalyAlert = {
      ...alert,
      timestamp: new Date().toISOString(),
    };
    this.alerts.push(fullAlert);

    logger.warn({ alert: fullAlert }, `ANOMALY DETECTED: [${alert.severity}] ${alert.ruleName}`);

    securityAuditLogger.logEvent({
      eventType: 'ANOMALY_DETECTED',
      actorId: alert.actorId,
      result: 'FLAGGED',
      clientIp: alert.clientIp,
      metadata: {
        ruleId: alert.ruleId,
        ruleName: alert.ruleName,
        severity: alert.severity,
        details: alert.details,
        ...alert.metrics,
      },
    });

    return fullAlert;
  }

  /**
   * Records a failed login attempt and checks for brute-force patterns
   */
  public recordFailedLogin(username: string, clientIp?: string): AnomalyAlert | null {
    const now = Date.now();
    const key = username.toLowerCase();
    
    let entries = this.failedLogins.get(key) || [];
    entries = this.cleanWindow(entries, this.FAILED_LOGIN_WINDOW_MS, now);
    entries.push({ timestamp: now, value: clientIp });
    this.failedLogins.set(key, entries);

    if (entries.length >= this.FAILED_LOGIN_THRESHOLD) {
      return this.raiseAlert({
        ruleId: 'ANOMALY-001',
        ruleName: 'Brute Force Credential Guessing Detected',
        severity: 'HIGH',
        actorId: username,
        clientIp,
        details: `Detected ${entries.length} failed login attempts for user '${username}' within 5 minutes`,
        metrics: {
          failedAttempts: entries.length,
          windowSeconds: this.FAILED_LOGIN_WINDOW_MS / 1000,
        },
      });
    }

    return null;
  }

  /**
   * Records a successful login and checks if it followed multiple recent failures
   */
  public recordSuccessfulLogin(username: string, clientIp?: string): AnomalyAlert | null {
    const now = Date.now();
    const key = username.toLowerCase();
    const entries = this.failedLogins.get(key) || [];
    const recentFails = this.cleanWindow(entries, this.FAILED_LOGIN_WINDOW_MS, now);

    // Clear failed logins after success
    this.failedLogins.delete(key);

    if (recentFails.length >= 3) {
      return this.raiseAlert({
        ruleId: 'ANOMALY-002',
        ruleName: 'Login Success After Multiple Consecutive Failures',
        severity: 'MEDIUM',
        actorId: username,
        clientIp,
        details: `Successful login for user '${username}' occurred after ${recentFails.length} recent failed attempts`,
        metrics: {
          priorFailures: recentFails.length,
        },
      });
    }

    return null;
  }

  /**
   * Tracks patient profile read access to detect scraping or enumeration
   */
  public recordPatientAccess(actorId: string, patientId: string): AnomalyAlert | null {
    const now = Date.now();
    let accesses = this.patientAccesses.get(actorId) || [];
    accesses = this.cleanWindow(accesses, this.PATIENT_ENUM_WINDOW_MS, now);
    accesses.push({ timestamp: now, patientId });
    this.patientAccesses.set(actorId, accesses);

    const distinctPatients = new Set(accesses.map((a) => a.patientId));
    if (distinctPatients.size >= this.PATIENT_ENUM_THRESHOLD) {
      return this.raiseAlert({
        ruleId: 'ANOMALY-003',
        ruleName: 'Rapid Patient Record Enumeration / Scraping',
        severity: 'HIGH',
        actorId,
        details: `Actor accessed ${distinctPatients.size} distinct patient records within 60 seconds`,
        metrics: {
          distinctPatientCount: distinctPatients.size,
          windowSeconds: this.PATIENT_ENUM_WINDOW_MS / 1000,
        },
      });
    }

    return null;
  }

  /**
   * Tracks authorization failures (e.g. cross-facility or out-of-catchment BOLA probes)
   */
  public recordAuthorizationFailure(actorId: string, resourceType: string, resourceId: string): AnomalyAlert | null {
    const now = Date.now();
    let entries = this.authFailures.get(actorId) || [];
    entries = this.cleanWindow(entries, this.AUTH_FAIL_WINDOW_MS, now);
    entries.push({ timestamp: now, value: `${resourceType}:${resourceId}` });
    this.authFailures.set(actorId, entries);

    if (entries.length >= this.AUTH_FAIL_THRESHOLD) {
      return this.raiseAlert({
        ruleId: 'ANOMALY-004',
        ruleName: 'Repeated Authorization / BOLA Probing Violations',
        severity: 'CRITICAL',
        actorId,
        details: `Actor triggered ${entries.length} authorization violations on ${resourceType} resources within 5 minutes`,
        metrics: {
          violationCount: entries.length,
          lastTarget: `${resourceType}:${resourceId}`,
        },
      });
    }

    return null;
  }

  /**
   * Returns recorded anomaly alerts
   */
  public getAlerts(): AnomalyAlert[] {
    return [...this.alerts];
  }

  /**
   * Resets anomaly detector tracking state (for tests)
   */
  public reset(): void {
    this.failedLogins.clear();
    this.patientAccesses.clear();
    this.authFailures.clear();
    this.alerts = [];
  }
}

export const anomalyDetector = AnomalyDetector.getInstance();
