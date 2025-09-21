// Firebase removed for POC: using pure in-memory dummy data.
// TODO(app/explore): Re-introduce Firebase (users + posts collections) once POC validated.
//  - Replace local initialization with Firestore listeners
//  - Move like handling back to updateDoc w/ optimistic UI
//  - Add security rules to constrain writes
//  - Consider a Cloud Function to derive mutual matches
import { auth, autoSignInIfNeeded, db, ensureAtLeastAnonymousAuth } from '@/constants/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, PanResponderInstance, Pressable, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ----------------------------------------------------------------------------------
// Graph View - Interactive Network Visualization
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
  email?: string | null;
  interests?: string[]; // added for popup summary
}

const LOCAL_USER_ID = 'local-current-user'; // Stable identifier so effects do not loop

// ----------------------------------------------------------------------------------
// Reusable dummy seed data (so we can perform an in-app reset without reload)
// TODO(app/explore reintegration): Remove these constants and fetch from Firestore w/ pagination.
// ----------------------------------------------------------------------------------
const INITIAL_PROFILES: BuilderProfile[] = [
  { id: 'demo-user-1', displayName: 'Alice', email:'alice@example.com', interests:['AI','Campus','Matching'], ideaTitle: 'AI Campus Concierge', ideaDescription: 'Campus assistant that forms micro sprint pods.', liked: [] },
  { id: 'demo-user-2', displayName: 'Bob', email:'bob@example.com', interests:['Realtime','Study','Focus'], ideaTitle: 'Realtime Study Matcher', ideaDescription: 'Pairs students based on current focus & energy.', liked: [] },
  { id: 'demo-user-3', displayName: 'Chloe', email:'chloe@example.com', interests:['Graph','Networking','Founders'], ideaTitle: 'Founders Graph', ideaDescription: 'Dynamic network that expands as you connect.', liked: [] },
  { id: 'demo-user-4', displayName: 'Devon', email:'devon@example.com', interests:['Internships','Skills','Talent'], ideaTitle: 'Micro-Internships Hub', ideaDescription: 'Short scoped product pushes validating skill.', liked: [] },
  { id: 'demo-user-5', displayName: 'Esha', email:'esha@example.com', interests:['Pitch','Video','Transcription'], ideaTitle: 'Pitch Replay Summarizer', ideaDescription: 'Transcribe & synthesize founder pitches.', liked: [] },
  { id: 'demo-user-6', displayName: 'Finn', email:'finn@example.com', interests:['Edge','Deployment','Infra'], ideaTitle: 'Edge Deploy Manager', ideaDescription: 'Zero-config edge function orchestrator.', liked: [] },
  { id: 'demo-user-7', displayName: 'Gia', email:'gia@example.com', interests:['Notes','Context','Docs'], ideaTitle: 'Contextual Notetaker', ideaDescription: 'Ambient notes auto-linking people & docs.', liked: [] },
  { id: 'demo-user-8', displayName: 'Hiro', email:'hiro@example.com', interests:['Performance','Tracing','Latency'], ideaTitle: 'Latency Budget Analyzer', ideaDescription: 'Trace ingestion + perf budget guidance.', liked: [] },
  { id: 'demo-user-9', displayName: 'Ivy', email:'ivy@example.com', interests:['Onboarding','Replay','Education'], ideaTitle: 'Onboarding Replay', ideaDescription: 'Interactive replays teaching internal flows.', liked: [] },
  { id: 'demo-user-10', displayName: 'Jules', email:'jules@example.com', interests:['Async','Standup','Summaries'], ideaTitle: 'Async Standup Synth', ideaDescription: 'Summarizes updates & flags blockers.', liked: [] }
];

