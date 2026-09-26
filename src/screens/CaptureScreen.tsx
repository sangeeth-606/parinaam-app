/**
 * CaptureScreen — Wizard Step 2 host · Guided Camera Capture
 *
 * The real native camera runs inside wizard chrome. A captured photo goes to
 * the self-hosted camera-engine; cancel keeps the draft alive (resumable from Duty).
 *
 * Colorimetry law: the VIEWFINDER STAYS DARK — camera UI must never introduce
 * light glare into the scene, and AE/AWB/gates run inside CameraView unchanged.
 * Only the surrounding chrome migrates to the light evidentiary language
 * (src/theme (useAppTheme + useThemedStyles) + EvidenceBits). No pipeline logic lives here.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { CameraView } from '../capture/CameraView';
import { Icon } from '../components/ui/Icon';
import { WizardHeader } from '../components/ui/WizardHeader';
import { useSessionStore } from '../state/session-store';
import { GUIDANCE_TEXTS, useGuidance } from '../state/guidance';
import type { BurstAcquisitionResult } from '../capture/burst-manager';
import { useAppTheme, useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import { REAGENT_LABEL } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const CaptureScreen: React.FC = () => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { setup, setBurst, setStep, patchSetup } = useSessionStore();
  const guidanceSeen = useGuidance((g) => !!g.seen.capture);
  const dismissGuidance = useGuidance((g) => g.dismiss);
  const [editOpen, setEditOpen] = useState(false);
  const [editPkg, setEditPkg] = useState(setup.packageNo);
  const [editLot, setEditLot] = useState(setup.lotNo ?? '');

  const onPhoto = (photo: BurstAcquisitionResult) => {
    setBurst(photo);
    setStep(2);
    navigation.navigate('Analyze');
  };

  return (
    <View style={styles.screen}>
      <WizardHeader
        step={1}
        title="Guided Capture"
        contextLine={`${setup.caseRef || '—'} · ${setup.packageNo} · ${setup.reagent ? REAGENT_LABEL[setup.reagent] : 'no reagent'}`}
        backLabel="BACK · DRAFT SAVED"
        draftSaved
        right={
          <TouchableOpacity
            style={styles.ctxChip}
            onPress={() => setEditOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: editOpen }}
            accessibilityLabel="Edit test context — package, lot, reagent"
          >
            <Icon name="pin" size={13} color={T.accent} strokeWidth={2.4} />
            <Text style={styles.ctxChipText}>{editOpen ? 'CONTEXT ✕' : 'EDIT CONTEXT'}</Text>
          </TouchableOpacity>
        }
      />

      {editOpen ? (
        <View style={styles.quickEdit} accessibilityViewIsModal={false}>
          <Text style={styles.quickEditTitle}>QUICK EDIT — THIS LAP</Text>
          <View style={styles.quickEditRow}>
            <Text style={styles.quickEditLabel}>PACKAGE (P-n)</Text>
            <TextInput
              style={styles.quickEditInput}
              value={editPkg}
              onChangeText={setEditPkg}
              autoCapitalize="characters"
              placeholder="P-1"
              placeholderTextColor={T.textMuted}
              accessibilityLabel="Package number for this test"
            />
            <Text style={styles.quickEditLabel}>LOT (OPTIONAL)</Text>
            <TextInput
              style={styles.quickEditInput}
              value={editLot}
              onChangeText={setEditLot}
              autoCapitalize="characters"
              placeholder="lot stamp"
              placeholderTextColor={T.textMuted}
              accessibilityLabel="Lot number printed on the package"
            />
          </View>
          <View style={styles.quickEditActions}>
            <TouchableOpacity
              style={styles.quickEditApply}
              onPress={() => {
                const pkg = /^P-\d+$/i.test(editPkg.trim()) ? editPkg.trim().toUpperCase() : setup.packageNo;
                patchSetup({ packageNo: pkg, lotNo: editLot.trim() || undefined });
                setEditOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Apply package and lot changes to this test"
            >
              <Text style={styles.quickEditApplyText}>APPLY</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickEditFull}
              onPress={() => {
                patchSetup({ packageNo: /^P-\d+$/i.test(editPkg.trim()) ? editPkg.trim().toUpperCase() : setup.packageNo, lotNo: editLot.trim() || undefined });
                setEditOpen(false);
                setStep(0);
                navigation.navigate('NewTestSetup');
              }}
              accessibilityRole="button"
              accessibilityLabel="Open the full setup screen"
            >
              <Text style={styles.quickEditFullText}>FULL SETUP…</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!guidanceSeen && (
        <View style={styles.helpRow}>
          <Text style={styles.helpText}>{GUIDANCE_TEXTS.capture}</Text>
          <TouchableOpacity onPress={() => void dismissGuidance('capture')} accessibilityRole="button" accessibilityLabel="Dismiss this hint">
            <Text style={styles.helpDismiss}>GOT IT</Text>
          </TouchableOpacity>
        </View>
      )}


      {/* Dark instrument zone — viewfinder stays dark by colorimetry law */}
      <View style={styles.cameraHost}>
        <CameraView onBurstCaptured={onPhoto} onCancel={() => navigation.goBack()} />
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const T = theme.colors;
  const evidenceMono = theme.fontFamily.mono;
  return StyleSheet.create({
  ctxChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: T.borderStrong, borderRadius: 6, paddingHorizontal: 10, minHeight: 48, justifyContent: 'center' },
  ctxChipText: { fontFamily: evidenceMono, fontSize: 11, letterSpacing: 0.5, color: T.accent },
  quickEdit: { backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  quickEditTitle: { fontFamily: evidenceMono, fontSize: 11, letterSpacing: 0.6, color: T.textSecondary },
  quickEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  quickEditLabel: { fontFamily: evidenceMono, fontSize: 10, letterSpacing: 0.5, color: T.textMuted },
  quickEditInput: { fontFamily: evidenceMono, fontSize: 13, color: T.textPrimary, borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, minWidth: 110, backgroundColor: T.cardSubtle },
  quickEditActions: { flexDirection: 'row', gap: 10 },
  quickEditApply: { backgroundColor: T.accent, borderRadius: 6, paddingHorizontal: 16, minHeight: 48, justifyContent: 'center' },
  quickEditApplyText: { fontFamily: evidenceMono, fontSize: 12, color: T.onAccent, letterSpacing: 0.5 },
  quickEditFull: { borderWidth: 1, borderColor: T.borderStrong, borderRadius: 6, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' },
  quickEditFullText: { fontFamily: evidenceMono, fontSize: 12, color: T.textPrimary, letterSpacing: 0.5 },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.cardSubtle, borderBottomWidth: 1, borderBottomColor: T.border, paddingHorizontal: 16, paddingVertical: 10 },
  helpText: { flex: 1, fontSize: 12, lineHeight: 17, color: T.textSecondary },
  helpDismiss: { fontFamily: evidenceMono, fontSize: 11, color: T.accent, paddingVertical: 6, paddingHorizontal: 4 },
  disclaimerPad: { paddingHorizontal: 16, paddingVertical: 10 },

  screen: { flex: 1, backgroundColor: T.canvas },
  header: {
    backgroundColor: T.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    gap: 4,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginLeft: -6,
    gap: 4,
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
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    marginBottom: 8,
  },
  contextItem: { fontSize: 11, color: T.textSecondary },
  contextLabel: { fontSize: 9, fontWeight: '700', color: T.textMuted, letterSpacing: 0.6 },
  contextMono: { fontSize: 12, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },
  contextSep: { fontSize: 12, color: T.textMuted },
  cameraHost: { flex: 1, backgroundColor: T.cameraBackdrop },
  });
};

export default CaptureScreen;
