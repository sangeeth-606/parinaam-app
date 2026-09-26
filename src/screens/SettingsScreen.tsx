/**
 * SettingsScreen — Operator identity, coaching language, local engine connection,
 * and an honest About block naming measured evidence and unvalidated demo data.
 *
 * Rule-10 compliance (AGENTS.md): the device section states only the ACHIEVED seal
 * fact — whether the latest record carries a keystore signature — and never infers a
 * security TIER from attestation presence. (The previous revision fabricated
 * securityLevelCopy['TrustedEnvironment'] from a non-null deviceAttestation; that
 * field holds the ECDSA SIGNATURE hex, not a level.)
 *
 * Store wiring (app-store language/operator/audio/reset, ledger resetDemo) is
 * unchanged; presentation migrated to src/theme (useAppTheme + useThemedStyles) + EvidenceBits.
 */

import React, { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon, type IconName } from '../components/ui/Icon';
import { useAppStore, LANGUAGE_LABELS, type CoachingLanguage } from '../state/app-store';
import { useAuthStore } from '../state/auth-store';
import { useLedgerStore } from '../state/ledger-store';
import { useSyncStore } from '../state/sync-store';
import { evidenceStorageFacts } from '../capture/evidence-image';
import { useAppTheme, useThemedStyles } from '../theme/theme-context';
import type { Theme, ThemePreference } from '../theme';
import { abbreviateHash } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ABOUT_ITEMS: { icon: IconName; label: string; description: string }[] = [
  {
    icon: 'info',
    label: 'What is real in this build',
    description:
      'CIELAB ΔE00 classification, RFC 8785 canonicalization, SHA-256 chain, Rule 10(2) bunching engine, statutory export texts.',
  },
  {
    icon: 'camera',
    label: 'What the camera path does',
    description:
      'The native camera captures one photo. The self-hosted Docker camera-engine performs ArUco geometry, CIELAB correction, and CIEDE2000 analysis; a failed service never becomes a fabricated result.',
  },
  {
    icon: 'info',
    label: 'What remains unvalidated',
    description:
      'The printed cannabinoid profile is PENDING_VALIDATION and scanner-derived. Demo mode is visibly marked unvalidated and is not laboratory confirmation.',
  },
  {
    icon: 'shield',
    label: 'What Parinaam never claims',
    description:
      'It records the test event, never substance identity; presumptive screening only — confirmatory lab analysis (GC-MS / LC-MS / FTIR) is required for definitive results.',
  },
];

