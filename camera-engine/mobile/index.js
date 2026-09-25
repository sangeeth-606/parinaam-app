import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go, Expo Dev Client, or in a bare native build,
// the environment is set up appropriately
registerRootComponent(App);
