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
// Removed fixed CARD_AREA_HEIGHT – deck/post area will flex to fill available space beneath graph and above action bar
const CARD_AREA_HEIGHT = SCREEN.height * 0.6; // (legacy) retained only if referenced elsewhere
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
      <View style={styles.cardInner}>        
        <Text style={styles.ideaTitle}>{post ? (post.title || 'Untitled Project') : (profile?.ideaTitle || 'Untitled Idea')}</Text>
        <Text style={styles.author}>{post ? (post.authorName || 'Anonymous Builder') : (profile?.displayName || 'Anonymous Builder')}</Text>
        <Text style={styles.description} numberOfLines={8}>
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
  const [graphExpanded, setGraphExpanded] = useState(false);
  // Graph interaction: selected node id ("ME" denotes current user) for highlight context
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

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
            liked: Array.isArray(data.liked) ? data.liked : [],
            likedPosts: Array.isArray(data.likedPosts) ? data.likedPosts : [],
            passedPosts: Array.isArray(data.passedPosts) ? data.passedPosts : []
          } as BuilderProfile;
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
    setCurrentUserProfile(me || null);
    const currentId = deck[index]?.id;
    let newDeck: PostItem[] = [];
    if (!me) {
      const filtered = posts.filter(p => p.authorId !== currentUserId);
      newDeck = filtered.map(p => ({ ...p, authorName: allProfiles.find(u => u.id === p.authorId)?.displayName }));
    } else {
      const passed = new Set(me.passedPosts || []);
      const likedPosts = new Set(me.likedPosts || []);
      const filtered = posts.filter(p => p.authorId !== me.id && !passed.has(p.id) && !likedPosts.has(p.id));
      newDeck = filtered.map(p => ({ ...p, authorName: allProfiles.find(u => u.id === p.authorId)?.displayName }));
    }
    // Sort newest first within each author group first
    newDeck.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    // Fairness: if one author has many posts, interleave authors (simple round-robin)
    if (newDeck.length > 3) {
      const byAuthor: Record<string, PostItem[]> = {};
      newDeck.forEach(p => { (byAuthor[p.authorId] = byAuthor[p.authorId] || []).push(p); });
      Object.values(byAuthor).forEach(arr => arr.sort((a,b) => (b.createdAt||0) - (a.createdAt||0)));
      const authors = Object.keys(byAuthor).sort();
      const interleaved: PostItem[] = [];
      let added = true; let cursor = 0;
      while (added) {
        added = false;
        for (let i = 0; i < authors.length; i++) {
          const aid = authors[(i + cursor) % authors.length];
            const bucket = byAuthor[aid];
            if (bucket.length) {
              interleaved.push(bucket.shift()!);
              added = true;
            }
        }
        cursor++;
      }
      // Keep original order if interleaving produced same length
      if (interleaved.length === newDeck.length) {
        newDeck = interleaved;
      }
    }
    const prevIds = deck.map(p => p.id).join(',');
    const newIds = newDeck.map(p => p.id).join(',');
    if (prevIds !== newIds) {
      // Adjust index intelligently
      if (currentId) {
        const stillPos = newDeck.findIndex(p => p.id === currentId);
        if (stillPos === -1) {
          // Current removed (liked/passed) – keep same numeric index so next card slides in
          if (index >= newDeck.length) {
            setIndex(0);
          }
        } else if (stillPos !== index) {
          setIndex(stillPos);
        }
      } else if (index >= newDeck.length && newDeck.length > 0) {
        setIndex(0);
      }
      setDeck(newDeck);
    } else if (index >= newDeck.length && newDeck.length > 0) {
      setIndex(0);
    }
  }, [allProfiles, currentUserId, posts, deck, index]);

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

  // Radial layout helpers (adaptive multi-ring)
  const renderGraph = () => {
    if (!currentUserProfile) return null;
    const first = graphData.first;
    const second = graphData.second;

    // Parameters
  const MIN_ARC_GAP = 18; // allow more spacing since nodes are smaller now
  const RING_PADDING = graphExpanded ? 80 : 46; // more distance -> longer edges when expanded
  const BASE_RADIUS = graphExpanded ? 90 : 54; // start further out in expanded view
  const MAX_SIZE = graphExpanded ? 520 : 320; // allow larger canvas when expanded

    // Compute required radius for a given node count so arc length >= MIN_ARC_GAP
    const radiusFor = (count: number, base: number) => {
      if (count <= 1) return base;
      const needed = MIN_ARC_GAP * count / (2 * Math.PI);
      return Math.max(base, needed);
    };

    let r1 = radiusFor(first.length, BASE_RADIUS);
    let r2 = r1 + RING_PADDING;
    let r3 = r2 + RING_PADDING; // potential third ring

    // If second ring overcrowded (too many second-degree nodes), spill to third ring
    const secondCap = Math.floor((2 * Math.PI * r2) / MIN_ARC_GAP);
    let secondRingNodes: typeof second = [];
    let thirdRingNodes: typeof second = [];
    if (second.length > secondCap) {
      secondRingNodes = second.slice(0, secondCap);
      thirdRingNodes = second.slice(secondCap);
    } else {
      secondRingNodes = second;
    }
    if (thirdRingNodes.length === 0) {
      // shrink r3 if unused
      r3 = r2;
    }

    // Final canvas size (diameter of largest ring + node diameter margin)
    const largestR = thirdRingNodes.length ? r3 : (secondRingNodes.length ? r2 : r1);
  const nodeDiameter = graphExpanded ? 28 : 34; // smaller nodes
    const size = Math.min(MAX_SIZE, Math.ceil(largestR * 2 + nodeDiameter + 12));
    const center = size / 2;

    const place = (count: number, radius: number, offset = -Math.PI / 2) => {
      if (count === 0) return [] as { x: number; y: number }[];
      return Array.from({ length: count }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / count + offset;
        return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
      });
    };
    // Asymmetric weighting: angle slots allocated proportional to descendant counts to reduce symmetry.
    const weightCounts = (nodes: BuilderProfile[]) => nodes.map(n => {
      const children = second.filter(s => (n.likedPosts||[]).includes(s.id)).length;
      return 1 + children; // base weight 1 + child count
    });
    const distribute = (nodes: BuilderProfile[], radius: number, phaseShift = 0) => {
      if (nodes.length === 0) return [] as {x:number;y:number}[];
      const weights = weightCounts(nodes);
      const total = weights.reduce((a,b)=>a+b,0);
      let angleCursor = -Math.PI/2 + phaseShift; // start top
      return nodes.map((n,i) => {
        const span = (2*Math.PI)*(weights[i]/total);
        const angle = angleCursor + span/2; // center of span
        angleCursor += span;
        return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
      });
    };
    const firstPos = distribute(first, r1, 0);
    const secondPos = distribute(secondRingNodes, r2, Math.PI/(secondRingNodes.length||1));
    const thirdPos = distribute(thirdRingNodes, r3, Math.PI/(thirdRingNodes.length||1));

    // Helper to push an edge with depth-based base opacity & selection highlighting.
    // depth: 0 center->first, 1 first->second, 2 outward
    const pushEdge = (
      acc: React.ReactElement[], key: string,
      ax: number, ay: number, bx: number, by: number,
      depth: number, aId: string, bId: string
    ) => {
      const dx = bx - ax; const dy = by - ay; const dist = Math.hypot(dx, dy); if (dist === 0) return;
      const angle = Math.atan2(dy, dx);
      const baseOpacity = depth === 0 ? 0.55 : depth === 1 ? 0.38 : 0.22; // subtler baseline (GitHub network vibe)
      const isHighlighted = !!selectedNode && (selectedNode === aId || selectedNode === bId);
      const dimFactor = selectedNode ? (isHighlighted ? 1 : 0.12) : 1;
      const opacity = baseOpacity * dimFactor + (isHighlighted ? 0.25 : 0); // bump highlighted edge visibility
      const color = isHighlighted ? '#ffffff' : '#30363d';
      acc.push(
        <View
          key={key}
          style={[styles.edgeLineBase, { backgroundColor: color, opacity, left: (ax+bx)/2 - dist/2, top: (ay+by)/2 - 0.5, width: dist, transform:[{ rotate: `${angle}rad` }] }]}
        />
      );
    };

    const renderEdges = () => {
      const edges: React.ReactElement[] = [];
      // Center -> first (depth 0)
  first.forEach((p,i) => pushEdge(edges, 'edge-f-'+p.id, center, center, firstPos[i].x, firstPos[i].y, 0, 'ME', p.id));
      // first -> second (depth 1)
      secondRingNodes.forEach((p, si) => {
        const parents = first.filter(f => (f.liked || []).includes(p.id));
        parents.forEach(parent => {
          const pi = first.indexOf(parent); if (pi === -1) return;
          pushEdge(edges, 'edge-s2-'+p.id+'-'+parent.id, firstPos[pi].x, firstPos[pi].y, secondPos[si].x, secondPos[si].y, 1, parent.id, p.id);
        });
      });
      // second/first -> third (depth 2)
      thirdRingNodes.forEach((p, ti) => {
        const parents = [...first, ...secondRingNodes].filter(f => (f.liked || []).includes(p.id));
        parents.forEach(parent => {
          const piFirst = first.indexOf(parent);
          const sourcePos = piFirst !== -1 ? firstPos[piFirst] : secondPos[secondRingNodes.indexOf(parent)];
          if (!sourcePos) return;
          pushEdge(edges, 'edge-s3-'+p.id+'-'+parent.id, sourcePos.x, sourcePos.y, thirdPos[ti].x, thirdPos[ti].y, 2, parent.id, p.id);
        });
      });
      return edges;
    };

    const ringConnectors = (positions: {x:number;y:number}[], style: any, prefix: string) => positions.length > 1 ? positions.map((pos,i) => {
      const next = positions[(i+1)%positions.length]; const dx = next.x - pos.x; const dy = next.y - pos.y; const dist = Math.hypot(dx,dy); const angle = Math.atan2(dy,dx); const midX = (pos.x + next.x)/2; const midY = (pos.y + next.y)/2; return <View key={prefix + i} style={[style,{ left: midX - dist/2, top: midY - 0.5, width: dist, transform:[{ rotate: `${angle}rad` }] }]} />; }) : null;

    return (
      <View style={styles.graphWrapper}>
        <View style={[styles.graphCanvas,{ width: size, height: size }]}>          
          {renderEdges()}
          {/* Center node */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedNode(s => s === 'ME' ? null : 'ME')}
            style={[styles.node, styles.nodeMe,
              selectedNode === 'ME' && styles.nodeSelected,
              { left: center - (graphExpanded?16:20), top: center - (graphExpanded?16:20), width: graphExpanded?32:40, height: graphExpanded?32:40, borderRadius: graphExpanded?16:20 }]}>
            <Text style={styles.nodeLabel}>{currentUserProfile.displayName?.[0] || 'U'}</Text>
          </TouchableOpacity>
          {/* First ring */}
          {first.map((p,i) => (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.8}
              onPress={() => setSelectedNode(s => s === p.id ? null : p.id)}
              style={[styles.node, styles.nodeFirst,
                selectedNode === p.id && styles.nodeSelected,
                { width: graphExpanded?26:36, height: graphExpanded?26:36, borderRadius: graphExpanded?13:18, left: firstPos[i].x - (graphExpanded?13:18), top: firstPos[i].y - (graphExpanded?13:18) }]}>
              <Text style={[styles.nodeLabel,{fontSize: graphExpanded?11:14}]}>{p.displayName?.[0] || '?'}</Text>
            </TouchableOpacity>
          ))}
          {/* Second ring */}
          {secondRingNodes.map((p,i) => (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.8}
              onPress={() => setSelectedNode(s => s === p.id ? null : p.id)}
              style={[styles.node, styles.nodeSecond,
                selectedNode === p.id && styles.nodeSelected,
                { width: graphExpanded?22:28, height: graphExpanded?22:28, borderRadius: graphExpanded?11:14, left: secondPos[i].x - (graphExpanded?11:14), top: secondPos[i].y - (graphExpanded?11:14) }]}>
              <Text style={[styles.nodeLabelSmall,{fontSize: graphExpanded?10:12}]}>{p.displayName?.[0] || '?'}</Text>
            </TouchableOpacity>
          ))}
          {/* Third ring (reuse nodeSecond style for now) */}
          {thirdRingNodes.map((p,i) => (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.8}
              onPress={() => setSelectedNode(s => s === p.id ? null : p.id)}
              style={[styles.node, styles.nodeSecond,
                selectedNode === p.id && styles.nodeSelected,
                { width: graphExpanded?22:28, height: graphExpanded?22:28, borderRadius: graphExpanded?11:14, left: thirdPos[i].x - (graphExpanded?11:14), top: thirdPos[i].y - (graphExpanded?11:14), opacity:0.9 }]}>
              <Text style={[styles.nodeLabelSmall,{fontSize: graphExpanded?10:12}]}>{p.displayName?.[0] || '?'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.graphMeta}>{first.length} direct • {second.length} extended {graphExpanded ? '(expanded)' : ''}</Text>
        {first.length === 0 && (
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
      <TouchableOpacity onPress={() => setGraphExpanded(e => !e)} style={styles.graphToggle} accessibilityLabel={graphExpanded? 'Collapse graph' : 'Expand graph'}>
        <Text style={styles.graphToggleText}>{graphExpanded ? 'Collapse' : 'Expand'}</Text>
      </TouchableOpacity>
      {!graphExpanded && (
      <View style={styles.flexDeckWrapper}>
        <View style={styles.flexCardRegion}>
          {currentUserProfile && !allProfiles.find(p => p.id === currentUserProfile.id && (p.likedPosts || p.liked || p.ideaTitle !== undefined)) && (
            <View style={styles.onboardingBanner}>
              <Text style={styles.onboardingTitle}>Welcome!</Text>
              <Text style={styles.onboardingBody}>Create a post so others can discover your project. Your own profile doc was just initialized.</Text>
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
            <>
              <ProfileCard post={deck[index]} />
              <View style={styles.inlineActionsRow}>
                <TouchableOpacity accessibilityLabel="Pass on this builder" style={[styles.rowActionPill, styles.passPill]} onPress={handlePass}>
                  <Text style={styles.passActionText}>Pass</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={demoMode}
                  accessibilityLabel={demoMode ? 'Connect disabled in demo mode' : 'Connect with this builder'}
                  style={[styles.rowActionPill, styles.connectPill, demoMode && { opacity: 0.4 }]}
                  onPress={() => handleLike(deck[index].id)}>
                  <Text style={styles.likeActionText}>{demoMode ? 'Connect (Auth Required)' : 'Connect'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        {/* Removed fixed bottomActionBar; actions now inline under card */}
      </View>) }
      {lastRemoteError && (
        <View style={styles.remoteErrorBanner}>
          <Text style={styles.remoteErrorText}>Remote error: {lastRemoteError}</Text>
          {permissionDiagnosis && (
            <Text style={styles.remoteDiagnosisText}>{permissionDiagnosis}</Text>
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
  edgeLineBase: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#ffffff'
  },
  // Legacy styles retained (can remove later once confident) -----------------
  edgeLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#2f3f45'
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
    backgroundColor: '#1f6feb', // GitHub blue accent
    borderWidth: 2,
    borderColor: '#388bfd'
  },
  nodeFirst: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#238636', // GitHub green
    borderWidth: 2,
    borderColor: '#2ea043'
  },
  nodeSecond: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#30363d',
    borderWidth: 2,
    borderColor: '#484f58'
  },
  nodeSelected: {
    shadowColor: '#ffffff',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    borderColor: '#ffffff'
  },
  nodeLabel: { color: 'white', fontWeight: '700', fontSize: 14 },
  nodeLabelSmall: { color: 'white', fontWeight: '600', fontSize: 12 },
  graphMeta: { color: '#888', fontSize: 12 },
  graphHint: { color: '#666', fontSize: 12, marginTop: 4 },
  graphTitle: { color: 'white', fontSize: 18, fontWeight: '600' },
  graphSubtitle: { color: '#aaa', marginTop: 4, fontSize: 13 },
  deckArea: { height: CARD_AREA_HEIGHT, width: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' }, // legacy style (unused for new flex layout)
  flexDeckWrapper: { flex: 1, width: '100%', position: 'relative' },
  flexCardRegion: { flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  emptyDeck: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyDeckText: { color: '#aaa', fontSize: 16, textAlign: 'center' },
  inlineReset: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#334155' },
  inlineResetText: { color: '#60a5fa', fontSize: 13, fontWeight: '500' },
  cardContainer: { position: 'absolute', width: SCREEN.width * 0.9, height: '100%' },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    maxHeight: '75%', // ensure space for bottom bar
  },
  cardInner: { flexGrow: 1 },
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
  smallActionButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30, minWidth: 100, alignItems: 'center' },
  // (Removed bottomActionBar/actionPill; replaced by inlineActionsRow under card)
  inlineActionsRow: { flexDirection: 'row', marginTop: 16, gap: 16 },
  rowActionPill: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 40 },
  passPill: { backgroundColor: '#2a1a1a', borderWidth: 1, borderColor: '#442222' },
  connectPill: { backgroundColor: '#142a20', borderWidth: 1, borderColor: '#1f4736' },
  bottomBarEmptyText: { color: '#555', fontSize: 13, textAlign: 'center', flex: 1, paddingVertical: 6 }, // legacy
  onboardingBanner: { position:'absolute', top:0, left:0, right:0, backgroundColor:'#1e293b', padding:12, borderRadius:16, borderWidth:1, borderColor:'#334155', zIndex:10 },
  onboardingTitle: { color:'#93c5fd', fontSize:12, fontWeight:'700', marginBottom:4 },
  onboardingBody: { color:'#cbd5e1', fontSize:12, lineHeight:16 },
  remoteErrorBanner: { position:'absolute', top: 8, left: 0, right: 0, alignItems:'center' },
  remoteErrorText: { color:'#f87171', fontSize:12 },
  remoteDiagnosisText: { color:'#fda4af', fontSize:11, marginTop:4, paddingHorizontal:12, textAlign:'center' }
  ,graphToggle: { position:'absolute', bottom: 18, right: 18, backgroundColor:'#1f2937', paddingHorizontal:16, paddingVertical:10, borderRadius:24, borderWidth:1, borderColor:'#334155', zIndex:40, shadowColor:'#000', shadowOpacity:0.35, shadowRadius:6, shadowOffset:{width:0,height:3} },
  graphToggleText: { color:'#93c5fd', fontSize:12, fontWeight:'600' }
});