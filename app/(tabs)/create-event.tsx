import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { auth, db } from '@/constants/firebase';
import * as Location from 'expo-location';
import { addDoc, collection } from 'firebase/firestore';
import React, { useState } from 'react';
import { Alert, Button, Keyboard, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CreateEventScreen() {
  const insets = useSafeAreaInsets();
  const [eventType, setEventType] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [customLatitude, setCustomLatitude] = useState('');
  const [customLongitude, setCustomLongitude] = useState('');

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
    // Validate required fields
    if (!eventType || !numPeople) {
      Alert.alert('Missing Information', 'Please fill in event type and number of people.');
      return;
    }

    // Validate location
    let finalLocation;
    if (useCustomLocation) {
      if (!customLatitude || !customLongitude) {
        Alert.alert('Missing Location', 'Please enter both latitude and longitude for custom location.');
        return;
      }
      const lat = parseFloat(customLatitude);
      const lng = parseFloat(customLongitude);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        Alert.alert('Invalid Location', 'Please enter valid latitude (-90 to 90) and longitude (-180 to 180).');
        return;
      }
      finalLocation = { latitude: lat, longitude: lng };
    } else {
      if (!location) {
        Alert.alert('Missing Location', 'Please get your current location or use custom location.');
        return;
      }
      finalLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }

    // Validate max attendees if provided
    let maxAttendeesNum = undefined;
    if (maxAttendees) {
      maxAttendeesNum = parseInt(maxAttendees);
      if (isNaN(maxAttendeesNum) || maxAttendeesNum < 1) {
        Alert.alert('Invalid Max Attendees', 'Please enter a valid number for max attendees.');
        return;
      }
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Not Authenticated', 'You must be logged in to create an event.');
        return;
      }

      const eventData: any = {
        eventType,
        numPeople,
        location: finalLocation,
        createdAt: new Date(),
        creatorId: user.uid,
        rsvps: [], // Initialize empty RSVP array
      };

      // Add optional fields if provided
      if (description.trim()) eventData.description = description.trim();
      if (locationName.trim()) eventData.locationName = locationName.trim();
      if (maxAttendeesNum) eventData.maxAttendees = maxAttendeesNum;

      await addDoc(collection(db, 'events'), eventData);
      
      Alert.alert('Event Created', 'Your event has been created successfully.');
      
      // Reset form
      setEventType('');
      setNumPeople('');
      setDescription('');
      setLocationName('');
      setMaxAttendees('');
      setLocation(null);
      setUseCustomLocation(false);
      setCustomLatitude('');
      setCustomLongitude('');
    } catch (error) {
      console.error('Error adding document: ', error);
      Alert.alert('Error', 'There was an error creating your event.');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>Create Event</ThemedText>
          
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Event Details</ThemedText>
            
            <TextInput
              style={styles.input}
              placeholder="Type of Event (e.g., Basketball, Study Group)"
              placeholderTextColor="#999"
              value={eventType}
              onChangeText={setEventType}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Number of People Expected"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={numPeople}
              onChangeText={setNumPeople}
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description (optional)"
              placeholderTextColor="#999"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Max Attendees (optional)"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={maxAttendees}
              onChangeText={setMaxAttendees}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>Location</ThemedText>
            
            <TextInput
              style={styles.input}
              placeholder="Location Name (e.g., WALC, McCutcheon, PMU)"
              placeholderTextColor="#999"
              value={locationName}
              onChangeText={setLocationName}
            />
            
            <View style={styles.switchContainer}>
              <ThemedText>Use Custom Location</ThemedText>
              <Switch
                value={useCustomLocation}
                onValueChange={setUseCustomLocation}
                trackColor={{ false: '#767577', true: '#81b0ff' }}
                thumbColor={useCustomLocation ? '#007AFF' : '#f4f3f4'}
              />
            </View>
            
            {useCustomLocation ? (
              <View style={styles.customLocationContainer}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Latitude"
                  placeholderTextColor="#999"
                  value={customLatitude}
                  onChangeText={setCustomLatitude}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Longitude"
                  placeholderTextColor="#999"
                  value={customLongitude}
                  onChangeText={setCustomLongitude}
                  keyboardType="numeric"
                />
              </View>
            ) : (
              <View style={styles.currentLocationContainer}>
                <TouchableOpacity style={styles.locationButton} onPress={getLocation}>
                  <Text style={styles.locationButtonText}>Get Current Location</Text>
                </TouchableOpacity>
                {location && (
                  <ThemedText style={styles.locationText}>
                    📍 {location.coords.latitude.toFixed(6)}, {location.coords.longitude.toFixed(6)}
                  </ThemedText>
                )}
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>Create Event</Text>
          </TouchableOpacity>
        </ScrollView>
      </ThemedView>
    </TouchableWithoutFeedback>
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
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    textAlign: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    marginBottom: 15,
    color: '#007AFF',
  },
  input: {
    width: '100%',
    height: 50,
    borderColor: '#444',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    backgroundColor: '#2a2a2a',
    color: 'white',
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 15,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingVertical: 10,
  },
  customLocationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  currentLocationContainer: {
    alignItems: 'center',
  },
  locationButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  locationButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  locationText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
  },
  submitButton: {
    backgroundColor: '#34C759',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  submitButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
});