/**
 * FadeEntrance — Fluid page & section entrance motion
 * Implements subtle upward glide (6dp) with alpha fade (180ms - 250ms).
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle, Easing } from 'react-native';

export interface FadeEntranceProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
}

export const FadeEntrance: React.FC<FadeEntranceProps> = ({
  children,
  delay = 0,
  duration = 220,
  offsetY = 6,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(offsetY)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, duration, offsetY]);

  return (
    <Animated.View
      style={[
        {
          opacity,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};
