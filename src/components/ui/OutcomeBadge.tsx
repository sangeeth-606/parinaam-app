/**
 * OutcomeBadge + OutcomeHero — the two-register outcome presentation
 * (docs/redesign/02-ux-architecture.md §5): officer reading primary (sentence case,
 * neutral record colors), statutory constant secondary (mono). Color never carries
 * meaning alone: label + glyph + tinted record tone are redundant signals.
 */

import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { Badge } from './Badge';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import type { Theme, BadgeTone } from '../../theme';
import {
  ABSTENTION_COPY,
  OFFICER_READING,
  OFFICER_READING_SHORT,
  outcomeTone,
  REAGENT_LABEL,
} from '../../domain/outcome-copy';
import type { PresumptiveOutcomeKind, ReagentType, AbstentionReason } from '../../types/domain';

const toneBadge: Record<ReturnType<typeof outcomeTone>, BadgeTone> = {
  reaction: 'brand',
  noReaction: 'neutral',
  attention: 'warning',
};

const outcomeGlyph: Record<PresumptiveOutcomeKind, 'waveform' | 'minus' | 'alert'> = {
  CONSISTENT_WITH_REAGENT_POSITIVE: 'waveform',
  CONSISTENT_WITH_REAGENT_NEGATIVE: 'minus',
  INCONCLUSIVE: 'alert',
};

interface OutcomeBadgeProps {
  kind: PresumptiveOutcomeKind;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Compact list-form badge: short reading + tone + glyph. */
export const OutcomeBadge: React.FC<OutcomeBadgeProps> = ({ kind, full = false, style }) => (
  <Badge
    label={(full ? OFFICER_READING : OFFICER_READING_SHORT)[kind]}
    tone={toneBadge[outcomeTone(kind)]}
    icon={kind === 'INCONCLUSIVE' ? 'alert' : kind === 'CONSISTENT_WITH_REAGENT_POSITIVE' ? 'waveform' : 'minus'}
    style={style}
  />
);

interface OutcomeHeroProps {
  kind: PresumptiveOutcomeKind;
  reagent: ReagentType;
  confidence?: number;
  deltaE?: number;
  abstentionReason?: AbstentionReason | null;
  detail?: string;
  conformalSet?: string[];
}

/** Hero card: human reading, then the statutory constant in mono, then reason metadata. */
export const OutcomeHero: React.FC<OutcomeHeroProps> = ({
  kind,
  reagent,
  confidence,
  deltaE,
  abstentionReason,
  detail,
  conformalSet,
}) => {
  const { theme } = useAppTheme();
  const { colors, badgeTones } = theme;
  const styles = useThemedStyles(createStyles);
  const tone = outcomeTone(kind);
  const borderColor =
    tone === 'reaction'
      ? badgeTones.brand.border
      : tone === 'attention'
        ? badgeTones.warning.border
        : colors.borderStrong;
  const iconColor = tone === 'reaction' ? colors.reaction : tone === 'attention' ? colors.attention : colors.noReaction;

  return (
    <View style={[styles.hero, { borderColor }]}>
      <View style={styles.heroTop}>
        <View style={[styles.glyphWell, { borderColor }]}>
          <Icon name={outcomeGlyph[kind]} size={22} color={iconColor} />
        </View>
        <View style={styles.heroHead}>
          <Text style={styles.heroEyebrow}>
            {REAGENT_LABEL[reagent]} · presumptive test event
          </Text>
          <Text style={styles.heroReading}>{OFFICER_READING[kind]}</Text>
        </View>
      </View>

      <Text style={[styles.heroConstant, { color: iconColor }]} selectable>
        {kind}
      </Text>

      {kind === 'INCONCLUSIVE' && abstentionReason ? (
        <Text style={styles.heroReason}>
          {ABSTENTION_COPY[abstentionReason]}
          {detail ? ` — ${detail}` : ''}
        </Text>
      ) : null}

      <View style={styles.heroMeta}>
        {confidence !== undefined && kind !== 'INCONCLUSIVE' ? (
          <Text style={styles.heroMetric}>{(confidence * 100).toFixed(0)}% confidence</Text>
        ) : null}
        {deltaE !== undefined ? <Text style={styles.heroMetric}>ΔE00 {deltaE.toFixed(2)}</Text> : null}
        {conformalSet && conformalSet.length > 0 ? (
          <Text style={styles.heroSet}>conformal set: {conformalSet.join(' · ')}</Text>
        ) : null}
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const { colors, type, radius, space } = theme;
  return StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  glyphWell: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHead: { flex: 1, gap: 2 },
  heroEyebrow: { ...type.micro, fontSize: 10, color: colors.textTertiary },
  heroReading: { ...type.headline, color: colors.textPrimary },
  heroConstant: {
    ...type.mono,
    fontSize: 12,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
  heroReason: { ...type.body, color: colors.textSecondary },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  heroMetric: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  heroSet: { ...type.monoSm, color: colors.textTertiary },
  });
};
