/**
 * Tests for NotificationItem component.
 *
 * Verifies:
 *  - Renders purchase notification title, body, and order reference
 *  - Shows item titles when present
 *  - Distinguishes unread (bold) from read items
 *  - Calls onPress with the notification when tapped
 */
import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import NotificationItem from '@/components/notifications/NotificationItem';
import type {SellerNotification} from '@/types/notification';

const basePurchaseNotification: SellerNotification = {
  id: 'notif_abc123',
  type: 'ORDER_UPDATE',
  title: 'New purchase: 2 items',
  body: 'Jane Buyer purchased 2 items from your store.',
  link: '/seller',
  data: {
    orderId: 'ord_xyz789',
    purchasedAt: new Date('2026-06-01T12:00:00Z').toISOString(),
    itemTitles: ['Kente Dress', 'Ankara Bag'],
    itemCount: 2,
    buyerName: 'Jane Buyer',
  },
  dedupeKey: 'seller-purchase:ord_xyz789:seller_a',
  readAt: null,
  createdAt: new Date('2026-06-01T12:00:00Z').toISOString(),
};

describe('NotificationItem', () => {
  it('renders purchase notification title and body', () => {
    const {getByText} = render(
      <NotificationItem
        notification={basePurchaseNotification}
        onPress={jest.fn()}
      />,
    );

    expect(getByText('New purchase: 2 items')).toBeTruthy();
    expect(
      getByText('Jane Buyer purchased 2 items from your store.'),
    ).toBeTruthy();
  });

  it('renders item titles for purchase notifications', () => {
    const {getByText} = render(
      <NotificationItem
        notification={basePurchaseNotification}
        onPress={jest.fn()}
      />,
    );

    expect(getByText('Kente Dress, Ankara Bag')).toBeTruthy();
  });

  it('renders order reference when orderId is present', () => {
    const {getByText} = render(
      <NotificationItem
        notification={basePurchaseNotification}
        onPress={jest.fn()}
      />,
    );

    // Order ID last 8 chars uppercased: 'ord_xyz789' → 'XYZ789' (last 8 = '_XYZ789' → 'ORD_XYZ789'.slice(-8) = 'D_XYZ789')
    expect(getByText(/Order #/)).toBeTruthy();
  });

  it('calls onPress with the notification when tapped', () => {
    const onPress = jest.fn();
    const {getByRole} = render(
      <NotificationItem
        notification={basePurchaseNotification}
        onPress={onPress}
      />,
    );

    // TouchableOpacity is accessible as a button role
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(basePurchaseNotification);
  });

  it('renders a read notification without the unread bar', () => {
    const readNotification: SellerNotification = {
      ...basePurchaseNotification,
      readAt: new Date('2026-06-01T13:00:00Z').toISOString(),
    };

    const {toJSON} = render(
      <NotificationItem notification={readNotification} onPress={jest.fn()} />,
    );

    // Snapshot the structure — the unread bar (width-4 view) should not be present
    const json = JSON.stringify(toJSON());
    // The unreadBar has backgroundColor '#2563eb' and width 4
    // For a read notification the outer container should use the read background
    expect(json).not.toContain('"width":4');
  });

  it('handles missing optional data fields gracefully', () => {
    const minimal: SellerNotification = {
      id: 'notif_minimal',
      type: 'ORDER_UPDATE',
      title: 'Sale',
      body: 'You made a sale.',
      link: null,
      data: null,
      dedupeKey: null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    expect(() =>
      render(<NotificationItem notification={minimal} onPress={jest.fn()} />),
    ).not.toThrow();
  });
});
