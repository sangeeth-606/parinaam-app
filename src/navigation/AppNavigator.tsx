/**
 * Parinaam Navigator — native-stack, typed routes, headerless chrome.
 *
 * V2 GATE (phase B): the app opens at the OFFICER LOGIN, not an onboarding carousel.
 *   booting → neutral splash panel · locked → LoginScreen (nothing else mounts)
 *   unlocked, first time on this device → one-time PostLoginBrief · else Duty stack.
 * The wizard group (Setup → Capture → Analyze → Outcome) shares no tab chrome; the tab
 * routes (Home/CaseLog/Integrity) render the shared LightTabBar inside the screens.
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { evidenceTheme as T } from '../theme/evidence';
import { useAuthStore } from '../state/auth-store';
import { useLedgerStore } from '../state/ledger-store';
import { attachDraftPersistence, hydrateDraftFromDb } from '../state/draft-persistence';
import { startSyncLoop, stopSyncLoop, useSyncStore } from '../state/sync-store';
import { useCaseContext } from '../state/case-context';
import { useGuidance } from '../state/guidance';

import { LoginScreen } from '../screens/LoginScreen';
import { PostLoginBriefScreen } from '../screens/PostLoginBriefScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { NewTestSetupScreen } from '../screens/NewTestSetupScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { AnalyzeScreen } from '../screens/AnalyzeScreen';
import { ResultsScreen } from '../screens/ResultsScreen';
import { CaseLogScreen } from '../screens/CaseLogScreen';
import { RecordDetailScreen } from '../screens/RecordDetailScreen';
import { BunchingScreen } from '../screens/BunchingScreen';
import { IntegrityScreen } from '../screens/IntegrityScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type RootStackParamList = {
  Login: undefined;
  PostLoginBrief: undefined;
  Home: undefined;
  CaseLog: undefined;
  Integrity: undefined;
  NewTestSetup: undefined;
  Capture: undefined;
  Analyze: undefined;
  Results: { uuid?: string } | undefined;
  RecordDetail: { uuid: string };
  Bunching: { focusUuid?: string } | undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme: NavTheme = {
  dark: false,
  colors: {
    primary: T.accent,
    background: T.canvas,
    card: T.canvas,
    text: T.textPrimary,
    border: T.border,
    notification: T.accent,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
  },
};

export const AppNavigator: React.FC = () => {
  const status = useAuthStore((s) => s.status);
  const restore = useAuthStore((s) => s.restore);
  const briefSeen = useAuthStore((s) => s.briefSeen);
  const loadBriefSeen = useAuthStore((s) => s.loadBriefSeen);

  // Boot: restore persisted session + one-time-brief preference. The ledger seeds only
  // once the device is unlocked (real canonical JSON + SHA-256 chain, phase C makes it DB-backed).
  useEffect(() => {
    void (async () => {
      await Promise.all([restore(), loadBriefSeen()]);
    })();
  }, [restore, loadBriefSeen]);

  useEffect(() => {
    if (status === 'unlocked') {
      void (async () => {
        await useLedgerStore.getState().seed();
        attachDraftPersistence();
        
        await hydrateDraftFromDb();
        // v2-E: local ledger is warm — init sync glue + opportunistic pass (never blocks UI).
        await useCaseContext.getState().init();
        await useGuidance.getState().init();
        await useSyncStore.getState().init();
        startSyncLoop();
        void useSyncStore.getState().syncNow().then(() => useSyncStore.getState().refreshCases());
      })();
    } else {
      stopSyncLoop();
    }
  }, [status]);

  if (status === 'booting' || briefSeen === null) {
    return (
      <View
        style={{ flex: 1, backgroundColor: T.canvas, alignItems: 'center', justifyContent: 'center' }}
        accessibilityLabel="Starting Parinaam"
      >
        <ActivityIndicator color={T.accent} size="large" />
      </View>
    );
  }

  const gate: 'login' | 'brief' | 'app' =
    status !== 'unlocked' ? 'login' : briefSeen ? 'app' : 'brief';

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: T.canvas },
          animation: 'slide_from_right',
        }}
      >
        {gate === 'login' && <Stack.Screen name="Login" component={LoginScreen} />}
        {gate === 'brief' && <Stack.Screen name="PostLoginBrief" component={PostLoginBriefScreen} />}
        {gate === 'app' && (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="CaseLog" component={CaseLogScreen} />
            <Stack.Screen name="Integrity" component={IntegrityScreen} />
            <Stack.Screen
              name="NewTestSetup"
              component={NewTestSetupScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="Capture" component={CaptureScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="Analyze" component={AnalyzeScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="Results" component={ResultsScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="RecordDetail" component={RecordDetailScreen} />
            <Stack.Screen name="Bunching" component={BunchingScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
