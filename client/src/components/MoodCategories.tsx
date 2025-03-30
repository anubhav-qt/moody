import React from 'react';
import '../styles/MoodCategories.css';

interface Mood {
  id: string;
  label: string;
  emoji: string;
}

interface MoodCategoriesProps {
  onMoodSelect: (mood: string) => void;
  selectedMoods: string[];
}

const MoodCategories: React.FC<MoodCategoriesProps> = ({ onMoodSelect, selectedMoods }) => {
  const moods: Mood[] = [
    { id: 'happy', label: 'Happy', emoji: '😊' },
    { id: 'energetic', label: 'Energetic', emoji: '⚡' },
    { id: 'relaxed', label: 'Relaxed', emoji: '😌' },
    { id: 'romantic', label: 'Romantic', emoji: '❤️' },
    { id: 'sad', label: 'Sad', emoji: '🥺' },
    { id: 'focused', label: 'Focused', emoji: '🧠' },
    { id: 'party', label: 'Party', emoji: '🎉' }, 
    { id: 'angry', label: 'Angry', emoji: '😡' }
  ];

  return (
    <div className="mood-container">
      <h2>How are you feeling today?</h2>
      <p className="mood-subtitle">Select one or more moods</p>
      
      <div className="moods-grid">
        {moods.map(mood => (
          <button
            key={mood.id}
            className={`mood-item ${selectedMoods.includes(mood.id) ? 'selected' : ''}`}
            onClick={() => onMoodSelect(mood.id)}
          >
            <span className="mood-emoji">{mood.emoji}</span>
            <span className="mood-label">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MoodCategories;
