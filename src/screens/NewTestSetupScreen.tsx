/**
 * NewTestSetupScreen — Wizard Step 1 · Evidentiary Intake (audit F1)
 *
 * Purpose:
 * - Records the chain-of-custody linkage identifiers (case/FIR, panchnama,
 *   package P-n, lot) and physical kit metadata BEFORE any capture is allowed.
 *   Rule 10(2) package-to-lot bunching later operates on exactly these values.
 *
 * Explainability law (AGENTS.md): blocked progress is never silent — the CTA
 * explains which fields block it, per-field errors sit under each field, and
 * the simulated OCR route is labelled SIMULATED, never presented as real.
 *
 * Data logic (validation, suggestion, patchSetup flow) is unchanged from the
 * audited implementation — only the presentation migrates to the light
 * evidentiary language (src/theme/evidence.ts + EvidenceBits).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { StateBanner } from '../components/ui/evidentiary/EvidenceBits';
import { prefillForNextLap, useCaseContext } from '../state/case-context';
import { WizardHeader } from '../components/ui/WizardHeader';
import { useSessionStore } from '../state/session-store';
import { useLedgerStore } from '../state/ledger-store';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';
import { REAGENT_LABEL } from '../domain/outcome-copy';
import type { ReagentType } from '../types/domain';

const REAGENT_ORDER: ReagentType[] = [
  'marquis',
  'mecke',
  'mandelin',
  'scott',
  'duquenois_levine',
  'simons',
  'ehrlich',
  'nitric_acid',
  'ferric_chloride',
];

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CASE_REF_RE = /^[A-Z]{2,4}\/[A-Z]{2,4}\/[A-Z0-9-]+\/\d{4}$/i;

/** Light mono identifier field with per-field explainable error. */
const LightField: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  helper?: string;
  optional?: boolean;
}> = ({ label, value, onChangeText, placeholder, error, helper, optional = false }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>
      {label.toUpperCase()}
      {optional ? ' (OPTIONAL)' : ' · REQUIRED'}
    </Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={T.textMuted}
      autoCapitalize="characters"
      autoCorrect={false}
      style={[styles.fieldInput, error ? styles.fieldInputError : null]}
      accessibilityLabel={label}
    />
    {error ? (
      <View style={styles.fieldErrorRow}>
        <Icon name="alert" size={12} color={T.dangerText} strokeWidth={2.5} />
        <Text style={styles.fieldError}>{error}</Text>
      </View>
    ) : helper ? (
      <Text style={styles.fieldHelper}>{helper}</Text>
    ) : null}
  </View>
);

