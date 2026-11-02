// Release version. Bump with: node scripts/bump-version.mjs <new-version>
export const VERSION = '2.0.1';

export const SITE_URL = 'https://www.flashcardstudio.work/';

// Supabase project. The anon key is public by design; row level security
// on flashcard_sets limits every account to its own rows.
export const SUPABASE_URL = 'https://tbydrjbqixrrowriuvjx.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRieWRyamJxaXhycm93cml1dmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODczMjUsImV4cCI6MjA3Nzk2MzMyNX0.HOOtdJw6viZ7OozHo3GvK2Q43o0ekMeW30QwUjUcBT0';
export const DECKS_TABLE = 'flashcard_sets';
