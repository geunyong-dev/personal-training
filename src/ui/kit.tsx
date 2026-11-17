import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, R, S, T } from './theme';

type Variant = keyof typeof T;

export function Text({
  v = 'body',
  dim,
  faint,
  color,
  style,
  ...rest
}: TextProps & { v?: Variant; dim?: boolean; faint?: boolean; color?: string }) {
  return (
    <RNText
      style={[T[v] as TextStyle, { color: color ?? (faint ? C.textFaint : dim ? C.textDim : C.text) }, style]}
      {...rest}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({
  children,
  gap = S.sm,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  icon,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  icon?: SymbolViewProps['name'];
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg =
    kind === 'primary' ? C.accent : kind === 'secondary' ? C.surface2 : kind === 'danger' ? '#3A1E22' : 'transparent';
  const fg = kind === 'primary' ? C.accentInk : kind === 'danger' ? C.danger : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {icon ? <SymbolView name={icon} size={small ? 14 : 18} tintColor={fg} /> : null}
      <Text v={small ? 'small' : 'h3'} color={fg}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: C.accent, borderColor: C.accent }]}>
      <Text v="small" color={selected ? C.accentInk : C.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: S.xs }}>
      {label ? (
        <Text v="small" dim>
          {label}
        </Text>
      ) : null}
      <TextInput placeholderTextColor={C.textFaint} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: S.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="h3">{title}</Text>
        {right}
      </Row>
      {children}
    </View>
  );
}

export function Icon({ name, size = 20, color = C.text }: { name: SymbolViewProps['name']; size?: number; color?: string }) {
  return <SymbolView name={name} size={size} tintColor={color} />;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: S.xl }}>
      <Text v="h3">{title}</Text>
      {body ? (
        <Text dim style={{ textAlign: 'center', marginTop: S.xs }}>
          {body}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.lg, gap: S.lg, paddingBottom: S.xxl * 2 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, gap: S.sm },
  btn: {
    flexDirection: 'row',
    gap: S.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: S.lg,
    borderRadius: R.md,
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: S.md, borderRadius: R.sm },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: S.md,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
  },
  input: {
    backgroundColor: C.surface2,
    color: C.text,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    fontSize: 16,
  },
});
