import { PrismaClient, UserRole, FacilityTier, Gender, TriageCategory, ReferralStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { hashAadhaar } from '../src/security/crypto/aadhaar-token.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Niramaya Setu Development Database Seed...');

  // 1. Clean existing records in reverse order
  await prisma.syncAuditLog.deleteMany().catch(() => {});
  await prisma.referralAlert.deleteMany().catch(() => {});
  await prisma.referral.deleteMany().catch(() => {});
  await prisma.triageAssessment.deleteMany().catch(() => {});
  await prisma.patient.deleteMany().catch(() => {});
  await prisma.healthWorker.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});
  await prisma.facility.deleteMany().catch(() => {});

  const defaultPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 2. Seed Facilities
  console.log('🏥 Seeding DEMO Healthcare Facilities...');
  const subCenter = await prisma.facility.create({
    data: {
      name: '[DEMO] Karjat Rural Sub-Center',
      code: 'FAC-MH-KSC-01',
      tier: FacilityTier.SUB_CENTER,
      latitude: 18.9102,
      longitude: 73.3283,
      address: 'Near Gram Panchayat, Karjat Rural',
      taluka: 'Karjat',
      district: 'Raigad',
      state: 'Maharashtra',
      pincode: '410201',
      contactPhone: '+91 9820011111',
      totalBeds: 2,
      availableBeds: 2,
      specialties: ['Primary Healthcare', 'Maternal & Child Health', 'Immunization'],
      hasEmergencyUnit: false,
      hasAmbulance: false,
    },
  });

  const phc = await prisma.facility.create({
    data: {
      name: '[DEMO] Neral Primary Health Center (PHC)',
      code: 'FAC-MH-NPHC-02',
      tier: FacilityTier.PHC,
      latitude: 18.9882,
      longitude: 73.3175,
      address: 'Station Road, Neral',
      taluka: 'Karjat',
      district: 'Raigad',
      state: 'Maharashtra',
      pincode: '410101',
      contactPhone: '+91 9820022222',
      totalBeds: 10,
      availableBeds: 6,
      specialties: ['General Medicine', 'Obstetrics', 'Pediatrics', 'Basic Diagnostics'],
      hasEmergencyUnit: true,
      hasAmbulance: true,
    },
  });

  const chc = await prisma.facility.create({
    data: {
      name: '[DEMO] Panvel Community Health Center (CHC)',
      code: 'FAC-MH-PCHC-03',
      tier: FacilityTier.CHC,
      latitude: 18.9894,
      longitude: 73.1175,
      address: 'Near Old Bus Stand, Panvel',
      taluka: 'Panvel',
      district: 'Raigad',
      state: 'Maharashtra',
      pincode: '410206',
      contactPhone: '+91 9820033333',
      totalBeds: 40,
      availableBeds: 18,
      specialties: ['General Surgery', 'Obstetrics & Gynecology', 'Pediatrics', 'Orthopedics', 'ICU'],
      hasEmergencyUnit: true,
      hasAmbulance: true,
    },
  });

  const districtHospital = await prisma.facility.create({
    data: {
      name: '[DEMO] Raigad District Civil Hospital (Alibag)',
      code: 'FAC-MH-RDH-04',
      tier: FacilityTier.DISTRICT_HOSPITAL,
      latitude: 18.6414,
      longitude: 72.8722,
      address: 'Civil Lines, Alibag',
      taluka: 'Alibag',
      district: 'Raigad',
      state: 'Maharashtra',
      pincode: '402201',
      contactPhone: '+91 9820044444',
      totalBeds: 250,
      availableBeds: 64,
      specialties: [
        'Cardiology',
        'Neurology',
        'Trauma & Emergency Care',
        'General Surgery',
        'Nephrology',
        'NICU/PICU',
        'Blood Bank',
      ],
      hasEmergencyUnit: true,
      hasAmbulance: true,
    },
  });

  // 3. Seed Users & Health Workers
  console.log('👩‍⚕️ Seeding DEMO Users & Health Workers...');

  // ASHA Worker
  const ashaUser = await prisma.user.create({
    data: {
      username: 'asha_sunita',
      passwordHash,
      role: UserRole.ASHA,
    },
  });
  const ashaWorker = await prisma.healthWorker.create({
    data: {
      userId: ashaUser.id,
      name: 'Sunita Patil (ASHA)',
      mobile: '9823000001',
      role: UserRole.ASHA,
      village: 'Karjat Rural',
      taluka: 'Karjat',
      district: 'Raigad',
      assignedFacilityId: subCenter.id,
    },
  });

  // ANM Worker
  const anmUser = await prisma.user.create({
    data: {
      username: 'anm_priya',
      passwordHash,
      role: UserRole.ANM,
    },
  });
  const anmWorker = await prisma.healthWorker.create({
    data: {
      userId: anmUser.id,
      name: 'Priya Deshmukh (ANM)',
      mobile: '9823000002',
      role: UserRole.ANM,
      village: 'Neral',
      taluka: 'Karjat',
      district: 'Raigad',
      assignedFacilityId: phc.id,
    },
  });

  // Doctor
  const doctorUser = await prisma.user.create({
    data: {
      username: 'dr_shinde',
      passwordHash,
      role: UserRole.DOCTOR,
    },
  });
  const doctorWorker = await prisma.healthWorker.create({
    data: {
      userId: doctorUser.id,
      name: 'Dr. Anand Shinde (Medical Officer)',
      mobile: '9823000003',
      role: UserRole.DOCTOR,
      taluka: 'Panvel',
      district: 'Raigad',
      assignedFacilityId: chc.id,
    },
  });

  // Admin
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin_niramaya',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
  await prisma.healthWorker.create({
    data: {
      userId: adminUser.id,
      name: 'District Health Administrator',
      mobile: '9823000004',
      role: UserRole.ADMIN,
      district: 'Raigad',
    },
  });

  // 4. Seed Patients
  console.log('🧑‍🌾 Seeding DEMO Patients (HMAC Aadhaar & ABHA)...');
  const patient1 = await prisma.patient.create({
    data: {
      name: 'Ramesh Tanaji Shinde',
      dob: new Date('1978-05-14'),
      gender: Gender.MALE,
      mobile: '9876543210',
      village: 'Karjat Rural',
      taluka: 'Karjat',
      district: 'Raigad',
      address: 'House No 42, Gaothan',
      aadhaarToken: hashAadhaar('234567891234'),
      maskedAadhaar: 'XXXX-XXXX-1234',
      abhaNumber: '91-4521-8932-1102',
      abhaAddress: 'ramesh.shinde@abdm',
      registeredById: ashaWorker.id,
      registeredFacilityId: subCenter.id,
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      name: 'Kavita Suresh Gaikwad',
      dob: new Date('1994-11-23'),
      gender: Gender.FEMALE,
      mobile: '9876543211',
      village: 'Neral',
      taluka: 'Karjat',
      district: 'Raigad',
      address: 'Wadi Galli, Neral',
      aadhaarToken: hashAadhaar('876543219876'),
      maskedAadhaar: 'XXXX-XXXX-9876',
      abhaNumber: '91-6789-1234-5544',
      abhaAddress: 'kavita.gaikwad@abdm',
      registeredById: anmWorker.id,
      registeredFacilityId: phc.id,
    },
  });

  // 5. Seed Triage Assessment
  console.log('🩺 Seeding DEMO Triage Assessments...');
  const triage1 = await prisma.triageAssessment.create({
    data: {
      patientId: patient1.id,
      assessedById: ashaWorker.id,
      systolicBp: 172,
      diastolicBp: 104,
      spo2: 91.5,
      temperature: 102.4,
      pulse: 114,
      bloodGlucose: 240,
      symptoms: ['High fever', 'Severe breathlessness', 'Chest tightness'],
      redFlags: ['hypoxemia (SpO2 91.5%)', 'elevated BP 172/104'],
      triageCategory: TriageCategory.EMERGENCY_RED,
      clinicalRationale:
        'EMERGENCY RED: Patient presents with acute hypoxemia (SpO2 91.5%), severe hypertension (172/104 mmHg), and high fever. Immediate referral to CHC / District Hospital.',
      recommendedTier: FacilityTier.DISTRICT_HOSPITAL,
    },
  });

  // 6. Seed Referral with 48h SLA
  console.log('📋 Seeding DEMO Referral with 48-Hour SLA...');
  const now = new Date();
  const slaExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  await prisma.referral.create({
    data: {
      referralCode: `REF-${now.toISOString().slice(0, 10).replace(/-/g, '')}-1001`,
      patientId: patient1.id,
      triageId: triage1.id,
      originatingWorkerId: ashaWorker.id,
      originatingFacilityId: subCenter.id,
      destinationFacilityId: chc.id,
      specialtyRequired: 'Emergency Medicine / Cardiology',
      urgency: TriageCategory.EMERGENCY_RED,
      clinicalNotes: 'Urgent case: SpO2 91.5% with high blood pressure and acute respiratory distress.',
      status: ReferralStatus.ISSUED,
      issuedAt: now,
      slaExpiresAt,
    },
  });

  console.log('✅ DEMO Seed data created successfully!');
  console.log('----------------------------------------------------');
  console.log('DEMO Credentials (Password: Password@123):');
  console.log('1. ASHA:    username: asha_sunita');
  console.log('2. ANM:     username: anm_priya');
  console.log('3. DOCTOR:  username: dr_shinde');
  console.log('4. ADMIN:   username: admin_niramaya');
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('Seed Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
