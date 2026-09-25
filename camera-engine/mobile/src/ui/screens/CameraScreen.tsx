import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { theme } from '../theme';
import { CardOverlayGuide } from '../components/CardOverlayGuide';
import { DetectorPayload } from '../../colorEngine/types';
import {
  getMockPositiveFrame,
  getMockNegativeFrame,
  getMockGlareFrame,
} from '../../demo/mockFrames';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface CameraScreenProps {
  onProcessPayload: (payload: DetectorPayload) => void;
}

export const CameraScreen: React.FC<CameraScreenProps> = ({ onProcessPayload }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [markersCount, setMarkersCount] = useState(4);
  const [statusMessage, setStatusMessage] = useState('4/4 ARUCO MARKERS LOCKED');

  const hasPermission = permission?.granted;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      {/* Main Viewfinder Background */}
      <View style={styles.viewfinder}>
        {hasPermission ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" />
        ) : (
          /* Simulated optical grid backdrop when camera not yet enabled */
          <View style={styles.viewfinderBackdrop}>
            <Text style={styles.viewfinderLabel}>OPTICAL SENSOR SIMULATOR ACTIVE</Text>
            <TouchableOpacity
              style={styles.enableCamButton}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.enableCamText}>TAP TO ENABLE PHONE CAMERA</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dynamic Card Alignment HUD */}
        <CardOverlayGuide
          markersFoundCount={markersCount}
          isAligned={markersCount >= 4}
          statusMessage={statusMessage}
        />
      </View>

      {/* Bottom Controls Bar */}
      <View style={styles.controlsBar}>
        <View style={styles.demoSection}>
          <Text style={styles.demoHeading}>STAGE DEMO PRESET INJECTORS</Text>
          <View style={styles.demoButtonsRow}>
            {/* Positive Injector */}
            <TouchableOpacity
              style={[styles.demoButton, { borderColor: theme.colors.positive }]}
              onPress={() => {
                setStatusMessage('INJECTING POSITIVE SAMPLE...');
                setTimeout(() => onProcessPayload(getMockPositiveFrame()), 250);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.indicatorDot, { backgroundColor: theme.colors.positive }]} />
              <Text style={[styles.demoButtonText, { color: theme.colors.positive }]}>
                Sample + (Positive)
              </Text>
            </TouchableOpacity>

            {/* Negative Injector */}
            <TouchableOpacity
              style={[styles.demoButton, { borderColor: theme.colors.negative }]}
              onPress={() => {
                setStatusMessage('INJECTING NEGATIVE SAMPLE...');
                setTimeout(() => onProcessPayload(getMockNegativeFrame()), 250);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.indicatorDot, { backgroundColor: theme.colors.negative }]} />
              <Text style={[styles.demoButtonText, { color: theme.colors.negative }]}>
                Sample - (Negative)
              </Text>
            </TouchableOpacity>

            {/* Glare / Failure Injector */}
            <TouchableOpacity
              style={[styles.demoButton, { borderColor: theme.colors.inconclusive }]}
              onPress={() => {
                setStatusMessage('INJECTING GLARE SAMPLE...');
                setTimeout(() => onProcessPayload(getMockGlareFrame()), 250);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.indicatorDot, { backgroundColor: theme.colors.inconclusive }]} />
              <Text style={[styles.demoButtonText, { color: theme.colors.inconclusive }]}>
                Glare Error
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Capture Shutter Button */}
        <TouchableOpacity
          style={styles.shutterButton}
          onPress={() => onProcessPayload(getMockPositiveFrame())}
          activeOpacity={0.85}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
        <Text style={styles.shutterTip}>TAP TO ANALYZE REAL-TIME FRAME</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  viewfinder: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#05070D',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  viewfinderBackdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0F1D',
    borderWidth: 1,
    borderColor: '#152037',
    padding: theme.spacing.lg,
  },
  viewfinderLabel: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    position: 'absolute',
    top: 20,
  },
  enableCamButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.full,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  enableCamText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  controlsBar: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    alignItems: 'center',
  },
  demoSection: {
    width: '100%',
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  demoHeading: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  demoButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  demoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    marginHorizontal: 3,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  demoButtonText: {
    fontSize: 10,
    fontWeight: '700',
  },
  shutterButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 4,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  shutterInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primary,
  },
  shutterTip: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 8,
  },
});