import React from 'react';
import '../styles/Header.css';

const Header: React.FC = () => {
  return (
    <header className="header">
      <h1 className="title">Moody</h1>
      <p className="subtitle">Create playlists based on your mood</p>
    </header>
  );
};

export default Header;
