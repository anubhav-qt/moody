import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MoodCategories from './components/MoodCategories';
import SpotifyLogin from './components/SpotifyLogin';
import GenerateButton from './components/GenerateButton';
import SavedPlaylists from './components/SavedPlaylists';
import { getMoodFilterRanges } from './utils/moodToFeatures';
import { getCombinedMoodStyle, defaultStyle } from './utils/moodStyles';
import './styles/App.css';

// Interface for playlist data
interface PlaylistData {
  id: string;
  name: string;
  external_url: string;
  spotify_uri: string;
  tracks_added: number;
  image_url?: string;
}

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [showPlaylistOptions, setShowPlaylistOptions] = useState<boolean>(false);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [copySuccess, setCopySuccess] = useState<string>('');
  const [view, setView] = useState<'moods' | 'playlist' | 'saved'>('moods');

  // Get dynamic style based on selected moods
  const currentStyle = selectedMoods.length > 0 
    ? getCombinedMoodStyle(selectedMoods) 
    : defaultStyle;

  // Check if user is already logged in on component mount
  useEffect(() => {
    const checkLoginStatus = async (): Promise<void> => {
      try {
        const response = await fetch('/api/spotify/user-token');
        const data = await response.json();
        
        // If we get a valid access token, user is logged in
        if (data.access_token) {
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error('Error checking login status:', error);
      }
    };

    checkLoginStatus();
  }, []);

  // Reset copy success message after 2 seconds
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => {
        setCopySuccess('');
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  const handleMoodSelect = (mood: string): void => {
    if (selectedMoods.includes(mood)) {
      setSelectedMoods(selectedMoods.filter(m => m !== mood));
    } else {
      setSelectedMoods([...selectedMoods, mood]);
    }
  };

  const handleGeneratePlaylist = async (): Promise<void> => {
    if (selectedMoods.length === 0) {
      alert('Please select at least one mood category');
      return;
    }

    setIsGenerating(true);
    
    try {
      // Call the backend API endpoint that connects to the Flask microservice
      const response = await fetch('/api/spotify/generate-playlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moods: selectedMoods
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate playlist');
      }
      
      const data = await response.json();
      
      if (!data.success || !data.recommendations) {
        throw new Error('Invalid response from server');
      }
      
      console.log('Playlist generated successfully!', data);
      
      // Store the recommendations
      setRecommendations(data.recommendations);
      
      // Store the playlist data
      if (data.playlist) {
        setPlaylist(data.playlist);
      }
      
      // Show playlist options
      setShowPlaylistOptions(true);
      setView('playlist');
      
    } catch (error) {
      console.error('Error generating playlist:', error);
      alert(`Failed to generate playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenInSpotify = (url?: string) => {
    const playlistUrl = url || (playlist && playlist.external_url);
    
    if (playlistUrl) {
      // Open the Spotify playlist in a new tab
      window.open(playlistUrl, '_blank');
    } else if (playlist && playlist.spotify_uri) {
      // If only URI is available, try to open with Spotify URI scheme
      window.location.href = playlist.spotify_uri;
    } else {
      alert('No Spotify link available for this playlist');
    }
  };

  const handleCopyLink = () => {
    if (playlist && playlist.external_url) {
      // Use the Clipboard API to copy the link
      navigator.clipboard.writeText(playlist.external_url)
        .then(() => {
          setCopySuccess('Link copied!');
        })
        .catch((err) => {
          console.error('Failed to copy link:', err);
          alert('Failed to copy link to clipboard');
        });
    } else {
      alert('No link available to copy');
    }
  };

  const handleNavigate = (view: 'moods' | 'playlist' | 'saved') => {
    if (view === 'moods') {
      setShowPlaylistOptions(false);
      setPlaylist(null);
      setRecommendations([]);
    }
    setView(view);
  };

  const renderView = () => {
    if (view === 'playlist' && showPlaylistOptions) {
      return (
        <div className="playlist-view">
          <h2 style={{ color: currentStyle.textColor, transition: 'color 0.5s ease' }}>
            Your {selectedMoods.join(' & ')} Playlist is Ready!
          </h2>
          
          <p className="playlist-description" style={{ color: currentStyle.textColor }}>
            We've created a personalized playlist based on your mood selection.
            {playlist && ` "${playlist.name}" contains ${playlist.tracks_added} tracks.`}
          </p>
          
          <div className="playlist-action-buttons">
            <button 
              className="spotify-button"
              onClick={() => handleOpenInSpotify()}
              disabled={!playlist || (!playlist.external_url && !playlist.spotify_uri)}
              style={{ 
                background: currentStyle.buttonGradient,
                boxShadow: `0 5px 15px ${currentStyle.boxShadowColor}`,
                opacity: (!playlist || (!playlist.external_url && !playlist.spotify_uri)) ? 0.7 : 1
              }}
            >
              <div className="button-content">
                <span className="button-icon">🎧</span>
                <span className="button-text">Open in Spotify</span>
              </div>
            </button>
            
            <button 
              className="copy-button"
              onClick={handleCopyLink}
              disabled={!playlist || !playlist.external_url}
              style={{ 
                background: currentStyle.buttonGradient,
                boxShadow: `0 5px 15px ${currentStyle.boxShadowColor}`,
                opacity: (!playlist || !playlist.external_url) ? 0.7 : 1
              }}
            >
              <div className="button-content">
                <span className="button-icon">{copySuccess ? '✅' : '📋'}</span>
                <span className="button-text">{copySuccess || 'Copy Link'}</span>
              </div>
            </button>
          </div>
          
          <div className="navigation-buttons">
            <button
              className="nav-button"
              onClick={() => handleNavigate('moods')}
              style={{ 
                color: currentStyle.textColor,
                borderColor: currentStyle.textColor
              }}
            >
              Generate Another Playlist
            </button>
            {isLoggedIn && (
              <button
                className="nav-button"
                onClick={() => handleNavigate('saved')}
                style={{ 
                  color: currentStyle.textColor,
                  borderColor: currentStyle.textColor
                }}
              >
                View Your Playlists
              </button>
            )}
          </div>
        </div>
      );
    } else if (view === 'saved' && isLoggedIn) {
      return <SavedPlaylists handleOpenPlaylist={handleOpenInSpotify} textColor={currentStyle.textColor} />;
    } else {
      // Default to mood selection view
      return (
        <>
          <MoodCategories 
            onMoodSelect={handleMoodSelect} 
            selectedMoods={selectedMoods}
          />
          
          <div className="actions">
            {!isLoggedIn && <SpotifyLogin />}
            <GenerateButton 
              onClick={handleGeneratePlaylist} 
              disabled={!isLoggedIn || selectedMoods.length === 0 || isGenerating} 
              isLoading={isGenerating}
            />
          </div>
          
          {isLoggedIn && (
            <div className="view-playlists-container">
              <button 
                className="view-playlists-button" 
                onClick={() => handleNavigate('saved')}
                style={{
                  color: currentStyle.textColor,
                  borderColor: currentStyle.textColor
                }}
              >
                View Your Saved Playlists
              </button>
            </div>
          )}
        </>
      );
    }
  };

  return (
    <div 
      className="app" 
      style={{ 
        background: currentStyle.gradient,
        transition: 'background 0.5s ease'
      }}
    >
      <div className="container" style={{
        boxShadow: `0 10px 30px ${currentStyle.boxShadowColor}`,
        transition: 'box-shadow 0.5s ease'
      }}>
        <Header textColor={currentStyle.textColor} />
        
        {view === 'saved' && isLoggedIn && (
          <button 
            className="back-to-moods-button"
            onClick={() => handleNavigate('moods')}
            style={{ 
              color: currentStyle.textColor,
              borderColor: currentStyle.textColor
            }}
          >
            Back to Mood Selection
          </button>
        )}
        
        {renderView()}
      </div>
    </div>
  );
};

export default App;
