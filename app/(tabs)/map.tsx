import AIChatbot from "@/components/ai-chatbot";
import { auth, db } from "@/constants/firebase";
import { POSTS_COLLECTION } from '@/types/post';
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import Mapbox from "@rnmapbox/maps";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, Timestamp, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Reusable Pin component: uses react-native-svg when available, falls back to a styled View
type PinProps = {
  size?: number;
  color?: string;
  outline?: string;
};

// Safe wrapper: use Mapbox.CalloutSubview if available, otherwise fall back to TouchableOpacity
const CalloutWrapper = ((Mapbox as any).CalloutSubview ?? TouchableOpacity) as React.ComponentType<any>;

const Pin = ({ size = 40, color = '#FF3B30', outline = '#fff' }: PinProps) => {
  // Circle diameter & pointer height chosen so total height = size
  // ensuring the bottom tip of pointer aligns with geographic point.
  const circleDiameter = size * 0.62; // <= size to leave room for pointer
  const pointerHeight = size - circleDiameter; // remaining vertical space
  const pointerWidth = circleDiameter * 0.55;
  const circleRadius = circleDiameter / 2;
  return (
    <View style={{ width: circleDiameter, height: size, alignItems:'center', justifyContent:'flex-start' }}>
      <View style={{
        width: circleDiameter,
        height: circleDiameter,
        borderRadius: circleRadius,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: outline,
        shadowColor:'#000', shadowOpacity:0.25, shadowRadius:3, shadowOffset:{ width:0, height:1 }, elevation:3
      }} />
      <View style={{
        width:0,
        height:0,
        borderLeftWidth: pointerWidth/2,
        borderRightWidth: pointerWidth/2,
        borderTopWidth: pointerHeight,
        borderLeftColor:'transparent',
        borderRightColor:'transparent',
        borderTopColor: color,
        marginTop:-1
      }} />
    </View>
  );
};

const { width, height } = Dimensions.get('window');

Mapbox.setAccessToken(
  "pk.eyJ1Ijoicm9oaXRobjEiLCJhIjoiY2tvOWQ5cDJlMDJ3bTJ2b3hxNzQ2bWtxbiJ9.D3qEERX35Viqy99hXm9pgw"
);

interface Event {
  id: string;
  eventType: string;
  numPeople: string;
  location?: { latitude: number; longitude: number; }; // now optional
  locationName?: string;
  description?: string;
  createdAt: Date;
  creatorId: string;
  rsvps?: string[];
  maxAttendees?: number;
  eventDate?: Date;
  isActive?: boolean;
}

interface PostPin {
  id: string;
  title: string;
  description?: string | null;
  location?: { latitude: number; longitude: number };
  createdAt?: Date;
  authorId: string;
}

interface UserProfileDoc {
  id: string;
  likedPosts?: string[];
}

const CHAT_MESSAGES_KEY = 'chatMessages_v1';

