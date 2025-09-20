import { auth } from '@/constants/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { signOut, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const router = useRouter();

  useEffect(() => {
    // Keep local copy updated if auth state changes
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      await AsyncStorage.removeItem('cachedUid');
      // Navigate to signed-out confirmation screen
      router.replace('/(auth)/signed-out');
    } catch (e: any) {
      console.error('Sign out error', e);
      Alert.alert('Sign out failed', e.message || String(e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      {user ? (
        <>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{user.email}</Text>
          <Text style={styles.label}>UID:</Text>
          <Text style={styles.value}>{user.uid}</Text>
        </>
      ) : (
        <Text style={styles.info}>No user signed in.</Text>
      )}

      <View style={styles.button}>
        <Button title="Sign Out" onPress={handleSignOut} color="#ff3b30" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'flex-start' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 14, color: '#666', marginTop: 8 },
  value: { fontSize: 16, color: '#000' },
  info: { fontSize: 16, marginVertical: 12 },
  button: { marginTop: 24, width: '50%' },
});
