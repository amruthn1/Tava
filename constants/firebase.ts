// Firebase Web SDK with React Native persistence (no react-native-firebase dependency)
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, signInAnonymously, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { loadCredentials } from './credentialStore';

// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: Constants?.expoConfig?.extra?.firebaseApiKey,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId,
  appId: Constants.expoConfig?.extra?.firebaseAppId,
  measurementId: Constants.expoConfig?.extra?.firebaseMeasurementId
};

// Initialize (or reuse) Firebase app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// ---------------------------------------------------------------------------
// Auth singleton with persistence (RN) — guarded against fast refresh
// ---------------------------------------------------------------------------
// We store the auth instance on a global symbol so re-executing this module (Metro
// fast refresh / HMR) won't attempt another initializeAuth (which causes assertions).

const globalAny = globalThis as any;

// Attempt to obtain getReactNativePersistence from main auth bundle (in some versions
// it is exported directly; earlier TypeScript d.ts may not list it, so we access via any).
let getRNPersist: ((storage: any) => any) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const authPkg = require('firebase/auth');
  if (authPkg?.getReactNativePersistence) {
  getRNPersist = authPkg.getReactNativePersistence as (s: any) => any;
  }
} catch {
  // ignore
}

// NOTE about persistence strategy:
// In this environment the official React Native persistence helper may not be bundled.
// When it's absent we fall back to a volatile in-memory auth session. To still provide a
// "stay signed in" experience across cold app launches, the app stores (email,password)
// in `expo-secure-store` after explicit sign-in/sign-up and calls `autoSignInIfNeeded()`
// on startup to reauthenticate with those credentials. This is a pragmatic workaround;
// if the official RN persistence becomes available, initializeAuth with persistence will
// handle session restoration automatically and the credential-based fallback will still
// be harmless (auth.currentUser will already be set so autoSignInIfNeeded is a no-op).

let auth: Auth;
if (!globalAny.__TAVA_AUTH__) {
  try {
    if (getRNPersist) {
      auth = initializeAuth(app, { persistence: getRNPersist(AsyncStorage) });
      console.log('[Firebase] Auth initialized with official RN persistence');
    } else {
      auth = initializeAuth(app, {}); // volatile session
      console.warn('[Firebase] RN persistence helper unavailable; using volatile auth (no cold-start restore)');
    }
  } catch (e) {
    console.warn('[Firebase] initializeAuth failed, falling back to volatile getAuth()', e);
    auth = getAuth(app);
  }
  globalAny.__TAVA_AUTH__ = auth;
} else {
  auth = globalAny.__TAVA_AUTH__ as Auth;
}

export { auth, db };

// Attempt silent credential-based sign-in if currentUser is null.
export async function autoSignInIfNeeded(): Promise<boolean> {
  if (auth.currentUser) return true;
  const creds = await loadCredentials();
  if (!creds) return false;
  try {
    await signInWithEmailAndPassword(auth, creds.email, creds.password);
    return true;
  } catch (e) {
    console.warn('[Auth] autoSignIn failed', e);
    return false;
  }
}

// Ensure we have at least an anonymous authenticated context so Firestore rules requiring auth can allow reads.
export async function ensureAtLeastAnonymousAuth(): Promise<boolean> {
  if (auth.currentUser) return true;
  try {
    await signInAnonymously(auth);
    console.log('[Auth] Anonymous sign-in successful');
    return true;
  } catch (e) {
    console.warn('[Auth] Anonymous sign-in failed', e);
    return false;
  }
}

