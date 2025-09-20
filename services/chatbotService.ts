import { db } from '@/constants/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export interface Event {
  id: string;
  eventType: string;
  numPeople: string;
  location: {
    latitude: number;
    longitude: number;
  };
  createdAt?: any;
}

export class ChatbotService {
  // Get all events from Firebase
  static async getAllEvents(): Promise<Event[]> {
    try {
      const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const events: Event[] = [];
      
      querySnapshot.forEach((doc) => {
        events.push({ id: doc.id, ...doc.data() } as Event);
      });
      
      return events;
    } catch (error) {
      console.error('Error fetching events:', error);
      return [];
    }
  }

  // Get recent events (last 10)
  static async getRecentEvents(): Promise<Event[]> {
    try {
      const q = query(
        collection(db, 'events'), 
        orderBy('createdAt', 'desc'), 
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const events: Event[] = [];
      
      querySnapshot.forEach((doc) => {
        events.push({ id: doc.id, ...doc.data() } as Event);
      });
      
      return events;
    } catch (error) {
      console.error('Error fetching recent events:', error);
      return [];
    }
  }

  // Get events by type
  static async getEventsByType(eventType: string): Promise<Event[]> {
    try {
      const allEvents = await this.getAllEvents();
      return allEvents.filter(event => 
        event.eventType.toLowerCase().includes(eventType.toLowerCase())
      );
    } catch (error) {
      console.error('Error fetching events by type:', error);
      return [];
    }
  }

  // Get events near a location (simple distance calculation)
  static async getEventsNearLocation(lat: number, lng: number, radiusKm: number = 10): Promise<Event[]> {
    try {
      const allEvents = await this.getAllEvents();
      return allEvents.filter(event => {
        const distance = this.calculateDistance(
          lat, lng, 
          event.location.latitude, 
          event.location.longitude
        );
        return distance <= radiusKm;
      });
    } catch (error) {
      console.error('Error fetching events near location:', error);
      return [];
    }
  }

  // Calculate distance between two coordinates (Haversine formula)
  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in km
    return d;
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  // Format events data for AI context
  static formatEventsForAI(events: Event[]): string {
    if (events.length === 0) {
      return "No events found.";
    }

    return events.map(event => 
      `Event: ${event.eventType}, People: ${event.numPeople}, Location: (${event.location.latitude}, ${event.location.longitude})`
    ).join('\n');
  }
}
