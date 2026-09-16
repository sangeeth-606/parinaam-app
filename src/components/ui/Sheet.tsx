/**
 * BottomSheet — Modal-based action/detail sheet. Core Animated only (reanimated is
 * version-mismatched at 3.16 vs RN 0.87 — see docs/redesign/03-design-system.md §5).
 * Motion: in 250 ms decelerate / out 200 ms accelerate; scrim rgba(0,0,0,0.85) class.
 * Also exposes `SheetAction` rows for export/consume menus and a destructive confirm
 * recipe (WCAG 3.3.4 consequential-action gate).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon, IconName } from './Icon';
import { colors, type, radius, space, duration, z } from '../../theme';
import { elevation, target } from '../../theme';

interface BottomSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}) => {
  const translate = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translate, {
          toValue: 1,
          duration: duration.sheetIn,
          useNativeDriver: true,
        }),
        Animated.timing(fade, { toValue: 1, duration: duration.quick, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translate, {
          toValue: 0,
          duration: duration.sheetOut,
          useNativeDriver: true,
        }),
        Animated.timing(fade, { toValue: 0, duration: duration.sheetOut, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // visible-driven only: closing animation owns its own timeline
  }, [visible]);

  const translateY = translate.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  if (!mounted && !visible) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdropHost}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          style={StyleSheet.absoluteFill}
        >
          <Animated.View style={[styles.scrim, { opacity: fade }]} />
        </Pressable>
        <Animated.View
          style={[styles.sheet, elevation.overlay, { transform: [{ translateY }] }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabberRow}>
            <View style={styles.grabber} />
          </View>
          {title ? (
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                style={styles.closeBtn}
              >
                <Icon name="close" size={16} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}
          <ScrollView bounces={false} contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

interface SheetActionProps {
  icon: IconName;
  label: string;
  description?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  badge?: string;
}

export const SheetAction: React.FC<SheetActionProps> = ({
  icon,
  label,
  description,
  onPress,
  destructive,
  disabled,
  badge,
}) => {
  const tint = destructive ? colors.fail : colors.textPrimary;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && { backgroundColor: colors.surfaceRaised },
        disabled && { opacity: 0.45 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: destructive ? colors.failDim : colors.brandDim }]}>
        <Icon name={icon} size={18} color={destructive ? colors.fail : colors.brand} />
      </View>
      <View style={styles.actionText}>
        <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
        {description ? <Text style={styles.actionDesc}>{description}</Text> : null}
      </View>
      {badge ? <Text style={styles.actionBadge}>{badge}</Text> : null}
      <Icon name="chevronRight" size={16} color={colors.textTertiary} />
    </Pressable>
  );
};

/** Small centered label under sheets for statutory notes (non-dismissible copy lives above). */
export const SheetFootnote: React.FC<{ text: string }> = ({ text }) => (
  <Text style={styles.footnote}>{text}</Text>
);

const styles = StyleSheet.create({
  backdropHost: { flex: 1, justifyContent: 'flex-end' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    maxHeight: '78%',
    minHeight: 180,
    zIndex: z.sheet,
  },
  grabberRow: { alignItems: 'center', paddingTop: space.sm },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
  },
  headText: { flex: 1 },
  title: { ...type.subhead, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: target.min - 8,
    height: target.min - 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: { padding: space.lg, gap: space.md },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space['2xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderRadius: radius.sm,
    minHeight: target.controlMd,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1 },
  actionLabel: { ...type.bodyStrong },
  actionDesc: { ...type.caption, color: colors.textSecondary },
  actionBadge: { ...type.monoSm, color: colors.textTertiary },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingTop: space.xs,
  },
});
