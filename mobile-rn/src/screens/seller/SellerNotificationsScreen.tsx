/**
 * SellerNotificationsScreen — in-app notification feed for sellers.
 *
 * Features:
 *  - Fetches notifications from the Zustand store (backed by GET /api/notifications)
 *  - Pull-to-refresh
 *  - Marks a notification as read when tapped
 *  - "Mark all read" header button when there are unread items
 *  - Deep-links into SellerOrderDetailScreen for purchase notifications
 *  - Displays unread/read visual distinction on each item
 */
import React, {useCallback, useEffect, useLayoutEffect} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@/types/navigation';
import type {SellerNotification} from '@/types/notification';
import {Routes} from '@/navigation/routes';
import {useNotificationStore} from '@/store/notificationStore';
import NotificationItem from '@/components/notifications/NotificationItem';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof Routes.SellerNotifications
>;

export default function SellerNotificationsScreen({
  navigation,
}: Props): React.JSX.Element {
  const {notifications, unreadCount, isLoading, error, refresh, markRead, markAllRead} =
    useNotificationStore();

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Add "Mark all read" button to header when there are unread items
  useLayoutEffect(() => {
    if (unreadCount === 0) {
      navigation.setOptions({headerRight: undefined});
      return;
    }
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={markAllRead} accessibilityLabel="Mark all as read">
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, unreadCount, markAllRead]);

  const handlePress = useCallback(
    (item: SellerNotification) => {
      // Mark as read
      if (!item.readAt) {
        markRead([item.id]);
      }

      // Navigate to order detail if this is a purchase notification
      const data = item.data;
      if (
        item.type === 'ORDER_UPDATE' &&
        data !== null &&
        typeof data === 'object' &&
        'orderId' in data &&
        typeof data['orderId'] === 'string'
      ) {
        navigation.navigate(Routes.SellerOrderDetail, {
          orderId: data['orderId'] as string,
        });
      }
    },
    [markRead, navigation],
  );

  if (isLoading && notifications.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList<SellerNotification>
      data={notifications}
      keyExtractor={item => item.id}
      renderItem={({item}) => (
        <NotificationItem notification={item} onPress={handlePress} />
      )}
      refreshing={isLoading}
      onRefresh={refresh}
      contentContainerStyle={
        notifications.length === 0 ? styles.emptyContainer : styles.list
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No notifications yet.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyContainer: {
    flex: 1,
  },
  list: {
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  markAllText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
});
