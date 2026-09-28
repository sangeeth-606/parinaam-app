/** Deterministic self-hosted demo accounts, cases, and evidence for local use only. */

import { ServerDb } from './db.ts';
import {
  buildDemoFieldTestRecords,
  DEMO_CASES,
  DEMO_CASE_COUNT,
  DEMO_DATASET_VERSION,
  DEMO_RECORD_COUNT,
} from '../../src/demo/demo-dataset.ts';
import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';
import { verifyFieldTestRecord } from './verify.ts';

import { seedOfficers } from './seed-officers.ts';
export { OFFICER_ROSTER } from '../../src/demo/officer-roster.ts';

export interface SeedResult {
  accountsCreated: number;
  recordsInserted: number;
  casesInserted: number;
  datasetVersion: typeof DEMO_DATASET_VERSION;
}

export async function seedDemo(db: ServerDb): Promise<SeedResult> {
  const records = await buildDemoFieldTestRecords();
  if (records.length !== DEMO_RECORD_COUNT || DEMO_CASES.length !== DEMO_CASE_COUNT) {
    throw new Error('shared demo dataset failed its fixed cardinality invariant');
  }
  for (const record of records) {
    const verified = await verifyFieldTestRecord(record, {
      expectedSeq: record.seq,
      expectedPrevHash: records[record.seq - 2]?.chain_hash ?? '0'.repeat(64),
      operatorCode: record.operator_id,
    });
    if (!verified.ok) throw new Error(`shared demo record ${record.seq} failed verification: ${verified.code}`);
  }

  const accountsCreated = await seedOfficers(db);

  const demoFlag = db.engine === 'postgres' ? true : 1;
  const result = await db.store.transaction(async (tx) => {
    const existingCount = await tx.get<{ count: number }>('SELECT COUNT(*) AS count FROM field_test');
    const head = await tx.get<{ seq: number; chain_hash: string }>('SELECT seq, chain_hash FROM ledger_head WHERE id = 1');
    const existingHeadSeq = Number(head?.seq ?? 0);
    if (Number(existingCount?.count ?? 0) > 0 && existingHeadSeq > 0) {
      const demoPresent = await tx.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM field_test WHERE is_demo = ?',
        demoFlag
      );
      if (Number(demoPresent?.count ?? 0) !== records.length) {
        throw new Error('demo seed requires an empty ledger or a complete previous demo dataset; existing evidence was not modified');
      }
      return { recordsInserted: 0, casesInserted: 0 };
    }
    if (existingHeadSeq !== 0) {
      throw new Error('ledger head is inconsistent with field_test; refusing to seed demo evidence');
    }

    let recordsInserted = 0;
    const caseFirst = new Map<string, string>();
    const caseLast = new Map<string, string>();
    for (const record of records) {
      await tx.run(
        `INSERT INTO field_test (
          seq, record_uuid, case_ref, package_no, officer_code, operator_id, operator_name, outcome, confidence,
          reagent, kit_type, kit_batch, region, department, location_label,
          created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
          device_attestation, image_ref, image_sha256, is_demo, body
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        record.seq,
        record.record_uuid,
        record.case_ref,
        record.package_no,
        record.operator_id,
        record.operator_id,
        record.operator_name,
        record.outcome,
        record.confidence,
        record.reagent,
        record.kit.test_name,
        record.kit.lot_no,
        record.case_ref.split('/')[1] ?? 'UNKNOWN',
        'NCB',
        demoLocation(record.case_ref),
        record.created_at,
        record.created_at,
        record.payload_jcs,
        record.record_hash,
        record.prev_hash,
        record.chain_hash,
        null,
        null,
        null,
        demoFlag,
        JSON.stringify(record)
      );
      const first = caseFirst.get(record.case_ref);
      caseFirst.set(record.case_ref, first === undefined || record.created_at < first ? record.created_at : first);
      const last = caseLast.get(record.case_ref);
      caseLast.set(record.case_ref, last === undefined || record.created_at > last ? record.created_at : last);
      recordsInserted += 1;
    }
    const last = records.at(-1);
    if (!last) throw new Error('demo dataset is empty');
    await tx.run('UPDATE ledger_head SET seq = ?, chain_hash = ?, updated_at = ? WHERE id = 1', last.seq, last.chain_hash, last.created_at);

    let casesInserted = 0;
    for (const entry of DEMO_CASES) {
      await tx.run(
        `INSERT INTO cases (
          case_ref, case_status, panchnama_ref, region, department, location_label,
          first_record_at, last_record_at, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        entry.case_ref,
        entry.case_status,
        entry.panchnama_ref,
        entry.region,
        entry.department,
        entry.location_label,
        caseFirst.get(entry.case_ref) ?? null,
        caseLast.get(entry.case_ref) ?? null,
        caseFirst.get(entry.case_ref) ?? entry.history[0]?.at ?? null,
        entry.history.at(-1)?.at ?? caseLast.get(entry.case_ref) ?? null
      );
      for (const event of entry.history) {
        await tx.run(
          'INSERT INTO case_status_history (case_ref, from_status, to_status, actor, at, note) VALUES (?,?,?,?,?,?)',
          entry.case_ref,
          event.from,
          event.to,
          event.actor,
          event.at,
          event.note
        );
      }
      casesInserted += 1;
    }
    await tx.run(
      'INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)',
      'system',
      'demo-seeded',
      DEMO_DATASET_VERSION,
      last.created_at,
      canonicalizeJson({ records: recordsInserted, cases: casesInserted, synthetic: true })
    );
    return { recordsInserted, casesInserted };
  });

  return { accountsCreated, ...result, datasetVersion: DEMO_DATASET_VERSION };
}

function demoLocation(caseRef: string): string {
  const region = caseRef.split('/')[1] ?? 'UNKNOWN';
  return {
    DZU: 'Delhi air cargo complex',
    MZU: 'JNPT parcel receiving area',
    KZU: 'Kolkata railway parcel office',
    BZU: 'Bengaluru courier hub',
  }[region] ?? region;
}

if (process.argv[1]?.endsWith('/server/src/seed.ts') || process.argv[1] === 'server/src/seed.ts') {
  const db = await ServerDb.open();
  try {
    const result = await seedDemo(db);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await db.close();
  }
}
