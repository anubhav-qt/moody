import { Router, Request, Response } from 'express';
import axios from 'axios';
import spotifyService from '../services/spotifyService';
import firebaseService from '../services/firebaseService'; 
import 'express-session';
import { getMoodFilterRanges } from '../utils/moodToFeatures';

declare module 'express-session' {
  interface SessionData {
    codeVerifier?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpires?: number;
    userId?: string;
    spotifyUserId?: string;
  }
}

const router = Router();

// PKCE Authorization flow - for user-level access
// Step 1: Start the authorization flow - redirect to Spotify
router.get('/login', async (req: Request, res: Response) => {
  try {
    // Generate a code verifier
    const codeVerifier = spotifyService.generateRandomString(64);
    
    // Store it in the session for later
    req.session.codeVerifier = codeVerifier;
    
    // Generate a code challenge
    const codeChallenge = await spotifyService.generateCodeChallenge(codeVerifier);
    
    // Get the authorization URL
    const authUrl = spotifyService.getAuthorizationUrl(codeChallenge);
    
    // Redirect to Spotify authorization page
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Spotify login:', error);
    res.status(500).json({ error: 'Failed to initiate Spotify login' });
  }
});

// Step 2: Handle the callback from Spotify
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    const codeVerifier = req.session.codeVerifier;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code missing' });
    }
    
    if (!codeVerifier) {
      return res.status(400).json({ error: 'Code verifier missing' });
    }
    
    // Exchange the authorization code for an access token
    const tokenResponse = await spotifyService.getAccessTokenFromCode(code, codeVerifier);
    
    // Store the access token, refresh token, and expiration time in the session
    req.session.accessToken = tokenResponse.access_token;
    req.session.refreshToken = tokenResponse.refresh_token;
    req.session.tokenExpires = Date.now() + tokenResponse.expires_in * 1000;
    
    // Get the user's Spotify profile
    const userProfile = await spotifyService.getUserProfile(tokenResponse.access_token);
    const spotifyUserId = userProfile.id;
    
    // Store the Spotify user ID in the session
    req.session.spotifyUserId = spotifyUserId;
    
    // Store in Firestore using Spotify user ID as the document ID
    await firebaseService.storeSpotifyToken(spotifyUserId, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenExpires: Date.now() + tokenResponse.expires_in * 1000,
      userId: spotifyUserId
    });
    
    // Fetch and store only user's top tracks (removed artists) for medium and short term
    console.log('Fetching user data after authentication...');
    
    try {
      // Define time ranges - only medium and short term
      const timeRanges = ['short_term', 'medium_term'] as const;
      let hasTopTracks = false;
      
      // Fetch and store top tracks for time ranges
      for (const timeRange of timeRanges) {
        try {
          // Get user's top tracks
          const topTracksResponse = await spotifyService.getUserTopItems(
            tokenResponse.access_token, 
            'tracks', 
            timeRange, 
            -1
          );
          
          if (topTracksResponse.items && topTracksResponse.items.length > 0) {
            await firebaseService.storeUserTopTracks(spotifyUserId, topTracksResponse, timeRange);
            console.log(`Successfully stored ${topTracksResponse.items.length} top tracks for ${timeRange}`);
            hasTopTracks = true;
          } else {
            console.log(`No top tracks found for ${timeRange}`);
          }
        } catch (timeRangeError) {
          console.error(`Error processing ${timeRange} data:`, timeRangeError);
          // Continue with other time range even if one fails
        }
      }
      
      // If no top tracks were found, try to store saved tracks as a fallback
      if (!hasTopTracks) {
        console.log('No top tracks found for any time range, trying saved tracks as fallback...');
        try {
          const savedTracksResponse = await spotifyService.getUserSavedTracks(
            tokenResponse.access_token, 
            -1
          );
          
          if (savedTracksResponse.items && savedTracksResponse.items.length > 0) {
            await firebaseService.storeUserSavedTracks(spotifyUserId, savedTracksResponse);
            console.log(`Successfully stored ${savedTracksResponse.items.length} saved tracks as fallback`);
          } else {
            console.log('No saved tracks found either');
          }
        } catch (savedTracksError) {
          console.error('Error fetching saved tracks:', savedTracksError);
        }
      }
      
      console.log('Successfully stored user data after authentication!');
    } catch (dataError) {
      // If data fetching fails, just log it but continue the authentication
      console.error('Error storing user data during authentication:', dataError);
    }

    
    // Redirect to the frontend application
    res.redirect('http://localhost:3000');
  } catch (error) {
    console.error('Error in Spotify callback:', error);
    res.status(500).json({ error: 'Failed to complete Spotify authentication' });
  }
});

