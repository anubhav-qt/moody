import React from 'react';
import { FaSpotify } from 'react-icons/fa';
import '../styles/SpotifyLogin.css';

const SpotifyLogin: React.FC = () => {
  const handleLogin = (): void => {
    window.location.href = 'http://localhost:5000/api/spotify/login';
  };

  return (
    <button className="spotify-login-button" onClick={handleLogin}>
      <FaSpotify className="spotify-logo" />
      Login with Spotify
    </button>
  );
};

export default SpotifyLogin;
