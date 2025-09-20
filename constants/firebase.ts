// Import the functions you need from the SDKs you need
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Auth with React Native AsyncStorage persistence when possible.
// This code attempts to use `firebase/auth/react-native`. If it's not
// available (types or module resolution), we fall back to `getAuth`.
import type { Auth } from 'firebase/auth';

let auth: Auth;
try {
  // Dynamic require to avoid static import/type resolution issues in web builds
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rnAuth = require('firebase/auth/react-native');
  auth = rnAuth.initializeAuth(app, {
    persistence: rnAuth.getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (e) {
  // Fallback: use getAuth for environments where react-native persistence isn't available
  // (e.g., web or missing types). getAuth will provide browser/node persistence.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getAuth: _getAuth } = require('firebase/auth');
  auth = _getAuth(app);
}

export { auth, db };

