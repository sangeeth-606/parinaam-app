import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { theme } from './src/ui/theme';
import { CameraScreen } from './src/ui/screens/CameraScreen';
import { ResultsScreen } from './src/ui/screens/ResultsScreen';
import { runColorEngine } from './src/colorEngine/ColorEngine';
import { ACTIVE_CARD_PROFILE, ACTIVE_KIT_PROFILE, ACTIVE_THRESHOLDS } from './src/colorEngine/profiles/activeProfiles';
import { DetectorPayload, ColorAnalysisResult } from './src/colorEngine/types';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'CAMERA' | 'PROCESSING' | 'RESULTS'>('CAMERA');
  const [analysisResult, setAnalysisResult] = useState<ColorAnalysisResult | null>(null);
  const [processingStage, setProcessingStage] = useState('Initializing pipeline...');

  const handleProcessPayload = (payload: DetectorPayload) => {
    setCurrentScreen('PROCESSING');
    setProcessingStage('Executing Finlayson 2015 Root-Polynomial calibration...');

    setTimeout(() => {
      setProcessingStage('Evaluating CIEDE2000 nearest-reference distance...');
      
      try {
        const imageId = 'IMG_' + String(Date.now()).slice(-6);
        const result = runColorEngine({
          payload,
          cardProfile: ACTIVE_CARD_PROFILE,
          kitProfile: ACTIVE_KIT_PROFILE,
          thresholds: ACTIVE_THRESHOLDS,
          imageId,
        });

        setAnalysisResult(result);
        setCurrentScreen('RESULTS');
      } catch (err: any) {
        console.error('Pipeline error:', err);
        setProcessingStage('Pipeline Error: ' + (err?.message || 'Unknown error'));
        setTimeout(() => setCurrentScreen('CAMERA'), 2000);
      }
    }, 450);
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setCurrentScreen('CAMERA');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      {currentScreen === 'CAMERA' && (
        <CameraScreen onProcessPayload={handleProcessPayload} />
      )}

      {currentScreen === 'PROCESSING' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingTitle}>SPECTROMETRIC PIPELINE ACTIVE</Text>
          <Text style={styles.loadingSubtitle}>{processingStage}</Text>
        </View>
      )}

      {currentScreen === 'RESULTS' && analysisResult && (
        <ResultsScreen result={analysisResult} onReset={handleReset} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  loadingTitle: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: theme.spacing.lg,
  },
  loadingSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});
