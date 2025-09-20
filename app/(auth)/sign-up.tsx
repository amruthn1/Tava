import { auth } from '@/constants/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { Alert, Button, StyleSheet, TextInput, View } from 'react-native';

function isPurdueEmail(email: string) {
  return /@purdue\.edu$/i.test(email.trim());
}

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSignUp = async () => {
    if (!isPurdueEmail(email)) {
      Alert.alert('Invalid Email', 'You must use a valid @purdue.edu email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      try {
        await AsyncStorage.setItem('cachedUid', cred.user.uid);
      } catch (e) {
        console.warn('Failed to cache uid after sign-up', e);
      }
      router.replace('/(tabs)'); // Navigate to main app
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message);
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
      <TextInput
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        style={styles.input}
      />
      <Button title="Sign Up" onPress={handleSignUp} />
      <Button title="Back to Sign In" onPress={() => router.replace('/(auth)/sign-in')} />
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
