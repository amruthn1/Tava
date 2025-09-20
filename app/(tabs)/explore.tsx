import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/constants/firebase';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, SafeAreaView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

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

export default function TabTwoScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [user, setUser] = useState(auth.currentUser);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
    });
    return unsubscribe;
  }, []);

  // Filter events based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredEvents(events);
    } else {
      const filtered = events.filter(event => 
        event.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.locationName && event.locationName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredEvents(filtered);
    }
  }, [searchQuery, events]);

  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        eventsData.push({ id: doc.id, ...doc.data() } as Event);
      });
      setEvents(eventsData);
      setFilteredEvents(eventsData);
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (eventId: string) => {
    try {
      const user = auth.currentUser;
      const event = events.find(e => e.id === eventId);
      if (user && event && event.creatorId === user.uid) {
        await deleteDoc(doc(db, 'events', eventId));
      } else {
        Alert.alert('Unauthorized', 'You can only delete events you created.');
      }
    } catch (error) {
      console.error("Error removing document: ", error);
      Alert.alert('Error', 'Failed to delete event.');
    }
  };

  const handleRSVP = async (eventId: string) => {
    try {
      if (!user) {
        Alert.alert('Authentication Required', 'Please sign in to RSVP to events.');
        return;
      }

      const event = events.find(e => e.id === eventId);
      if (!event) return;

      const userHasRSVPd = event.rsvps?.includes(user.uid) || false;
      const eventRef = doc(db, 'events', eventId);

      if (userHasRSVPd) {
        // Remove RSVP
        await updateDoc(eventRef, {
          rsvps: arrayRemove(user.uid)
        });
        Alert.alert('RSVP Removed', 'You have successfully removed your RSVP.');
      } else {
        // Add RSVP (check max attendees if set)
        const currentRSVPs = event.rsvps?.length || 0;
        if (event.maxAttendees && currentRSVPs >= event.maxAttendees) {
          Alert.alert('Event Full', 'This event has reached its maximum capacity.');
          return;
        }
        await updateDoc(eventRef, {
          rsvps: arrayUnion(user.uid)
        });
        Alert.alert('RSVP Confirmed', 'You have successfully RSVP\'d to this event!');
      }
    } catch (error) {
      console.error('Error updating RSVP: ', error);
      Alert.alert('Error', `Failed to update RSVP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Clear search query
  const clearSearch = () => {
    setSearchQuery('');
  };

  const renderItem = ({ item }: { item: Event }) => {
    const userHasRSVPd = item.rsvps?.includes(user?.uid || '') || false;
    const isCreator = user && item.creatorId === user.uid;
    const rsvpCount = item.rsvps?.length || 0;
    
    return (
      <ThemedView style={styles.itemContainer}>
        <ThemedText type="defaultSemiBold" style={styles.eventTitle}>{item.eventType}</ThemedText>
        
        {item.locationName && (
          <ThemedText style={styles.locationName}>📍 {item.locationName}</ThemedText>
        )}
        
        <ThemedText style={styles.eventDetail}>Expected People: {item.numPeople}</ThemedText>
        
        {item.description && (
          <ThemedText style={styles.description}>{item.description}</ThemedText>
        )}
        
        <ThemedText style={styles.eventDetail}>
          RSVPs: {rsvpCount}{item.maxAttendees ? `/${item.maxAttendees}` : ''}
        </ThemedText>
        
        <ThemedText style={styles.coordinates}>
          Location: {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
        </ThemedText>
        
        <View style={styles.buttonContainer}>
          {user && (
            <TouchableOpacity 
              onPress={() => handleRSVP(item.id)} 
              style={[
                styles.rsvpButton,
                userHasRSVPd ? styles.rsvpButtonActive : null,
                (item.maxAttendees && rsvpCount >= item.maxAttendees && !userHasRSVPd) ? styles.rsvpButtonDisabled : null
              ]}
              disabled={item.maxAttendees ? (rsvpCount >= item.maxAttendees && !userHasRSVPd) : false}
            >
              <ThemedText style={[
                styles.rsvpButtonText,
                userHasRSVPd && styles.rsvpButtonTextActive
              ]}>
                {userHasRSVPd ? '✓ RSVP\'d' : 
                 (item.maxAttendees && rsvpCount >= item.maxAttendees) ? 'Full' : 'RSVP'}
              </ThemedText>
            </TouchableOpacity>
          )}
          
          {isCreator && (
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
              <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ThemedView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <View style={styles.headerContainer}>
          <ThemedText type="title" style={styles.title}>
            Explore Events
          </ThemedText>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search events or locations..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <FlatList
          data={filteredEvents}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
          ListEmptyComponent={
            <ThemedView style={styles.emptyState}>
              <ThemedText style={styles.emptyStateText}>
                {searchQuery 
                  ? 'No events match your search.'
                  : 'No events available.'}
              </ThemedText>
            </ThemedView>
          }
        />
  {/* AIChatbot intentionally removed from Explore tab to avoid showing modal here */}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerContainer: {
    marginBottom: 15,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: 'white',
    height: 45,
    fontSize: 15,
  },
  clearButton: {
    padding: 5,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    color: '#888',
    textAlign: 'center',
    fontSize: 16,
  },
  title: {
    marginTop: Platform.OS === 'ios' ? 10 : 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  itemContainer: {
    padding: 20,
    marginBottom: 15,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  eventTitle: {
    fontSize: 18,
    marginBottom: 8,
    color: '#fff',
  },
  locationName: {
    fontSize: 14,
    marginBottom: 6,
    color: '#007AFF',
  },
  eventDetail: {
    fontSize: 14,
    marginBottom: 4,
    color: '#ccc',
  },
  description: {
    fontSize: 14,
    marginBottom: 8,
    color: '#aaa',
    fontStyle: 'italic',
  },
  coordinates: {
    fontSize: 12,
    marginBottom: 12,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  rsvpButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  rsvpButtonActive: {
    backgroundColor: '#34C759',
  },
  rsvpButtonDisabled: {
    backgroundColor: '#666',
  },
  rsvpButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  rsvpButtonTextActive: {
    color: 'white',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});