/**
 * WizardHeader (v2 G-D4) — the single header for every wizard step (Setup · Photo ·
 * Analysis · Result): one back affordance, one context line, one stepper, an optional
 * status tag. Screens pass their index + context string; there is no route gymnastics
 * to know where the officer is. The dark-viewfinder law is unaffected — the camera zone
 * lives BELOW this header. Back says "DRAFT SAVED" when C6 persistence is warm.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Icon } from './Icon';
import { LightStepper } from './evidentiary/EvidenceBits';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import type { Theme } from '../../theme';

export const WIZARD_STEP_NAMES = ['CASE', 'PHOTO', 'ANALYSIS', 'RESULT'] as const;

export const WizardHeader: React.FC<{
  step: number;
  title: string;
  contextLine: string;
  citation?: string;
  statusTag?: { text: string; tone?: 'ok' | 'warn' | 'neutral' };
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  right?: React.ReactNode;
  draftSaved?: boolean;
}> = ({
  step,
  title,
  contextLine,
  citation,
  statusTag,
  onBack,
  backLabel,
  backDisabled,
  right,
  draftSaved,
}) => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const goBack = onBack ?? (() => navigation.goBack());
  const tagTone =
    statusTag?.tone === 'ok'
      ? styles.tagOk
      : statusTag?.tone === 'warn'
        ? styles.tagWarn
        : styles.tagNeutral;
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {backDisabled ? (
          <View style={[styles.back, styles.backDisabled]}>
            <Icon name="clock" size={18} color={T.textSecondary} strokeWidth={2.2} />
            <Text style={styles.backText}>{backLabel ?? 'RUNNING…'}</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={goBack}
            style={styles.back}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={backLabel ?? 'Go back — progress is saved as a draft'}
          >
            <Icon name="chevronLeft" size={18} color={T.textPrimary} strokeWidth={2.6} />
            <Text style={styles.backText}>
              {draftSaved ? 'BACK · DRAFT SAVED' : backLabel ?? 'BACK'}
            </Text>
          </TouchableOpacity>
        )}
        {statusTag ? (
          <View style={[styles.tag, tagTone]}>
            <Text style={[styles.tagText, statusTag.tone === 'ok' && { color: T.successText }]}>
              {statusTag.text}
            </Text>
          </View>
        ) : null}
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.context} numberOfLines={1}>
        {contextLine.toUpperCase()}
      </Text>
      {citation ? <Text style={styles.citation}>{citation}</Text> : null}
      <LightStepper steps={WIZARD_STEP_NAMES} current={step} />
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const { colors, fontFamily } = theme;
  const T = colors;
  return StyleSheet.create({
  wrap: {
    backgroundColor: T.card,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 10,
    gap: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 48,
    paddingVertical: 12,
    marginLeft: -8,
    paddingRight: 8,
  },
  backDisabled: { opacity: 0.6 },
  backText: { fontFamily: fontFamily.mono, fontSize: 11, letterSpacing: 0.6, color: T.textPrimary },
  tag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 'auto',
  },
  tagOk: { borderColor: T.successBorder, backgroundColor: T.successSurface },
  tagWarn: { borderColor: T.marginalBorder, backgroundColor: T.marginalSurface },
  tagNeutral: { borderColor: T.border, backgroundColor: T.cardSubtle },
  tagText: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.5, color: T.textSecondary },
  right: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: fontFamily.mono, fontSize: 17, letterSpacing: 0.3, color: T.textPrimary, fontWeight: '700' },
  context: { fontFamily: fontFamily.mono, fontSize: 12, letterSpacing: 0.4, color: T.textSecondary },
  citation: { fontSize: 11, lineHeight: 16, color: T.textMuted },
  });
};
