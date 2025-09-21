// Firebase removed for POC: using pure in-memory dummy data.
// TODO(app/explore): Re-introduce Firebase (users + posts collections) once POC validated.
//  - Replace local initialization with Firestore listeners
//  - Move like handling back to updateDoc w/ optimistic UI
//  - Add security rules to constrain writes
//  - Consider a Cloud Function to derive mutual matches
import { auth, autoSignInIfNeeded, db, ensureAtLeastAnonymousAuth } from '@/constants/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { arrayUnion, collection, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ----------------------------------------------------------------------------------
// Builder / Idea Card Swipe MVP (replaces old events explore)
// ----------------------------------------------------------------------------------

interface BuilderProfile {
  id: string; // userId
  displayName?: string;
  ideaTitle?: string;
  ideaDescription?: string;
  liked?: string[]; // people this user liked
  likedPosts?: string[]; // posts liked (connect actions)
  passedPosts?: string[]; // posts passed
  // Internal: when deck item represents a post, we store underlying author id here
  _authorId?: string;
}

// Post model (MVP)
// (Removed Post model for simplified profile-only swipe phase)

const SCREEN = Dimensions.get('window');
const CARD_AREA_HEIGHT = SCREEN.height * 0.6; // allocate space for swipe deck leaving room for footer
const LOCAL_USER_ID = 'local-current-user'; // Stable identifier so effects do not loop
// Lower threshold so lighter drags dismiss; use velocity fallback as well.
// (Swipe disabled in fallback mode; keeping constants commented for future restore)
// const SWIPE_THRESHOLD = SCREEN.width * 0.18;
// const SWIPE_VELOCITY_MIN = 600;

// ----------------------------------------------------------------------------------
// Reusable dummy seed data (so we can perform an in-app reset without reload)
// TODO(app/explore reintegration): Remove these constants and fetch from Firestore w/ pagination.
// ----------------------------------------------------------------------------------
const INITIAL_PROFILES: BuilderProfile[] = [
  { id: 'demo-user-1', displayName: 'Alice', ideaTitle: 'AI Campus Concierge', ideaDescription: 'Campus assistant that forms micro sprint pods.', liked: [] },
  { id: 'demo-user-2', displayName: 'Bob', ideaTitle: 'Realtime Study Matcher', ideaDescription: 'Pairs students based on current focus & energy.', liked: [] },
  { id: 'demo-user-3', displayName: 'Chloe', ideaTitle: 'Founders Graph', ideaDescription: 'Dynamic network that expands as you connect.', liked: [] },
  { id: 'demo-user-4', displayName: 'Devon', ideaTitle: 'Micro-Internships Hub', ideaDescription: 'Short scoped product pushes validating skill.', liked: [] },
  { id: 'demo-user-5', displayName: 'Esha', ideaTitle: 'Pitch Replay Summarizer', ideaDescription: 'Transcribe & synthesize founder pitches.', liked: [] },
  { id: 'demo-user-6', displayName: 'Finn', ideaTitle: 'Edge Deploy Manager', ideaDescription: 'Zero-config edge function orchestrator.', liked: [] },
  { id: 'demo-user-7', displayName: 'Gia', ideaTitle: 'Contextual Notetaker', ideaDescription: 'Ambient notes auto-linking people & docs.', liked: [] },
  { id: 'demo-user-8', displayName: 'Hiro', ideaTitle: 'Latency Budget Analyzer', ideaDescription: 'Trace ingestion + perf budget guidance.', liked: [] },
  { id: 'demo-user-9', displayName: 'Ivy', ideaTitle: 'Onboarding Replay', ideaDescription: 'Interactive replays teaching internal flows.', liked: [] },
  { id: 'demo-user-10', displayName: 'Jules', ideaTitle: 'Async Standup Synth', ideaDescription: 'Summarizes updates & flags blockers.', liked: [] }
];

// (Removed INITIAL_POSTS list)

interface PostItem { id: string; title: string; description?: string | null; authorId: string; authorName?: string; createdAt?: number; }

// Simple static card (no gestures)
function ProfileCard({ profile, post }: { profile?: BuilderProfile; post?: PostItem }) {
  return (
    <View style={styles.card}>      
      <View style={{ flex: 1 }}>
        <Text style={styles.ideaTitle}>{post ? (post.title || 'Untitled Project') : (profile?.ideaTitle || 'Untitled Idea')}</Text>
        <Text style={styles.author}>{post ? (post.authorName || 'Anonymous Builder') : (profile?.displayName || 'Anonymous Builder')}</Text>
        <Text style={styles.description} numberOfLines={6}>
          {post ? (post.description || 'No description provided.') : (profile?.ideaDescription || 'No description provided yet.')}
        </Text>
      </View>
    </View>
  );
}

