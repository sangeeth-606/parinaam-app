import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider, useAppTheme } from './src/theme/theme-context';

function ThemedStatusBar() {
  const { mode } = useAppTheme();
  return <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />;
}

function AppContent() {
  return (
    <>
      <ThemedStatusBar />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
