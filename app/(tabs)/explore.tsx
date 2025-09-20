import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/constants/firebase';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Button, FlatList, Platform, SafeAreaView, StyleSheet, TouchableOpacity, View } from 'react-native';

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

  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        eventsData.push({ id: doc.id, ...doc.data() } as Event);
      });
      setEvents(eventsData);
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
      const user = auth.currentUser;
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
      Alert.alert('Error', 'Failed to update RSVP. Please try again.');
    }
  };

  const user = auth.currentUser;
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
        <ThemedText type="title" style={styles.title}>
          Explore Events
        </ThemedText>
        <FlatList
          data={events}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
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