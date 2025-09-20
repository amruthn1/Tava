import { auth } from '@/constants/firebase';
import { Colors } from '@/constants/theme';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { Alert, Image, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const isDark = colorScheme === 'dark';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.container, { backgroundColor: colors.background }]}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          <View style={[styles.formContainer, { backgroundColor: isDark ? colors.background : '#fff' }]}>
            <Image 
              source={require('@/assets/images/tava-logo.png')} 
              style={styles.logo} 
              resizeMode="contain"
            />
            <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.text }]}>Purdue Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.inputBackground : '#fff',
                  color: isDark ? colors.inputText : '#000',
                  borderColor: isDark ? colors.inputBorder : '#ddd'
                }
              ]}
              placeholder="yourname@purdue.edu"
              placeholderTextColor={isDark ? colors.inputPlaceholder : '#999'}
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.text }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.inputBackground : '#fff',
                  color: isDark ? colors.inputText : '#000',
                  borderColor: isDark ? colors.inputBorder : '#ddd'
                }
              ]}
              placeholder="••••••••"
              placeholderTextColor={isDark ? colors.inputPlaceholder : '#999'}
            />
          </View>
          
          <TouchableOpacity 
            style={[
              styles.button, 
              { 
                backgroundColor: isDark ? colors.buttonPrimary : colors.tint,
                opacity: isLoading ? 0.7 : 1
              }
            ]}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            <Text style={[styles.buttonText, { color: isDark ? colors.buttonPrimaryText : '#fff' }]}>
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.secondaryButton, { borderColor: colors.tint }]}
            onPress={() => router.push('/(auth)/sign-up')}
            disabled={isLoading}
          >
            <Text style={[styles.secondaryButtonText, { color: isDark ? colors.buttonSecondaryText : colors.tint }]}>
              Don't have an account? Sign Up
            </Text>
          </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  logo: {
    width:200,    // Adjust width here (was 150)
    height: 200,   // Adjust height here (was 100)
    alignSelf: 'center',
    marginBottom: 16,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  formContainer: {
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',  // Center children horizontally
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
    width: '100%',
    maxWidth: 300,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
    maxWidth: 300,
    alignSelf: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 20,
    padding: 12,
    alignItems: 'center',
    alignSelf: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
