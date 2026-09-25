/**
 * Real camera acquisition for the officer app.
 *
 * The only ingest path is the native camera. The captured URI is sent to the
 * Dockerized camera-engine adapter; no gallery picker, random observation, or
 * synthetic frame is used here.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CameraView as NativeCameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
} from 'expo-camera';
import { CoachingOverlay } from './CoachingOverlay';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { colors, type, radius, space, badgeTones } from '../theme';
import { createCameraEngineClient } from './camera-engine-client.ts';
import type { CameraEngineResult } from './camera-engine-contract.ts';
import type { BurstAcquisitionResult } from './burst-manager.ts';
import type { CaptureFrame } from '../types/contracts.ts';
import { useSessionStore } from '../state/session-store';
import { useSyncStore } from '../state/sync-store';

interface CameraViewProps {
  onBurstCaptured: (burst: BurstAcquisitionResult) => void;
  onCancel: () => void;
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function qualityFromEngine(result: CameraEngineResult) {
  const diagnostics = result.quality.diagnostics;
  const blur = numberField(diagnostics.blur_laplacian_variance, 0);
  const meanLuminance = numberField(diagnostics.mean_luminance, 0);
  const glare = numberField(diagnostics.glare_fraction, 0);
  const failed = new Set(result.quality.failureCodes);
  return {
    isBlurry: failed.has('EXCESSIVE_BLUR'),
    laplacianVariance: blur,
    hasGlare: failed.has('ROI_GLARE') || failed.has('GLOBAL_GLARE'),
    glareFraction: glare,
    exposureOk: !failed.has('UNDerexposure'.toUpperCase()) && !failed.has('OVEREXPOSURE'),
    meanLuminance,
  };
}

function frameFromPicture(picture: CameraCapturedPicture, quality: ReturnType<typeof qualityFromEngine>): CaptureFrame {
  return {
    uri: picture.uri,
    width: picture.width,
    height: picture.height,
    timestamp: Date.now(),
    quality,
  };
}

export const CameraView: React.FC<CameraViewProps> = ({ onBurstCaptured, onCancel }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCaptureUri, setLastCaptureUri] = useState<string | null>(null);
  const cameraRef = useRef<NativeCameraView>(null);
  const setup = useSessionStore((state) => state.setup);
  const engineUrl = useSyncStore((state) => state.cameraEngineUrl);
  const client = useMemo(() => createCameraEngineClient({ baseUrl: engineUrl }), [engineUrl]);

  useEffect(() => {
    if (permission === null) void requestPermission();
  }, [permission, requestPermission]);

  const capture = async () => {
    if (!permission?.granted) {
      setError('Camera permission is required. Parinaam never imports an existing image.');
      return;
    }
    if (!cameraReady || !cameraRef.current || capturing) return;
    setCapturing(true);
    setError(null);
    let capturedUri: string | null = null;
    try {
      const capturedPicture = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        exif: true,
        skipProcessing: false,
        shutterSound: false,
      });
      if (!capturedPicture?.uri) throw new Error('Camera returned no image URI.');
      capturedUri = capturedPicture.uri;
      setLastCaptureUri(capturedPicture.uri);
      const result = await client.analyzeImage({
        uri: capturedPicture.uri,
        mimeType: capturedPicture.format === 'png' ? 'image/png' : 'image/jpeg',
        reagent: setup.reagent ?? 'duquenois_levine',
      });
      const quality = qualityFromEngine(result);
      const frame = frameFromPicture(capturedPicture, quality);
      const burst: BurstAcquisitionResult = {
        frames: [frame],
        photoPath: capturedPicture.uri,
        aggregateReport: quality,
        // A still image has no burst covariance and no reaction-time series.
        // Leave covariance empty rather than inserting a synthetic identity.
        measurementCovariance: [],
        // The engine result is the sole source of the measured Lab value.
        meanObservation: [],
        opticalStabilityVerified: false,
        engineResult: result,
      };
      onBurstCaptured(burst);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The camera-engine could not process this capture.';
      setError(
        capturedUri
          ? `Photo retained for retry; processing unavailable: ${message}`
          : `Capture/processing failed: ${message}`,
      );
    } finally {
      setCapturing(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permissionScreen}>
        <Icon name="camera" size={42} color={colors.brand} strokeWidth={2.2} />
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text style={styles.permissionText}>
          Parinaam captures the printed card directly on this device. Gallery and file imports are deliberately disabled.
        </Text>
        <Button label="Request camera access" size="lg" icon="camera" onPress={() => void requestPermission()} />
        <Button label="Cancel capture" variant="ghost" size="md" onPress={onCancel} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.viewfinderSurface}>
        <NativeCameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          flash="off"
          autofocus="on"
          animateShutter
          onCameraReady={() => setCameraReady(true)}
          onMountError={(event) => setError(event.message)}
        />
        <View style={styles.lockBadge}>
          <Icon name="camera" size={12} color={colors.brand} strokeWidth={2.2} />
          <Text style={styles.lockBadgeText}>REAL CAMERA · LOCAL ENGINE PROCESSING</Text>
        </View>
        <CoachingOverlay qualityResult={null} />
        {!cameraReady ? <Text style={styles.readyText}>Starting camera…</Text> : null}
      </View>

      <View style={styles.controls}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {lastCaptureUri ? <Text style={styles.retryText}>The last photo is retained locally; recapture or retry when the engine is available.</Text> : null}
        <Button
          label={capturing ? 'Processing image…' : 'Capture and analyse'}
          size="lg"
          icon="camera"
          loading={capturing}
          disabled={!cameraReady}
          onPress={() => void capture()}
          accessibilityLabel="Capture one camera photo and analyse it with the local camera engine"
        />
        <Button label="Cancel capture" variant="ghost" size="md" onPress={onCancel} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    padding: space.lg,
    gap: space.md,
  },
  viewfinderSurface: {
    flex: 1,
    backgroundColor: colors.colorimeter,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockBadge: {
    position: 'absolute',
    top: space.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.hudGlass,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.full,
    zIndex: 10,
    borderWidth: 1,
    borderColor: badgeTones.brand.border,
  },
  lockBadgeText: {
    ...type.micro,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.brand,
  },
  readyText: {
    position: 'absolute',
    bottom: space.md,
    alignSelf: 'center',
    color: colors.textPrimary,
    ...type.micro,
  },
  controls: { gap: space.sm },
  permissionScreen: {
    flex: 1,
    padding: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    backgroundColor: colors.canvas,
  },
  permissionTitle: { ...type.headline, color: colors.textPrimary, textAlign: 'center' },
  permissionText: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  errorText: { ...type.caption, color: colors.fail, textAlign: 'center' },
  retryText: { ...type.micro, color: colors.textSecondary, textAlign: 'center' },
});
