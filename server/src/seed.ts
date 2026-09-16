/**
 * Parinaam API — realistic demo seed dataset.
 *
 * Seeds:
 *  • Multi-role accounts (Admin, Supervisor, Judiciary, Senior & Junior Officers)
 *  • Coherent multi-zone cases (NCB Delhi, Mumbai, Kolkata, Bengaluru)
 *  • Realistically sealed test records with valid RFC 8785 canonical JCS & sha256 chain
 *  • Case status transitions with statutory notes under Section 52A NDPS
 *  • Realistic server audit events (logins, uploads, reviews)
 *
 * Run directly:
 *   npm run seed:server              (against default engine/DB)
 *   PARINAAM_DB=postgres npm run seed:server (against PostgreSQL)
 */

import { ServerDb } from './db.ts';
import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';
import { sha256Hex } from '../../src/crypto/sha256.ts';

export const SEED_ACCOUNTS = [
  {
    username: 'admin',
    password: process.env.PARINAAM_API_ADMIN_PASSWORD ?? 'adminpass',
    displayName: 'Admin / Station House Officer',
    role: 'SENIOR' as const,
  },
  {
    username: 'supervisor',
    password: 'superpass',
    displayName: 'Superintendent R. K. Verma (NCB DZU)',
    role: 'SUPERVISOR' as const,
  },
  {
    username: 'judiciary',
    password: 'judiciarypass',
    displayName: 'Special Judge P. S. Bhatia (NDPS Court)',
    role: 'JUDICIARY' as const,
  },
  {
    username: 'sharma',
    password: 'sharmapass',
    displayName: 'HC-4412 Sharma (Delhi Zonal Unit)',
    role: 'SENIOR' as const,
  },
  {
    username: 'gill',
    password: 'gillpass',
    displayName: 'IC-9007 Gill (Mumbai Zonal Unit)',
    role: 'JUNIOR' as const,
  },
];

interface SeedRecordSpec {
  uuid: string;
  caseRef: string;
  panchnamaRef: string;
  packageNo: string;
  lotNo?: string;
  reagent: string;
  outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' | 'CONSISTENT_WITH_REAGENT_NEGATIVE' | 'INCONCLUSIVE';
  confidence: number;
  lab: { l: number; a: number; b: number };
  deltaE: number;
  createdAt: string;
  operatorId: string;
  operatorName: string;
  officerRole: string;
  kit: { make: string; test: string; lot: string; expiry: string };
  gps: { lat: number; lon: number; accuracy: number; mocked: boolean };
  imageRef: string;
  imageSha256: string;
  conformalSet: string[];
  abstentionReason?: string | null;
}

