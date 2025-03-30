import React from 'react';
import '../styles/Header.css';

interface HeaderProps {
  textColor?: string;
}

const Header: React.FC<HeaderProps> = ({ textColor = '#333333' }) => {
  return (
    <header className="header">
      <h1 className="title" style={{ color: textColor, transition: 'color 0.5s ease' }}>
        Moody
      </h1>
      <p className="subtitle" style={{ color: textColor, transition: 'color 0.5s ease' }}>
        Create playlists based on your mood
      </p>
    </header>
  );
};

export default Header;
