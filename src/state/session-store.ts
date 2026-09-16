/**
 * Session Store — the in-flight New Test wizard draft (zustand).
 * Steps: 0 Setup · 1 Capture · 2 Analyze · 3 Outcome. Resumable from Duty screen.
 */

import { create } from 'zustand';
import type { BurstAcquisitionResult } from '../capture/burst-manager';
import type { DecisionResult } from '../types/contracts';
import type { KineticPoint, ReagentType } from '../types/domain';
import type { LedgerRecord } from './ledger-store';
import type { SealResult } from '../services/analysis-pipeline';

export const WIZARD_STEPS = ['Setup', 'Capture', 'Analyze', 'Outcome'] as const;

export interface TestSetupDraft {
  caseRef: string;
  panchnamaRef: string;
  packageNo: string;
  lotNo?: string;
  reagent: ReagentType | null;
  kitMake: string;
  kitTestName: string;
  kitLotNo: string;
  entryMethod: 'manual' | 'ocr';
}

interface SessionState {
  step: number;
  setup: TestSetupDraft;
  burst: BurstAcquisitionResult | null;
  residual: import('../types/contracts').CalibrationResidual | null;
  decision: DecisionResult | null;
  kinetics: KineticPoint[] | null;
  seal: SealResult | null;
  record: LedgerRecord | null;
  setStep: (step: number) => void;
  patchSetup: (patch: Partial<TestSetupDraft>) => void;
  setBurst: (burst: BurstAcquisitionResult | null) => void;
  setAnalysis: (p: {
    residual: SessionState['residual'];
    decision: SessionState['decision'];
    kinetics: SessionState['kinetics'];
  }) => void;
  setSeal: (seal: SealResult | null) => void;
  setRecord: (record: LedgerRecord | null) => void;
  reset: () => void;
  /** v2-G (G-D3): start the NEXT package lap — identity+kit survive, the measurement
   *  slate is wiped. The loop officer actually lives in. */
  resetLap: () => void;
  hasDraft: () => boolean;
  /** Suggest the next package number from the ledger (P-n). */
}

const emptySetup = (): TestSetupDraft => ({
  caseRef: '',
  panchnamaRef: '',
  packageNo: 'P-1',
  lotNo: '',
  reagent: null,
  kitMake: '',
  kitTestName: '',
  kitLotNo: '',
  entryMethod: 'manual',
});

export const useSessionStore = create<SessionState>((set, get) => ({
  step: 0,
  setup: emptySetup(),
  burst: null,
  residual: null,
  decision: null,
  kinetics: null,
  seal: null,
  record: null,

  setStep: (step) => set({ step }),
  patchSetup: (patch) => set({ setup: { ...get().setup, ...patch } }),
  setBurst: (burst) => set({ burst }),
  setAnalysis: ({ residual, decision, kinetics }) => set({ residual, decision, kinetics }),
  setSeal: (seal) => set({ seal }),
  setRecord: (record) => set({ record }),
  reset: () =>
    set({
      step: 0,
      setup: emptySetup(),
      burst: null,
      residual: null,
      decision: null,
      kinetics: null,
      seal: null,
      record: null,
    }),
  resetLap: () =>
    set({
      step: 1,
      burst: null,
      residual: null,
      decision: null,
      kinetics: null,
      seal: null,
      record: null,
    }),
  hasDraft: () => {
    const s = get();
    return s.step > 0 || s.burst !== null || s.record !== null || s.setup.caseRef.trim() !== '';
  },
}));

export function suggestNextPackageNo(existingCaseRef: string, packages: string[]): string {
  const nums = packages
    .filter((p) => /^P-\d+$/.test(p))
    .map((p) => parseInt(p.slice(2), 10))
    .filter((n) => !Number.isNaN(n));
  void existingCaseRef;
  return `P-${(nums.length ? Math.max(...nums) : 0) + 1}`;
}