const SEED_RECORDS: SeedRecordSpec[] = [
  // ─── Case 1: NCB/DZU/CR-14/2026 (Delhi Air Cargo Complex) ───
  // 6 packages of suspected Heroin. Marquis positive with identical kinetics (Rule 10(2) bunching demo)
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    uuid: `a3f19c20-7d41-4b02-9e58-1c6d2f70ab1${n}`,
    caseRef: 'NCB/DZU/CR-14/2026',
    panchnamaRef: 'PAN/DZU/2026/884',
    packageNo: `P-${n}`,
    lotNo: 'LOT-DEL-2026-01',
    reagent: 'marquis',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' as const,
    confidence: 0.97,
    lab: { l: 19.4 + n * 0.18, a: 16.2 + n * 0.1, b: -12.4 - n * 0.08 },
    deltaE: 1.8 + n * 0.15,
    createdAt: `2026-09-14T09:1${n}:00.000Z`,
    operatorId: 'HC-4412 Sharma',
    operatorName: 'Head Constable R. Sharma',
    officerRole: 'SENIOR',
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-24B-118', expiry: '2027-04-30' },
    gps: { lat: 28.5562, lon: 77.0999, accuracy: 5.2, mocked: false },
    imageRef: `file:///evidence/NCB-DZU-CR14-P${n}.jpg`,
    imageSha256: `9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a0${n}`,
    conformalSet: ['POSITIVE'],
  })),

  // ─── Case 2: NCB/MZU/CR-02/2026 (Mumbai Docks JNPT) ───
  // Mixed contraband consignment — divergent reagents & outcomes
  {
    uuid: 'd41b6620-8f03-4a2b-90ce-5b2f7a9133dd',
    caseRef: 'NCB/MZU/CR-02/2026',
    panchnamaRef: 'PAN/MZU/2026/091',
    packageNo: 'P-1',
    reagent: 'duquenois_levine',
    outcome: 'INCONCLUSIVE',
    confidence: 0.54,
    lab: { l: 33.6, a: 4.8, b: 2.1 },
    deltaE: 4.2,
    createdAt: '2026-09-15T11:05:00.000Z',
    operatorId: 'IC-9007 Gill',
    operatorName: 'Intelligence Officer S. Gill',
    officerRole: 'JUNIOR',
    kit: { make: 'Anchor', test: 'Field Kit DQL', lot: 'AD-25C-031', expiry: '2027-02-28' },
    gps: { lat: 18.9438, lon: 72.8354, accuracy: 6.8, mocked: false },
    imageRef: 'file:///evidence/NCB-MZU-CR02-P1.jpg',
    imageSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    conformalSet: ['POSITIVE', 'NEGATIVE'],
    abstentionReason: 'low_margin',
  },
  {
    uuid: 'c92e77f0-15ba-4d84-a2c6-3e08f1d547aa',
    caseRef: 'NCB/MZU/CR-02/2026',
    panchnamaRef: 'PAN/MZU/2026/091',
    packageNo: 'P-2',
    reagent: 'scott',
    outcome: 'CONSISTENT_WITH_REAGENT_NEGATIVE',
    confidence: 0.95,
    lab: { l: 55.2, a: 0.9, b: -1.2 },
    deltaE: 1.4,
    createdAt: '2026-09-15T11:20:00.000Z',
    operatorId: 'IC-9007 Gill',
    operatorName: 'Intelligence Officer S. Gill',
    officerRole: 'JUNIOR',
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-24B-118', expiry: '2027-04-30' },
    gps: { lat: 18.9438, lon: 72.8354, accuracy: 6.8, mocked: false },
    imageRef: 'file:///evidence/NCB-MZU-CR02-P2.jpg',
    imageSha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    conformalSet: ['NEGATIVE'],
  },
  {
    uuid: 'e07c9a34-2d1f-46b8-8a70-0c5e39bd61f2',
    caseRef: 'NCB/MZU/CR-02/2026',
    panchnamaRef: 'PAN/MZU/2026/091',
    packageNo: 'P-3',
    reagent: 'mecke',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.93,
    lab: { l: 22.8, a: 1.2, b: -8.4 },
    deltaE: 2.1,
    createdAt: '2026-09-15T11:45:00.000Z',
    operatorId: 'IC-9007 Gill',
    operatorName: 'Intelligence Officer S. Gill',
    officerRole: 'JUNIOR',
    kit: { make: 'Anchor', test: 'Field Kit MK', lot: 'AM-25C-077', expiry: '2027-05-15' },
    gps: { lat: 18.9438, lon: 72.8354, accuracy: 6.8, mocked: true },
    imageRef: 'file:///evidence/NCB-MZU-CR02-P3.jpg',
    imageSha256: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    conformalSet: ['POSITIVE'],
  },

  // ─── Case 3: NCB/KZU/CR-07/2026 (Howrah Railway Yard Parcel Office, Kolkata) ───
  // Intercepted railway parcel consignment — Brown Sugar / Crude Heroin
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0001',
    caseRef: 'NCB/KZU/CR-07/2026',
    panchnamaRef: 'PAN/KZU/2026/312',
    packageNo: 'P-1',
    lotNo: 'LOT-KOL-2026-04',
    reagent: 'froehde',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.96,
    lab: { l: 24.1, a: -4.2, b: 18.5 },
    deltaE: 2.0,
    createdAt: '2026-09-12T07:45:00.000Z',
    operatorId: 'SI-5521 Mukherjee',
    operatorName: 'Sub-Inspector A. Mukherjee',
    officerRole: 'SENIOR',
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-25A-201', expiry: '2027-08-15' },
    gps: { lat: 22.5831, lon: 88.3426, accuracy: 4.8, mocked: false },
    imageRef: 'file:///evidence/NCB-KZU-CR07-P1.jpg',
    imageSha256: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeefff1',
    conformalSet: ['POSITIVE'],
  },
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0002',
    caseRef: 'NCB/KZU/CR-07/2026',
    panchnamaRef: 'PAN/KZU/2026/312',
    packageNo: 'P-2',
    lotNo: 'LOT-KOL-2026-04',
    reagent: 'froehde',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.94,
    lab: { l: 24.5, a: -4.0, b: 18.2 },
    deltaE: 2.3,
    createdAt: '2026-09-12T08:00:00.000Z',
    operatorId: 'SI-5521 Mukherjee',
    operatorName: 'Sub-Inspector A. Mukherjee',
    officerRole: 'SENIOR',
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-25A-201', expiry: '2027-08-15' },
    gps: { lat: 22.5831, lon: 88.3426, accuracy: 4.8, mocked: false },
    imageRef: 'file:///evidence/NCB-KZU-CR07-P2.jpg',
    imageSha256: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeefff2',
    conformalSet: ['POSITIVE'],
  },
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0003',
    caseRef: 'NCB/KZU/CR-07/2026',
    panchnamaRef: 'PAN/KZU/2026/312',
    packageNo: 'P-3',
    lotNo: 'LOT-KOL-2026-04',
    reagent: 'marquis',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.98,
    lab: { l: 18.9, a: 15.8, b: -11.9 },
    deltaE: 1.6,
    createdAt: '2026-09-12T08:20:00.000Z',
    operatorId: 'SI-5521 Mukherjee',
    operatorName: 'Sub-Inspector A. Mukherjee',
    officerRole: 'SENIOR',
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-24B-118', expiry: '2027-04-30' },
    gps: { lat: 22.5831, lon: 88.3426, accuracy: 4.8, mocked: false },
    imageRef: 'file:///evidence/NCB-KZU-CR07-P3.jpg',
    imageSha256: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeefff3',
    conformalSet: ['POSITIVE'],
  },
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0004',
    caseRef: 'NCB/KZU/CR-07/2026',
    panchnamaRef: 'PAN/KZU/2026/312',
    packageNo: 'P-4',
    lotNo: 'LOT-KOL-2026-04',
    reagent: 'marquis',
    outcome: 'CONSISTENT_WITH_REAGENT_NEGATIVE',
    confidence: 0.99,
    lab: { l: 82.3, a: -0.5, b: 3.2 },
    deltaE: 0.8,
    createdAt: '2026-09-12T08:35:00.000Z',
    operatorId: 'SI-5521 Mukherjee',
    operatorName: 'Sub-Inspector A. Mukherjee',
    officerRole: 'SENIOR',
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-24B-118', expiry: '2027-04-30' },
    gps: { lat: 22.5831, lon: 88.3426, accuracy: 4.8, mocked: false },
    imageRef: 'file:///evidence/NCB-KZU-CR07-P4.jpg',
    imageSha256: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeefff4',
    conformalSet: ['NEGATIVE'],
  },

  // ─── Case 4: NCB/BZU/CR-19/2026 (Electronic City Courier Hub, Bengaluru) ───
  // High-purity synthetic methamphetamine intercepted from international courier
  {
    uuid: 'b78a9c40-1e54-4f90-8801-44aa00bb1101',
    caseRef: 'NCB/BZU/CR-19/2026',
    panchnamaRef: 'PAN/BZU/2026/505',
    packageNo: 'P-1',
    lotNo: 'LOT-BLR-2026-09',
    reagent: 'marquis',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.98,
    lab: { l: 48.2, a: 28.5, b: 42.1 },
    deltaE: 1.9,
    createdAt: '2026-09-15T13:40:00.000Z',
    operatorId: 'Insp-1044 Rao',
    operatorName: 'Inspector V. Rao',
    officerRole: 'SENIOR',
    kit: { make: 'Anchor', test: 'Field Kit MK', lot: 'AM-25C-082', expiry: '2027-06-30' },
    gps: { lat: 12.8452, lon: 77.6602, accuracy: 3.9, mocked: false },
    imageRef: 'file:///evidence/NCB-BZU-CR19-P1.jpg',
    imageSha256: '88889999aaaabbbbccccddddeeeeffff00001111222233334444555566667771',
    conformalSet: ['POSITIVE'],
  },
  {
    uuid: 'b78a9c40-1e54-4f90-8801-44aa00bb1102',
    caseRef: 'NCB/BZU/CR-19/2026',
    panchnamaRef: 'PAN/BZU/2026/505',
    packageNo: 'P-2',
    lotNo: 'LOT-BLR-2026-09',
    reagent: 'marquis',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.97,
    lab: { l: 49.0, a: 27.8, b: 41.5 },
    deltaE: 2.1,
    createdAt: '2026-09-15T14:10:00.000Z',
    operatorId: 'Insp-1044 Rao',
    operatorName: 'Inspector V. Rao',
    officerRole: 'SENIOR',
    kit: { make: 'Anchor', test: 'Field Kit MK', lot: 'AM-25C-082', expiry: '2027-06-30' },
    gps: { lat: 12.8452, lon: 77.6602, accuracy: 3.9, mocked: false },
    imageRef: 'file:///evidence/NCB-BZU-CR19-P2.jpg',
    imageSha256: '88889999aaaabbbbccccddddeeeeffff00001111222233334444555566667772',
    conformalSet: ['POSITIVE'],
  },
];

