/**
 * Ledger Store — the append-only, hash-chained record table the UI reads.
 *
 * V2 (phase C): the SQLite file behind `src/db/ledger-repository.ts` IS the source of
 * truth — the store hydrates from it at boot and writes every append through. Integrity
 * is REAL: canonical JSON (RFC 8785) + SHA-256 chain + keystore seal where the device
 * actually achieves one (AGENTS rule 10: null attestation is stated, never papered over).
 *
 * If the database cannot be opened, the store degrades to an in-session list AND reports
 * `persistenceError` — screens must surface it; silently pretending is forbidden.
 * Tamper demonstration (simulateTamper/resetDemo) mutates the IN-SESSION view only;
 * the file is never rewritten (rule 2), and resetDemo replaces the file itself
 * (destroy + re-init) under an explicitly labelled "demo reset" affordance.
 */

import { create } from 'zustand';
import type { LabValue, CalibrationResidual } from '../types/contracts';
import type { CameraEngineResult } from '../capture/camera-engine-contract.ts';
import type {
  AbstentionReason,
  KineticPoint,
  PresumptiveOutcomeKind,
  ReagentType,
} from '../types/domain';
import {
  GENESIS_PREV_HASH,
  verifyChain,
  type ChainVerificationResult,
  type HashChainRecordItem,
} from '../crypto/hash-chain.ts';
import { buildSealedRecord } from '../services/analysis-pipeline.ts';
import {
  sealedPayloadFromCore,
  type FieldTestOfficerRole,
  type FieldTestGpsSource,
} from '../contracts/field-test-record.ts';
import { seedLedgerRecords } from '../repo/fixtures.ts';
import {
  initLedgerDb,
  ledgerDbMeta,
  persistRecord,
  persistEngineResult,
  queueForSync,
  markSyncedDb,
  markDeadLetterStateDb,
  resetLedgerFile,
  type LedgerDbMeta,
} from '../db/ledger-repository.ts';

export interface LedgerRecord {
  seq: number;
  record_uuid: string;
  case_ref: string;
  panchnama_ref?: string;
  package_no: string;
  lot_no?: string;
  reagent: ReagentType;
  kit_test_name?: string;
  kit_make?: string;
  kit_lot_no?: string;
  kit_expiry?: string;
  lab: LabValue;
  residual: CalibrationResidual;
  outcome: PresumptiveOutcomeKind;
  confidence: number;
  deltaE: number;
  conformalSet: string[];
  abstentionReason?: AbstentionReason | null;
  created_at: string;
  operator: string;
  operatorName?: string;
  officerRole?: string;
  isDemo?: boolean;
  kinetics?: KineticPoint[];
  gps?: { lat: number; lon: number; accuracyM?: number; mocked: boolean; source?: FieldTestGpsSource };
  imageRef?: string | null;
  imageSha256?: string | null;
  engineResult?: CameraEngineResult;
  // Chain + seal (real digests):
  payloadJcs: string;
  payloadSha256: string;
  prevHash: string;
  chainHash: string;
  deviceAttestation: string | null;
  sealState: SealOutcome['sealState'];
  /**
   * Upload state. 'dead-letter' means the server permanently refused this record:
   * it was never uploaded, it is retained locally rather than dropped, and the UI
   * must say so instead of reporting an empty outbox.
   */
  syncStatus: 'demo-seed' | 'queued' | 'synced' | 'dead-letter';
  /**
   * v4 phase 2 — set only when the write-through to the ledger file failed. The record exists
   * in memory for this session but is NOT on disk; screens must say so rather than presenting
   * an unsaved record as sealed evidence.
   */
  persistError?: string;
}

type SealOutcome = Awaited<ReturnType<typeof buildSealedRecord>> extends { seal: infer S } ? S : never;

/** Core facts appended by the capture flow; the store builds the final seal. */
export type AppendInput = Omit<
  LedgerRecord,
  | 'seq'
  | 'syncStatus'
  | 'payloadJcs'
  | 'payloadSha256'
  | 'prevHash'
  | 'chainHash'
  | 'deviceAttestation'
  | 'sealState'
>;

export type { CalibrationResidual };

interface LedgerState {
  records: LedgerRecord[];
  seeded: boolean;
  verifying: boolean;
  verification: ChainVerificationResult | null;
  /** True once the in-session chain view was tampered with for demonstration. */
  demoCorrupted: boolean;
  /** Persistence facts (phase C) — null until seed(); kind 'none' ⇒ memory fallback. */
  persistence: LedgerDbMeta | null;
  seed: () => Promise<void>;
  appendRecord: (input: AppendInput) => Promise<LedgerRecord>;
  reverify: () => Promise<ChainVerificationResult>;
  /** Integrity DEMONSTRATION only — corrupts the in-session view. Restore = resetDemo. */
  simulateTamper: (index: number) => Promise<ChainVerificationResult>;
  resetDemo: () => Promise<void>;
  clearAllRecords: () => Promise<void>;
  markSynced: (uuids: string[]) => void;
  markDeadLettered: (uuids: string[], reason?: string) => void;
}

