/**
 * ParinaamLogo — Vector brand mark for Parinaam
 * Renders the rounded icon with the green test tube and leaf flourish.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useThemedStyles } from '../../theme/theme-context';
import type { Theme } from '../../theme';

interface Props {
  size?: number;
}

export const ParinaamLogo: React.FC<Props> = ({ size = 72 }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.shadowWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
        <Defs>
          <LinearGradient id="bgGrad" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#FFF7ED" />
            <Stop offset="30%" stopColor="#FFFFFF" />
            <Stop offset="100%" stopColor="#F0FDF4" />
          </LinearGradient>
          <LinearGradient id="orangeGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#EA580C" />
            <Stop offset="100%" stopColor="#F97316" />
          </LinearGradient>
          <LinearGradient id="greenGrad" x1="20" y1="20" x2="70" y2="70" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#15803D" />
            <Stop offset="100%" stopColor="#16A34A" />
          </LinearGradient>
        </Defs>

        {/* Card Background */}
        <Rect x="1" y="1" width="70" height="70" rx="18" fill="url(#bgGrad)" stroke="#E2E8F0" strokeWidth="1" />

        {/* Top-left Orange Arch */}
        <Path
          d="M14 36 C14 22 22 14 36 14 C30 18 24 24 22 34 Z"
          fill="url(#orangeGrad)"
        />

        {/* Bottom-right Green Arch */}
        <Path
          d="M26 58 C44 58 58 44 58 26 C58 38 46 54 26 58 Z"
          fill="url(#greenGrad)"
        />

        {/* Center Test Tube & Leaf */}
        {/* Test Tube Body */}
        <Path
          d="M32 24 L32 44 C32 48.4 35.6 52 40 52 C44.4 52 48 48.4 48 44 L48 24 Z"
          fill="#15803D"
        />
        {/* Test Tube Liquid / Inner */}
        <Path
          d="M34 32 L34 44 C34 47.3 36.7 50 40 50 C43.3 50 46 47.3 46 44 L46 32 Z"
          fill="#DCFCE7"
        />
        {/* Chemical Liquid level */}
        <Path
          d="M35 38 L35 44 C35 46.8 37.2 49 40 49 C42.8 49 45 46.8 45 44 L45 38 Z"
          fill="#F59E0B"
        />
        {/* Test Tube Cap Lip */}
        <Rect x="30" y="22" width="20" height="4" rx="2" fill="#15803D" />

        {/* Bubbles inside tube */}
        <Circle cx="40" cy="42" r="1.5" fill="#FFFFFF" />
        <Circle cx="38" cy="45" r="1" fill="#FFFFFF" />

        {/* Sprouting Leaf */}
        <Path
          d="M44 22 C48 16 56 16 54 22 C52 28 46 26 44 22 Z"
          fill="#16A34A"
        />
      </Svg>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    shadowWrap: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
      borderRadius: 18,
      backgroundColor: theme.colors.card,
    },
  });
