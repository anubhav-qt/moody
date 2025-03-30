import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MoodCategories from './components/MoodCategories';
import SpotifyLogin from './components/SpotifyLogin';
import GenerateButton from './components/GenerateButton';
import { getMoodFilterRanges } from './utils/moodToFeatures';
import { getCombinedMoodStyle, defaultStyle } from './utils/moodStyles';
import './styles/App.css';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [showPlaylistOptions, setShowPlaylistOptions] = useState<boolean>(false);

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
      
      // Show playlist options instead of mood categories
      setShowPlaylistOptions(true);
      
    } catch (error) {
      console.error('Error generating playlist:', error);
      alert(`Failed to generate playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenInSpotify = () => {
    // Placeholder - will implement actual Spotify link logic later
    alert('Opening playlist in Spotify! (This will be implemented later)');
  };

  const handleCopyLink = () => {
    // Placeholder - will implement actual link copying logic later
    alert('Playlist link copied to clipboard! (This will be implemented later)');
  };

  const handleBackToMoods = () => {
    setShowPlaylistOptions(false);
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
        
        {!showPlaylistOptions ? (
          // Mood selection view
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
          </>
        ) : (
          // Playlist view - replace mood categories with playlist actions
          <div className="playlist-view">
            <h2 style={{ color: currentStyle.textColor, transition: 'color 0.5s ease' }}>
              Your {selectedMoods.join(' & ')} Playlist is Ready!
            </h2>
            
            <p className="playlist-description" style={{ color: currentStyle.textColor }}>
              We've created a personalized playlist based on your mood selection.
            </p>
            
            <div className="playlist-action-buttons">
              <button 
                className="spotify-button"
                onClick={handleOpenInSpotify}
                style={{ 
                  background: currentStyle.buttonGradient,
                  boxShadow: `0 5px 15px ${currentStyle.boxShadowColor}`
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
                style={{ 
                  background: currentStyle.buttonGradient,
                  boxShadow: `0 5px 15px ${currentStyle.boxShadowColor}`
                }}
              >
                <div className="button-content">
                  <span className="button-icon">📋</span>
                  <span className="button-text">Copy Link</span>
                </div>
              </button>
            </div>
            
            <button 
              className="reset-button"
              onClick={handleBackToMoods}
              style={{ 
                color: currentStyle.textColor,
                borderColor: currentStyle.textColor
              }}
            >
              Generate Another Playlist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
