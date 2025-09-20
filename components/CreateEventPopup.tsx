import { auth, db } from '@/constants/firebase';
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection } from 'firebase/firestore';
import { useState } from 'react';
import { 
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View 
} from 'react-native';
import { ThemedText } from './themed-text';

interface CreateEventPopupProps {
  visible: boolean;
  onClose: () => void;
}
export default function CreateEventPopup({ visible, onClose }: CreateEventPopupProps) {
  const [eventType, setEventType] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!eventType || !description) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setIsLoading(true);
      const eventData = {
        eventType,
        description,
        locationName,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
        createdBy: auth.currentUser?.uid,
        createdAt: new Date(),
      };

      await addDoc(collection(db, 'events'), eventData);
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create event');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEventType('');
    setDescription('');
    setLocationName('');
    setMaxAttendees('');
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
      style={{ margin: 0 }}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        style={styles.container}
        enabled={false}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        
        <View style={styles.content}>
          <View style={styles.modalHeader}>
            <ThemedText type="title" style={styles.modalTitle}>Create Event</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bounces={true}
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={true}
            overScrollMode="always"
            nestedScrollEnabled={true}
            contentInsetAdjustmentBehavior="never"
          >
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Event Type *</ThemedText>
              <TextInput
                style={styles.input}
                value={eventType}
                onChangeText={setEventType}
                placeholder="e.g., Basketball, Soccer, etc."
                placeholderTextColor="#888"
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Description *</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Add details about the event"
                placeholderTextColor="#888"
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Location Name</ThemedText>
              <TextInput
                style={styles.input}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="e.g., Central Park, Court #5"
                placeholderTextColor="#888"
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Max Attendees</ThemedText>
              <TextInput
                style={styles.input}
                value={maxAttendees}
                onChangeText={setMaxAttendees}
                placeholder="Leave empty for no limit"
                placeholderTextColor="#888"
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity 
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              <ThemedText style={styles.submitButtonText}>
                {isLoading ? 'Creating...' : 'Create Event'}
              </ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    backgroundColor: 'transparent',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1001,
  },
  content: {
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    width: '100%',
    zIndex: 1002,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1e1e1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  scrollViewContent: {
    padding: 20,
    paddingBottom: 300, // Extra space at the bottom
    paddingTop: 10,
    minHeight: '100%',
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    color: '#999',
  },
  input: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    padding: 15,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#444',
    width: '100%',
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
    marginTop: 20,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