function chainItems(records: LedgerRecord[]): HashChainRecordItem[] {
  return records.map((r) => ({
    seq: r.seq,
    record_uuid: r.record_uuid,
    payload_jcs: r.payloadJcs,
    payload_sha256: r.payloadSha256,
    prev_hash: r.prevHash,
    chain_hash: r.chainHash,
  }));
}

const PREINSTALLED_FIXTURE_UUIDS = new Set([
  'a3f19c20-7d41-4b02-9e58-1c6d2f70ab11',
  'a3f19c20-7d41-4b02-9e58-1c6d2f70ab12',
  'a3f19c20-7d41-4b02-9e58-1c6d2f70ab13',
  'a3f19c20-7d41-4b02-9e58-1c6d2f70ab14',
  'a3f19c20-7d41-4b02-9e58-1c6d2f70ab15',
  'd41b6620-8f03-4a2b-90ce-5b2f7a9133dd',
  'c92e77f0-15ba-4d84-a2c6-3e08f1d547aa',
  'e07c9a34-2d1f-46b8-8a70-0c5e39bd61f2',
  'f5e32110-3a12-4c89-b789-7e12f45a0001',
  'f5e32110-3a12-4c89-b789-7e12f45a0002',
  'f5e32110-3a12-4c89-b789-7e12f45a0003',
  'f5e32110-3a12-4c89-b789-7e12f45a0004',
  'b78a9c40-1e54-4f90-8801-44aa00bb1101',
  'b78a9c40-1e54-4f90-8801-44aa00bb1102',
  'b78a9c40-1e54-4f90-8801-44aa00bb1103',
]);

export function isGenuineRecord(r: LedgerRecord): boolean {
  if (r.syncStatus === 'demo-seed') return false;
  if (PREINSTALLED_FIXTURE_UUIDS.has(r.record_uuid)) return false;
  return true;
}

