// Run the exact same logic as api/storyboard.js, but as a Background Function (up to 15 minutes).
// NO changes to logic, styles, counts, or any hardcoded settings.

export { default } from './storyboard.js';

// Ensure long runtime window on Vercel Background Function (900 seconds = 15 minutes)
export const config = {
  maxDuration: 900
};
