// Page elements
const homePage = document.getElementById('homePage');
const loginPage = document.getElementById('loginPage');
const signupPage = document.getElementById('signupPage');
const appPage = document.getElementById('appPage');
const settingsPage = document.getElementById('settingsPage');

const themeToggleBtn = document.getElementById('themeToggle');
const setManagerSection = document.getElementById('setManager');
const setEditorSection = document.getElementById('setEditor');
const setEditorTitle = document.getElementById('setEditorTitle');
const setNameInput = document.getElementById('setNameInput');
const columnList = document.getElementById('columnList');
const newColumnInput = document.getElementById('newColumnInput');
const addColumnBtn = document.getElementById('addColumnButton');
const templateFront = document.getElementById('templateFront');
const templateBack = document.getElementById('templateBack');
const templateHint = document.getElementById('templateHint');
const cardsTableHead = document.getElementById('cardsTableHead');
const cardsTableBody = document.getElementById('cardsTableBody');
const addCardBtn = document.getElementById('addCardButton');
const saveSetBtn = document.getElementById('saveSetButton');
const cancelSetBtn = document.getElementById('cancelSetButton');
const createSetBtn = document.getElementById('createSetButton');
const importSetBtn = document.getElementById('importSetButton');
const importSetInput = document.getElementById('importSetInput');
const setsList = document.getElementById('setsList');
const downloadExampleBtn = document.getElementById('downloadExample');

const loginStatus = document.getElementById('loginStatus');
const signupStatus = document.getElementById('signupStatus');
const signUpForm = document.getElementById('signUpForm');
const signUpEmailInput = document.getElementById('signUpEmail');
const signUpPasswordInput = document.getElementById('signUpPassword');
const logInForm = document.getElementById('logInForm');
const logInEmailInput = document.getElementById('logInEmail');
const logInPasswordInput = document.getElementById('logInPassword');
const switchToSignUpBtn = document.getElementById('switchToSignUp');
const switchToLogInBtn = document.getElementById('switchToLogIn');

const topAccountStatus = document.getElementById('topAccountStatus');
const topSignUpBtn = document.getElementById('topSignUpButton');
const topLogInBtn = document.getElementById('topLogInButton');
const topDashboardBtn = document.getElementById('topDashboardButton');
const topLogoutBtn = document.getElementById('topLogoutButton');
const topSettingsBtn = document.getElementById('topSettingsButton');
const topNavGroup = document.getElementById('topNavGroup');
const topMenuToggle = document.getElementById('topMenuToggle');
const topMenuPanel = document.getElementById('topMenuPanel');
const heroGetStartedBtn = document.getElementById('heroGetStarted');
const brandLink = document.getElementById('brandLink');
const topBar = document.querySelector('.top-bar');

const mobileMenuQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 720px)') : null;

const studySection = document.getElementById('study');
const studySetTitle = document.getElementById('studySetTitle');
const backButton = document.getElementById('backButton');
const cardText = document.getElementById('cardText');
const cardColumns = document.getElementById('cardColumns');
const cardHint = document.getElementById('cardHint');
const showAnswerBtn = document.getElementById('showAnswer');
const knowBtn = document.getElementById('knowButton');
const dontKnowBtn = document.getElementById('dontKnowButton');
const flipBtn = document.getElementById('flipButton');
const progressLabel = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const restartBtn = document.getElementById('restartButton');
const returnBtn = document.getElementById('returnButton');
const confettiContainer = document.getElementById('confettiContainer');

const settingsSection = document.getElementById('settingsSection');
const settingsStatus = document.getElementById('settingsStatus');
const changePasswordForm = document.getElementById('changePasswordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');

const confettiColors = ['#3f87ff', '#7f5cff', '#22d3ee', '#facc15', '#f472b6', '#a855f7'];

const storageKey = 'flashcardStudioSets';

const SUPABASE_URL = 'https://tbydrjbqixrrowriuvjx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRieWRyamJxaXhycm93cml1dmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODczMjUsImV4cCI6MjA3Nzk2MzMyNX0.HOOtdJw6viZ7OozHo3GvK2Q43o0ekMeW30QwUjUcBT0';

const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

let sets = [];
let editorState = null;
let editorMode = 'create';

let activeSetId = null;
let activeTemplates = { front: '', back: '', hint: '' };
let originalDeck = [];
let deck = [];
let currentCard = null;
let currentCardIndex = -1;
let isShowingFront = true;

let sessionExpirationHandled = false;
let sessionRefreshPromise = null;

let currentSession = null;
let currentUser = null;
let legacySets = [];
let legacySetsPrompted = false;
let starterSetCreated = false;

function isMobileMenuActive() {
  return mobileMenuQuery?.matches ?? window.innerWidth <= 720;
}

function updateTopBarOffset() {
  if (!topBar) return;
  const height = Math.round(topBar.getBoundingClientRect().height);
  if (height > 0) {
    document.documentElement.style.setProperty('--topbar-offset', `${height}px`);
  }
}

function setTopMenuOpen(open, { immediate = false } = {}) {
  if (!topMenuToggle || !topMenuPanel) return;

  const mobileEnabled = isMobileMenuActive();
  if (!mobileEnabled) {
    topMenuToggle.setAttribute('aria-expanded', 'false');
    topMenuPanel.classList.remove('is-open');
    topMenuPanel.style.removeProperty('max-height');
    updateTopBarOffset();
    return;
  }

  const currentlyExpanded = topMenuToggle.getAttribute('aria-expanded') === 'true';
  if (open === currentlyExpanded && !immediate) {
    if (open) {
      topMenuPanel.style.maxHeight = `${topMenuPanel.scrollHeight}px`;
    }
    return;
  }

  topMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');

  if (open) {
    topMenuPanel.classList.add('is-open');
    if (immediate) {
      topMenuPanel.style.removeProperty('max-height');
      updateTopBarOffset();
      return;
    }
    topMenuPanel.style.maxHeight = '0px';
    requestAnimationFrame(() => {
      topMenuPanel.style.maxHeight = `${topMenuPanel.scrollHeight}px`;
    });
    const handleOpenTransitionEnd = event => {
      if (event.propertyName !== 'max-height') return;
      topMenuPanel.removeEventListener('transitionend', handleOpenTransitionEnd);
      if (topMenuToggle.getAttribute('aria-expanded') === 'true') {
        topMenuPanel.style.removeProperty('max-height');
        updateTopBarOffset();
      }
    };
    topMenuPanel.addEventListener('transitionend', handleOpenTransitionEnd);
  } else {
    if (immediate) {
      topMenuPanel.classList.remove('is-open');
      topMenuPanel.style.removeProperty('max-height');
      updateTopBarOffset();
      return;
    }
    const currentHeight = topMenuPanel.scrollHeight;
    topMenuPanel.style.maxHeight = `${currentHeight}px`;
    requestAnimationFrame(() => {
      topMenuPanel.style.maxHeight = '0px';
    });
    const handleCloseTransitionEnd = event => {
      if (event.propertyName !== 'max-height') return;
      topMenuPanel.removeEventListener('transitionend', handleCloseTransitionEnd);
      if (topMenuToggle.getAttribute('aria-expanded') !== 'true') {
        topMenuPanel.classList.remove('is-open');
        topMenuPanel.style.removeProperty('max-height');
        updateTopBarOffset();
      }
    };
    topMenuPanel.addEventListener('transitionend', handleCloseTransitionEnd);
  }
}

