/**
 * NotificationItem — renders a single seller notification in the feed.
 *
 * Visually distinguishes unread (bold, accent left-border) from read items.
 * For purchase notifications it shows the item titles, order reference,
 * and formatted purchase time.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {SellerNotification, SellerPurchaseNotificationData} from '@/types/notification';

interface Props {
  notification: SellerNotification;
  onPress: (notification: SellerNotification) => void;
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function isPurchaseData(
  data: SellerNotification['data'],
): data is SellerPurchaseNotificationData {
  return (
    data !== null &&
    typeof data === 'object' &&
    ('orderId' in data || 'itemTitles' in data)
  );
}

export default function NotificationItem({
  notification,
  onPress,
}: Props): React.JSX.Element {
  const isUnread = !notification.readAt;
  const purchaseData = isPurchaseData(notification.data)
    ? notification.data
    : null;

  return (
    <TouchableOpacity
      style={[styles.container, isUnread && styles.unread]}
      onPress={() => onPress(notification)}
      accessibilityLabel={notification.title}
      accessibilityHint="Tap to view details">
      {isUnread && <View style={styles.unreadBar} />}

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.time}>
            {formatRelativeTime(notification.createdAt)}
          </Text>
        </View>

        <Text style={styles.body} numberOfLines={2}>
          {notification.body}
        </Text>

        {purchaseData?.orderId ? (
          <Text style={styles.meta}>
            Order #{purchaseData.orderId.slice(-8).toUpperCase()}
            {purchaseData.purchasedAt
              ? ` · ${formatRelativeTime(purchaseData.purchasedAt)}`
              : ''}
          </Text>
        ) : null}

        {purchaseData?.itemTitles && purchaseData.itemTitles.length > 0 ? (
          <Text style={styles.items} numberOfLines={1}>
            {purchaseData.itemTitles.join(', ')}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  unread: {
    backgroundColor: '#eff6ff',
  },
  unreadBar: {
    width: 4,
    backgroundColor: '#2563eb',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  titleUnread: {
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    color: '#999',
    flexShrink: 0,
  },
  body: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
    lineHeight: 18,
  },
  meta: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  items: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 2,
  },
});
