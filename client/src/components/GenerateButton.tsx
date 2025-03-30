import React from 'react';
import '../styles/GenerateButton.css';

interface GenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading?: boolean;
}

const GenerateButton: React.FC<GenerateButtonProps> = ({ onClick, disabled, isLoading = false }) => {
  return (
    <button 
      className={`generate-button ${isLoading ? 'loading' : ''}`} 
      onClick={onClick}
      disabled={disabled}
    >
      {isLoading ? 'Generating...' : 'Generate Playlist'}
    </button>
  );
};

export default GenerateButton;
