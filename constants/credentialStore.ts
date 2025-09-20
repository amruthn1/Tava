import * as SecureStore from 'expo-secure-store';

const EMAIL_KEY = 'tava_auth_email_v1';
const PASS_KEY = 'tava_auth_pass_v1';

export async function saveCredentials(email: string, password: string) {
  try {
    await SecureStore.setItemAsync(EMAIL_KEY, email);
    await SecureStore.setItemAsync(PASS_KEY, password);
  } catch (e) {
    console.warn('[CredStore] Failed to save credentials', e);
  }
}

export async function loadCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    const email = await SecureStore.getItemAsync(EMAIL_KEY);
    const password = await SecureStore.getItemAsync(PASS_KEY);
    if (email && password) return { email, password };
    return null;
  } catch (e) {
    console.warn('[CredStore] Failed to load credentials', e);
    return null;
  }
}

export async function clearCredentials() {
  try {
    await SecureStore.deleteItemAsync(EMAIL_KEY);
    await SecureStore.deleteItemAsync(PASS_KEY);
  } catch (e) {
    console.warn('[CredStore] Failed to clear credentials', e);
  }
}
