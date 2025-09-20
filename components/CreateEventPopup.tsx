import { auth, db } from '@/constants/firebase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { addDoc, collection } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function CreateEventPopup({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [eventType, setEventType] = useState('');
  const [numPeople, setNumPeople] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [customLatitude, setCustomLatitude] = useState('');
  const [customLongitude, setCustomLongitude] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const getLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission to access location was denied');
      return;
    }

    setIsLoading(true);
    try {
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!eventType || !numPeople) {
      Alert.alert('Missing Information', 'Please fill in event type and number of people.');
      return;
    }

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
        Alert.alert('Authentication Error', 'Please sign in to create an event.');
        return;
      }

      const eventData: any = {
        eventType,
        numPeople,
        location: finalLocation,
        createdAt: new Date(),
        creatorId: user.uid,
        rsvps: [],
      };

      if (description.trim()) eventData.description = description.trim();
      if (locationName.trim()) eventData.locationName = locationName.trim();
      if (maxAttendeesNum) eventData.maxAttendees = maxAttendeesNum;

      await addDoc(collection(db, 'events'), eventData);
      
      // Reset form and close popup
      resetForm();
      onClose();
      Alert.alert('Success', 'Event created successfully!');
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create event. Please try again.');
    }
  };

  const resetForm = () => {
    setEventType('');
    setNumPeople('');
    setDescription('');
    setLocationName('');
    setMaxAttendees('');
    setLocation(null);
    setUseCustomLocation(false);
    setCustomLatitude('');
    setCustomLongitude('');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <ThemedText type="title" style={styles.modalTitle}>Create Event</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="Event Type (e.g., Basketball)"
              placeholderTextColor="#999"
              value={eventType}
              onChangeText={setEventType}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Number of People"
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
              placeholder="Location Name (e.g., Central Park)"
              placeholderTextColor="#999"
              value={locationName}
              onChangeText={setLocationName}
            />
            
            <View style={styles.locationContainer}>
              <TouchableOpacity 
                style={styles.locationButton}
                onPress={getLocation}
                disabled={isLoading}
              >
                <Ionicons 
                  name="location" 
                  size={18} 
                  color="#007AFF" 
                  style={styles.locationIcon} 
                />
                <ThemedText style={styles.locationButtonText}>
                  {isLoading ? 'Getting Location...' : 'Use Current Location'}
                </ThemedText>
              </TouchableOpacity>
              
              {location && (
                <ThemedText style={styles.locationText}>
                  {location.coords.latitude.toFixed(4)}, {location.coords.longitude.toFixed(4)}
                </ThemedText>
              )}
            </View>
            
            <TouchableOpacity 
              style={[styles.submitButton, (!eventType || !numPeople || !location) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!eventType || !numPeople || !location}
            >
              <ThemedText style={styles.submitButtonText}>Create Event</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  formContainer: {
    paddingBottom: 20,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    color: 'white',
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  locationContainer: {
    marginBottom: 15,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  locationIcon: {
    marginRight: 10,
  },
  locationButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  locationText: {
    color: '#999',
    fontSize: 14,
    marginLeft: 10,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
