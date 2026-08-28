import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../hooks/useAppTheme';
import { useI18n } from '../hooks/useI18n';
import { alpha, RADIUS, TOUCH } from '../theme/theme';
import Ripple from './Ripple';

export function Surface({ level = 1, style, children }) {
  const theme = useAppTheme();
  const bg = [theme.surface, theme.surface1, theme.surface2, theme.surface3][Math.min(level, 3)];
  return <View style={[{ backgroundColor: bg, borderRadius: RADIUS.lg }, style]}>{children}</View>;
}

export function Button({ label, icon, onPress, variant = 'filled', style, disabled, loading }) {
  const theme = useAppTheme();
  const palette = {
    filled: { bg: theme.primary, fg: theme.onPrimary },
    tonal: { bg: theme.secondaryContainer, fg: theme.text },
    text: { bg: 'transparent', fg: theme.primary },
  }[variant];

  return (
    <View style={[{ borderRadius: RADIUS.pill, overflow: 'hidden', opacity: disabled ? 0.5 : 1 }, style]}>
      <Ripple onPress={onPress} disabled={disabled || loading}>
        <View style={[styles.button, { backgroundColor: palette.bg }]}>
          {loading ? (
            <ActivityIndicator size="small" color={palette.fg} />
          ) : (
            <>
              {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
              <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 14.5 }}>{label}</Text>
            </>
          )}
        </View>
      </Ripple>
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }) {
  const theme = useAppTheme();
  return (
    <View style={{ borderRadius: RADIUS.sm, overflow: 'hidden', marginRight: 8, marginBottom: 8 }}>
      <Ripple onPress={onPress}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: selected ? theme.primaryContainer : theme.surface2,
            borderRadius: RADIUS.sm,
          }}
        >
          {icon ? <Ionicons name={icon} size={14} color={selected ? theme.onPrimaryContainer : theme.textMuted} style={{ marginRight: 6 }} /> : null}
          <Text
            style={{
              color: selected ? theme.onPrimaryContainer : theme.textMuted,
              fontSize: 13,
              fontWeight: selected ? '700' : '600',
            }}
          >
            {label}
          </Text>
        </View>
      </Ripple>
    </View>
  );
}

export function Dialog({ visible, title, children, onDismiss }) {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={[styles.dialog, { backgroundColor: theme.surface2, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20 }]}>
          {title ? <Text style={[styles.dialogTitle, { color: theme.text }]}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function Field({ value, onChangeText, placeholder, multiline, autoFocus, onSubmitEditing, returnKeyType, secureTextEntry }) {
  const theme = useAppTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      autoFocus={autoFocus}
      multiline={multiline}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={secureTextEntry}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        backgroundColor: theme.surface,
        borderRadius: RADIUS.md,
        borderWidth: 1.5,
        borderColor: focused ? theme.primary : theme.outline,
        color: theme.text,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14.5,
        minHeight: multiline ? 96 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

export function SearchBar({ value, onChangeText, onClear, onSubmit, placeholder, autoFocus = true }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.surface1,
        borderRadius: RADIUS.pill,
        borderWidth: 1.5,
        borderColor: value ? theme.primary : 'transparent',
        paddingLeft: 16,
        paddingRight: 8,
        height: 52,
      }}
    >
      <Ionicons name="search" size={19} color={theme.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('md3.search')}
        placeholderTextColor={theme.textMuted}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        style={{ flex: 1, color: theme.text, fontSize: 15.5, marginLeft: 10, paddingVertical: 0 }}
      />
      {value.length > 0 ? (
        <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden' }}>
          <Ripple onPress={onClear} borderless>
            <View style={{ padding: 8 }}>
              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
            </View>
          </Ripple>
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, subtitle, action, icon = 'book-outline' }) {
  const theme = useAppTheme();
  return (
    <View style={styles.empty}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: alpha(theme.primary, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <Ionicons name={icon} size={30} color={theme.primary} />
      </View>
      <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: theme.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20, fontSize: 13.5 }}>
          {subtitle}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 20 }}>{action}</View> : null}
    </View>
  );
}

