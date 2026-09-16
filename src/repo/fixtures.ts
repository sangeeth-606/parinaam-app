/**
 * Ledger fixtures — honest DEMO records for the simulator build, shaped exactly like
 * AppendInput so they run through the same canonicalization + chain as live records.
 * Colours are drawn from the REAL REAGENT_PROFILES class centroids (printed-swatch
 * calibration data — constraint 9: zero real seizure imagery), with burst-scale jitter.
 *
 * Field builds hydrate the same store from SQLCipher; fixtures never ship as "real" —
 * they are dated within the current session and flagged in the About screen.
 */

import type { ReagentType } from '../types/domain';
import type { LabValue } from '../types/contracts';
import { REAGENT_PROFILES } from '../classify/reagent-profiles.ts';
import type { AppendInput } from '../state/ledger-store';
import { residualFromBurstCovariance, round2, synthesizeKinetics } from '../services/analysis-pipeline.ts';

export type LedgerSeed = AppendInput;

function labNear(
  reagent: ReagentType,
  cls: 'POSITIVE' | 'NEGATIVE',
  l: number,
  jitter: number
): LabValue {
  const mean = REAGENT_PROFILES[reagent].classes[cls].mean;
  return { l, a: round2(mean[0] + jitter), b: round2(mean[1] - jitter * 0.6) };
}

function iso(minsAgo: number): string {
  return new Date(Date.now() - minsAgo * 60000).toISOString();
}

function baseSealPayload(d: Omit<AppendInput, 'sealPayload'>) {
  return {
    record_uuid: d.record_uuid,
    case_ref: d.case_ref,
    package_no: d.package_no,
    reagent: d.reagent,
    corrected_lab_l: d.lab.l,
    corrected_lab_a: d.lab.a,
    corrected_lab_b: d.lab.b,
    calib_residual_mean: d.residual.meanDeltaE,
    calib_grade: d.residual.grade,
    outcome: d.outcome,
    confidence: d.confidence,
    operator_id: d.operator,
    device_clock_iso: d.created_at,
  };
}

interface Spec {
  uuid: string;
  caseRef: string;
  pkg: string;
  lot?: string;
  reagent: ReagentType;
  cls: 'POSITIVE' | 'NEGATIVE';
  kind: AppendInput['outcome'];
  l: number;
  jitter: number;
  noiseVar: number;
  confidence: number;
  minsAgo: number;
  operator: string;
  gpsMocked?: boolean;
  conformal: string[];
  abstention?: AppendInput['abstentionReason'];
  kinetics?: { plateau: number; durMs: number; t50: number };
  kit: { make: string; test: string; lot: string };
}

