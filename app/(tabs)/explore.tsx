import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/constants/firebase';
import { collection, deleteDoc, doc, onSnapshot, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Button, FlatList, Platform, SafeAreaView, StyleSheet } from 'react-native';

interface Event {
  id: string;
  eventType: string;
  numPeople: string;
  location: {
    latitude: number;
    longitude: number;
  };
  creatorId?: string;
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
      await deleteDoc(doc(db, 'events', eventId));
    } catch (error) {
      console.error("Error removing document: ", error);
    }
  };

  const user = auth.currentUser;
  const renderItem = ({ item }: { item: Event }) => (
    <ThemedView style={styles.itemContainer}>
      <ThemedText type="defaultSemiBold">{item.eventType}</ThemedText>
      <ThemedText>People: {item.numPeople}</ThemedText>
      <ThemedText>Location: {item.location.latitude}, {item.location.longitude}</ThemedText>
      {user && item.creatorId === user.uid && (
        <Button title="Delete" onPress={() => handleDelete(item.id)} />
      )}
    </ThemedView>
  );

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
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
});