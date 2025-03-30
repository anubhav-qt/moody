export interface MoodFilterRanges {
  danceability: { min: number; max: number; target: number };
  energy: { min: number; max: number; target: number };
  loudness: { min: number; max: number; target: number };
  acousticness: { min: number; max: number; target: number };
  liveness: { min: number; max: number; target: number };
  valence: { min: number; max: number; target: number };
}

const moodFeatureProfiles: Record<string, MoodFilterRanges> = {
  happy: {
    danceability: { min: 0.6, max: 0.9, target: 0.75 },
    energy: { min: 0.65, max: 0.85, target: 0.75 },
    loudness: { min: -10, max: -2, target: -6 },
    acousticness: { min: 0.1, max: 0.4, target: 0.25 },
    liveness: { min: 0.1, max: 0.3, target: 0.2 },
    valence: { min: 0.7, max: 1.0, target: 0.85 }
  },
  energetic: {
    danceability: { min: 0.7, max: 1.0, target: 0.85 },
    energy: { min: 0.8, max: 1.0, target: 0.9 },
    loudness: { min: -8, max: -2, target: -5 },
    acousticness: { min: 0.0, max: 0.2, target: 0.1 },
    liveness: { min: 0.2, max: 0.4, target: 0.3 },
    valence: { min: 0.6, max: 0.8, target: 0.7 }
  },
  relaxed: {
    danceability: { min: 0.2, max: 0.5, target: 0.35 },
    energy: { min: 0.1, max: 0.4, target: 0.25 },
    loudness: { min: -20, max: -8, target: -14 },
    acousticness: { min: 0.7, max: 0.9, target: 0.8 },
    liveness: { min: 0.0, max: 0.2, target: 0.1 },
    valence: { min: 0.4, max: 0.6, target: 0.5 }
  },
  romantic: {
    danceability: { min: 0.4, max: 0.6, target: 0.5 },
    energy: { min: 0.3, max: 0.5, target: 0.4 },
    loudness: { min: -12, max: -8, target: -10 },
    acousticness: { min: 0.5, max: 0.7, target: 0.6 },
    liveness: { min: 0.1, max: 0.2, target: 0.15 },
    valence: { min: 0.5, max: 0.6, target: 0.55 }
  },
  sad: {
    danceability: { min: 0.2, max: 0.5, target: 0.35 },
    energy: { min: 0.2, max: 0.4, target: 0.3 },
    loudness: { min: -15, max: -5, target: -10 },
    acousticness: { min: 0.6, max: 0.9, target: 0.75 },
    liveness: { min: 0.0, max: 0.2, target: 0.1 },
    valence: { min: 0.1, max: 0.3, target: 0.2 }
  },
  focused: {
    danceability: { min: 0.2, max: 0.4, target: 0.3 },
    energy: { min: 0.4, max: 0.6, target: 0.5 },
    loudness: { min: -15, max: -9, target: -12 },
    acousticness: { min: 0.3, max: 0.6, target: 0.45 },
    liveness: { min: 0.0, max: 0.1, target: 0.05 },
    valence: { min: 0.4, max: 0.5, target: 0.45 }
  },
  party: {
    danceability: { min: 0.8, max: 1.0, target: 0.9 },
    energy: { min: 0.8, max: 1.0, target: 0.85 },
    loudness: { min: -6, max: -2, target: -4 },
    acousticness: { min: 0.0, max: 0.3, target: 0.15 },
    liveness: { min: 0.2, max: 0.4, target: 0.3 },
    valence: { min: 0.7, max: 0.9, target: 0.8 }
  },
  angry: {
    danceability: { min: 0.5, max: 0.7, target: 0.6 },
    energy: { min: 0.8, max: 1.0, target: 0.9 },
    loudness: { min: -8, max: -2, target: -5 },
    acousticness: { min: 0.0, max: 0.3, target: 0.15 },
    liveness: { min: 0.2, max: 0.3, target: 0.25 },
    valence: { min: 0.1, max: 0.2, target: 0.15 }
  }
};

export const getMoodFilterRanges = (selectedMoods: string[]): MoodFilterRanges => {
  const defaultRanges: MoodFilterRanges = {
    danceability: { min: 0, max: 1, target: 0.5 },
    energy: { min: 0, max: 1, target: 0.5 },
    loudness: { min: -30, max: 0, target: -15 },
    acousticness: { min: 0, max: 1, target: 0.5 },
    liveness: { min: 0, max: 1, target: 0.5 },
    valence: { min: 0, max: 1, target: 0.5 }
  };

  if (!selectedMoods?.length) return defaultRanges;

  const validMoods = selectedMoods.filter(mood => mood in moodFeatureProfiles);
  if (validMoods.length === 0) return defaultRanges;

  // Calculate composite ranges across all selected moods
  return {
    danceability: calculateCompositeRange(validMoods, 'danceability'),
    energy: calculateCompositeRange(validMoods, 'energy'),
    loudness: calculateCompositeRange(validMoods, 'loudness'),
    acousticness: calculateCompositeRange(validMoods, 'acousticness'),
    liveness: calculateCompositeRange(validMoods, 'liveness'),
    valence: calculateCompositeRange(validMoods, 'valence')
  };
};

const calculateCompositeRange = (
  moods: string[],
  feature: keyof MoodFilterRanges
): { min: number; max: number; target: number } => {
  const values = moods.map(mood => moodFeatureProfiles[mood][feature]);
  
  return {
    min: Math.min(...values.map(v => v.min)),
    max: Math.max(...values.map(v => v.max)),
    target: values.reduce((sum, v) => sum + v.target, 0) / values.length
  };
};


// Example usage
// const filters = getMoodFilterRanges(["happy", "party"]);
/* Returns:
{
  danceability: { min: 0.6, max: 1.0, target: 0.825 },
  energy: { min: 0.65, max: 1.0, target: 0.8 },
  loudness: { min: -10, max: -2, target: -5 },
  acousticness: { min: 0.0, max: 0.4, target: 0.2 },
  liveness: { min: 0.1, max: 0.4, target: 0.25 },
  valence: { min: 0.7, max: 1.0, target: 0.825 }
}
*/
