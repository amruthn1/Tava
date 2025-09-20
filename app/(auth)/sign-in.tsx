import { auth } from '@/constants/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, TextInput, View } from 'react-native';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async () => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // cache uid so layout can avoid transient redirect
      try {
        await AsyncStorage.setItem('cachedUid', cred.user.uid);
      } catch (e) {
        console.warn('Failed to cache uid after sign-in', e);
      }
      router.replace('/(tabs)'); // Navigate to main app
    } catch (error: any) {
      Alert.alert('Login failed', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Purdue Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />
      <Button title="Sign In" onPress={handleSignIn} />
      <Button title="Sign Up" onPress={() => router.push('/(auth)/sign-up')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 8,
    backgroundColor: 'white',
  },
});
