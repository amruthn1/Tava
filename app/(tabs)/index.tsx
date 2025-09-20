import AIChatbot from "@/components/ai-chatbot";
import { db } from "@/constants/firebase";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import Mapbox from "@rnmapbox/maps";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, updateDoc } from "firebase/firestore";
import { auth } from "@/constants/firebase";
import { useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, TouchableOpacity, View, Keyboard, StatusBar } from "react-native";
import CreateEventPopup from '@/components/CreateEventPopup';

// Reusable Pin component: uses react-native-svg when available, falls back to a styled View
type PinProps = {
  size?: number;
  color?: string;
  outline?: string;
};

const Pin = ({ size = 36, color = '#FF3B30', outline = '#fff' }: PinProps) => {
  // Render a single Image with an inline SVG data URI so PointAnnotation
  // receives only one native subview (react-native-mapbox limitation).
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
    <path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' fill='${color}'/>
    <path d='M12 11.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z' fill='${outline}'/>
  </svg>`;

  // Use a single container View so PointAnnotation has only one direct subview.
  const pinSize = size;
  const circleSize = Math.round(pinSize * 0.5);
  const triangleHeight = Math.round(pinSize * 0.44);

  return (
    <View
      style={{
        width: pinSize,
        height: pinSize,
        alignItems: 'center',
        justifyContent: 'flex-start',
        backgroundColor: 'transparent',
        // move the marker up so the tip points to the exact coordinate
        transform: [{ translateY: -Math.round(pinSize * 0.4) }],
      }}
    >
      <View
        style={{
          width: circleSize,
          height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: outline,
          marginTop: 0,
          // subtle shadow for visibility on map
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.25,
          shadowRadius: 2,
          elevation: 3,
        }}
      />
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: Math.round(circleSize * 0.45),
          borderRightWidth: Math.round(circleSize * 0.45),
          borderBottomWidth: triangleHeight,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          marginTop: -6,
        }}
      />
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
  location: {
    latitude: number;
    longitude: number;
  };
  locationName?: string;
  description?: string;
  createdAt: Date;
  creatorId: string;
  rsvps?: string[]; // Array of user IDs who have RSVP'd
  maxAttendees?: number;
}

// Key for AsyncStorage (declare before component to avoid TDZ issues)
const CHAT_MESSAGES_KEY = 'chatMessages_v1';

export default function HomeScreen() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCreateEventVisible, setIsCreateEventVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [lastLocation, setLastLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const initialLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const mapRef = useRef<Mapbox.MapView>(null);
  const cameraRef = useRef<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [initialCameraSet, setInitialCameraSet] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "events"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        eventsData.push({ id: doc.id, ...doc.data() } as Event);
      });
      setEvents(eventsData);
    });

    return () => unsubscribe();
  }, []);

  // Load persisted chat messages on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_MESSAGES_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as any[];
          // restore timestamps as Date
          const restored = parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
          setChatMessages(restored);
        }
      } catch (e) {
        console.warn('Failed to load chat messages', e);
      }
    })();
  }, []);

  // Persist chat messages when they change
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(chatMessages));
      } catch (e) {
        console.warn('Failed to save chat messages', e);
      }
    })();
  }, [chatMessages]);

  // Wrapper to handle messages coming from AIChatbot component
  const handleMessagesChange = (m: any[]) => {
    // ensure timestamps are Date instances
    const normalized = m.map((mm) => ({ ...mm, timestamp: new Date(mm.timestamp) }));
    setChatMessages(normalized);
  };

  const handleDelete = async (eventId: string) => {
    try {
      const user = auth.currentUser;
      const event = events.find(e => e.id === eventId);
      if (user && event && event.creatorId === user.uid) {
        await deleteDoc(doc(db, "events", eventId));
      } else {
        console.warn("User not authorized to delete this event");
      }
    } catch (error) {
      console.error("Error removing document: ", error);
    }
  };

  const handleRSVP = async (eventId: string) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.warn("User must be logged in to RSVP");
        return;
      }

      const event = events.find(e => e.id === eventId);
      if (!event) return;

      const userHasRSVPd = event.rsvps?.includes(user.uid) || false;
      const eventRef = doc(db, "events", eventId);

      if (userHasRSVPd) {
        // Remove RSVP
        await updateDoc(eventRef, {
          rsvps: arrayRemove(user.uid)
        });
      } else {
        // Add RSVP (check max attendees if set)
        const currentRSVPs = event.rsvps?.length || 0;
        if (event.maxAttendees && currentRSVPs >= event.maxAttendees) {
          console.warn("Event is at maximum capacity");
          return;
        }
        await updateDoc(eventRef, {
          rsvps: arrayUnion(user.uid)
        });
      }
    } catch (error) {
      console.error("Error updating RSVP: ", error);
    }
  };

  const onUserLocationUpdate = (location: {
    coords: { latitude: number; longitude: number };
  }) => {
    const { latitude, longitude } = location?.coords || {};
    if (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      !isNaN(latitude) &&
      !isNaN(longitude)
    ) {
      setUserLocation([longitude, latitude]);
      if (!initialCameraSet && cameraRef.current) {
        cameraRef.current.setCamera({
          centerCoordinate: [longitude, latitude],
          zoomLevel: 18,
          pitch: 0,
          animationDuration: 0,
        });
        setInitialCameraSet(true);
      }
    }
  };

  const handleRecenter = () => {
    // Use latest location for recentering, update lastLocation, and reset bearing
    if (cameraRef.current && userLocation) {
      cameraRef.current.setCamera({
        centerCoordinate: userLocation,
        zoomLevel: 18,
        pitch: 0,
        bearing: 0,
        animationDuration: 100,
      });
      setLastLocation({
        latitude: userLocation[1],
        longitude: userLocation[0],
      });
    }
  };

  // Recenter icon size (used by Ionicons)
  const recenterIconSize = Math.max(width * 0.06, 20);

  return (
    <View style={styles.container}>
      <StatusBar />
      <CreateEventPopup 
        visible={isCreateEventVisible} 
        onClose={() => setIsCreateEventVisible(false)} 
      />
      <Pressable style={styles.container} onPress={() => Keyboard.dismiss()}>
        <Mapbox.MapView
          ref={mapRef}
          style={styles.map}
          styleURL="mapbox://styles/rohithn1/cmfrlmj1x00g101ry1y3b63h3"
          scaleBarEnabled={false}
        >
          <Mapbox.Camera
            ref={cameraRef}
            pitch={0}
          />
          <Mapbox.UserLocation visible onUpdate={onUserLocationUpdate} />
          <Mapbox.LocationPuck visible/>
          {events.map((event) => (
            <Mapbox.PointAnnotation
              key={event.id}
              id={event.id}
              coordinate={[event.location.longitude, event.location.latitude]}
              anchor={{ x: 0.5, y: 1 }}
            >
              {/* Marker content: use the Pin component */}
              <Pin size={40} color="#FF3B30" outline="#ffffff" />
              <Mapbox.Callout title={event.eventType}>
                <View style={styles.calloutView}>
                  <Text style={styles.calloutText}>{event.eventType}</Text>
                  {event.locationName && (
                    <Text style={styles.calloutText}> {event.locationName}</Text>
                  )}
                  <Text style={styles.calloutText}>People: {event.numPeople}</Text>
                  {event.description && (
                    <Text style={styles.calloutText}>{event.description}</Text>
                  )}
                  <Text style={styles.calloutText}>
                    RSVPs: {event.rsvps?.length || 0}
                    {event.maxAttendees ? `/${event.maxAttendees}` : ''}
                  </Text>
                  <View style={styles.buttonContainer}>
                    <TouchableOpacity 
                      onPress={() => handleRSVP(event.id)} 
                      style={[
                        styles.rsvpButton,
                        event.rsvps?.includes(auth.currentUser?.uid || '') && styles.rsvpButtonActive
                      ]}
                    >
                      <Text style={[
                        styles.rsvpButtonText,
                        event.rsvps?.includes(auth.currentUser?.uid || '') && styles.rsvpButtonTextActive
                      ]}>
                        {event.rsvps?.includes(auth.currentUser?.uid || '') ? '✓ RSVP\'d' : 'RSVP'}
                      </Text>
                    </TouchableOpacity>
                    {auth.currentUser?.uid === event.creatorId && (
                      <TouchableOpacity onPress={() => handleDelete(event.id)} style={styles.deleteButton}>
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Mapbox.Callout>
            </Mapbox.PointAnnotation>
          ))}
        </Mapbox.MapView>
      </Pressable>
      {/* Stacked Buttons Container */}
      <View style={styles.buttonStack}>
        {/* Create Event Button */}
        <TouchableOpacity 
          style={[styles.createEventButton, styles.stackedButton]}
          onPress={() => setIsCreateEventVisible(true)}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
        
        {/* AI Chat Button */}
        <TouchableOpacity 
          style={[styles.chatButton, styles.stackedButton]}
          onPress={() => setIsChatOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubbles" size={20} color="white" />
        </TouchableOpacity>
        
        {/* Recenter Button */}
        <TouchableOpacity 
          style={[styles.recenterButton, styles.stackedButton]} 
          onPress={handleRecenter} 
          accessibilityLabel="Recenter map"
        >
          <Ionicons name="locate" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Chat Modal - transparent overlay, closes on outside press */}
      {isChatOpen && (
        <View style={styles.chatModalOverlay}>
          {/* Backdrop: only this Pressable closes the modal when tapped */}
          <Pressable style={styles.backdrop} onPress={() => setIsChatOpen(false)} />
          {/* Modal content: regular View so ScrollView inside can handle touches/scrolls */}
          <View style={styles.chatModal}>
            <View style={styles.chatModalInner}>
              <AIChatbot
                style={styles.chatModalContent}
                messages={chatMessages}
                onMessagesChange={handleMessagesChange}
                events={events}
                onClose={() => setIsChatOpen(false)}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  // Stacked buttons container
  buttonStack: {
    position: 'absolute',
    left: 20,
    bottom: 30,
    alignItems: 'center',
    zIndex: 1000,
  },
  // Base style for all stacked buttons
  stackedButton: {
    marginBottom: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  chatButton: {
    backgroundColor: '#007AFF',
  },
  createEventButton: {
    backgroundColor: '#FF3B30',
  },
  chatModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "flex-start",
    alignItems: "center",
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  chatModal: {
    width: '90%',
    maxWidth: Math.min(width * 0.95, 420),
    // make modal a bit taller
    minHeight: Math.max(height * 0.42, 340),
    backgroundColor: "#181818",
    borderRadius: width * 0.045,
    padding: 0,
    overflow: "hidden",
    elevation: 8,
    // move modal lower on screen
    marginTop: Math.max(height * 0.12, 60),
  },
  chatModalInner: {
    width: '100%',
    // increase inner minHeight to match outer modal increase
    minHeight: Math.max(height * 0.42, 340),
    borderRadius: width * 0.045,
    overflow: 'hidden',
  },
  chatModalContent: {
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: "#181818",
    borderRadius: width * 0.045,
    flex: 1,
  },
  page: {
    flex: 1,
  },
  recenterButton: {
    backgroundColor: "#222",
  },
  recenterIcon: {
    fontSize: Math.max(width * 0.055, 18),
    textAlign: "center",
    alignContent: "center",
    textAlignVertical: "center",
    color: "#007AFF",
  },
  chatbotPosition: {
    bottom: 100,
    left: 20,
  },
  calloutView: {
    padding: Math.max(width * 0.02, 8),
    backgroundColor: 'white',
    borderRadius: Math.max(width * 0.02, 6),
    minWidth: Math.min(width * 0.4, 160),
    alignItems: 'center',
  },
  calloutText: {
    color: 'black',
    marginBottom: Math.max(width * 0.01, 4),
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    paddingVertical: Math.max(height * 0.008, 6),
    paddingHorizontal: Math.max(width * 0.03, 8),
    borderRadius: Math.max(width * 0.02, 6),
    marginTop: Math.max(width * 0.02, 6),
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Math.max(width * 0.02, 6),
    gap: Math.max(width * 0.02, 6),
  },
  rsvpButton: {
    backgroundColor: '#007AFF',
    paddingVertical: Math.max(height * 0.008, 6),
    paddingHorizontal: Math.max(width * 0.03, 8),
    borderRadius: Math.max(width * 0.02, 6),
    flex: 1,
  },
  rsvpButtonActive: {
    backgroundColor: '#34C759',
  },
  rsvpButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rsvpButtonTextActive: {
    color: 'white',
  },
});
