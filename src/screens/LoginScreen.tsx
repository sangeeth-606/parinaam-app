/**
 * LoginScreen — V2 launch gate (v2 §3, phase B; user directive: admin/adminpass)
 *
 * This is what the app opens to — replacing the old skippable 3-page onboarding.
 * Honest framing: a LOCAL DEVICE CREDENTIAL GATE. It is not statutory identity,
 * not a digital signature, and the copy never implies it is (AGENTS rules 6/10
 * culture). OTP / biometric re-entry / device binding land on this same seam in
 * the deferred OTP pass.
 */

import React, { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from '../components/ui/Icon';
import { StateBanner } from '../components/ui/evidentiary/EvidenceBits';
import { useAuthStore } from '../state/auth-store';
import { useAppTheme, useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';

export const LoginScreen: React.FC = () => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const styles = useThemedStyles(createStyles);
  const attempt = useAuthStore((s) => s.attempt);
  const failures = useAuthStore((s) => s.failures);
  const lockedUntil = useAuthStore((s) => s.lockedUntil);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remainSec, setRemainSec] = useState(0);
  const passRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!lockedUntil) {
      setRemainSec(0);
      return;
    }
    const tick = () => setRemainSec(Math.max(0, Math.ceil(((lockedUntil ?? 0) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const locked = remainSec > 0;

  const signIn = async () => {
    Keyboard.dismiss();
    if (locked || busy) return;
    if (!username.trim() || !password) {
      setError('Enter both username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await attempt(username, password);
    setBusy(false);
    if (res === 'bad-credentials') {
      setPassword('');
      setError('Incorrect username or password.');
    } else if (res === 'locked') {
      setPassword('');
    }
    // 'ok' → the navigator gate swaps to the duty stack; nothing to do here.
  };

  return (
    <KeyboardAvoidingView
      style={styles.host}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={24}
    >
      <View style={styles.inner}>
        <View style={styles.brandBlock}>
          <View style={styles.brandMark}>
            <Icon name="shield" size={26} color={T.accent} strokeWidth={2.2} />
          </View>
          <Text style={styles.brandName}>PARINAAM</Text>
          <Text style={styles.brandSub}>CALIBRATED FIELD COLORIMETRY · OFFICER TERMINAL</Text>
        </View>

        {locked ? (
          <StateBanner
            tone="warning"
            icon="lock"
            eyebrow="SIGN-IN PAUSED"
            title={`Too many attempts — retry in ${remainSec}s`}
            citation="Device gate locks for 60 seconds after 5 failures."
          />
        ) : (
          error && (
            <StateBanner tone="danger" icon="alert" eyebrow="ACCESS REFUSED" title={error} />
          )
        )}

        <View style={styles.card}>
          <Text style={styles.heading}>AUTHORISED OFFICER USE ONLY</Text>
          <Text style={styles.subheading}>
            Sign in with your terminal credential. Every record you seal is attributed to the
            officer signed in at that moment.
          </Text>

          <Text style={styles.fieldLabel}>USERNAME · REQUIRED</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="officer username"
            placeholderTextColor={T.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="next"
            editable={!locked}
            onSubmitEditing={() => passRef.current?.focus()}
            style={[styles.fieldInput, error ? styles.fieldInputError : null]}
            accessibilityLabel="Username"
          />

          <Text style={[styles.fieldLabel, styles.fieldGap]}>PASSWORD · REQUIRED</Text>
          <TextInput
            ref={passRef}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={T.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="go"
            editable={!locked}
            onSubmitEditing={() => void signIn()}
            style={[styles.fieldInput, error ? styles.fieldInputError : null]}
            accessibilityLabel="Password"
          />

          {failures > 0 && !locked && (
            <Text style={styles.attemptNote}>
              {failures} failed attempt{failures > 1 ? 's' : ''} this session — 5 locks the gate
              for 60 s.
            </Text>
          )}

          <TouchableOpacity
            onPress={() => void signIn()}
            disabled={locked || busy}
            activeOpacity={0.85}
            style={[styles.cta, (locked || busy) && styles.ctaDisabled]}
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Signing in' : 'Sign in'}
          >
            <Text style={styles.ctaText}>{busy ? 'VERIFYING…' : 'SIGN IN'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLine}>
            DEMO BUILD CREDENTIAL — USER “admin” · PASSWORD “adminpass”
          </Text>
          <Text style={styles.footerFine}>
            Presumptive result only — not a substitute for laboratory confirmatory testing.
          </Text>
          <Text style={styles.footerFine}>
            Local device gate — OTP / biometric / device binding arrive with the backend pass.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme: Theme) => {
  const T = theme.colors;
  const evidenceMono = theme.fontFamily.mono;
  const evidenceTarget = theme.target.controlMd;
  return StyleSheet.create({
  host: { flex: 1, backgroundColor: T.canvas },
  inner: { flex: 1, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
  brandBlock: { alignItems: 'center', marginBottom: 28 },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: T.accentSurface,
    borderWidth: 1.5,
    borderColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandName: {
    fontFamily: evidenceMono,
    fontSize: 22,
    letterSpacing: 6,
    fontWeight: '800',
    color: T.textPrimary,
  },
  brandSub: {
    fontFamily: evidenceMono,
    fontSize: 10,
    letterSpacing: 1.6,
    color: T.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    padding: 20,
  },
  heading: {
    fontFamily: evidenceMono,
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '800',
    color: T.accent,
    marginBottom: 6,
  },
  subheading: { fontSize: 13, lineHeight: 19, color: T.textSecondary, marginBottom: 18 },
  fieldLabel: {
    fontFamily: evidenceMono,
    fontSize: 10.5,
    letterSpacing: 1.2,
    fontWeight: '700',
    color: T.textMuted,
    marginBottom: 6,
  },
  fieldGap: { marginTop: 14 },
  fieldInput: {
    minHeight: evidenceTarget,
    borderWidth: 1.5,
    borderColor: T.borderStrong,
    borderRadius: 8,
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 14,
    fontSize: 16,
    color: T.textPrimary,
    fontFamily: evidenceMono,
  },
  fieldInputError: { borderColor: T.dangerBorder },
  attemptNote: { marginTop: 10, fontSize: 12, color: T.marginalText },
  cta: {
    marginTop: 20,
    minHeight: 60,
    borderRadius: 10,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: T.borderStrong },
  ctaText: {
    fontFamily: evidenceMono,
    fontSize: 15,
    letterSpacing: 2,
    fontWeight: '800',
    color: T.onAccent,
  },
  footer: { marginTop: 'auto', alignItems: 'center', gap: 6 },
  footerLine: {
    fontFamily: evidenceMono,
    fontSize: 10.5,
    letterSpacing: 1,
    color: T.textMuted,
    textAlign: 'center',
  },
  footerFine: { fontSize: 11, color: T.textMuted, textAlign: 'center', lineHeight: 16 },
  });
};

export default LoginScreen;