export default function ExploreBuilders() {
  const [currentUserProfile, setCurrentUserProfile] = useState<BuilderProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<BuilderProfile[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [deck, setDeck] = useState<PostItem[]>([]);
  const [index, setIndex] = useState(0); // pointer into deck
  const [remoteDisabled, setRemoteDisabled] = useState(false); // toggled if permission denied
  const [lastRemoteError, setLastRemoteError] = useState<string | null>(null);
  const [permissionDiagnosis, setPermissionDiagnosis] = useState<string | null>(null); // human-friendly classification
  // Reactive firebase user state (will update after onAuthStateChanged fires)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const demoMode = !firebaseUser; // if not signed in we're in demo/fallback
  const currentUserId = firebaseUser ? firebaseUser.uid : LOCAL_USER_ID;
  // Deck now directly uses profiles instead of posts
  const [initialized, setInitialized] = useState(false);

  // Auth state listener & optional auto sign-in (dev convenience)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setFirebaseUser(u);
      console.log('[Explore] Auth state changed ->', u ? (u.isAnonymous ? 'anonymous' : u.uid) : 'null');
    });
    // Attempt silent credential sign-in first; if none, try anonymous to satisfy rules.
    (async () => {
      const hadCreds = await autoSignInIfNeeded?.();
      if (!hadCreds) {
        await ensureAtLeastAnonymousAuth?.();
      }
    })();
    return () => unsub();
  }, []);

  // Ensure a user profile document exists when authenticated
  useEffect(() => {
    (async () => {
      if (!firebaseUser) return;
      try {
        const ref = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            displayName: firebaseUser.isAnonymous ? 'Anon' : (firebaseUser.email || 'User'),
            ideaTitle: null,
            ideaDescription: null,
            liked: [],
            likedPosts: [],
            passedPosts: [],
            createdAt: Date.now()
          });
          console.log('[Explore] Created new user profile for', firebaseUser.uid);
        }
      } catch (e) {
        console.warn('[Explore] Failed to ensure user profile', e);
      }
    })();
  }, [firebaseUser]);

  // Local initialize dummy data (runs once) – used only for demo mode; once authenticated we rely on remote docs
  useEffect(() => {
    if (initialized) return;
    const localUser: BuilderProfile = { id: LOCAL_USER_ID, displayName: 'You', ideaTitle: 'Your Idea TBD', ideaDescription: 'Add your profile later.', liked: [] };
    setAllProfiles([localUser, ...INITIAL_PROFILES]);
    setInitialized(true);
  }, [initialized]);

  // Firestore subscription (users collection) – only when authenticated to avoid permission-denied spam
  useEffect(() => {
    if (!firebaseUser || remoteDisabled) return; // skip while unauthenticated or previously disabled
    let unsubscribe: (() => void) | undefined;
    unsubscribe = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        console.log('[Explore] Received users snapshot (count=', snapshot.size, ')');
        const remoteProfiles: BuilderProfile[] = snapshot.docs.map(docSnap => {
          const data: any = docSnap.data() || {};
          return {
            id: docSnap.id,
            displayName: data.displayName,
            ideaTitle: data.ideaTitle,
            ideaDescription: data.ideaDescription,
            liked: Array.isArray(data.liked) ? data.liked : []
          };
        });
        setAllProfiles(remoteProfiles);
        setLastRemoteError(null);
      },
      async error => {
        console.warn('Firestore users subscription error; staying in demo mode fallback', error);
        setLastRemoteError(error?.message || String(error));
        if (error?.code === 'permission-denied') {
          setRemoteDisabled(true);
          // Attempt classification: is collection list blocked but doc read allowed? Only if we have an auth user.
            if (firebaseUser) {
              try {
                const meDocRef = doc(db, 'users', firebaseUser.uid);
                const meSnap = await getDoc(meDocRef);
                if (meSnap.exists()) {
                  setPermissionDiagnosis('Collection list blocked by rules; direct document read allowed. Adjust rules to permit list or query.');
                } else {
                  setPermissionDiagnosis('User document not readable or does not exist. Rules likely require different auth or the doc is missing.');
                }
              } catch (inner) {
                setPermissionDiagnosis('Direct document read also denied. Enable anonymous or authenticated read in Firestore rules.');
              }
            } else {
              setPermissionDiagnosis('No auth user present; enable anonymous auth or relax read rules.');
            }
        }
      }
    );
    return () => { if (unsubscribe) unsubscribe(); };
  }, [firebaseUser, remoteDisabled]);

  // Posts subscription (independent). If permission denied we still continue with demo user data only.
  useEffect(() => {
    if (!firebaseUser || remoteDisabled) return;
    const unsub = onSnapshot(
      collection(db, 'posts'),
      snap => {
        const items: PostItem[] = snap.docs.map(d => {
          const data: any = d.data() || {};
          return {
            id: d.id,
            title: data.title,
            description: data.description,
            authorId: data.authorId,
            createdAt: data.createdAt?.toMillis?.() || Date.now()
          };
        });
        setPosts(items);
      },
      err => {
        console.warn('[Explore] posts listener error', err);
      }
    );
    return () => unsub();
  }, [firebaseUser, remoteDisabled]);

  // (Removed remote posts seeding – handled in local initialize above)

  // Subscribe to all user profiles (MVP: no pagination)
  // (Removed Firestore subscriptions in local dummy mode)

  // Subscribe to posts
  // (Removed Firestore subscriptions in local dummy mode)

  // Derive current user profile (if signed in) and build deck from posts.
  useEffect(() => {
    const me = allProfiles.find(p => p.id === currentUserId) || null;
    setCurrentUserProfile(me);
    if (!me) {
      // Fallback placeholder so new users can still see posts
      const placeholder: BuilderProfile = { id: currentUserId, displayName: 'You', likedPosts: [], passedPosts: [] };
      setCurrentUserProfile(placeholder);
      const filtered = posts.filter(p => p.authorId !== currentUserId);
      const enriched = filtered.map(p => ({ ...p, authorName: allProfiles.find(u => u.id === p.authorId)?.displayName }));
      enriched.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
      setDeck(enriched);
      setIndex(0);
      return;
    }
    const passed = new Set(me.passedPosts || []);
    const likedPosts = new Set(me.likedPosts || []);
    const filtered = posts.filter(p => p.authorId !== me.id && !passed.has(p.id) && !likedPosts.has(p.id));
    // Enrich with author display name if available
    const enriched = filtered.map(p => ({ ...p, authorName: allProfiles.find(u => u.id === p.authorId)?.displayName }));
    // Simple ordering: newest first
    enriched.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    setDeck(enriched);
    setIndex(0);
  }, [allProfiles, currentUserId, posts]);

  const advance = useCallback(() => {
    setIndex(prev => prev + 1);
  }, []);

  const handleLike = useCallback(async (postId: string) => {
    if (demoMode) {
      setAllProfiles(prev => prev.map(p => p.id === currentUserId ? { ...p, likedPosts: Array.from(new Set([...(p.likedPosts||[]), postId])) } : p));
      advance();
      return;
    }
    setAllProfiles(prev => prev.map(p => p.id === currentUserId ? { ...p, likedPosts: Array.from(new Set([...(p.likedPosts||[]), postId])) } : p));
    advance();
    // Firestore write (will be no-op until auth fallback replaced with real user id)
    try {
      await updateDoc(doc(db, 'users', currentUserId), { likedPosts: arrayUnion(postId) });
    } catch (e) {
      console.warn('Failed to persist like; will resync on next snapshot', e);
      // (Optional) Could implement rollback or refresh logic here.
    }
  }, [currentUserId, advance, demoMode]);

  const handlePass = useCallback(() => {
    const current = deck[index];
    if (current) {
      if (demoMode) {
        setAllProfiles(prev => prev.map(p => p.id === currentUserId ? { ...p, passedPosts: Array.from(new Set([...(p.passedPosts||[]), current.id])) } : p));
      } else {
        // optimistic
        setAllProfiles(prev => prev.map(p => p.id === currentUserId ? { ...p, passedPosts: Array.from(new Set([...(p.passedPosts||[]), current.id])) } : p));
        updateDoc(doc(db, 'users', currentUserId), { passedPosts: arrayUnion(current.id) }).catch(e => console.warn('Failed pass write', e));
      }
    }
    advance();
  }, [advance, deck, index, currentUserId, demoMode]);

  // Reset demo: restore original dummy profiles & posts and clear likes
  const resetDemo = useCallback(() => {
    const localUser: BuilderProfile = { id: LOCAL_USER_ID, displayName: 'You', ideaTitle: 'Your Idea TBD', ideaDescription: 'Add your profile later.', liked: [] };
    setAllProfiles([localUser, ...INITIAL_PROFILES]);
    setDeck([]);
    setCurrentUserProfile(localUser);
    setIndex(0);
  }, []);

  // Placeholder graph nodes (will be replaced in next step)
  // Build first & second degree sets for graph
  const graphData = useMemo(() => {
    if (!currentUserProfile) return { first: [] as BuilderProfile[], second: [] as BuilderProfile[] };
    // Now graph is based on authors liked via their posts (likedPosts -> map to authors)
    const likedPostIds = new Set(currentUserProfile.likedPosts || []);
    const likedAuthors = new Set<string>();
    posts.forEach(p => { if (likedPostIds.has(p.id)) likedAuthors.add(p.authorId); });
    const first = allProfiles.filter(p => likedAuthors.has(p.id));
    const secondAuthorIds = new Set<string>();
    first.forEach(f => (f.likedPosts || []).forEach(lpId => {
      const post = posts.find(pp => pp.id === lpId);
      if (post && post.authorId !== currentUserProfile.id && !likedAuthors.has(post.authorId)) secondAuthorIds.add(post.authorId);
    }));
    const second = allProfiles.filter(p => secondAuthorIds.has(p.id));
    return { first, second };
  }, [currentUserProfile, allProfiles, posts]);

  // Radial layout helpers
  const renderGraph = () => {
    if (!currentUserProfile) return null; // With fabrication above this should rarely hit
    const size = 200; // container size
    const center = size / 2;
    const r1 = 60; // first ring radius
    const r2 = 90; // second ring radius
    const first = graphData.first;
    const second = graphData.second;
    // position nodes evenly spaced
    const place = (count: number, radius: number) => {
      return Array.from({ length: count }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2; // start top
        return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
      });
    };
    const firstPos = place(Math.max(first.length, 1), r1); // avoid division by zero
    const secondPos = place(Math.max(second.length, 1), r2);

    return (
      <View style={styles.graphWrapper}>
        <View style={[styles.graphCanvas, { width: size, height: size }]}>          
          {/* Edges center -> first-degree */}
          {first.map((p, i) => {
            const dx = firstPos[i].x - center;
            const dy = firstPos[i].y - center;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const midX = (firstPos[i].x + center) / 2;
            const midY = (firstPos[i].y + center) / 2;
            return (
              <View key={'edge-f-' + p.id} style={[styles.edgeLineStrong, {
                left: midX - dist / 2,
                top: midY - 1, // center vertically for 2px height
                width: dist,
                transform: [{ rotate: `${angle}rad` }]
              }]} />
            );
          })}
          {/* Edges first-degree -> second-degree (allow multiple parents) */}
          {second.flatMap((p, si) => {
            const parents = graphData.first.filter(f => (f.liked || []).includes(p.id));
            if (!parents.length) return [] as React.ReactElement[];
            return parents.map(parent => {
              const pi = graphData.first.indexOf(parent);
              if (pi === -1) return null;
              const dx = secondPos[si].x - firstPos[pi].x;
              const dy = secondPos[si].y - firstPos[pi].y;
              const dist = Math.hypot(dx, dy);
              const angle = Math.atan2(dy, dx);
              const midX = (secondPos[si].x + firstPos[pi].x) / 2;
              const midY = (secondPos[si].y + firstPos[pi].y) / 2;
              return (
                <View key={'edge-s-' + p.id + '-' + parent.id} style={[styles.edgeLine, {
                  left: midX - dist / 2,
                  top: midY - 0.5,
                  width: dist,
                  transform: [{ rotate: `${angle}rad` }]
                }]} />
              );
            }).filter(Boolean) as React.ReactElement[];
          })}
          {/* Ring connectors (first-degree ring) */}
          {first.length > 1 && firstPos.map((pos, i) => {
            const next = firstPos[(i + 1) % firstPos.length];
            const dx = next.x - pos.x; const dy = next.y - pos.y; const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx); const midX = (pos.x + next.x) / 2; const midY = (pos.y + next.y) / 2;
            return (
              <View key={'ring-f-' + i} style={[styles.ringLine, {
                left: midX - dist / 2,
                top: midY - 0.5,
                width: dist,
                transform: [{ rotate: `${angle}rad` }]
              }]} />
            );
          })}
          {/* Ring connectors (second-degree ring) */}
          {second.length > 1 && secondPos.map((pos, i) => {
            const next = secondPos[(i + 1) % secondPos.length];
            const dx = next.x - pos.x; const dy = next.y - pos.y; const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx); const midX = (pos.x + next.x) / 2; const midY = (pos.y + next.y) / 2;
            return (
              <View key={'ring-s-' + i} style={[styles.ringLineOuter, {
                left: midX - dist / 2,
                top: midY - 0.5,
                width: dist,
                transform: [{ rotate: `${angle}rad` }]
              }]} />
            );
          })}
          {/* Center node */}
          <View style={[styles.node, styles.nodeMe, { left: center - 20, top: center - 20 }]}>            
            <Text style={styles.nodeLabel}>{currentUserProfile.displayName?.[0] || 'U'}</Text>
          </View>
          {/* First-degree nodes */}
          {first.map((p, i) => (
            <View key={p.id} style={[styles.node, styles.nodeFirst, { left: firstPos[i].x - 18, top: firstPos[i].y - 18 }]}>              
              <Text style={styles.nodeLabel}>{p.displayName?.[0] || '?'}</Text>
            </View>
          ))}
          {/* Second-degree nodes */}
          {second.map((p, i) => (
            <View key={p.id} style={[styles.node, styles.nodeSecond, { left: secondPos[i].x - 14, top: secondPos[i].y - 14 }]}>              
              <Text style={styles.nodeLabelSmall}>{p.displayName?.[0] || '?'}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.graphMeta}>{graphData.first.length} direct • {graphData.second.length} extended</Text>
        {graphData.first.length === 0 && (
          <Text style={styles.graphHint}>Swipe right to start building your graph.</Text>
        )}
        {demoMode && (
          <TouchableOpacity accessibilityLabel="Reset demo network" onPress={resetDemo} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reset Demo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderGraph()}
      <View style={styles.deckArea}>
        {currentUserProfile && !allProfiles.find(p => p.id === currentUserProfile.id && (p.likedPosts || p.liked || p.ideaTitle !== undefined)) && (
          <View style={{ position:'absolute', top:8, left:16, right:16, backgroundColor:'#1e293b', padding:10, borderRadius:12, borderWidth:1, borderColor:'#334155' }}>
            <Text style={{ color:'#93c5fd', fontSize:12, fontWeight:'600', marginBottom:4 }}>Welcome!</Text>
            <Text style={{ color:'#cbd5e1', fontSize:12 }}>Create a post so others can discover your project. Your own profile doc was just initialized.</Text>
          </View>
        )}
        {deck.length === 0 && (
          <View style={styles.emptyDeck}>            
            <Text style={styles.emptyDeckText}>No profiles available.</Text>
            {demoMode && (
              <TouchableOpacity onPress={resetDemo} accessibilityLabel="Reset demo profiles" style={styles.inlineReset}>
                <Text style={styles.inlineResetText}>Reset Demo</Text>
              </TouchableOpacity>
            )}
            {remoteDisabled && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: '#f87171', fontSize: 12, textAlign: 'center' }}>Remote data disabled (permissions).</Text>
                <TouchableOpacity
                  style={[styles.inlineReset,{marginTop:8}]}
                  accessibilityLabel="Retry remote fetch"
                  onPress={() => { setRemoteDisabled(false); setLastRemoteError(null); }}>
                  <Text style={styles.inlineResetText}>Retry Remote</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        {deck.length > 0 && index >= deck.length && (
          <View style={styles.emptyDeck}>            
            <Text style={styles.emptyDeckText}>No more profiles to view.</Text>
            {demoMode && (
              <TouchableOpacity onPress={resetDemo} accessibilityLabel="Reset demo profiles" style={styles.inlineReset}>
                <Text style={styles.inlineResetText}>Start Over</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {deck.length > 0 && index < deck.length && (
          <ProfileCard post={deck[index]} />
        )}
      </View>
      {deck.length > 0 && index < deck.length && (
        <View style={styles.actionsOverlay}>
          <TouchableOpacity accessibilityLabel="Pass on this builder" style={[styles.smallActionButton, styles.passButton]} onPress={handlePass}>
            <Text style={styles.passActionText}>Pass</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={demoMode}
            accessibilityLabel={demoMode ? 'Connect disabled in demo mode' : 'Connect with this builder'}
            style={[styles.smallActionButton, styles.likeButton, demoMode && { opacity: 0.4 }]}
            onPress={() => handleLike(deck[index].id)}>
            <Text style={styles.likeActionText}>{demoMode ? 'Connect (Auth Required)' : 'Connect'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {lastRemoteError && (
        <View style={{ position:'absolute', top: 8, left: 0, right: 0, alignItems:'center' }}>
          <Text style={{ color:'#f87171', fontSize:12 }}>Remote error: {lastRemoteError}</Text>
          {permissionDiagnosis && (
            <Text style={{ color:'#fda4af', fontSize:11, marginTop:4, paddingHorizontal:12, textAlign:'center' }}>{permissionDiagnosis}</Text>
          )}
          {remoteDisabled && (
            <View style={{ flexDirection:'row', marginTop:6, gap:8 }}>
              <TouchableOpacity onPress={() => { setRemoteDisabled(false); setLastRemoteError(null); setPermissionDiagnosis(null); }} style={[styles.inlineReset,{paddingVertical:4}]}> 
                <Text style={styles.inlineResetText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d0d0d' },
  graphPlaceholder: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222'
  },
  graphWrapper: {
    paddingTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
    paddingBottom: 12
  },
  graphCanvas: {
    position: 'relative',
    marginBottom: 8,
  },
  edgeLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#2f3f45',
  },
  edgeLineStrong: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#3b82f6',
    opacity: 0.85
  },
  ringLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#1f2937',
    opacity: 0.6
  },
  ringLineOuter: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#374151',
    opacity: 0.5
  },
  node: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeMe: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#3b82f6'
  },
  nodeFirst: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    borderWidth: 2,
    borderColor: '#10b981'
  },
  nodeSecond: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#374151',
    borderWidth: 2,
    borderColor: '#4b5563'
  },
  nodeLabel: { color: 'white', fontWeight: '700', fontSize: 14 },
  nodeLabelSmall: { color: 'white', fontWeight: '600', fontSize: 12 },
  graphMeta: { color: '#888', fontSize: 12 },
  graphHint: { color: '#666', fontSize: 12, marginTop: 4 },
  graphTitle: { color: 'white', fontSize: 18, fontWeight: '600' },
  graphSubtitle: { color: '#aaa', marginTop: 4, fontSize: 13 },
  deckArea: { height: CARD_AREA_HEIGHT, width: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  emptyDeck: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyDeckText: { color: '#aaa', fontSize: 16, textAlign: 'center' },
  inlineReset: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#334155' },
  inlineResetText: { color: '#60a5fa', fontSize: 13, fontWeight: '500' },
  cardContainer: { position: 'absolute', width: SCREEN.width * 0.9, height: '100%' },
  card: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  ideaTitle: { fontSize: 20, fontWeight: '700', color: 'white', marginBottom: 6 },
  author: { fontSize: 14, fontWeight: '500', color: '#bbb', marginBottom: 12 },
  description: { fontSize: 14, color: '#ddd', lineHeight: 20 },
  likeBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#34d399',
    borderRadius: 8,
    transform: [{ rotate: '-12deg' }]
  },
  likeText: { color: '#34d399', fontWeight: '700', letterSpacing: 1 },
  passBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#f87171',
    borderRadius: 8,
    transform: [{ rotate: '12deg' }]
  },
  passText: { color: '#f87171', fontWeight: '700', letterSpacing: 1 },
  footerActions: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 18, gap: 28, zIndex: 50 },
  actionButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 40,
    minWidth: 120,
    alignItems: 'center'
  },
  passButton: { backgroundColor: '#2a1a1a', borderWidth: 1, borderColor: '#442222' },
  likeButton: { backgroundColor: '#142a20', borderWidth: 1, borderColor: '#1f4736' },
  passActionText: { color: '#f87171', fontWeight: '600', fontSize: 15 },
  likeActionText: { color: '#34d399', fontWeight: '600', fontSize: 15 }
  ,resetButton: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  resetButtonText: { color: '#3b82f6', fontSize: 12, fontWeight: '600' }
  ,actionsOverlay: { position: 'absolute', bottom: 24, right: 20, flexDirection: 'column', alignItems: 'flex-end', gap: 12 },
  smallActionButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30, minWidth: 100, alignItems: 'center' }
});