export interface Post {
  id: string;
  authorId: string;
  title: string;
  description?: string;
  createdAt: number; // epoch ms for easier ordering client-side
  // future: tags, skillsNeeded, stage, attachments
}

// Firestore collection name constant
export const POSTS_COLLECTION = 'posts';