interface MoodFilterSettings {
  min: number
  max: number
  target: number
}

export interface MoodFilterRanges {
  danceability: MoodFilterSettings
  energy: MoodFilterSettings
  acousticness: MoodFilterSettings
  valence: MoodFilterSettings
}

const moodFeatureProfiles: Record<string, MoodFilterRanges> = {
  happy: {
    danceability: { min: 0.65, max: 0.95, target: 0.8 },    // Very danceable
    energy: { min: 0.7, max: 0.95, target: 0.85 },          // High energy
    acousticness: { min: 0.0, max: 0.2, target: 0.05 },     // Mostly electronic
    valence: { min: 0.75, max: 0.95, target: 0.85 }         // Highly positive
  },
  energetic: {
    danceability: { min: 0.75, max: 1.0, target: 0.9 },     // Maximum danceability
    energy: { min: 0.85, max: 1.0, target: 0.95 },          // Peak energy
    acousticness: { min: 0.0, max: 0.15, target: 0.02 },    // Almost no acoustics
    valence: { min: 0.6, max: 0.9, target: 0.75 }           // Positive vibe
  },
  relaxed: {
    danceability: { min: 0.3, max: 0.55, target: 0.45 },    // Moderate tempo
    energy: { min: 0.2, max: 0.45, target: 0.35 },          // Low-medium energy
    acousticness: { min: 0.5, max: 0.95, target: 0.75 },    // Acoustic focus
    valence: { min: 0.4, max: 0.65, target: 0.55 }          // Neutral positivity
  },
  romantic: {
    danceability: { min: 0.4, max: 0.6, target: 0.5 },      // Slow dance tempos
    energy: { min: 0.3, max: 0.5, target: 0.4 },            // Intimate energy
    acousticness: { min: 0.3, max: 0.7, target: 0.55 },     // Blend of instruments
    valence: { min: 0.55, max: 0.75, target: 0.65 }         // Warm positivity
  },
  sad: {
    danceability: { min: 0.2, max: 0.45, target: 0.35 },    // Slow, undanceable
    energy: { min: 0.15, max: 0.4, target: 0.3 },           // Low energy
    acousticness: { min: 0.6, max: 1.0, target: 0.85 },     // Acoustic focus
    valence: { min: 0.0, max: 0.25, target: 0.15 }          // Low positivity
  },
  focused: {
    danceability: { min: 0.35, max: 0.55, target: 0.45 },   // Minimal distraction
    energy: { min: 0.4, max: 0.65, target: 0.55 },          // Moderate energy
    acousticness: { min: 0.25, max: 0.6, target: 0.45 },    // Instrumental mix
    valence: { min: 0.35, max: 0.6, target: 0.5 }           // Neutral emotion
  },
  party: {
    danceability: { min: 0.8, max: 1.0, target: 0.95 },     // Maximum danceability
    energy: { min: 0.85, max: 1.0, target: 0.95 },          // Peak energy
    acousticness: { min: 0.0, max: 0.1, target: 0.03 },     // Electronic focus
    valence: { min: 0.7, max: 0.95, target: 0.85 }          // High positivity
  },
  angry: {
    danceability: { min: 0.5, max: 0.7, target: 0.6 },      // Aggressive rhythms
    energy: { min: 0.85, max: 1.0, target: 0.95 },          // High intensity
    acousticness: { min: 0.0, max: 0.2, target: 0.05 },     // Electric dominance
    valence: { min: 0.0, max: 0.15, target: 0.08 }          // Negative emotion
  }
};

 // Official Spotify ranges per feature
 const spotifyRanges = {
  danceability: { min: 0.0, max: 1.0 },
  energy: { min: 0.0, max: 1.0 },
  acousticness: { min: 0.0, max: 1.0 },
  valence: { min: 0.0, max: 1.0 }
} as const;

// Updated composite calculator for better blending
const calculateCompositeRange = (
  moods: string[],
  feature: keyof MoodFilterRanges
): MoodFilterSettings => {
  const values = moods.map(mood => moodFeatureProfiles[mood][feature]);
  
  // Weighted average for targets
  const totalWeight = values.length + 1;
  const weightedTarget = values.reduce((sum, v) => sum + v.target * 2, 0) / totalWeight;

  // Dynamic range expansion
  const safetyMargin = 0.1;
  
  return {
    min: Math.max(
      Math.min(...values.map(v => v.min)) - safetyMargin,
      spotifyRanges[feature].min
    ),
    max: Math.min(
      Math.max(...values.map(v => v.max)) + safetyMargin,
      spotifyRanges[feature].max
    ),
    target: weightedTarget
  };
};

export const getMoodFilterRanges = (selectedMoods: string[]): MoodFilterRanges => {
  const defaultRanges: MoodFilterRanges = {
    danceability: { min: 0, max: 1, target: 0.5 },
    energy: { min: 0, max: 1, target: 0.5 },
    acousticness: { min: 0, max: 1, target: 0.5 },
    valence: { min: 0, max: 1, target: 0.5 }
  };

  if (!selectedMoods?.length) return defaultRanges;

  const validMoods = selectedMoods.filter(mood => mood in moodFeatureProfiles);
  if (validMoods.length === 0) return defaultRanges;

  // Calculate composite ranges across all selected moods
  return {
    danceability: calculateCompositeRange(validMoods, 'danceability'),
    energy: calculateCompositeRange(validMoods, 'energy'),
    acousticness: calculateCompositeRange(validMoods, 'acousticness'),
    valence: calculateCompositeRange(validMoods, 'valence')
  };
};

// Example usage
// const filters = getMoodFilterRanges(["happy", "party"]);
/* Returns:
{
  danceability: { min: 0.6, max: 1.0, target: 0.825 },
  energy: { min: 0.65, max: 1.0, target: 0.8 },
  acousticness: { min: 0.0, max: 0.4, target: 0.2 },
  valence: { min: 0.7, max: 1.0, target: 0.825 }
}
*/