// Get the user's access token if they're authenticated - with automatic refresh
router.get('/user-token', async (req: Request, res: Response) => {
  try {
    let accessToken = req.session.accessToken;
    let refreshToken = req.session.refreshToken;
    let tokenExpires = req.session.tokenExpires;
    const spotifyUserId = req.session.spotifyUserId;
    
    // If tokens are not in session, try to get from Firestore using Spotify user ID
    if ((!accessToken || !refreshToken) && spotifyUserId) {
      const tokenData = await firebaseService.getSpotifyToken(spotifyUserId);
      if (tokenData) {
        accessToken = tokenData.accessToken;
        refreshToken = tokenData.refreshToken;
        tokenExpires = tokenData.tokenExpires;
        
        // Update session with retrieved tokens
        req.session.accessToken = accessToken;
        req.session.refreshToken = refreshToken;
        req.session.tokenExpires = tokenExpires;
      }
    }
    
    if (!accessToken || !refreshToken) {
      return res.status(401).json({ error: 'User not authenticated with Spotify' });
    }
    
    // Check if token is expired or will expire soon (within 5 minutes)
    const isExpiringSoon = tokenExpires && Date.now() > tokenExpires - 300000;
    
    if (isExpiringSoon) {
      console.log('Access token expired or expiring soon, refreshing...');
      const newTokenResponse = await spotifyService.refreshAccessToken(refreshToken);
      
      // Update session with new tokens
      req.session.accessToken = newTokenResponse.access_token;
      const newExpiry = Date.now() + newTokenResponse.expires_in * 1000;
      req.session.tokenExpires = newExpiry;
      
      if (newTokenResponse.refresh_token) {
        req.session.refreshToken = newTokenResponse.refresh_token;
      }
      
      // Also update Firestore
      if (spotifyUserId) {
        await firebaseService.updateAccessToken(
          spotifyUserId, 
          newTokenResponse.access_token, 
          newExpiry
        );
      }
      
      // Return the new access token
      return res.json({ 
        access_token: newTokenResponse.access_token,
        expires_in: newTokenResponse.expires_in,
        token_type: newTokenResponse.token_type
      });
    }
    
    // Return the current access token
    return res.json({ 
      access_token: accessToken,
      expires_in: tokenExpires ? Math.floor((tokenExpires - Date.now()) / 1000) : 3600,
      token_type: 'Bearer'
    });
  } catch (error) {
    console.error('Error getting/refreshing user token:', error);
    res.status(500).json({ error: 'Failed to get/refresh Spotify access token' });
  }
});

// Explicitly refresh the token on demand
router.get('/refresh-token', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.session.refreshToken;
    const userId = req.session.userId;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token available' });
    }
    
    const tokenResponse = await spotifyService.refreshAccessToken(refreshToken);
    
    // Update session with new tokens
    req.session.accessToken = tokenResponse.access_token;
    const newExpiry = Date.now() + tokenResponse.expires_in * 1000;
    
    if (tokenResponse.refresh_token) {
      req.session.refreshToken = tokenResponse.refresh_token;
    }
    
    // Also update Firestore
    if (userId) {
      await firebaseService.updateAccessToken(
        userId, 
        tokenResponse.access_token, 
        newExpiry
      );
    }
    
    return res.json({
      access_token: tokenResponse.access_token,
      expires_in: tokenResponse.expires_in,
      token_type: tokenResponse.token_type
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh Spotify access token' });
  }
});

// Add route to get user profile information
router.get('/me', async (req: Request, res: Response) => {
  try {
    const accessToken = req.session.accessToken;
    
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const profile = await spotifyService.getUserProfile(accessToken);
    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Add route to get and store user data (only top tracks)
router.get('/store-user-data', async (req: Request, res: Response) => {
  try {
    const accessToken = req.session.accessToken;
    const spotifyUserId = req.session.spotifyUserId;
    
    // Check if user is authenticated
    if (!accessToken || !spotifyUserId) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    // Define time ranges - medium and short term only
    const timeRanges = ['short_term', 'medium_term'] as const;
    
    // Store responses
    const responses: Record<string, any> = {};
    
    // Fetch and store top tracks only
    const topItemsPromises: Promise<void>[] = [];
    
    for (const timeRange of timeRanges) {
      const trackPromise = spotifyService.getUserTopItems(accessToken, 'tracks', timeRange, -1)
        .then(async (topTracksResponse) => {
          responses[`tracks_${timeRange}`] = topTracksResponse;
          await firebaseService.storeUserTopTracks(spotifyUserId, topTracksResponse, timeRange);
        });
        
      topItemsPromises.push(trackPromise);
    }
    
    // Wait for all top tracks requests to complete
    await Promise.all(topItemsPromises);
    
    res.json({ 
      success: true, 
      message: `Successfully stored top tracks for short and medium term periods`,
      userId: spotifyUserId,
      counts: {
        tracks_short_term: responses.tracks_short_term?.items.length || 0,
        tracks_medium_term: responses.tracks_medium_term?.items.length || 0
      }
    });
  } catch (error: any) {
    // Check if error is due to token expiration
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ 
        error: 'Access token expired',
        message: 'Please refresh your token or log in again'
      });
    }
    
    console.error('Error storing user data:', error);
    res.status(500).json({ 
      error: 'Failed to store user data',
      message: error.message || 'Unknown error'
    });
  }
});

