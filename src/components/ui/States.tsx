/**
 * State components — the 5-state coverage matrix (open-design craft/state-coverage.md):
 * Loading / Empty / Error / Populated / Edge. Empty is NEVER rendered as error, and
 * skeletons match final geometry so nothing jumps when data lands (rule 14).
 * Loading ladder: <300 ms nothing · <2 s skeleton · >2 s labelled · no infinite spinners.
 */

import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  DimensionValue,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Icon, IconName } from './Icon';
import { Button } from './Button';
import { badgeTones, colors, type, radius, space, duration } from '../../theme';

/* ------------------------------- Skeleton ------------------------------- */

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  shimmer?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 14,
  radius: r = radius.sm,
  style,
  shimmer = true,
}) => {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!shimmer) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: duration.shimmer / 2, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: duration.shimmer / 2, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, shimmer]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: r, backgroundColor: colors.surfaceRaised, opacity }, style]}
    />
  );
};

/** A list placeholder whose geometry matches RecordRow exactly. */
export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <View style={styles.skeletonList} accessibilityRole="progressbar" accessibilityLabel="Loading records">
    {Array.from({ length: rows }).map((_, i) => (
      <View key={i} style={styles.skeletonRow}>
        <Skeleton width={36} height={36} radius={10} />
        <View style={styles.skeletonLines}>
          <Skeleton width="62%" height={13} />
          <Skeleton width="38%" height={11} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={54} height={16} radius={radius.xs} />
      </View>
    ))}
  </View>
);

/* ------------------------------ EmptyState ------------------------------ */

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}) => (
  <View
    style={[styles.empty, compact && styles.emptyCompact]}
    accessibilityRole="summary"
    accessibilityLabel={`${title}. ${message ?? ''}`}
  >
    <View style={styles.emptyIconWell}>
      <Icon name={icon} size={compact ? 22 : 28} color={colors.textTertiary} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    {actionLabel && onAction ? (
      <Button label={actionLabel} onPress={onAction} variant="tonal" size="md" fullWidth={false} style={styles.emptyAction} />
    ) : null}
  </View>
);

/* ------------------------------ ErrorState ------------------------------ */

interface ErrorStateProps {
  title: string;
  message: string;
  hint?: string;
  retryLabel?: string;
  onRetry?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  hint,
  retryLabel,
  onRetry,
  secondaryLabel,
  onSecondary,
}) => (
  <View style={styles.error} accessibilityRole="alert">
    <View style={[styles.errorIconWell, { borderColor: badgeTones.fail.border }]}>
      <Icon name="alert" size={26} color={colors.fail} />
    </View>
    <Text style={styles.errorTitle}>{title}</Text>
    <Text style={styles.errorMessage}>{message}</Text>
    {hint ? <Text style={styles.errorHint}>{hint}</Text> : null}
    {retryLabel && onRetry ? (
      <View style={styles.errorActions}>
        <Button label={retryLabel} onPress={onRetry} variant="secondary" size="md" fullWidth={false} icon="refresh" />
        {secondaryLabel && onSecondary ? (
          <Button label={secondaryLabel} onPress={onSecondary} variant="ghost" size="md" fullWidth={false} />
        ) : null}
      </View>
    ) : null}
  </View>
);

/* ----------------------------- LoadingState ----------------------------- */

export const LoadingState: React.FC<{ label?: string }> = ({ label }) => (
  <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
    <ActivityIndicator size="small" color={colors.brand} />
    {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
  </View>
);

/** Inline progress note shown when a job crosses the "taking longer" threshold. */
export const SlowNotice: React.FC<{ message: string; onCancel?: () => void }> = ({ message, onCancel }) => (
  <View style={styles.slow}>
    <Text style={styles.slowText}>{message}</Text>
    {onCancel ? <Button label="Cancel" onPress={onCancel} variant="ghost" size="sm" fullWidth={false} /> : null}
  </View>
);

/** Full-screen scrollable host for the chrome of state pages. */
export const StateScroll: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ScrollView contentContainerStyle={styles.stateScroll}>{children}</ScrollView>
);

const styles = StyleSheet.create({
  skeletonList: { gap: space.lg, paddingVertical: space.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skeletonLines: { flex: 1 },
  empty: { alignItems: 'center', paddingVertical: space['4xl'], paddingHorizontal: space['2xl'], gap: space.sm },
  emptyCompact: { paddingVertical: space['2xl'] },
  emptyIconWell: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyTitle: { ...type.subhead, color: colors.textPrimary, textAlign: 'center' },
  emptyMessage: { ...type.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyAction: { marginTop: space.md },
  error: { alignItems: 'center', paddingVertical: space['4xl'], paddingHorizontal: space['2xl'], gap: space.sm },
  errorIconWell: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorTitle: { ...type.subhead, color: colors.textPrimary },
  errorMessage: { ...type.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  errorHint: { ...type.caption, color: colors.textTertiary, textAlign: 'center' },
  errorActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg, justifyContent: 'center' },
  loadingLabel: { ...type.caption, color: colors.textSecondary },
  slow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
  },
  slowText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  stateScroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
});

