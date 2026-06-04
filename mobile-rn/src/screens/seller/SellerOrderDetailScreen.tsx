/**
 * SellerOrderDetailScreen — shows order details for a seller purchase.
 *
 * Reached by tapping a purchase notification in the notification feed
 * or directly from a push notification deep link.
 *
 * Fetches order data from GET /api/seller/orders — filters to the
 * specific order by id from the route params.
 */
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@/types/navigation';
import {Routes} from '@/navigation/routes';
import {apiClient} from '@/services/apiClient';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof Routes.SellerOrderDetail
>;

interface OrderItem {
  id: string;
  productId: string;
  productTitle?: string | null;
  productImageUrl?: string | null;
  priceCents: number;
  shippingCents: number;
  quantity: number;
}

interface OrderDetail {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
  trackingNumber?: string | null;
  shippingCarrier?: string | null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function SellerOrderDetailScreen({
  route,
}: Props): React.JSX.Element {
  const {orderId} = route.params;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<OrderDetail[]>('/api/seller/orders');
      if (cancelled) return;

      if (!res.ok || !res.data) {
        setError(res.error ?? 'Failed to load order');
        setLoading(false);
        return;
      }

      const found = res.data.find(o => o.id === orderId) ?? null;
      if (!found) {
        setError('Order not found.');
      }
      setOrder(found);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Order not found.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Order ID</Text>
      <Text style={styles.value}>{order.id}</Text>

      <Text style={styles.sectionLabel}>Status</Text>
      <Text style={[styles.value, styles.status]}>{order.status}</Text>

      <Text style={styles.sectionLabel}>Date</Text>
      <Text style={styles.value}>{formatDate(order.createdAt)}</Text>

      <Text style={styles.sectionLabel}>Total</Text>
      <Text style={styles.value}>{formatCents(order.totalCents)}</Text>

      {order.trackingNumber ? (
        <>
          <Text style={styles.sectionLabel}>Tracking</Text>
          <Text style={styles.value}>
            {order.shippingCarrier ? `${order.shippingCarrier}: ` : ''}
            {order.trackingNumber}
          </Text>
        </>
      ) : null}

      <Text style={[styles.sectionLabel, styles.itemsLabel]}>Items</Text>
      {order.items.map(item => (
        <View key={item.id} style={styles.itemCard}>
          <Text style={styles.itemTitle}>
            {item.productTitle ?? 'Product'}
          </Text>
          <Text style={styles.itemMeta}>
            Qty: {item.quantity} · {formatCents(item.priceCents)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 2,
  },
  itemsLabel: {
    marginTop: 24,
  },
  value: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  status: {
    fontWeight: '600',
    color: '#16a34a',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 13,
    color: '#555',
  },
});