topMenuToggle?.addEventListener('click', () => {
  const isExpanded = topMenuToggle.getAttribute('aria-expanded') === 'true';
  setTopMenuOpen(!isExpanded);
});

const handleMobileMenuChange = () => {
  if (!isMobileMenuActive()) {
    setTopMenuOpen(false, { immediate: true });
  } else if (topMenuToggle?.getAttribute('aria-expanded') === 'true') {
    setTopMenuOpen(true, { immediate: true });
  }
  updateTopBarOffset();
};

if (mobileMenuQuery && typeof mobileMenuQuery.addEventListener === 'function') {
  mobileMenuQuery.addEventListener('change', handleMobileMenuChange);
} else if (mobileMenuQuery && typeof mobileMenuQuery.addListener === 'function') {
  mobileMenuQuery.addListener(handleMobileMenuChange);
}

window.addEventListener('resize', () => {
  if (!isMobileMenuActive()) {
    setTopMenuOpen(false, { immediate: true });
  }
  updateTopBarOffset();
});

handleMobileMenuChange();
window.addEventListener('load', updateTopBarOffset);

// Page navigation
function navigateTo(page) {
  setTopMenuOpen(false);
  // Redirect to home if not logged in and trying to access protected pages
  if (!currentUser && (page === 'app' || page === 'settings')) {
    page = 'home';
  }
  
  homePage?.classList.add('hidden');
  loginPage?.classList.add('hidden');
  signupPage?.classList.add('hidden');
  appPage?.classList.add('hidden');
  settingsPage?.classList.add('hidden');
  
  // Update active nav button - always clear first
  topDashboardBtn?.classList.remove('active');
  topSettingsBtn?.classList.remove('active');
  
  if (page === 'home') {
    homePage?.classList.remove('hidden');
    window.history.pushState({ page: 'home' }, '', '#home');
  } else if (page === 'login') {
    loginPage?.classList.remove('hidden');
    window.history.pushState({ page: 'login' }, '', '#login');
    setTimeout(() => logInEmailInput?.focus(), 100);
  } else if (page === 'signup') {
    signupPage?.classList.remove('hidden');
    window.history.pushState({ page: 'signup' }, '', '#signup');
    setTimeout(() => signUpEmailInput?.focus(), 100);
  } else if (page === 'app' && currentUser) {
    // Only activate if user is logged in
    appPage?.classList.remove('hidden');
    topDashboardBtn?.classList.add('active');
    window.history.pushState({ page: 'app' }, '', '#app');
  } else if (page === 'settings' && currentUser) {
    // Only activate if user is logged in
    settingsPage?.classList.remove('hidden');
    topSettingsBtn?.classList.add('active');
    window.history.pushState({ page: 'settings' }, '', '#settings');
  }
}

function handlePopState(event) {
  const page = event.state?.page || 'home';
  navigateTo(page);
}

window.addEventListener('popstate', handlePopState);

const storedTheme = localStorage.getItem('flashcard-studio-theme');
const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
applyTheme(initialTheme);

themeToggleBtn?.addEventListener('click', () => {
  const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  localStorage.setItem('flashcard-studio-theme', nextTheme);
  persistThemePreference(nextTheme);
});

brandLink?.addEventListener('click', () => {
  navigateTo('home');
});

brandLink?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    navigateTo('home');
  }
});

heroGetStartedBtn?.addEventListener('click', () => {
  if (currentUser) {
    navigateTo('app');
  } else {
    navigateTo('signup');
  }
});

topSignUpBtn?.addEventListener('click', () => {
  navigateTo('signup');
});

topLogInBtn?.addEventListener('click', () => {
  navigateTo('login');
});

topDashboardBtn?.addEventListener('click', () => {
  if (currentUser) {
    navigateTo('app');
  } else {
    navigateTo('home');
  }
});

switchToSignUpBtn?.addEventListener('click', () => {
  navigateTo('signup');
});

switchToLogInBtn?.addEventListener('click', () => {
  navigateTo('login');
});

downloadExampleBtn.addEventListener('click', () => {
  const exampleCsv = [
    'Term,Definition,Hint',
    'Photosynthesis,"Process plants use to convert light into energy.","Chlorophyll, sunlight"',
    'Mitochondria,"The powerhouse of the cell.",Organelle'
  ].join('\n');
  const blob = new Blob([exampleCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'flashcard-example.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

topLogoutBtn?.addEventListener('click', handleSignOut);

topSettingsBtn?.addEventListener('click', () => {
  navigateTo('settings');
});

changePasswordForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) return;
  if (!supabase) {
    setSettingsStatusMessage('Supabase client is not available.', 'error');
    return;
  }
  if (!currentUser) {
    setSettingsStatusMessage('You must be logged in to change your password.', 'error');
    return;
  }
  
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  if (!currentPassword) {
    setSettingsStatusMessage('Please enter your current password.', 'error');
    return;
  }
  
  if (newPassword.length < 8) {
    setSettingsStatusMessage('New password must be at least 8 characters long.', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    setSettingsStatusMessage('New passwords do not match.', 'error');
    return;
  }
  
  try {
    setPasswordFormDisabled(true);
    setSettingsStatusMessage('Updating your password…', 'info');
    
    // First verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword
    });
    
    if (verifyError) {
      setSettingsStatusMessage('Current password is incorrect.', 'error');
      return;
    }
    
    // Now update the password
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    
    if (error) {
      setSettingsStatusMessage(error.message || 'Could not update password. Please try again.', 'error');
      return;
    }
    
    changePasswordForm.reset();
    setSettingsStatusMessage('Password updated successfully!', 'success');
  } catch (error) {
    console.error(error);
    setSettingsStatusMessage('Something went wrong. Please try again.', 'error');
  } finally {
    setPasswordFormDisabled(false);
  }
});

signUpForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!signUpEmailInput || !signUpPasswordInput) return;
  if (!supabase) {
    setSignupStatusMessage('Supabase client is not available.', 'error');
    return;
  }
  const email = signUpEmailInput.value.trim().toLowerCase();
  const password = signUpPasswordInput.value;
  if (!email || !password) {
    setSignupStatusMessage('Enter an email address and a password with at least 8 characters.', 'error');
    return;
  }
  if (password.length < 8) {
    setSignupStatusMessage('Passwords need to be at least 8 characters long.', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    setSignupStatusMessage('Enter a valid email address.', 'error');
    return;
  }
  try {
    setSignupFormDisabled(true);
    setSignupStatusMessage('Creating your account…', 'info');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://www.flashcardstudio.work/'
      }
    });
    if (error) {
      // Check if user already exists
      const errorMsg = error.message ? error.message.toLowerCase() : '';
      if (errorMsg.includes('already registered') || errorMsg.includes('already exists')) {
        setSignupStatusMessage('An account with this email already exists. Please log in instead.', 'error');
      } else {
        setSignupStatusMessage(error.message || 'Could not create your account. Please try again.', 'error');
      }
      return;
    }
    // Additional check for duplicate email: Supabase sometimes returns a user object
    // with an empty identities array when signup is attempted with an email that already
    // exists. This prevents confusing the user with a "success" message when the account
    // wasn't actually created. An empty identities array means no auth provider was linked.
    if (data?.user) {
      const hasNoIdentities = !data.user.identities || data.user.identities.length === 0;
      if (hasNoIdentities) {
        setSignupStatusMessage('An account with this email already exists. Please log in instead.', 'error');
        return;
      }
    }
    signUpForm.reset();
    setSignupStatusMessage('Account created! Check your email to confirm your address before logging in.', 'success');
  } catch (error) {
    console.error(error);
    setSignupStatusMessage('Something went wrong while creating your account. Please try again.', 'error');
  } finally {
    setSignupFormDisabled(false);
  }
});

logInForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!logInEmailInput || !logInPasswordInput) return;
  if (!supabase) {
    setLoginStatusMessage('Supabase client is not available.', 'error');
    return;
  }
  const email = logInEmailInput.value.trim().toLowerCase();
  const password = logInPasswordInput.value;
  if (!email || !password) {
    setLoginStatusMessage('Enter your email and password to log in.', 'error');
    return;
  }
  try {
    setLoginFormDisabled(true);
    setLoginStatusMessage('Signing you in…', 'info');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      setLoginStatusMessage(error.message || 'Could not log you in. Please try again.', 'error');
      return;
    }
    logInForm.reset();
    if (data?.session) {
      setLoginStatusMessage('Welcome back! Redirecting...', 'success');
      setTimeout(() => navigateTo('app'), 1000);
    }
  } catch (error) {
    console.error(error);
    setLoginStatusMessage('Could not log you in. Please try again.', 'error');
  } finally {
    setLoginFormDisabled(false);
  }
});

createSetBtn.addEventListener('click', () => {
  if (!requireAccount('create sets')) return;
  openSetEditor('create');
});

importSetBtn.addEventListener('click', () => {
  if (!requireAccount('import sets')) return;
  importSetInput.click();
});

importSetInput.addEventListener('change', event => {
  if (!requireAccount('import sets')) {
    importSetInput.value = '';
    return;
  }
  const file = event.target.files?.[0];
  importSetInput.value = '';
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        throw new Error('Unable to read file as text.');
      }
      const records = parseCsv(text.trim());
      if (!records.length) {
        throw new Error('The CSV file is empty.');
      }
      const columns = Object.keys(records[0].data);
      const importedSet = {
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, '') || 'Imported set',
        columns,
        cards: records.map(record => ({ id: record.id || generateCardId(), data: { ...record.data } })),
        templates: {
          front: columns[0] ? `{{${columns[0]}}}` : '',
          back: columns[1] ? `{{${columns[1]}}}` : '',
          hint: columns[2] ? `{{${columns[2]}}}` : ''
        }
      };
      openSetEditor('create', importedSet);
    } catch (error) {
      alert(error.message || String(error));
    }
  };
  reader.onerror = () => {
    alert('Could not read the file. Please try again.');
  };
  reader.readAsText(file, 'utf-8');
});

setsList.addEventListener('click', async event => {
  if (!requireAccount('manage your sets')) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const setId = button.dataset.id;
  if (!setId) return;
  if (action === 'study') {
    startStudyWithSet(setId);
  } else if (action === 'edit') {
    const set = sets.find(s => s.id === setId);
    if (set) {
      openSetEditor('edit', set);
    }
  } else if (action === 'export') {
    exportSetToCsv(setId);
  } else if (action === 'delete') {
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    if (confirm(`Delete "${set.name}"? This cannot be undone.`)) {
      // Ensure we have a valid session before attempting to delete
      const hasValidSession = await ensureValidSession();
      if (!hasValidSession) {
        return;
      }
      try {
        await deleteSetFromDatabase(setId);
        await refreshSetsFromDatabase();
      } catch (error) {
        console.error('Could not delete set', error);
        if (isAuthSessionExpiredError(error)) {
          await handleSessionExpiration();
          return;
        }
        alert('Could not delete that set. Please try again.');
      }
    }
  }
});

addColumnBtn.addEventListener('click', () => {
  if (!editorState) return;
  const value = newColumnInput.value.trim();
  if (!value) return;
  if (editorState.columns.includes(value)) {
    alert('That field already exists.');
    return;
  }
  editorState.columns.push(value);
  editorState.cards.forEach(card => {
    card.data[value] = card.data[value] ?? '';
  });
  newColumnInput.value = '';
  renderColumnList();
  renderCardsTable();
});

newColumnInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addColumnBtn.click();
  }
});

columnList.addEventListener('click', event => {
  const button = event.target.closest('button[data-remove-column]');
  if (!button || !editorState) return;
  const encodedColumn = button.dataset.removeColumn;
  if (!encodedColumn) return;
  const column = decodeFromDataset(encodedColumn);
  if (editorState.columns.length === 1) {
    alert('Keep at least one field.');
    return;
  }
  editorState.columns = editorState.columns.filter(col => col !== column);
  editorState.cards.forEach(card => {
    delete card.data[column];
  });
  renderColumnList();
  renderCardsTable();
});

cardsTableBody.addEventListener('input', event => {
  if (!editorState) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const cardId = input.dataset.cardId;
  const encodedColumn = input.dataset.column;
  if (!cardId || !encodedColumn) return;
  const column = decodeFromDataset(encodedColumn);
  const card = editorState.cards.find(c => c.id === cardId);
  if (!card) return;
  card.data[column] = input.value;
});

cardsTableBody.addEventListener('click', event => {
  if (!editorState) return;
  const button = event.target.closest('button[data-remove-card]');
  if (!button) return;
  const cardId = button.dataset.removeCard;
  if (!cardId) return;
  if (editorState.cards.length === 1) {
    alert('Keep at least one card.');
    return;
  }
  editorState.cards = editorState.cards.filter(card => card.id !== cardId);
  renderCardsTable();
});

addCardBtn.addEventListener('click', () => {
  if (!editorState) return;
  editorState.cards.push(createEmptyCard(editorState.columns));
  renderCardsTable();
});

setNameInput.addEventListener('input', () => {
  if (!editorState) return;
  editorState.name = setNameInput.value;
  if (setNameInput.value.trim()) {
    setNameInput.classList.remove('field-error');
  }
});

templateFront.addEventListener('input', () => {
  if (!editorState) return;
  editorState.templates.front = templateFront.value;
  if (templateFront.value.trim()) {
    templateFront.classList.remove('field-error');
  }
});

