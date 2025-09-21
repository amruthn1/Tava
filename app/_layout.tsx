
import { auth, autoSignInIfNeeded } from '@/constants/firebase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // undefined = loading, null = no user, User = signed-in
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [redirectingToSignIn, setRedirectingToSignIn] = useState(false);
  const [attemptedAutoSignIn, setAttemptedAutoSignIn] = useState(false);
  const [autoSignInInProgress, setAutoSignInInProgress] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mounted) return;
      // Debug log
      console.log('[Auth] onAuthStateChanged fired, user =', firebaseUser ? firebaseUser.uid : null);
      // Set user from firebase
      setUser(firebaseUser);
      // (Removed cachedUid persistence; rely on Firebase custom persistence now)
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Auth flow state machine:
    // 1. Wait for user !== undefined
    // 2. If user present -> nothing to do
    // 3. If user null and we have not attempted silent sign-in -> attempt
    // 4. After attempt (failed) and still null -> single redirect to sign-in (if not already there)
    if (user === undefined) return; // still loading initial state

    // If we already have a user, ensure flags reflect completion
    if (user) {
      if (autoSignInInProgress) setAutoSignInInProgress(false);
      if (!attemptedAutoSignIn) setAttemptedAutoSignIn(true);
      return;
    }

    // user is null here
    const doAuto = async () => {
      if (!attemptedAutoSignIn && !autoSignInInProgress) {
        setAutoSignInInProgress(true);
        const ok = await autoSignInIfNeeded();
        setAutoSignInInProgress(false);
        setAttemptedAutoSignIn(true); // mark attempt regardless of success
        if (ok) return; // auth state listener will update user shortly
      }

      // After attempt, if still null and not redirecting yet, navigate to sign-in unless already on an auth route
      if (attemptedAutoSignIn && !redirectingToSignIn && auth.currentUser == null) {
        const onAuthRoute = pathname?.startsWith('/(auth)');
        if (!onAuthRoute) {
          console.log('[Auth] redirecting to sign-in (no user after auto attempt)');
          setRedirectingToSignIn(true);
          router.replace('/(auth)/sign-in');
        }
      }
    };

    doAuto();
  }, [user, attemptedAutoSignIn, autoSignInInProgress, redirectingToSignIn, pathname, router]);

  if (user === undefined || (user === null && (!attemptedAutoSignIn || autoSignInInProgress))) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </GestureHandlerRootView>
    );
  }

  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  const children = (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="project" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
      <StatusBar style="auto" translucent={true} />
    </>
  );

  // Dev overlay to help diagnose auth restoration issues
  // const debugOverlay = __DEV__ ? (
  //   <View style={{ position: 'absolute', top: 40, right: 12, backgroundColor: 'rgba(0,0,0,0.65)', padding: 8, borderRadius: 8, zIndex: 999 }}>
  //     <Text style={{ color: '#fff', fontSize: 11 }}>auth.user: {user ? (user as any).uid : String(user)}</Text>
  //     <Text style={{ color: '#fff', fontSize: 11 }}>redirecting: {String(redirectingToSignIn)}</Text>
  //   </View>
  // ) : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={theme}>
        <>
          {children}
          {/* {debugOverlay} */}
        </>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
