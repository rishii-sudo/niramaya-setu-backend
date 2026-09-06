-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ASHA', 'ANM', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "TriageCategory" AS ENUM ('EMERGENCY_RED', 'URGENT_YELLOW', 'ROUTINE_GREEN');

-- CreateEnum
CREATE TYPE "FacilityTier" AS ENUM ('SUB_CENTER', 'PHC', 'CHC', 'DISTRICT_HOSPITAL');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('DRAFT', 'ISSUED', 'IN_TRANSIT', 'ACKNOWLEDGED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('REMINDER_24H', 'NO_SHOW_ESCALATION_48H', 'CRITICAL_TRIAGE_ALERT');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'NOTIFIED', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'PENDING_CONFLICT', 'REJECTED');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ASHA',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_workers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "village" TEXT,
    "taluka" TEXT,
    "district" TEXT,
    "assigned_facility_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tier" "FacilityTier" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "taluka" TEXT,
    "district" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Maharashtra',
    "pincode" TEXT,
    "contact_phone" TEXT,
    "operational_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "total_beds" INTEGER NOT NULL DEFAULT 0,
    "available_beds" INTEGER NOT NULL DEFAULT 0,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "has_emergency_unit" BOOLEAN NOT NULL DEFAULT false,
    "has_ambulance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "name" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "mobile" TEXT,
    "village" TEXT NOT NULL,
    "taluka" TEXT,
    "district" TEXT NOT NULL,
    "address" TEXT,
    "aadhaar_token" TEXT,
    "masked_aadhaar" TEXT,
    "abha_number" TEXT,
    "abha_address" TEXT,
    "registered_by_id" TEXT,
    "registered_facility_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_assessments" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "patient_id" TEXT NOT NULL,
    "assessed_by_id" TEXT,
    "systolic_bp" INTEGER,
    "diastolic_bp" INTEGER,
    "spo2" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "pulse" INTEGER,
    "blood_glucose" DOUBLE PRECISION,
    "respiratory_rate" INTEGER,
    "symptoms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "red_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "triage_category" "TriageCategory" NOT NULL,
    "clinical_rationale" TEXT NOT NULL,
    "recommended_tier" "FacilityTier" NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triage_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "client_id" TEXT,
    "patient_id" TEXT NOT NULL,
    "triage_id" TEXT,
    "originating_worker_id" TEXT,
    "originating_facility_id" TEXT,
    "destination_facility_id" TEXT NOT NULL,
    "specialty_required" TEXT NOT NULL,
    "urgency" "TriageCategory" NOT NULL DEFAULT 'ROUTINE_GREEN',
    "clinical_notes" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "sla_expires_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_alerts" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "alert_type" "AlertType" NOT NULL,
    "target_worker_id" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL,
    "trigger_at" TIMESTAMP(3) NOT NULL,
    "triggered_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_audit_logs" (
    "id" TEXT NOT NULL,
    "client_mutation_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "client_timestamp" TIMESTAMP(3) NOT NULL,
    "server_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "conflict_details" JSONB,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "health_workers_user_id_key" ON "health_workers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "health_workers_mobile_key" ON "health_workers"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_code_key" ON "facilities"("code");

-- CreateIndex
CREATE INDEX "facilities_tier_idx" ON "facilities"("tier");

-- CreateIndex
CREATE INDEX "facilities_district_idx" ON "facilities"("district");

-- CreateIndex
CREATE UNIQUE INDEX "patients_client_id_key" ON "patients"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_aadhaar_token_key" ON "patients"("aadhaar_token");

-- CreateIndex
CREATE UNIQUE INDEX "patients_abha_number_key" ON "patients"("abha_number");

-- CreateIndex
CREATE UNIQUE INDEX "patients_abha_address_key" ON "patients"("abha_address");

-- CreateIndex
CREATE INDEX "patients_village_idx" ON "patients"("village");

-- CreateIndex
CREATE INDEX "patients_mobile_idx" ON "patients"("mobile");

-- CreateIndex
CREATE INDEX "patients_aadhaar_token_idx" ON "patients"("aadhaar_token");

-- CreateIndex
CREATE INDEX "patients_abha_number_idx" ON "patients"("abha_number");

-- CreateIndex
CREATE UNIQUE INDEX "triage_assessments_client_id_key" ON "triage_assessments"("client_id");

-- CreateIndex
CREATE INDEX "triage_assessments_patient_id_idx" ON "triage_assessments"("patient_id");

-- CreateIndex
CREATE INDEX "triage_assessments_triage_category_idx" ON "triage_assessments"("triage_category");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referral_code_key" ON "referrals"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_client_id_key" ON "referrals"("client_id");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "referrals_destination_facility_id_idx" ON "referrals"("destination_facility_id");

-- CreateIndex
CREATE INDEX "referrals_sla_expires_at_idx" ON "referrals"("sla_expires_at");

-- CreateIndex
CREATE INDEX "referral_alerts_referral_id_idx" ON "referral_alerts"("referral_id");

-- CreateIndex
CREATE INDEX "referral_alerts_status_idx" ON "referral_alerts"("status");

-- CreateIndex
CREATE INDEX "referral_alerts_trigger_at_idx" ON "referral_alerts"("trigger_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_audit_logs_client_mutation_id_key" ON "sync_audit_logs"("client_mutation_id");

-- CreateIndex
CREATE INDEX "sync_audit_logs_client_mutation_id_idx" ON "sync_audit_logs"("client_mutation_id");

-- CreateIndex
CREATE INDEX "sync_audit_logs_entity_type_entity_id_idx" ON "sync_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "sync_audit_logs_server_timestamp_idx" ON "sync_audit_logs"("server_timestamp");

-- AddForeignKey
ALTER TABLE "health_workers" ADD CONSTRAINT "health_workers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_workers" ADD CONSTRAINT "health_workers_assigned_facility_id_fkey" FOREIGN KEY ("assigned_facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "health_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_registered_facility_id_fkey" FOREIGN KEY ("registered_facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_assessments" ADD CONSTRAINT "triage_assessments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_assessments" ADD CONSTRAINT "triage_assessments_assessed_by_id_fkey" FOREIGN KEY ("assessed_by_id") REFERENCES "health_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_triage_id_fkey" FOREIGN KEY ("triage_id") REFERENCES "triage_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_originating_worker_id_fkey" FOREIGN KEY ("originating_worker_id") REFERENCES "health_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_originating_facility_id_fkey" FOREIGN KEY ("originating_facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_destination_facility_id_fkey" FOREIGN KEY ("destination_facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_alerts" ADD CONSTRAINT "referral_alerts_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_alerts" ADD CONSTRAINT "referral_alerts_target_worker_id_fkey" FOREIGN KEY ("target_worker_id") REFERENCES "health_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
