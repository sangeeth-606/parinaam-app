import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { theme } from '../theme';

interface CardOverlayGuideProps {
  markersFoundCount: number;
  isAligned: boolean;
  statusMessage: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.84;
const CARD_HEIGHT = CARD_WIDTH * 0.80; // 100x80mm aspect ratio from card_v1_geometry.yaml

export const CardOverlayGuide: React.FC<CardOverlayGuideProps> = ({
  markersFoundCount,
  isAligned,
  statusMessage,
}) => {
  const isLocked = markersFoundCount >= 4;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Top HUD Bar */}
      <View style={styles.topHud}>
        <Text style={styles.hudTitle}>PARINAAM COLOR ENGINE</Text>
        <Text style={styles.hudSubtitle}>ARUCO CALIBRATION & SPECTROMETRIC CLASSIFIER</Text>
      </View>

      {/* Center Alignment Frame */}
      <View
        style={[
          styles.guideFrame,
          {
            borderColor: isLocked
              ? theme.colors.negative
              : isAligned
              ? theme.colors.primary
              : 'rgba(255, 255, 255, 0.4)',
          },
        ]}
      >
        {/* ArUco Corner Indicators */}
        {/* Top-Left */}
        <View
          style={[
            styles.cornerTarget,
            styles.cornerTL,
            { borderColor: markersFoundCount >= 1 ? theme.colors.negative : theme.colors.primary },
          ]}
        >
          <Text style={styles.cornerLabel}>TL #0</Text>
        </View>

        {/* Top-Right */}
        <View
          style={[
            styles.cornerTarget,
            styles.cornerTR,
            { borderColor: markersFoundCount >= 2 ? theme.colors.negative : theme.colors.primary },
          ]}
        >
          <Text style={styles.cornerLabel}>TR #1</Text>
        </View>

        {/* Bottom-Left */}
        <View
          style={[
            styles.cornerTarget,
            styles.cornerBL,
            { borderColor: markersFoundCount >= 3 ? theme.colors.negative : theme.colors.primary },
          ]}
        >
          <Text style={styles.cornerLabel}>BL #2</Text>
        </View>

        {/* Bottom-Right */}
        <View
          style={[
            styles.cornerTarget,
            styles.cornerBR,
            { borderColor: markersFoundCount >= 4 ? theme.colors.negative : theme.colors.primary },
          ]}
        >
          <Text style={styles.cornerLabel}>BR #3</Text>
        </View>

        {/* 4x4 Grid subtle guideline */}
        <View style={styles.gridPreview}>
          <Text style={styles.gridText}>16-PATCH CALIBRATION GRID</Text>
        </View>

        {/* Test Strip Target Window */}
        <View style={styles.testPatchGuide}>
          <Text style={styles.testPatchText}>TEST STRIP</Text>
        </View>
      </View>

      {/* Bottom Status Feedback Pill */}
      <View
        style={[
          styles.statusPill,
          {
            backgroundColor: isLocked
              ? theme.colors.negativeGlow
              : 'rgba(17, 24, 39, 0.85)',
            borderColor: isLocked ? theme.colors.negative : theme.colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: isLocked
                ? theme.colors.negative
                : markersFoundCount > 0
                ? theme.colors.inconclusive
                : theme.colors.textMuted,
            },
          ]}
        />
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 50,
  },
  topHud: {
    backgroundColor: theme.colors.surfaceGlass,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  hudTitle: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  hudSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  guideFrame: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    position: 'relative',
    backgroundColor: 'rgba(7, 11, 20, 0.25)',
  },
  cornerTarget: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerTL: { top: -2, left: -2, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { top: -2, right: -2, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { bottom: -2, left: -2, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { bottom: -2, right: -2, borderTopWidth: 0, borderLeftWidth: 0 },
  cornerLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 2,
  },
  gridPreview: {
    position: 'absolute',
    left: '12%',
    top: '16%',
    width: '56%',
    height: '68%',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridText: {
    color: 'rgba(56, 189, 248, 0.4)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  testPatchGuide: {
    position: 'absolute',
    right: '8%',
    top: '25%',
    width: '20%',
    height: '50%',
    borderWidth: 1.5,
    borderColor: theme.colors.accentViolet,
    borderStyle: 'dotted',
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
  },
  testPatchText: {
    color: theme.colors.accentViolet,
    fontSize: 7,
    fontWeight: '800',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  statusText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