export function SectionLabel({ children, style }) {
  const theme = useAppTheme();
  return (
    <Text
      style={[
        { color: theme.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
        style,
      ]}
    >
      {String(children).toUpperCase()}
    </Text>
  );
}

export function Skeleton({ width, height, radius = RADIUS.md, style }) {
  const theme = useAppTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.surface2, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonList({ count = 6 }) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Skeleton width={44} height={60} radius={RADIUS.sm} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <Skeleton width="88%" height={14} radius={RADIUS.sm} />
            <Skeleton width="55%" height={12} radius={RADIUS.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    height: TOUCH,
    borderRadius: RADIUS.pill,
  },
  scrim: { flex: 1, backgroundColor: '#000000a6', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: RADIUS.xl, padding: 22 },
  dialogTitle: { fontSize: 19, fontWeight: '700', marginBottom: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});

/** Hairline separator that follows the theme outline colour. */
export function Divider({ inset = 0, style }) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: theme.outline, marginLeft: inset },
        style,
      ]}
    />
  );
}

/** Circular icon button with a guaranteed 48dp Android touch target. */
export function IconButton({ icon, onPress, color, size = 20, disabled, accessibilityLabel, tone }) {
  const theme = useAppTheme();
  return (
    <View style={{ borderRadius: RADIUS.pill, overflow: 'hidden', opacity: disabled ? 0.45 : 1 }}>
      <Ripple onPress={onPress} disabled={disabled} borderless accessibilityLabel={accessibilityLabel}>
        <View
          style={{
            width: TOUCH,
            height: TOUCH,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone ? alpha(theme.primary, 0.12) : 'transparent',
            borderRadius: RADIUS.pill,
          }}
        >
          <Ionicons name={icon} size={size} color={color ?? theme.text} />
        </View>
      </Ripple>
    </View>
  );
}

/** Static (non-animated) progress bar — cheap enough for long lists. */
export function ProgressBar({ value = 0, height = 4, track, fill, style }) {
  const theme = useAppTheme();
  const pct = `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
  return (
    <View
      style={[
        { height, borderRadius: height, backgroundColor: track ?? alpha(theme.textMuted, 0.25), overflow: 'hidden' },
        style,
      ]}
    >
      <View style={{ width: pct, height: '100%', backgroundColor: fill ?? theme.primary }} />
    </View>
  );
}

/** Small pill used for counts and metadata. */
export function Badge({ label, tone = 'neutral', style }) {
  const theme = useAppTheme();
  const palette =
    tone === 'primary'
      ? { bg: theme.primaryContainer, fg: theme.onPrimaryContainer }
      : tone === 'error'
        ? { bg: alpha(theme.error, 0.16), fg: theme.error }
        : { bg: theme.secondaryContainer, fg: theme.textMuted };
  return (
    <View
      style={[
        {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: RADIUS.sm,
          backgroundColor: palette.bg,
        },
        style,
      ]}
    >
      <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Sticky-ish day/section heading used by Updates and History. */
export function ListHeading({ label, right }) {
  const theme = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 8,
        backgroundColor: theme.background,
      }}
    >
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 }}>
        {String(label).toUpperCase()}
      </Text>
      {right}
    </View>
  );
}

/** Large screen title used instead of a plain navigation header. */
export function ScreenHeader({ title, subtitle, right, style }) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 3 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Consistent, human readable error presentation. */
export function ErrorState({ title, message, onRetry, retryLabel }) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const resolvedTitle = title ?? t('md3.somethingWentWrong');
  const resolvedRetry = retryLabel ?? t('md3.tryAgain');
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, padding: 28 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: alpha(theme.error, 0.14),
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Ionicons name="alert-circle-outline" size={30} color={theme.error} />
      </View>
      <Text style={{ color: theme.text, fontSize: 16.5, fontWeight: '800', textAlign: 'center' }}>{resolvedTitle}</Text>
      {message ? (
        <Text style={{ color: theme.textMuted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>
          {message}
        </Text>
      ) : null}
      {onRetry ? <Button label={resolvedRetry} variant="tonal" onPress={onRetry} style={{ marginTop: 18 }} /> : null}
    </View>
  );
}
