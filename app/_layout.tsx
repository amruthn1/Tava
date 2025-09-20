
import { auth } from '@/constants/firebase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // undefined = loading, null = no user, User = signed-in
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [cachedUidExists, setCachedUidExists] = useState<boolean | undefined>(undefined);
  const [redirectingToSignIn, setRedirectingToSignIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mounted) return;
      // Debug log
      console.log('[Auth] onAuthStateChanged fired, user =', firebaseUser ? firebaseUser.uid : null);
      // Set user from firebase
      setUser(firebaseUser);
      try {
        // store UID as a lightweight fallback so app can avoid showing sign-in briefly
        // Note: DO NOT remove the cachedUid here if firebase emits null transiently —
        // only write the cached UID when we actually have a firebaseUser. Explicit
        // sign-out will clear the cached UID (Profile screen handles that).
        if (firebaseUser) {
          await AsyncStorage.setItem('cachedUid', firebaseUser.uid);
        }
      } catch (e) {
        // ignore storage errors
        console.warn('AsyncStorage error caching uid', e);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Read cachedUid once on mount so we don't race with onAuthStateChanged
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('cachedUid');
        console.log('[Auth] cachedUid read on mount =', cached);
        if (!mounted) return;
        setCachedUidExists(!!cached);
      } catch (e) {
        console.warn('[Auth] error reading cachedUid', e);
        if (!mounted) return;
        setCachedUidExists(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Wait until auth finished initializing (user !== undefined)
    const doRedirect = async () => {
      if (user === undefined) return;

      // If user is null, use the cachedUidExists fallback to avoid races
      if (user === null) {
        // If we haven't yet determined whether a cached UID exists, wait.
        if (cachedUidExists === undefined) return;

        if (cachedUidExists) {
          // keep showing the app until firebase emits a user or confirms null
          return;
        }
        // Only redirect to sign-in if we're not already on an auth route
        // expo-router's Router doesn't expose pathname; use history location as fallback
        let path = '';
        try {
          path = (global as any)?.location?.pathname || '';
        } catch (e) {
          path = '';
        }

        if (!path.startsWith('/(auth)')) {
          console.log('[Auth] redirecting to sign-in (no cachedUid)');
          setRedirectingToSignIn(true);
          router.replace('/(auth)/sign-in');
        }
      }
    };

    doRedirect();
  }, [user, router]);

  if (user === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  const children = (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );

  // Dev overlay to help diagnose auth restoration issues
  // const debugOverlay = __DEV__ ? (
  //   <View style={{ position: 'absolute', top: 40, right: 12, backgroundColor: 'rgba(0,0,0,0.65)', padding: 8, borderRadius: 8, zIndex: 999 }}>
  //     <Text style={{ color: '#fff', fontSize: 11 }}>auth.user: {user ? (user as any).uid : String(user)}</Text>
  //     <Text style={{ color: '#fff', fontSize: 11 }}>cachedUidExists: {String(cachedUidExists)}</Text>
  //     <Text style={{ color: '#fff', fontSize: 11 }}>redirecting: {String(redirectingToSignIn)}</Text>
  //   </View>
  // ) : null;

  return (
    <ThemeProvider value={theme}>
      <>
        {children}
        {/* {debugOverlay} */}
      </>
    </ThemeProvider>
  );
}