templateBack.addEventListener('input', () => {
  if (!editorState) return;
  editorState.templates.back = templateBack.value;
  if (templateBack.value.trim()) {
    templateBack.classList.remove('field-error');
  }
});

templateHint.addEventListener('input', () => {
  if (!editorState) return;
  editorState.templates.hint = templateHint.value;
});

cancelSetBtn.addEventListener('click', () => {
  closeSetEditor();
});

saveSetBtn.addEventListener('click', async () => {
  if (!editorState) return;
  if (!requireAccount('save sets')) {
    return;
  }
  
  // Ensure we have a valid session before attempting to save
  const hasValidSession = await ensureValidSession();
  if (!hasValidSession) {
    return;
  }
  
  // Clear previous error states
  setNameInput.classList.remove('field-error');
  templateFront.classList.remove('field-error');
  templateBack.classList.remove('field-error');
  
  let hasErrors = false;
  const trimmedName = (editorState.name || '').trim();
  if (!trimmedName) {
    setNameInput.classList.add('field-error');
    hasErrors = true;
  }
  const front = (editorState.templates.front || '').trim();
  const back = (editorState.templates.back || '').trim();
  if (!front) {
    templateFront.classList.add('field-error');
    hasErrors = true;
  }
  if (!back) {
    templateBack.classList.add('field-error');
    hasErrors = true;
  }
  
  if (hasErrors) {
    alert('Please fill out all required fields (marked with a red asterisk).');
    if (!trimmedName) {
      setNameInput.focus();
    } else if (!front) {
      templateFront.focus();
    } else if (!back) {
      templateBack.focus();
    }
    return;
  }
  const cleanedCards = editorState.cards.map(card => {
    const data = {};
    editorState.columns.forEach(column => {
      data[column] = (card.data[column] || '').trim();
    });
    return { id: card.id || generateCardId(), data };
  });
  const nonEmptyCards = cleanedCards.filter(card => {
    return editorState.columns.some(column => card.data[column].length > 0);
  });
  if (!nonEmptyCards.length) {
    alert('Add at least one card with some content.');
    return;
  }
  const setToSave = {
    id: editorState.id,
    name: trimmedName,
    columns: [...editorState.columns],
    cards: nonEmptyCards,
    templates: {
      front,
      back,
      hint: (editorState.templates.hint || '').trim()
    }
  };
  try {
    await saveSetToDatabase(setToSave);
    await refreshSetsFromDatabase();
    closeSetEditor();
  } catch (error) {
    console.error('Could not save set', error);
    if (isAuthSessionExpiredError(error)) {
      await handleSessionExpiration();
      return;
    }
    alert('Could not save your set. Please try again.');
  }
});

backButton.addEventListener('click', () => {
  exitStudy();
});

showAnswerBtn.addEventListener('click', () => {
  if (!currentCard) return;
  cardText.textContent = renderTemplate(activeTemplates.back, currentCard.data);
  const backColumns = extractColumnsFromTemplate(activeTemplates.back);
  cardColumns.textContent = backColumns.join(' · ');
  isShowingFront = false;
  showAnswerBtn.classList.add('hidden');
  knowBtn.classList.remove('hidden');
  dontKnowBtn.classList.remove('hidden');
  flipBtn?.classList.remove('hidden');
});

flipBtn?.addEventListener('click', () => {
  if (!currentCard || flipBtn.classList.contains('hidden')) return;
  isShowingFront = !isShowingFront;
  const templateToShow = isShowingFront ? activeTemplates.front : activeTemplates.back;
  cardText.textContent = renderTemplate(templateToShow, currentCard.data);
  const columns = extractColumnsFromTemplate(templateToShow);
  cardColumns.textContent = columns.join(' · ');
});

knowBtn.addEventListener('click', () => {
  if (!currentCard) return;
  if (currentCardIndex >= 0) {
    deck.splice(currentCardIndex, 1);
  }
  currentCardIndex = -1;
  prepareNextCard();
});

dontKnowBtn.addEventListener('click', () => {
  if (!currentCard) return;
  const lastCardId = currentCard.id;
  if (currentCardIndex >= 0) {
    const [cardToRetry] = deck.splice(currentCardIndex, 1);
    const insertIndex = Math.floor(Math.random() * (deck.length + 1));
    if (cardToRetry) {
      deck.splice(insertIndex, 0, cardToRetry);
    }
  }
  currentCardIndex = -1;
  const avoidCardId = deck.length > 1 ? lastCardId : null;
  prepareNextCard({ avoidCardId });
});

restartBtn.addEventListener('click', () => {
  resetDeck();
  prepareNextCard();
  restartBtn.classList.add('hidden');
  showAnswerBtn.classList.remove('hidden');
  returnBtn.classList.add('hidden');
});

returnBtn.addEventListener('click', () => {
  exitStudy();
});

document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  if (studySection.classList.contains('hidden')) {
    return;
  }
  if (event.key === '1') {
    event.preventDefault();
    if (!showAnswerBtn.classList.contains('hidden')) {
      showAnswerBtn.click();
    } else if (!knowBtn.classList.contains('hidden')) {
      knowBtn.click();
    } else if (!restartBtn.classList.contains('hidden')) {
      restartBtn.click();
    }
  } else if (event.key === '2') {
    event.preventDefault();
    if (!dontKnowBtn.classList.contains('hidden')) {
      dontKnowBtn.click();
    } else if (!returnBtn.classList.contains('hidden')) {
      returnBtn.click();
    }
  } else if (event.key === '3') {
    event.preventDefault();
    if (!flipBtn?.classList.contains('hidden')) {
      flipBtn.click();
    }
  }
});

// Handle page visibility changes (tab switching)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void refreshSessionState('visibilitychange');
  }
});

window.addEventListener('focus', () => {
  void refreshSessionState('focus');
});

initializeAccountState();

async function refreshSetsFromDatabase({ showLoader = false } = {}) {
  if (!currentUser || !supabase) {
    sets = [];
    renderSetsList();
    return;
  }
  try {
    const { data, error } = await supabase
      .from('flashcard_sets')
      .select('id, name, columns, cards, templates')
      .eq('user_id', currentUser.id)
      .order('name', { ascending: true });
    if (error) {
      throw error;
    }
    const fetchedSets = Array.isArray(data)
      ? data.map(record =>
          cloneSetForEditing({
            id: record.id,
            name: record.name,
            columns: record.columns,
            cards: record.cards,
            templates: record.templates
          })
        )
      : [];
    const hasProvisionedStarterSet = hasStarterSetProvisioned();
    if (!fetchedSets.length && !starterSetCreated && !hasProvisionedStarterSet) {
      // Only try to create starter set once per session to prevent infinite loops
      // Flag resets on auth change (logout/login) or page refresh to allow retry
      starterSetCreated = true;
      try {
        const starterSet = createStarterSet();
        await saveSetToDatabase(starterSet, { silent: true });
        await markStarterSetProvisioned();
        sets = [starterSet];
      } catch (starterError) {
        console.error('Could not create starter set', starterError);
        // Don't show error to user, just leave sets empty
        // User can refresh page or create their own set
        sets = [];
      }
    } else {
      sets = fetchedSets;
    }
    renderSetsList();
  } catch (error) {
    console.error('Could not load sets', error);
    if (isAuthSessionExpiredError(error)) {
      await handleSessionExpiration();
      return;
    }
    sets = [];
    renderSetsList();
  }
}