const CASE_METAS = [
  {
    caseRef: 'NCB/DZU/CR-14/2026',
    status: 'UNDER_REVIEW',
    panchnamaRef: 'PAN/DZU/2026/884',
    firstSeen: '2026-09-14T09:11:00.000Z',
    lastSeen: '2026-09-14T14:30:00.000Z',
    history: [
      {
        from: 'REPORTED',
        to: 'UNDER_REVIEW',
        actor: 'supervisor',
        at: '2026-09-14T14:30:00.000Z',
        note: 'All 6 packages Marquis positive with identical kinetics (ΔE00 < 2.0). Chain of custody intact. Forwarded to CRCL for confirmatory chemical examination.',
      },
    ],
  },
  {
    caseRef: 'NCB/MZU/CR-02/2026',
    status: 'REPORTED',
    panchnamaRef: 'PAN/MZU/2026/091',
    firstSeen: '2026-09-15T11:05:00.000Z',
    lastSeen: '2026-09-15T11:45:00.000Z',
    history: [],
  },
  {
    caseRef: 'NCB/KZU/CR-07/2026',
    status: 'REVIEWED',
    panchnamaRef: 'PAN/KZU/2026/312',
    firstSeen: '2026-09-12T07:45:00.000Z',
    lastSeen: '2026-09-13T11:30:00.000Z',
    history: [
      {
        from: 'REPORTED',
        to: 'UNDER_REVIEW',
        actor: 'supervisor',
        at: '2026-09-12T16:00:00.000Z',
        note: 'Parcel consignment intercepted at Howrah. Packages 1-3 CONSISTENT_WITH_REAGENT_POSITIVE (Froehde); package 4 inert cutting agent.',
      },
      {
        from: 'UNDER_REVIEW',
        to: 'REVIEWED',
        actor: 'admin',
        at: '2026-09-13T11:30:00.000Z',
        note: "Inventory verified before Hon'ble Magistrate under Section 52A NDPS. Pre-trial disposal certification complete.",
      },
    ],
  },
  {
    caseRef: 'NCB/BZU/CR-19/2026',
    status: 'ESCALATED',
    panchnamaRef: 'PAN/BZU/2026/505',
    firstSeen: '2026-09-15T13:40:00.000Z',
    lastSeen: '2026-09-16T08:00:00.000Z',
    history: [
      {
        from: 'REPORTED',
        to: 'UNDER_REVIEW',
        actor: 'supervisor',
        at: '2026-09-15T17:30:00.000Z',
        note: 'Courier package intercepted. Marquis test CONSISTENT_WITH_REAGENT_POSITIVE.',
      },
      {
        from: 'UNDER_REVIEW',
        to: 'ESCALATED',
        actor: 'supervisor',
        at: '2026-09-16T08:00:00.000Z',
        note: 'Commercial quantity interstate syndicate tracking initiated. Transferred to Special Operations Unit.',
      },
    ],
  },
];

