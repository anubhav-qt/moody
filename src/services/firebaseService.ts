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

  /**
   * Store playlist categories by country and language
   * @param country ISO 3166-1 alpha-2 country code
   * @param locale Language code (e.g., 'en_US', 'hi_IN')
   * @param categories Categories data from Spotify API
   */
  async storePlaylistCategories(
    country: string,
    locale: string,
    categories: any[]
  ): Promise<void> {
    try {
      if (!country || !locale || !categories) {
        console.error('Cannot store playlist categories: Missing required parameters');
        return;
      }

      console.log(`Processing ${categories.length} categories for ${locale}...`);
      
      // Filter out categories for specific languages
      const filteredCategories = categories.filter(category => {
        const name = category.name.toLowerCase();
        const isExcluded = name.includes('tamil') || 
                           name.includes('telugu') ||
                           name.includes('malayalam') || 
                           name.includes('bhojpuri');
        
        if (isExcluded) {
          console.log(`Filtering out category: ${category.name}`);
        }
        return !isExcluded;
      });
      
      console.log(`Filtered out ${categories.length - filteredCategories.length} categories based on language criteria`);
      
      // Process categories to keep essential fields, excluding icons
      const processedCategories = filteredCategories.map(category => ({
        id: category.id,
        name: category.name,
        href: category.href
        // Icons field removed intentionally
      }));
      
      // Get reference to document for the country
      const countryDocRef = db.collection('playlistCategories').doc(country);
      
      // Get existing data or create new
      const doc = await countryDocRef.get();
      
      if (doc.exists) {
        // Update existing document with new language data
        const data = doc.data() || {};
        const languages = data.languages || {};
        
        // Debug log what's in the database before update
        console.log(`Existing languages in database for ${country}:`, Object.keys(languages));
        
        // Update the categories for this locale
        languages[locale] = processedCategories;
        
        // Update the document with the new languages structure
        await countryDocRef.update({
          languages,
          updatedAt: Timestamp.now()
        });
      } else {
        // Create new document
        console.log(`Creating new document for ${country} with locale ${locale}`);
        await countryDocRef.set({
          languages: {
            [locale]: processedCategories
          },
          updatedAt: Timestamp.now(),
          createdAt: Timestamp.now()
        });
      }
      
      console.log(`Stored ${processedCategories.length} playlist categories for country ${country}, locale ${locale}`);
    } catch (error) {
      console.error(`Error storing playlist categories for country ${country}, locale ${locale}:`, error);
      throw error;
    }
  }

  /**
   * Get playlist categories for a country and locale
   * @param country ISO 3166-1 alpha-2 country code
   * @param locale Optional language code. If not provided, returns all languages for the country
   * @returns Playlist categories or null if not found
   */
  async getPlaylistCategories(
    country: string,
    locale?: string
  ): Promise<any> {
    try {
      const docRef = await db.collection('playlistCategories').doc(country).get();
      
      if (!docRef.exists) {
        return null;
      }
      
      const data = docRef.data();
      if (!data) return null;
      
      // If locale is specified, return only that language's categories
      if (locale && data.languages && data.languages[locale]) {
        return { 
          country, 
          locale, 
          categories: data.languages[locale],
          updatedAt: data.updatedAt
        };
      }
      
      // Otherwise return the full language structure
      return {
        country,
        languages: data.languages,
        updatedAt: data.updatedAt
      };
    } catch (error) {
      console.error(`Error getting playlist categories for country ${country}, locale ${locale}:`, error);
      throw error;
    }
  }

  /**
   * Process track data to keep only necessary fields
   * @param trackItems Track items from playlist tracks endpoint
   * @returns Array of processed tracks
   */
  processSongData(trackItems: any[]): any[] {
    if (!trackItems || trackItems.length === 0) return [];
    
    return trackItems
      .filter(item => item.track) // Ensure track exists (some items might be null)
      .map(item => {
        const track = item.track;
        
        // Skip local tracks and tracks without IDs
        if (track.is_local || !track.id) return null;
        
        return {
          id: track.id,
          name: track.name,
          artists: track.artists.map((artist: any) => ({
            id: artist.id,
            name: artist.name
          })),
          album: {
            id: track.album.id,
            name: track.album.name,
            release_date: track.album.release_date
          },
          duration_ms: track.duration_ms,
          popularity: track.popularity,
          explicit: track.explicit,
          preview_url: track.preview_url || null
        };
      })
      .filter(Boolean); // Remove null items
  }

  /**
   * Process and store songs from playlists for a category
   * @param categoryId Spotify category ID
   * @param categoryName Category name for reference
   * @param songs Array of processed song objects
   */
  async storeCategorySongs(
    categoryId: string,
    categoryName: string,
    songs: any[]
  ): Promise<void> {
    try {
      if (!categoryId || !songs || songs.length === 0) {
        console.error('Cannot store songs: Missing required parameters or empty songs array');
        return;
      }
      
      // Process songs to remove duplicates based on track ID
      const uniqueSongs = this.removeDuplicateSongs(songs);
      console.log(`Storing ${uniqueSongs.length} unique songs for category ${categoryName} (${categoryId})`);
      
      // Store in Firestore
      await db.collection('songsDataset').doc(categoryId).set({
        categoryId,
        categoryName,
        songs: uniqueSongs,
        count: uniqueSongs.length,
        updatedAt: Timestamp.now()
      }, { merge: true });
      
    } catch (error) {
      console.error(`Error storing songs for category ${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Remove duplicate songs based on track ID
   * @param songs Array of songs that may contain duplicates
   * @returns Array of unique songs
   */
  private removeDuplicateSongs(songs: any[]): any[] {
    const uniqueSongs = Array.from(
      new Map(songs.map(song => [song.id, song])).values()
    );
    
    return uniqueSongs;
  }

  /**
   * Get songs for a specific category
   * @param categoryId Spotify category ID
   * @returns Songs for the category or null if not found
   */
  async getCategorySongs(categoryId: string): Promise<any> {
    try {
      const docRef = await db.collection('songsDataset').doc(categoryId).get();
      
      if (!docRef.exists) {
        return null;
      }
      
      return docRef.data();
    } catch (error) {
      console.error(`Error getting songs for category ${categoryId}:`, error);
      throw error;
    }
  }
}

export default new FirebaseService();
