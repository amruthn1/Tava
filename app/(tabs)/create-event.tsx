import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/constants/firebase';
import * as Location from 'expo-location';
import { addDoc, collection } from 'firebase/firestore';
import React, { useState } from 'react';
import { Alert, Button, Keyboard, StyleSheet, TextInput, TouchableWithoutFeedback } from 'react-native';

export default function CreateEventScreen() {
  const [eventType, setEventType] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  const getLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission to access location was denied');
      return;
    }

    let currentLocation = await Location.getCurrentPositionAsync({});
    setLocation(currentLocation);
  };

  const handleSubmit = async () => {
    if (!eventType || !numPeople || !location) {
      Alert.alert('Please fill all fields and get your location');
      return;
    }
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Not Authenticated', 'You must be logged in to create an event.');
        return;
      }
      await addDoc(collection(db, 'events'), {
        eventType,
        numPeople,
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        createdAt: new Date(),
        creatorId: user.uid,
      });
      Alert.alert('Event Created', 'Your event has been created successfully.');
      setEventType('');
      setNumPeople('');
      setLocation(null);
    } catch (error) {
      console.error('Error adding document: ', error);
      Alert.alert('Error', 'There was an error creating your event.');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Create Event</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Type of Event"
          value={eventType}
          onChangeText={setEventType}
        />
        <TextInput
          style={styles.input}
          placeholder="Number of People"
          keyboardType="numeric"
          value={numPeople}
          onChangeText={setNumPeople}
        />
        <Button title="Get Location" onPress={getLocation} />
        {location && (
          <ThemedText>
            Location: {location.coords.latitude}, {location.coords.longitude}
          </ThemedText>
        )}
        <Button title="Submit" onPress={handleSubmit} />
      </ThemedView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  input: {
    width: '100%',
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 10,
    color: 'black',
  },
});