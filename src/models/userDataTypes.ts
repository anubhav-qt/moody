export interface Artist {
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  name: string;
  uri: string;
}

// Extended artist with additional fields from followed artists endpoint
export interface FollowedArtist extends Artist {
  genres?: string[];
  popularity?: number;
  followers?: {
    total: number;
  };
  // Removed images field to reduce data size
}

export interface Album {
  album_type: string;
  artists: Artist[];
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  name: string;
  release_date: string;
  uri: string;
}

export interface Track {
  album: Album;
  artists: Artist[];
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_ids: {
    isrc: string;
  };
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  is_local: boolean;
  is_playable: boolean;
  name: string;
  popularity: number;
  preview_url: string | null;
  track_number: number;
  uri: string;
}

export interface UserTopItems {
  userId: string;
  topArtists: FollowedArtist[];
  topTracks: Track[];
  timeRange: 'long_term' | 'medium_term' | 'short_term';
  lastUpdated: Date;
}
