/**
 * Parinaam — Procedural Clocks with Honest Statutory Labeling
 * Governed by spec/06-phase-5-case-log-sync.md (Task 5.6 & Milestone M5.8) & spec/legal-constraints.md.
 *
 * Implements:
 * 1. 48-Hour Malkhana / s. 57 Report Timer (Statutory / Administrative)
 * 2. 72-Hour ss. 42(2) & 50(6) Copy to Superior Timer (STATUTORY)
 * 3. 72-Hour Sample Dispatch Guidance:
 *    Clearly labeled as: "⚠ ADMINISTRATIVE GUIDANCE ONLY" (NCB Handbook item 29;
 *    Rule 13(1) of NDPS Rules 2022 mandates dispatch "without any delay").
 * 4. 15 + 15 Days Rule 14 Lab Report Timer (STATUTORY).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type, radius, space, badgeTones } from '../theme';
import {
  STATUTORY_DEADLINES,
  calculateRemainingHours,
  type DeadlineItem,
} from './statutory-timers.ts';

export interface StatutoryClockProps {
  seizureTimestampIso: string;
}

export { STATUTORY_DEADLINES, calculateRemainingHours, type DeadlineItem };

export const StatutoryClock: React.FC<StatutoryClockProps> = ({ seizureTimestampIso }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Procedural Statutory Timers & Legal Deadlines</Text>
      <Text style={styles.subHeader}>
        Strict judicial distinction between statutory mandates and administrative guidelines
      </Text>

      {STATUTORY_DEADLINES.map((item) => {
        const { remainingHours, isExpired } = calculateRemainingHours(
          seizureTimestampIso,
          item.deadlineHours
        );

        return (
          <View
            key={item.id}
            style={[
              styles.timerCard,
              item.isAdministrativeGuidance ? styles.adminCard : styles.statutoryCard,
            ]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <View
                style={[
                  styles.badge,
                  item.isAdministrativeGuidance ? styles.badgeAdmin : styles.badgeStatutory,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    item.isAdministrativeGuidance
                      ? styles.badgeTextAdmin
                      : styles.badgeTextStatutory,
                  ]}
                >
                  {item.isAdministrativeGuidance ? 'ADMINISTRATIVE GUIDANCE' : 'STATUTORY MANDATE'}
                </Text>
              </View>
            </View>

            <Text style={styles.citation}>{item.sectionCite}</Text>

            {item.guidanceNote && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>{item.guidanceNote}</Text>
              </View>
            )}

            <View style={styles.timerRow}>
              <Text style={styles.timerLabel}>
                {item.deadlineHours >= 24 ? `${item.deadlineHours / 24} Days (${item.deadlineHours}h Limit)` : `${item.deadlineHours}h Limit`}
              </Text>
              <Text
                style={[
                  styles.timerValue,
                  isExpired ? styles.timerExpired : styles.timerActive,
                ]}
              >
                {isExpired
                  ? 'DEADLINE ELAPSED'
                  : `${remainingHours.toFixed(1)} hrs remaining`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: space.md },
  header: { ...type.subhead, color: colors.textPrimary },
  subHeader: { ...type.caption, color: colors.textSecondary },
  timerCard: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    padding: space.md,
    borderWidth: 1,
  },
  statutoryCard: { borderColor: badgeTones.brand.border },
  adminCard: { borderColor: badgeTones.warning.border },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  itemTitle: { ...type.captionStrong, color: colors.textPrimary, flex: 1 },
  badge: {
    paddingHorizontal: space.sm - 2,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  badgeStatutory: { backgroundColor: badgeTones.brand.bg, borderColor: badgeTones.brand.border },
  badgeAdmin: { backgroundColor: badgeTones.warning.bg, borderColor: badgeTones.warning.border },
  badgeText: { ...type.micro, fontSize: 9 },
  badgeTextStatutory: { color: badgeTones.brand.fg },
  badgeTextAdmin: { color: badgeTones.warning.fg },
  citation: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  warningBox: {
    backgroundColor: colors.statutoryBackground,
    borderLeftWidth: 3,
    borderLeftColor: colors.statutoryAccent,
    padding: space.sm - 2,
    marginTop: space.sm,
    borderRadius: radius.xs,
  },
  warningText: { ...type.caption, color: colors.statutoryForeground, fontSize: 11, lineHeight: 15 },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    marginTop: space.sm,
  },
  timerLabel: { ...type.caption, color: colors.textSecondary },
  timerValue: { ...type.captionStrong, fontVariant: ['tabular-nums'] },
  timerActive: { color: colors.ok },
  timerExpired: { color: colors.fail },
});