/** Hydrate the shared deterministic demo chain without re-sealing it. */
async function fixtureRecords(): Promise<LedgerRecord[]> {
  return seedLedgerRecords();
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  records: [],
  seeded: false,
  verifying: false,
  verification: null,
  demoCorrupted: false,
  persistence: null,

  seed: async () => {
    if (get().seeded) return;
    let records: LedgerRecord[] = [];
    let persistence: LedgerDbMeta = {
      kind: 'none',
      pathLabel: 'uninitialised',
      encryption: 'none',
      fts5: false,
    };
    try {
      const init = await initLedgerDb();
      persistence = init.meta;
      records = init.records;
      const shouldSeedFixtures = persistence.kind === 'node-sqlite' || process.env.EXPO_PUBLIC_SEED_DEMO === 'true';
      if (records.length === 0 && shouldSeedFixtures) {
        records = await fixtureRecords();
        for (const r of records) {
          await persistRecord(r);
        }
      } else if (!shouldSeedFixtures) {
        // Ensure genuine production ledger on device contains zero mock fixtures
        records = records.filter(isGenuineRecord);
      }
    } catch (err) {
      // Persistence failed outright: keep working in-session, report loudly (never hide).
      persistence = {
        kind: 'none',
        pathLabel: 'PERSISTENCE FAILED — RECORDS DO NOT SURVIVE RESTART',
        encryption: 'none',
        fts5: false,
        error: err instanceof Error ? err.message : String(err),
      };
      if (persistence.kind === 'node-sqlite' || process.env.EXPO_PUBLIC_SEED_DEMO === 'true') {
        records = await fixtureRecords();
      }
    }
    const verification = await verifyChain(chainItems(records));
    set({ records, seeded: true, verification, demoCorrupted: false, persistence });
  },

  appendRecord: async (input) => {
    const state = get();
    const prevHash =
      state.records.length > 0
        ? state.records[state.records.length - 1].chainHash
        : GENESIS_PREV_HASH;
    if (!input.operatorName || !input.officerRole) {
      throw new Error('operatorName and officerRole are required to seal a record');
    }
    const seq = state.records.length + 1;
    const sealPayload = sealedPayloadFromCore({
      seq,
      record_uuid: input.record_uuid,
      case_ref: input.case_ref,
      package_no: input.package_no,
      lot_no: input.lot_no ?? null,
      reagent: input.reagent,
      kit: {
        make: input.kit_make ?? null,
        test_name: input.kit_test_name ?? null,
        lot_no: input.kit_lot_no ?? null,
        expiry: input.kit_expiry ?? null,
      },
      corrected_lab: input.lab,
      delta_e_00: input.deltaE,
      calibration_residual: {
        mean: input.residual.meanDeltaE,
        max: input.residual.maxDeltaE,
        grade: input.residual.grade === 'REJECT' ? 'DEGRADED' : input.residual.grade,
      },
      outcome: input.outcome,
      confidence: input.confidence,
      conformal_set: input.conformalSet,
      abstention_reason: input.abstentionReason ?? null,
      kinetics: input.kinetics?.length ? input.kinetics : null,
      gps: input.gps
        ? {
            lat: input.gps.lat,
            lon: input.gps.lon,
            accuracy_m: input.gps.accuracyM ?? null,
            mocked: input.gps.mocked,
            ...(input.gps.source ? { source: input.gps.source } : {}),
          }
        : null,
      image_sha256: input.imageSha256 ?? null,
      operator_id: input.operator,
      operator_name: input.operatorName,
      officer_role: input.officerRole as FieldTestOfficerRole,
      created_at: input.created_at,
      is_demo: input.isDemo ?? false,
    });
    const { seal } = await buildSealedRecord(sealPayload as unknown as Record<string, unknown>, prevHash, input.record_uuid);
    const record: LedgerRecord = {
      ...input,
      ...seal,
      seq,
      prevHash,
      syncStatus: 'queued',
    };
    const records = [...state.records, record]; // APPEND ONLY — never mutate history
    const verification = state.demoCorrupted
      ? state.verification
      : await verifyChain(chainItems(records));
    set({ records, verification: state.demoCorrupted ? state.verification : verification });

    // Persist for real (phase C): write-through + outbox queue row + audit entry.
    //
    // v4 phase 2 — this catch was empty and its comment claimed the failure "surfaces via
    // persistence facts on next read". Nothing surfaced it: no state was written and no
    // screen read it. `persistRecord` also returns `false` rather than throwing when no
    // adapter is active, so the MemoryAdapter path made every write a silent no-op and the
    // officer saw a sealed record that vanished on restart. Both paths are now reported.
    let persistError: string | null = null;
    try {
      const written = await persistRecord(record);
      if (!written) {
        persistError =
          'no database adapter is active — this record is held in memory only and will be lost when the app closes';
      } else {
        if (record.engineResult) await persistEngineResult(record.record_uuid, record.engineResult);
        await queueForSync(record.record_uuid, record.record_uuid);
      }
    } catch (e) {
      persistError = e instanceof Error ? e.message : String(e);
    }
    if (persistError) {
      const current = get().persistence;
      if (current) {
        set({ persistence: { ...current, error: persistError } });
      }
      // The in-memory record must carry the fact so the confirmation panel can say so.
      record.persistError = persistError;
    }
    return record;
  },

  reverify: async () => {
    set({ verifying: true });
    const verification = await verifyChain(chainItems(get().records));
    set({ verification, verifying: false, demoCorrupted: !verification.valid });
    return verification;
  },

  simulateTamper: async (index) => {
    const records = get().records.map((r, i) => {
      if (i !== index) return r;
      // Flip the payload WITHOUT re-sealing — exactly what an unauthorized SQLite write
      // looks like to the chain (TamperDemo mandate M4.6, mirrors verify.sh / AT Test 3).
      const mutated = r.payloadJcs.replace(/"package_no":"P-\d+"/, '"package_no":"P-99"');
      return { ...r, payloadJcs: mutated === r.payloadJcs ? `${r.payloadJcs} ` : mutated };
    });
    const verification = await verifyChain(chainItems(records));
    set({ records, verification, demoCorrupted: true });
    return verification;
  },

  resetDemo: async () => {
    // Demo reset: replace the LEDGER FILE itself (never UPDATE/DELETE rows — rule 2 is
    // enforced by triggers anyway) and re-seed the fixture chain into the fresh file.
    set({ records: [], seeded: false, verification: null, demoCorrupted: false });
    try {
      await resetLedgerFile();
    } catch {
      /* file already gone / memory path */
    }
    await get().seed();
  },

  clearAllRecords: async () => {
    // Complete local purge: drops tables, deletes SQLite file, and re-initializes an empty ledger.
    set({ records: [], seeded: false, verification: null, demoCorrupted: false });
    try {
      await resetLedgerFile();
    } catch {
      /* file already gone / memory path */
    }
    const init = await initLedgerDb();
    set({
      records: [],
      seeded: true,
      verification: null,
      demoCorrupted: false,
      persistence: init.meta,
    });
  },

  markSynced: (uuids) => {
    const eligible = new Set(
      get().records
        .filter((record) => uuids.includes(record.record_uuid) && record.syncStatus === 'queued')
        .map((record) => record.record_uuid)
    );
    set((s) => ({
      records: s.records.map((r) =>
        eligible.has(r.record_uuid) ? { ...r, syncStatus: 'synced' } : r
      ),
    }));
    for (const uuid of eligible) void markSyncedDb(uuid).catch(() => undefined);
  },

  /**
   * The server permanently refused these records. They stay in the ledger and stay in
   * the queue table (marked terminal) — nothing is deleted, because a record that never
   * reached the server must never look like a record that did.
   */
  markDeadLettered: (uuids, reason) => {
    const eligible = new Set(
      get().records
        .filter((record) => uuids.includes(record.record_uuid) && record.syncStatus === 'queued')
        .map((record) => record.record_uuid)
    );
    set((s) => ({
      records: s.records.map((r) =>
        eligible.has(r.record_uuid) ? { ...r, syncStatus: 'dead-letter' as const } : r
      ),
    }));
    for (const uuid of eligible) void markDeadLetterStateDb(uuid, reason ?? null).catch(() => undefined);
  },
}));

export const ledgerPersistenceFacts = (): LedgerDbMeta | null => ledgerDbMeta();
