import React from 'react';
import '../styles/GenerateButton.css';

interface GenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading?: boolean;
  buttonGradient?: string;
  textColor?: string;
}

const GenerateButton: React.FC<GenerateButtonProps> = ({ 
  onClick, 
  disabled, 
  isLoading = false,
  buttonGradient,
  textColor = '#ffffff'
}) => {
  return (
    <button 
      className={`generate-button ${isLoading ? 'loading' : ''}`} 
      onClick={onClick}
      disabled={disabled}
      style={{
        background: buttonGradient,
        color: textColor,
        transition: 'background 0.5s ease, transform 0.3s ease'
      }}
    >
      {isLoading ? 'Generating...' : 'Generate Playlist'}
    </button>
  );
};

export default GenerateButton;
