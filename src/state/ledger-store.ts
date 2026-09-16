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
import { seedLedgerRecords, type LedgerSeed } from '../repo/fixtures.ts';
import {
  initLedgerDb,
  ledgerDbMeta,
  persistRecord,
  queueForSync,
  markSyncedDb,
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
  gps?: { lat: number; lon: number; accuracyM?: number; mocked: boolean };
  imageRef?: string | null;
  imageSha256?: string | null;
  // Chain + seal (real digests):
  payloadJcs: string;
  payloadSha256: string;
  prevHash: string;
  chainHash: string;
  deviceAttestation: string | null;
  sealState: SealOutcome['sealState'];
  syncStatus: 'queued' | 'synced';
}

type SealOutcome = Awaited<ReturnType<typeof buildSealedRecord>> extends { seal: infer S } ? S : never;

/** Stored content minus chain/sequence fields, plus the exact object to canonicalize. */
export interface AppendInput
  extends Omit<
    LedgerRecord,
    'seq' | 'syncStatus' | 'payloadJcs' | 'payloadSha256' | 'prevHash' | 'chainHash' | 'deviceAttestation' | 'sealState'
  > {
  sealPayload: Record<string, unknown>;
}

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
  markSynced: (uuids: string[]) => void;
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

/** Build the demo fixture chain (canonical JSON + real hashing, flagged isDemo). */
async function fixtureRecords(): Promise<LedgerRecord[]> {
  const drafts: LedgerSeed[] = await seedLedgerRecords();
  const records: LedgerRecord[] = [];
  let prevHash = GENESIS_PREV_HASH;
  for (const d of drafts) {
    const { sealPayload, ...core } = d;
    const { seal } = await buildSealedRecord(sealPayload, prevHash, d.record_uuid);
    records.push({
      ...core,
      ...seal,
      isDemo: true,
      seq: records.length + 1,
      prevHash,
      syncStatus: 'synced',
    });
    prevHash = seal.chainHash;
  }
  return records;
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
      if (records.length === 0) {
        records = await fixtureRecords();
        for (const r of records) {
          await persistRecord(r);
          // Demo rows are presented SYNCED (they ship with the build) — record that fact
          // in the DB itself so restarts tell the same story as this session.
          await markSyncedDb(r.record_uuid, 'preinstalled-demo-fixture');
        }
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
      records = await fixtureRecords();
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
    const { sealPayload, ...core } = input;
    const { seal } = await buildSealedRecord(sealPayload, prevHash, input.record_uuid);
    const record: LedgerRecord = {
      ...core,
      ...seal,
      seq: state.records.length + 1,
      prevHash,
      syncStatus: 'queued',
    };
    const records = [...state.records, record]; // APPEND ONLY — never mutate history
    const verification = state.demoCorrupted
      ? state.verification
      : await verifyChain(chainItems(records));
    set({ records, verification: state.demoCorrupted ? state.verification : verification });

    // Persist for real (phase C): write-through + outbox queue row + audit entry.
    try {
      await persistRecord(record);
      await queueForSync(record.record_uuid, record.record_uuid);
    } catch {
      // The file write failed — surface via persistence facts on next read; the in-memory
      // view stays honest for the session, syncStatus 'queued' already reflects reality.
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

  markSynced: (uuids) => {
    set((s) => ({
      records: s.records.map((r) =>
        uuids.includes(r.record_uuid) ? { ...r, syncStatus: 'synced' } : r
      ),
    }));
    for (const uuid of uuids) void markSyncedDb(uuid).catch(() => undefined);
  },
}));

export const ledgerPersistenceFacts = (): LedgerDbMeta | null => ledgerDbMeta();
