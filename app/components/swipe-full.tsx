import { auth, db } from '@/constants/firebase';
import { POSTS_COLLECTION, Post } from '@/types/post';
import { User, onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

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

  // Animation values for swipe gestures (stable via refs so they persist across renders)
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

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

  // Reset animation when card changes
  useEffect(() => {
    translateX.setValue(0);
    opacity.setValue(1);
  }, [index]);

  const currentPost = posts[index];
  const currentUser = currentPost ? usersMap.get(currentPost.authorId) : null;

  const advance = useCallback(() => {
    setIndex(i => i + 1);
    // Reset animations for next card
    setTimeout(() => {
      translateX.setValue(0);
      opacity.setValue(1);
    }, 50);
  }, []);

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

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: false }
  );

  const onHandlerStateChange = useCallback(
    (event: any) => {
      if (event.nativeEvent.state === State.END) {
        const { translationX: tx, velocityX } = event.nativeEvent;
        const swipeThreshold = width * 0.3; // 30% of screen width
        const fastSwipeThreshold = 500; // velocity threshold for fast swipes

        const shouldSwipeRight = tx > swipeThreshold || (tx > 50 && velocityX > fastSwipeThreshold);
        const shouldSwipeLeft = tx < -swipeThreshold || (tx < -50 && velocityX < -fastSwipeThreshold);

        if (shouldSwipeRight) {
          // Swipe right - Connect
          Animated.parallel([
            Animated.timing(translateX, { toValue: width, duration: 200, useNativeDriver: false }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: false }),
          ]).start(() => handleConnect());
        } else if (shouldSwipeLeft) {
          // Swipe left - Pass
          Animated.parallel([
            Animated.timing(translateX, { toValue: -width, duration: 200, useNativeDriver: false }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: false }),
          ]).start(() => handlePass());
        } else {
          // Snap back to center
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: false }),
            Animated.spring(opacity, { toValue: 1, useNativeDriver: false }),
          ]).start();
        }
      } else if (event.nativeEvent.state === State.ACTIVE) {
        // Update opacity based on distance from center
        const opacityValue = 1 - Math.abs(event.nativeEvent.translationX) / (width * 0.7);
        opacity.setValue(Math.max(0.3, opacityValue));
      }
    },
    [handleConnect, handlePass]
  );

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
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View 
            style={[
              styles.cardFull,
              {
                transform: [
                  { translateX },
                  { rotate: translateX.interpolate({
                      inputRange: [-width, 0, width],
                      outputRange: ['-15deg', '0deg', '15deg'],
                      extrapolate: 'clamp'
                    })
                  }
                ],
                opacity,
                backgroundColor: translateX.interpolate({
                  inputRange: [-width * 0.3, 0, width * 0.3],
                  outputRange: ['rgba(248, 113, 113, 0.3)', '#1b1b1b', 'rgba(52, 211, 153, 0.3)'],
                  extrapolate: 'clamp',
                }),
                borderColor: translateX.interpolate({
                  inputRange: [-width * 0.3, 0, width * 0.3],
                  outputRange: ['rgba(248, 113, 113, 0.8)', '#2a2a2a', 'rgba(52, 211, 153, 0.8)'],
                  extrapolate: 'clamp',
                }),
              }
            ]}
          >
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
            {!!currentPost.createdAt && (
              <Text style={styles.cardDate}>
                Created: {new Date(currentPost.createdAt).toLocaleDateString()}
              </Text>
            )}
          </View>

          {/* Skills and Person Type sections - matching search format */}
          <View style={styles.cardDetails}>
            <View style={styles.skillsContainer}>
              <Text style={styles.fieldLabel}>Skills Required:</Text>
              <Text style={styles.fieldValue}>
                {currentPost.skillsets && currentPost.skillsets.length > 0 
                  ? currentPost.skillsets.join(' • ') 
                  : 'No specific skills required'
                }
              </Text>
            </View>
            <View style={styles.personTypeContainer}>
              <Text style={styles.fieldLabel}>Looking for:</Text>
              <Text style={styles.fieldValue}>{currentPost.personType || 'Any role'}</Text>
            </View>
          </View>            {/* Swipe indicators */}
            <Animated.View style={[
              styles.swipeIndicator,
              styles.passIndicator,
              {
                opacity: translateX.interpolate({
                  inputRange: [-width * 0.5, 0],
                  outputRange: [1, 0],
                  extrapolate: 'clamp',
                }),
                transform: [{
                  scale: translateX.interpolate({
                    inputRange: [-width * 0.5, 0],
                    outputRange: [1, 0.7],
                    extrapolate: 'clamp',
                  })
                }]
              }
            ]}>
              <Text style={styles.passIndicatorText}>PASS</Text>
            </Animated.View>

            <Animated.View style={[
              styles.swipeIndicator,
              styles.connectIndicator,
              {
                opacity: translateX.interpolate({
                  inputRange: [0, width * 0.5],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
                transform: [{
                  scale: translateX.interpolate({
                    inputRange: [0, width * 0.5],
                    outputRange: [0.7, 1],
                    extrapolate: 'clamp',
                  })
                }]
              }
            ]}>
              <Text style={styles.connectIndicatorText}>CONNECT</Text>
            </Animated.View>            {/* Footer actions */}
            <View style={styles.footerRow}>
              <TouchableOpacity onPress={handlePass} style={[styles.actionPill, styles.passPill]} accessibilityLabel="Pass">
                <Text style={styles.passText}>Pass</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConnect} style={[styles.actionPill, styles.connectPill]} accessibilityLabel="Connect">
                <Text style={styles.connectText}>Connect</Text>
              </TouchableOpacity>
            </View>
            
            {/* Swipe hint */}
            <Text style={styles.swipeHint}>Swipe left to pass • Swipe right to connect</Text>
          </Animated.View>
        </PanGestureHandler>
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
  // Swipe indicator styles
  swipeIndicator: {
    position: 'absolute',
    top: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    height: 50,
    borderRadius: 25,
    transform: [{ translateY: -25 }],
    zIndex: 10,
  },
  passIndicator: {
    left: 30,
    backgroundColor: 'rgba(248, 113, 113, 0.9)',
  },
  connectIndicator: {
    right: 30,
    backgroundColor: 'rgba(52, 211, 153, 0.9)',
  },
  passIndicatorText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
  },
  connectIndicatorText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
  },
  swipeHint: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.7,
  },
  // Additional styles to match search format
  cardDate: { 
    color: '#6b7280', 
    fontSize: 11, 
    marginTop: 8 
  },
  cardDetails: {
    gap: 8,
    marginTop: 12,
  },
  skillsContainer: {
    backgroundColor: '#141414',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  personTypeContainer: {
    backgroundColor: '#141414',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  fieldLabel: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fieldValue: {
    color: '#e5e7eb',
    fontSize: 12,
    lineHeight: 16,
  },
});
