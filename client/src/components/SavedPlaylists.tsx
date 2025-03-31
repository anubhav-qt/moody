import React, { useState, useEffect } from 'react';
import '../styles/SavedPlaylists.css';

interface Playlist {
  id: string;
  name: string;
  description?: string;
  external_url: string;
  spotify_uri: string;
  tracks_added: number;
  moods: string[];
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
  image_url?: string;
}

interface SavedPlaylistsProps {
  handleOpenPlaylist: (url: string) => void;
  textColor: string;
}

const SavedPlaylists: React.FC<SavedPlaylistsProps> = ({ handleOpenPlaylist, textColor }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchSavedPlaylists = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/spotify/saved-playlists');
        
        if (!response.ok) {
          throw new Error('Failed to fetch playlists');
        }
        
        const data = await response.json();
        if (data.success && data.playlists) {
          setPlaylists(data.playlists);
        }
      } catch (err) {
        console.error('Error fetching saved playlists:', err);
        setError('Failed to load your saved playlists');
      } finally {
        setLoading(false);
      }
    };
    
    fetchSavedPlaylists();
  }, []);
  
  const formatDate = (timestamp: { seconds: number }) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString();
  };
  
  const deletePlaylist = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (window.confirm('Remove this playlist from your saved playlists?')) {
      try {
        const response = await fetch(`/api/spotify/saved-playlists/${id}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setPlaylists(playlists.filter(playlist => playlist.id !== id));
        } else {
          throw new Error('Failed to delete playlist');
        }
      } catch (err) {
        console.error('Error deleting playlist:', err);
        setError('Failed to delete playlist');
      }
    }
  };

  if (loading) {
    return <div className="saved-playlists-loading">Loading your playlists...</div>;
  }

  if (error) {
    return <div className="saved-playlists-error">{error}</div>;
  }

  if (playlists.length === 0) {
    return (
      <div className="no-saved-playlists" style={{ color: textColor }}>
        <h3>No saved playlists yet</h3>
        <p>Generate a playlist to save it here!</p>
      </div>
    );
  }

  return (
    <div className="saved-playlists-container">
      <h2 style={{ color: textColor }}>Your Saved Playlists</h2>
      <div className="playlist-grid">
        {playlists.map((playlist) => (
          <div 
            key={playlist.id} 
            className="playlist-card"
            onClick={() => handleOpenPlaylist(playlist.external_url)}
          >
            <div className="playlist-image-container">
              {playlist.image_url ? (
                <img 
                  src={playlist.image_url} 
                  alt={playlist.name} 
                  className="playlist-image"
                />
              ) : (
                <div className="playlist-image-placeholder">
                  <span role="img" aria-label="music">🎵</span>
                </div>
              )}
            </div>
            <div className="playlist-info">
              <h3 className="playlist-name">{playlist.name}</h3>
              <div className="playlist-moods">
                {playlist.moods.map((mood, index) => (
                  <span key={index} className="mood-tag">{mood}</span>
                ))}
              </div>
              <p className="playlist-tracks">{playlist.tracks_added} tracks</p>
              <p className="playlist-date">Created: {formatDate(playlist.createdAt)}</p>
              <div className="playlist-actions">
                <button 
                  className="playlist-action-btn open-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPlaylist(playlist.external_url);
                  }}
                >
                  Open in Spotify
                </button>
                <button 
                  className="playlist-action-btn delete-btn"
                  onClick={(e) => deletePlaylist(playlist.id, e)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SavedPlaylists;