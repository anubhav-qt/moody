import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { Track, FollowedArtist } from '../models/userDataTypes';

dotenv.config();

// Initialize Firebase
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
  path.join(__dirname, '../..', 'serviceAccountKey.json');

let db: FirebaseFirestore.Firestore;

try {
  // Check if the service account file exists
  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`Firebase service account file not found at: ${serviceAccountPath}`);
    throw new Error('Firebase service account file not found');
  }
  
  // Initialize with service account
  initializeApp({
    credential: cert(serviceAccountPath)
  });
  
  // Get Firestore instance
  db = getFirestore();
  
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error);
  throw error;
}

interface SpotifyTokenData {
  accessToken: string;
  refreshToken: string;
  tokenExpires: number; // Timestamp when token expires
  userId?: string; // Optional Spotify user ID
}

class FirebaseService {
  /**
   * Store Spotify token for a user
   * @param userId User identifier
   * @param tokenData Spotify token data
   */
  async storeSpotifyToken(userId: string, tokenData: SpotifyTokenData): Promise<void> {
    try {
      if (!userId) {
        console.error('Cannot store token: User ID is empty');
        return;
      }
      
      // Add timestamp
      const dataWithTimestamp = {
        ...tokenData,
        updatedAt: Timestamp.now()
      };

      await db.collection('spotifyTokens').doc(userId).set(dataWithTimestamp);
    } catch (error) {
      console.error(`Error storing token in Firestore for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get Spotify token for a user
   * @param userId User identifier
   * @returns Token data or null if not found
   */
  async getSpotifyToken(userId: string): Promise<SpotifyTokenData | null> {
    try {
      const docRef = await db.collection('spotifyTokens').doc(userId).get();
      
      if (!docRef.exists) {
        return null;
      }
      
      return docRef.data() as SpotifyTokenData;
    } catch (error) {
      console.error('Error getting token from Firestore:', error);
      throw error;
    }
  }

  /**
   * Update access token for a user
   * @param userId User identifier
   * @param accessToken New access token
   * @param tokenExpires New expiration time
   */
  async updateAccessToken(
    userId: string, 
    accessToken: string, 
    tokenExpires: number
  ): Promise<void> {
    try {
      await db.collection('spotifyTokens').doc(userId).update({
        accessToken,
        tokenExpires,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating access token in Firestore:', error);
      throw error;
    }
  }

  /**
   * Process and store user's top artists
   * @param userId Spotify user ID
   * @param topArtistsData Original top artists data from Spotify API
   * @param timeRange Time range used for this data
   */
  async storeUserTopArtists(
    userId: string, 
    topArtistsData: any,
    timeRange: 'long_term' | 'medium_term' | 'short_term'
  ): Promise<void> {
    try {
      if (!userId) {
        console.error('Cannot store user top artists: User ID is empty');
        return;
      }

      // Process the artists to pick essential fields
      const processedArtists = this.processArtistData(topArtistsData.items);
      
      // Get existing user data or create new
      const userDocRef = db.collection('userData').doc(userId);
      const doc = await userDocRef.get();
      
      const fieldName = `topArtists_${timeRange}`;
      const updateTimestampField = `${fieldName}_lastUpdated`;
      
      if (doc.exists) {
        // Update existing document
        const updateData: Record<string, any> = {};
        updateData[fieldName] = processedArtists;
        updateData[updateTimestampField] = Timestamp.now();
        
        await userDocRef.update(updateData);
      } else {
        // Create new document
        const initialData: Record<string, any> = {};
        initialData[fieldName] = processedArtists;
        initialData[updateTimestampField] = Timestamp.now();
        
        await userDocRef.set(initialData);
      }
      
      console.log(`Stored ${processedArtists.length} top artists (${timeRange}) for user ${userId}`);
    } catch (error) {
      console.error(`Error storing top artists in Firestore for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Process and store user's top tracks
   * @param userId Spotify user ID
   * @param topTracksData Original top tracks data from Spotify API
   * @param timeRange Time range used for this data
   */
  async storeUserTopTracks(
    userId: string, 
    topTracksData: any,
    timeRange: 'long_term' | 'medium_term' | 'short_term'
  ): Promise<void> {
    try {
      if (!userId) {
        console.error('Cannot store user top tracks: User ID is empty');
        return;
      }

      // Process the tracks to remove unwanted fields
      // Note: unlike saved tracks, top tracks are not wrapped in a "track" object
      const processedTracks = topTracksData.items.map((track: any) => this.processIndividualTrack(track));
      
      // Get existing user data or create new
      const userDocRef = db.collection('userData').doc(userId);
      const doc = await userDocRef.get();
      
      const fieldName = `topTracks_${timeRange}`;
      const updateTimestampField = `${fieldName}_lastUpdated`;
      
      if (doc.exists) {
        // Update existing document
        const updateData: Record<string, any> = {};
        updateData[fieldName] = processedTracks;
        updateData[updateTimestampField] = Timestamp.now();
        
        await userDocRef.update(updateData);
      } else {
        // Create new document
        const initialData: Record<string, any> = {};
        initialData[fieldName] = processedTracks;
        initialData[updateTimestampField] = Timestamp.now();
        
        await userDocRef.set(initialData);
      }
      
      console.log(`Stored ${processedTracks.length} top tracks (${timeRange}) for user ${userId}`);
    } catch (error) {
      console.error(`Error storing top tracks in Firestore for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Process a single track data object (for top tracks)
   * This is needed because top tracks are not wrapped in a "track" object like saved tracks
   * @param track Track item from Spotify API
   * @returns Processed track
   */
  private processIndividualTrack(track: any): Track {
    // Process album
    const processedAlbum = {
      album_type: track.album.album_type,
      artists: track.album.artists.map((artist: any) => ({
        external_urls: { spotify: artist.external_urls.spotify },
        href: artist.href,
        id: artist.id,
        name: artist.name,
        uri: artist.uri
      })),
      external_urls: { spotify: track.album.external_urls.spotify },
      href: track.album.href,
      id: track.album.id,
      name: track.album.name,
      release_date: track.album.release_date,
      uri: track.album.uri
    };

    // Process track
    return {
      album: processedAlbum,
      artists: track.artists.map((artist: any) => ({
        external_urls: { spotify: artist.external_urls.spotify },
        href: artist.href,
        id: artist.id,
        name: artist.name,
        uri: artist.uri
      })),
      disc_number: track.disc_number,
      duration_ms: track.duration_ms,
      explicit: track.explicit,
      external_ids: track.external_ids,
      external_urls: { spotify: track.external_urls.spotify },
      href: track.href,
      id: track.id,
      is_local: track.is_local,
      is_playable: track.is_playable,
      name: track.name,
      popularity: track.popularity,
      preview_url: track.preview_url,
      track_number: track.track_number,
      uri: track.uri
    };
  }

  /**
   * Process artist data to keep the essential fields and exclude images
   * @param artists Artist items from Spotify API
   * @returns Processed artists
   */
  private processArtistData(artists: any[]): FollowedArtist[] {
    return artists.map(artist => ({
      external_urls: { spotify: artist.external_urls.spotify },
      href: artist.href,
      id: artist.id,
      name: artist.name,
      uri: artist.uri,
      genres: artist.genres,
      popularity: artist.popularity,
      followers: artist.followers
      // Images field removed to save storage space
    }));
  }

  /**
   * Get user's top artists from Firestore
   * @param userId Spotify user ID
   * @param timeRange Time range for the top artists
   * @returns User top artists data or null if not found
   */
  async getUserTopArtists(
    userId: string,
    timeRange: 'long_term' | 'medium_term' | 'short_term'
  ): Promise<FollowedArtist[] | null> {
    try {
      const docRef = await db.collection('userData').doc(userId).get();
      
      if (!docRef.exists) {
        return null;
      }
      
      const data = docRef.data();
      const fieldName = `topArtists_${timeRange}`;
      return data?.[fieldName] as FollowedArtist[] || null;
    } catch (error) {
      console.error('Error getting user top artists from Firestore:', error);
      throw error;
    }
  }

  /**
   * Get user's top tracks from Firestore
   * @param userId Spotify user ID
   * @param timeRange Time range for the top tracks
   * @returns User top tracks data or null if not found
   */
  async getUserTopTracks(
    userId: string,
    timeRange: 'long_term' | 'medium_term' | 'short_term'
  ): Promise<Track[] | null> {
    try {
      const docRef = await db.collection('userData').doc(userId).get();
      
      if (!docRef.exists) {
        return null;
      }
      
      const data = docRef.data();
      const fieldName = `topTracks_${timeRange}`;
      return data?.[fieldName] as Track[] || null;
    } catch (error) {
      console.error('Error getting user top tracks from Firestore:', error);
      throw error;
    }
  }
}

export default new FirebaseService();