export async function seedDemoData(db: ServerDb): Promise<{ accounts: number; cases: number; records: number }> {
  // 1. Seed accounts
  for (const acc of SEED_ACCOUNTS) {
    await db.insertOfficer(acc.username, acc.password, acc.displayName, acc.role);
  }

  // 2. Check if records already exist — don't duplicate on restarts
  const existingCount = await db.store.get<{ c: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS c FROM field_test');
  if (Number(existingCount?.c ?? 0) > 0) {
    return {
      accounts: SEED_ACCOUNTS.length,
      cases: CASE_METAS.length,
      records: Number(existingCount?.c ?? 0),
    };
  }

  // 3. Build cryptographic hash chain for records
  const GENESIS_PREV_HASH = '0'.repeat(64);
  let prevHash = GENESIS_PREV_HASH;
  let seq = 1;

  for (const s of SEED_RECORDS) {
    const sealPayload = {
      record_uuid: s.uuid,
      case_ref: s.caseRef,
      package_no: s.packageNo,
      reagent: s.reagent,
      corrected_lab_l: s.lab.l,
      corrected_lab_a: s.lab.a,
      corrected_lab_b: s.lab.b,
      calib_residual_mean: 0.8,
      calib_grade: 'GREEN',
      outcome: s.outcome,
      confidence: s.confidence,
      operator_id: s.operatorId,
      device_clock_iso: s.createdAt,
    };

    const payloadJcs = canonicalizeJson(sealPayload);
    const recordHash = await sha256Hex(payloadJcs);
    const chainHash = await sha256Hex(prevHash + recordHash);

    const fullWireBody = {
      record_uuid: s.uuid,
      case_ref: s.caseRef,
      panchnama_ref: s.panchnamaRef,
      package_no: s.packageNo,
      lot_no: s.lotNo ?? null,
      reagent: s.reagent,
      kit: { make: s.kit.make, test_name: s.kit.test, lot_no: s.kit.lot, expiry: s.kit.expiry },
      corrected_lab: s.lab,
      delta_e_00: s.deltaE,
      calibration_residual: { mean: 0.8, max: 1.5, grade: 'GREEN' },
      outcome: s.outcome,
      confidence: s.confidence,
      conformal_set: s.conformalSet,
      abstention_reason: s.abstentionReason ?? null,
      kinetics: [{ t_ms: 0, delta_e: 0.1 }, { t_ms: 15000, delta_e: s.deltaE * 0.7 }, { t_ms: 30000, delta_e: s.deltaE }],
      gps: { lat: s.gps.lat, lon: s.gps.lon, accuracy_m: s.gps.accuracy, mocked: s.gps.mocked },
      image_ref: s.imageRef,
      image_sha256: s.imageSha256,
      operator_id: s.operatorId,
      operator_name: s.operatorName,
      officer_role: s.officerRole,
      created_at: s.createdAt,
      payload_jcs: payloadJcs,
      record_hash: recordHash,
      prev_hash: prevHash,
      chain_hash: chainHash,
      device_attestation: `3045022100${chainHash.slice(0, 58)}0220${recordHash.slice(0, 60)}`,
      is_demo: true,
      sync_status_at_seal: 'synced',
    };

    await db.store.run(
      `INSERT INTO field_test (seq, record_uuid, case_ref, package_no, operator_id, outcome, confidence,
          created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
          device_attestation, image_ref, image_sha256, body)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      seq++,
      s.uuid,
      s.caseRef,
      s.packageNo,
      s.operatorId,
      s.outcome,
      s.confidence,
      s.createdAt,
      s.createdAt,
      payloadJcs,
      recordHash,
      prevHash,
      chainHash,
      fullWireBody.device_attestation,
      s.imageRef,
      s.imageSha256,
      JSON.stringify(fullWireBody)
    );

    prevHash = chainHash;
  }

  // 4. Seed cases and status history
  for (const cm of CASE_METAS) {
    await db.store.run(
      `INSERT INTO cases (case_ref, case_status, first_seen, last_seen, panchnama_ref)
       VALUES (?,?,?,?,?) ON CONFLICT (case_ref) DO UPDATE SET
       case_status = excluded.case_status,
       first_seen = excluded.first_seen,
       last_seen = excluded.last_seen,
       panchnama_ref = excluded.panchnama_ref`,
      cm.caseRef,
      cm.status,
      cm.firstSeen,
      cm.lastSeen,
      cm.panchnamaRef
    );

    for (const h of cm.history) {
      await db.store.run(
        `INSERT INTO case_status_history (case_ref, from_status, to_status, actor, at, note)
         VALUES (?,?,?,?,?,?)`,
        cm.caseRef,
        h.from,
        h.to,
        h.actor,
        h.at,
        h.note
      );
    }
  }

  // 5. Seed realistic audit entries
  const audits = [
    { actor: 'admin', action: 'user-created', subject: 'supervisor', at: '2026-09-11T09:00:00.000Z', detail: 'role: SUPERVISOR' },
    { actor: 'admin', action: 'user-created', subject: 'judiciary', at: '2026-09-11T09:05:00.000Z', detail: 'role: JUDICIARY' },
    { actor: 'sharma', action: 'login', subject: 'sharma', at: '2026-09-14T09:00:00.000Z', detail: 'from 127.0.0.1' },
    { actor: 'sharma', action: 'record-ingested', subject: 'a3f19c20-7d41-4b02-9e58-1c6d2f70ab11', at: '2026-09-14T09:11:05.000Z', detail: 'case NCB/DZU/CR-14/2026 / P-1' },
    { actor: 'supervisor', action: 'case-status', subject: 'NCB/DZU/CR-14/2026', at: '2026-09-14T14:30:00.000Z', detail: 'REPORTED → UNDER_REVIEW' },
    { actor: 'admin', action: 'case-status', subject: 'NCB/KZU/CR-07/2026', at: '2026-09-13T11:30:00.000Z', detail: 'UNDER_REVIEW → REVIEWED' },
    { actor: 'supervisor', action: 'case-status', subject: 'NCB/BZU/CR-19/2026', at: '2026-09-16T08:00:00.000Z', detail: 'UNDER_REVIEW → ESCALATED' },
  ];

  for (const a of audits) {
    await db.store.run(
      'INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)',
      a.actor,
      a.action,
      a.subject,
      a.at,
      a.detail
    );
  }

  return {
    accounts: SEED_ACCOUNTS.length,
    cases: CASE_METAS.length,
    records: SEED_RECORDS.length,
  };
}

// Standalone execution: node --experimental-strip-types server/src/seed.ts
const isDirectRun =
  typeof process !== 'undefined' && process.argv[1] !== undefined && process.argv[1].endsWith('seed.ts');

if (isDirectRun) {
  void (async () => {
    try {
      process.stdout.write('Opening database for seeding...\n');
      const db = await ServerDb.open();
      process.stdout.write(`Database opened (engine: ${db.engine})\n`);
      const res = await seedDemoData(db);
      process.stdout.write(
        `Seeding complete! Seeded ${res.accounts} accounts, ${res.cases} cases, and ${res.records} cryptographic field test records.\n`
      );
      await db.close();
      process.exit(0);
    } catch (err) {
      process.stderr.write(`Seeding failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  })();
}