const SPECS: Spec[] = [
  // Case CR-14: six Marquis-positive packages measured minutes apart — the bunching
  // success demo (pairwise ΔE00 ≤ 3.0 → Rule 10(2) "Identical Results" remainder lot).
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    uuid: `a3f19c20-7d41-4b02-9e58-1c6d2f70ab1${n}`,
    caseRef: 'NCB/DZU/CR-14/2026',
    pkg: `P-${n}`,
    reagent: 'marquis' as ReagentType,
    cls: 'POSITIVE' as const,
    kind: 'CONSISTENT_WITH_REAGENT_POSITIVE' as const,
    l: 19.4 + n * 0.18,
    jitter: 0.5 + n * 0.14,
    noiseVar: 1.2 + n * 0.12,
    confidence: 0.97,
    minsAgo: 118 - n * 4,
    operator: 'HC-4412 Sharma',
    conformal: ['POSITIVE'],
    kinetics: { plateau: 8.4 + n * 0.2, durMs: 30000, t50: 8500 + n * 250 },
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-24B-118' },
  })),
  // Case CR-02: divergent mix — an abstained reading and two unlike kits — showing that
  // the engine REFUSES to bunch when reagent/outcome/colour disagree.
  {
    uuid: 'd41b6620-8f03-4a2b-90ce-5b2f7a9133dd',
    caseRef: 'NCB/MZU/CR-02/2026',
    pkg: 'P-1',
    reagent: 'duquenois_levine',
    cls: 'POSITIVE',
    kind: 'INCONCLUSIVE',
    l: 33.6,
    jitter: 4.8,
    noiseVar: 6.8,
    confidence: 0.54,
    minsAgo: 41,
    operator: 'IC-9007 Gill',
    conformal: ['POSITIVE', 'NEGATIVE'],
    abstention: 'low_margin',
    kinetics: { plateau: 3.1, durMs: 30000, t50: 14000 },
    kit: { make: 'Anchor', test: 'Field Kit DQL', lot: 'AD-25C-031' },
  },
  {
    uuid: 'c92e77f0-15ba-4d84-a2c6-3e08f1d547aa',
    caseRef: 'NCB/MZU/CR-02/2026',
    pkg: 'P-2',
    reagent: 'scott',
    cls: 'NEGATIVE',
    kind: 'CONSISTENT_WITH_REAGENT_NEGATIVE',
    l: 55.2,
    jitter: 0.9,
    noiseVar: 2.6,
    confidence: 0.95,
    minsAgo: 30,
    operator: 'IC-9007 Gill',
    conformal: ['NEGATIVE'],
    kit: { make: 'Sirchie', test: 'NARK II', lot: 'MK-24B-118' },
  },
  {
    uuid: 'e07c9a34-2d1f-46b8-8a70-0c5e39bd61f2',
    caseRef: 'NCB/MZU/CR-02/2026',
    pkg: 'P-3',
    reagent: 'mecke',
    cls: 'POSITIVE',
    kind: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    l: 22.8,
    jitter: 1.2,
    noiseVar: 1.8,
    confidence: 0.93,
    minsAgo: 12,
    operator: 'IC-9007 Gill',
    gpsMocked: true,
    conformal: ['POSITIVE'],
    kinetics: { plateau: 7.6, durMs: 24000, t50: 7000 },
    kit: { make: 'Anchor', test: 'Field Kit MK', lot: 'AM-25C-077' },
  },
];

export async function seedLedgerRecords(): Promise<LedgerSeed[]> {
  return SPECS.map((s) => {
    const lab = labNear(s.reagent, s.cls, s.l, s.jitter);
    const cov: number[][] = [
      [s.noiseVar, s.noiseVar * 0.12],
      [s.noiseVar * 0.12, s.noiseVar * 0.9],
    ];
    const residual = residualFromBurstCovariance(cov);
    const core: Omit<AppendInput, 'sealPayload'> = {
      record_uuid: s.uuid,
      case_ref: s.caseRef,
      panchnama_ref:
        s.caseRef === 'NCB/DZU/CR-14/2026' ? 'PAN/DZU/2026/884' : 'PAN/MZU/2026/091',
      package_no: s.pkg,
      lot_no: s.lot,
      reagent: s.reagent,
      kit_test_name: s.kit.test,
      kit_make: s.kit.make,
      kit_lot_no: s.kit.lot,
      lab,
      residual,
      outcome: s.kind,
      confidence: s.confidence,
      deltaE: round2(Math.sqrt(s.noiseVar) + (s.cls === 'POSITIVE' ? 6.4 : 1.3)),
      conformalSet: s.conformal,
      abstentionReason: s.abstention ?? null,
      created_at: iso(s.minsAgo),
      operator: s.operator,
      kinetics: s.kinetics
        ? synthesizeKinetics(s.kinetics.plateau, s.kinetics.durMs, s.kinetics.t50, 500, s.minsAgo)
        : undefined,
      gps: {
        lat: s.gpsMocked ? 28.6304 : 30.7333 + s.jitter * 0.001,
        lon: s.gpsMocked ? 77.2177 : 76.7794 + s.jitter * 0.001,
        accuracyM: 6.4,
        mocked: !!s.gpsMocked,
      },
    };
    return { ...core, sealPayload: baseSealPayload(core) };
  });
}
