/**
 * FlupFlap React Native — entry point.
 * Push notification background handler must be registered here,
 * before any React component tree is mounted.
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {registerBackgroundMessageHandler} from './src/services/pushNotificationService';

// Register the FCM background message handler at the module level so it runs
// even when the app is in a terminated / background state.
registerBackgroundMessageHandler();

AppRegistry.registerComponent(appName, () => App);
