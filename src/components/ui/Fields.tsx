/**
 * Form fields — on-blur validation pattern (open-design craft/form-validation.md):
 * errors appear on blur (or once invalid, then live), clear the moment input is valid;
 * reserved error line so layout never jumps (rule 14); ≥48 dp inputs; focus border swap
 * stands in for the missing CSS outline.
 */

import React, { useState } from 'react';
import {
  KeyboardTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  View,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { PressableScale } from './PressableScale';
import { Icon } from './Icon';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import type { Theme } from '../../theme';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  /** Called on blur / live once touched; return an error string or null. */
  validate?: (value: string) => string | null;
  helper?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'characters' | 'words';
  autoCorrect?: boolean;
  uppercaseHint?: boolean;
  multiline?: boolean;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  validate,
  helper,
  keyboardType,
  autoCapitalize = 'sentences',
  autoCorrect = false,
  uppercaseHint,
  multiline,
  editable = true,
  style,
  accessibilityLabel,
}) => {
  const { theme } = useAppTheme();
  const { colors, type } = theme;
  const styles = useThemedStyles(createStyles);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const error = touched && validate ? validate(value) : null;

  return (
    <View style={[styles.field, style]}>
      <Text style={[type.micro, styles.label, { color: focused ? colors.brand : colors.textTertiary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.inputShell,
          multiline && styles.inputShellMulti,
          {
            borderColor: error
              ? colors.fail
              : focused
                ? colors.borderStrong
                : colors.border,
            backgroundColor: editable ? colors.surface : colors.surfaceSunken,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
          }}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          editable={editable}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMulti, !editable && styles.inputDisabled]}
          accessibilityLabel={accessibilityLabel ?? label}
        />
        {uppercaseHint ? <Text style={styles.hint}>auto-caps</Text> : null}
      </View>
      {/* reserved error/help line — height never collapses (no layout jumps) */}
      <Text
        style={[
          styles.helper,
          error ? { color: colors.fail } : { color: colors.textTertiary },
        ]}
        accessibilityLiveRegion="polite"
        numberOfLines={2}
      >
        {error ?? helper ?? ' '}
      </Text>
    </View>
  );
};

interface SearchFieldProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChangeText,
  placeholder = 'Search',
  style,
}) => {
  const { theme } = useAppTheme();
  const { colors } = theme;
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.searchShell, style]}>
    <Icon name="search" size={18} color={colors.textTertiary} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      autoCapitalize="none"
      autoCorrect={false}
      style={styles.searchInput}
      accessibilityLabel={placeholder}
    />
    {value.length > 0 ? (
      <PressableScale
        onPress={() => onChangeText('')}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Clear search"
        style={styles.clearBtn}
      >
        <Icon name="close" size={14} color={colors.textSecondary} strokeWidth={2.2} />
      </PressableScale>
    ) : null}
    </View>
  );
};

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  caption?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Sliding segmented control (thumb animates 150 ms; selection also marked by check). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  accessibilityLabel,
}: SegmentedControlProps<T>): React.ReactElement {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.segShell, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segItem, active && styles.segItemActive]}
          >
            <Text style={[styles.segLabel, active ? styles.segLabelActive : undefined]} numberOfLines={1}>
              {opt.label}
            </Text>
            {opt.caption ? (
              <Text style={styles.segCaption} numberOfLines={1}>
                {opt.caption}
              </Text>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => {
  const { colors, type, radius, space, fontWeight, target } = theme;
  return StyleSheet.create({
  field: { gap: space.xs },
  label: { color: colors.textTertiary },
  inputShell: {
    minHeight: target.controlMd,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  inputShellMulti: { alignItems: 'flex-start', paddingVertical: space.sm },
  input: {
    flex: 1,
    ...type.body,
    color: colors.textPrimary,
    paddingVertical: space.sm,
    minHeight: target.controlMd - 2,
  },
  inputMulti: { minHeight: 76, textAlignVertical: 'top' },
  inputDisabled: { color: colors.textSecondary },
  hint: { ...type.monoSm, color: colors.textTertiary, marginLeft: space.sm },
  helper: { ...type.caption, minHeight: 18 },
  searchShell: {
    minHeight: target.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, paddingVertical: space.sm },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segShell: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 3,
    gap: 3,
  },
  segItem: {
    flex: 1,
    minHeight: target.controlSm,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    gap: 1,
  },
  segItemActive: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  segLabel: { ...type.caption, color: colors.textSecondary, fontWeight: fontWeight.semibold },
  segLabelActive: { color: colors.textPrimary },
  segCaption: { ...type.micro, fontSize: 9, color: colors.textTertiary },
  });
};

export type FieldTextStyle = TextStyle;