// Add routes for top items (only tracks)
router.get('/store-top-items', async (req: Request, res: Response) => {
  try {
    const accessToken = req.session.accessToken;
    const spotifyUserId = req.session.spotifyUserId;
    
    // Check if user is authenticated
    if (!accessToken || !spotifyUserId) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    // Define time ranges - medium and short term only
    const timeRanges = ['short_term', 'medium_term'] as const;
    
    // Store responses for time ranges
    const responses: Record<string, any> = {};
    
    // Fetch and store tracks only
    const promises: Promise<void>[] = [];
    
    for (const timeRange of timeRanges) {
      const trackPromise = spotifyService.getUserTopItems(accessToken, 'tracks', timeRange, -1)
        .then(async (topTracksResponse) => {
          responses[`tracks_${timeRange}`] = topTracksResponse;
          await firebaseService.storeUserTopTracks(spotifyUserId, topTracksResponse, timeRange);
        });
        
      promises.push(trackPromise);
    }
    
    // Wait for all requests to complete
    await Promise.all(promises);
    
    res.json({ 
      success: true, 
      message: `Successfully stored top tracks for short and medium term periods`,
      userId: spotifyUserId,
      counts: {
        tracks_short_term: responses.tracks_short_term?.items.length || 0,
        tracks_medium_term: responses.tracks_medium_term?.items.length || 0
      }
    });
  } catch (error: any) {
    // Check if error is due to token expiration
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ 
        error: 'Access token expired',
        message: 'Please refresh your token or log in again'
      });
    }
    
    console.error('Error storing user top items:', error);
    res.status(500).json({ 
      error: 'Failed to store user top items',
      message: error.message || 'Unknown error'
    });
  }
});

