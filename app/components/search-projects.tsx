import { auth, db } from '@/constants/firebase';
import { POSTS_COLLECTION, Post } from '@/types/post';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { User, onAuthStateChanged } from 'firebase/auth';
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { OpenAI } from 'openai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface UserLite { id: string; displayName?: string | null; email?: string | null; interests?: string[] }

export default function SearchProjects() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<Record<string, UserLite>>({});
  const [isRanking, setIsRanking] = useState(false);
  const [bestId, setBestId] = useState<string | null>(null);
  const [rankError, setRankError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  // Add authentication state
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const currentUserId = firebaseUser?.uid;
  const [connectingUsers, setConnectingUsers] = useState<Set<string>>(new Set());
  const [connectedUsers, setConnectedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setFirebaseUser);
    return () => unsub();
  }, []);

  // Track current user's connections
  useEffect(() => {
    if (!currentUserId) return;
    
    const unsub = onSnapshot(doc(db, 'users', currentUserId), snap => {
      if (snap.exists()) {
        const data: any = snap.data() || {};
        const liked = Array.isArray(data.liked) ? data.liked : [];
        setConnectedUsers(new Set(liked));
      }
    });
    return () => unsub();
  }, [currentUserId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, POSTS_COLLECTION), snap => {
      const items: Post[] = snap.docs.map(d => {
        const data: any = d.data() || {};
        return {
          id: d.id,
          authorId: String(data.authorId),
          title: String(data.title || ''),
          description: data.description ? String(data.description) : undefined,
          createdAt: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : (data.createdAt ?? Date.now()),
          personType: data.personType ? String(data.personType) : undefined,
          skillsets: Array.isArray(data.skillsets) ? data.skillsets : undefined,
          peopleNeeded: data.peopleNeeded ? Number(data.peopleNeeded) : undefined,
          location: data.location || undefined,
        } as Post;
      });
      // newest first
      items.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
      setPosts(items);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const map: Record<string, UserLite> = {};
      snap.forEach(doc => {
        const d: any = doc.data() || {};
        map[doc.id] = { id: doc.id, displayName: d.displayName ?? null, email: d.email ?? null, interests: Array.isArray(d.interests) ? d.interests : [] };
      });
      setUsers(map);
    });
    return () => unsub();
  }, []);

  // --- Lightweight NLP similarity ranking -----------------------------------
  const STOP = new Set([
    'the','a','an','and','or','but','if','then','else','when','at','by','for','in','of','on','to','with','from','as','is','are','was','were','be','been','it','this','that','these','those','i','we','you','they','he','she','them','him','her','our','your','their','my','mine','ours','yours'
  ]);

  const synonyms: Record<string,string[]> = {
    'ai': ['artificial', 'intelligence', 'llm', 'gpt', 'openai', 'ml', 'machine', 'learning'],
    'ml': ['machine', 'learning', 'ai'],
    'nlp': ['language', 'text', 'semantic', 'embedding', 'chatbot'],
    'ios': ['iphone', 'swift', 'xcode', 'apple'],
    'android': ['kotlin', 'java', 'play', 'google'],
    'web': ['frontend', 'react', 'nextjs', 'javascript', 'typescript'],
    'backend': ['server', 'api', 'node', 'database'],
    'db': ['database', 'postgres', 'sql', 'nosql'],
    'startup': ['founder', 'founders', 'company', 'venture', 'saas'],
    'map': ['maps', 'geospatial', 'location', 'gps'],
  };

  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ') // collapse space
    .trim();

  const tokenize = (s: string) => normalize(s)
    .split(' ')
    .filter(t => t.length > 1 && !STOP.has(t));

  const expandTerms = (terms: string[]) => {
    const out = new Set<string>();
    for (const t of terms) {
      out.add(t);
      const syns = synonyms[t];
      if (syns) syns.forEach(x => out.add(x));
    }
    return Array.from(out);
  };

  // Precompute doc vectors for TF-IDF when posts/users change
  const corpus = useMemo(() => {
    const docs = posts.map(p => {
      const author = users[p.authorId];
      const authorText = [author?.displayName, author?.email, ...(author?.interests ?? [])].filter(Boolean).join(' ');
      const titleText = p.title || '';
      const descText = p.description || '';
      // Title terms boosted by duplicating them
      const docText = `${titleText} ${titleText} ${descText} ${authorText}`;
      const tokens = tokenize(docText);
      return { id: p.id, tokens };
    });
    // DF
    const df = new Map<string, number>();
    docs.forEach(d => {
      const seen = new Set<string>(d.tokens);
      seen.forEach(t => df.set(t, (df.get(t) || 0) + 1));
    });
    const N = Math.max(docs.length, 1);
    const idf = new Map<string, number>();
    df.forEach((v, k) => idf.set(k, Math.log((N + 1) / (v + 1)) + 1));
    // Build vectors
    const vectors = new Map<string, Map<string, number>>();
    docs.forEach(d => {
      const tf = new Map<string, number>();
      d.tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
      const vec = new Map<string, number>();
      tf.forEach((freq, term) => vec.set(term, freq * (idf.get(term) || 0)));
      vectors.set(d.id, vec);
    });
    return { idf, vectors };
  }, [posts, users]);

  const magnitude = (vec: Map<string, number>) => {
    let sum = 0;
    vec.forEach(v => { sum += v * v; });
    return Math.sqrt(sum);
  };

  const cosine = (a: Map<string, number>, b: Map<string, number>) => {
    // iterate over smaller
    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    let dot = 0;
    small.forEach((va, k) => {
      const vb = large.get(k);
      if (vb) dot += va * vb;
    });
    const ma = magnitude(a);
    const mb = magnitude(b);
    if (ma === 0 || mb === 0) return 0;
    return dot / (ma * mb);
  };

  const ranked = useMemo(() => {
    const q = query.trim();
    if (!q) return posts;
    // Build query vector
    const baseTerms = tokenize(q);
    const expanded = expandTerms(baseTerms);
    const tf = new Map<string, number>();
    expanded.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
    const qvec = new Map<string, number>();
    tf.forEach((freq, term) => qvec.set(term, freq * (corpus.idf.get(term) || 0)));

    // Score all posts
    const scored = posts.map(p => {
      const vec = corpus.vectors.get(p.id) || new Map();
      let score = cosine(qvec, vec);
      // Extra boost for direct substring in title
      const nq = normalize(q);
      const nt = normalize(p.title || '');
      if (nq.length > 0 && nt.includes(nq)) score += 0.2;
      return { post: p, score };
    });
    // Threshold and sort
    const MIN = 0.05; // small threshold
    return scored
      .filter(s => s.score >= MIN)
      .sort((a,b) => b.score - a.score)
      .map(s => s.post);
  }, [query, posts, corpus]);

  // --- GPT ranking on submit --------------------------------------------------
  const runGptRanking = async () => {
    const q = query.trim();
    setRankError(null);
    setBestId(null);
    if (!q) return;
    if (!posts.length) return;
    try {
      setHasSubmitted(true);
      setIsRanking(true);
      const shortlist = (ranked.length ? ranked : posts).slice(0, 15).map(p => {
        const author = users[p.authorId];
        return {
          id: p.id,
          title: p.title?.slice(0, 140) || '',
          description: (p.description || '').slice(0, 400),
          author: author?.displayName || author?.email || 'Unknown',
        };
      });
      const openai = new OpenAI({ apiKey: Constants?.expoConfig?.extra?.openAIKey });
      const system = 'You are a helpful assistant that picks the single best matching project for a user query.';
      const userMsg = `User query: ${q}\n\nCandidates (JSON array):\n${JSON.stringify(shortlist, null, 2)}\n\nTask: Return ONLY a JSON object: {"id": "<the best candidate id>"}.`;
      const resp = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
        max_tokens: 50,
      });
      const content = resp.choices?.[0]?.message?.content || '';
      let id: string | null = null;
      try {
        const parsed = JSON.parse(content);
        id = typeof parsed?.id === 'string' ? parsed.id : null;
      } catch {
        // fallback: try regex for id field
        const m = content.match(/"id"\s*:\s*"([^"]+)"/);
        if (m) id = m[1];
      }
      if (id && posts.some(p => p.id === id)) {
        setBestId(id);
      } else if (shortlist[0]) {
        // fallback to top of shortlist if parsing fails
        setBestId(shortlist[0].id);
      }
    } catch (e: any) {
      setRankError('Could not fetch GPT result.');
    } finally {
      setIsRanking(false);
    }
  };

  const handleConnect = useCallback(async (authorId: string) => {
    if (!currentUserId || !authorId || authorId === currentUserId) return;
    
    const isCurrentlyConnected = connectedUsers.has(authorId);
    setConnectingUsers(prev => new Set(prev).add(authorId));
    
    try {
      if (isCurrentlyConnected) {
        // Disconnect: remove from liked array
        await updateDoc(doc(db, 'users', currentUserId), { 
          liked: arrayRemove(authorId) 
        });
        Alert.alert('Disconnected', 'You are no longer connected to this user.');
      } else {
        // Connect: add to liked array
        await updateDoc(doc(db, 'users', currentUserId), { 
          liked: arrayUnion(authorId) 
        });
        Alert.alert('Success', 'Connected! You can now see each other in your connections.');
      }
    } catch (e) {
      const action = isCurrentlyConnected ? 'disconnect from' : 'connect to';
      Alert.alert('Error', `Could not ${action} this user. Please try again.`);
    } finally {
      setConnectingUsers(prev => {
        const next = new Set(prev);
        next.delete(authorId);
        return next;
      });
    }
  }, [currentUserId, connectedUsers]);

  const renderItem = ({ item: post }: { item: Post }) => {
    const author = users[post.authorId];
    const authorName = author?.displayName || 'Unknown Author';
    
    const date = new Date(post.createdAt);
    const formattedDate = date.toLocaleDateString();

    const skillsText = post.skillsets && post.skillsets.length > 0 
      ? post.skillsets.join(' • ') 
      : 'No specific skills required';

    const personTypeText = post.personType || 'Any role';
    const isConnecting = connectingUsers.has(post.authorId);
    const isConnected = connectedUsers.has(post.authorId);
    const canConnect = currentUserId && post.authorId !== currentUserId;

    return (
      <TouchableOpacity style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleSection}>
            <Text style={styles.cardTitle}>{post.title}</Text>
            <Text style={styles.cardAuthor}>by {authorName}</Text>
          </View>
          {canConnect && (
            <TouchableOpacity 
              style={[
                styles.connectBtn, 
                isConnected && styles.connectedBtn,
                isConnecting && styles.connectBtnDisabled
              ]}
              onPress={() => handleConnect(post.authorId)}
              disabled={isConnecting}
            >
              <Text style={[
                styles.connectBtnText,
                isConnected && styles.connectedBtnText
              ]}>
                {isConnecting ? (isConnected ? 'Disconnecting...' : 'Connecting...') : 
                 isConnected ? '✓ Connected' : 'Connect'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.cardDescription}>{post.description || 'No description available'}</Text>
        <Text style={styles.cardDate}>Created: {formattedDate}</Text>
        
        <View style={styles.cardDetails}>
          <View style={styles.skillsContainer}>
            <Text style={styles.fieldLabel}>Skills Required:</Text>
            <Text style={styles.fieldValue}>{skillsText}</Text>
          </View>
          <View style={styles.personTypeContainer}>
            <Text style={styles.fieldLabel}>Looking for:</Text>
            <Text style={styles.fieldValue}>{personTypeText}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Have something in mind?"
          placeholderTextColor="#888"
          value={query}
          onChangeText={(t) => { setQuery(t); setHasSubmitted(false); setBestId(null); setRankError(null); }}
          autoCorrect
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={runGptRanking}
        />
        {query.trim().length > 0 && !hasSubmitted && (
          <Text style={styles.searchHint}>Press the Search key on your keyboard to find the Top match</Text>
        )}
      </View>
      {query.trim().length > 0 && hasSubmitted && (
        <View style={styles.topMatch}>
          <Text style={styles.topMatchTitle}>Top match</Text>
          {isRanking && <Text style={styles.topMatchMeta}>Finding best match…</Text>}
          {!!rankError && <Text style={[styles.topMatchMeta, { color: '#f87171' }]}>{rankError}</Text>}
          {!isRanking && !rankError && bestId && (() => {
            const p = posts.find(pp => pp.id === bestId);
            if (!p) return null;
            const author = users[p.authorId];
            return (
              <TouchableOpacity activeOpacity={0.85} onPress={() => router.push((`/project/${p.id}`) as any)}>
                <View style={[styles.card, { marginTop: 8 }]}> 
                  <Text style={styles.title} numberOfLines={2}>{p.title || 'Untitled Project'}</Text>
                  {!!author && (
                    <Text style={styles.author} numberOfLines={1}>{author.displayName || author.email || 'Builder'}</Text>
                  )}
                  {!!p.description && (
                    <Text style={styles.desc} numberOfLines={3}>{p.description}</Text>
                  )}
                  <Text style={styles.meta}>{new Date(p.createdAt).toLocaleDateString()}</Text>
                </View>
              </TouchableOpacity>
            );
          })()}
        </View>
      )}
      <FlatList
        data={hasSubmitted ? ranked : posts}
        keyExtractor={p => p.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>No projects found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: 10,
    backgroundColor: '#0d0d0d',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    color: 'white',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    fontStyle: 'normal',
  },
  listContent: { padding: 16, paddingTop: 8 },
  searchHint: { color: '#9CA3AF', fontSize: 12, marginTop: 6 },
  topMatch: { paddingHorizontal: 16, marginTop: 4 },
  topMatchTitle: { color: '#93c5fd', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  topMatchMeta: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  card: {
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleSection: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: { 
    color: 'white', 
    fontSize: 16, 
    fontWeight: '700', 
    marginBottom: 4 
  },
  cardAuthor: { 
    color: '#9CA3AF', 
    fontSize: 12 
  },
  connectBtn: {
    backgroundColor: '#142a20',
    borderWidth: 1,
    borderColor: '#1f4736',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  connectedBtn: {
    backgroundColor: '#1e3a5f',
    borderColor: '#3b82f6',
  },
  connectBtnDisabled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  connectBtnText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  connectedBtnText: {
    color: '#60a5fa',
  },
  cardDescription: { 
    color: '#d1d5db', 
    fontSize: 13, 
    lineHeight: 18, 
    marginBottom: 8 
  },
  cardDate: { 
    color: '#6b7280', 
    fontSize: 11, 
    marginBottom: 12 
  },
  cardDetails: {
    gap: 8,
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
  title: { color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  author: { color: '#9CA3AF', fontSize: 12, marginBottom: 8 },
  desc: { color: '#d1d5db', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  meta: { color: '#6b7280', fontSize: 11 },
  empty: { color: '#666', textAlign: 'center', marginTop: 24 },
});
