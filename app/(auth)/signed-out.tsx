import { useRouter } from 'expo-router';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

export default function SignedOutScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>You have signed out</Text>
      <Text style={styles.message}>Thanks for using Tava — sign in again to continue.</Text>
      <View style={styles.button}>
        <Button title="Go to Sign In" onPress={() => router.replace('/(auth)/sign-in')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  message: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 20 },
  button: { width: '60%' },
});
