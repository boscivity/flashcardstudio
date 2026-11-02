// Supabase auth wrapper with friendly error messages.
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from './config.js?v=2.0.0';

export const client = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'implicit' }
  })
  : null;

const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

/** The signed-in user saved on this device, without any network call (used when offline). */
export function cachedUser() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved?.user?.id ? saved.user : null;
  } catch { return null; }
}

export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);
}

export async function getSession(timeout = 4000) {
  if (!client) return null;
  const { data } = await withTimeout(client.auth.getSession(), timeout);
  return data?.session || null;
}

export function onAuthChange(fn) {
  if (!client) return () => {};
  // Supabase recommends not awaiting other auth calls inside this callback.
  const { data } = client.auth.onAuthStateChange((event, session) => setTimeout(() => fn(event, session), 0));
  return () => data.subscription.unsubscribe();
}

export function friendlyError(err) {
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();
  if (!client) return 'Accounts are unavailable because the sign-in service could not load. You can still study on this device.';
  if (!navigator.onLine) return 'You appear to be offline. Connect to the internet to sign in — studying on this device still works.';
  if (/failed to fetch|networkerror|load failed|timed out|fetch/.test(lower)) {
    return 'We could not reach the sync server. Please try again in a moment — you can keep studying on this device meanwhile.';
  }
  if (lower.includes('invalid login credentials')) return 'That email and password don’t match an account.';
  if (lower.includes('email not confirmed')) return 'Please confirm your email first — check your inbox (and spam folder) for the link.';
  if (lower.includes('already registered') || lower.includes('already exists')) return 'An account with this email already exists. Try logging in instead.';
  if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (lower.includes('password should be') || lower.includes('weak password')) return 'Please choose a stronger password (at least 8 characters).';
  if (lower.includes('same password') || lower.includes('different from the old')) return 'Your new password must be different from the current one.';
  return msg || 'Something went wrong. Please try again.';
}

async function call(promise) {
  let result;
  try {
    result = await withTimeout(promise, 15000);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
  if (result.error) throw new Error(friendlyError(result.error));
  return result.data;
}

function requireClient() {
  if (!client) throw new Error(friendlyError());
}

export async function signIn(email, password) {
  requireClient();
  return call(client.auth.signInWithPassword({ email, password }));
}

export async function signUp(email, password) {
  requireClient();
  const data = await call(client.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL } }));
  // Supabase returns a user with no identities when the email is already registered.
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('An account with this email already exists. Try logging in instead.');
  }
  return { session: data?.session || null, needsConfirmation: !data?.session };
}

export async function resendConfirmation(email) {
  requireClient();
  return call(client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: SITE_URL } }));
}

export async function sendPasswordReset(email) {
  requireClient();
  return call(client.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL }));
}

export async function updatePassword(password) {
  requireClient();
  return call(client.auth.updateUser({ password }));
}

export async function verifyPassword(email, password) {
  requireClient();
  return call(client.auth.signInWithPassword({ email, password }));
}

export async function signOut() {
  if (!client) return;
  try {
    await withTimeout(client.auth.signOut({ scope: 'local' }), 3000);
  } catch (err) {
    console.warn('Sign out did not reach the server', err);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

export const isValidEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
