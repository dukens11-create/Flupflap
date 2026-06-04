/**
 * SellerDashboardScreen — landing screen for sellers.
 *
 * Shows a quick-action card to open the notification feed.
 * The notification badge reflects the current unread count from
 * the shared Zustand store.
 */
import React, {useEffect} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@/types/navigation';
import {Routes} from '@/navigation/routes';
import {useNotificationStore} from '@/store/notificationStore';
import NotificationBadge from '@/components/notifications/NotificationBadge';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof Routes.SellerDashboard
>;

export default function SellerDashboardScreen({
  navigation,
}: Props): React.JSX.Element {
  const {unreadCount, isStale, refresh} = useNotificationStore();

  // Refresh notifications when the dashboard mounts or becomes stale
  useEffect(() => {
    if (isStale) {
      refresh();
    }
  }, [isStale, refresh]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Seller Dashboard</Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate(Routes.SellerNotifications)}
        accessibilityLabel="Open notifications">
        <View style={styles.cardRow}>
          <Text style={styles.cardTitle}>Notifications</Text>
          <NotificationBadge count={unreadCount} />
        </View>
        <Text style={styles.cardSubtitle}>
          {unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
            : 'No new notifications'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#666',
  },
});
