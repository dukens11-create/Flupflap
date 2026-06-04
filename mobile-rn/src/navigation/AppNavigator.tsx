/**
 * Root navigator for the FlupFlap React Native app.
 *
 * Structure:
 *   RootStack
 *   ├── Login                    (auth gate — no bottom tabs)
 *   ├── SellerDashboard
 *   ├── SellerNotifications
 *   └── SellerOrderDetail
 *
 * The navigationRef is exported so that push notification handlers
 * (running outside React) can trigger navigation actions.
 */
import React from 'react';
import {createNavigationContainerRef} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@/types/navigation';
import {Routes} from './routes';
import LoginScreen from '@/screens/auth/LoginScreen';
import SellerDashboardScreen from '@/screens/seller/SellerDashboardScreen';
import SellerNotificationsScreen from '@/screens/seller/SellerNotificationsScreen';
import SellerOrderDetailScreen from '@/screens/seller/SellerOrderDetailScreen';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator(): React.JSX.Element {
  return (
    <RootStack.Navigator
      initialRouteName={Routes.Login}
      screenOptions={{headerShown: true}}>
      <RootStack.Screen
        name={Routes.Login}
        component={LoginScreen}
        options={{headerShown: false}}
      />
      <RootStack.Screen
        name={Routes.SellerDashboard}
        component={SellerDashboardScreen}
        options={{title: 'Seller Dashboard'}}
      />
      <RootStack.Screen
        name={Routes.SellerNotifications}
        component={SellerNotificationsScreen}
        options={{title: 'Notifications'}}
      />
      <RootStack.Screen
        name={Routes.SellerOrderDetail}
        component={SellerOrderDetailScreen}
        options={{title: 'Order Detail'}}
      />
    </RootStack.Navigator>
  );
}
