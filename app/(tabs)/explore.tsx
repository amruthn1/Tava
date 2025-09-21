// Firebase removed for POC: using pure in-memory dummy data.
// TODO(app/explore): Re-introduce Firebase (users + posts collections) once POC validated.
//  - Replace local initialization with Firestore listeners
//  - Move like handling back to updateDoc w/ optimistic UI
//  - Add security rules to constrain writes
//  - Consider a Cloud Function to derive mutual matches
// import { auth, db } from '@/constants/firebase';
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

// Simple static card (no gestures)
function ProfileCard({ profile }: { profile: BuilderProfile }) {
  return (
    <View style={styles.card}>      
      <View style={{ flex: 1 }}>
        <Text style={styles.ideaTitle}>{profile.ideaTitle || 'Untitled Idea'}</Text>
        <Text style={styles.author}>{profile.displayName || 'Anonymous Builder'}</Text>
        <Text style={styles.description} numberOfLines={6}>
          {profile.ideaDescription || 'No description provided yet.'}
        </Text>
      </View>
    </View>
  );
}

export default function ExploreBuilders() {
  const [currentUserProfile, setCurrentUserProfile] = useState<BuilderProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<BuilderProfile[]>([]);
  const [deck, setDeck] = useState<BuilderProfile[]>([]);
  const [index, setIndex] = useState(0); // pointer into deck
  // NOTE: In local mode we assume a signed-in user; once Firebase restored, swap back to auth.currentUser
  const currentUserId = LOCAL_USER_ID;
  // Deck now directly uses profiles instead of posts
  const [initialized, setInitialized] = useState(false);

  // Local initialize dummy data (runs once)
  useEffect(() => {
    if (initialized) return;
    // Inject local current user so we can mutate its liked array and trigger graph updates.
    const localUser: BuilderProfile = { id: currentUserId, displayName: 'You', ideaTitle: 'Your Idea TBD', ideaDescription: 'Add your profile later.', liked: [] };
    setAllProfiles([localUser, ...INITIAL_PROFILES]);
    setInitialized(true);
  }, [initialized, currentUserId]);

  // (Removed remote posts seeding – handled in local initialize above)

  // Subscribe to all user profiles (MVP: no pagination)
  // (Removed Firestore subscriptions in local dummy mode)

  // Subscribe to posts
  // (Removed Firestore subscriptions in local dummy mode)

  // Derive current user profile (if signed in) and build deck from profiles array directly.
  useEffect(() => {
    const me = allProfiles.find(p => p.id === currentUserId) || null;
    setCurrentUserProfile(me);
    if (!me) return;
    const likedSet = new Set(me.liked || []);
    const deckItems: BuilderProfile[] = allProfiles.filter(p => p.id !== me.id && !likedSet.has(p.id));
    setDeck(deckItems);
    setIndex(0);
  }, [allProfiles, currentUserId]);

  const advance = useCallback(() => {
    setIndex(prev => prev + 1);
  }, []);

  const handleLike = useCallback((id: string) => {
    setAllProfiles(prev => prev.map(p => {
      if (p.id === currentUserId) {
        const liked = new Set(p.liked || []);
        liked.add(id);
        return { ...p, liked: Array.from(liked) };
      }
      return p;
    }));
    advance();
  }, [currentUserId, advance]);

  const handlePass = useCallback(() => {
    advance();
  }, [advance]);

  // Reset demo: restore original dummy profiles & posts and clear likes
  const resetDemo = useCallback(() => {
    const localUser: BuilderProfile = { id: currentUserId, displayName: 'You', ideaTitle: 'Your Idea TBD', ideaDescription: 'Add your profile later.', liked: [] };
    setAllProfiles([localUser, ...INITIAL_PROFILES]);
    setDeck([]);
    setCurrentUserProfile(localUser);
    setIndex(0);
  }, [currentUserId]);

  // Placeholder graph nodes (will be replaced in next step)
  // Build first & second degree sets for graph
  const graphData = useMemo(() => {
    if (!currentUserProfile) return { first: [] as BuilderProfile[], second: [] as BuilderProfile[] };
    const likedIds = new Set(currentUserProfile.liked || []);
    const first = allProfiles.filter(p => likedIds.has(p.id));
    // Collect second-degree (liked of first) – flatten liked arrays of first-degree
    const secondIds = new Set<string>();
    first.forEach(f => (f.liked || []).forEach(id => {
      if (id !== currentUserProfile.id && !likedIds.has(id)) secondIds.add(id);
    }));
    const second = allProfiles.filter(p => secondIds.has(p.id));
    return { first, second };
  }, [currentUserProfile, allProfiles]);

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
        <TouchableOpacity accessibilityLabel="Reset demo network" onPress={resetDemo} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Reset Demo</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderGraph()}
      <View style={styles.deckArea}>
        {deck.length === 0 && (
          <View style={styles.emptyDeck}>            
            <Text style={styles.emptyDeckText}>No profiles available.</Text>
            <TouchableOpacity onPress={resetDemo} accessibilityLabel="Reset demo profiles" style={styles.inlineReset}>
              <Text style={styles.inlineResetText}>Reset Demo</Text>
            </TouchableOpacity>
          </View>
        )}
        {deck.length > 0 && index >= deck.length && (
          <View style={styles.emptyDeck}>            
            <Text style={styles.emptyDeckText}>No more profiles to view.</Text>
            <TouchableOpacity onPress={resetDemo} accessibilityLabel="Reset demo profiles" style={styles.inlineReset}>
              <Text style={styles.inlineResetText}>Start Over</Text>
            </TouchableOpacity>
          </View>
        )}
        {deck.length > 0 && index < deck.length && (
          <ProfileCard profile={deck[index]} />
        )}
      </View>
      {deck.length > 0 && index < deck.length && (
        <View style={styles.actionsOverlay}>
          <TouchableOpacity accessibilityLabel="Pass on this builder" style={[styles.smallActionButton, styles.passButton]} onPress={handlePass}>
            <Text style={styles.passActionText}>Pass</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Connect with this builder" style={[styles.smallActionButton, styles.likeButton]} onPress={() => handleLike(deck[index].id)}>
            <Text style={styles.likeActionText}>Connect</Text>
          </TouchableOpacity>
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