export const NewTestSetupScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { setup, patchSetup, setStep, reset } = useSessionStore();
  const records = useLedgerStore((s) => s.records);

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [ocrNote, setOcrNote] = useState(false);
  const activeCase = useCaseContext((c) => c.activeCase);
  const lastKit = useCaseContext((c) => c.lastKit);

  // G-D1/D3: if a case is already open (e.g. officer tapped the active-case card to
  // correct a field), pre-fill identity + kit + next package so nothing is typed twice.
  useEffect(() => {
    const pre = prefillForNextLap(activeCase, lastKit, useLedgerStore.getState().records);
    if (pre && !setup.caseRef) {
      patchSetup({
        caseRef: pre.caseRef,
        panchnamaRef: pre.panchnamaRef,
        packageNo: pre.packageNo,
        ...(pre.reagent ? { reagent: pre.reagent } : {}),
        ...(pre.kitMake ? { kitMake: pre.kitMake } : {}),
        ...(pre.kitTestName ? { kitTestName: pre.kitTestName } : {}),
        ...(pre.kitLotNo ? { kitLotNo: pre.kitLotNo } : {}),
      });
    }
  }, []);

  const suggestedPkg = useMemo(() => {
    const nums = records
      .filter((r) => r.case_ref === setup.caseRef.trim().toUpperCase())
      .map((r) => parseInt(r.package_no.replace(/\D/g, ''), 10))
      .filter((n) => !Number.isNaN(n));
    return `P-${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }, [records, setup.caseRef]);

  const errors = {
    caseRef:
      !setup.caseRef.trim()
        ? 'Required — e.g. NCB/DZU/CR-14/2026'
        : !CASE_REF_RE.test(setup.caseRef.trim())
          ? 'Expected form AGENCY/UNIT/CR-nn/YYYY'
          : null,
    packageNo: !/^P-\d+$/i.test(setup.packageNo.trim()) ? 'Expected package label P-n' : null,
    reagent: !setup.reagent ? 'Select the reagent kit actually used' : null,
  };
  const valid = !errors.caseRef && !errors.packageNo && !errors.reagent;

  const proceed = () => {
    setAttempted(true);
    setTouched((t) => ({ ...t, reagent: true }));
    if (!valid) return;
    const finalCase = setup.caseRef.trim().toUpperCase();
    patchSetup({
      caseRef: finalCase,
      packageNo: (setup.packageNo.trim() || suggestedPkg).toUpperCase(),
    });
    // G-D2: choosing/creating the case is the first field act — make it the active context.
    void useCaseContext.getState().openCase(finalCase, setup.panchnamaRef);
    setStep(1);
    navigation.navigate('Capture');
  };

  const simulateOcr = () => {
    patchSetup({
      kitMake: 'Sirchie',
      kitTestName: 'NARK II',
      kitLotNo: 'MK-24B-118',
      entryMethod: 'ocr',
    });
    setOcrNote(true);
  };

  const showCaseErr = (touched.caseRef || attempted) && errors.caseRef;
  const showPkgErr = (touched.packageNo || attempted) && errors.packageNo;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <WizardHeader
        step={0}
        title="New Field Test"
        contextLine={`${setup.caseRef || 'No case yet'} · ${setup.packageNo || 'P-1'}`}
        citation="Rule 10(2) linkage identifiers · recorded before any capture is permitted"
        backLabel="BACK TO DUTY"
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>


        {/* ============ SEIZURE LINKAGE ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>SEIZURE LINKAGE</Text>
          <Text style={styles.cardHeading}>Case &amp; Package</Text>
          <Text style={styles.cardSubtext}>
            Rule 10(2) package-to-lot bunching operates on these identifiers. Bind them to the
            seizure documentation exactly as written.
          </Text>
          <LightField
            label="Case Crime No / FIR reference"
            value={setup.caseRef}
            onChangeText={(v) => patchSetup({ caseRef: v })}
            placeholder="NCB/DZU/CR-14/2026"
            error={showCaseErr ? errors.caseRef : null}
          />
          <LightField
            label="Panchnama reference"
            value={setup.panchnamaRef}
            onChangeText={(v) => patchSetup({ panchnamaRef: v })}
            placeholder="PAN/DZU/2026/884"
            optional
          />
          <LightField
            label="Package number"
            value={setup.packageNo}
            onChangeText={(v) => patchSetup({ packageNo: v })}
            placeholder="P-1"
            error={showPkgErr ? errors.packageNo : null}
            helper={`Suggested next free for this case: ${suggestedPkg}`}
          />
          {setup.packageNo.trim().toUpperCase() === suggestedPkg && setup.packageNo.trim() !== '' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Icon name="check" size={12} color={T.successText} strokeWidth={3} />
              <Text style={styles.suggestNote}>Using next free package number for this case.</Text>
            </View>
          ) : null}
          <LightField
            label="Lot number"
            value={setup.lotNo ?? ''}
            onChangeText={(v) => patchSetup({ lotNo: v })}
            placeholder="L-1 — or set later from Bunching"
            helper="Leave blank until packages are bunched under Rule 10(2)"
            optional
          />
        </View>

        {/* ============ REAGENT CHEMISTRY ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>REAGENT CHEMISTRY</Text>
          <Text style={styles.cardHeading}>Which kit is in your hand?</Text>
          <Text style={styles.cardSubtext}>
            Every reading is qualified by this choice — the record states consistency with the
            selected reagent's pattern library, never the identity of a substance.
          </Text>
          <View style={styles.reagentGrid}>
            {REAGENT_ORDER.map((r) => {
              const selected = setup.reagent === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.reagentTile, selected && styles.reagentTileSelected]}
                  onPress={() => {
                    patchSetup({ reagent: r });
                    setTouched((t) => ({ ...t, reagent: true }));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Reagent ${REAGENT_LABEL[r]}`}
                >
                  <Icon name="flask" size={15} color={selected ? '#FFFFFF' : T.textSecondary} strokeWidth={2.2} />
                  <Text style={[styles.reagentLabel, selected && styles.reagentLabelSelected]} numberOfLines={1}>
                    {REAGENT_LABEL[r]}
                  </Text>
                  {selected ? (
                    <View style={styles.reagentCheck}>
                      <Icon name="check" size={10} color={T.accent} strokeWidth={3} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {attempted && errors.reagent ? (
            <View style={styles.fieldErrorRow}>
              <Icon name="alert" size={12} color={T.dangerText} strokeWidth={2.5} />
              <Text style={styles.fieldError}>{errors.reagent}</Text>
            </View>
          ) : null}
        </View>

        {/* ============ KIT METADATA ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>KIT METADATA</Text>
          <Text style={styles.cardHeading}>Make · Test · Lot</Text>
          <View style={styles.entryToggle}>
            <TouchableOpacity
              style={[styles.entryBtn, setup.entryMethod === 'manual' && styles.entryBtnActive]}
              onPress={() => {
                patchSetup({ entryMethod: 'manual' });
                setOcrNote(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: setup.entryMethod === 'manual' }}
              accessibilityLabel="Manual kit entry"
            >
              <Text style={[styles.entryBtnText, setup.entryMethod === 'manual' && styles.entryBtnTextActive]}>
                MANUAL ENTRY
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.entryBtn, setup.entryMethod === 'ocr' && styles.entryBtnActive]}
              onPress={simulateOcr}
              accessibilityRole="button"
              accessibilityState={{ selected: setup.entryMethod === 'ocr' }}
              accessibilityLabel="Simulated OCR label scan"
            >
              <Icon name="camera" size={14} color={setup.entryMethod === 'ocr' ? '#FFFFFF' : T.textSecondary} strokeWidth={2.4} />
              <Text style={[styles.entryBtnText, setup.entryMethod === 'ocr' && styles.entryBtnTextActive]} numberOfLines={1}>
                SCAN LABEL (SIM)
              </Text>
            </TouchableOpacity>
          </View>
          {ocrNote ? (
            <View style={styles.ocrNote}>
              <Icon name="info" size={15} color={T.accent} strokeWidth={2.5} />
              <Text style={styles.ocrNoteText}>
                Label read by SIMULATED OCR — confirm or correct each field. The kit lot ties
                every reading in this session to one reagent batch.
              </Text>
            </View>
          ) : null}
          <View style={styles.formGap}>
            <LightField label="Kit make" value={setup.kitMake} onChangeText={(v) => patchSetup({ kitMake: v })} placeholder="e.g. Sirchie" optional />
            <LightField label="Kit test name" value={setup.kitTestName} onChangeText={(v) => patchSetup({ kitTestName: v })} placeholder="e.g. NARK II" optional />
            <LightField label="Kit lot number" value={setup.kitLotNo} onChangeText={(v) => patchSetup({ kitLotNo: v })} placeholder="e.g. MK-24B-118" optional />
          </View>
        </View>

        {/* ============ EXPLAINABLE BLOCK + PRIMARY CTA ============ */}
        {attempted && !valid ? (
          <StateBanner
            tone="danger"
            icon="alert"
            eyebrow="CAPTURE BLOCKED"
            title="Complete the required identifiers"
            citation={[errors.caseRef, errors.packageNo, errors.reagent].filter(Boolean).join(' · ')}
          />
        ) : null}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={proceed}
          accessibilityRole="button"
          accessibilityLabel="Start guided capture"
        >
          <Icon name="camera" size={20} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.primaryBtnText}>{activeCase ? "UPDATE & RESUME CAPTURE" : "OPEN CASE & START TESTING"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.discardBtn}
          onPress={() => {
            reset();
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Discard this draft and return to duty"
        >
          <Text style={styles.discardText}>DISCARD DRAFT &amp; RETURN TO DUTY</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 64 },

  header: {
    backgroundColor: T.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginLeft: -6,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: T.textPrimary, marginLeft: 4 },
  statutoryTag: {
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.border,
  },
  statutoryTagText: { fontSize: 11, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.6 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: T.textPrimary, letterSpacing: -0.2 },
  statutoryCitation: { fontSize: 12, fontWeight: '500', color: T.textSecondary, marginTop: 4, lineHeight: 17 },

  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardHeading: { fontSize: 17, fontWeight: '700', color: T.textPrimary, marginTop: 2 },
  cardSubtext: { fontSize: 13, color: T.textSecondary, lineHeight: 19, marginTop: 4, marginBottom: 12 },

  /* Fields */
  field: { gap: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: T.textMuted, letterSpacing: 0.6 },
  fieldInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    color: T.textPrimary,
    fontFamily: evidenceMono,
  },
  fieldInputError: { borderColor: T.dangerBorder, backgroundColor: T.dangerSurface },
  fieldErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fieldError: { flex: 1, fontSize: 12, fontWeight: '600', color: T.dangerText },
  fieldHelper: { fontSize: 11, color: T.textSecondary, marginTop: 2 },
  suggestNote: { fontSize: 11, fontWeight: '700', color: T.successText, fontFamily: evidenceMono },
  formGap: { gap: 12, marginTop: 12 },

  /* Reagent grid */
  reagentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reagentTile: {
    flex: 1,
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.cardSubtle,
  },
  reagentTileSelected: { backgroundColor: T.accent, borderColor: T.accent },
  reagentLabel: { fontSize: 12.5, fontWeight: '600', color: T.textPrimary, flex: 1 },
  reagentLabelSelected: { color: '#FFFFFF', fontWeight: '700' },
  reagentCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Entry method toggle */
  entryToggle: { flexDirection: 'row', gap: 8, marginTop: 10 },
  entryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.cardSubtle,
  },
  entryBtnActive: { backgroundColor: T.accent, borderColor: T.accent },
  entryBtnText: { fontSize: 12, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.4 },
  entryBtnTextActive: { color: '#FFFFFF' },
  ocrNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: T.accentSurface,
    borderWidth: 1,
    borderColor: T.accent,
    borderRadius: 6,
    padding: 12,
    marginTop: 10,
  },
  ocrNoteText: { flex: 1, fontSize: 12, color: T.accent, fontWeight: '600', lineHeight: 18 },

  /* CTA */
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 60,
    borderRadius: 8,
    backgroundColor: T.accent,
    paddingHorizontal: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  discardBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  discardText: { fontSize: 12, fontWeight: '700', color: T.textMuted, letterSpacing: 0.5 },
});

export default NewTestSetupScreen;
