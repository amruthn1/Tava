export interface Post {
  id: string;
  authorId: string;
  title: string;
  description?: string;
  createdAt: number; // epoch ms for easier ordering client-side
  location?: {
    latitude: number;
    longitude: number;
    label?: string;
  };
  personType?: string; // builder, mentor, etc.
  peopleNeeded?: number;
  skillsets?: string[];
}

// Firestore collection name constant
export const POSTS_COLLECTION = 'posts';