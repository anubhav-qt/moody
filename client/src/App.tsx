import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MoodCategories from './components/MoodCategories';
import SpotifyLogin from './components/SpotifyLogin';
import GenerateButton from './components/GenerateButton';
import './styles/App.css';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);

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

  const handleGeneratePlaylist = (): void => {
    if (selectedMoods.length === 0) {
      alert('Please select at least one mood category');
      return;
    }

    // TODO: Implement playlist generation logic
    console.log('Generating playlist for moods:', selectedMoods);
  };

  return (
    <div className="app">
      <div className="container">
        <Header />
        <MoodCategories onMoodSelect={handleMoodSelect} selectedMoods={selectedMoods} />
        
        <div className="actions">
          {!isLoggedIn && <SpotifyLogin />}
          <GenerateButton 
            onClick={handleGeneratePlaylist} 
            disabled={!isLoggedIn || selectedMoods.length === 0} 
          />
        </div>
      </div>
    </div>
  );
}

export default App;