function hasStarterSetProvisioned() {
  return Boolean(currentUser?.user_metadata?.starter_set_provisioned);
}

async function markStarterSetProvisioned() {
  if (!supabase || !currentUser) {
    return;
  }
  try {
    const { data, error } = await supabase.auth.updateUser({
      data: { starter_set_provisioned: true }
    });
    if (error) {
      throw error;
    }
    if (data?.user) {
      currentUser = data.user;
    }
  } catch (error) {
    console.error('Could not update starter set provisioning state', error);
  }
}

async function saveSetToDatabase(setToSave, { silent = false } = {}) {
  if (!currentUser || !supabase) {
    throw new Error('No logged in user.');
  }
  const payload = {
    id: setToSave.id,
    user_id: currentUser.id,
    name: setToSave.name,
    columns: setToSave.columns,
    cards: setToSave.cards.map(card => ({ id: card.id, data: { ...card.data } })),
    templates: { ...setToSave.templates }
  };
  const { error } = await supabase.from('flashcard_sets').upsert(payload, { onConflict: 'id' });
  if (error) {
    throw error;
  }
}

async function deleteSetFromDatabase(setId) {
  if (!currentUser || !supabase) {
    throw new Error('No logged in user.');
  }
  const { error } = await supabase.from('flashcard_sets').delete().eq('id', setId).eq('user_id', currentUser.id);
  if (error) {
    throw error;
  }
}

function renderSetsList() {
  if (!currentUser) {
    setsList.innerHTML = '<div class="empty-state">Please log in to view your sets.</div>';
    return;
  }
  if (!sets.length) {
    setsList.innerHTML = '<div class="empty-state">No sets yet. Create one or import a CSV to get started.</div>';
    return;
  }
  setsList.innerHTML = sets
    .map(set => {
      const cardCount = set.cards.length;
      const cardLabel = cardCount === 1 ? 'card' : 'cards';
      return `
      <div class="set-card">
        <div class="set-card__header">
          <div class="set-card__title-row">
            <h3>${escapeHtml(set.name)}</h3>
            <button type="button" data-action="delete" data-id="${set.id}" class="set-card__delete" aria-label="Delete set">
              <span aria-hidden="true">🗑️</span>
            </button>
          </div>
          <div class="set-card__meta">${cardCount} ${cardLabel} · ${escapeHtml(set.columns.join(', '))}</div>
        </div>
        <div class="set-card__actions">
          <button data-action="study" data-id="${set.id}">Study</button>
          <button data-action="edit" data-id="${set.id}" class="secondary">Edit</button>
          <button data-action="export" data-id="${set.id}" class="secondary">Export CSV</button>
        </div>
      </div>
    `;
    })
    .join('');
}

async function handleSignOut() {
  if (!supabase) {
    currentSession = null;
    currentUser = null;
    updateTopBar();
    renderSetsList();
    navigateTo('home');
    return;
  }
  
  // Ensure we have a valid session before attempting sign out
  const hasValidSession = await ensureValidSession();
  if (!hasValidSession) {
    // Session already expired, just clear local state and navigate
    currentSession = null;
    currentUser = null;
    updateTopBar();
    renderSetsList();
    navigateTo('home');
    return;
  }
  
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    navigateTo('home');
  } catch (error) {
    console.error('Could not sign out', error);
    if (isAuthSessionExpiredError(error)) {
      await handleSessionExpiration({ showAlert: false });
      return;
    }
    alert('Could not sign out. Please try again.');
  }
}

async function initializeAccountState() {
  loadLegacySetsFromLocalStorage();
  
  // Check for auth errors in URL hash
  const hash = window.location.hash.slice(1);
  const hashParams = new URLSearchParams(hash);
  
  if (hashParams.has('error')) {
    const errorDesc = hashParams.get('error_description') || hashParams.get('error');
    const cleanedDesc = errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : 'Authentication error';
    
    // Clear the hash
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    
    // Show error message based on error type
    if (cleanedDesc.includes('expired') || cleanedDesc.includes('invalid')) {
      alert('The verification link has expired or is invalid. Please request a new one or contact support.');
    } else {
      alert(cleanedDesc);
    }
    navigateTo('login');
  } else if (hash === 'login') {
    navigateTo('login');
  } else if (hash === 'signup') {
    navigateTo('signup');
  } else if (hash === 'app') {
    navigateTo('app');
  } else if (hash === 'settings') {
    navigateTo('settings');
  } else {
    navigateTo('home');
  }
  
  if (!supabase) {
    console.error('Supabase client could not be initialised.');
    return;
  }
  try {
    const {
      data: { session },
      error
    } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }
    await handleAuthChange(session);
  } catch (error) {
    console.error('Could not initialise auth state', error);
  }
  supabase.auth.onAuthStateChange(async (event, session) => {
    await handleAuthChange(session, event);
  });
}

async function handleAuthChange(session, eventType = null) {
  currentSession = session;
  currentUser = session?.user ?? null;
  legacySetsPrompted = false;
  starterSetCreated = false;
  if (currentUser) {
    sessionExpirationHandled = false;
  }
  updateTopBar();

  if (!currentUser) {
    sets = [];
    renderSetsList();
    return;
  }

  // Check if email is verified
  if (!currentUser.email_confirmed_at) {
    // Email not verified, sign out and show message
    await supabase.auth.signOut();
    alert('Please verify your email address before logging in. Check your inbox for the confirmation link.');
    navigateTo('login');
    return;
  }

  const userTheme = currentUser.user_metadata?.themePreference;
  if (userTheme === 'light' || userTheme === 'dark') {
    applyTheme(userTheme);
    localStorage.setItem('flashcard-studio-theme', userTheme);
  }

  const isAppVisible = appPage && !appPage.classList.contains('hidden');
  const isSettingsVisible = settingsPage && !settingsPage.classList.contains('hidden');
  const shouldSkipAutoNavigate = eventType === 'USER_UPDATED';

  // User logged in and verified, navigate to app unless they are already on
  // a protected page (app or settings) or the session update was triggered by
  // a profile change such as updating the theme preference.
  if (!shouldSkipAutoNavigate && !isAppVisible && !isSettingsVisible) {
    navigateTo('app');
  }

  await refreshSetsFromDatabase();
  await adoptLegacySetsIfAvailable();
}

function isAuthSessionExpiredError(error) {
  if (!error) {
    return false;
  }
  const status = error.status || error.code;
  if (status === 401 || status === '401') {
    return true;
  }
  const message = String(
    error.message ||
      error.error_description ||
      (typeof error.body === 'object' ? error.body?.message || error.body?.error_description : '') ||
      ''
  ).toLowerCase();
  if (!message) {
    return false;
  }
  if (message.includes('auth session missing') || message.includes('jwt expired') || message.includes('invalid jwt')) {
    return true;
  }
  return message.includes('session') && message.includes('expired');
}

