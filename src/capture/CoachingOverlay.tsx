import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DetailedQualityResult } from './quality-gates';
import { colors, fontWeight } from '../theme';

interface CoachingOverlayProps {
  qualityResult: DetailedQualityResult | null;
  photoProgress?: { current: number; total: number };
}

export const CoachingOverlay: React.FC<CoachingOverlayProps> = ({
  qualityResult,
  photoProgress,
}) => {
  const hasQuality = qualityResult !== null;
  const isPassing = qualityResult?.passed ?? false;
  const message = qualityResult?.primaryCoachingMessage ?? (hasQuality ? (isPassing ? 'Card locked — capture ready' : 'Reposition the card and light') : 'Position the card, then capture one photo');

  return (
    <View style={styles.overlayContainer} pointerEvents="none">
      {/* Top Coaching Banner */}
      <View
        style={[
          styles.coachingBanner,
          hasQuality ? (isPassing ? styles.bannerPassing : styles.bannerWarning) : styles.bannerNeutral,
        ]}
      >
        <Text style={styles.coachingText}>{message}</Text>
        {photoProgress && photoProgress.total > 0 && (
          <Text style={styles.photoText}>
            Photo: {photoProgress.current}/{photoProgress.total}
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
        <View style={[styles.chip, !hasQuality ? styles.chipNeutral : qualityResult?.report.isBlurry === false ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>SHARPNESS</Text>
        </View>
        <View style={[styles.chip, !hasQuality ? styles.chipNeutral : qualityResult?.report.exposureOk ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>EXPOSURE</Text>
        </View>
        <View style={[styles.chip, !hasQuality ? styles.chipNeutral : qualityResult?.report.hasGlare === false ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>NO GLARE</Text>
        </View>
        <View style={[styles.chip, !hasQuality ? styles.chipNeutral : qualityResult?.framing.framingOk ? styles.chipOk : styles.chipAlert]}>
          <Text style={styles.chipText}>DISTANCE</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFill,
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
  bannerNeutral: {
    backgroundColor: 'rgba(71, 85, 105, 0.92)',
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
  photoText: {
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
  chipNeutral: {
    backgroundColor: 'rgba(100, 116, 139, 0.85)',
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
