/**
 * StatutoryClockModal — Rule 10(2) NDPS Procedural Timers Modal
 * Accessible from the Records tab and Record Detail view.
 *
 * Implements honest statutory distinctions:
 * - 48h Section 57 Report
 * - 72h Section 42(2)/50(6) Copy to Superior
 * - 72h Sample Dispatch Guidance (Administrative Guidance Only)
 * - 15+15 Days Rule 14 Lab Report
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';
import { Icon } from './ui/Icon';
import {
  STATUTORY_DEADLINES,
  calculateRemainingHours,
} from './statutory-timers';

export interface StatutoryClockModalProps {
  visible: boolean;
  onClose: () => void;
  initialCaseRef?: string;
  cases?: Array<{ caseRef: string; timestampIso: string }>;
}

export const StatutoryClockModal: React.FC<StatutoryClockModalProps> = ({
  visible,
  onClose,
  initialCaseRef,
  cases = [],
}) => {
  const [selectedCaseRef, setSelectedCaseRef] = useState<string>(
    initialCaseRef || (cases[0]?.caseRef ?? 'DEFAULT')
  );

  const activeCase = cases.find((c) => c.caseRef === selectedCaseRef) ?? cases[0];
  const seizureTimestamp = activeCase?.timestampIso ?? new Date().toISOString();

  const formatIst = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Sheet Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderTop}>
              <View style={styles.clockIconWrap}>
                <Icon name="clock" size={20} color={T.accent} strokeWidth={2.4} />
              </View>
              <View style={styles.headerTitles}>
                <Text style={styles.sheetTitle}>Rule 10(2) Seizure Clock</Text>
                <Text style={styles.sheetSub}>
                  Procedural deadlines & statutory timeline tracking
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close seizure clock"
              >
                <Icon name="close" size={20} color={T.textPrimary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Case Selector Pills if multiple cases */}
            {cases.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.caseChipsScroll}
                style={styles.caseChipsContainer}
              >
                {cases.map((c) => {
                  const isSel = c.caseRef === selectedCaseRef;
                  return (
                    <TouchableOpacity
                      key={c.caseRef}
                      style={[styles.caseChip, isSel && styles.caseChipActive]}
                      onPress={() => setSelectedCaseRef(c.caseRef)}
                    >
                      <Text style={[styles.caseChipText, isSel && styles.caseChipTextActive]}>
                        {c.caseRef}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Active Anchor Banner */}
            <View style={styles.anchorBox}>
              <View style={styles.anchorRow}>
                <Text style={styles.anchorLabel}>CASE REFERENCE</Text>
                <Text style={styles.anchorCaseRef}>{activeCase?.caseRef ?? 'GENERAL SEIZURE'}</Text>
              </View>
              <View style={styles.anchorRow}>
                <Text style={styles.anchorLabel}>RECORDED IST</Text>
                <Text style={styles.anchorTime}>{formatIst(seizureTimestamp)}</Text>
              </View>
            </View>
          </View>

          {/* Timers List */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {STATUTORY_DEADLINES.map((item) => {
              const { remainingHours, isExpired, elapsedHours } = calculateRemainingHours(
                seizureTimestamp,
                item.deadlineHours
              );
              const isAdmin = item.isAdministrativeGuidance;

              return (
                <View
                  key={item.id}
                  style={[
                    styles.timerCard,
                    isAdmin ? styles.timerCardAdmin : styles.timerCardStatutory,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardCite}>{item.sectionCite}</Text>
                    </View>
                    <View
                      style={[
                        styles.kindBadge,
                        isAdmin ? styles.kindBadgeAdmin : styles.kindBadgeStatutory,
                      ]}
                    >
                      <Text
                        style={[
                          styles.kindBadgeText,
                          isAdmin ? styles.kindBadgeTextAdmin : styles.kindBadgeTextStatutory,
                        ]}
                      >
                        {isAdmin ? 'ADMIN GUIDANCE' : 'STATUTORY MANDATE'}
                      </Text>
                    </View>
                  </View>

                  {item.guidanceNote && (
                    <View style={styles.guidanceBox}>
                      <Icon name="alert" size={13} color={T.marginalText} strokeWidth={2.4} />
                      <Text style={styles.guidanceText}>{item.guidanceNote}</Text>
                    </View>
                  )}

                  {/* Progress & Value */}
                  <View style={styles.countdownRow}>
                    <View style={styles.countdownLeft}>
                      <Text style={styles.countdownSub}>
                        LIMIT: {item.deadlineHours >= 24 ? `${item.deadlineHours / 24} DAYS (${item.deadlineHours}h)` : `${item.deadlineHours} HOURS`}
                      </Text>
                      <Text style={styles.countdownSub}>
                        ELAPSED: {elapsedHours.toFixed(1)}h
                      </Text>
                    </View>
                    <View style={[styles.timerValueBox, isExpired ? styles.valExpired : styles.valActive]}>
                      <Text style={[styles.timerValueText, isExpired ? styles.textExpired : styles.textActive]}>
                        {isExpired ? 'DEADLINE ELAPSED' : `${remainingHours.toFixed(1)} h REMAINING`}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={styles.footerNote}>
              <Icon name="shield" size={15} color={T.textMuted} strokeWidth={2.2} />
              <Text style={styles.footerNoteText}>
                Clocks derive from local sealed evidentiary ledger timestamps. Rule 13(1) mandates physical dispatch without delay.
              </Text>
            </View>
          </ScrollView>

          {/* Bottom Close Action */}
          <View style={styles.sheetFooter}>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss modal"
            >
              <Text style={styles.doneBtnText}>DISMISS TIMERS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: T.borderStrong,
    maxHeight: '88%',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  sheetHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clockIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: T.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: T.textPrimary,
    letterSpacing: -0.2,
  },
  sheetSub: {
    fontSize: 12,
    color: T.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: T.cardSubtle,
  },
  caseChipsContainer: {
    marginTop: 12,
  },
  caseChipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  caseChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.cardSubtle,
  },
  caseChipActive: {
    borderColor: T.accent,
    backgroundColor: T.accentSurface,
  },
  caseChipText: {
    fontFamily: evidenceMono,
    fontSize: 11,
    fontWeight: '600',
    color: T.textSecondary,
  },
  caseChipTextActive: {
    color: T.accent,
    fontWeight: '700',
  },
  anchorBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: T.canvas,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    gap: 6,
  },
  anchorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  anchorLabel: {
    fontFamily: evidenceMono,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: T.textMuted,
  },
  anchorCaseRef: {
    fontFamily: evidenceMono,
    fontSize: 13,
    fontWeight: '700',
    color: T.textPrimary,
  },
  anchorTime: {
    fontFamily: evidenceMono,
    fontSize: 11,
    color: T.textSecondary,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    padding: 18,
    gap: 12,
  },
  timerCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    backgroundColor: T.cardSubtle,
  },
  timerCardStatutory: {
    borderColor: T.borderStrong,
    borderLeftWidth: 4,
    borderLeftColor: T.accent,
  },
  timerCardAdmin: {
    borderColor: T.marginalBorder,
    borderLeftWidth: 4,
    borderLeftColor: T.marginalText,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textPrimary,
    lineHeight: 18,
  },
  cardCite: {
    fontFamily: evidenceMono,
    fontSize: 11,
    color: T.textMuted,
    marginTop: 3,
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  kindBadgeStatutory: {
    backgroundColor: T.accentSurface,
    borderColor: T.borderStrong,
  },
  kindBadgeAdmin: {
    backgroundColor: T.marginalSurface,
    borderColor: T.marginalBorder,
  },
  kindBadgeText: {
    fontFamily: evidenceMono,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  kindBadgeTextStatutory: {
    color: T.accent,
  },
  kindBadgeTextAdmin: {
    color: T.marginalText,
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.marginalSurface,
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: T.marginalBorder,
  },
  guidanceText: {
    fontSize: 11,
    lineHeight: 15,
    color: T.marginalText,
    flex: 1,
  },
  countdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  countdownLeft: {
    gap: 2,
  },
  countdownSub: {
    fontFamily: evidenceMono,
    fontSize: 10,
    color: T.textMuted,
  },
  timerValueBox: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
  },
  valActive: {
    backgroundColor: T.successSurface,
    borderColor: T.successBorder,
  },
  valExpired: {
    backgroundColor: T.dangerSurface,
    borderColor: T.dangerBorder,
  },
  timerValueText: {
    fontFamily: evidenceMono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  textActive: {
    color: T.successText,
  },
  textExpired: {
    color: T.dangerText,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  footerNoteText: {
    fontSize: 11,
    color: T.textMuted,
    lineHeight: 16,
    flex: 1,
  },
  sheetFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: T.border,
    backgroundColor: T.card,
  },
  doneBtn: {
    minHeight: 48,
    backgroundColor: T.accent,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontFamily: evidenceMono,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
