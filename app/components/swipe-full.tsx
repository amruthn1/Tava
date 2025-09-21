import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '@/constants/firebase';
import { POSTS_COLLECTION } from '@/types/post';
import { User, onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';

const { width, height } = Dimensions.get('window');

interface BuilderProfile {
  id: string;
  displayName?: string;
  email?: string | null;
  ideaTitle?: string | null;
  ideaDescription?: string | null;
  interests?: string[];
  liked?: string[];
  passedPosts?: string[];
}

export default function SwipeFull() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const currentUserId = firebaseUser?.uid;

  const [allProfiles, setAllProfiles] = useState<BuilderProfile[]>([]);
  const [authorsWithProjects, setAuthorsWithProjects] = useState<Set<string>>(new Set());
  const [userLiked, setUserLiked] = useState<Set<string>>(new Set());
  const [userDismissed, setUserDismissed] = useState<Set<string>>(new Set());
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(new Set());
  const [sessionLiked, setSessionLiked] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const list: BuilderProfile[] = snap.docs.map(d => {
        const data: any = d.data() || {};
        return {
          id: d.id,
          displayName: data.displayName,
          email: data.email ?? null,
          ideaTitle: data.ideaTitle ?? null,
          ideaDescription: data.ideaDescription ?? null,
          interests: Array.isArray(data.interests) ? data.interests : [],
          liked: Array.isArray(data.liked) ? data.liked : [],
        };
      });
      const filtered = list.filter(p => p.id !== currentUserId);
      setAllProfiles(filtered);
    });
    return () => unsub();
  }, [currentUserId]);

  // Subscribe to current user's own doc to track liked and dismissed users (when signed-in)
  useEffect(() => {
    if (!currentUserId) return;
    const ref = doc(db, 'users', currentUserId);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data: any = snap.data() || {};
        setUserLiked(new Set<string>(Array.isArray(data.liked) ? data.liked : []));
        setUserDismissed(new Set<string>(Array.isArray(data.dismissedUsers) ? data.dismissedUsers : []));
      }
    });
    return () => unsub();
  }, [currentUserId]);

  // Subscribe to projects (posts) and keep set of authors who have at least one project
  useEffect(() => {
    const unsub = onSnapshot(collection(db, POSTS_COLLECTION), snap => {
      const authors = new Set<string>();
      snap.forEach(d => {
        const data: any = d.data() || {};
        if (data.authorId) authors.add(String(data.authorId));
      });
      setAuthorsWithProjects(authors);
    });
    return () => unsub();
  }, []);

  // Derived list: only show profiles that have available projects
  const profiles = useMemo(() => {
    const dismissSet = currentUserId ? userDismissed : localDismissed;
    return allProfiles
      .filter(p => authorsWithProjects.has(p.id))
      .filter(p => !dismissSet.has(p.id))
      .filter(p => !userLiked.has(p.id))
      .filter(p => !sessionDismissed.has(p.id))
      .filter(p => !sessionLiked.has(p.id));
  }, [allProfiles, authorsWithProjects, userDismissed, userLiked, localDismissed, sessionDismissed, sessionLiked, currentUserId]);

  // Keep card index in range when profiles change
  useEffect(() => {
    if (index >= profiles.length) setIndex(0);
  }, [profiles.length, index]);

  const current = profiles[index];

  const advance = useCallback(() => setIndex(i => i + 1), []);

  const handlePass = useCallback(async () => {
    if (!current) return;
    // Optimistically hide this user in-session
    setSessionDismissed(prev => new Set(prev).add(current.id));
    if (currentUserId) {
      try {
        await updateDoc(doc(db, 'users', currentUserId), { dismissedUsers: arrayUnion(current.id) });
      } catch (e) {
        // Fallback to local set if write fails
        setLocalDismissed(prev => new Set(prev).add(current.id));
      }
    } else {
      setLocalDismissed(prev => new Set(prev).add(current.id));
    }
    advance();
  }, [advance, current, currentUserId]);

  const handleConnect = useCallback(async () => {
    if (!currentUserId || !current) return;
    // Optimistically hide this user in-session
    setSessionLiked(prev => new Set(prev).add(current.id));
    try {
      await updateDoc(doc(db, 'users', currentUserId), { liked: arrayUnion(current.id) });
      advance();
    } catch (e) {
      // If it fails, revert optimistic hide
      setSessionLiked(prev => { const next = new Set(prev); next.delete(current.id); return next; });
      Alert.alert('Error', 'Could not connect.');
    }
  }, [currentUserId, current, advance]);

  const avatarLetter = (current?.displayName || current?.email || 'U').trim()[0]?.toUpperCase() || 'U';
  const interestsText = (current?.interests && current.interests.length) ? current.interests.slice(0, 8).join(' · ') : 'No interests listed';

  return (
    <SafeAreaView style={styles.container}>
      {!current ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No more profiles</Text>
        </View>
      ) : (
        <View style={styles.cardFull}>
          {/* Header / avatar */}
          <View style={styles.topRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            <View style={{ marginLeft: 12, flexShrink: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{current.displayName || 'Builder'}</Text>
              {!!current.email && <Text style={styles.subtle} numberOfLines={1}>{current.email}</Text>}
            </View>
          </View>

          {/* Interests */}
          <View style={styles.chipsRow}>
            <Text style={styles.chipsLabel}>Interests:</Text>
            <Text style={styles.chipsText} numberOfLines={2}>{interestsText}</Text>
          </View>

          {/* Project details under interests */}
          {(!!current.ideaTitle || !!current.ideaDescription) && (
            <View style={styles.sectionCard}>
              {!!current.ideaTitle && <Text style={styles.ideaTitle}>{current.ideaTitle}</Text>}
              {!!current.ideaDescription && <Text style={styles.ideaDesc}>{current.ideaDescription}</Text>}
            </View>
          )}

          {/* (Profile navigation removed) */}

          {/* Footer actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={handlePass} style={[styles.actionPill, styles.passPill]} accessibilityLabel="Pass">
              <Text style={styles.passText}>Pass</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConnect} style={[styles.actionPill, styles.connectPill]} accessibilityLabel="Connect">
              <Text style={styles.connectText}>Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888' },
  cardFull: {
    flex: 1,
    margin: 16,
    backgroundColor: '#1b1b1b',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
  avatarText: { color: '#93c5fd', fontWeight: '800', fontSize: 26 },
  name: { color: 'white', fontSize: 20, fontWeight: '800' },
  subtle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  sectionCard: { backgroundColor: '#141414', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#222', marginBottom: 12 },
  ideaTitle: { color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  ideaDesc: { color: '#ddd', fontSize: 14, lineHeight: 20 },
  chipsRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4, marginBottom: 16, flexWrap: 'wrap' },
  chipsLabel: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  chipsText: { color: '#d1d5db', fontSize: 12, flexShrink: 1 },
  profileBtn: { alignSelf: 'flex-start', backgroundColor: '#2563eb', borderWidth: 1, borderColor: '#1d4ed8', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  profileBtnText: { color: 'white', fontWeight: '700' },
  footerRow: { flexDirection: 'row', marginTop: 'auto', gap: 12 },
  actionPill: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 40 },
  passPill: { backgroundColor: '#2a1a1a', borderWidth: 1, borderColor: '#442222' },
  connectPill: { backgroundColor: '#142a20', borderWidth: 1, borderColor: '#1f4736' },
  passText: { color: '#f87171', fontWeight: '700' },
  connectText: { color: '#34d399', fontWeight: '700' },
});
