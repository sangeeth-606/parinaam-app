/**
 * LoginScreen — Dual-Auth Officer Authentication Gate
 * Supports:
 *   1. Returning Officer on Enrolled Device:
 *      - Login via Biometrics (Fingerprint / Face ID)
 *      - Login via MPIN (4-digit quick security pin)
 *   2. First-Time Setup on Device:
 *      - Enter Registered Mobile (+91 98452 01842)
 *      - Verify 6-digit OTP -> Auto-registers device & unlocks Home dashboard.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/ui/Icon';
import { ParinaamLogo } from '../components/ui/ParinaamLogo';
import { useAuthStore } from '../state/auth-store';
import { useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';

export const LoginScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const {
    isDeviceRegistered,
    registeredPhone,
    attemptBiometric,
    attemptMpin,
    attemptPhoneOtp,
  } = useAuthStore();

  // Mode: 'returning' (Biometric / MPIN) or 'first_time' (Phone -> OTP)
  const [authMode, setAuthMode] = useState<'returning' | 'first_time'>('returning');

  // For returning: 'biometric' | 'mpin'
  const [returningMethod, setReturningMethod] = useState<'biometric' | 'mpin'>('mpin');
  const [mpin, setMpin] = useState(['', '', '', '']);
  const mpinInputRef = useRef<any>(null);

  // For first_time: 'phone' | 'otp'
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [activeOtpIndex, setActiveOtpIndex] = useState(0);
  const [countdown, setCountdown] = useState(24);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hiddenOtpRef = useRef<any>(null);

  // Countdown timer for OTP
  useEffect(() => {
    if (step !== 'otp' || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Handle Biometric Login
  const handleBiometricLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await attemptBiometric();
    setBusy(false);
    if (res !== 'ok') {
      setError('Biometric authentication failed. Please enter your MPIN instead.');
      setReturningMethod('mpin');
    }
  };

  // Handle MPIN Login
  const handleMpinSubmit = async (pinStr: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await attemptMpin(pinStr);
    setBusy(false);
    if (res !== 'ok') {
      setError('Invalid MPIN. Try default demo MPIN: 1234 or verify via phone OTP.');
    }
  };

  const handleMpinChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 4);
    const newArr = clean.split('');
    while (newArr.length < 4) {
      newArr.push('');
    }
    setMpin(newArr);
    if (clean.length === 4) {
      void handleMpinSubmit(clean);
    }
  };

  // Handle Phone OTP
  const handleGenerateOtp = () => {
    Keyboard.dismiss();
    const cleanPhone = phoneNumber.replace(/\s+/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    setError(null);
    setCountdown(24);
    setStep('otp');
    setTimeout(() => hiddenOtpRef.current?.focus(), 250);
  };

  const handleProceedToApp = async () => {
    Keyboard.dismiss();
    if (busy) return;
    setBusy(true);
    setError(null);

    const otpString = otpDigits.join('');
    const res = await attemptPhoneOtp(phoneNumber, otpString, '1234');
    setBusy(false);

    if (res !== 'ok') {
      setError('Invalid verification code. Please check and retry.');
    }
  };

  const handleOtpChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    const newArr = clean.split('');
    while (newArr.length < 6) {
      newArr.push('');
    }
    setOtpDigits(newArr);
    setActiveOtpIndex(Math.min(5, clean.length));
    if (clean.length === 6) {
      setTimeout(() => void handleProceedToApp(), 200);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.host}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.inner,
          { paddingTop: Math.max(insets.top, 16) + 12, paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Row */}
        <View style={styles.topRow}>
          <View style={styles.terminalBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.terminalBadgeText}>TERMINAL #8841-K</Text>
          </View>

          <View style={styles.offlineBadge}>
            <Icon name="wifiOff" size={13} color="#92400E" strokeWidth={2.4} />
            <Text style={styles.offlineBadgeText}>OFFLINE READY</Text>
          </View>
        </View>

        {/* Brand Header */}
        <View style={styles.brandSection}>
          <ParinaamLogo size={76} />
          <Text style={styles.brandTitle}>Parinaam</Text>
          <Text style={styles.brandSubtitle}>Forensic Assays · Presumptive Field Terminal</Text>
        </View>

        {/* Error Notice */}
        {error && (
          <View style={styles.errorBanner}>
            <Icon name="alert" size={16} color="#DC2626" strokeWidth={2.2} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ========================================================================= */}
        {/* RETURNING OFFICER ENROLLED: BIOMETRIC / MPIN LOGIN                        */}
        {/* ========================================================================= */}
        {authMode === 'returning' ? (
          <View style={styles.card}>
            <View style={styles.returningHeader}>
              <View style={styles.returningOfficerBadge}>
                <Icon name="user" size={15} color="#1D4ED8" strokeWidth={2.4} />
                <Text style={styles.returningOfficerText}>DUTY OFFICER IDENTIFIED</Text>
              </View>
              <Text style={styles.cardTitle}>Officer Authentication</Text>
              <Text style={styles.registeredPhoneSub}>Enrolled Terminal · +91 {registeredPhone || '98452 01842'}</Text>
            </View>

            {/* Toggle Tabs: Biometric vs MPIN */}
            <View style={styles.methodToggleRow}>
              <TouchableOpacity
                style={[styles.methodTab, returningMethod === 'biometric' && styles.methodTabActive]}
                onPress={() => {
                  setError(null);
                  setReturningMethod('biometric');
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: returningMethod === 'biometric' }}
              >
                <Icon
                  name="fingerprint"
                  size={18}
                  color={returningMethod === 'biometric' ? '#2563EB' : '#64748B'}
                  strokeWidth={2.2}
                />
                <Text
                  style={[
                    styles.methodTabText,
                    returningMethod === 'biometric' && styles.methodTabTextActive,
                  ]}
                >
                  Biometrics
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.methodTab, returningMethod === 'mpin' && styles.methodTabActive]}
                onPress={() => {
                  setError(null);
                  setReturningMethod('mpin');
                  setTimeout(() => mpinInputRef.current?.focus(), 200);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: returningMethod === 'mpin' }}
              >
                <Icon
                  name="lock"
                  size={18}
                  color={returningMethod === 'mpin' ? '#2563EB' : '#64748B'}
                  strokeWidth={2.2}
                />
                <Text
                  style={[
                    styles.methodTabText,
                    returningMethod === 'mpin' && styles.methodTabTextActive,
                  ]}
                >
                  Enter MPIN
                </Text>
              </TouchableOpacity>
            </View>

            {/* Method 1: Biometric View */}
            {returningMethod === 'biometric' ? (
              <View style={styles.biometricContent}>
                <TouchableOpacity
                  style={styles.biometricTouchCircle}
                  onPress={handleBiometricLogin}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Tap to scan fingerprint or face ID"
                >
                  <Icon name="fingerprint" size={54} color="#2563EB" strokeWidth={1.8} />
                </TouchableOpacity>

                <Text style={styles.biometricPrompt}>
                  Tap sensor to authenticate using Fingerprint or Face ID
                </Text>

                <TouchableOpacity
                  style={styles.primaryAuthBtn}
                  onPress={handleBiometricLogin}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryAuthBtnText}>
                    {busy ? 'Authenticating…' : 'Authenticate with Biometrics'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Method 2: MPIN View */
              <View style={styles.mpinContent}>
                <Text style={styles.mpinPrompt}>Enter your 4-digit Security MPIN</Text>

                {/* 4 Digit Boxes */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => mpinInputRef.current?.focus()}
                  style={styles.mpinBoxesRow}
                >
                  {mpin.map((digit, i) => (
                    <View key={i} style={[styles.mpinBox, digit ? styles.mpinBoxFilled : null]}>
                      <Text style={styles.mpinDigitText}>{digit ? '●' : ''}</Text>
                    </View>
                  ))}
                </TouchableOpacity>

                <TextInput
                  ref={mpinInputRef}
                  value={mpin.join('')}
                  onChangeText={handleMpinChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.hiddenInput}
                  autoFocus
                />

                <View style={styles.mpinHintCard}>
                  <View style={styles.mpinHintLeft}>
                    <Icon name="key" size={14} color="#2563EB" strokeWidth={2.4} />
                    <Text style={styles.mpinHintText}>
                      Authorized Duty MPIN: <Text style={{ fontWeight: '800' }}>1234</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      handleMpinChange('1234');
                    }}
                    style={styles.quickFillPill}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Quick fill default MPIN 1234"
                  >
                    <Text style={styles.quickFillText}>1-Tap Fill</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.primaryAuthBtn}
                  onPress={() => void handleMpinSubmit(mpin.join(''))}
                  activeOpacity={0.88}
                  disabled={mpin.join('').length < 4 || busy}
                >
                  <Text style={styles.primaryAuthBtnText}>
                    {busy ? 'Verifying MPIN…' : 'Proceed with MPIN'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Switch Account / Reset Link */}
            <TouchableOpacity
              style={styles.switchAuthLink}
              onPress={() => {
                setError(null);
                setAuthMode('first_time');
                setStep('phone');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.switchAuthLinkText}>
                First time setup or switch registered number? Enter Phone & OTP
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ========================================================================= */
          /* FIRST TIME ON DEVICE: ENTER PHONE -> ENTER OTP                            */
          /* ========================================================================= */
          <View style={styles.card}>
            {step === 'phone' ? (
              <>
                <Text style={styles.cardTitle}>Enter registered phone number</Text>
                <Text style={styles.firstTimeSub}>
                  First time signing in on this terminal. Enter your official field number.
                </Text>

                <View style={styles.phoneInputRow}>
                  <View style={styles.countryPill}>
                    <Text style={styles.flagText}>🇮🇳</Text>
                    <Text style={styles.countryCodeText}>+91</Text>
                  </View>

                  <View style={styles.phoneInputBox}>
                    <TextInput
                      value={phoneNumber}
                      onChangeText={(val) => {
                        setError(null);
                        setPhoneNumber(val);
                      }}
                      keyboardType="phone-pad"
                      placeholder="98452 01842"
                      placeholderTextColor="#94A3B8"
                      style={styles.phoneTextInput}
                      accessibilityLabel="Phone Number"
                    />
                    {phoneNumber.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setPhoneNumber('')}
                        style={styles.clearBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Clear phone number"
                      >
                        <Icon name="close" size={14} color="#64748B" strokeWidth={2.4} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={styles.secureNotice}>
                  <Icon name="lock" size={14} color="#2563EB" strokeWidth={2.2} />
                  <Text style={styles.secureNoticeText}>
                    A 6-digit one-time code will be dispatched to authenticate this terminal.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.primaryAuthBtn}
                  onPress={handleGenerateOtp}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryAuthBtnText}>Generate OTP</Text>
                  <Icon name="chevronRight" size={18} color="#FFFFFF" strokeWidth={2.5} />
                </TouchableOpacity>

                {isDeviceRegistered && (
                  <TouchableOpacity
                    style={styles.switchAuthLink}
                    onPress={() => {
                      setError(null);
                      setAuthMode('returning');
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.switchAuthLinkText}>
                      ← Return to Biometric / MPIN Login
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <View style={styles.otpHeaderRow}>
                  <Text style={styles.cardTitle}>Enter OTP</Text>
                  <TouchableOpacity onPress={() => setStep('phone')} accessibilityRole="button">
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.otpSentTo}>Sent to +91 {phoneNumber}</Text>

                {/* 6 Digit Boxes */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => hiddenOtpRef.current?.focus()}
                  style={styles.otpBoxesRow}
                >
                  {otpDigits.map((digit, index) => {
                    const isFocused = index === activeOtpIndex;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.otpBox,
                          digit ? styles.otpBoxFilled : null,
                          isFocused ? styles.otpBoxActive : null,
                        ]}
                      >
                        <Text style={styles.otpDigitText}>{digit}</Text>
                      </View>
                    );
                  })}
                </TouchableOpacity>

                <TextInput
                  ref={hiddenOtpRef}
                  value={otpDigits.join('')}
                  onChangeText={handleOtpChange}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.hiddenInput}
                />

                <View style={styles.resendRow}>
                  <Text style={styles.resendLabel}>Didn't receive code?</Text>
                  {countdown > 0 ? (
                    <Text style={styles.countdownText}>Resend in {countdown}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleGenerateOtp}>
                      <Text style={styles.resendBtnText}>Resend OTP</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.primaryAuthBtn}
                  onPress={() => void handleProceedToApp()}
                  activeOpacity={0.88}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryAuthBtnText}>
                    {busy ? 'Verifying…' : 'Proceed to App'}
                  </Text>
                  <Icon name="chevronRight" size={18} color="#FFFFFF" strokeWidth={2.5} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Security / Legal Badges */}
        <View style={styles.footerBadges}>
          <View style={styles.badgeItem}>
            <Icon name="shieldCheck" size={15} color="#16A34A" strokeWidth={2.2} />
            <Text style={styles.badgeItemText}>LOCAL KEYSTORE ATTESTED</Text>
          </View>
          <View style={styles.badgeItem}>
            <Icon name="fingerprint" size={15} color="#2563EB" strokeWidth={2.2} />
            <Text style={styles.badgeItemText}>BIOMETRIC / MPIN GUARDED</Text>
          </View>
        </View>

        <Text style={styles.legalFootnote}>
          Rule 10(2) NDPS Rules 2022 · Section 63 BSA 2023 Compliant Field Terminal
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme: Theme) => {
  const evidenceMono = theme.fontFamily.mono;

  return StyleSheet.create({
    host: {
      flex: 1,
      backgroundColor: '#F8FAFC',
    },
    scroll: {
      flex: 1,
    },
    inner: {
      paddingHorizontal: 20,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    terminalBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    greenDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#16A34A',
    },
    terminalBadgeText: {
      fontFamily: evidenceMono,
      fontSize: 11,
      fontWeight: '700',
      color: '#334155',
      letterSpacing: 0.5,
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
    brandSection: {
      alignItems: 'center',
      marginTop: 6,
      marginBottom: 24,
    },
    brandTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: -0.5,
      marginTop: 10,
    },
    brandSubtitle: {
      fontSize: 13,
      color: '#64748B',
      marginTop: 3,
      textAlign: 'center',
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#FEE2E2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      fontSize: 13,
      color: '#B91C1C',
      flex: 1,
      fontWeight: '500',
    },
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    returningHeader: {
      marginBottom: 16,
    },
    returningOfficerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginBottom: 8,
    },
    returningOfficerText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#1D4ED8',
      letterSpacing: 0.4,
    },
    cardTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: '#0F172A',
      marginBottom: 4,
    },
    registeredPhoneSub: {
      fontSize: 13,
      color: '#64748B',
    },
    firstTimeSub: {
      fontSize: 13,
      color: '#64748B',
      marginBottom: 16,
    },
    methodToggleRow: {
      flexDirection: 'row',
      backgroundColor: '#F1F5F9',
      borderRadius: 12,
      padding: 4,
      marginBottom: 20,
      marginTop: 8,
    },
    methodTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 10,
      borderRadius: 9,
    },
    methodTabActive: {
      backgroundColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 1,
    },
    methodTabText: {
      fontSize: 13.5,
      fontWeight: '600',
      color: '#64748B',
    },
    methodTabTextActive: {
      color: '#2563EB',
      fontWeight: '700',
    },
    biometricContent: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    biometricTouchCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: '#EFF6FF',
      borderWidth: 2,
      borderColor: '#BFDBFE',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    biometricPrompt: {
      fontSize: 13,
      color: '#475569',
      textAlign: 'center',
      maxWidth: 240,
      lineHeight: 18,
      marginBottom: 20,
    },
    mpinContent: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    mpinPrompt: {
      fontSize: 14,
      fontWeight: '600',
      color: '#334155',
      marginBottom: 16,
    },
    mpinBoxesRow: {
      flexDirection: 'row',
      gap: 14,
      marginBottom: 24,
    },
    mpinBox: {
      width: 52,
      height: 54,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: '#CBD5E1',
      backgroundColor: '#F8FAFC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mpinBoxFilled: {
      borderColor: '#2563EB',
      backgroundColor: '#EFF6FF',
    },
    mpinDigitText: {
      fontSize: 22,
      fontWeight: '800',
      color: '#1E3A8A',
    },
    phoneInputRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    countryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#F8FAFC',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 52,
    },
    flagText: {
      fontSize: 16,
    },
    countryCodeText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#0F172A',
    },
    phoneInputBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1.5,
      borderColor: '#2563EB',
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 52,
    },
    phoneTextInput: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: '#0F172A',
    },
    clearBtn: {
      padding: 4,
    },
    secureNotice: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: '#F8FAFC',
      borderRadius: 10,
      padding: 12,
      marginBottom: 20,
    },
    secureNoticeText: {
      fontSize: 12,
      color: '#64748B',
      lineHeight: 16,
      flex: 1,
    },
    primaryAuthBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#1D4ED8',
      height: 52,
      borderRadius: 12,
      width: '100%',
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    primaryAuthBtnText: {
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    switchAuthLink: {
      marginTop: 18,
      alignItems: 'center',
      paddingVertical: 6,
    },
    switchAuthLinkText: {
      fontSize: 12.5,
      color: '#2563EB',
      fontWeight: '600',
      textAlign: 'center',
    },
    otpHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    editText: {
      fontSize: 13.5,
      color: '#2563EB',
      fontWeight: '700',
    },
    otpSentTo: {
      fontSize: 13,
      color: '#64748B',
      marginBottom: 20,
    },
    otpBoxesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    otpBox: {
      width: 44,
      height: 52,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: '#E2E8F0',
      backgroundColor: '#F8FAFC',
      alignItems: 'center',
      justifyContent: 'center',
    },
    otpBoxFilled: {
      borderColor: '#CBD5E1',
      backgroundColor: '#FFFFFF',
    },
    otpBoxActive: {
      borderColor: '#2563EB',
      backgroundColor: '#EFF6FF',
    },
    otpDigitText: {
      fontSize: 19,
      fontWeight: '800',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    hiddenInput: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0.01,
    },
    resendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 22,
    },
    resendLabel: {
      fontSize: 13,
      color: '#64748B',
    },
    countdownText: {
      fontSize: 13,
      color: '#94A3B8',
      fontWeight: '600',
    },
    resendBtnText: {
      fontSize: 13,
      color: '#2563EB',
      fontWeight: '700',
    },
    footerBadges: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
      marginTop: 26,
      marginBottom: 12,
    },
    badgeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    badgeItemText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#475569',
      letterSpacing: 0.3,
    },
    legalFootnote: {
      fontSize: 11,
      color: '#94A3B8',
      textAlign: 'center',
      marginBottom: 10,
    },
    mpinHintCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#EFF6FF',
      borderWidth: 1,
      borderColor: '#DBEAFE',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      marginBottom: 16,
    },
    mpinHintLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      flex: 1,
    },
    mpinHintText: {
      fontSize: 12,
      color: '#1E40AF',
      fontWeight: '600',
    },
    quickFillPill: {
      backgroundColor: '#2563EB',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    quickFillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
  });
};
