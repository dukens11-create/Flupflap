/**
 * FlupFlap React Native — root component.
 *
 * Sets up navigation and push notification foreground/tap handlers
 * so they are active for the full app lifecycle.
 */
import React, {useEffect} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AppNavigator, {navigationRef} from './src/navigation/AppNavigator';
import {
  setupForegroundHandler,
  setupNotificationOpenedHandler,
  requestNotificationPermission,
} from './src/services/pushNotificationService';

export default function App(): React.JSX.Element {
  useEffect(() => {
    // Request permission on iOS (Android 13+ handled in manifest)
    requestNotificationPermission();

    // Handle push taps when app is in foreground
    const unsubForeground = setupForegroundHandler();

    // Handle taps that open the app from background/quit state
    const unsubOpened = setupNotificationOpenedHandler(navigationRef);

    return () => {
      unsubForeground();
      unsubOpened();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