export const SettingsScreen: React.FC = () => {
  const { theme, preference, setPreference } = useAppTheme();
  const T = theme.colors;
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { language, setLanguage, audioCoaching, setAudioCoaching } = useAppStore();
  const officer = useAuthStore((s) => s.officer);
  const logout = useAuthStore((s) => s.logout);
  const records = useLedgerStore((s) => s.records);
  const persistence = useLedgerStore((s) => s.persistence);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [evidenceFacts, setEvidenceFacts] = useState<{ files: number; bytes: number } | null | 'pending'>('pending');
  useEffect(() => {
    void evidenceStorageFacts().then((f) => setEvidenceFacts(f));
  }, []);
  const reachability = useSyncStore((x) => x.reachability);
  const pendingCount = useSyncStore((x) => x.pendingCount);
  const deadLetterCount = useSyncStore((x) => x.deadLetterCount);
  const lastSync = useSyncStore((x) => x.lastSync);
  const needsLogin = useSyncStore((x) => x.needsLogin);
  const serverAuth = useSyncStore((x) => x.serverAuth);
  const serverAuthSource = useSyncStore((x) => x.serverAuthSource);
  const serverUrl = useSyncStore((x) => x.serverUrl);
  const cameraEngineUrl = useSyncStore((x) => x.cameraEngineUrl);
  const cameraEngineReachability = useSyncStore((x) => x.cameraEngineReachability);

  /* Server account — the API credential is SEPARATE from the device gate password.
     The gate credential (admin/adminpass) is not an API account and is rejected with
     HTTP 401, which used to be invisible because the health probe is public. */
  const [apiUser, setApiUser] = useState('');
  const [apiPass, setApiPass] = useState('');
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const saveApiAccount = async () => {
    setApiBusy(true);
    setApiNote(null);
    const check = await useSyncStore.getState().saveServerCredentials({ username: apiUser, password: apiPass });
    setApiBusy(false);
    setApiPass('');
    setApiNote(
      check.ok
        ? 'API ACCOUNT ACCEPTED — uploads will authenticate'
        : check.reason === 'rejected'
          ? 'REJECTED — the server answered and refused this username/password'
          : check.reason === 'malformed'
            ? 'Enter both a username and a password'
            : 'NO ANSWER — the server could not be reached (check the URL and network)',
    );
  };
  const [urlDraft, setUrlDraft] = useState(serverUrl);
  const [engineUrlDraft, setEngineUrlDraft] = useState(cameraEngineUrl);
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const urlRef = useRef<ComponentRef<typeof TextInput>>(null);
  const commitUrl = async () => {
    urlRef.current?.blur();
    if (urlDraft.trim()) await useSyncStore.getState().setServerUrl(urlDraft);
    setSyncNote('URL SAVED');
  };
  const commitEngineUrl = async (): Promise<boolean> => {
    try {
      if (!engineUrlDraft.trim()) {
        setEngineNote('ENTER AN ENGINE URL');
        return false;
      }
      await useSyncStore.getState().setCameraEngineUrl(engineUrlDraft);
      setEngineNote('ENGINE URL SAVED');
      return true;
    } catch (error) {
      setEngineNote(error instanceof Error ? `INVALID URL — ${error.message}` : 'INVALID ENGINE URL');
      return false;
    }
  };

  const latest = records[records.length - 1];
  const sealFact =
    records.length === 0
      ? 'Seal a record to observe the keystore path on this device.'
      : latest.deviceAttestation
        ? `Keystore integrity seal ACTIVE on this path — the latest record (SEQ #${latest.seq}) carries a keystore signature (${abbreviateHash(latest.deviceAttestation)}).`
        : 'Keystore seal UNAVAILABLE on this path — records honestly carry a NULL attestation and rely on the SHA-256 chain alone.';

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to duty"
          >
            <Icon name="chevronLeft" size={22} color={T.textPrimary} strokeWidth={2.5} />
            <Text style={styles.backBtnText}>Back to duty</Text>
          </TouchableOpacity>
          <View style={styles.statutoryTag}>
            <Text style={styles.statutoryTagText}>CONFIG</Text>
          </View>
        </View>
        <Text style={styles.screenTitle}>Settings</Text>
        <Text style={styles.headerSub}>Session · appearance · coaching · demo controls</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ============ SESSION (v2 phase B) ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>SIGNED-IN OFFICER</Text>
          <Text style={styles.cardHeading}>{officer?.name ?? '—'}</Text>
          <Text style={styles.cardSubtext}>
            Attributed on every sealed record as {officer?.id ?? '—'} · badge {officer?.badge ?? '—'} ·
            role {officer?.role ?? '—'}. Identity comes from the device login — it is no longer
            an editable text field.
          </Text>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.btnDanger]}
            onPress={() => void logout()}
            accessibilityRole="button"
            accessibilityLabel="Sign out of the officer terminal"
          >
            <Icon name="lock" size={16} color={T.dangerText} strokeWidth={2.5} />
            <Text style={[styles.secondaryBtnText, { color: T.dangerText }]}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>

        {/* ============ APPEARANCE ============ */}
        <View style={styles.card} accessibilityLabel="Appearance settings">
          <Text style={styles.cardEyebrow}>APPEARANCE</Text>
          <Text style={styles.cardHeading}>Choose how Parinaam looks</Text>
          <Text style={styles.cardSubtext}>
            Your choice is saved on this device and applies to every screen.
          </Text>
          <View style={styles.appearanceRow} accessibilityRole="radiogroup">
            {([
              { value: 'light', label: 'Light', icon: 'sun' },
              { value: 'dark', label: 'Dark', icon: 'moon' },
            ] as const satisfies ReadonlyArray<{
              value: ThemePreference;
              label: string;
              icon: 'sun' | 'moon';
            }>).map((option) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.appearanceOption, selected && styles.appearanceOptionActive]}
                  onPress={() => setPreference(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label} appearance`}
                >
                  <Icon name={option.icon} size={18} color={selected ? T.onAccent : T.textSecondary} />
                  <Text style={[styles.appearanceLabel, selected && styles.appearanceLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ============ SYNC · SERVER (v2) ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>SYNC · SERVER</Text>
          <Text style={styles.cardHeading}>Offline-first — the queue drains when a server answers</Text>
          <Text style={styles.syncState}>
            {reachability === 'up' ? 'SERVER REACHABLE' : reachability === 'down' ? 'SERVER UNREACHABLE — records stay queued' : 'SERVER NOT PROBED YET'}
          </Text>
          <TextInput
            ref={urlRef}
            style={styles.urlInput}
            value={urlDraft}
            onChangeText={setUrlDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://10.0.2.2:8571"
            placeholderTextColor={T.textMuted}
            accessibilityLabel="API server URL"
            onSubmitEditing={() => void commitUrl()}
          />
          <View style={styles.syncBtnRow}>
            <TouchableOpacity style={styles.syncBtn} onPress={() => void commitUrl()} accessibilityRole="button">
              <Text style={styles.syncBtnText}>SAVE URL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.syncBtn}
              onPress={() => void (async () => { const ok = await useSyncStore.getState().testConnection(); setSyncNote(ok ? 'HEALTH OK — server answered' : 'NO ANSWER — check URL / network'); })()}
              accessibilityRole="button"
              accessibilityLabel="Test connection to the API server"
            >
              <Text style={styles.syncBtnText}>TEST CONNECTION</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.syncBtn, syncBusy && { opacity: 0.5 }]}
              disabled={syncBusy}
              onPress={() => void (async () => { setSyncBusy(true); const sum = await useSyncStore.getState().syncNow(); await useSyncStore.getState().refreshCases(); setSyncBusy(false); setSyncNote(sum.error ? `FAILED — ${sum.error.toUpperCase()}` : sum.skippedBackoff ? 'RETRY SCHEDULED (backoff)' : `${sum.synced} UPLOADED · ${sum.failed} RETRYING`); })()}
              accessibilityRole="button"
              accessibilityLabel="Synchronize queued records now"
            >
              <Text style={styles.syncBtnText}>{syncBusy ? 'SYNCING…' : 'SYNC NOW'}</Text>
            </TouchableOpacity>
          </View>
          {syncNote ? <Text style={styles.syncNote} accessibilityLiveRegion="polite">{syncNote}</Text> : null}
          <Text style={styles.sealNote}>
            QUEUED {pendingCount} · LAST PASS {lastSync ? `${lastSync.synced} up / ${lastSync.failed} retry @ ${new Date(lastSync.at).toLocaleTimeString('en-IN')}` : 'none this session'}
            {deadLetterCount > 0 ? ` · ${deadLetterCount} REJECTED BY SERVER (retained on device, never uploaded)` : ''}
            {needsLogin ? ' · API ACCOUNT NEEDED' : ''}
            {'\n'}The API account is stored on this device only (expo-secure-store) so background sync can
            hold a server session. It is NOT the phone unlock password — a device-bound token replaces
            this shortcut at the backend hardening pass.
          </Text>

          {/* ---------- API ACCOUNT (separate from the device gate) ---------- */}
          <View style={styles.subCard}>
            <Text style={styles.rowTitle}>API account</Text>
            <Text style={styles.rowSub}>
              {serverAuth === 'rejected'
                ? 'The server refused the stored account — uploads cannot authenticate until it is replaced.'
                : serverAuth === 'accepted'
                  ? `Server session established${serverAuthSource === 'launcher' ? ' (local-stack account)' : ' (officer-entered)'}.`
                  : serverAuth === 'unset'
                    ? 'No API account saved. The phone unlock password is not an API account.'
                    : 'Not verified yet this session.'}
            </Text>
            <View style={styles.apiRow}>
              <TextInput
                style={styles.apiInput}
                value={apiUser}
                onChangeText={setApiUser}
                placeholder="API username"
                placeholderTextColor={T.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="API username"
              />
            </View>
            <View style={styles.apiRow}>
              <TextInput
                style={styles.apiInput}
                value={apiPass}
                onChangeText={setApiPass}
                placeholder="API password"
                placeholderTextColor={T.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="API password"
              />
            </View>
            <View style={styles.syncBtnRow}>
              <TouchableOpacity
                style={[styles.syncBtn, apiBusy && { opacity: 0.5 }]}
                disabled={apiBusy}
                onPress={() => void saveApiAccount()}
                accessibilityRole="button"
                accessibilityLabel="Verify and save the API account"
              >
                <Text style={styles.syncBtnText}>{apiBusy ? 'VERIFYING…' : 'VERIFY & SAVE'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={() => void useSyncStore.getState().clearServerCredentials()}
                accessibilityRole="button"
                accessibilityLabel="Forget the stored API account"
              >
                <Text style={styles.syncBtnText}>FORGET</Text>
              </TouchableOpacity>
            </View>
            {apiNote ? <Text style={styles.syncNote} accessibilityLiveRegion="polite">{apiNote}</Text> : null}
          </View>
        </View>

        {/* ============ CAMERA ENGINE · LOCAL SERVICE ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>CAMERA ENGINE · SELF-HOSTED</Text>
          <Text style={styles.cardHeading}>Image processing runs in the local Docker service</Text>
          <Text style={styles.syncState}>
            {cameraEngineReachability === 'up'
              ? 'ENGINE READY'
              : cameraEngineReachability === 'down'
                ? 'ENGINE UNREACHABLE — CAPTURE WILL RETAIN THE PHOTO AND ASK FOR RETRY'
                : 'ENGINE NOT PROBED YET'}
          </Text>
          <TextInput
            style={styles.urlInput}
            value={engineUrlDraft}
            onChangeText={setEngineUrlDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://10.0.2.2:8572"
            placeholderTextColor={T.textMuted}
            accessibilityLabel="Camera engine local service URL"
            onSubmitEditing={() => void commitEngineUrl()}
          />
          <View style={styles.syncBtnRow}>
            <TouchableOpacity style={styles.syncBtn} onPress={() => void commitEngineUrl()} accessibilityRole="button">
              <Text style={styles.syncBtnText}>SAVE ENGINE URL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.syncBtn}
              onPress={() => void (async () => {
                if (!(await commitEngineUrl())) return;
                const ok = await useSyncStore.getState().testCameraEngine();
                setEngineNote(ok ? 'ENGINE READY — LOCAL ANALYSIS AVAILABLE' : 'NO ANSWER — CHECK DOCKER / LAN URL');
              })()}
              accessibilityRole="button"
              accessibilityLabel="Test the local camera engine connection"
            >
              <Text style={styles.syncBtnText}>TEST ENGINE</Text>
            </TouchableOpacity>
          </View>
          {engineNote ? <Text style={styles.syncNote} accessibilityLiveRegion="polite">{engineNote}</Text> : null}
          <Text style={styles.sealNote}>
            Android emulator: use 10.0.2.2. A physical phone needs the host LAN address, or an
            explicit USB/ADB reverse setup. This URL is independent of the Parinaam API URL.
          </Text>
        </View>

        {/* ============ STORAGE · THIS DEVICE — ACHIEVED STATE ONLY ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>STORAGE · THIS DEVICE</Text>
          <Text style={styles.cardHeading}>Achieved seal state — never an assumed tier</Text>
          <View style={styles.sealRow}>
            <View style={styles.rowIcon}>
              <Icon name="key" size={16} color={T.textSecondary} strokeWidth={2.2} />
            </View>
            <Text style={styles.sealText}>{sealFact}</Text>
          </View>
          <Text style={styles.sealNote}>
            {persistence == null
              ? 'LOCAL LEDGER: LOADS AFTER UNLOCK'
              : persistence.kind === 'none'
                ? 'LOCAL LEDGER: IN-MEMORY — RECORDS DO NOT SURVIVE RESTART'
                : `LOCAL LEDGER: ${persistence.kind.toUpperCase()} · ${persistence.pathLabel}`}{persistence && persistence.encryption !== 'none' ? ' · ENCRYPTED' : persistence ? ' · PLAINTEXT (probe honest)' : ''}
          </Text>
          <Text style={styles.sealNote}>
            Hardware keys produce a device integrity seal. That is NOT equated with an IT Act
            2000 ss. 3/3A signing arrangement anywhere in this app.
          </Text>
          <Text style={styles.sealNote}>
            {evidenceFacts === 'pending'
              ? 'EVIDENCE IMAGES: CHECKING…'
              : evidenceFacts
                ? `EVIDENCE IMAGES: ${evidenceFacts.files} · ~${Math.max(1, Math.round(evidenceFacts.bytes / 1024 / 1024)) || (evidenceFacts.bytes ? '<1' : '0')} MB — append-only; no in-app deletion by design`
                : 'EVIDENCE IMAGES: none readable in this runtime'}
          </Text>
        </View>

        {/* ============ DEMONSTRATION — DEMO PLUMBING, OFF THE OPERATIONAL PATH ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>DEMONSTRATION</Text>
          <Text style={styles.cardHeading}>Demonstration controls</Text>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate('Integrity')}
            accessibilityRole="button"
            accessibilityLabel="Open the integrity cockpit with the tamper demonstration"
          >
            <View style={styles.rowIcon}>
              <Icon name="shield" size={16} color={T.textSecondary} strokeWidth={2.2} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Tamper demonstration</Text>
              <Text style={styles.rowSub}>Open the integrity cockpit — chain health + tamper demo</Text>
            </View>
            <Icon name="chevronRight" size={16} color={T.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => void useLedgerStore.getState().resetDemo()}
            accessibilityRole="button"
            accessibilityLabel="Re-seed the ledger — resets the in-session chain and records"
          >
            <View style={styles.rowIcon}>
              <Icon name="package" size={16} color={T.textSecondary} strokeWidth={2.2} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Re-seed ledger</Text>
              <Text style={styles.rowSub}>Resets the in-session chain and records</Text>
            </View>
            <Icon name="chevronRight" size={18} color={T.textMuted} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.aboutBtn}
          onPress={() => setAboutOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="About Parinaam"
        >
          <Icon name="info" size={16} color={T.accent} strokeWidth={2.4} />
          <Text style={styles.aboutBtnText}>ABOUT PARINAAM — WHAT IS REAL, WHAT IS SIMULATED</Text>
        </TouchableOpacity>

      </ScrollView>

        {/* ============ DEVICE — LANGUAGE & COACHING ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>DEVICE · COACHING</Text>
          <Text style={styles.cardHeading}>Guided-capture prompts</Text>
          <Text style={styles.cardSubtext}>
            Voice coaching language for the on-screen prompts (Phase 6).
          </Text>
          <View style={styles.segmentRow}>
            {(Object.keys(LANGUAGE_LABELS) as CoachingLanguage[]).map((k) => {
              const selected = language === k;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.segmentTile, selected && styles.segmentTileActive]}
                  onPress={() => setLanguage(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Coaching language ${LANGUAGE_LABELS[k]}`}
                >
                  <Text style={[styles.segmentCode, selected && styles.segmentCodeActive]}>
                    {k.toUpperCase()}
                  </Text>
                  <Text style={[styles.segmentName, selected && styles.segmentNameActive]}>
                    {LANGUAGE_LABELS[k]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <View style={styles.rowIcon}>
                <Icon name="waveform" size={16} color={T.textSecondary} strokeWidth={2.2} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Audio coaching</Text>
                <Text style={styles.rowSub}>Spoken prompts during guided capture</Text>
              </View>
            </View>
            <Switch
              value={audioCoaching}
              onValueChange={setAudioCoaching}
              trackColor={{ false: T.border, true: T.accent }}
              thumbColor={audioCoaching ? T.accent : T.textMuted}
              accessibilityLabel="Toggle audio coaching"
            />
          </View>
        </View>


      {/* ============ ABOUT SHEET (light bottom sheet) ============ */}
      <Modal visible={aboutOpen} transparent animationType="slide" onRequestClose={() => setAboutOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setAboutOpen(false)}>
          <Pressable style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetGrip} />
            <Text style={styles.sheetTitle}>About this build</Text>
            <Text style={styles.sheetSub}>Student hackathon prototype — SIH 2026, PS 26231</Text>
            {ABOUT_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.sheetAction}
                onPress={() => setAboutOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.rowIcon}>
                  <Icon name={item.icon} size={16} color={T.accent} strokeWidth={2.4} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.sheetActionLabel}>{item.label}</Text>
                  <Text style={styles.sheetActionDesc}>{item.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.sheetFootnote}>
              Cites Rule 10(2) of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022
              (G.S.R. 899(E)). Hardware-backed keys produce a device integrity seal; the app
              never equates that seal with an IT Act 2000 ss. 3/3A signing arrangement.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const T = theme.colors;
  const evidenceMono = theme.fontFamily.mono;
  return StyleSheet.create({
  syncState: { fontFamily: evidenceMono, fontSize: 11, letterSpacing: 0.6, color: T.textSecondary, marginTop: 6 },
  urlInput: {
    fontFamily: evidenceMono,
    fontSize: 13,
    color: T.textPrimary,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 10,
  },
  syncBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  subCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
    gap: 6,
  },
  apiRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  apiInput: {
    flex: 1,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: evidenceMono,
    fontSize: 12,
    color: T.textPrimary,
  },
  syncBtn: { borderWidth: 1, borderColor: T.borderStrong, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  syncBtnText: { fontFamily: evidenceMono, fontSize: 11, letterSpacing: 0.6, color: T.textPrimary },
  syncNote: { fontFamily: evidenceMono, fontSize: 11, color: T.accent, marginTop: 8 },

  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 64 },
  flex: { flex: 1 },

  header: {
    backgroundColor: T.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginLeft: -6,
    gap: 4,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: T.textPrimary, marginLeft: 4 },
  statutoryTag: {
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.border,
  },
  statutoryTagText: { fontSize: 11, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.6 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: T.textPrimary, letterSpacing: -0.2 },
  headerSub: { fontSize: 12, fontWeight: '500', color: T.textSecondary, marginTop: 4 },

  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 6,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardHeading: { fontSize: 17, fontWeight: '700', color: T.textPrimary },
  cardSubtext: { fontSize: 13, color: T.textSecondary, lineHeight: 19, marginBottom: 6 },

  appearanceRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  appearanceOption: {
    flex: 1,
    minHeight: 64,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  appearanceOptionActive: { backgroundColor: T.accent, borderColor: T.accent },
  appearanceLabel: { fontSize: 12, fontWeight: '700', color: T.textSecondary },
  appearanceLabelActive: { color: T.onAccent },

  fieldLabel: { fontSize: 10, fontWeight: '700', color: T.textMuted, letterSpacing: 0.6 },
  fieldInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    color: T.textPrimary,
    fontFamily: evidenceMono,
  },
  fieldInputError: { borderColor: T.dangerBorder, backgroundColor: T.dangerSurface },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  errorText: { fontSize: 12, fontWeight: '600', color: T.dangerText },

  btnDanger: {
    borderColor: T.dangerBorder,
    backgroundColor: T.dangerSurface,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: T.card,
    marginTop: 10,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: T.accent, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.5 },

  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  segmentTile: {
    flex: 1,
    minHeight: 56,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  segmentTileActive: { backgroundColor: T.accent, borderColor: T.accent },
  segmentCode: { fontSize: 14, fontWeight: '700', color: T.textPrimary, letterSpacing: 0.5 },
  segmentCodeActive: { color: T.onAccent },
  segmentName: { fontSize: 9, fontWeight: '600', color: T.textSecondary, textAlign: 'center' },
  segmentNameActive: { color: T.onAccent },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  switchTextWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '600', color: T.textPrimary },
  rowSub: { fontSize: 12, color: T.textSecondary, marginTop: 1 },

  sealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    padding: 12,
  },
  sealText: { flex: 1, fontSize: 12.5, color: T.textPrimary, lineHeight: 19 },
  sealNote: { fontSize: 11, color: T.textSecondary, lineHeight: 17, fontStyle: 'italic' },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  navRowLast: { borderBottomWidth: 0 },

  aboutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.card,
  },
  aboutBtnText: { fontSize: 12, fontWeight: '700', color: T.accent, letterSpacing: 0.4 },

  scrim: { flex: 1, backgroundColor: T.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: T.border,
    padding: 20,
    paddingBottom: 40,
    gap: 10,
  },
  sheetGrip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginBottom: 6,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: T.textPrimary },
  sheetSub: { fontSize: 12, color: T.textSecondary, marginBottom: 6 },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
    minHeight: 56,
  },
  sheetActionLabel: { fontSize: 14, fontWeight: '700', color: T.textPrimary },
  sheetActionDesc: { fontSize: 12, color: T.textSecondary, lineHeight: 18, marginTop: 2 },
  sheetFootnote: {
    fontSize: 11,
    color: T.textSecondary,
    lineHeight: 17,
    fontFamily: evidenceMono,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    padding: 12,
    marginTop: 6,
  },
  });
};

export default SettingsScreen;
