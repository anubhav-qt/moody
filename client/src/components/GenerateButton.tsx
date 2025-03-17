import React from 'react';
import '../styles/GenerateButton.css';

interface GenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
}

const GenerateButton: React.FC<GenerateButtonProps> = ({ onClick, disabled }) => {
  return (
    <button 
      className="generate-button" 
      onClick={onClick}
      disabled={disabled}
    >
      Generate Playlist
    </button>
  );
};

export default GenerateButton;
