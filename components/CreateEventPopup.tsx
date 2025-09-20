import { auth, db } from '@/constants/firebase';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, Modal, StyleSheet, TextInput, TouchableOpacity, View, ScrollView, Switch } from 'react-native';
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
  const [eventDate, setEventDate] = useState(new Date());
  const [isScheduledEvent, setIsScheduledEvent] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

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
        eventType: eventType.trim(),
        numPeople: numPeople.trim(),
        location: finalLocation,
        createdAt: Timestamp.fromDate(new Date()),
        creatorId: user.uid || auth.currentUser?.uid || 'unknown',
        rsvps: [],
        isActive: !isScheduledEvent, // Active if not scheduled for future
      };

      if (description.trim()) eventData.description = description.trim();
      if (locationName.trim()) eventData.locationName = locationName.trim();
      if (maxAttendeesNum) eventData.maxAttendees = maxAttendeesNum;
      if (isScheduledEvent && eventDate) {
        eventData.eventDate = Timestamp.fromDate(eventDate);
      }

      console.log('Creating event with data:', eventData);
      console.log('Current user:', user);
      console.log('User UID:', user.uid);
      console.log('Auth state:', auth.currentUser);
      
      await addDoc(collection(db, 'events'), eventData);
      
      // Reset form and close popup
      resetForm();
      onClose();
      Alert.alert('Success', 'Event created successfully!');
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    setEventDate(new Date());
    setIsScheduledEvent(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setEventDate(selectedDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(eventDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setEventDate(newDate);
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
          
          <ScrollView style={styles.scrollContainer}>
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
            
            <TextInput
              style={styles.input}
              placeholder="Max Attendees (optional)"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={maxAttendees}
              onChangeText={setMaxAttendees}
            />
            
            {/* Schedule Event Toggle */}
            <View style={styles.toggleContainer}>
              <ThemedText style={styles.toggleLabel}>Schedule for later?</ThemedText>
              <Switch
                value={isScheduledEvent}
                onValueChange={setIsScheduledEvent}
                trackColor={{ false: '#767577', true: '#007AFF' }}
                thumbColor={isScheduledEvent ? '#ffffff' : '#f4f3f4'}
              />
            </View>
            
            {/* Date and Time Selection */}
            {isScheduledEvent && (
              <View style={styles.dateTimeContainer}>
                <TouchableOpacity 
                  style={styles.dateTimeButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar" size={18} color="#007AFF" style={styles.dateTimeIcon} />
                  <ThemedText style={styles.dateTimeButtonText}>
                    Date: {eventDate.toLocaleDateString()}
                  </ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.dateTimeButton}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Ionicons name="time" size={18} color="#007AFF" style={styles.dateTimeIcon} />
                  <ThemedText style={styles.dateTimeButtonText}>
                    Time: {eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </ThemedText>
                </TouchableOpacity>
                
                <ThemedText style={styles.selectedDateTime}>
                  Selected: {formatDateTime(eventDate)}
                </ThemedText>
              </View>
            )}
            
            <View style={styles.locationContainer}>
              <TouchableOpacity 
                style={styles.locationButton}
                onPress={getLocation}
                disabled={isLoading || useCustomLocation}
              >
                <Ionicons 
                  name="location" 
                  size={18} 
                  color={useCustomLocation ? "#666" : "#007AFF"} 
                  style={styles.locationIcon} 
                />
                <ThemedText style={[styles.locationButtonText, useCustomLocation && { color: '#666' }]}>
                  {isLoading ? 'Getting Location...' : 'Use Current Location'}
                </ThemedText>
              </TouchableOpacity>
              
              {location && !useCustomLocation && (
                <ThemedText style={styles.locationText}>
                  {location.coords.latitude.toFixed(4)}, {location.coords.longitude.toFixed(4)}
                </ThemedText>
              )}
              
              {/* Custom Location Toggle */}
              <View style={styles.toggleContainer}>
                <ThemedText style={styles.toggleLabel}>Use custom location?</ThemedText>
                <Switch
                  value={useCustomLocation}
                  onValueChange={setUseCustomLocation}
                  trackColor={{ false: '#767577', true: '#007AFF' }}
                  thumbColor={useCustomLocation ? '#ffffff' : '#f4f3f4'}
                />
              </View>
              
              {/* Custom Location Inputs */}
              {useCustomLocation && (
                <View style={styles.customLocationContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Latitude (e.g., 40.7128)"
                    placeholderTextColor="#999"
                    value={customLatitude}
                    onChangeText={setCustomLatitude}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Longitude (e.g., -74.0060)"
                    placeholderTextColor="#999"
                    value={customLongitude}
                    onChangeText={setCustomLongitude}
                    keyboardType="numeric"
                  />
                </View>
              )}
            </View>
            
            <TouchableOpacity 
              style={[styles.submitButton, (!eventType || !numPeople || (!location && !useCustomLocation) || (useCustomLocation && (!customLatitude || !customLongitude))) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!eventType || !numPeople || (!location && !useCustomLocation) || (useCustomLocation && (!customLatitude || !customLongitude))}
            >
              <ThemedText style={styles.submitButtonText}>Create Event</ThemedText>
            </TouchableOpacity>
          </View>
          </ScrollView>
          
          {/* Date and Time Pickers */}
          {showDatePicker && (
            <DateTimePicker
              value={eventDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={new Date()}
            />
          )}
          
          {showTimePicker && (
            <DateTimePicker
              value={eventDate}
              mode="time"
              display="default"
              onChange={onTimeChange}
            />
          )}
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
  scrollContainer: {
    maxHeight: '80%',
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  toggleLabel: {
    color: 'white',
    fontSize: 16,
  },
  dateTimeContainer: {
    marginBottom: 15,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  dateTimeIcon: {
    marginRight: 10,
  },
  dateTimeButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  selectedDateTime: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  customLocationContainer: {
    marginTop: 10,
  },
});
