/**
 * Styling configurations for different moods
 * Maintains soft gradients in the style of the app's default aesthetic
 */

export interface MoodStyle {
  gradient: string;
  textColor: string;
  buttonGradient: string;
  boxShadowColor: string;
}

// Default style matching the current app design
export const defaultStyle: MoodStyle = {
  gradient: 'linear-gradient(to bottom, #ffe8ef, #ffecd2)',
  textColor: '#333333',
  buttonGradient: 'linear-gradient(to right, #ff758c, #ff7eb3)',
  boxShadowColor: 'rgba(255, 105, 180, 0.15)'
};

// Mood-specific styles that stay within the aesthetic of the app
export const moodStyles: Record<string, MoodStyle> = {
  happy: {
    gradient: 'linear-gradient(to bottom, #ffecd2, #fcb69f)', // Warm peach gradient
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #fcb69f, #ffecd2)',
    boxShadowColor: 'rgba(252, 182, 159, 0.2)'
  },
  energetic: {
    gradient: 'linear-gradient(to bottom, #ff9a9e, #fad0c4)', // Energetic pink-peach
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #ff9a9e, #fad0c4)',
    boxShadowColor: 'rgba(255, 154, 158, 0.2)'
  },
  relaxed: {
    gradient: 'linear-gradient(to bottom, #e0c3fc, #8ec5fc)', // Soft lavender to blue
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #8ec5fc, #e0c3fc)',
    boxShadowColor: 'rgba(142, 197, 252, 0.2)'
  },
  romantic: {
    gradient: 'linear-gradient(to bottom, #ffdde1, #ee9ca7)', // Romantic pink
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #ee9ca7, #ffdde1)',
    boxShadowColor: 'rgba(238, 156, 167, 0.2)'
  },
  sad: {
    gradient: 'linear-gradient(to bottom, #a6c0fe, #f68084)', // Blue to soft red
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #f68084, #a6c0fe)',
    boxShadowColor: 'rgba(166, 192, 254, 0.2)'
  },
  focused: {
    gradient: 'linear-gradient(to bottom, #c2e9fb, #a1c4fd)', // Light blue gradient
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #a1c4fd, #c2e9fb)',
    boxShadowColor: 'rgba(161, 196, 253, 0.2)'
  },
  party: {
    gradient: 'linear-gradient(to bottom, #fccb90, #d57eeb)', // Orange to purple
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #d57eeb, #fccb90)',
    boxShadowColor: 'rgba(213, 126, 235, 0.2)'
  },
  angry: {
    gradient: 'linear-gradient(to bottom, #ff9a9e, #ff6a88)', // Red gradient
    textColor: '#333333',
    buttonGradient: 'linear-gradient(to right, #ff6a88, #ff9a9e)',
    boxShadowColor: 'rgba(255, 106, 136, 0.2)'
  }
};

/**
 * Get a combined style when multiple moods are selected
 */
export const getCombinedMoodStyle = (selectedMoods: string[]): MoodStyle => {
  if (!selectedMoods || selectedMoods.length === 0) {
    return defaultStyle;
  }

  if (selectedMoods.length === 1) {
    return moodStyles[selectedMoods[0]] || defaultStyle;
  }

  // For multiple moods, create a blended style
  const validMoods = selectedMoods.filter(mood => moodStyles[mood]);
  if (validMoods.length === 0) return defaultStyle;

  // Get the first mood as the base style for text and button
  const primaryStyle = moodStyles[validMoods[0]];
  
  // Extract primary color from each mood's gradient for more diversity
  const gradientColors: string[] = [];
  
  // Get one color from each mood's gradient to ensure all moods are represented
  for (const mood of validMoods) {
    const style = moodStyles[mood];
    const colors = style.gradient.match(/#[a-fA-F0-9]{6}/g) || [];
    if (colors.length > 0) {
      // For each mood, add one color to our palette (alternating between first and second color)
      const colorIndex = gradientColors.length % 2;
      gradientColors.push(colors[colorIndex >= colors.length ? 0 : colorIndex]);
    }
  }
  
  // If we somehow didn't get any valid colors, use default
  if (gradientColors.length === 0) {
    gradientColors.push('#ffe8ef', '#ffecd2');
  }
  
  // Create a multi-point gradient that represents all moods
  let gradientString = 'linear-gradient(to bottom';
  for (let i = 0; i < gradientColors.length; i++) {
    const percentage = Math.round((i / (gradientColors.length - 1)) * 100);
    gradientString += `, ${gradientColors[i]} ${percentage}%`;
  }
  gradientString += ')';

  // Create a button gradient using the first and last colors
  const buttonGradient = `linear-gradient(to right, ${gradientColors[0]}, ${gradientColors[gradientColors.length - 1]})`;

  return {
    gradient: gradientString,
    textColor: primaryStyle.textColor,
    buttonGradient: buttonGradient,
    boxShadowColor: primaryStyle.boxShadowColor
  };
};