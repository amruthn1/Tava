import { clearCredentials } from '@/constants/credentialStore';
import { auth, db } from '@/constants/firebase';
import { POSTS_COLLECTION } from '@/types/post';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, onSnapshot, /* orderBy */ query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PostItem { id: string; title: string; description?: string | null; createdAt?: number; }
interface UserProfile { id: string; displayName?: string; ideaTitle?: string; ideaDescription?: string; bio?: string; email?: string | null; liked?: string[]; likedPosts?: string[]; university?: string | null; interests?: string[]; linkedinUrl?: string | null; websiteUrl?: string | null; onboardingComplete?: boolean; }

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;
  const userId = user?.uid;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [personType, setPersonType] = useState('');
  const [peopleNeeded, setPeopleNeeded] = useState('');
  const [skillsets, setSkillsets] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  // Edit profile form state
  const [displayName, setDisplayName] = useState('');
  const [university, setUniversity] = useState('');
  const [interests, setInterests] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  // Optional location for new post
  const [attachLocation, setAttachLocation] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ latitude:number; longitude:number } | null>(null);
  const [locFetching, setLocFetching] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  
  const personTypes = [
    { label: 'Builder', value: 'builder' },
    { label: 'Mentor', value: 'mentor' },
    { label: 'Investor', value: 'investor' },
    { label: 'Designer', value: 'designer' },
    { label: 'Developer', value: 'developer' },
    { label: 'Other', value: 'other' },
  ];

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

  // Subscribe to user profile document (if exists) & guard onboarding
  useEffect(() => {
    if (!userId) return;
    const ref = doc(db, 'users', userId);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data: any = snap.data() || {};
        const likedArr = Array.isArray(data.liked) ? data.liked : [];
        const likedPostsArr = Array.isArray(data.likedPosts) ? data.likedPosts : [];
        console.log('[Profile] User doc loaded: liked=', likedArr.length, 'likedPosts=', likedPostsArr.length);
        const prof: UserProfile = { id: snap.id, displayName: data.displayName, ideaTitle: data.ideaTitle, ideaDescription: data.ideaDescription, bio: data.bio, email: data.email ?? null, liked: likedArr, likedPosts: likedPostsArr, university: data.university ?? null, interests: Array.isArray(data.interests) ? data.interests : [], linkedinUrl: data.linkedinUrl ?? null, websiteUrl: data.websiteUrl ?? null, onboardingComplete: !!data.onboardingComplete };
        setProfile(prof);
        setDisplayName(prof.displayName || '');
        setUniversity(prof.university || '');
        setInterests((prof.interests || []).join(', '));
        setLinkedinUrl(prof.linkedinUrl || '');
        setWebsiteUrl(prof.websiteUrl || '');
        if (!prof.onboardingComplete) {
          router.replace('/onboarding');
        }
      } else {
        // Auto-create a minimal user document if missing to avoid update/set races elsewhere
        console.log('[Profile] User doc missing; auto-creating base document');
        setDoc(ref, { email: auth.currentUser?.email || null, onboardingComplete: false, createdAt: serverTimestamp() }, { merge: true }).catch(e => {
          console.warn('[Profile] Failed to auto-create user doc', e);
        });
      }
    });
    return () => unsub();
  }, [userId]);


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
      let locationData: { latitude: number; longitude: number } | undefined;
      if (attachLocation && currentCoords) {
        locationData = currentCoords;
      }
      
      const postData: any = {
        title: title.trim(),
        description: description.trim() || null,
        authorId: userId,
        createdAt: serverTimestamp(),
        ...(locationData ? { 
          location: {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            ...(locationLabel ? { label: locationLabel } : {})
          } 
        } : {}),
        ...(personType ? { personType } : {}),
        ...(peopleNeeded ? { peopleNeeded: parseInt(peopleNeeded, 10) } : {}),
        ...(skillsets ? { 
          skillsets: skillsets
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        } : {})
      };
      
      await addDoc(collection(db, POSTS_COLLECTION), postData);
      
      // Reset form
      setTitle('');
      setDescription('');
      setPersonType('');
      setPeopleNeeded('');
      setSkillsets('');
      setAttachLocation(false);
      setCurrentCoords(null);
      setLocationLabel(null);
      setShowCreateModal(false);
    } catch (e) {
      console.error('Create post failed', e);
      Alert.alert('Error', 'Failed to create post.');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, userId, attachLocation, currentCoords, personType, peopleNeeded, skillsets, locationLabel]);

  const fetchCurrentLocation = useCallback(async () => {
    try {
      setLocError(null);
      setLocFetching(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError('Permission denied');
        setAttachLocation(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCurrentCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      // Reverse geocode for human readable label
      try {
        const results = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        if (results && results.length > 0) {
          const r = results[0];
          const parts = [r.name || r.streetNumber, r.street, r.city, r.region].filter(Boolean);
          const label = parts.slice(0,3).join(', ') || r.city || r.region || 'Current Location';
          setLocationLabel(label);
        } else {
          setLocationLabel('Current Location');
        }
      } catch (geoErr:any) {
        console.warn('Reverse geocode failed', geoErr);
        setLocationLabel('Current Location');
      }
    } catch (e:any) {
      setLocError(e.message || 'Failed to get location');
      setAttachLocation(false);
    } finally {
      setLocFetching(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    Alert.alert('Sign Out','Are you sure you want to sign out?',[
      { text:'Cancel', style:'cancel' },
      { text:'Sign Out', style:'destructive', onPress: async () => {
          try {
            await signOut(auth);
            await clearCredentials();
          } catch (e:any) {
            Alert.alert('Sign out failed', e.message || String(e));
          }
      }}
    ]);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!userId) return;
    try {
      setSavingProfile(true);
      const interestsArr = interests.split(',').map(s => s.trim()).filter(Boolean);
      await setDoc(doc(db,'users',userId), {
        displayName: displayName.trim() || null,
        university: university.trim() || null,
        interests: interestsArr,
        linkedinUrl: linkedinUrl.trim() || null,
        websiteUrl: websiteUrl.trim() || null
      }, { merge: true });
      setShowEditProfile(false);
    } catch(e:any) {
      Alert.alert('Error', e.message || 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  }, [userId, displayName, university, interests, linkedinUrl, websiteUrl]);

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
    const initials = (profile?.displayName || user?.email || 'U').split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();
    return (
      <View style={styles.headerWrapper}>
        {/* 1. PROFILE SECTION (name, email, links, sign out) */}
        <View style={styles.topRow}>
          <View style={{ flex:1 }}>
            <Text style={styles.screenTitle}>{profile?.displayName || user?.email || 'Your Profile'}</Text>
            {(profile?.email || user?.email) && (
              <Text style={styles.userMetaLine}>{profile?.email || user?.email}</Text>
            )}
            {/* Interests and links above edit button */}
            {(profile?.interests?.length || profile?.linkedinUrl || profile?.websiteUrl) && (
              <View style={[styles.chipsRow, { marginTop: 8 }]}>
                {!!profile?.interests?.length && (
                  <View style={styles.chip}><Text style={styles.chipText}>{profile.interests.slice(0,4).join(' · ')}{profile.interests.length>4?'…':''}</Text></View>
                )}
                {!!profile?.linkedinUrl && (
                  <Pressable onPress={() => { try { Linking.openURL(profile.linkedinUrl!); } catch {} }} style={styles.chip}><Text style={styles.chipText}>LinkedIn</Text></Pressable>
                )}
                {!!profile?.websiteUrl && (
                  <Pressable onPress={() => { try { Linking.openURL(profile.websiteUrl!); } catch {} }} style={styles.chip}><Text style={styles.chipText}>Website</Text></Pressable>
                )}
              </View>
            )}
            {user && (
              <View style={[styles.actionsRow, { marginTop: (profile?.interests?.length || profile?.linkedinUrl || profile?.websiteUrl) ? 12 : 8, marginBottom:0, justifyContent: 'space-between' }]}>              
                <TouchableOpacity style={[styles.smallAction, styles.editAction]} onPress={() => setShowEditProfile(true)}>
                  <Text style={styles.smallActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallAction, styles.signOutAction]} onPress={handleSignOut} accessibilityLabel="Sign out">
                  <Text style={styles.signOutActionText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        {profile?.bio && (
          <View style={styles.sectionCard}><Text style={styles.sectionBody}>{profile.bio}</Text></View>
        )}
        {!profile?.bio && profile?.ideaDescription && (
          <View style={styles.sectionCard}><Text style={styles.sectionBody}>{profile.ideaDescription}</Text></View>
        )}
        {profile?.ideaTitle && (
          <View style={styles.sectionCard}> 
            <Text style={styles.ideaTitle}>{profile.ideaTitle}</Text>
            {profile.ideaDescription && <Text style={styles.ideaDesc}>{profile.ideaDescription}</Text>}
          </View>
        )}
        
        <View style={styles.divider} />
        
        {/* 2. HORIZONTAL NEW POST BUTTON */}
        {user && (
          <View style={styles.createInlineRow}>
            <TouchableOpacity style={styles.createInlineButton} onPress={() => setShowCreateModal(true)}>
              <Text style={styles.createInlineButtonText}>New Post</Text>
            </TouchableOpacity>
          </View>
        )}
        

      </View>
    );
  }, [user, profile]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container,{ paddingTop: insets.top + 4 }]}>        
        {userId ? (
          <FlatList
            data={posts}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            ListHeaderComponent={headerContent}
            contentContainerStyle={{ paddingBottom:120 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.emptyText}>No posts yet. Create your first one.</Text>}
          />
        ) : (
          <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
            <Text style={styles.authHint}>Sign in to view profile.</Text>
          </View>
        )}
        {/* Create Post Modal */}
        <Modal 
          visible={showCreateModal} 
          animationType="slide" 
          transparent={true}
          onRequestClose={() => setShowCreateModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCardWrapper}>
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
              >
                <View style={styles.editModalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Create Post</Text>
                    <TouchableOpacity 
                      onPress={() => setShowCreateModal(false)} 
                      style={styles.closeBtn}
                    >
                      <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView 
                    style={styles.modalScrollView}
                    contentContainerStyle={styles.modalContentContainer}
                    keyboardShouldPersistTaps="handled"
                  >
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
                    
                    <Text style={styles.smallLabel}>Looking for (e.g., Developer, Designer, Mentor, Investor)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., Developer, Designer, Mentor"
                      placeholderTextColor="#777"
                      value={personType}
                      onChangeText={setPersonType}
                      returnKeyType="next"
                    />
                    
                    <Text style={styles.smallLabel}>Number of people needed (optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 2, 3-5, 5+"
                      placeholderTextColor="#777"
                      value={peopleNeeded}
                      onChangeText={setPeopleNeeded}
                      keyboardType="number-pad"
                      returnKeyType="next"
                    />
                    
                    <Text style={styles.smallLabel}>Skills needed (comma separated, optional)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="e.g., React, Node.js, UI/UX, Marketing"
                      placeholderTextColor="#777"
                      value={skillsets}
                      onChangeText={setSkillsets}
                      multiline
                      numberOfLines={2}
                      returnKeyType="done"
                    />
                    
                    <View style={styles.locationToggleRow}>
                      <Text style={styles.locationToggleLabel}>Attach Location</Text>
                      <Switch
                        value={attachLocation}
                        onValueChange={(v) => {
                          setAttachLocation(v);
                          if (v) {
                            fetchCurrentLocation();
                          } else {
                            setCurrentCoords(null);
                            setLocError(null);
                            setLocationLabel(null);
                          }
                        }}
                        thumbColor={attachLocation ? '#34d399' : '#888'}
                        trackColor={{ false: '#555', true: '#1f4736' }}
                      />
                    </View>
                    
                    {attachLocation && (
                      <View style={styles.locationBlock}>
                        {locFetching && <Text style={styles.locationPreview}>Fetching current location…</Text>}
                        {!locFetching && currentCoords && (
                          <Text style={styles.locationPreview}>
                            📍 {locationLabel ? locationLabel : `${currentCoords.latitude.toFixed(6)}, ${currentCoords.longitude.toFixed(6)}`}
                          </Text>
                        )}
                        {locError && <Text style={styles.locationError}>{locError}</Text>}
                      </View>
                    )}
                  </ScrollView>
                  
                  <View style={styles.modalFooter}>
                    <TouchableOpacity 
                      disabled={submitting} 
                      style={[styles.saveProfileBtn, submitting && { opacity: 0.5 }]} 
                      onPress={handleSubmit}
                    >
                      <Text style={styles.saveProfileText}>
                        {submitting ? 'Publishing...' : 'Publish Post'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </View>
          </View>
        </Modal>
        {/* Edit Profile Modal */}
        <Modal visible={showEditProfile} animationType="fade" transparent onRequestClose={() => setShowEditProfile(false)}>
          <TouchableWithoutFeedback onPress={() => setShowEditProfile(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => { /* swallow */ }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalCardWrapper}>
                  <View style={styles.editModalCard}>
                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                      <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Edit Profile</Text>
                        <TouchableOpacity onPress={() => setShowEditProfile(false)} style={styles.closeBtn}><Text style={styles.closeBtnText}>✕</Text></TouchableOpacity>
                      </View>
                      <Text style={styles.smallLabel}>Full Name</Text>
                      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Your full name" placeholderTextColor="#777" />
                      <Text style={styles.smallLabel}>Interests (comma separated)</Text>
                      <TextInput style={styles.input} value={interests} onChangeText={setInterests} placeholder="AI, BioTech" placeholderTextColor="#777" />
                      <Text style={styles.smallLabel}>LinkedIn URL</Text>
                      <TextInput style={styles.input} value={linkedinUrl} onChangeText={setLinkedinUrl} placeholder="https://linkedin.com/in/username" placeholderTextColor="#777" autoCapitalize='none' />
                      <Text style={styles.smallLabel}>Website URL</Text>
                      <TextInput style={styles.input} value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="https://yoursite.com" placeholderTextColor="#777" autoCapitalize='none' />
                      <TouchableOpacity disabled={savingProfile} style={[styles.saveProfileBtn, savingProfile && { opacity:0.6 }]} onPress={handleSaveProfile}>
                        <Text style={styles.saveProfileText}>{savingProfile ? 'Saving...' : 'Save Changes'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cancelProfileBtn} onPress={() => setShowEditProfile(false)}>
                        <Text style={styles.cancelProfileText}>Cancel</Text>
                      </TouchableOpacity>
                    </ScrollView>
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
  input: { 
    backgroundColor:'#262626', 
    borderWidth:1, 
    borderColor:'#333', 
    borderRadius:10, 
    paddingHorizontal:14, 
    paddingVertical:12, 
    color:'white', 
    fontSize:15, 
    marginBottom:12 
  },
  textArea: { 
    minHeight: 90, 
    maxHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
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
  // signOutButton integrated into actionsRow (removed old standalone styles)
  signOutButton: { },
  signOutButtonText: { },
  fab: { position:'absolute', bottom:30, right:24, width:60, height:60, borderRadius:30, backgroundColor:'#2563eb', alignItems:'center', justifyContent:'center', shadowColor:'#000', shadowOpacity:0.3, shadowRadius:6, shadowOffset:{width:0,height:3} },
  fabPlus: { color:'white', fontSize:34, marginTop:-2 },
  bottomBar: { position:'absolute', left:0, right:0, bottom:0, flexDirection:'row', justifyContent:'space-evenly', paddingHorizontal:20, paddingBottom: Platform.OS === 'ios' ? 28 : 16, paddingTop:12, backgroundColor:'#111111', borderTopWidth:1, borderTopColor:'#1f2937' },
  bottomBtn: { flex:1, marginHorizontal:6, paddingVertical:14, borderRadius:30, alignItems:'center', justifyContent:'center' },
  createBtn: { backgroundColor:'#2563eb' },
  signOutBtn: { backgroundColor:'#b91c1c' },
  bottomBtnText: { color:'white', fontWeight:'600', fontSize:14 },
  modalCardWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    width: '100%',
    margin: 0,
  },
  modalOverlay: { 
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  editModalCard: {
    backgroundColor: '#1b1b1b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    maxHeight: '95%',
    width: '100%',
    paddingTop: Platform.OS === 'ios' ? 0 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 40 : 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalTitle: { color:'white', fontSize:18, fontWeight:'600' },
  closeBtn: { 
    padding: 8,
    margin: -8,
    marginRight: -4,
  },
  closeBtnText: { color:'#999', fontSize:18 },
  bioBox: { backgroundColor:'#141414', padding:12, borderRadius:12, borderWidth:1, borderColor:'#222', marginBottom:14 },
  bioText: { color:'#ddd', fontSize:13, lineHeight:18 },
  sectionLabel: { color:'#aaa', fontSize:12, fontWeight:'600', letterSpacing:0.5, marginBottom:8, textTransform:'uppercase' },
  postsWindow: { flex:1 },
  topRow: { flexDirection:'row', alignItems:'center', marginBottom:12 },
  avatarCircle: { width:56, height:56, borderRadius:28, backgroundColor:'#1e293b', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#334155' },
  avatarText: { color:'#93c5fd', fontSize:20, fontWeight:'700' },
  // compactActions removed (replaced by actionsRow below)
  actionsRow: { flexDirection:'row', gap:8, marginBottom:12 },
  smallAction: { backgroundColor:'#2563eb', borderWidth:1, borderColor:'#1d4ed8', paddingHorizontal:14, paddingVertical:8, borderRadius:10 },
  smallActionText: { color:'white', fontSize:12, fontWeight:'600' },
  chipsRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:12 },
  chip: { backgroundColor:'#1b1f24', paddingHorizontal:12, paddingVertical:6, borderRadius:16, borderWidth:1, borderColor:'#2a3139' },
  chipText: { color:'#d1d5db', fontSize:11, fontWeight:'500', letterSpacing:0.3 },
  sectionCard: { backgroundColor:'#141414', padding:14, borderRadius:14, borderWidth:1, borderColor:'#222', marginBottom:14 },
  sectionBody: { color:'#ddd', fontSize:13, lineHeight:18 },
  divider: { height:1, backgroundColor:'#1f2937', marginVertical:18, opacity:0.6 },
  userMetaLine: { color:'#94a3b8', fontSize:12, marginTop:4 },
  connCard: { 
    flexDirection:'row', 
    alignItems:'center', 
    justifyContent:'space-between', 
    paddingVertical:10, 
    borderBottomWidth:StyleSheet.hairlineWidth, 
    borderBottomColor:'#2a2a2a' 
  },
  connName: { 
    color:'white', 
    fontSize:15, 
    fontWeight:'600' 
  },
  connSub: { 
    color:'#888', 
    fontSize:12, 
    marginTop:2 
  },
  connActionBtn: { 
    backgroundColor:'#2563eb', 
    paddingHorizontal:12, 
    paddingVertical:8, 
    borderRadius:10 
  },
  connActionText: { 
    color:'white', 
    fontWeight:'600' 
  },
  headerRow: { 
    flexDirection:'row', 
    alignItems:'center', 
    justifyContent:'space-between', 
    marginBottom:4 
  },
  editProfileBtn: { 
    paddingHorizontal:12, 
    paddingVertical:6, 
    backgroundColor:'#1e293b', 
    borderRadius:8, 
    borderWidth:1, 
    borderColor:'#334155' 
  },
  editProfileText: { 
    color:'#93c5fd', 
    fontSize:12, 
    fontWeight:'600' 
  },
  inlineCreateBtn: { 
    alignSelf:'flex-start', 
    backgroundColor:'#2563eb', 
    paddingHorizontal:14, 
    paddingVertical:8, 
    borderRadius:18, 
    marginTop:8, 
    marginBottom:8 
  },
  inlineCreateText: { 
    color:'white', 
    fontSize:13, 
    fontWeight:'600' 
  },
  infoGrid: { 
    flexDirection:'row', 
    flexWrap:'wrap', 
    gap:8, 
    marginBottom:12 
  },
  infoItem: { 
    backgroundColor:'#1b1b1b', 
    paddingHorizontal:10, 
    paddingVertical:6, 
    borderRadius:14, 
    color:'#ddd', 
    fontSize:11, 
    borderWidth:1, 
    borderColor:'#2a2a2a' 
  },
  floatingSignOutWrap: { 
    position:'absolute', 
    bottom:20, 
    right:20 
  },
  signOutFloatingBtn: { 
    backgroundColor:'#b91c1c', 
    paddingHorizontal:16, 
    paddingVertical:10, 
    borderRadius:26, 
    borderWidth:1, 
    borderColor:'#dc2626' 
  },
  signOutFloatingText: { 
    color:'white', 
    fontSize:13, 
    fontWeight:'600' 
  },
  modalScrollView: {
    maxHeight: '100%',
  },
  modalContentContainer: {
    padding: 20,
    paddingBottom: 20,
  },
  modalFooter: {
    padding: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    backgroundColor: '#1b1b1b',
  },
  smallLabel: { color:'#d1d5db', fontSize:11, fontWeight:'600', marginBottom:6, marginTop: 4 },
  saveProfileBtn: { 
    backgroundColor:'#142a20', 
    borderWidth:1, 
    borderColor:'#1f4736', 
    paddingVertical:14, 
    borderRadius:12, 
    alignItems:'center' 
  },
  saveProfileText: { 
    color:'#34d399', 
    fontWeight:'600', 
    fontSize:15 
  },
  cancelProfileText: { 
    color:'white', 
    fontWeight:'600', 
    fontSize:15 
  },
  cancelProfileBtn: { 
    alignItems:'center', 
    paddingVertical:10 
  },
  locationToggleRow: { 
    flexDirection:'row', 
    alignItems:'center', 
    justifyContent:'space-between', 
    marginTop:16, 
    marginBottom:8 
  },
  locationToggleLabel: { 
    color:'white', 
    fontSize:14, 
    fontWeight:'500' 
  },
  locationBlock: { 
    backgroundColor:'#151515', 
    padding:12, 
    borderRadius:12, 
    borderWidth:1, 
    borderColor:'#262626', 
    marginBottom:12 
  },
  locationPreview: {
    color: '#9ca3af',
    marginTop: 6,
    fontSize: 12
  },
  locationError: {
    color: '#f87171',
    marginTop: 8,
    fontSize: 12
  },
  locationInputsRow: { 
    flexDirection:'row', 
    gap:10, 
    marginBottom:10 
  },
  halfInput: { 
    flex:1 
  },
  locateBtn: { 
    backgroundColor:'#2563eb', 
    paddingVertical:10, 
    borderRadius:10, 
    alignItems:'center', 
    marginTop:4 
  },
  locateBtnText: { 
    color:'white', 
    fontWeight:'600', 
    fontSize:14 
  },
  signOutTopRight: { 
    position:'absolute', 
    top:130, 
    right:0, 
    backgroundColor:'#2a1a1a', 
    borderWidth:1, 
    borderColor:'#442222', 
    paddingHorizontal:16, 
    paddingVertical:10, 
    borderRadius:30, 
    zIndex:10 
  },
  signOutTopRightText: { 
    color:'#f87171', 
    fontWeight:'600', 
    fontSize:13 
  },
  editAction: { 
    backgroundColor:'#1e293b', 
    borderColor:'#334155' 
  },
  signOutAction: { 
    backgroundColor:'#2a1a1a', 
    borderColor:'#442222' 
  },
  signOutActionText: { 
    color:'#f87171', 
    fontSize:12, 
    fontWeight:'600' 
  },
  createInlineRow: { 
    flexDirection:'row', 
    alignItems:'center', 
    marginTop:12, 
    marginBottom:12 
  },
  createInlineButton: { 
    backgroundColor:'#142a20', 
    borderWidth:1, 
    borderColor:'#1f4736', 
    paddingHorizontal:40, 
    paddingVertical:14, 
    borderRadius:40, 
    flex:1 
  },
  createInlineButtonText: { 
    color:'#34d399', 
    fontWeight:'600', 
    fontSize:14, 
    textAlign:'center' 
  },
  pickerContainer: { 
    borderWidth: 1, 
    borderColor: '#2a2a2a', 
    borderRadius: 10, 
    marginBottom: 12,
    backgroundColor: '#1b1b1b',
    overflow: 'hidden'
  },
  picker: { 
    color: '#fff',
    height: 50,
  },
  pickerItem: {
    color: '#fff',
    backgroundColor: '#1b1b1b',
  }
});

// Edit Profile Modal (appended component)
// NOTE: Appending directly below to keep single-file simplicity
// (Could be factored out later.)