async function handleSessionExpiration({ showAlert = true } = {}) {
  if (sessionExpirationHandled) {
    return;
  }
  sessionExpirationHandled = true;
  if (showAlert) {
    alert('Your session has expired. Please log in again.');
  }
  await handleAuthChange(null, 'SIGNED_OUT');
  navigateTo('login');
}

async function refreshSessionState(reason = 'manual') {
  if (!supabase) {
    return;
  }
  if (sessionRefreshPromise) {
    return sessionRefreshPromise;
  }
  sessionRefreshPromise = (async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error(`Error refreshing session on ${reason}:`, error);
        if (isAuthSessionExpiredError(error)) {
          await handleSessionExpiration();
        }
        return;
      }
      if (!session) {
        if (currentUser) {
          await handleSessionExpiration();
        }
        return;
      }
      const tokenChanged = !currentSession || session.access_token !== currentSession.access_token;
      const missingUserState = !currentUser;
      if (tokenChanged || missingUserState) {
        await handleAuthChange(session, 'TOKEN_REFRESHED');
      }
    } catch (error) {
      console.error(`Error handling session refresh on ${reason}:`, error);
    } finally {
      sessionRefreshPromise = null;
    }
  })();
  return sessionRefreshPromise;
}

async function ensureValidSession() {
  if (!supabase || !currentUser) {
    return false;
  }
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error checking session:', error);
      if (isAuthSessionExpiredError(error)) {
        await handleSessionExpiration();
      } else {
        await refreshSessionState('session-check-error');
      }
      return false;
    }
    if (!session) {
      await handleSessionExpiration();
      return false;
    }
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
    if (expiresAtMs && expiresAtMs - Date.now() < 60000) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('Error refreshing session:', refreshError);
        if (isAuthSessionExpiredError(refreshError)) {
          await handleSessionExpiration();
        }
        return false;
      }
      if (refreshed?.session) {
        await handleAuthChange(refreshed.session, 'TOKEN_REFRESHED');
        return true;
      }
    }
    if (!currentSession || session.access_token !== currentSession.access_token) {
      currentSession = session;
      currentUser = session.user;
    }
    return true;
  } catch (error) {
    console.error('Error ensuring valid session:', error);
    await refreshSessionState('session-check-catch');
    return false;
  }
}

function updateTopBar() {
  if (currentUser) {
    topLogoutBtn?.classList.remove('hidden');
    topNavGroup?.classList.remove('hidden');
    topSignUpBtn?.classList.add('hidden');
    topLogInBtn?.classList.add('hidden');
    if (topAccountStatus) {
      topAccountStatus.textContent = `Signed in as ${currentUser.email}`;
      topAccountStatus.dataset.state = 'authenticated';
    }
  } else {
    topLogoutBtn?.classList.add('hidden');
    topNavGroup?.classList.add('hidden');
    topSignUpBtn?.classList.remove('hidden');
    topLogInBtn?.classList.remove('hidden');
    if (topAccountStatus) {
      topAccountStatus.textContent = 'You are browsing as a guest';
      topAccountStatus.dataset.state = 'guest';
    }
    const storedTheme = localStorage.getItem('flashcard-studio-theme');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      applyTheme(storedTheme);
    }
  }
  setTopMenuOpen(false, { immediate: true });
  updateTopBarOffset();
}

function setLoginStatusMessage(message, type = 'info') {
  if (!loginStatus) return;
  loginStatus.classList.remove('hidden');
  loginStatus.textContent = message;
  loginStatus.classList.remove('account-status--info', 'account-status--error', 'account-status--success');
  loginStatus.classList.add(`account-status--${type}`);
}

function setSignupStatusMessage(message, type = 'info') {
  if (!signupStatus) return;
  signupStatus.classList.remove('hidden');
  signupStatus.textContent = message;
  signupStatus.classList.remove('account-status--info', 'account-status--error', 'account-status--success');
  signupStatus.classList.add(`account-status--${type}`);
}

function setLoginFormDisabled(disabled) {
  if (logInForm) {
    const elements = logInForm.querySelectorAll('input, button');
    elements.forEach(el => el.disabled = disabled);
  }
}

function setSignupFormDisabled(disabled) {
  if (signUpForm) {
    const elements = signUpForm.querySelectorAll('input, button');
    elements.forEach(el => el.disabled = disabled);
  }
}

function setSettingsStatusMessage(message, type = 'info') {
  if (!settingsStatus) return;
  settingsStatus.classList.remove('hidden');
  settingsStatus.textContent = message;
  settingsStatus.classList.remove('account-status--info', 'account-status--error', 'account-status--success');
  settingsStatus.classList.add(`account-status--${type}`);
}

function setPasswordFormDisabled(disabled) {
  if (changePasswordForm) {
    const elements = changePasswordForm.querySelectorAll('input, button');
    elements.forEach(el => el.disabled = disabled);
  }
}

function requireAccount(actionDescription) {
  if (currentUser) {
    return true;
  }
  alert(`Please log in to ${actionDescription}.`);
  navigateTo('login');
  return false;
}

function loadLegacySetsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      legacySets = [];
      return;
    }
    const parsed = JSON.parse(raw);
    legacySets = Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
  } catch (error) {
    console.warn('Could not load legacy sets', error);
    legacySets = [];
  }
}

async function adoptLegacySetsIfAvailable() {
  if (!currentUser || !legacySets.length || legacySetsPrompted) {
    return false;
  }
  legacySetsPrompted = true;
  const shouldImport = confirm('We found sets saved on this device. Do you want to add them to your account?');
  if (!shouldImport) {
    // User declined, clear the legacy sets so we don't ask again
    legacySets = [];
    localStorage.removeItem(storageKey);
    return false;
  }
  try {
    const normalisedSets = legacySets.map(set => cloneSetForEditing(set));
    for (const set of normalisedSets) {
      await saveSetToDatabase(set, { silent: true });
    }
    legacySets = [];
    localStorage.removeItem(storageKey);
    await refreshSetsFromDatabase();
    return true;
  } catch (error) {
    console.error('Could not import legacy sets', error);
    // Clear legacy sets even on error to prevent repeated prompts
    legacySets = [];
    localStorage.removeItem(storageKey);
    alert('Could not import your locally saved sets. The data has been cleared from this device.');
    return false;
  }
}

