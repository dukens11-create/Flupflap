/**
 * NotificationBadge — small circular badge showing an unread count.
 *
 * Renders nothing when count is 0 so callers don't need to guard.
 * Caps display at 99+ to avoid overflow.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

interface Props {
  count: number;
  /** Optional background colour override. Defaults to brand blue. */
  color?: string;
}

export default function NotificationBadge({
  count,
  color,
}: Props): React.JSX.Element | null {
  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);
  const wide = count > 9;

  return (
    <View
      style={[
        styles.badge,
        wide && styles.wide,
        color ? {backgroundColor: color} : undefined,
      ]}
      accessibilityLabel={`${count} unread notification${count === 1 ? '' : 's'}`}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  wide: {
    borderRadius: 10,
  },
  text: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
