import { clearCredentials } from '@/constants/credentialStore';
import { auth, db } from '@/constants/firebase';
import { POSTS_COLLECTION } from '@/types/post';
import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, onSnapshot, /* orderBy */ query, serverTimestamp, where, documentId } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Collapsible } from '@/components/ui/collapsible';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PostItem { id: string; title: string; description?: string | null; createdAt?: number; }
interface UserProfile { id: string; displayName?: string; ideaTitle?: string; ideaDescription?: string; bio?: string; email?: string | null; liked?: string[]; likedPosts?: string[]; }

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;
  const userId = user?.uid;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [likedMeProfiles, setLikedMeProfiles] = useState<UserProfile[]>([]);
  const [myLikedProfiles, setMyLikedProfiles] = useState<UserProfile[]>([]);
  const [postAuthorProfiles, setPostAuthorProfiles] = useState<UserProfile[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Subscribe to this user's posts
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, POSTS_COLLECTION),
      where('authorId', '==', userId)
    );
    const unsub = onSnapshot(q, snap => {
      const items: PostItem[] = snap.docs.map(d => {
        const data: any = d.data() || {};
        return { id: d.id, title: data.title, description: data.description, createdAt: data.createdAt?.toMillis?.() || Date.now() };
      });
      items.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
      setPosts(items);
    });
    return () => unsub();
  }, [userId]);

  // Subscribe to user profile document (if exists)
  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, 'users', userId);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data: any = snap.data() || {};
        const likedArr = Array.isArray(data.liked) ? data.liked : [];
        const likedPostsArr = Array.isArray(data.likedPosts) ? data.likedPosts : [];
        console.log('[Profile] User doc loaded: liked=', likedArr.length, 'likedPosts=', likedPostsArr.length);
        setProfile({ id: snap.id, displayName: data.displayName, ideaTitle: data.ideaTitle, ideaDescription: data.ideaDescription, bio: data.bio, email: data.email ?? null, liked: likedArr, likedPosts: likedPostsArr });
      }
    });
    return () => unsub();
  }, [userId]);

  // Subscribe to users who liked the current user; mutuals are direct connections
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'users'), where('liked', 'array-contains', userId));
    const unsub = onSnapshot(q, snap => {
      const items: UserProfile[] = snap.docs.map(d => {
        const data: any = d.data() || {};
        return { id: d.id, displayName: data.displayName, bio: data.bio, email: data.email ?? null } as UserProfile;
      });
      setLikedMeProfiles(items);
    }, err => {
      console.warn('[Profile] liked-by query failed', err);
    });
    return () => unsub();
  }, [userId]);

  // Fetch my liked user profiles (chunked by 10 due to Firestore 'in' limits)
  useEffect(() => {
    const liked = profile?.liked || [];
    if (!userId || liked.length === 0) { setMyLikedProfiles([]); return; }
    const chunks: string[][] = [];
    for (let i = 0; i < liked.length; i += 10) chunks.push(liked.slice(i, i + 10));
    const unsubs: Array<() => void> = [];
    const all: Record<string, UserProfile> = {};
    chunks.forEach(chunk => {
      const q = query(collection(db, 'users'), where(documentId(), 'in', chunk));
      const unsub = onSnapshot(q, snap => {
        snap.docs.forEach(d => {
          const data: any = d.data() || {};
          all[d.id] = { id: d.id, displayName: data.displayName, bio: data.bio, email: data.email ?? null };
        });
        // Preserve liked order roughly
        const ordered = liked.map(id => all[id]).filter(Boolean) as UserProfile[];
        setMyLikedProfiles(ordered);
      });
      unsubs.push(unsub);
    });
    return () => { unsubs.forEach(u => { try { u(); } catch {} }); };
  }, [db, userId, profile?.liked]);

  // Fetch authors of posts I've liked (to mirror Connect tab first-ring)
  useEffect(() => {
    const likedPosts = profile?.likedPosts || [];
    if (!userId || likedPosts.length === 0) { setPostAuthorProfiles([]); return; }
    const postChunks: string[][] = [];
    for (let i = 0; i < likedPosts.length; i += 10) postChunks.push(likedPosts.slice(i, i + 10));
    const postUnsubs: Array<() => void> = [];
    let authorUnsubs: Array<() => void> = [];
    const authorsMap: Record<string, UserProfile> = {};
    const authorIdsSet: Set<string> = new Set();
    // subscribe to liked posts
    postChunks.forEach(chunk => {
      const pq = query(collection(db, POSTS_COLLECTION), where(documentId(), 'in', chunk));
      const punsub = onSnapshot(pq, snap => {
        snap.docs.forEach(d => { const data: any = d.data() || {}; if (data.authorId && data.authorId !== userId) authorIdsSet.add(data.authorId); });
        const ids = Array.from(authorIdsSet);
        // resubscribe authors
        authorUnsubs.forEach(u => { try { u(); } catch {} });
        authorUnsubs = [];
        const authorChunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 10) authorChunks.push(ids.slice(i, i + 10));
        authorChunks.forEach(aChunk => {
          const uq = query(collection(db, 'users'), where(documentId(), 'in', aChunk));
          const uunsub = onSnapshot(uq, usnap => {
            usnap.docs.forEach(u => { const ud: any = u.data() || {}; authorsMap[u.id] = { id: u.id, displayName: ud.displayName, email: ud.email ?? null } as UserProfile; });
            const ordered = ids.map(id => authorsMap[id]).filter(Boolean) as UserProfile[];
            console.log('[Profile] post-author profiles updated:', ordered.length);
            setPostAuthorProfiles(ordered);
          });
          authorUnsubs.push(uunsub);
        });
      }, err => { console.warn('[Profile] posts in-query failed', err); });
      postUnsubs.push(punsub);
    });
    return () => { postUnsubs.forEach(u => { try { u(); } catch {} }); authorUnsubs.forEach(u => { try { u(); } catch {} }); };
  }, [db, userId, profile?.likedPosts]);

  // First-degree connections (one hop): union of person-liked and likedPost authors
  const mutualIdSet = useMemo(() => new Set(likedMeProfiles.map(u => u.id)), [likedMeProfiles]);
  const directConnections = useMemo(() => {
    const seen = new Set<string>();
    const combined: UserProfile[] = [];
    myLikedProfiles.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); combined.push(p); } });
    postAuthorProfiles.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); combined.push(p); } });
    console.log('[Profile] derived direct connections count:', combined.length, '(person-liked=', myLikedProfiles.length, ', liked-post-authors=', postAuthorProfiles.length, ')');
    return combined;
  }, [myLikedProfiles, postAuthorProfiles]);

  const handleSubmit = useCallback(async () => {
    if (!userId) {
      Alert.alert('Not signed in', 'Sign in to create posts.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a project title.');
      return;
    }
    try {
      setSubmitting(true);
      await addDoc(collection(db, POSTS_COLLECTION), {
        title: title.trim(),
        description: description.trim() || null,
        authorId: userId,
        createdAt: serverTimestamp(),
      });
      setTitle('');
      setDescription('');
      setShowCreateModal(false);
    } catch (e) {
      console.error('Create post failed', e);
      Alert.alert('Error', 'Failed to create post.');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, userId]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      await clearCredentials();
      Alert.alert('Signed Out', 'You have been signed out.');
    } catch (e: any) {
      Alert.alert('Sign out failed', e.message || String(e));
    }
  }, []);

  const handleDeletePost = useCallback((postId: string) => {
    if (!userId) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    Alert.alert('Delete Post', 'Are you sure you want to delete this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, POSTS_COLLECTION, postId));
          } catch (e) {
            console.warn('Delete failed', e);
            Alert.alert('Error', 'Failed to delete post.');
          }
        } }
    ]);
  }, [userId, posts]);

  const renderItem = ({ item }: { item: PostItem }) => (
    <View style={styles.postCard}>
      <View style={styles.postCardHeaderRow}>
        <Text style={styles.postTitle}>{item.title || 'Untitled'}</Text>
        <TouchableOpacity accessibilityLabel="Delete post" onPress={() => handleDeletePost(item.id)} style={styles.deletePill}>
          <Text style={styles.deletePillText}>Delete</Text>
        </TouchableOpacity>
      </View>
      {!!item.description && <Text style={styles.postDesc}>{item.description}</Text>}
      <Text style={styles.postMeta}>{new Date(item.createdAt || Date.now()).toLocaleDateString()}</Text>
    </View>
  );

  const headerContent = useMemo(() => {
    return (
      <View style={styles.headerWrapper}>
        <Text style={styles.screenTitle}>Your Profile</Text>
        {user ? (
          <Text style={styles.userMeta}>{profile?.displayName || user.email}</Text>
        ) : (
          <Text style={styles.authHint}>Sign in to create and view your posts.</Text>
        )}
        {profile?.bio && (
          <View style={styles.bioBox}>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}
        {!profile?.bio && profile?.ideaDescription && (
          <View style={styles.bioBox}>
            <Text style={styles.bioText}>{profile.ideaDescription}</Text>
          </View>
        )}
        {profile?.ideaTitle && (
          <View style={styles.ideaBox}>
            <Text style={styles.ideaTitle}>{profile.ideaTitle}</Text>
            {profile.ideaDescription && <Text style={styles.ideaDesc}>{profile.ideaDescription}</Text>}
          </View>
        )}
        {/* Direct Connections above Posts */}
        <Collapsible title={`Direct Connections (${directConnections.length})`}>
          <View style={styles.connectionsSection}>
            {directConnections.length === 0 ? (
              <Text style={styles.emptyText}>No direct connections yet.</Text>
            ) : (
              <View>
                {directConnections.map(conn => (
                  <View key={conn.id} style={styles.connCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.connName}>{conn.displayName || 'Unnamed'}</Text>
                      {!!conn.email && mutualIdSet.has(conn.id) && <Text style={styles.connSub}>{conn.email}</Text>}
                      {!mutualIdSet.has(conn.id) && <Text style={[styles.connSub,{ color:'#9ca3af' }]}>Waiting for mutual connect</Text>}
                    </View>
                    <TouchableOpacity
                      style={[styles.connActionBtn, (!conn.email || !mutualIdSet.has(conn.id)) && { opacity: 0.5 }]}
                      disabled={!conn.email || !mutualIdSet.has(conn.id)}
                      onPress={() => { try { if (conn.email) Linking.openURL(`mailto:${encodeURIComponent(conn.email)}`); } catch {} }}
                      accessibilityLabel={`Email ${conn.displayName || 'connection'}`}
                    >
                      <Text style={styles.connActionText}>Email</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Collapsible>
        <Text style={styles.sectionLabel}>Posts</Text>
      </View>
    );
  }, [user, profile, directConnections, mutualIdSet]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container,{ paddingTop: insets.top + 4 }]}>        
        {userId ? (
          <View style={{ flex:1 }}>
            <View style={{ flexShrink:0 }}>
              {headerContent}
            </View>
            <View style={styles.postsWindow}> 
              <FlatList
                data={posts}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                ListEmptyComponent={<Text style={styles.emptyText}>No posts yet. Create your first one.</Text>}
              />
            </View>
          </View>
        ) : (
          <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
            <Text style={styles.authHint}>Sign in to view profile.</Text>
          </View>
        )}
        {userId && (
          <View style={styles.bottomBar}>
            <TouchableOpacity style={[styles.bottomBtn, styles.createBtn]} onPress={() => setShowCreateModal(true)}>
              <Text style={styles.bottomBtnText}>Create Post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bottomBtn, styles.signOutBtn]} onPress={handleSignOut}>
              <Text style={styles.bottomBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
        <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
          <TouchableWithoutFeedback onPress={() => setShowCreateModal(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => { /* swallow */ }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCardWrapper}>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeaderRow}>
                      <Text style={styles.modalTitle}>Create Post</Text>
                      <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.closeBtn}><Text style={styles.closeBtnText}>✕</Text></TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Project Title"
                      placeholderTextColor="#777"
                      value={title}
                      onChangeText={setTitle}
                      returnKeyType="next"
                    />
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Description (optional)"
                      placeholderTextColor="#777"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      numberOfLines={4}
                    />
                    <TouchableOpacity disabled={submitting} style={[styles.submitButton, submitting && { opacity:0.5 }]} onPress={handleSubmit}>
                      <Text style={styles.submitButtonText}>{submitting ? 'Publishing...' : 'Publish Post'}</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0d0d0d', paddingHorizontal:20 },
  headerWrapper: { paddingTop:8 },
  screenTitle: { fontSize:22, fontWeight:'700', color:'white', marginBottom:4 },
  userMeta: { color:'#888', fontSize:12, marginBottom:12 },
  authHint: { color:'#888', fontSize:14, marginTop:12 },
  ideaBox: { backgroundColor:'#1a1a1a', padding:14, borderRadius:14, borderWidth:1, borderColor:'#2a2a2a', marginBottom:16 },
  ideaTitle: { color:'white', fontSize:16, fontWeight:'600', marginBottom:4 },
  ideaDesc: { color:'#ccc', fontSize:13, lineHeight:18 },
  createBox: { backgroundColor:'#1e1e1e', padding:16, borderRadius:16, borderWidth:1, borderColor:'#2f2f2f', marginBottom:16 },
  formLabel: { color:'#93c5fd', fontSize:12, fontWeight:'700', marginBottom:8, letterSpacing:0.5 },
  input: { backgroundColor:'#262626', borderWidth:1, borderColor:'#333', borderRadius:10, paddingHorizontal:14, paddingVertical:12, color:'white', fontSize:15, marginBottom:12 },
  textArea: { height:90, textAlignVertical:'top' },
  submitButton: { backgroundColor:'#2563eb', paddingVertical:14, borderRadius:10, alignItems:'center', marginTop:4 },
  submitButtonText: { color:'white', fontWeight:'600', fontSize:16 },
  emptyText: { color:'#555', textAlign:'center', marginBottom:16, marginTop:4 },
  postCard: { backgroundColor:'#1b1b1b', padding:16, borderRadius:14, borderWidth:1, borderColor:'#2a2a2a', marginBottom:14 },
  postTitle: { color:'white', fontSize:16, fontWeight:'600', marginBottom:6 },
  postDesc: { color:'#ccc', fontSize:14, lineHeight:18, marginBottom:8 },
  postMeta: { color:'#555', fontSize:11, marginTop:4 },
  postCardHeaderRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:4 },
  deletePill: { backgroundColor:'#3f1d1d', paddingHorizontal:12, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:'#5b2727' },
  deletePillText: { color:'#f87171', fontSize:12, fontWeight:'600' },
  signOutContainer: { position:'absolute', right:20, top:8 },
  signOutButton: { backgroundColor:'#b91c1c', paddingVertical:8, paddingHorizontal:18, borderRadius:10 },
  signOutButtonText: { color:'white', fontWeight:'600', fontSize:14 },
  fab: { position:'absolute', bottom:30, right:24, width:60, height:60, borderRadius:30, backgroundColor:'#2563eb', alignItems:'center', justifyContent:'center', shadowColor:'#000', shadowOpacity:0.3, shadowRadius:6, shadowOffset:{width:0,height:3} },
  fabPlus: { color:'white', fontSize:34, marginTop:-2 },
  bottomBar: { position:'absolute', left:0, right:0, bottom:0, flexDirection:'row', justifyContent:'space-evenly', paddingHorizontal:20, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop:12, backgroundColor:'#111111', borderTopWidth:1, borderTopColor:'#1f2937' },
  bottomBtn: { flex:1, marginHorizontal:6, paddingVertical:14, borderRadius:30, alignItems:'center', justifyContent:'center' },
  createBtn: { backgroundColor:'#2563eb' },
  signOutBtn: { backgroundColor:'#b91c1c' },
  bottomBtnText: { color:'white', fontWeight:'600', fontSize:14 },
  modalCardWrapper: { width:'100%' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.55)', alignItems:'center', justifyContent:'flex-end', padding:20 },
  modalCard: { backgroundColor:'#1e1e1e', padding:20, borderRadius:24, width:'100%', borderWidth:1, borderColor:'#333' },
  modalHeaderRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  modalTitle: { color:'white', fontSize:18, fontWeight:'600' },
  closeBtn: { padding:6 },
  closeBtnText: { color:'#999', fontSize:18 },
  bioBox: { backgroundColor:'#141414', padding:12, borderRadius:12, borderWidth:1, borderColor:'#222', marginBottom:14 },
  bioText: { color:'#ddd', fontSize:13, lineHeight:18 },
  sectionLabel: { color:'#aaa', fontSize:12, fontWeight:'600', letterSpacing:0.5, marginBottom:8, textTransform:'uppercase' },
  postsWindow: { flex:1, maxHeight:320, marginBottom:8 }
  ,connectionsSection: { backgroundColor:'#141414', padding:12, borderRadius:12, borderWidth:1, borderColor:'#222', marginBottom:12 }
  ,connCard: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'#2a2a2a' }
  ,connName: { color:'white', fontSize:15, fontWeight:'600' }
  ,connSub: { color:'#888', fontSize:12, marginTop:2 }
  ,connActionBtn: { backgroundColor:'#2563eb', paddingHorizontal:12, paddingVertical:8, borderRadius:10 }
  ,connActionText: { color:'white', fontWeight:'600' }
});