function exportSetToCsv(setId) {
  const set = sets.find(candidate => candidate.id === setId);
  if (!set) {
    return;
  }
  const csv = createCsvFromSet(set);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = createFileNameFromSet(set);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function createCsvFromSet(set) {
  const headers = set.columns.map(column => escapeCsvCell(column));
  const rows = [headers.join(',')];
  set.cards.forEach(card => {
    const row = set.columns.map(column => {
      const value = card.data?.[column] ?? '';
      return escapeCsvCell(value);
    });
    rows.push(row.join(','));
  });
  return rows.join('\n');
}

function escapeCsvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function createFileNameFromSet(set) {
  const base = set.name?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')?.replace(/^-+|-+$/g, '') || 'flashcard-set';
  return `${base}.csv`;
}

function normaliseIncomingSet(rawSet, { fallbackName = 'Imported set', preserveIds = false } = {}) {
  const rawColumns = Array.isArray(rawSet?.columns) ? rawSet.columns : [];
  const columns = rawColumns
    .map(column => (typeof column === 'string' ? column.trim() : ''))
    .filter(Boolean);
  if (!columns.length) {
    columns.push('Front', 'Back');
  }
  const uniqueColumns = [...new Set(columns)];
  const name = typeof rawSet?.name === 'string' && rawSet.name.trim() ? rawSet.name.trim() : fallbackName;
  const templates = {
    front:
      typeof rawSet?.templates?.front === 'string' && rawSet.templates.front.trim()
        ? rawSet.templates.front.trim()
        : `{{${uniqueColumns[0]}}}`,
    back:
      typeof rawSet?.templates?.back === 'string' && rawSet.templates.back.trim()
        ? rawSet.templates.back.trim()
        : `{{${uniqueColumns[1] || uniqueColumns[0]}}}`,
    hint: typeof rawSet?.templates?.hint === 'string' ? rawSet.templates.hint : ''
  };
  const cardsSource = Array.isArray(rawSet?.cards) ? rawSet.cards : [];
  const cards = cardsSource.length
    ? cardsSource.map(card => {
        const data = {};
        uniqueColumns.forEach(column => {
          const sourceValue = card?.data?.[column];
          data[column] = typeof sourceValue === 'string' ? sourceValue : '';
        });
        return {
          id: preserveIds && typeof card?.id === 'string' ? card.id : generateCardId(),
          data
        };
      })
    : [createEmptyCard(uniqueColumns)];
  return {
    id: preserveIds && typeof rawSet?.id === 'string' ? rawSet.id : generateId(),
    name,
    columns: uniqueColumns,
    cards,
    templates
  };
}

function cloneSetForEditing(set) {
  return normaliseIncomingSet(set, { fallbackName: set?.name || 'Untitled set', preserveIds: true });
}

function createStarterSet() {
  return {
    id: generateId(),
    name: 'Starter deck',
    columns: ['Term', 'Definition', 'Hint'],
    cards: [
      {
        id: generateCardId(),
        data: {
          Term: 'Photosynthesis',
          Definition: 'Process plants use to convert light into energy.',
          Hint: 'Chlorophyll, sunlight'
        }
      },
      {
        id: generateCardId(),
        data: {
          Term: 'Mitochondria',
          Definition: 'The powerhouse of the cell.',
          Hint: 'Organelle'
        }
      }
    ],
    templates: {
      front: '{{Term}}',
      back: '{{Definition}}',
      hint: '{{Hint}}'
    }
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function openSetEditor(mode, baseSet) {
  editorMode = mode;
  const defaultColumns = ['Front', 'Back', 'Hint'];
  const source = baseSet || null;
  const columns = source?.columns?.length ? [...source.columns] : [...defaultColumns];
  editorState = {
    id: source?.id || generateId(),
    name: source?.name || '',
    columns,
    cards: (source?.cards && source.cards.length ? source.cards : [createEmptyCard(columns)])
      .map(card => ({ id: card.id || generateCardId(), data: { ...card.data } })),
    templates: {
      front: source?.templates?.front || (columns[0] ? `{{${columns[0]}}}` : ''),
      back: source?.templates?.back || (columns[1] ? `{{${columns[1]}}}` : ''),
      hint: source?.templates?.hint || (columns[2] ? `{{${columns[2]}}}` : '')
    }
  };
  setNameInput.value = editorState.name;
  templateFront.value = editorState.templates.front;
  templateBack.value = editorState.templates.back;
  templateHint.value = editorState.templates.hint;
  renderColumnList();
  renderCardsTable();
  setEditorTitle.textContent = mode === 'edit' ? 'Edit set' : 'Create a set';
  setManagerSection.classList.add('hidden');
  studySection.classList.add('hidden');
  setEditorSection.classList.remove('hidden');
  setNameInput.focus();
}

function closeSetEditor() {
  editorState = null;
  setEditorSection.classList.add('hidden');
  studySection.classList.add('hidden');
  setManagerSection.classList.remove('hidden');
}

function renderColumnList() {
  if (!editorState) return;
  if (!editorState.columns.length) {
    columnList.innerHTML = '<div class="empty-state">No fields yet.</div>';
    return;
  }
  columnList.innerHTML = editorState.columns.map(column => {
    const encoded = encodeForDataset(column);
    return `
      <span class="column-chip">
        ${escapeHtml(column)}
        <button type="button" class="secondary" data-remove-column="${encoded}">&times;</button>
      </span>
    `;
  }).join('');
}

function renderCardsTable() {
  if (!editorState) return;
  if (!editorState.columns.length) {
    cardsTableHead.innerHTML = '';
    cardsTableBody.innerHTML = '';
    return;
  }
  const headerCells = editorState.columns.map(column => `<th>${escapeHtml(column)}</th>`).join('');
  cardsTableHead.innerHTML = `<tr>${headerCells}<th>Actions</th></tr>`;
  if (!editorState.cards.length) {
    cardsTableBody.innerHTML = `<tr><td colspan="${editorState.columns.length + 1}" class="empty-state">No cards yet. Add one above.</td></tr>`;
    return;
  }
  cardsTableBody.innerHTML = editorState.cards.map(card => {
    const inputs = editorState.columns.map(column => {
      const encodedColumn = encodeForDataset(column);
      const value = card.data[column] ?? '';
      return `<td><input data-card-id="${card.id}" data-column="${encodedColumn}" value="${escapeHtml(value)}" /></td>`;
    }).join('');
    return `
      <tr data-card-id="${card.id}">
        ${inputs}
        <td><button type="button" class="secondary danger" data-remove-card="${card.id}">Remove</button></td>
      </tr>
    `;
  }).join('');
}

function createEmptyCard(columns) {
  const data = {};
  columns.forEach(column => {
    data[column] = '';
  });
  return { id: generateCardId(), data };
}

function startStudyWithSet(setId) {
  const set = sets.find(s => s.id === setId);
  if (!set) {
    alert('Set not found.');
    return;
  }
  if (!set.cards.length) {
    alert('This set has no cards yet.');
    return;
  }
  if (!set.templates?.front || !set.templates?.back) {
    alert('Add front and back templates before studying this set.');
    return;
  }
  activeSetId = setId;
  activeTemplates = {
    front: set.templates.front || '',
    back: set.templates.back || '',
    hint: set.templates.hint || ''
  };
  studySetTitle.textContent = `Study session · ${set.name}`;
  originalDeck = set.cards.map(card => ({ id: card.id, data: { ...card.data } }));
  resetDeck();
  prepareNextCard();
  setManagerSection.classList.add('hidden');
  setEditorSection.classList.add('hidden');
  studySection.classList.remove('hidden');
}

function resetDeck() {
  deck = originalDeck.map(card => ({ id: card.id, data: { ...card.data } }));
  currentCard = null;
  currentCardIndex = -1;
  cardColumns.textContent = '';
  cardHint.textContent = '';
  isShowingFront = true;
  showAnswerBtn.classList.remove('hidden');
  knowBtn.classList.add('hidden');
  dontKnowBtn.classList.add('hidden');
  flipBtn?.classList.add('hidden');
  restartBtn.classList.add('hidden');
  returnBtn.classList.add('hidden');
  clearConfetti();
  updateProgress();
}

function prepareNextCard({ avoidCardId = null } = {}) {
  updateProgress();
  isShowingFront = true;
  if (!deck.length) {
    cardText.textContent = 'Great job! You have completed this set for now.';
    cardColumns.textContent = '';
    cardHint.textContent = '';
    showAnswerBtn.classList.add('hidden');
    knowBtn.classList.add('hidden');
    dontKnowBtn.classList.add('hidden');
    flipBtn?.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    returnBtn.classList.remove('hidden');
    currentCard = null;
    currentCardIndex = -1;
    triggerConfetti();
    return;
  }
  let randomIndex = Math.floor(Math.random() * deck.length);
  if (deck.length > 1 && avoidCardId && deck[randomIndex]?.id === avoidCardId) {
    randomIndex = (randomIndex + 1) % deck.length;
  }
  currentCardIndex = randomIndex;
  currentCard = deck[randomIndex];
  cardText.textContent = renderTemplate(activeTemplates.front, currentCard.data);
  const frontColumns = extractColumnsFromTemplate(activeTemplates.front);
  cardColumns.textContent = frontColumns.join(' · ');
  const hint = renderTemplate(activeTemplates.hint, currentCard.data).trim();
  cardHint.textContent = hint ? `Hint: ${hint}` : '';
  showAnswerBtn.classList.remove('hidden');
  knowBtn.classList.add('hidden');
  dontKnowBtn.classList.add('hidden');
  flipBtn?.classList.add('hidden');
  returnBtn.classList.add('hidden');
  clearConfetti();
}

function updateProgress() {
  const total = originalDeck.length;
  if (!total) {
    progressLabel.textContent = 'learned this round: 0/0';
    progressFill.style.width = '0%';
    return;
  }
  const learned = total - deck.length;
  progressLabel.textContent = `learned this round: ${learned}/${total}`;
  const percentage = Math.min(100, Math.max(0, (learned / total) * 100));
  progressFill.style.width = `${percentage}%`;
}

function exitStudy() {
  resetStudyState();
  studySection.classList.add('hidden');
  setEditorSection.classList.add('hidden');
  setManagerSection.classList.remove('hidden');
}

function resetStudyState() {
  activeSetId = null;
  activeTemplates = { front: '', back: '', hint: '' };
  deck = [];
  originalDeck = [];
  currentCard = null;
  currentCardIndex = -1;
  isShowingFront = true;
  cardText.textContent = '';
  cardColumns.textContent = '';
  cardHint.textContent = '';
  progressLabel.textContent = 'learned this round: 0/0';
  progressFill.style.width = '0%';
  showAnswerBtn.classList.remove('hidden');
  knowBtn.classList.add('hidden');
  dontKnowBtn.classList.add('hidden');
  flipBtn?.classList.add('hidden');
  restartBtn.classList.add('hidden');
  returnBtn.classList.add('hidden');
  clearConfetti();
}

function renderTemplate(template, data) {
  return template.replace(/{{\s*([^{}\s]+)\s*}}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : '';
  });
}

function extractColumnsFromTemplate(template) {
  const columns = [];
  const regex = /{{\s*([^{}\s]+)\s*}}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (!columns.includes(match[1])) {
      columns.push(match[1]);
    }
  }
  return columns;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeForDataset(value) {
  return encodeURIComponent(value);
}

function decodeFromDataset(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function triggerConfetti() {
  if (!confettiContainer) return;
  clearConfetti();
  confettiContainer.classList.add('active');
  const fragment = document.createDocumentFragment();
  const pieceCount = 140;
  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const color = confettiColors[i % confettiColors.length];
    piece.style.backgroundColor = color;
    const left = Math.random() * 100;
    const rotate = Math.random() * 720 - 360;
    const fallDistance = 110 + Math.random() * 20;
    const horizontalDrift = (Math.random() - 0.5) * 40;
    const duration = 2200 + Math.random() * 1500;
    piece.style.left = `${left}vw`;
    piece.style.top = '-10vh';
    const animation = piece.animate(
      [
        { transform: 'translate3d(0, -10vh, 0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate3d(${horizontalDrift}vw, ${fallDistance}vh, 0) rotate(${rotate}deg)`,
          opacity: 0.2
        }
      ],
      {
        duration,
        easing: 'linear',
        delay: Math.random() * 200
      }
    );
    animation.onfinish = () => {
      piece.remove();
    };
    fragment.appendChild(piece);
  }
  confettiContainer.appendChild(fragment);
  window.setTimeout(() => {
    clearConfetti();
  }, 4000);
}

function clearConfetti() {
  if (!confettiContainer) return;
  confettiContainer.classList.remove('active');
  confettiContainer.innerHTML = '';
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if (char === '\n' && !inQuotes) {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current);
  rows.push(row);

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(header => header.trim());
  if (!headers.length) {
    throw new Error('The CSV file must have a header row.');
  }

  return rows.slice(1)
    .filter(r => r.some(cell => cell.trim().length))
    .map((rowCells, index) => {
      const data = {};
      headers.forEach((header, idx) => {
        data[header] = rowCells[idx] !== undefined ? rowCells[idx].trim() : '';
      });
      return { id: generateCardId(), data };
    });
}

function generateId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `set-${Math.random().toString(36).slice(2, 10)}`;
}

function generateCardId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `card-${Math.random().toString(36).slice(2, 10)}`;
}

async function persistThemePreference(theme) {
  if (!currentUser || !supabase) {
    return;
  }
  if (currentUser.user_metadata?.themePreference === theme) {
    return;
  }
  try {
    await supabase.auth.updateUser({
      data: { themePreference: theme }
    });
    currentUser.user_metadata = {
      ...(currentUser.user_metadata || {}),
      themePreference: theme
    };
  } catch (error) {
    console.error('Could not save theme preference', error);
  }
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  if (!themeToggleBtn) {
    return;
  }
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const icon = nextTheme === 'light' ? '☀️' : '🌙';
  const label = `${nextTheme.charAt(0).toUpperCase()}${nextTheme.slice(1)} mode`;
  themeToggleBtn.innerHTML = `
    <span class="theme-toggle__icon" aria-hidden="true">${icon}</span>
    <span class="theme-toggle__label">${label}</span>
  `;
  themeToggleBtn.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
  themeToggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}
