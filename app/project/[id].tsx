import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth, db } from '@/constants/firebase';
import { POSTS_COLLECTION, Post } from '@/types/post';
import { User, onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

const { width } = Dimensions.get('window');

interface UserLite { id: string; displayName?: string | null; email?: string | null; interests?: string[] }

export default function ProjectDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const postId = useMemo(() => (Array.isArray(params?.id) ? params.id[0] : params?.id) || '', [params]);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const currentUserId = firebaseUser?.uid;

  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<UserLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLiked, setUserLiked] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsub();
  }, []);

  // Load the post and author info
  useEffect(() => {
    let mounted = true;
    if (!postId) return;
    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, POSTS_COLLECTION, postId));
        if (!snap.exists()) {
          if (mounted) setPost(null);
          setLoading(false);
          return;
        }
        const data: any = snap.data() || {};
        const loaded: Post = {
          id: snap.id,
          authorId: String(data.authorId),
          title: String(data.title || ''),
          description: data.description ? String(data.description) : undefined,
          createdAt: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : (data.createdAt ?? Date.now()),
        };
        if (mounted) setPost(loaded);
        // fetch author
        if (loaded.authorId) {
          const au = await getDoc(doc(db, 'users', loaded.authorId));
          if (au.exists() && mounted) {
            const d: any = au.data() || {};
            setAuthor({ id: au.id, displayName: d.displayName ?? null, email: d.email ?? null, interests: Array.isArray(d.interests) ? d.interests : [] });
          }
        }
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [postId]);

  // Subscribe to current user liked for connect state
  useEffect(() => {
    if (!currentUserId) return;
    const ref = doc(db, 'users', currentUserId);
    const unsub = onSnapshot(ref, s => {
      if (!s.exists()) return;
      const d: any = s.data() || {};
      setUserLiked(new Set<string>(Array.isArray(d.liked) ? d.liked : []));
    });
    return () => unsub();
  }, [currentUserId]);

  const alreadyConnected = !!(author && userLiked.has(author.id));

  const handleConnect = async () => {
    if (!author) return;
    if (!currentUserId) {
      Alert.alert('Sign in required', 'Please sign in to connect.');
      return;
    }
    try {
      setConnecting(true);
      await updateDoc(doc(db, 'users', currentUserId), { liked: arrayUnion(author.id) });
      Alert.alert('Connected', `You connected with ${author.displayName || author.email || 'this builder'}.`);
    } catch (e) {
      Alert.alert('Error', 'Could not connect.');
    } finally {
      setConnecting(false);
    }
  };

  const avatarLetter = (author?.displayName || author?.email || 'U').trim()[0]?.toUpperCase() || 'U';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={{ color: 'white', fontSize: 16 }}>{'‹ Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Project</Text>
        <View style={{ width: 64 }} />
      </View>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#60a5fa" />
        </View>
      ) : !post ? (
        <View style={styles.loadingWrap}>
          <Text style={{ color: '#9CA3AF' }}>Project not found.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {/* Author */}
          <View style={styles.topRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{avatarLetter}</Text></View>
            <View style={{ marginLeft: 12, flexShrink: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{author?.displayName || 'Builder'}</Text>
              {!!author?.email && <Text style={styles.subtle} numberOfLines={1}>{author.email}</Text>}
              {!!author?.interests?.length && (
                <Text style={styles.interests} numberOfLines={2}>{author.interests.slice(0, 8).join(' · ')}</Text>
              )}
            </View>
          </View>

          {/* Project */}
          <View style={styles.sectionCard}>
            <Text style={styles.projectTitle}>{post.title || 'Untitled Project'}</Text>
            {!!post.description && <Text style={styles.projectDesc}>{post.description}</Text>}
            <Text style={styles.meta}>Created {new Date(post.createdAt).toLocaleDateString()}</Text>
          </View>

          {/* Connect */}
          <TouchableOpacity
            onPress={handleConnect}
            disabled={alreadyConnected || connecting}
            style={[styles.connectBtn, (alreadyConnected || connecting) && styles.connectBtnDisabled]}
          >
            <Text style={styles.connectText}>{alreadyConnected ? 'Connected' : (connecting ? 'Connecting…' : 'Connect')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d0d0d' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1f2937'
  },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
  backBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 12 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
  avatarText: { color: '#93c5fd', fontWeight: '800', fontSize: 26 },
  name: { color: 'white', fontSize: 20, fontWeight: '800' },
  subtle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  interests: { color: '#d1d5db', fontSize: 12, marginTop: 4 },

  sectionCard: { backgroundColor: '#1b1b1b', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 14, padding: 14, marginTop: 8 },
  projectTitle: { color: 'white', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  projectDesc: { color: '#d1d5db', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  meta: { color: '#6b7280', fontSize: 11 },

  connectBtn: { marginTop: 16, alignSelf: 'flex-start', backgroundColor: '#2563eb', borderWidth: 1, borderColor: '#1d4ed8', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
  connectBtnDisabled: { backgroundColor: '#1f2f4b', borderColor: '#1f2f4b' },
  connectText: { color: 'white', fontWeight: '700' },
});
