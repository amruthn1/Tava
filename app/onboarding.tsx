import { auth, db } from '@/constants/firebase';
import { router } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';

export default function OnboardingScreen() {
  const user = auth.currentUser;
  const uid = user?.uid;
  const [university, setUniversity] = useState('');
  const [interests, setInterests] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!uid) return;
      try {
        const ref = doc(db, 'users', uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d:any = snap.data();
          if (d.onboardingComplete) {
            router.replace('/(tabs)');
          }
        }
      } catch(e) {}
    })();
  }, [uid]);

  const handleSubmit = async () => {
    if (!uid) { Alert.alert('Not signed in'); return; }
    setLoading(true);
    try {
      const interestsArr = interests.split(',').map(s => s.trim()).filter(Boolean);
      const ref = doc(db, 'users', uid);
      // Use setDoc with merge to create if missing
      await setDoc(ref, {
        university: university.trim() || null,
        interests: interestsArr,
        linkedinUrl: linkedinUrl.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        onboardingComplete: true
      }, { merge: true });
      router.replace('/(tabs)');
    } catch (e:any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!uid) { router.replace('/(tabs)'); return; }
    try {
      await setDoc(doc(db, 'users', uid), { onboardingComplete: true }, { merge: true });
    } catch {}
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS==='ios' ? 'padding':'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Tell us more</Text>
        <Text style={styles.subtitle}>This helps others know who to connect with. You can edit later.</Text>
        <Text style={styles.label}>University</Text>
        <TextInput style={styles.input} value={university} onChangeText={setUniversity} placeholder="Your university" placeholderTextColor="#666" />
        <Text style={styles.label}>Interests (comma separated)</Text>
        <TextInput style={styles.input} value={interests} onChangeText={setInterests} placeholder="AI, Sustainability, Fintech" placeholderTextColor="#666" />
        <Text style={styles.label}>LinkedIn URL (optional)</Text>
        <TextInput style={styles.input} value={linkedinUrl} onChangeText={setLinkedinUrl} placeholder="https://www.linkedin.com/in/username" autoCapitalize='none' placeholderTextColor="#666" />
        <Text style={styles.label}>Personal Website (optional)</Text>
        <TextInput style={styles.input} value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="https://your-site.com" autoCapitalize='none' placeholderTextColor="#666" />
        <TouchableOpacity disabled={loading} style={[styles.button, loading && { opacity:0.6 }]} onPress={handleSubmit}> 
          <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Continue'}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={loading} style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0d0d0d' },
  scroll: { padding:24, paddingTop:72 },
  title: { color:'white', fontSize:26, fontWeight:'700', marginBottom:8 },
  subtitle: { color:'#aaa', fontSize:13, lineHeight:18, marginBottom:28 },
  label: { color:'#93c5fd', fontSize:12, fontWeight:'700', marginBottom:6, letterSpacing:0.5 },
  input: { backgroundColor:'#1b1b1b', borderWidth:1, borderColor:'#2a2a2a', borderRadius:10, paddingHorizontal:14, paddingVertical:12, color:'white', fontSize:14, marginBottom:18 },
  button: { backgroundColor:'#2563eb', paddingVertical:14, borderRadius:10, alignItems:'center', marginTop:4 },
  buttonText: { color:'white', fontWeight:'600', fontSize:16 },
  skipBtn: { marginTop:24, alignItems:'center' },
  skipText: { color:'#64748b', fontSize:13, fontWeight:'500' }
});
