import { auth, db } from '@/constants/firebase';
import { POSTS_COLLECTION, Post } from '@/types/post';
import { User, onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

interface UserLite { 
  id: string; 
  displayName?: string | null; 
  email?: string | null; 
  interests?: string[];
}

export default function SwipeFull() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const currentUserId = firebaseUser?.uid;

  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, UserLite>>(new Map());
  const [userLikedPosts, setUserLikedPosts] = useState<Set<string>>(new Set());
  const [userDismissedPosts, setUserDismissedPosts] = useState<Set<string>>(new Set());
  const [localDismissedPosts, setLocalDismissedPosts] = useState<Set<string>>(new Set());
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(new Set());
  const [sessionLiked, setSessionLiked] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsub();
  }, []);

  // Subscribe to all posts
  useEffect(() => {
    const unsub = onSnapshot(collection(db, POSTS_COLLECTION), snap => {
      const posts: Post[] = [];
      
      snap.forEach(d => {
        const data: any = d.data() || {};
        if (data.authorId && data.authorId !== currentUserId) { // Exclude current user's posts
          posts.push({
            id: d.id,
            ...data,
          } as Post);
        }
      });
      
      // Sort by creation time, newest first
      posts.sort((a, b) => {
        const timeA = a.createdAt ?? 0;
        const timeB = b.createdAt ?? 0;
        return timeB - timeA;
      });
      
      setAllPosts(posts);
    });
    return () => unsub();
  }, [currentUserId]);

  // Subscribe to users for profile info
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const userMap = new Map<string, UserLite>();
      
      snap.docs.forEach(d => {
        const data: any = d.data() || {};
        userMap.set(d.id, {
          id: d.id,
          displayName: data.displayName || null,
          email: data.email ?? null,
          interests: Array.isArray(data.interests) ? data.interests : [],
        });
      });
      
      setUsersMap(userMap);
    });
    return () => unsub();
  }, []);

  // Subscribe to current user's liked and dismissed posts
  useEffect(() => {
    if (!currentUserId) return;
    const ref = doc(db, 'users', currentUserId);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data: any = snap.data() || {};
        setUserLikedPosts(new Set<string>(Array.isArray(data.likedPosts) ? data.likedPosts : []));
        setUserDismissedPosts(new Set<string>(Array.isArray(data.dismissedPosts) ? data.dismissedPosts : []));
      }
    });
    return () => unsub();
  }, [currentUserId]);

  // Derived list: filter posts based on user interactions
  const posts = useMemo(() => {
    const dismissSet = currentUserId ? userDismissedPosts : localDismissedPosts;
    
    return allPosts.filter(post => {
      // Filter out posts the user has already liked or dismissed
      if (userLikedPosts.has(post.id)) return false;
      if (dismissSet.has(post.id)) return false;
      
      // Filter out posts dismissed/liked in this session
      if (sessionDismissed.has(post.id) || sessionLiked.has(post.id)) return false;
      
      return true;
    });
  }, [allPosts, userDismissedPosts, userLikedPosts, localDismissedPosts, sessionDismissed, sessionLiked, currentUserId]);

  // Keep card index in range when posts change
  useEffect(() => {
    if (index >= posts.length) setIndex(0);
  }, [posts.length, index]);

  const currentPost = posts[index];
  const currentUser = currentPost ? usersMap.get(currentPost.authorId) : null;

  const advance = useCallback(() => setIndex(i => i + 1), []);

  const handlePass = useCallback(async () => {
    if (!currentPost) return;
    
    // Optimistically hide this post in-session
    setSessionDismissed(prev => new Set(prev).add(currentPost.id));
    
    if (currentUserId) {
      try {
        await updateDoc(doc(db, 'users', currentUserId), { 
          dismissedPosts: arrayUnion(currentPost.id)
        });
      } catch (e) {
        // Fallback to local set if write fails
        setLocalDismissedPosts(prev => new Set(prev).add(currentPost.id));
      }
    } else {
      setLocalDismissedPosts(prev => new Set(prev).add(currentPost.id));
    }
    advance();
  }, [advance, currentPost, currentUserId]);

  const handleConnect = useCallback(async () => {
    if (!currentUserId || !currentPost) return;
    // Optimistically hide this post in-session
    setSessionLiked(prev => new Set(prev).add(currentPost.id));
    try {
      await updateDoc(doc(db, 'users', currentUserId), { 
        likedPosts: arrayUnion(currentPost.id),
        liked: arrayUnion(currentPost.authorId) // Also add the user to liked users
      });
      advance();
    } catch (e) {
      // If it fails, revert optimistic hide
      setSessionLiked(prev => { const next = new Set(prev); next.delete(currentPost.id); return next; });
      Alert.alert('Error', 'Could not connect.');
    }
  }, [currentUserId, currentPost, advance]);

  const avatarLetter = (currentUser?.displayName || currentUser?.email || `User ${currentPost?.authorId?.substring(0, 8)}` || 'U').trim()[0]?.toUpperCase() || 'U';
  const interestsText = (currentUser?.interests && currentUser.interests.length) ? currentUser.interests.slice(0, 8).join(' · ') : 'No interests listed';
  const displayName = currentUser?.displayName || currentUser?.email || `User ${currentPost?.authorId?.substring(0, 8)}` || 'Builder';

  return (
    <SafeAreaView style={styles.container}>
      {!currentPost ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No more posts to explore</Text>
          <Text style={styles.debugText}>
            Check back later for new projects and posts!
          </Text>
        </View>
      ) : (
        <View style={styles.cardFull}>
          {/* Header / avatar */}
          <View style={styles.topRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            <View style={{ marginLeft: 12, flexShrink: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              {!!currentUser?.email && <Text style={styles.subtle} numberOfLines={1}>{currentUser.email}</Text>}
            </View>
          </View>

          {/* Interests */}
          <View style={styles.chipsRow}>
            <Text style={styles.chipsLabel}>Interests:</Text>
            <Text style={styles.chipsText} numberOfLines={2}>{interestsText}</Text>
          </View>

          {/* Post content */}
          <View style={styles.sectionCard}>
            {!!currentPost.title && <Text style={styles.ideaTitle}>{currentPost.title}</Text>}
            {!!currentPost.description && <Text style={styles.ideaDesc}>{currentPost.description}</Text>}
          </View>

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
  debugText: { color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center' },
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