// Get stored top tracks
router.get('/stored-top-tracks', async (req: Request, res: Response) => {
  try {
    const spotifyUserId = req.session.spotifyUserId;
    
    // Check if user is authenticated
    if (!spotifyUserId) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    // Get time range from query param, default to medium_term
    const timeRange = (req.query.time_range as 'medium_term' | 'short_term') || 'medium_term';
    
    // Get stored top tracks from Firestore
    const topTracks = await firebaseService.getUserTopTracks(spotifyUserId, timeRange);
    
    if (!topTracks) {
      return res.status(404).json({ error: `No top tracks (${timeRange}) found for user` });
    }
    
    res.json({
      userId: spotifyUserId,
      timeRange: timeRange,
      tracks: topTracks,
      count: topTracks.length
    });
  } catch (error) {
    console.error('Error fetching stored user top tracks:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stored user top tracks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Modified endpoint to always generate playlist recommendations and create a playlist
router.post('/generate-playlist', async (req: Request, res: Response) => {
  try {
    const accessToken = req.session.accessToken;
    const spotifyUserId = req.session.spotifyUserId;
    
    // Check if user is authenticated
    if (!accessToken || !spotifyUserId) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    const { moods, playlistName } = req.body;
    
    if (!moods || !Array.isArray(moods) || moods.length === 0) {
      return res.status(400).json({ error: 'Please select at least one mood' });
    }
    
    // Get user's top tracks for both medium and short term
    const [mediumTermTracks, shortTermTracks] = await Promise.all([
      firebaseService.getUserTopTracks(spotifyUserId, 'medium_term'),
      firebaseService.getUserTopTracks(spotifyUserId, 'short_term')
    ]);
    
    // Combine tracks from both time ranges, avoiding duplicates
    const trackIdMap = new Map();
    
    // Add medium term tracks first (lower priority)
    if (mediumTermTracks && mediumTermTracks.length > 0) {
      mediumTermTracks.forEach(track => {
        if (track.id) {
          trackIdMap.set(track.id, track);
        }
      });
    }
    
    // Add short term tracks second (higher priority - will overwrite duplicates)
    if (shortTermTracks && shortTermTracks.length > 0) {
      shortTermTracks.forEach(track => {
        if (track.id) {
          trackIdMap.set(track.id, track);
        }
      });
    }
    
    // Convert map back to array of unique tracks
    let combinedTracks = Array.from(trackIdMap.values());
    
    // If we have no top tracks, try to get saved tracks as a fallback
    if (combinedTracks.length === 0) {
      console.log('No top tracks found, trying to use saved tracks as a fallback...');
      
      // First check if we already have saved tracks stored in Firestore
      let savedTracks = await firebaseService.getUserSavedTracks(spotifyUserId);
      
      // If no saved tracks are stored, fetch them from Spotify API and store them
      if (!savedTracks || savedTracks.length === 0) {
        try {
          console.log('No saved tracks in Firestore, fetching from Spotify API...');
          const savedTracksResponse = await spotifyService.getUserSavedTracks(accessToken, -1);
          
          if (savedTracksResponse.items && savedTracksResponse.items.length > 0) {
            // Store the saved tracks for future use
            await firebaseService.storeUserSavedTracks(spotifyUserId, savedTracksResponse);
            
            // Get the stored tracks
            savedTracks = await firebaseService.getUserSavedTracks(spotifyUserId);
            console.log(`Successfully fetched and stored ${savedTracksResponse.items.length} saved tracks`);
          }
        } catch (savedTracksError) {
          console.error('Error fetching saved tracks:', savedTracksError);
          // Continue with any tracks we might have
        }
      }
      
      // Add saved tracks to our combined tracks
      if (savedTracks && savedTracks.length > 0) {
        console.log(`Using ${savedTracks.length} saved tracks for recommendations`);
        combinedTracks = savedTracks;
      }
    }
    
    // If we still have no tracks, return an error
    if (combinedTracks.length === 0) {
      return res.status(404).json({ 
        error: 'No tracks found for this user', 
        message: 'Please play more music on Spotify or save some tracks to your library to get personalized recommendations' 
      });
    }
    
    // Extract track IDs from the combined tracks
    const trackIds = combinedTracks.map(track => track.id);
    
    // Get mood filters using the function from utils
    const moodFilters = getMoodFilterRanges(moods);
    
    // Track the source of tracks used for recommendations
    const trackSource = mediumTermTracks && shortTermTracks && 
                        combinedTracks.length > 0 && 
                        (mediumTermTracks.length > 0 || shortTermTracks.length > 0) ? 'top' : 'saved';
    
    console.log(`Sending request to Flask microservice with ${trackIds.length} ${trackSource} tracks and mood filters:`, moodFilters);
    
    // Call Flask microservice with correct URL
    const flaskResponse = await axios.post('http://localhost:5173/recommend', {
      track_ids: trackIds,
      mood_filters: moodFilters
    });
    
    // Get set_1 from the response (content-based filtered tracks)
    const set_1 = flaskResponse.data.set_1;
    
    if (!set_1 || !Array.isArray(set_1)) {
      return res.status(500).json({ 
        error: 'Invalid response from recommendation service',
        response: flaskResponse.data
      });
    }
    
    console.log(`Received ${set_1.length} track recommendations from Flask microservice`);

    // Always create a playlist with the recommended tracks, even if there are 0 tracks
    let playlistData = null;
    
    try {
      // Default playlist name if not provided
      const finalPlaylistName = playlistName || `Moody: ${moods.join(', ')} Playlist`;
      
      // Create a new playlist
      const playlist = await spotifyService.createPlaylist(
        accessToken,
        spotifyUserId,
        finalPlaylistName,
        `Generated by Moody based on your listening habits and the following moods: ${moods.join(', ')}`
      );
      
      if (playlist && playlist.id) {
        // Add tracks to the playlist if there are any
        if (set_1.length > 0) {
          // Convert track IDs to Spotify URIs (spotify:track:ID format)
          const trackUris = set_1.map(trackId => `spotify:track:${trackId}`);
          
          // Spotify has a limit of 100 tracks per request, so we may need to make multiple requests
          const chunkSize = 100;
          for (let i = 0; i < trackUris.length; i += chunkSize) {
            const chunk = trackUris.slice(i, i + chunkSize);
            await spotifyService.addTracksToPlaylist(
              accessToken,
              playlist.id,
              chunk
            );
          }
        }
        
        // Get playlist image if available
        let image_url = undefined;
        try {
          const playlistDetails = await spotifyService.getPlaylist(accessToken, playlist.id);
          if (playlistDetails.images && playlistDetails.images.length > 0) {
            image_url = playlistDetails.images[0].url;
          }
        } catch (imageError) {
          console.error('Error fetching playlist image:', imageError);
          // Continue without the image
        }
        
        playlistData = {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          external_url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
          spotify_uri: `spotify:playlist:${playlist.id}`,
          tracks_added: set_1.length,
          image_url
        };
        
        // Save playlist to user's collection in Firestore, even with 0 tracks
        try {
          await firebaseService.saveUserPlaylist(spotifyUserId, playlistData, moods);
        } catch (saveError) {
          console.error('Error saving playlist to Firestore:', saveError);
          // Continue even if saving to Firestore fails
        }
        
        console.log(`Successfully created playlist "${playlist.name}" with ${set_1.length} tracks`);
      }
    } catch (playlistError: any) {
      console.error('Error creating/updating playlist:', playlistError);
      // If playlist creation fails, we'll still return the recommendations
    }
    
    // Return the recommendations to the client with playlist info
    res.json({ 
      success: true,
      recommendations: set_1,
      count: set_1.length,
      moods,
      filters: moodFilters,
      trackCounts: {
        medium_term: mediumTermTracks?.length || 0,
        short_term: shortTermTracks?.length || 0,
        saved: trackSource === 'saved' ? combinedTracks.length : 0,
        combined: combinedTracks.length
      },
      track_source: trackSource,
      playlist: playlistData
    });
    
  } catch (error: any) {
    console.error('Error generating playlist recommendations:', error);
    res.status(500).json({ 
      error: 'Failed to generate playlist recommendations', 
      message: error.message || 'Unknown error'
    });
  }
});

// Add new endpoint to get user's saved playlists
router.get('/saved-playlists', async (req: Request, res: Response) => {
  try {
    const spotifyUserId = req.session.spotifyUserId;
    
    // Check if user is authenticated
    if (!spotifyUserId) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    const playlists = await firebaseService.getUserPlaylists(spotifyUserId);
    
    res.json({
      success: true,
      playlists,
      count: playlists.length
    });
    
  } catch (error: any) {
    console.error('Error fetching saved playlists:', error);
    res.status(500).json({
      error: 'Failed to fetch saved playlists',
      message: error.message || 'Unknown error'
    });
  }
});

// Delete a saved playlist (from Firestore only, not from Spotify)
router.delete('/saved-playlists/:playlistId', async (req: Request, res: Response) => {
  try {
    const spotifyUserId = req.session.spotifyUserId;
    const playlistId = req.params.playlistId;
    
    // Check if user is authenticated
    if (!spotifyUserId) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }
    
    await firebaseService.deleteUserPlaylist(spotifyUserId, playlistId);
    
    res.json({
      success: true,
      message: 'Playlist deleted successfully'
    });
    
  } catch (error: any) {
    console.error('Error deleting saved playlist:', error);
    res.status(500).json({
      error: 'Failed to delete saved playlist',
      message: error.message || 'Unknown error'
    });
  }
});

// Create a playlist with the recommended tracks
router.post('/create-playlist', async (req: Request, res: Response) => {
  try {
    const accessToken = req.session.accessToken;
    const spotifyUserId = req.session.spotifyUserId;
    
    // Check if user is authenticated
    if (!accessToken || !spotifyUserId) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    
    const { name, description, trackIds } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }
    
    if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: 'No tracks provided for the playlist' });
    }
    
    // Create a new playlist
    const playlist = await spotifyService.createPlaylist(
      accessToken,
      spotifyUserId,
      name,
      description || 'Created with Moody'
    );
    
    if (!playlist || !playlist.id) {
      return res.status(500).json({ error: 'Failed to create playlist' });
    }
    
    // Convert track IDs to Spotify URIs (spotify:track:ID format)
    const trackUris = trackIds.map(id => `spotify:track:${id}`);
    
    // Spotify has a limit of 100 tracks per request, so we may need to make multiple requests
    const chunkSize = 100;
    for (let i = 0; i < trackUris.length; i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      await spotifyService.addTracksToPlaylist(
        accessToken,
        playlist.id,
        chunk
      );
    }
    
    // Return the created playlist info
    res.status(201).json({
      success: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        external_url: playlist.external_urls?.spotify,
        tracks_added: trackIds.length,
        owner: playlist.owner?.id
      }
    });
    
  } catch (error: any) {
    console.error('Error creating Spotify playlist:', error);
    res.status(500).json({ 
      error: 'Failed to create playlist', 
      message: error.message || 'Unknown error'
    });
  }
});

// Add the default export
export default router;
