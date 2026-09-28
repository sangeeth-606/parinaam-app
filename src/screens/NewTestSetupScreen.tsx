/**
 * NewTestSetupScreen — Kit & Substance Selection Wizard (Step 1)
 *
 * Flow:
 * 1. Kit Type dropdown/selector:
 *    - NS Kit (Narcotics Substances Kit - Active)
 *    - PS Kit (Precursor/Psychotropic - Graceful "Not configured yet")
 *    - Ketamine Kit (Graceful "Not configured yet")
 * 2. Test/Substance selector (Shown ONLY when NS Kit is selected):
 *    - Opium (Test A, water-extraction prep)
 *    - Morphine/Codeine/Heroin (Test A, direct application)
 *    - Amphetamines/Mescaline (2 possible outcomes)
 *    - Marijuana/Hashish/Hashish Oil (Test B, Duquenois-Levine)
 *    - Cocaine/Methaqualone (Test E, Scott reagent, 2 stages)
 * 3. Proceed to Optical Capture
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { useSessionStore } from '../state/session-store';
import { useSyncStore } from '../state/sync-store';
import { useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import type { ReagentType } from '../types/domain';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type KitType = 'NS' | 'PS' | 'KETAMINE';

interface SubstanceOption {
  id: string;
  name: string;
  testLetter: string;
  reagent: ReagentType;
  prepNote: string;
  outcomesNote: string;
  colorSwatch: string;
}

const SUBSTANCE_OPTIONS: SubstanceOption[] = [
  {
    id: 'opium',
    name: 'Opium',
    testLetter: 'Test A',
    reagent: 'marquis',
    prepNote: 'Requires a preliminary water-extraction preparation step prior to reagent drop.',
    outcomesNote: 'Forms characteristic brownish-purple precipitate.',
    colorSwatch: '#581C87',
  },
  {
    id: 'heroin_morphine',
    name: 'Morphine / Codeine / Heroin',
    testLetter: 'Test A',
    reagent: 'marquis',
    prepNote: 'Direct application on dry sample · 3 possible outcome labels sharing Marquis profile.',
    outcomesNote: 'Diacetylmorphine (Heroin) forms deep purplish-violet chromophore.',
    colorSwatch: '#4C1D95',
  },
  {
    id: 'amphetamines',
    name: 'Amphetamines / Mescaline',
    testLetter: 'Test Letter Unconfirmed',
    reagent: 'marquis',
    prepNote: 'Direct application onto porcelain spot plate well.',
    outcomesNote: '2 possible outcomes (Orange to reddish-brown transition).',
    colorSwatch: '#C2410C',
  },
  {
    id: 'cannabinoids',
    name: 'Marijuana / Hashish / Hashish Oil',
    testLetter: 'Test B',
    reagent: 'duquenois_levine',
    prepNote: 'Duquenois-Levine biphasic assay · Single definitive outcome.',
    outcomesNote: 'Target violet chromophore migrates to lower chloroform organic layer.',
    colorSwatch: '#047857',
  },
  {
    id: 'cocaine',
    name: 'Cocaine / Methaqualone',
    testLetter: 'Test E',
    reagent: 'scott',
    prepNote: 'Two sequential stages with differential outcome sets per stage.',
    outcomesNote: 'Stage 1: Blue precipitate; Stage 2: Hydrochloric acid dissolves pink; Stage 3: Chloroform extracts blue.',
    colorSwatch: '#1D4ED8',
  },
];

export const NewTestSetupScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { setup, patchSetup } = useSessionStore();
  const reachability = useSyncStore((s) => s.reachability);

  const [selectedKit, setSelectedKit] = useState<KitType>('NS');
  const [selectedSubstanceId, setSelectedSubstanceId] = useState<string>('heroin_morphine');
  const [caseRef, setCaseRef] = useState(setup.caseRef || '');
  const [packageNo, setPackageNo] = useState(setup.packageNo || '');
  const [panchnamaRef, setPanchnamaRef] = useState(setup.panchnamaRef || '');
  const [lotNo, setLotNo] = useState(setup.lotNo || '');

  const selectedSubstance =
    SUBSTANCE_OPTIONS.find((s) => s.id === selectedSubstanceId) || SUBSTANCE_OPTIONS[1];

  const handleProceed = () => {
    if (selectedKit !== 'NS') {
      return;
    }

    patchSetup({
      caseRef,
      packageNo,
      panchnamaRef,
      lotNo,
      reagent: selectedSubstance.reagent,
      kitMake: 'Anchor Forensic',
      kitTestName: `${selectedKit} Kit · ${selectedSubstance.name}`,
      kitLotNo: '31–09–2097',
    });

    navigation.navigate('Capture');
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

        <Text style={styles.headerTitle}>Test Configuration</Text>

        <View style={[styles.offlineBadge, reachability === 'up' && { backgroundColor: '#DCFCE7' }]}>
          <Icon
            name={reachability === 'up' ? 'wifi' : 'wifiOff'}
            size={13}
            color={reachability === 'up' ? '#15803D' : '#92400E'}
            strokeWidth={2.4}
          />
          <Text style={[styles.offlineBadgeText, reachability === 'up' && { color: '#15803D' }]}>
            {reachability === 'up' ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Step Indicator */}
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>STEP 1 OF 3 · ASSAY SELECTION</Text>
        </View>

        <Text style={styles.mainTitle}>Field Test Kit & Substance</Text>
        <Text style={styles.mainSub}>
          Select the physical test kit and target drug profile to apply calibrated colorimetric standards.
        </Text>

        {/* ========================================================================= */}
        {/* 1. KIT TYPE SELECTOR                                                      */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>1. SELECT FIELD KIT TYPE</Text>

          <View style={styles.kitPillsRow}>
            {/* NS Kit (Configured) */}
            <TouchableOpacity
              style={[styles.kitCard, selectedKit === 'NS' && styles.kitCardActive]}
              onPress={() => setSelectedKit('NS')}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedKit === 'NS' }}
            >
              <View style={styles.kitCardTop}>
                <View style={[styles.kitIconCircle, selectedKit === 'NS' && styles.kitIconCircleActive]}>
                  <Icon name="microscope" size={18} color={selectedKit === 'NS' ? '#2563EB' : '#64748B'} strokeWidth={2.2} />
                </View>
                <View style={styles.statusPillReady}>
                  <Text style={styles.statusPillReadyText}>READY</Text>
                </View>
              </View>
              <Text style={[styles.kitTitle, selectedKit === 'NS' && styles.kitTitleActive]}>NS Kit</Text>
              <Text style={styles.kitSubtitle}>Narcotic Substances Field Kit</Text>
            </TouchableOpacity>

            {/* PS Kit (Not Configured) */}
            <TouchableOpacity
              style={[styles.kitCard, selectedKit === 'PS' && styles.kitCardDisabledActive]}
              onPress={() => setSelectedKit('PS')}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedKit === 'PS' }}
            >
              <View style={styles.kitCardTop}>
                <View style={styles.kitIconCircle}>
                  <Icon name="palette" size={18} color="#64748B" strokeWidth={2.2} />
                </View>
                <View style={styles.statusPillUnconfigured}>
                  <Text style={styles.statusPillUnconfiguredText}>SOON</Text>
                </View>
              </View>
              <Text style={styles.kitTitle}>PS Kit</Text>
              <Text style={styles.kitSubtitle}>Precursor Substances</Text>
            </TouchableOpacity>

            {/* Ketamine Kit (Not Configured) */}
            <TouchableOpacity
              style={[styles.kitCard, selectedKit === 'KETAMINE' && styles.kitCardDisabledActive]}
              onPress={() => setSelectedKit('KETAMINE')}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedKit === 'KETAMINE' }}
            >
              <View style={styles.kitCardTop}>
                <View style={styles.kitIconCircle}>
                  <Icon name="crosshairs" size={18} color="#64748B" strokeWidth={2.2} />
                </View>
                <View style={styles.statusPillUnconfigured}>
                  <Text style={styles.statusPillUnconfiguredText}>SOON</Text>
                </View>
              </View>
              <Text style={styles.kitTitle}>Ketamine Kit</Text>
              <Text style={styles.kitSubtitle}>Specialized Assay</Text>
            </TouchableOpacity>
          </View>

          {/* Graceful Unconfigured Notice */}
          {selectedKit !== 'NS' && (
            <View style={styles.unconfiguredNotice}>
              <Icon name="alert" size={16} color="#D97706" strokeWidth={2.4} />
              <View style={styles.unconfiguredNoticeTextWrap}>
                <Text style={styles.unconfiguredNoticeTitle}>Profile Not Configured Yet</Text>
                <Text style={styles.unconfiguredNoticeBody}>
                  {selectedKit === 'PS' ? 'PS Kit' : 'Ketamine Kit'} profiles are under laboratory calibration.
                  Please switch back to the standard NS Kit to perform field tests.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ========================================================================= */}
        {/* 2. SUBSTANCE / TEST DROPDOWN (ONLY SHOWN FOR NS KIT)                      */}
        {/* ========================================================================= */}
        {selectedKit === 'NS' ? (
          <View style={styles.sectionCard}>
            <View style={styles.substanceHeaderRow}>
              <Text style={styles.sectionLabel}>2. TARGET SUBSTANCE & ASSAY</Text>
              <View style={styles.reagentTag}>
                <Text style={styles.reagentTagText}>REAGENT: {selectedSubstance.reagent.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.substancesList}>
              {SUBSTANCE_OPTIONS.map((item) => {
                const isSelected = item.id === selectedSubstanceId;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.substanceItem, isSelected && styles.substanceItemActive]}
                    onPress={() => setSelectedSubstanceId(item.id)}
                    activeOpacity={0.88}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <View style={styles.substanceItemLeft}>
                      <View style={[styles.substanceRadioCircle, isSelected && styles.substanceRadioActive]}>
                        {isSelected && <View style={styles.substanceRadioInner} />}
                      </View>
                      <View style={styles.substanceTexts}>
                        <View style={styles.substanceTitleRow}>
                          <Text style={[styles.substanceName, isSelected && styles.substanceNameActive]}>
                            {item.name}
                          </Text>
                          <View style={styles.testLetterBadge}>
                            <Text style={styles.testLetterText}>{item.testLetter}</Text>
                          </View>
                        </View>
                        <Text style={styles.substancePrep}>{item.prepNote}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Instruction / Protocol Callout */}
            <View style={styles.prepNoticeCard}>
              <Icon name="document" size={15} color="#2563EB" strokeWidth={2.2} />
              <View style={styles.prepNoticeTextWrap}>
                <Text style={styles.prepNoticeTitle}>Standard Protocol Guidance</Text>
                <Text style={styles.prepNoticeBody}>{selectedSubstance.outcomesNote}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ========================================================================= */}
        {/* 3. CASE & CHAIN-OF-CUSTODY IDENTIFIERS                                   */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>3. EVIDENTIARY IDENTIFIERS</Text>

          <View style={styles.fieldsGrid}>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>CASE / FIR REF</Text>
              <TextInput
                value={caseRef}
                onChangeText={setCaseRef}
                placeholder="e.g. NCR-2026-001"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>PACKAGE NO (P-n)</Text>
              <TextInput
                value={packageNo}
                onChangeText={setPackageNo}
                placeholder="e.g. PKG-01"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>PANCHNAMA REF</Text>
              <TextInput
                value={panchnamaRef}
                onChangeText={setPanchnamaRef}
                placeholder="e.g. PAN/MZU/2026/01"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>LOT NUMBER</Text>
              <TextInput
                value={lotNo}
                onChangeText={setLotNo}
                placeholder="e.g. LOT-01"
                placeholderTextColor="#94A3B8"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>
          </View>
        </View>

        {/* Primary Proceed Button */}
        <TouchableOpacity
          style={[styles.proceedBtn, selectedKit !== 'NS' && styles.proceedBtnDisabled]}
          onPress={handleProceed}
          disabled={selectedKit !== 'NS'}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Proceed to Guided Capture"
        >
          <Text style={styles.proceedBtnText}>
            {selectedKit === 'NS' ? 'Proceed to Optical Capture' : 'Select NS Kit to Proceed'}
          </Text>
          <Icon name="chevronRight" size={18} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      </ScrollView>
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      gap: 16,
    },
    stepBadge: {
      alignSelf: 'flex-start',
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    stepBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#1D4ED8',
      letterSpacing: 0.5,
    },
    mainTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: -0.4,
      marginTop: -4,
    },
    mainSub: {
      fontSize: 13,
      color: '#64748B',
      lineHeight: 18,
      marginTop: -8,
      marginBottom: 4,
    },
    sectionCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 1,
    },
    sectionLabel: {
      fontSize: 11.5,
      fontWeight: '800',
      color: '#475569',
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    kitPillsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    kitCard: {
      flex: 1,
      backgroundColor: '#F8FAFC',
      borderWidth: 1.5,
      borderColor: '#E2E8F0',
      borderRadius: 12,
      padding: 12,
      minHeight: 104,
      justifyContent: 'space-between',
    },
    kitCardActive: {
      backgroundColor: '#EFF6FF',
      borderColor: '#2563EB',
    },
    kitCardDisabledActive: {
      backgroundColor: '#FEF3C7',
      borderColor: '#F59E0B',
    },
    kitCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    kitIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    kitIconCircleActive: {
      borderColor: '#BFDBFE',
      backgroundColor: '#EFF6FF',
    },
    statusPillReady: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    statusPillReadyText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#15803D',
    },
    statusPillUnconfigured: {
      backgroundColor: '#F1F5F9',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    statusPillUnconfiguredText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#64748B',
    },
    kitTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#1E293B',
      marginTop: 8,
    },
    kitTitleActive: {
      color: '#1D4ED8',
    },
    kitSubtitle: {
      fontSize: 10.5,
      color: '#64748B',
      marginTop: 2,
    },
    unconfiguredNotice: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: '#FFFBEB',
      borderWidth: 1,
      borderColor: '#FDE68A',
      borderRadius: 10,
      padding: 12,
      marginTop: 14,
    },
    unconfiguredNoticeTextWrap: {
      flex: 1,
    },
    unconfiguredNoticeTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#92400E',
    },
    unconfiguredNoticeBody: {
      fontSize: 11.5,
      color: '#78350F',
      lineHeight: 16,
      marginTop: 2,
    },
    substanceHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    reagentTag: {
      backgroundColor: '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    reagentTagText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#475569',
      fontFamily: evidenceMono,
    },
    substancesList: {
      gap: 8,
    },
    substanceItem: {
      backgroundColor: '#F8FAFC',
      borderWidth: 1.5,
      borderColor: '#E2E8F0',
      borderRadius: 12,
      padding: 12,
    },
    substanceItemActive: {
      backgroundColor: '#EFF6FF',
      borderColor: '#2563EB',
    },
    substanceItemLeft: {
      flexDirection: 'row',
      gap: 12,
    },
    substanceRadioCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.8,
      borderColor: '#CBD5E1',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    substanceRadioActive: {
      borderColor: '#2563EB',
    },
    substanceRadioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#2563EB',
    },
    substanceTexts: {
      flex: 1,
    },
    substanceTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 3,
    },
    substanceName: {
      fontSize: 14.5,
      fontWeight: '700',
      color: '#0F172A',
    },
    substanceNameActive: {
      color: '#1D4ED8',
    },
    testLetterBadge: {
      backgroundColor: '#E2E8F0',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    testLetterText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#334155',
    },
    substancePrep: {
      fontSize: 11.5,
      color: '#64748B',
      lineHeight: 16,
    },
    prepNoticeCard: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: '#F8FAFC',
      borderRadius: 10,
      padding: 12,
      marginTop: 12,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    prepNoticeTextWrap: {
      flex: 1,
    },
    prepNoticeTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: '#1E293B',
    },
    prepNoticeBody: {
      fontSize: 11.5,
      color: '#475569',
      lineHeight: 16,
      marginTop: 2,
    },
    fieldsGrid: {
      gap: 10,
    },
    fieldBox: {
      gap: 4,
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.3,
    },
    fieldInput: {
      backgroundColor: '#F8FAFC',
      borderWidth: 1,
      borderColor: '#CBD5E1',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: '600',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    proceedBtn: {
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
      marginTop: 4,
    },
    proceedBtnDisabled: {
      backgroundColor: '#94A3B8',
      shadowOpacity: 0,
      elevation: 0,
    },
    proceedBtnText: {
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
};
