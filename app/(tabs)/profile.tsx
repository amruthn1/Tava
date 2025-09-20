import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { clearCredentials } from '@/constants/credentialStore';
import { auth, db } from '@/constants/firebase';
import { useRouter } from 'expo-router';
import { signOut, User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  rsvps?: string[];
  maxAttendees?: number;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [rsvpdEvents, setRsvpdEvents] = useState<Event[]>([]);
  const [createdEvents, setCreatedEvents] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<'rsvps' | 'created'>('rsvps');
  const router = useRouter();

  useEffect(() => {
    // Keep local copy updated if auth state changes
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return unsubscribe;
  }, []);

  // Fetch events user has RSVP'd to
  useEffect(() => {
    if (!user) {
      setRsvpdEvents([]);
      return;
    }

    const q = query(collection(db, 'events'), where('rsvps', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        eventsData.push({ id: doc.id, ...doc.data() } as Event);
      });
      setRsvpdEvents(eventsData);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch events user has created
  useEffect(() => {
    if (!user) {
      setCreatedEvents([]);
      return;
    }

    const q = query(collection(db, 'events'), where('creatorId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        eventsData.push({ id: doc.id, ...doc.data() } as Event);
      });
      setCreatedEvents(eventsData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSignOut = async () => {
    try {
    await signOut(auth);
    // Clear manually stored credentials used for silent re-auth
    await clearCredentials();
      // Navigate to signed-out confirmation screen
      router.replace('/(auth)/signed-out');
    } catch (e: any) {
      console.error('Sign out error', e);
      Alert.alert('Sign out failed', e.message || String(e));
    }
  };

  const renderEventItem = ({ item }: { item: Event }) => {
    const rsvpCount = item.rsvps?.length || 0;
    
    return (
      <ThemedView style={styles.eventItem}>
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
          {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
        </ThemedText>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView style={styles.scrollView}>
        <ThemedText type="title" style={styles.title}>Profile</ThemedText>
        
        {user ? (
          <>
            <ThemedView style={styles.userInfo}>
              <ThemedText style={styles.label}>Email:</ThemedText>
              <ThemedText style={styles.value}>{user.email}</ThemedText>
              <ThemedText style={styles.label}>UID:</ThemedText>
              <ThemedText style={styles.value}>{user.uid}</ThemedText>
            </ThemedView>

            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
              <TouchableOpacity 
                style={[styles.tab, activeTab === 'rsvps' && styles.activeTab]}
                onPress={() => setActiveTab('rsvps')}
              >
                <ThemedText style={[styles.tabText, activeTab === 'rsvps' && styles.activeTabText]}>
                  My RSVPs ({rsvpdEvents.length})
                </ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.tab, activeTab === 'created' && styles.activeTab]}
                onPress={() => setActiveTab('created')}
              >
                <ThemedText style={[styles.tabText, activeTab === 'created' && styles.activeTabText]}>
                  Created ({createdEvents.length})
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Event Lists */}
            <View style={styles.eventsContainer}>
              {activeTab === 'rsvps' ? (
                rsvpdEvents.length > 0 ? (
                  <FlatList
                    data={rsvpdEvents}
                    renderItem={renderEventItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                  />
                ) : (
                  <ThemedText style={styles.emptyText}>You haven't RSVP'd to any events yet.</ThemedText>
                )
              ) : (
                createdEvents.length > 0 ? (
                  <FlatList
                    data={createdEvents}
                    renderItem={renderEventItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                  />
                ) : (
                  <ThemedText style={styles.emptyText}>You haven't created any events yet.</ThemedText>
                )
              )}
            </View>
          </>
        ) : (
          <ThemedText style={styles.info}>No user signed in.</ThemedText>
        )}

        <View style={styles.signOutContainer}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  title: { 
    fontSize: 28, 
    fontWeight: '700', 
    marginBottom: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  userInfo: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  label: { 
    fontSize: 14, 
    color: '#999', 
    marginTop: 8,
    fontWeight: '500',
  },
  value: { 
    fontSize: 16, 
    color: '#fff',
    marginBottom: 4,
  },
  info: { 
    fontSize: 16, 
    marginVertical: 12,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  activeTabText: {
    color: '#fff',
  },
  eventsContainer: {
    flex: 1,
    marginBottom: 20,
  },
  eventItem: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  eventTitle: {
    fontSize: 16,
    marginBottom: 6,
    color: '#fff',
  },
  locationName: {
    fontSize: 14,
    marginBottom: 4,
    color: '#007AFF',
  },
  eventDetail: {
    fontSize: 13,
    marginBottom: 3,
    color: '#ccc',
  },
  description: {
    fontSize: 13,
    marginBottom: 6,
    color: '#aaa',
    fontStyle: 'italic',
  },
  coordinates: {
    fontSize: 11,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginTop: 40,
    fontStyle: 'italic',
  },
  signOutContainer: {
    marginTop: 20,
    marginBottom: 40,
    alignItems: 'center',
  },
  signOutButton: {
    backgroundColor: '#ff3b30',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  signOutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
