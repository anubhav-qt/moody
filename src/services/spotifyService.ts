import axios from 'axios';
import dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyAuthTokenResponse extends SpotifyTokenResponse {
  refresh_token: string;
  scope: string;
}

interface SpotifyUserProfile {
  id: string;
  display_name: string;
  email?: string;
  images?: Array<{url: string}>;
  // other profile fields...
}

class SpotifyService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string = 'http://localhost:5000/api/spotify/callback';
  private tokenUrl: string = 'https://accounts.spotify.com/api/token';
  private authorizeUrl: string = 'https://accounts.spotify.com/authorize';
  
  constructor() {
    this.clientId = process.env.CLIENT_ID || '';
    this.clientSecret = process.env.CLIENT_SECRET || '';
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify API credentials missing in .env file');
    }
  }

  /**
   * Generate a random string for use as a PKCE code verifier
   * @param length Length of the random string
   * @returns Random string
   */
  generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.randomBytes(length);
    
    return Array.from(values)
      .map(x => possible[x % possible.length])
      .join('');
  }

  /**
   * Generate a code challenge from a code verifier using SHA-256 + base64url encoding
   * @param codeVerifier The code verifier
   * @returns Code challenge for PKCE
   */
  async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    return this.base64URLEncode(hash);
  }

  /**
   * Base64URL encoding function
   * @param buffer Data to encode
   * @returns Base64URL encoded string
   */
  private base64URLEncode(buffer: Buffer): string {
    return buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Get the authorization URL for the Spotify OAuth flow
   * @param codeChallenge PKCE code challenge
   * @returns Authorization URL
   */
  getAuthorizationUrl(codeChallenge: string): string {
    const scope = [
      'user-read-private',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-follow-read',
      'user-top-read',
      'user-read-recently-played',
      'user-library-read'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      scope: scope
    });

    return `${this.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for an access token using PKCE
   * @param code Authorization code
   * @param codeVerifier PKCE code verifier
   * @returns Promise resolving to the access token response
   */
  async getAccessTokenFromCode(code: string, codeVerifier: string): Promise<SpotifyAuthTokenResponse> {
    try {
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', this.redirectUri);
      params.append('code_verifier', codeVerifier);

      const response = await axios.post<SpotifyAuthTokenResponse>(this.tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting access token from code:', error);
      throw error;
    }
  }

  /**
   * Refresh an access token using a refresh token
   * @param refreshToken The refresh token from a previous authorization
   * @returns Promise resolving to the new access token response
   */
  async refreshAccessToken(refreshToken: string): Promise<SpotifyAuthTokenResponse> {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', this.clientId);
      
      const response = await axios.post<SpotifyAuthTokenResponse>(this.tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw error;
    }
  }

  /**
   * Get the current user's Spotify profile
   * @param accessToken Valid access token
   * @returns User profile information
   */
  async getUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
    try {
      const response = await axios.get('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }

  /**
   * Get the current user's saved tracks
   * @param accessToken Valid access token
   * @param limit Maximum number of items to return (default: 20, max: 50, use -1 for all tracks)
   * @param offset The index of the first item to return (default: 0)
   * @param market An ISO 3166-1 alpha-2 country code (optional)
   * @returns Saved tracks response
   */
  async getUserSavedTracks(
    accessToken: string, 
    limit: number = 20, 
    offset: number = 0,
    market?: string
  ): Promise<any> {
    try {
      // Special case: fetch all tracks (-1)
      if (limit === -1) {
        return await this.getAllUserSavedTracks(accessToken, market);
      }
      
      const params = new URLSearchParams();
      
      // Add optional parameters
      if (limit) params.append('limit', limit.toString());
      if (offset) params.append('offset', offset.toString());
      if (market) params.append('market', market);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      const response = await axios.get(`https://api.spotify.com/v1/me/tracks${queryString}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching user saved tracks:', error);
      throw error;
    }
  }
  
  /**
   * Get all saved tracks for a user by making multiple API calls as needed
   * @param accessToken Valid access token
   * @param market An ISO 3166-1 alpha-2 country code (optional)
   * @returns All saved tracks consolidated into one response
   */
  private async getAllUserSavedTracks(accessToken: string, market?: string): Promise<any> {
    try {
      // Use maximum limit per request to minimize number of API calls
      const maxLimit = 50;
      let offset = 0;
      let allItems: any[] = [];
      let total = 0;
      let hasMore = true;
      
      // Make first request to get total count and first batch of items
      const params = new URLSearchParams();
      params.append('limit', maxLimit.toString());
      params.append('offset', '0');
      if (market) params.append('market', market);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      const initialResponse = await axios.get(`https://api.spotify.com/v1/me/tracks${queryString}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      // Extract data from first response
      const data = initialResponse.data;
      total = data.total;
      allItems = [...data.items];
      offset += maxLimit;
      
      // Continue making requests until we have all items
      while (offset < total) {
        // Update params for next request
        const nextParams = new URLSearchParams();
        nextParams.append('limit', maxLimit.toString());
        nextParams.append('offset', offset.toString());
        if (market) nextParams.append('market', market);
        
        const nextQueryString = nextParams.toString() ? `?${nextParams.toString()}` : '';
        
        const nextResponse = await axios.get(`https://api.spotify.com/v1/me/tracks${nextQueryString}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        // Add items to our collection
        allItems = [...allItems, ...nextResponse.data.items];
        offset += maxLimit;
      }
      
      // Return a response object in the same format as the Spotify API but with all items
      return {
        href: data.href,
        limit: allItems.length,
        next: null,
        offset: 0,
        previous: null,
        total: total,
        items: allItems
      };
    } catch (error) {
      console.error('Error fetching all user saved tracks:', error);
      throw error;
    }
  }

  /**
   * Get the current user's top items (artists or tracks)
   * @param accessToken Valid access token
   * @param type Type of entity to return ('artists' or 'tracks')
   * @param timeRange Over what time frame the affinities are computed
   * @param limit Maximum number of items to return (default: 20, max: 50, use -1 for all items)
   * @param offset The index of the first item to return (default: 0)
   * @returns User's top items response
   */
  async getUserTopItems(
    accessToken: string,
    type: 'artists' | 'tracks',
    timeRange: 'long_term' | 'medium_term' | 'short_term' = 'medium_term',
    limit: number = 20,
    offset: number = 0
  ): Promise<any> {
    try {
      // Special case: fetch all items (-1)
      if (limit === -1) {
        return await this.getAllUserTopItems(accessToken, type, timeRange);
      }
      
      const params = new URLSearchParams();
      
      // Add optional parameters
      params.append('time_range', timeRange);
      if (limit) params.append('limit', limit.toString());
      if (offset) params.append('offset', offset.toString());
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      const response = await axios.get(`https://api.spotify.com/v1/me/top/${type}${queryString}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error fetching user top ${type}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all top items for a user by making multiple API calls as needed
   * @param accessToken Valid access token
   * @param type Type of entity to return ('artists' or 'tracks')
   * @param timeRange Over what time frame the affinities are computed
   * @returns All top items consolidated into one response
   */
  private async getAllUserTopItems(
    accessToken: string,
    type: 'artists' | 'tracks',
    timeRange: 'long_term' | 'medium_term' | 'short_term' = 'medium_term'
  ): Promise<any> {
    try {
      // Use maximum limit per request to minimize number of API calls
      const maxLimit = 50;
      let offset = 0;
      let allItems: any[] = [];
      let total = 0;
      let continueLoading = true;
      // Make first request to get total count and first batch of items
      // Make first request to get total count and first batch of items
      const params = new URLSearchParams();
      params.append('limit', maxLimit.toString());
      params.append('offset', '0');
      params.append('time_range', timeRange);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      const initialResponse = await axios.get(`https://api.spotify.com/v1/me/top/${type}${queryString}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      // Extract data from first response
      const data = initialResponse.data;
      total = data.total;
      allItems = [...data.items];
      offset += maxLimit;
      
      console.log(`Retrieved first ${allItems.length} of ${total} top ${type} for ${timeRange}`);
      
      // Spotify has a limit of how many items it can return (usually around 50-100 total items)
      // Continue making requests until we have all items or hit Spotify's limit
      while (offset < total && offset < 200 && continueLoading) { // Cap at offset 200 to avoid 500 errors
        try {
          // Update params for next request
          const nextParams = new URLSearchParams();
          nextParams.append('limit', maxLimit.toString());
          nextParams.append('offset', offset.toString());
          nextParams.append('time_range', timeRange);
          
          const nextQueryString = nextParams.toString() ? `?${nextParams.toString()}` : '';
          
          console.log(`Fetching top ${type} with offset ${offset} for ${timeRange}`);
          
          const nextResponse = await axios.get(`https://api.spotify.com/v1/me/top/${type}${nextQueryString}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          // If we got an empty items array, stop fetching more
          if (!nextResponse.data.items || nextResponse.data.items.length === 0) {
            console.log(`No more ${type} returned at offset ${offset}, stopping pagination`);
            continueLoading = false;
            break;
          }
          
          // Add items to our collection
          allItems = [...allItems, ...nextResponse.data.items];
          offset += maxLimit;
          
          console.log(`Retrieved ${allItems.length} of ${total} top ${type} for ${timeRange}`);
        } catch (paginationError: any) {
          // Handle pagination error - log it and break out of the loop
          console.warn(`Error getting top ${type} at offset ${offset}: ${paginationError.message}`);
          console.warn(`This may be due to Spotify's pagination limits. Using ${allItems.length} items already collected.`);
          continueLoading = false;
        }
      }
      
      // Return a response object in the same format as the Spotify API but with all items successfully retrieved
      return {
        href: data.href,
        limit: allItems.length,
        next: null,
        offset: 0,
        previous: null,
        total: allItems.length, // Update total to match what we actually got
        items: allItems
      };
    } catch (error) {
      console.error(`Error fetching all user top ${type}:`, error);
      throw error;
    }
  }
}

export default new SpotifyService();