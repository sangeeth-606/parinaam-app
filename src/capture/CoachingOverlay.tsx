import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DetailedQualityResult } from './quality-gates';
import { colors, fontWeight } from '../theme';

interface CoachingOverlayProps {
  qualityResult: DetailedQualityResult | null;
  burstProgress?: { current: number; total: number };
}

export const CoachingOverlay: React.FC<CoachingOverlayProps> = ({
  qualityResult,
  burstProgress,
}) => {
  const isPassing = qualityResult?.passed ?? false;
  const message = qualityResult?.primaryCoachingMessage ?? (isPassing ? 'Card locked — capturing burst' : 'Position card in frame');

  return (
    <View style={styles.overlayContainer} pointerEvents="none">
      {/* Top Coaching Banner */}
      <View
        style={[
          styles.coachingBanner,
          isPassing ? styles.bannerPassing : styles.bannerWarning,
        ]}
      >
        <Text style={styles.coachingText}>{message}</Text>
        {burstProgress && burstProgress.total > 0 && (
          <Text style={styles.burstText}>
            Burst: {burstProgress.current}/{burstProgress.total} frames
          </Text>
        )}
      </View>

      {/* 4-Corner Target Reticles */}
      <View style={styles.reticleFrame}>
        <View style={[styles.cornerMarker, styles.cornerTL]} />
        <View style={[styles.cornerMarker, styles.cornerTR]} />
        <View style={[styles.cornerMarker, styles.cornerBL]} />
        <View style={[styles.cornerMarker, styles.cornerBR]} />

        {/* Central Sample Aperture Target */}
        <View style={styles.sampleAperture}>
          <Text style={styles.apertureLabel}>SAMPLE REAGENT POUCH</Text>
        </View>
      </View>

      {/* Bottom Quality Status Chips */}
      <View style={styles.chipsRow}>
        <View style={[styles.chip, qualityResult?.report.isBlurry === false ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>SHARPNESS</Text>
        </View>
        <View style={[styles.chip, qualityResult?.report.exposureOk ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>EXPOSURE</Text>
        </View>
        <View style={[styles.chip, qualityResult?.report.hasGlare === false ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>NO GLARE</Text>
        </View>
        <View style={[styles.chip, qualityResult?.framing.framingOk ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>DISTANCE</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
  },
  coachingBanner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 40,
  },
  bannerWarning: {
    backgroundColor: 'rgba(217, 119, 6, 0.92)', // statutory amber — coaching HUD surface
  },
  bannerPassing: {
    backgroundColor: 'rgba(16, 185, 129, 0.92)', // Emerald-500
  },
  coachingText: {
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
    fontSize: 15,
    textAlign: 'center',
  },
  burstText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: fontWeight.medium,
    marginTop: 4,
  },
  reticleFrame: {
    flex: 1,
    marginVertical: 40,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.hudReticle,
    borderRadius: 8,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerMarker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.brand,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  sampleAperture: {
    width: 140,
    height: 90,
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.7)', // reticle accent — see theme hud tokens
    borderStyle: 'dashed',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.hudScrim,
  },
  apertureLabel: {
    color: colors.brand,
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  chipOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.85)',
  },
  chipAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
  },
  chipText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: fontWeight.semibold,
  },
});
