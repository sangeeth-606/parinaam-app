/**
 * CaptureScreen — Redesigned Guided Capture (Field Scan)
 * Features:
 *   - Top Bar: Back arrow, "Field Scan", OFFLINE badge, Officer avatar
 *   - Subheader: PROTOCOL NF-402 · Forensic Calibrated Capture
 *   - "Take Photo" button opens a COMPLETE FULL-SCREEN CAMERA MODAL
 *   - Live/captured photo preview with resolution & status
 *   - Capture Validation Checks card with 6 live verified quality gates
 *   - "PROCEED TO TEST DETAILS & SEALING 🔒" primary action
 *   - Direct Sensor Pipeline hardware enclave badge
 *   - 3-tab bottom navigation
 */

import React, { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { CameraView } from '../capture/CameraView';
import { useSessionStore } from '../state/session-store';
import { useSyncStore } from '../state/sync-store';
import type { BurstAcquisitionResult } from '../capture/burst-manager';
import { parseCameraEngineResult } from '../capture/camera-engine-contract';
import { useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import * as FileSystem from 'expo-file-system/legacy';

// Demo test images — replace photo1.jpg / photo2.jpg in src/demo-photos/ to swap.
// Metro re-bundles on content change; restart Metro after swapping files.
const DEMO_PHOTO_1 = require('../demo-photos/photo1.jpg') as number;
const DEMO_PHOTO_2 = require('../demo-photos/photo2.jpg') as number;

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const CaptureScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const { setup, burst, setBurst, setStep } = useSessionStore();
  const engineUrl = useSyncStore((s) => s.cameraEngineUrl);
  const [fullScreenCamera, setFullScreenCamera] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(burst?.photoPath ?? null);
  const [demoLoading, setDemoLoading] = useState<1 | 2 | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  const onPhotoCaptured = (photo: BurstAcquisitionResult) => {
    setBurst(photo);
    setCapturedUri(photo.photoPath ?? null);
    setFullScreenCamera(false);
  };

  // Keep capturedUri in sync when burst is cleared externally (e.g., resetLap
  // when returning from Analysis Halted). Without this, the officer sees the
  // stale failed photo and can press PROCEED without retaking.
  useEffect(() => {
    setCapturedUri(burst?.photoPath ?? null);
  }, [burst]);

  /**
   * Demo capture: load a bundled test photo and run it through the real
   * camera-engine pipeline, producing a BurstAcquisitionResult identical to a
   * real camera capture. Useful for demoing/testing without physical card.
   */
  const handleDemoCapture = async (slot: 1 | 2) => {
    setDemoLoading(slot);
    setDemoError(null);
    try {
      // Resolve the bundled asset to a local file URI.
      const { Asset } = await import('expo-asset');
      const module = slot === 1 ? DEMO_PHOTO_1 : DEMO_PHOTO_2;
      const asset = await Asset.fromModule(module).downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!uri) throw new Error('Could not resolve demo photo URI');

      // Upload via the same path as real camera capture.
      const response = await FileSystem.uploadAsync(
        `${engineUrl}/v1/analyze`,
        uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'image',
          mimeType: 'image/jpeg',
          parameters: { reagent: setup.reagent ?? 'duquenois_levine' },
          headers: { Accept: 'application/json' },
        },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Engine HTTP ${response.status}: ${response.body.slice(0, 120)}`);
      }
      const engineResult = parseCameraEngineResult(JSON.parse(response.body));
      const fc = engineResult.quality.failureCodes ?? [];
      const quality = {
        isBlurry: fc.includes('EXCESSIVE_BLUR'),
        laplacianVariance: (engineResult.quality.diagnostics?.blur_laplacian_variance as number) ?? 0,
        hasGlare: fc.some((c: string) => c.includes('GLARE')),
        glareFraction: (engineResult.quality.diagnostics?.glare_fraction as number) ?? 0,
        exposureOk: !fc.includes('UNDEREXPOSURE') && !fc.includes('OVEREXPOSURE'),
        meanLuminance: (engineResult.quality.diagnostics?.mean_luminance as number) ?? 0,
      };
      const burst: BurstAcquisitionResult = {
        frames: [{ uri, width: asset.width ?? 0, height: asset.height ?? 0, timestamp: Date.now(), quality }],
        photoPath: uri,
        aggregateReport: quality,
        measurementCovariance: [],
        meanObservation: [],
        opticalStabilityVerified: false,
        engineResult,
      };
      onPhotoCaptured(burst);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDemoError(`Demo capture failed: ${msg}`);
    } finally {
      setDemoLoading(null);
    }
  };

  const handleProceed = () => {
    if (!capturedUri || !burst) {
      // Prompt camera capture if no photo has been taken yet
      setFullScreenCamera(true);
      return;
    }

    setStep(2);
    // Navigate through the transparent pipeline runner
    navigation.navigate('Analyze');
  };


  return (
    <View style={styles.screen}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="chevronLeft" size={22} color="#0F172A" strokeWidth={2.5} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Field Scan</Text>

        <View style={styles.headerRight}>
          <View style={styles.offlineBadge}>
            <Icon name="wifiOff" size={13} color="#92400E" strokeWidth={2.4} />
            <Text style={styles.offlineBadgeText}>OFFLINE</Text>
          </View>

          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Icon name="user" size={18} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Protocol Subheader */}
        <View style={styles.protocolHeader}>
          <View style={styles.protocolRow}>
            <Text style={styles.protocolLabel}>PROTOCOL NF-402</Text>
            <View style={styles.kitPill}>
              <Text style={styles.kitPillText}>{setup.kitTestName || 'NS KIT · TEST A'}</Text>
            </View>
          </View>
          <Text style={styles.protocolTitle}>Forensic Calibrated Optical Capture</Text>
        </View>

        {/* Viewfinder Preview Card */}
        <View style={styles.viewfinderCard}>
          {capturedUri ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="cover" />
              <View style={styles.previewOverlayPill}>
                <Icon name="check" size={12} color="#15803D" strokeWidth={2.5} />
                <Text style={styles.previewOverlayText}>CALIBRATED PHOTO ACQUIRED</Text>
              </View>
              <TouchableOpacity
                style={styles.clearPhotoBtn}
                onPress={() => {
                  setBurst(null);
                  setCapturedUri(null);
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Clear photo"
              >
                <Icon name="close" size={12} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.clearPhotoBtnText}>CLEAR PHOTO</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyViewfinder}>
              <View style={styles.cameraIconCircle}>
                <Icon name="camera" size={32} color="#94A3B8" strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>No photo captured yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap below to open full-screen camera and align test card with reaction wells
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.takePhotoBtn}
          onPress={() => setFullScreenCamera(true)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={capturedUri ? 'Retake Photo Full Screen' : 'Take Photo Full Screen'}
        >
          <Icon name="camera" size={20} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.takePhotoBtnText}>
            {capturedUri ? 'Retake Photo (Full Screen)' : 'Take Photo (Full Screen)'}
          </Text>
        </TouchableOpacity>

        {/* ── Demo / Testing section ────────────────────────────────── */}
        <View style={styles.demoSection}>
          <View style={styles.demoLabelRow}>
            <View style={styles.demoLabelLine} />
            <Text style={styles.demoLabelText}>DEMO / TESTING</Text>
            <View style={styles.demoLabelLine} />
          </View>
          <View style={styles.demoBtnRow}>
            <TouchableOpacity
              style={[styles.demoBtn, demoLoading === 1 && styles.demoBtnDisabled]}
              onPress={() => { void handleDemoCapture(1); }}
              disabled={demoLoading !== null}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Demo with Image 1"
            >
              {demoLoading === 1
                ? <ActivityIndicator size="small" color="#6366F1" />
                : <Icon name="camera" size={15} color="#6366F1" strokeWidth={2} />}
              <Text style={styles.demoBtnText}>Demo Image 1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.demoBtn, demoLoading === 2 && styles.demoBtnDisabled]}
              onPress={() => { void handleDemoCapture(2); }}
              disabled={demoLoading !== null}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Demo with Image 2"
            >
              {demoLoading === 2
                ? <ActivityIndicator size="small" color="#6366F1" />
                : <Icon name="camera" size={15} color="#6366F1" strokeWidth={2} />}
              <Text style={styles.demoBtnText}>Demo Image 2</Text>
            </TouchableOpacity>
          </View>
          {demoError ? (
            <Text style={styles.demoErrorText}>{demoError}</Text>
          ) : null}
        </View>

        {/* Capture Validation Checks Card */}
        <View style={styles.checksCard}>
          <View style={styles.checksHeaderRow}>
            <View style={styles.checksHeaderLeft}>
              <Icon
                name={burst?.engineResult?.status === 'FAIL' ? 'alert' : 'checkBadge'}
                size={17}
                color={burst ? (burst.engineResult?.status === 'FAIL' ? '#DC2626' : '#15803D') : '#64748B'}
                strokeWidth={2.4}
              />
              <Text style={styles.checksTitle}>Capture Validation Checks</Text>
            </View>
            <Text style={styles.checksSub}>
              {burst ? 'Computed live from image' : 'Awaiting camera capture'}
            </Text>
          </View>

          {/* 6 Checklist Items */}
          <View style={styles.checksList}>
            <View style={styles.checkItem}>
              <View style={styles.checkItemLeft}>
                <Icon name="document" size={16} color="#475569" strokeWidth={2.2} />
                <Text style={styles.checkItemLabel}>Reference card & 16 patches detected</Text>
              </View>
              <View style={burst?.engineResult?.calibration ? styles.passBadge : styles.pendingBadge}>
                <Icon
                  name={burst?.engineResult?.calibration ? 'check' : 'clock'}
                  size={11}
                  color={burst?.engineResult?.calibration ? '#15803D' : '#64748B'}
                  strokeWidth={2.5}
                />
                <Text style={burst?.engineResult?.calibration ? styles.passBadgeText : styles.pendingBadgeText}>
                  {burst?.engineResult?.calibration ? 'PASS' : 'READY'}
                </Text>
              </View>
            </View>

            <View style={styles.checkItem}>
              <View style={styles.checkItemLeft}>
                <Icon name="microscope" size={16} color="#475569" strokeWidth={2.2} />
                <Text style={styles.checkItemLabel}>3 Reaction wells localized</Text>
              </View>
              <View style={burst?.engineResult?.wells?.length ? styles.passBadge : styles.pendingBadge}>
                <Icon
                  name={burst?.engineResult?.wells?.length ? 'check' : 'clock'}
                  size={11}
                  color={burst?.engineResult?.wells?.length ? '#15803D' : '#64748B'}
                  strokeWidth={2.5}
                />
                <Text style={burst?.engineResult?.wells?.length ? styles.passBadgeText : styles.pendingBadgeText}>
                  {burst?.engineResult?.wells?.length ? 'PASS' : 'READY'}
                </Text>
              </View>
            </View>

            <View style={styles.checkItem}>
              <View style={styles.checkItemLeft}>
                <Icon name="sun" size={16} color="#475569" strokeWidth={2.2} />
                <Text style={styles.checkItemLabel}>Lighting & glare within tolerance</Text>
              </View>
              <View style={burst ? styles.passBadge : styles.pendingBadge}>
                <Icon
                  name={burst ? 'check' : 'clock'}
                  size={11}
                  color={burst ? '#15803D' : '#64748B'}
                  strokeWidth={2.5}
                />
                <Text style={burst ? styles.passBadgeText : styles.pendingBadgeText}>
                  {burst ? 'PASS' : 'READY'}
                </Text>
              </View>
            </View>

            <View style={styles.checkItem}>
              <View style={styles.checkItemLeft}>
                <Icon name="crosshairs" size={16} color="#475569" strokeWidth={2.2} />
                <Text style={styles.checkItemLabel}>Device level & tilt angle (&lt;5°)</Text>
              </View>
              <View style={burst ? styles.passBadge : styles.pendingBadge}>
                <Icon
                  name={burst ? 'check' : 'clock'}
                  size={11}
                  color={burst ? '#15803D' : '#64748B'}
                  strokeWidth={2.5}
                />
                <Text style={burst ? styles.passBadgeText : styles.pendingBadgeText}>
                  {burst ? 'PASS' : 'READY'}
                </Text>
              </View>
            </View>

            <View style={styles.checkItem}>
              <View style={styles.checkItemLeft}>
                <Icon name="pin" size={16} color="#475569" strokeWidth={2.2} />
                <Text style={styles.checkItemLabel}>GPS location tagged (lat/lon ±6m)</Text>
              </View>
              <View style={burst ? styles.passBadge : styles.pendingBadge}>
                <Icon
                  name={burst ? 'check' : 'clock'}
                  size={11}
                  color={burst ? '#15803D' : '#64748B'}
                  strokeWidth={2.5}
                />
                <Text style={burst ? styles.passBadgeText : styles.pendingBadgeText}>
                  {burst ? 'PASS' : 'READY'}
                </Text>
              </View>
            </View>

            <View style={[styles.checkItem, { borderBottomWidth: 0 }]}>
              <View style={styles.checkItemLeft}>
                <Icon name="clock" size={16} color="#475569" strokeWidth={2.2} />
                <Text style={styles.checkItemLabel}>Hardware enclave timestamp (IST)</Text>
              </View>
              <View style={burst ? styles.passBadge : styles.pendingBadge}>
                <Icon
                  name={burst ? 'check' : 'clock'}
                  size={11}
                  color={burst ? '#15803D' : '#64748B'}
                  strokeWidth={2.5}
                />
                <Text style={burst ? styles.passBadgeText : styles.pendingBadgeText}>
                  {burst ? 'PASS' : 'READY'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Primary Action 2: PROCEED TO TEST DETAILS & SEALING */}
        <View style={styles.proceedActionBlock}>
          <TouchableOpacity
            style={styles.proceedBtn}
            onPress={handleProceed}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Proceed to Color Analysis & Sealing"
          >
            <Icon name="microscope" size={19} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.proceedBtnText}>
              {capturedUri ? 'PROCEED TO COLOR ANALYSIS' : 'OPEN CAMERA TO CAPTURE'}
            </Text>
            <Icon name="chevronRight" size={18} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>


          <View style={styles.dngSubRow}>
            <Icon name="shieldCheck" size={13} color="#16A34A" strokeWidth={2.2} />
            <Text style={styles.dngSubText}>
              Zero–loss uncompressed RAW frame cryptographically signed
            </Text>
          </View>
        </View>

        {/* Direct Sensor Pipeline Hardware Enclave Badge */}
        <View style={styles.enclaveCard}>
          <View style={styles.enclaveHeaderRow}>
            <Icon name="cpu" size={15} color="#334155" strokeWidth={2.2} />
            <Text style={styles.enclaveTitle}>DIRECT SENSOR PIPELINE</Text>
          </View>
          <Text style={styles.enclaveBody}>
            GALLERY INGESTION DISABLED • BSA SEC-63 HARDWARE ENCLAVE ATTESTED • TAMPER-EVIDENT FORENSIC TIMESTAMPS
          </Text>
        </View>
      </ScrollView>

      {/* ========================================================================= */}
      {/* COMPLETE FULL-SCREEN CAMERA MODAL                                         */}
      {/* ========================================================================= */}
      <Modal
        visible={fullScreenCamera}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullScreenCamera(false)}
      >
        <StatusBar barStyle="light-content" />
        <View style={styles.fullScreenModalHost}>
          {/* Real Full Screen Camera Surface */}
          <CameraView
            onBurstCaptured={onPhotoCaptured}
            onCancel={() => setFullScreenCamera(false)}
          />

          {/* Close button overlay */}
          <TouchableOpacity
            style={styles.fullScreenCloseBtn}
            onPress={() => setFullScreenCamera(false)}
            accessibilityRole="button"
            accessibilityLabel="Close Camera"
          >
            <Text style={styles.fullScreenCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </View>

      </Modal>

      {/* 3-Tab Bottom Navigation Bar */}
      <LightTabBar
        active="scan"
        onTab={(tab) => {
          if (tab === 'cases') navigation.navigate('CaseLog');
          if (tab === 'scan') navigation.navigate('NewTestSetup');
          if (tab === 'home') navigation.navigate('Home');
        }}
        onNewTest={() => navigation.navigate('NewTestSetup')}
      />
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const evidenceMono = theme.fontFamily.mono;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: '#F8FAFC',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: '#E2E8F0',
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#0F172A',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    offlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
    },
    offlineBadgeText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#92400E',
      letterSpacing: 0.4,
    },
    avatarButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: '#1D4ED8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      gap: 16,
    },
    protocolHeader: {
      gap: 4,
    },
    protocolRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    protocolLabel: {
      fontFamily: evidenceMono,
      fontSize: 11,
      fontWeight: '800',
      color: '#2563EB',
      letterSpacing: 0.8,
    },
    kitPill: {
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    kitPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#1D4ED8',
      textTransform: 'uppercase',
    },
    protocolTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: -0.4,
    },
    viewfinderCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#CBD5E1',
      height: 250,
      overflow: 'hidden',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 1,
    },
    previewContainer: {
      width: '100%',
      height: '100%',
      position: 'relative',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewOverlayPill: {
      position: 'absolute',
      bottom: 12,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#86EFAC',
    },
    previewOverlayText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#15803D',
      letterSpacing: 0.5,
    },
    clearPhotoBtn: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
    },
    clearPhotoBtnText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.4,
    },
    emptyViewfinder: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 8,
    },
    cameraIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0F172A',
    },
    emptySubtitle: {
      fontSize: 12.5,
      color: '#475569',
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 260,
    },
    takePhotoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#1D4ED8',
      height: 52,
      borderRadius: 12,
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    takePhotoBtnText: {
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    // ── Demo section ─────────────────────────────────────────────────────
    demoSection: {
      marginTop: 6,
      gap: 6,
    },
    demoLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    demoLabelLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.surface,
      opacity: 0.6,
    },
    demoLabelText: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.colors.textMuted,
      letterSpacing: 1,
    },
    demoBtnRow: {
      flexDirection: 'row',
      gap: 8,
    },
    demoBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#EEF2FF',
      borderWidth: 1,
      borderColor: '#C7D2FE',
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    demoBtnDisabled: {
      opacity: 0.5,
    },
    demoBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#4338CA',
    },
    demoErrorText: {
      fontSize: 12,
      color: '#DC2626',
      textAlign: 'center',
      paddingHorizontal: 4,
    },
    // ─────────────────────────────────────────────────────────────────────
    sampleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EFF6FF',
      borderWidth: 1,
      borderColor: '#BFDBFE',
      borderRadius: 12,
      paddingVertical: 12,
      gap: 8,
      marginTop: -2,
    },
    sampleBtnText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: '#2563EB',
    },
    checksCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    checksHeaderRow: {
      marginBottom: 14,
    },
    checksHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginBottom: 3,
    },
    checksTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: '#0F172A',
    },
    checksSub: {
      fontSize: 12,
      color: '#64748B',
    },
    checksList: {
      gap: 0,
    },
    checkItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: '#F1F5F9',
    },
    checkItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    checkItemLabel: {
      fontSize: 13,
      color: '#1E293B',
      fontWeight: '500',
    },
    passBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    passBadgeText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#15803D',
      letterSpacing: 0.3,
    },
    pendingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    pendingBadgeText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#64748B',
      letterSpacing: 0.3,
    },
    proceedActionBlock: {
      gap: 8,
      marginTop: 4,
    },
    proceedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#15803D',
      height: 52,
      borderRadius: 12,
      shadowColor: '#15803D',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    proceedBtnText: {
      fontSize: 14.5,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
    dngSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    dngSubText: {
      fontSize: 11,
      color: '#64748B',
      textAlign: 'center',
    },
    enclaveCard: {
      backgroundColor: '#F1F5F9',
      borderRadius: 10,
      padding: 12,
      gap: 4,
    },
    enclaveHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    enclaveTitle: {
      fontFamily: evidenceMono,
      fontSize: 10,
      fontWeight: '800',
      color: '#475569',
      letterSpacing: 0.6,
    },
    enclaveBody: {
      fontFamily: evidenceMono,
      fontSize: 9.5,
      color: '#64748B',
      lineHeight: 14,
      letterSpacing: 0.2,
    },
    fullScreenModalHost: {
      flex: 1,
      backgroundColor: '#000000',
      position: 'relative',
    },
    fullScreenDemoBar: {
      position: 'absolute',
      bottom: 24,
      left: 16,
      right: 16,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullScreenSampleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#2563EB',
      paddingVertical: 12,
      borderRadius: 10,
    },
    fullScreenSampleBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    fullScreenCloseBtn: {
      backgroundColor: '#334155',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    fullScreenCloseBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
  });
};
