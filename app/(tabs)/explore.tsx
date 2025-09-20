import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/constants/firebase';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, updateDoc, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, SafeAreaView, StyleSheet, TextInput, TouchableOpacity, View, Linking } from 'react-native';

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
  eventDate?: Date; // Date and time when the event will occur
  isActive?: boolean; // Whether the event is currently active or scheduled for future
}

export default function TabTwoScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [user, setUser] = useState(auth.currentUser);
  const [sortFilter, setSortFilter] = useState<'all' | 'active' | 'future'>('all');

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
    });
    return unsubscribe;
  }, []);

  // Helper function to determine if event is active or future
  const isEventActive = (event: Event) => {
    if (event.isActive === false) return false; // Explicitly scheduled for future
    if (!event.eventDate) return true; // No date set, assume active
    return new Date(event.eventDate) <= new Date(); // Past or current time = active
  };

  // Filter events based on search query and sort filter
  useEffect(() => {
    let filtered = events;
    
    // Apply search filter
    if (searchQuery.trim() !== '') {
      filtered = filtered.filter(event => 
        event.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.locationName && event.locationName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    // Apply sort filter
    if (sortFilter === 'active') {
      filtered = filtered.filter(event => isEventActive(event));
    } else if (sortFilter === 'future') {
      filtered = filtered.filter(event => !isEventActive(event));
    }
    
    // Sort by date - future events by event date, active events by creation date
    filtered.sort((a, b) => {
      const aIsActive = isEventActive(a);
      const bIsActive = isEventActive(b);
      
      if (aIsActive && bIsActive) {
        // Both active - sort by creation date (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (!aIsActive && !bIsActive) {
        // Both future - sort by event date (soonest first)
        const aDate = a.eventDate ? new Date(a.eventDate) : new Date(a.createdAt);
        const bDate = b.eventDate ? new Date(b.eventDate) : new Date(b.createdAt);
        return aDate.getTime() - bDate.getTime();
      } else {
        // Mixed - active events first
        return aIsActive ? -1 : 1;
      }
    });
    
    setFilteredEvents(filtered);
  }, [searchQuery, events, sortFilter]);

  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firestore Timestamps to JavaScript Dates
        const event = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
          eventDate: data.eventDate instanceof Timestamp ? data.eventDate.toDate() : data.eventDate,
        } as Event;
        eventsData.push(event);
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

  // Open location in maps
  const openInMaps = (event: Event) => {
    const { latitude, longitude } = event.location;
    const label = event.locationName || event.eventType;
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
    });
    
    if (url) {
      Linking.openURL(url).catch(() => {
        // Fallback to Google Maps web
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
      });
    }
  };

  // Format date for display
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

  const renderItem = ({ item }: { item: Event }) => {
    const userHasRSVPd = item.rsvps?.includes(user?.uid || '') || false;
    const isCreator = user && item.creatorId === user.uid;
    const rsvpCount = item.rsvps?.length || 0;
    const eventIsActive = isEventActive(item);
    
    return (
      <ThemedView style={styles.minimalCard}>
        {/* Header with event name and status */}
        <View style={styles.cardHeader}>
          <View style={styles.titleContainer}>
            <ThemedText type="defaultSemiBold" style={styles.eventTitle}>{item.eventType}</ThemedText>
            <View style={[styles.statusBadge, eventIsActive ? styles.activeBadge : styles.futureBadge]}>
              <ThemedText style={styles.statusText}>
                {eventIsActive ? 'ACTIVE' : 'FUTURE'}
              </ThemedText>
            </View>
          </View>
        </View>
        
        {/* Event timing */}
        {!eventIsActive && item.eventDate && (
          <ThemedText style={styles.eventTiming}>
            🕒 {formatEventDate(item.eventDate)}
          </ThemedText>
        )}
        
        {/* Location and RSVP info in one line */}
        <View style={styles.infoRow}>
          <TouchableOpacity onPress={() => openInMaps(item)} style={styles.locationInfo}>
            <Ionicons name="location" size={14} color="#007AFF" />
            <ThemedText style={styles.locationText} numberOfLines={1}>
              {item.locationName || 'View Location'}
            </ThemedText>
          </TouchableOpacity>
          
          <ThemedText style={styles.rsvpInfo}>
            {rsvpCount} RSVP{rsvpCount !== 1 ? 's' : ''}
            {item.maxAttendees ? `/${item.maxAttendees}` : ''}
          </ThemedText>
        </View>
        
        {/* Action buttons */}
        <View style={styles.minimalButtonContainer}>
          {user && (
            <TouchableOpacity 
              onPress={() => handleRSVP(item.id)} 
              style={[
                styles.minimalRsvpButton,
                userHasRSVPd ? styles.rsvpButtonActive : null,
                (item.maxAttendees && rsvpCount >= item.maxAttendees && !userHasRSVPd) ? styles.rsvpButtonDisabled : null
              ]}
              disabled={item.maxAttendees ? (rsvpCount >= item.maxAttendees && !userHasRSVPd) : false}
            >
              <Ionicons 
                name={userHasRSVPd ? 'checkmark-circle' : 'add-circle-outline'} 
                size={16} 
                color={userHasRSVPd ? 'white' : '#007AFF'} 
              />
              <ThemedText style={[
                styles.minimalButtonText,
                userHasRSVPd && styles.rsvpButtonTextActive
              ]}>
                {userHasRSVPd ? 'RSVP\'d' : 'RSVP'}
              </ThemedText>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity onPress={() => openInMaps(item)} style={styles.mapButton}>
            <Ionicons name="map" size={16} color="#666" />
            <ThemedText style={styles.mapButtonText}>Map</ThemedText>
          </TouchableOpacity>
          
          {isCreator && (
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.minimalDeleteButton}>
              <Ionicons name="trash" size={16} color="#ff3b30" />
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
          
          {/* Sort Filter Buttons */}
          <View style={styles.filterContainer}>
            <TouchableOpacity 
              style={[styles.filterButton, sortFilter === 'all' && styles.filterButtonActive]}
              onPress={() => setSortFilter('all')}
            >
              <ThemedText style={[styles.filterButtonText, sortFilter === 'all' && styles.filterButtonTextActive]}>
                All
              </ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterButton, sortFilter === 'active' && styles.filterButtonActive]}
              onPress={() => setSortFilter('active')}
            >
              <ThemedText style={[styles.filterButtonText, sortFilter === 'active' && styles.filterButtonTextActive]}>
                Active
              </ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterButton, sortFilter === 'future' && styles.filterButtonActive]}
              onPress={() => setSortFilter('future')}
            >
              <ThemedText style={[styles.filterButtonText, sortFilter === 'future' && styles.filterButtonTextActive]}>
                Future
              </ThemedText>
            </TouchableOpacity>
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
  // New minimal card styles
  minimalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: {
    marginBottom: 8,
  },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  activeBadge: {
    backgroundColor: '#34C759',
  },
  futureBadge: {
    backgroundColor: '#007AFF',
  },
  statusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventTiming: {
    color: '#007AFF',
    fontSize: 14,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  locationText: {
    color: '#007AFF',
    fontSize: 14,
    marginLeft: 4,
    flex: 1,
  },
  rsvpInfo: {
    color: '#ccc',
    fontSize: 14,
  },
  minimalButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimalRsvpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  minimalButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  mapButtonText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  minimalDeleteButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
  },
  // Filter styles
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterButtonText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: 'white',
  },
});