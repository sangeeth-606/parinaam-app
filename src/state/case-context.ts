/**
 * Case Context (v2 phase G, G-D1) — the single act a junior officer does ONCE per seizure.
 *
 * The loop this serves: open case → test package after package (identity + kit carry over,
 * package number auto-bumps) → group/bunch → senior reviews. Everything downstream
 * pre-fills from here; the state persists through app_state so an app kill mid-seizure
 * resumes with the same context (paired with the C6 wizard-draft persistence).
 */

import { create } from 'zustand';
import { getAppStateDb, setAppStateDb } from '../db/ledger-repository.ts';
import type { LedgerRecord } from './ledger-store.ts';
import type { ReagentType } from '../types/domain.ts';

const ACTIVE_CASE_KEY = 'active_case_v2';
const LAST_KIT_KEY = 'last_kit_v2';

export interface ActiveCase {
  caseRef: string;
  panchnamaRef: string;
  openedAt: string;
}

export interface KitRecap {
  reagent: ReagentType | null;
  kitMake: string;
  kitTestName: string;
  kitLotNo: string;
}

/** Next free P-n for a case, from sealed records (pure; unit-tested). */
export function suggestNextPackageFor(records: LedgerRecord[], caseRef: string): string {
  const nums = records
    .filter((r) => r.case_ref === caseRef && /^P-\d+$/i.test(r.package_no))
    .map((r) => parseInt(r.package_no.slice(2), 10))
    .filter((n) => !Number.isNaN(n));
  return `P-${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

/** Distinct packages already tested for a case (Duty card progress). */
export function testedPackagesFor(records: LedgerRecord[], caseRef: string): string[] {
  return [...new Set(records.filter((r) => r.case_ref === caseRef).map((r) => r.package_no))];
}

export interface CasePrefill {
  caseRef: string;
  panchnamaRef: string;
  packageNo: string;
  reagent: ReagentType | null;
  kitMake: string;
  kitTestName: string;
  kitLotNo: string;
}

/** Merge active case + last kit + ledger → what a new lap's setup should contain. */
export function prefillForNextLap(
  active: ActiveCase | null,
  kit: KitRecap,
  records: LedgerRecord[]
): CasePrefill | null {
  if (!active) return null;
  return {
    caseRef: active.caseRef,
    panchnamaRef: active.panchnamaRef,
    packageNo: suggestNextPackageFor(records, active.caseRef),
    reagent: kit.reagent,
    kitMake: kit.kitMake,
    kitTestName: kit.kitTestName,
    kitLotNo: kit.kitLotNo,
  };
}

interface CaseContextState {
  loaded: boolean;
  activeCase: ActiveCase | null;
  lastKit: KitRecap;
  init: () => Promise<void>;
  openCase: (caseRef: string, panchnamaRef: string) => Promise<void>;
  clearCase: () => Promise<void>;
  /** Called after a seal so the NEXT lap starts from the same kit (D9 loop). */
  rememberKit: (rec: { reagent: ReagentType; kit_make?: string; kit_test_name?: string; kit_lot_no?: string }) => Promise<void>;
}

const EMPTY_KIT: KitRecap = { reagent: null, kitMake: '', kitTestName: '', kitLotNo: '' };

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const useCaseContext = create<CaseContextState>((set) => ({
  loaded: false,
  activeCase: null,
  lastKit: EMPTY_KIT,

  init: async () => {
    const [caseRaw, kitRaw] = await Promise.all([getAppStateDb(ACTIVE_CASE_KEY), getAppStateDb(LAST_KIT_KEY)]);
    set({
      loaded: true,
      activeCase: parseJson<ActiveCase>(caseRaw),
      lastKit: parseJson<KitRecap>(kitRaw) ?? EMPTY_KIT,
    });
  },

  openCase: async (caseRef, panchnamaRef) => {
    const active: ActiveCase = { caseRef: caseRef.trim(), panchnamaRef: panchnamaRef.trim(), openedAt: new Date().toISOString() };
    set({ activeCase: active });
    await setAppStateDb(ACTIVE_CASE_KEY, JSON.stringify(active));
  },

  clearCase: async () => {
    set({ activeCase: null });
    await setAppStateDb(ACTIVE_CASE_KEY, '');
  },

  rememberKit: async (rec) => {
    const kit: KitRecap = {
      reagent: rec.reagent,
      kitMake: rec.kit_make ?? '',
      kitTestName: rec.kit_test_name ?? '',
      kitLotNo: rec.kit_lot_no ?? '',
    };
    set({ lastKit: kit });
    await setAppStateDb(LAST_KIT_KEY, JSON.stringify(kit));
  },
}));
