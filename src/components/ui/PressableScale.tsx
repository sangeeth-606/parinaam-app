/**
 * PressableScale — the single press affordance of the design system.
 * Scale 0.98 + alpha 0.85 via core Animated (spring for scale, timing for alpha).
 * No shadows, no elevation on press (evidentiary flat-depth rule).
 */

import React, { useCallback, useRef } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { press, duration } from '../../theme';

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  children?: React.ReactNode;
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  style,
  children,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const alpha = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: press.scale,
          useNativeDriver: true,
          speed: 50,
        }),
        Animated.timing(alpha, {
          toValue: press.opacity,
          duration: press.duration,
          useNativeDriver: true,
        }),
      ]).start();
      onPressIn?.(e);
    },
    [scale, alpha, onPressIn]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: duration.quick,
          useNativeDriver: true,
        }),
        Animated.timing(alpha, {
          toValue: 1,
          duration: duration.quick,
          useNativeDriver: true,
        }),
      ]).start();
      onPressOut?.(e);
    },
    [scale, alpha, onPressOut]
  );

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...rest}
    >
      <Animated.View
        style={[
          { transform: [{ scale }], opacity: disabled ? 0.5 : alpha },
          style as ViewStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};