export default function ExploreBuilders() {
  const [currentUserProfile, setCurrentUserProfile] = useState<BuilderProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<BuilderProfile[]>([]);
  const [remoteDisabled, setRemoteDisabled] = useState(false); // toggled if permission denied
  const [lastRemoteError, setLastRemoteError] = useState<string | null>(null);
  const [permissionDiagnosis, setPermissionDiagnosis] = useState<string | null>(null); // human-friendly classification
  // Reactive firebase user state (will update after onAuthStateChanged fires)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const demoMode = !firebaseUser; // if not signed in we're in demo/fallback
  const currentUserId = firebaseUser ? firebaseUser.uid : LOCAL_USER_ID;
  // Deck now directly uses profiles instead of posts
  const [initialized, setInitialized] = useState(false);
  // Graph now always in expanded mode; collapse logic removed
  // Graph interaction: selected node id ("ME" denotes current user) for highlight context
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  // Draggable node positions: map node id -> Animated.ValueXY
  const nodePositions = useRef<Record<string, Animated.ValueXY>>({}).current;
  const panResponders = useRef<Record<string, PanResponderInstance>>({}).current;
  // Pinned (persisted) absolute positions after user drags & releases.
  const [pinned, setPinned] = useState<Record<string,{x:number;y:number}>>({});
  // Home (original layout) positions cached each render pass for reset logic.
  const homePositions = useRef<Record<string,{x:number;y:number}>>({}).current;
  // Track node sizes for boundary clamping
  const nodeSizesRef = useRef<Record<string, number>>({});
  // Track current graph canvas size
  const graphBoundsRef = useRef<{ size: number }>({ size: 0 });

  const ensureAnimated = (id: string, base: {x:number;y:number}) => {
    if (!nodePositions[id]) {
      nodePositions[id] = new Animated.ValueXY({ x: base.x, y: base.y });
    }
    return nodePositions[id];
  };

  // Track drag meta per node to differentiate taps from drags
  const dragMetaRef = useRef<Record<string,{dragging:boolean}>>({});

  // springBack retained (currently unused after persistent positioning) for potential future reset feature
  const springBack = (id: string, to: {x:number;y:number}) => {
    const pos = nodePositions[id];
    if (!pos) return;
    Animated.spring(pos, { toValue: { x: to.x, y: to.y }, useNativeDriver: false, friction: 6, tension: 60 }).start();
  };

  const ensurePan = (id: string, getHome: () => {x:number;y:number}) => {
    if (panResponders[id]) return panResponders[id];
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // bring to front by selecting (optional visual)
        setSelectedNode(prev => prev === id ? prev : id);
        // Mark drag meta
        dragMetaRef.current[id] = { dragging: false };
      },
      onPanResponderMove: (_, gesture) => {
        const base = getHome(); // base already accounts for pinned location
        const pos = ensureAnimated(id, base);
        const dist = Math.hypot(gesture.dx, gesture.dy);
        const DRAG_THRESHOLD = 6; // pixels before we treat as drag
        if (!dragMetaRef.current[id]?.dragging) {
          if (dist < DRAG_THRESHOLD) return; // ignore tiny movements (tap)
          // Transition into dragging: establish pinned baseline if absent
          dragMetaRef.current[id] = { dragging: true };
          if (!pinned[id]) {
            setPinned(prev => ({ ...prev, [id]: base }));
          }
        }
        // Actively dragging
        if (dragMetaRef.current[id]?.dragging) {
          const size = graphBoundsRef.current.size;
          const diam = nodeSizesRef.current[id] || 24;
          const maxXY = Math.max(0, size - diam);
          const nx = Math.max(0, Math.min(maxXY, base.x + gesture.dx));
          const ny = Math.max(0, Math.min(maxXY, base.y + gesture.dy));
          pos.setValue({ x: nx, y: ny });
          requestAnimationFrame(() => setEdgeVersion(v => v + 1));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const base = getHome();
        const pos = ensureAnimated(id, base);
        if (!dragMetaRef.current[id]?.dragging) {
          // Treat as tap only: do not reposition or pin.
          return;
        }
        // Drag release with slight inertial nudge
        const nudgeScale = 0.12;
        let dragX = base.x + gesture.dx + Math.max(-40, Math.min(40, gesture.vx * 100 * nudgeScale));
        let dragY = base.y + gesture.dy + Math.max(-40, Math.min(40, gesture.vy * 100 * nudgeScale));
        const size = graphBoundsRef.current.size;
        const diam = nodeSizesRef.current[id] || 24;
        const maxXY = Math.max(0, size - diam);
        const target = { x: Math.max(0, Math.min(maxXY, dragX)), y: Math.max(0, Math.min(maxXY, dragY)) };
        Animated.timing(pos, { toValue: target, duration: 140, useNativeDriver: false }).start(() => {
          setPinned(prev => ({ ...prev, [id]: target }));
          setEdgeVersion(v => v + 1);
        });
      },
      onPanResponderTerminate: () => {
        // If gesture cancelled, pin wherever it currently is.
        const av: any = nodePositions[id];
        if (av && av.x && typeof av.x._value === 'number') {
          const cur = { x: av.x._value, y: av.y._value };
          setPinned(prev => ({ ...prev, [id]: cur }));
          setEdgeVersion(v => v + 1);
        }
      }
    });
    panResponders[id] = responder;
    return responder;
  };
  // Edge version used to force re-render when positions mutate outside React state
  const [edgeVersion, setEdgeVersion] = useState(0);

  // When selection cleared, animate all non-selected pinned nodes back to their home layout.
  useEffect(() => {
    if (selectedNode !== null) return; // only when fully deselecting
    // For each pinned node, animate back to its original home and remove pin afterward
    Object.keys(pinned).forEach(id => {
      const home = homePositions[id];
      if (!home) return;
      const av = ensureAnimated(id, pinned[id]);
      Animated.timing(av, { toValue: home, duration: 180, useNativeDriver: false }).start(() => {
        setPinned(prev => {
          const cp = { ...prev };
          delete cp[id];
          return cp;
        });
        setEdgeVersion(v => v + 1);
      });
    });
  }, [selectedNode]);

  // Explicit reset invoked on any outside click (graph canvas background or deck area) regardless of selection state
  const resetAllNodes = () => {
    // Deselect
    setSelectedNode(null);
    // Animate/push any currently displaced nodes back
    Object.keys(pinned).forEach(id => {
      const home = homePositions[id];
      if (!home) return;
      const av = ensureAnimated(id, pinned[id]);
      Animated.timing(av, { toValue: home, duration: 160, useNativeDriver: false }).start(() => {
        setPinned(prev => {
          const cp = { ...prev }; delete cp[id]; return cp; });
        setEdgeVersion(v => v + 1);
      });
    });
  };

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
            email: firebaseUser.email || null,
            ideaTitle: null,
            ideaDescription: null,
            liked: [],
            likedPosts: [],
            passedPosts: [],
            university: null,
            interests: [],
            linkedinUrl: null,
            websiteUrl: null,
            onboardingComplete: false,
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
    const localUser: BuilderProfile = { id: LOCAL_USER_ID, displayName: 'You', email: 'you@example.com', ideaTitle: 'Your Idea TBD', ideaDescription: 'Add your profile later.', liked: [], interests: ['Networking', 'Innovation', 'Startups'] };
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
        const remoteProfiles: BuilderProfile[] = snapshot.docs.map(docSnap => {
          const data: any = docSnap.data() || {};
          return {
            id: docSnap.id,
            displayName: data.displayName,
            email: data.email ?? null,
            ideaTitle: data.ideaTitle,
            ideaDescription: data.ideaDescription,
            liked: Array.isArray(data.liked) ? data.liked : [],
            likedPosts: Array.isArray(data.likedPosts) ? data.likedPosts : [],
            passedPosts: Array.isArray(data.passedPosts) ? data.passedPosts : [],
            interests: Array.isArray(data.interests) ? data.interests : []
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
    // Posts functionality removed - graph view only
  }, [firebaseUser, remoteDisabled]);

  // Derive current user profile
  useEffect(() => {
    const me = allProfiles.find(p => p.id === currentUserId) || null;
    setCurrentUserProfile(me || null);
  }, [allProfiles, currentUserId]);

  const resetDemo = useCallback(() => {
    const localUser: BuilderProfile = { id: LOCAL_USER_ID, displayName: 'You', email: 'you@example.com', ideaTitle: 'Your Idea TBD', ideaDescription: 'Add your profile later.', liked: [], interests: ['Networking', 'Innovation', 'Startups'] };
    setAllProfiles([localUser, ...INITIAL_PROFILES]);
    setCurrentUserProfile(localUser);
  }, []);

  // Placeholder graph nodes (will be replaced in next step)
  // Build first & second degree sets for graph
  const graphData = useMemo(() => {
    if (!currentUserProfile) return { first: [] as BuilderProfile[], second: [] as BuilderProfile[] };
    // First ring: people the current user has liked (person-level likes)
    const likedPeople = new Set(currentUserProfile.liked || []);
    const first = allProfiles.filter(p => likedPeople.has(p.id));
    // Second ring: people liked by first-ring users, excluding me and already-liked
    const secondIds = new Set<string>();
    first.forEach(f => (f.liked || []).forEach(pid => {
      if (pid !== currentUserProfile.id && !likedPeople.has(pid)) secondIds.add(pid);
    }));
    const second = allProfiles.filter(p => secondIds.has(p.id));
    return { first, second };
  }, [currentUserProfile, allProfiles]);

  // Radial layout helpers (adaptive multi-ring)
  const renderGraph = () => {
    if (!currentUserProfile) return null;
    const first = graphData.first;
    const second = graphData.second;

    // Parameters
  const MIN_ARC_GAP = 20; // slightly larger minimum arc spacing
  const RING_PADDING = 110; // more space between rings
  const BASE_RADIUS = 140;  // larger base radius for first ring spread
  const MAX_SIZE = 520;    // always expanded size

    // --- Simplified ring layout (ignore previous complex attempts) -----------------
    // Direct connections -> ring 1, extended -> ring 2, overflow -> ring 3.
    const radiusFor = (count: number, base: number) => {
      if (count <= 1) return base;
      // Ensure minimum arc gap
      const needed = MIN_ARC_GAP * count / (2 * Math.PI);
      return Math.max(base, needed);
    };

    let r1 = radiusFor(first.length, BASE_RADIUS);
    let r2 = r1 + RING_PADDING;
    let r3 = r2 + RING_PADDING;

    const ring2Cap = Math.floor((2 * Math.PI * r2) / MIN_ARC_GAP);
    let secondRingNodes: typeof second = [];
    let thirdRingNodes: typeof second = [];
    if (second.length > ring2Cap) {
      secondRingNodes = second.slice(0, ring2Cap);
      thirdRingNodes = second.slice(ring2Cap);
    } else {
      secondRingNodes = second;
    }
    if (thirdRingNodes.length === 0) r3 = r2;

  // Final canvas size & potential uniform scale so entire graph fits.
  let largestR = thirdRingNodes.length ? r3 : (secondRingNodes.length ? r2 : r1);
  const nodeDiameter = 32; // reference diameter including center sizing margin
  const windowDims = Dimensions.get('window');
  const windowWidth = windowDims.width;
  const windowHeight = windowDims.height;
  const rawCanvasSize = Math.ceil(largestR * 2 + nodeDiameter + 8);
  const maxSizeByWidth = windowWidth - 32;
  // Since graph section is 60% of screen, use more of that available space
  const graphSectionHeight = windowHeight * 0.6; // 60% of screen for graph section
  const maxSizeByHeight = Math.max(200, Math.floor(graphSectionHeight - 80)); // Leave space for meta text and padding
  const maxAllowed = Math.min(MAX_SIZE, maxSizeByWidth, maxSizeByHeight);
  let scale = 1;
  if (rawCanvasSize > maxAllowed) {
    scale = maxAllowed / rawCanvasSize;
    r1 *= scale; r2 *= scale; r3 *= scale; largestR *= scale;
  }
  const size = Math.ceil(Math.min(rawCanvasSize * scale, maxAllowed));
  graphBoundsRef.current.size = size;
  const center = size / 2;

    const place = (count: number, radius: number, offset = -Math.PI / 2) => {
      if (count === 0) return [] as { x: number; y: number }[];
      return Array.from({ length: count }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / count + offset;
        return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
      });
    };
    // Simple deterministic hash (0..1) for jitter
    const hash01 = (id: string) => {
      let h = 0; for (let i=0;i<id.length;i++) h = (h*131 + id.charCodeAt(i)) >>> 0;
      return (h & 0xffffff) / 0xffffff;
    };
    // Slight noise so rings aren't perfectly circular
    const ANGLE_JITTER_MAX = 0.09; // ~5.15 degrees
    const RADIAL_JITTER_FRAC = 0.06; // ±6% radial variation
    const placeRingNeat = (nodes: BuilderProfile[], radius: number) => {
      const N = nodes.length;
      if (N === 0) return [] as {x:number;y:number}[];
      return nodes.map((n, i) => {
        const baseAngle = -Math.PI/2 + (2*Math.PI * i)/N; // start at top
        const rA = hash01(n.id + ':a');
        const rB = hash01(n.id + ':b');
        const angle = baseAngle + (rA - 0.5) * 2 * ANGLE_JITTER_MAX;
        const rad = radius + (rB - 0.5) * 2 * radius * RADIAL_JITTER_FRAC;
        return { x: center + rad * Math.cos(angle), y: center + rad * Math.sin(angle) };
      });
    };
    // Generate ring positions
    let firstPos = placeRingNeat(first, r1);
    let secondPos = placeRingNeat(secondRingNodes, r2);
    let thirdPos = placeRingNeat(thirdRingNodes, r3);

    // Enforce non-overlap along each ring (simple angular spacing correction)
    const separateRing = (positions: {x:number;y:number}[], radius: number, nodeDiam: number, margin = 4) => {
      if (positions.length < 2) return positions;
      // Map to angles
      const items = positions.map((p,i) => ({ i, angle: Math.atan2(p.y - center, p.x - center) }));
      const minArc = nodeDiam + margin; // required linear arc
      const minAngle = minArc / radius;  // radians
      items.sort((a,b)=> a.angle - b.angle);
      // Single forward pass to push overlaps
      for (let k=0; k<items.length; k++) {
        const cur = items[k];
        const nxt = items[(k+1)%items.length];
        let diff = nxt.angle - cur.angle;
        if (k === items.length -1) diff = (nxt.angle + Math.PI*2) - cur.angle; // wrap segment
        if (diff < minAngle) {
          const needed = minAngle - diff;
          // distribute half shift to each side except wrap case to avoid drift
          cur.angle -= needed/2;
          nxt.angle += needed/2;
        }
      }
      // Normalize and rebuild
      return items.map(it => ({ x: center + radius * Math.cos(it.angle), y: center + radius * Math.sin(it.angle) }));
    };
    firstPos = separateRing(firstPos, r1, 26, 6);
    secondPos = separateRing(secondPos, r2, 22, 6);
    thirdPos = separateRing(thirdPos, r3, 22, 6);


    // Helper to push an edge with depth-based base opacity & selection highlighting.
    // depth: 0 center->first, 1 first->second, 2 outward
    const pushEdge = (
      acc: React.ReactElement[], key: string,
      ax: number, ay: number, bx: number, by: number,
      depth: number, aId: string, bId: string
    ) => {
      const dx = bx - ax; const dy = by - ay; const dist = Math.hypot(dx, dy); if (dist === 0) return;
      const angle = Math.atan2(dy, dx);
  const baseOpacity = depth === 0 ? 0.72 : depth === 1 ? 0.52 : 0.34; // brighter baseline
  const isHighlighted = !!selectedNode && (selectedNode === aId || selectedNode === bId);
  // When something is selected, keep non-involved edges visible (dim but not invisible)
  const dimFactor = selectedNode ? (isHighlighted ? 1 : 0.28) : 1;
  const opacity = baseOpacity * dimFactor + (isHighlighted ? 0.22 : 0); // highlighted edges still get a slight bump
  const color = isHighlighted ? '#ffffff' : '#3a424a'; // lighten non-highlight color a bit
      acc.push(
        <View
          key={key}
          style={[styles.edgeLineBase, { backgroundColor: color, opacity, left: (ax+bx)/2 - dist/2, top: (ay+by)/2 - 0.5, width: dist, transform:[{ rotate: `${angle}rad` }] }]}
        />
      );
    };

    const currentPosFor = (id: string, fallback: {x:number;y:number}) => {
      const av: any = nodePositions[id];
      if (!av) return fallback;
      // Try standard Animated.ValueXY internal shape
      if (av.x && typeof av.x._value === 'number' && av.y && typeof av.y._value === 'number') {
        return { x: av.x._value, y: av.y._value };
      }
      // Fallback attempt if stored differently
      if (typeof av._value === 'object' && typeof av._value.x === 'number' && typeof av._value.y === 'number') {
        return { x: av._value.x, y: av._value.y };
      }
      return fallback;
    };

    const renderEdges = () => {
      const edges: React.ReactElement[] = [];
      const used = new Set<string>(); // normalized pair keys idA|idB

      const addEdge = (
        aId: string, bId: string,
        aCenter: {x:number;y:number}, bCenter: {x:number;y:number}, depth: number,
        keyPrefix: string
      ) => {
        if (aId === bId) return;
        const keyNorm = aId < bId ? aId + '|' + bId : bId + '|' + aId;
        if (used.has(keyNorm)) return;
        used.add(keyNorm);
        pushEdge(edges, `${keyPrefix}-${aId}-${bId}`, aCenter.x, aCenter.y, bCenter.x, bCenter.y, depth, aId, bId);
      };

      // Center position (ME)
      const mePos = currentPosFor('ME', { x: center - 16, y: center - 16 });
      const meCenter = { x: mePos.x + 16, y: mePos.y + 16 };

      // Helper to get center coordinate for node by ring
      const nodeCenter = (id: string) => {
        if (id === 'ME') return meCenter;
        const inFirst = first.findIndex(p => p.id === id);
        if (inFirst !== -1) {
          const raw = currentPosFor(id, { x: firstPos[inFirst].x - 13, y: firstPos[inFirst].y - 13 });
          return { x: raw.x + 13, y: raw.y + 13 };
        }
        const inSecond = secondRingNodes.findIndex(p => p.id === id);
        if (inSecond !== -1) {
          const raw = currentPosFor(id, { x: secondPos[inSecond].x - 11, y: secondPos[inSecond].y - 11 });
          return { x: raw.x + 11, y: raw.y + 11 };
        }
        const inThird = thirdRingNodes.findIndex(p => p.id === id);
        if (inThird !== -1) {
          const raw = currentPosFor(id, { x: thirdPos[inThird].x - 11, y: thirdPos[inThird].y - 11 });
          return { x: raw.x + 11, y: raw.y + 11 };
        }
        return meCenter; // fallback
      };

      // 1. Center -> first (depth 0)
      first.forEach(p => {
        addEdge('ME', p.id, meCenter, nodeCenter(p.id), 0, 'edge-f');
      });

      // 2. First ring internal connections (any like either direction) depth 0
      for (let i = 0; i < first.length; i++) {
        const a = first[i];
        for (let j = i + 1; j < first.length; j++) {
          const b = first[j];
            if ((a.liked||[]).includes(b.id) || (b.liked||[]).includes(a.id)) {
              addEdge(a.id, b.id, nodeCenter(a.id), nodeCenter(b.id), 0, 'edge-fc');
            }
        }
      }

      // 3. First <-> Second (depth 1): connect if there is a person-level like either direction
      secondRingNodes.forEach(sec => {
        first.forEach(f => {
          if ((f.liked||[]).includes(sec.id) || (sec.liked||[]).includes(f.id)) {
            addEdge(f.id, sec.id, nodeCenter(f.id), nodeCenter(sec.id), 1, 'edge-s2');
          }
        });
      });

      // 4. Second/First -> third (depth 2) (existing outward logic, either direction)
      thirdRingNodes.forEach(third => {
        [...first, ...secondRingNodes].forEach(parent => {
          if ((parent.liked||[]).includes(third.id) || (third.liked||[]).includes(parent.id)) {
            const depth = first.some(f => f.id === parent.id) ? 2 : 2; // keep 2 for styling consistency
            addEdge(parent.id, third.id, nodeCenter(parent.id), nodeCenter(third.id), depth, 'edge-s3');
          }
        });
      });

      return edges;
    };

    const ringConnectors = (positions: {x:number;y:number}[], style: any, prefix: string) => positions.length > 1 ? positions.map((pos,i) => {
      const next = positions[(i+1)%positions.length]; const dx = next.x - pos.x; const dy = next.y - pos.y; const dist = Math.hypot(dx,dy); const angle = Math.atan2(dy,dx); const midX = (pos.x + next.x)/2; const midY = (pos.y + next.y)/2; return <View key={prefix + i} style={[style,{ left: midX - dist/2, top: midY - 0.5, width: dist, transform:[{ rotate: `${angle}rad` }] }]} />; }) : null;

    // Cache home positions for reset logic (raw layout centers minus radius offsets used for left/top positioning)
  homePositions['ME'] = { x: center - 16, y: center - 16 }; nodeSizesRef.current['ME'] = 32;
  first.forEach((p,i) => { homePositions[p.id] = { x: firstPos[i].x - 13, y: firstPos[i].y - 13 }; nodeSizesRef.current[p.id] = 26; });
  secondRingNodes.forEach((p,i) => { homePositions[p.id] = { x: secondPos[i].x - 11, y: secondPos[i].y - 11 }; nodeSizesRef.current[p.id] = 22; });
  thirdRingNodes.forEach((p,i) => { homePositions[p.id] = { x: thirdPos[i].x - 11, y: thirdPos[i].y - 11 }; nodeSizesRef.current[p.id] = 22; });

    return (
      <View style={styles.graphWrapper}>
  <Pressable style={[styles.graphCanvas,{ width: size, height: size }]} onPress={resetAllNodes}>
          {renderEdges()}
          {/* Center node */}
          {(() => {
            const home = pinned['ME'] ? pinned['ME'] : homePositions['ME'];
            const id = 'ME';
            const pos = ensureAnimated(id, home);
            const pan = ensurePan(id, () => (pinned['ME'] ? pinned['ME'] : homePositions['ME']));
            const isSel = selectedNode === id;
            return (
              <Animated.View
                {...pan.panHandlers}
                style={[styles.node, styles.nodeMe, isSel && styles.nodeSelected, { position:'absolute', left: pos.x, top: pos.y, width:32, height:32, borderRadius:16 }]}
              >
                <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedNode(s => s === id ? null : id)}>
                  <Text style={styles.nodeLabel}>{(currentUserProfile.email || currentUserProfile.displayName || 'User').trim()[0]?.toUpperCase() || 'U'}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })()}
          {/* First ring */}
          {first.map((p,i) => {
            const defaultHome = homePositions[p.id];
            const home = pinned[p.id] ? pinned[p.id] : defaultHome;
            const pos = ensureAnimated(p.id, home);
            const pan = ensurePan(p.id, () => (pinned[p.id] ? pinned[p.id] : homePositions[p.id]));
            const isSel = selectedNode === p.id;
            return (
              <Animated.View key={p.id} {...pan.panHandlers} style={[styles.node, styles.nodeFirst, isSel && styles.nodeSelected, { left: pos.x, top: pos.y, width:26, height:26, borderRadius:13 }]}> 
                <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedNode(s => s === p.id ? null : p.id)}>
                  <Text style={[styles.nodeLabel,{fontSize:11}]}>{(p.email || p.displayName || '?').trim()[0]?.toUpperCase() || '?'}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
          {/* Second ring */}
          {secondRingNodes.map((p,i) => {
            const defaultHome = homePositions[p.id];
            const home = pinned[p.id] ? pinned[p.id] : defaultHome;
            const pos = ensureAnimated(p.id, home);
            const pan = ensurePan(p.id, () => (pinned[p.id] ? pinned[p.id] : homePositions[p.id]));
            const isSel = selectedNode === p.id;
            return (
              <Animated.View key={p.id} {...pan.panHandlers} style={[styles.node, styles.nodeSecond, isSel && styles.nodeSelected, { left: pos.x, top: pos.y, width:22, height:22, borderRadius:11 }]}> 
                <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedNode(s => s === p.id ? null : p.id)}>
                  <Text style={[styles.nodeLabelSmall,{fontSize:10}]}>{(p.email || p.displayName || '?').trim()[0]?.toUpperCase() || '?'}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
          {/* Third ring (reuse nodeSecond style for now) */}
          {thirdRingNodes.map((p,i) => {
            const defaultHome = homePositions[p.id];
            const home = pinned[p.id] ? pinned[p.id] : defaultHome;
            const pos = ensureAnimated(p.id, home);
            const pan = ensurePan(p.id, () => (pinned[p.id] ? pinned[p.id] : homePositions[p.id]));
            const isSel = selectedNode === p.id;
            return (
              <Animated.View key={p.id} {...pan.panHandlers} style={[styles.node, styles.nodeSecond, isSel && styles.nodeSelected, { left: pos.x, top: pos.y, width:22, height:22, borderRadius:11, opacity:0.9 }]}> 
                <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedNode(s => s === p.id ? null : p.id)}>
                  <Text style={[styles.nodeLabelSmall,{fontSize:9}]}>{(p.email || p.displayName || '?').trim()[0]?.toUpperCase() || '?'}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </Pressable>
  <Text style={styles.graphMeta}>{first.length} direct • {second.length} extended</Text>
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
      <View style={styles.splitLayoutContainer}>
        <Pressable style={styles.graphSection} onPress={resetAllNodes}>
          {renderGraph()}
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
        </Pressable>
        
        {/* Node Details Section */}
        <View style={styles.detailsSection}>
          {(() => {
            if (!selectedNode) {
              return (
                <View style={styles.noSelectionContainer}>
                  <Text style={styles.noSelectionText}>Click on any node to see details</Text>
                </View>
              );
            }
            
            const sel = selectedNode === 'ME' ? currentUserProfile : [...graphData.first, ...graphData.second].find(p => p.id === selectedNode);
            if (!sel) {
              return (
                <View style={styles.noSelectionContainer}>
                  <Text style={styles.noSelectionText}>Node details not found</Text>
                </View>
              );
            }
            
            const displayName = sel.displayName || 'Unknown';
            const email = sel.email || 'Unknown email';
            const ideaTitle = sel.ideaTitle || 'No project title';
            const ideaDescription = sel.ideaDescription || 'No project description';
            const interestsText = (sel.interests && sel.interests.length) ? sel.interests.slice(0,8).join(', ') : 'No interests listed';
            
            return (
              <View style={styles.nodeDetailsContainer}>
                <Text style={styles.detailsName}>{displayName}</Text>
                <Text style={styles.detailsIdeaTitle}>{ideaTitle}</Text>
                <Text style={styles.detailsIdeaDesc} numberOfLines={2}>{ideaDescription}</Text>
                <View style={styles.interestsContainer}>
                  <Text style={styles.interestsLabel}>Interests:</Text>
                  <Text style={styles.interestsText} numberOfLines={2}>{interestsText}</Text>
                </View>
              </View>
            );
          })()}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d0d0d' },
  splitLayoutContainer: { flex: 1 },
  graphSection: { flex: 0.7, backgroundColor:'#121212', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1f2937' },
  detailsSection: { 
    flex: 0.3, 
    backgroundColor: '#0d0d0d', 
    paddingHorizontal: 20, 
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937'
  },
  noSelectionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noSelectionText: {
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic'
  },
  nodeDetailsContainer: {
    flex: 1,
  },
  detailsName: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: '700',
    marginBottom: 4
  },
  detailsEmail: { 
    color: '#9ca3af', 
    fontSize: 13, 
    fontWeight: '500',
    marginBottom: 8
  },
  detailsIdeaTitle: { 
    color: '#34d399', 
    fontSize: 15, 
    fontWeight: '600',
    marginBottom: 4
  },
  detailsIdeaDesc: { 
    color: '#cbd5e1', 
    fontSize: 13, 
    lineHeight: 18,
    marginBottom: 12
  },
  interestsContainer: {
    marginTop: 4
  },
  interestsLabel: { 
    color: '#6b7280', 
    fontSize: 12, 
    fontWeight: '600',
    marginBottom: 4
  },
  interestsText: { 
    color: '#d1d5db', 
    fontSize: 12, 
    lineHeight: 16
  },
  graphPlaceholder: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#121212',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222'
  },
  graphWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
    paddingVertical: 8,
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
    backgroundColor: '#6d5bbf', // Heather / light purple tone
    borderWidth: 2,
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
    // Removed white/greenish outline highlight; keep subtle scale or glow minimal
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 }
  },
  nodeLabel: { color: 'white', fontWeight: '700', fontSize: 14 },
  nodeLabelSmall: { color: 'white', fontWeight: '600', fontSize: 12 },
  graphMeta: { color: '#888', fontSize: 12 },
  graphHint: { color: '#666', fontSize: 12, marginTop: 4 },
  resetButton: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  resetButtonText: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  inlineReset: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#334155' },
  inlineResetText: { color: '#60a5fa', fontSize: 13, fontWeight: '500' },
  remoteErrorBanner: { position:'absolute', top: 8, left: 0, right: 0, alignItems:'center' },
  remoteErrorText: { color:'#f87171', fontSize:12 },
  remoteDiagnosisText: { color:'#fda4af', fontSize:11, marginTop:4, paddingHorizontal:12, textAlign:'center' }
});