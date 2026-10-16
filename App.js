import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { AppProvider, NavProvider, UiProvider, useApp } from './src/lib/app';
import { NotifProvider } from './src/lib/notifications';
import AnimatedSplash from './src/components/AnimatedSplash';
import Login from './src/screens/Login';
import Shell from './src/components/Shell';
import { C } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Colours Android's system navigation bar (the strip under the app): yellow on splash, pale on login, navy inside the app. */
function NavBarColor({ splashDone }) {
  const { profile } = useApp();
  useEffect(() => {
    const inApp = splashDone && !!profile;
    const bg = !splashDone ? C.splash : inApp ? C.primary : C.bg;
    try {
      NavigationBar.setBackgroundColorAsync(bg).catch(() => {});
      NavigationBar.setButtonStyleAsync(inApp ? 'light' : 'dark').catch(() => {});
    } catch (_) {}
  }, [splashDone, profile?.id]);
  return null;
}

function Root() {
  const { profile, booting, isStudent, isAdmin } = useApp();
  if (booting) return <View style={{ flex: 1, backgroundColor: C.splash }} />;
  if (!profile) return <Login />;
  // key on the user so the nav stack resets on every login/logout
  return (
    <NavProvider key={profile.id} initial={isStudent ? 'dashboard' : isAdmin ? 'admin-dashboard' : 'teacher-dashboard'}>
      <NotifProvider>
        <Shell />
      </NotifProvider>
    </NavProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold });
  const [sessionReady, setSessionReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // Hide the native splash as soon as the animated one (same colour + same logo) can take over.
  const onLayout = useCallback(() => { if (fontsLoaded) SplashScreen.hideAsync().catch(() => {}); }, [fontsLoaded]);
  useEffect(() => { onLayout(); }, [onLayout]);

  // portrait everywhere; only the lecture player unlocks rotation
  useEffect(() => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => { setSessionReady(true); }, 9000); return () => clearTimeout(t); }, []);

  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <UiProvider>
        <AppProvider onReady={() => setSessionReady(true)}>
          <View style={{ flex: 1, backgroundColor: C.bg }} onLayout={onLayout}>
            <NavBarColor splashDone={splashDone} />
            <Root />
            {!splashDone && <AnimatedSplash ready={sessionReady} onDone={() => setSplashDone(true)} />}
          </View>
        </AppProvider>
      </UiProvider>
    </SafeAreaProvider>
  );
}