export default function MapScreen() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [postPins, setPostPins] = useState<PostPin[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfileDoc[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostPin | null>(null);
  const [initialCameraSet, setInitialCameraSet] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  // Removed custom callout overlay state
  const mapRef = useRef<Mapbox.MapView>(null);
  const cameraRef = useRef<any>(null);

  const isEventActive = (event: Event) => {
    if (event.isActive === false) return false;
    if (!event.eventDate) return true;
    return new Date(event.eventDate) <= new Date();
  };

  const formatEventDate = (date: Date) => {
    const now = new Date();
    const eventDate = new Date(date);
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return `Today at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Tomorrow at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays > 1 && diffDays <= 7) {
      return `${eventDate.toLocaleDateString([], { weekday: 'long' })} at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return eventDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  };

  useEffect(() => {
    const q = query(collection(db, "events"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const event = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
          eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate,
        } as Event;
        eventsData.push(event);
      });
      setEvents(eventsData);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to posts with optional location
  useEffect(() => {
    const pq = query(collection(db, POSTS_COLLECTION));
    const unsub = onSnapshot(pq, snap => {
      const pins: PostPin[] = snap.docs.map(d => {
        const data: any = d.data() || {};
        return {
          id: d.id,
          title: data.title,
            description: data.description,
            location: data.location,
            createdAt: data.createdAt?.toDate?.() || (data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined),
            authorId: data.authorId
        } as PostPin;
      }).filter(p => p.location && typeof p.location.latitude === 'number' && typeof p.location.longitude === 'number');
      setPostPins(pins);
    });
    return () => unsub();
  }, []);

  // Subscribe to user profiles (minimal fields)
  useEffect(() => {
    const uq = query(collection(db, 'users'));
    const unsub = onSnapshot(uq, snap => {
      const profiles: UserProfileDoc[] = snap.docs.map(d => {
        const data: any = d.data() || {};
        return { id: d.id, likedPosts: Array.isArray(data.likedPosts) ? data.likedPosts : [] };
      });
      setUserProfiles(profiles);
    });
    return () => unsub();
  }, []);

  // Derive connection tiers
  const meId = auth.currentUser?.uid || null;
  const currentUserProfile = meId ? userProfiles.find(u => u.id === meId) : undefined;
  const myLikedPostIds = new Set(currentUserProfile?.likedPosts || []);
  // Direct authors: authors of posts I've liked
  const directAuthorIds = new Set<string>();
  postPins.forEach(p => { if (myLikedPostIds.has(p.id)) directAuthorIds.add(p.authorId); });
  // Secondary authors: authors liked by direct authors via their likedPosts
  const secondaryAuthorIds = new Set<string>();
  if (directAuthorIds.size) {
    userProfiles.forEach(up => {
      if (directAuthorIds.has(up.id)) {
        (up.likedPosts || []).forEach(lpId => {
          const post = postPins.find(pp => pp.id === lpId);
          if (post && !directAuthorIds.has(post.authorId) && post.authorId !== meId) {
            secondaryAuthorIds.add(post.authorId);
          }
        });
      }
    });
  }

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_MESSAGES_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as any[];
          const restored = parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
          setChatMessages(restored);
        }
      } catch (e) {
        console.warn('Failed to load chat messages', e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(chatMessages));
      } catch (e) {
        console.warn('Failed to save chat messages', e);
      }
    })();
  }, [chatMessages]);

  const handleMessagesChange = (m: any[]) => {
    const normalized = m.map((mm) => ({ ...mm, timestamp: new Date(mm.timestamp) }));
    setChatMessages(normalized);
  };

  const handleDelete = async (eventId: string) => {
    try {
      const user = auth.currentUser;
      const event = events.find(e => e.id === eventId);
      if (!user || !event || event.creatorId !== user.uid) { return; }
      Alert.alert('Delete Event', `Delete "${event.eventType}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteDoc(doc(db, "events", eventId)); } catch (error) { console.error(error); } } }
      ]);
    } catch (error) {
      console.error("Error in handleDelete: ", error);
    }
  };

  const handleRSVP = async (eventId: string) => {
    try {
      const user = auth.currentUser; if (!user) return;
      const event = events.find(e => e.id === eventId); if (!event) return;
      const userHasRSVPd = event.rsvps?.includes(user.uid) || false;
      const eventRef = doc(db, "events", eventId);
      if (userHasRSVPd) {
        await updateDoc(eventRef, { rsvps: arrayRemove(user.uid) });
      } else {
        const currentRSVPs = event.rsvps?.length || 0;
        if (event.maxAttendees && currentRSVPs >= event.maxAttendees) return;
        await updateDoc(eventRef, { rsvps: arrayUnion(user.uid) });
      }
    } catch (error) {
      console.error("Error updating RSVP: ", error);
    }
  };

  const onUserLocationUpdate = (location: { coords: { latitude: number; longitude: number }; }) => {
    const { latitude, longitude } = location?.coords || {};
    if (typeof latitude === "number" && typeof longitude === "number" && !isNaN(latitude) && !isNaN(longitude)) {
      setUserLocation([longitude, latitude]);
      if (!initialCameraSet && cameraRef.current) {
        cameraRef.current.setCamera({ centerCoordinate: [longitude, latitude], zoomLevel: 16, pitch: 0, animationDuration: 0 });
        setInitialCameraSet(true);
      }
    }
  };

  const handleRecenter = () => {
    if (cameraRef.current && userLocation) {
      cameraRef.current.setCamera({ centerCoordinate: userLocation, zoomLevel: 16, pitch: 0, bearing: 0, animationDuration: 100 });
    }
  };

  const recenterIconSize = Math.max(width * 0.06, 20);


  return (
    <View style={styles.container}>
      <StatusBar />
      {/* Removed outer Pressable to avoid intercepting annotation taps; keyboard dismiss can be handled elsewhere */}
      <View style={styles.container}>
        <Mapbox.MapView
          ref={mapRef}
          style={styles.map}
          styleURL="mapbox://styles/rohithn1/cmfrlmj1x00g101ry1y3b63h3"
          scaleBarEnabled={false}
        >
          <Mapbox.Camera ref={cameraRef} pitch={0} />
          <Mapbox.UserLocation visible onUpdate={onUserLocationUpdate} />
          <Mapbox.LocationPuck visible/>
          {/* Event pins */}
          {events.map((event) => {
            const eventIsActive = isEventActive(event);
            const pinColor = eventIsActive ? '#FF3B30' : '#007AFF';
            if (!event.location || typeof event.location.latitude !== 'number' || typeof event.location.longitude !== 'number') {
              return null; // skip events without valid location
            }
            const summary = event.description ? (event.description.length > 120 ? event.description.slice(0,117) + '…' : event.description) : null;
            return (
              <Mapbox.PointAnnotation
                key={event.id}
                id={event.id}
                coordinate={[event.location.longitude, event.location.latitude]}
                anchor={{ x: 0.5, y: 1 }}
                onSelected={() => {
                  console.log('Event pin selected', event.id);
                  setSelectedAnnotationId(event.id);
                  if (cameraRef.current) {
                    cameraRef.current.setCamera({ centerCoordinate: [event.location!.longitude, event.location!.latitude], zoomLevel: 18, animationDuration: 250 });
                  }
                }}
                onDeselected={() => {
                  if (selectedAnnotationId === event.id) {
                    setSelectedAnnotationId(null);
                  }
                }}
                selected={selectedAnnotationId === event.id}
              >
                <View style={styles.pinHitContainer} pointerEvents="box-none">
                  {/* Single-tap selection handled by PointAnnotation onSelected; expanded visual wrapper enlarges hit area */}
                  <View style={styles.pinTouchWrapper} pointerEvents="box-none">
                    <View style={styles.pinSquareHit} />
                    <Pin size={44} color={pinColor} outline="#ffffff" />
                  </View>
                </View>
                {/* Placeholder removed Mapbox.Callout; custom overlay rendered absolutely */}
              </Mapbox.PointAnnotation>
            );
          })}
          {/* Post pins */}
          {postPins.map(post => {
            if (!post.location) return null;
            const me = auth.currentUser?.uid;
            if (me && post.authorId === me) return null; // hide current user's own posts
            // Determine pin color by connection tier
            let pinColor = '#555555'; // default/secondary
            if (directAuthorIds.has(post.authorId)) {
              pinColor = '#8E44AD'; // direct = purple
            } else if (secondaryAuthorIds.has(post.authorId)) {
              pinColor = '#555555'; // secondary = gray (same as default for now)
            }
            const summary = post.description ? (post.description.length > 120 ? post.description.slice(0,117) + '…' : post.description) : null;
            return (
              <Mapbox.PointAnnotation
                key={post.id}
                id={`post-${post.id}`}
                coordinate={[post.location.longitude, post.location.latitude]}
                anchor={{ x:0.5, y:1 }}
                onSelected={() => {
                  console.log('Post pin selected', post.id);
                  setSelectedAnnotationId(`post-${post.id}`);
                  setSelectedPost(post); // open detail immediately
                  if (cameraRef.current) {
                    cameraRef.current.setCamera({ centerCoordinate: [post.location!.longitude, post.location!.latitude], zoomLevel: 18, animationDuration: 250 });
                  }
                }}
                onDeselected={() => {
                  if (selectedAnnotationId === `post-${post.id}`) {
                    setSelectedAnnotationId(null);
                  }
                }}
                selected={selectedAnnotationId === `post-${post.id}`}
              >
                <View style={styles.pinHitContainer} pointerEvents="box-none">
                  <View style={styles.pinTouchWrapper} pointerEvents="box-none">
                    <View style={styles.pinSquareHit} />
                    <Pin size={42} color={'#8E44AD'} outline="#ffffff" />
                  </View>
                </View>
                {/* Placeholder removed Mapbox.Callout */}
              </Mapbox.PointAnnotation>
            );
          })}
        </Mapbox.MapView>
      </View>
      <View style={styles.buttonStack} pointerEvents={isChatOpen ? 'none' : 'auto'}>
        {/* <TouchableOpacity style={[styles.chatButton, styles.stackedButton]} onPress={() => setIsChatOpen(true)} activeOpacity={0.8}>
          <Ionicons name="chatbubbles" size={20} color="white" />
        </TouchableOpacity> */}
        <TouchableOpacity style={[styles.recenterButton, styles.stackedButton]} onPress={handleRecenter} accessibilityLabel="Recenter map">
          <Ionicons name="locate" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {isChatOpen && (
        <View style={styles.chatModalOverlay} pointerEvents="auto">
          <Pressable style={styles.backdrop} onPress={() => setIsChatOpen(false)} />
          <View style={styles.chatModal}>
            <View style={styles.chatModalInner}>
              <AIChatbot style={styles.chatModalContent} messages={chatMessages} onMessagesChange={handleMessagesChange} events={events} onClose={() => setIsChatOpen(false)} />
            </View>
          </View>
        </View>
      )}
      {/* Post Detail Modal */}
      <Modal visible={!!selectedPost} transparent animationType="fade" onRequestClose={() => setSelectedPost(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setSelectedPost(null)}>
          <Pressable style={styles.detailCard} onPress={(e) => { /* swallow */ }}>
            <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={{ paddingBottom: 12 }}>
              <Text style={styles.detailTitle}>{selectedPost?.title}</Text>
              {selectedPost?.createdAt && (
                <Text style={styles.detailMeta}>{selectedPost.createdAt.toLocaleString()}</Text>
              )}
              {selectedPost?.description && (
                <Text style={styles.detailBody}>{selectedPost.description}</Text>
              )}
              <TouchableOpacity style={styles.closeDetailBtn} onPress={() => setSelectedPost(null)}>
                <Text style={styles.closeDetailText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', zIndex: 1 },
  map: { flex: 1 },
  pinHitContainer: { justifyContent:'center', alignItems:'center', padding:0, margin:0 },
  // Wrapper gives generous padding; square hit provides large transparent target anchored so bottom tip still maps to coordinate
  pinTouchWrapper: { alignItems:'center', justifyContent:'flex-end', padding:0 },
  pinSquareHit: { position:'absolute', width:80, height:80, bottom:0, left:'50%', marginLeft:-40, // center horizontally
    // Expand touch area without visual artifact
    backgroundColor:'transparent' },
  buttonStack: { position: 'absolute', left: 20, bottom: 30, alignItems: 'center', zIndex: 1000 },
  stackedButton: { marginBottom: 10, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  chatButton: { backgroundColor: '#007AFF' },
  createEventButton: { backgroundColor: '#FF3B30' },
  chatModalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.15)", justifyContent: "flex-start", alignItems: "center", zIndex: 100 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  chatModal: { width: '90%', maxWidth: Math.min(width * 0.95, 420), minHeight: Math.max(height * 0.42, 340), backgroundColor: "#181818", borderRadius: width * 0.045, padding: 0, overflow: "hidden", elevation: 8, marginTop: Math.max(height * 0.12, 60) },
  chatModalInner: { width: '100%', minHeight: Math.max(height * 0.42, 340), borderRadius: width * 0.045, overflow: 'hidden' },
  chatModalContent: { paddingTop: 0, paddingBottom: 0, backgroundColor: "#181818", borderRadius: width * 0.045, flex: 1 },
  page: { flex: 1 },
  recenterButton: { backgroundColor: "#222" },
  recenterIcon: { fontSize: Math.max(width * 0.055, 18), textAlign: "center", alignContent: "center", textAlignVertical: "center", color: "#007AFF" },
  chatbotPosition: { bottom: 100, left: 20 },
  calloutView: { padding: Math.max(width * 0.02, 8), backgroundColor: 'white', borderRadius: Math.max(width * 0.02, 6), minWidth: Math.min(width * 0.4, 160), alignItems: 'center', zIndex: 10000, elevation: 10000, shadowColor:'#000', shadowOpacity:0.35, shadowRadius:6, shadowOffset:{ width:0, height:3 } },
  // customCallout removed
  calloutText: { color: 'black', marginBottom: Math.max(width * 0.01, 4) },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 10 },
  rsvpButton: { flex:1, backgroundColor: '#007AFF', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems:'center' },
  rsvpButtonActive: { backgroundColor: '#34C759' },
  rsvpButtonText: { color: 'white', fontWeight: 'bold', fontSize:14 },
  rsvpButtonTextActive: { color: 'white' },
  deleteButton: { backgroundColor: '#ff3b30', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems:'center' },
  deleteButtonText: { color: 'white', fontWeight: 'bold', fontSize:14 },
  calloutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Math.max(width * 0.01, 4) },
  calloutTitle: { color: 'black', fontWeight: 'bold', fontSize: 16, flex: 1 },
  calloutBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  calloutActiveBadge: { backgroundColor: '#34C759' },
  calloutFutureBadge: { backgroundColor: '#007AFF' },
  calloutBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  calloutTiming: { color: '#007AFF', fontSize: 12, marginBottom: Math.max(width * 0.01, 4), fontWeight: '600' },
  detailButton: { marginTop: 4, backgroundColor:'#8E44AD', paddingHorizontal:10, paddingVertical:6, borderRadius:8 },
  detailButtonText: { color:'white', fontSize:12, fontWeight:'600' },
  detailOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center', padding:20 },
  detailCard: { backgroundColor:'#1e1e1e', width:'100%', borderRadius:20, padding:20, borderWidth:1, borderColor:'#333' },
  detailTitle: { color:'white', fontSize:18, fontWeight:'700', marginBottom:6 },
  detailMeta: { color:'#888', fontSize:12, marginBottom:10 },
  detailBody: { color:'#ddd', fontSize:14, lineHeight:20, marginBottom:12 },
  // Close button now matches Explore "Connect" pill styling (rowActionPill + connectPill + likeActionText)
  closeDetailBtn: { backgroundColor:'#142a20', borderWidth:1, borderColor:'#1f4736', paddingVertical:14, borderRadius:40, alignItems:'center', marginTop:24, alignSelf:'stretch' },
  closeDetailText: { color:'#34d399', fontWeight:'600', fontSize:15 }
});
