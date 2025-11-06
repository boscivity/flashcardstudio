const themeToggleBtn = document.getElementById('themeToggle');
const instructionsSection = document.getElementById('instructions');
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

const accountStatus = document.getElementById('accountStatus');
const signUpForm = document.getElementById('signUpForm');
const signUpEmailInput = document.getElementById('signUpEmail');
const signUpPasswordInput = document.getElementById('signUpPassword');
const logInForm = document.getElementById('logInForm');
const logInEmailInput = document.getElementById('logInEmail');
const logInPasswordInput = document.getElementById('logInPassword');
const showSignUpBtn = document.getElementById('showSignUp');
const showLogInBtn = document.getElementById('showLogIn');
const logoutButton = document.getElementById('logoutButton');

const accountSection = document.getElementById('accountSection');
const accountCard = document.querySelector('.account-card');
const topAccountStatus = document.getElementById('topAccountStatus');
const topSignUpBtn = document.getElementById('topSignUpButton');
const topLogInBtn = document.getElementById('topLogInButton');
const topLogoutBtn = document.getElementById('topLogoutButton');
const heroGetStartedBtn = document.getElementById('heroGetStarted');
const heroBrowseSetsBtn = document.getElementById('heroBrowseSets');

const studySection = document.getElementById('study');
const studySetTitle = document.getElementById('studySetTitle');
const backButton = document.getElementById('backButton');
const cardText = document.getElementById('cardText');
const cardHint = document.getElementById('cardHint');
const showAnswerBtn = document.getElementById('showAnswer');
const knowBtn = document.getElementById('knowButton');
const dontKnowBtn = document.getElementById('dontKnowButton');
const progressLabel = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const restartBtn = document.getElementById('restartButton');
const returnBtn = document.getElementById('returnButton');
const confettiContainer = document.getElementById('confettiContainer');

const confettiColors = ['#3f87ff', '#7f5cff', '#22d3ee', '#facc15', '#f472b6', '#a855f7'];

const storageKey = 'flashcardStudioSets';
const pendingShareStorageKey = 'flashcardStudioPendingShare';

const SUPABASE_URL = 'https://tbydrjbqixrrowriuvjx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRieWRyamJxaXhycm93cml1dmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODczMjUsImV4cCI6MjA3Nzk2MzMyNX0.HOOtdJw6viZ7OozHo3GvK2Q43o0ekMeW30QwUjUcBT0';

const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let sets = [];
let editorState = null;
let editorMode = 'create';

let activeSetId = null;
let activeTemplates = { front: '', back: '', hint: '' };
let originalDeck = [];
let deck = [];
let currentCard = null;

let currentSession = null;
let currentUser = null;
let pendingSharedSet = null;
let legacySets = [];
let legacySetsPrompted = false;

const storedTheme = localStorage.getItem('flashcard-studio-theme');
const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
applyTheme(initialTheme);

themeToggleBtn?.addEventListener('click', () => {
  const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  localStorage.setItem('flashcard-studio-theme', nextTheme);
});

heroGetStartedBtn?.addEventListener('click', () => {
  focusAccountSection('signup');
});

heroBrowseSetsBtn?.addEventListener('click', () => {
  scrollToSection(setManagerSection);
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

showSignUpBtn?.addEventListener('click', () => {
  toggleAccountForms('signup');
});

showLogInBtn?.addEventListener('click', () => {
  toggleAccountForms('login');
});

topSignUpBtn?.addEventListener('click', () => {
  focusAccountSection('signup');
});

topLogInBtn?.addEventListener('click', () => {
  focusAccountSection('login');
});

logoutButton?.addEventListener('click', handleSignOut);
topLogoutBtn?.addEventListener('click', handleSignOut);

signUpForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!signUpEmailInput || !signUpPasswordInput) return;
  if (!supabase) {
    setAccountStatusMessage('Supabase client is not available.', 'error');
    return;
  }
  const email = signUpEmailInput.value.trim().toLowerCase();
  const password = signUpPasswordInput.value;
  if (!email || !password) {
    setAccountStatusMessage('Enter an email address and a password with at least 8 characters.', 'error');
    return;
  }
  if (password.length < 8) {
    setAccountStatusMessage('Passwords need to be at least 8 characters long.', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    setAccountStatusMessage('Enter a valid email address.', 'error');
    return;
  }
  try {
    setAccountFormsDisabled(true);
    setAccountStatusMessage('Creating your account…', 'info', true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    if (error) {
      setAccountStatusMessage(error.message || 'Could not create your account. Please try again.', 'error');
      return;
    }
    signUpForm.reset();
    logInForm?.reset();
    if (data?.session) {
      setAccountStatusMessage('Account created! You are now logged in.', 'success');
    } else {
      setAccountStatusMessage('Account created! Check your email to confirm your address.', 'success');
    }
  } catch (error) {
    console.error(error);
    setAccountStatusMessage('Something went wrong while creating your account. Please try again.', 'error');
  } finally {
    setAccountFormsDisabled(false);
  }
});

logInForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!logInEmailInput || !logInPasswordInput) return;
  if (!supabase) {
    setAccountStatusMessage('Supabase client is not available.', 'error');
    return;
  }
  const email = logInEmailInput.value.trim().toLowerCase();
  const password = logInPasswordInput.value;
  if (!email || !password) {
    setAccountStatusMessage('Enter your email and password to log in.', 'error');
    return;
  }
  try {
    setAccountFormsDisabled(true);
    setAccountStatusMessage('Signing you in…', 'info', true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      setAccountStatusMessage(error.message || 'Could not log you in. Please try again.', 'error');
      return;
    }
    logInForm.reset();
    if (data?.session) {
      setAccountStatusMessage('Welcome back! Your sets are ready.', 'success');
    }
  } catch (error) {
    console.error(error);
    setAccountStatusMessage('Could not log you in. Please try again.', 'error');
  } finally {
    setAccountFormsDisabled(false);
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
  } else if (action === 'share') {
    copyShareLink(setId);
  } else if (action === 'export') {
    exportSetToCsv(setId);
  } else if (action === 'delete') {
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    if (confirm(`Delete "${set.name}"? This cannot be undone.`)) {
      try {
        await deleteSetFromDatabase(setId);
        await refreshSetsFromDatabase();
        setAccountStatusMessage(`Deleted "${set.name}".`, 'success');
      } catch (error) {
        console.error('Could not delete set', error);
        setAccountStatusMessage('Could not delete that set. Please try again.', 'error');
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
});

templateFront.addEventListener('input', () => {
  if (!editorState) return;
  editorState.templates.front = templateFront.value;
});

templateBack.addEventListener('input', () => {
  if (!editorState) return;
  editorState.templates.back = templateBack.value;
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
  const trimmedName = (editorState.name || '').trim();
  if (!trimmedName) {
    alert('Give your set a name.');
    setNameInput.focus();
    return;
  }
  const front = (editorState.templates.front || '').trim();
  const back = (editorState.templates.back || '').trim();
  if (!front || !back) {
    alert('Front and back templates are required.');
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
    setAccountStatusMessage(`Saved "${setToSave.name}".`, 'success');
  } catch (error) {
    console.error('Could not save set', error);
    setAccountStatusMessage('Could not save your set. Please try again.', 'error');
  }
});

backButton.addEventListener('click', () => {
  exitStudy();
});

showAnswerBtn.addEventListener('click', () => {
  if (!currentCard) return;
  cardText.textContent = renderTemplate(activeTemplates.back, currentCard.data);
  const hint = renderTemplate(activeTemplates.hint, currentCard.data).trim();
  cardHint.textContent = hint ? `Hint: ${hint}` : '';
  showAnswerBtn.classList.add('hidden');
  knowBtn.classList.remove('hidden');
  dontKnowBtn.classList.remove('hidden');
});

knowBtn.addEventListener('click', () => {
  if (!currentCard) return;
  deck.shift();
  prepareNextCard();
});

dontKnowBtn.addEventListener('click', () => {
  if (!currentCard) return;
  const firstCard = deck.shift();
  if (firstCard) {
    deck.push(firstCard);
  }
  prepareNextCard();
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
  }
});
initializeAccountState();

async function refreshSetsFromDatabase({ showLoader = false } = {}) {
  if (!currentUser || !supabase) {
    sets = [];
    renderSetsList();
    return;
  }
  if (showLoader) {
    setAccountStatusMessage('Loading your sets…', 'info', false);
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
    if (!fetchedSets.length) {
      const starterSet = createStarterSet();
      await saveSetToDatabase(starterSet, { silent: true });
      sets = [starterSet];
    } else {
      sets = fetchedSets;
    }
    renderSetsList();
  } catch (error) {
    console.error('Could not load sets', error);
    sets = [];
    renderSetsList();
    setAccountStatusMessage('Could not load your sets from Supabase. Please refresh and try again.', 'error');
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
    if (!silent) {
      setAccountStatusMessage(error.message || 'Could not save your set.', 'error');
    }
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
    setsList.innerHTML = '<div class="empty-state">Log in or create an account to build and study sets.</div>';
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
          <h3>${escapeHtml(set.name)}</h3>
          <div class="set-card__meta">${cardCount} ${cardLabel} · ${escapeHtml(set.columns.join(', '))}</div>
        </div>
        <div class="set-card__actions">
          <button data-action="study" data-id="${set.id}">Study</button>
          <button data-action="edit" data-id="${set.id}" class="secondary">Edit</button>
          <button data-action="share" data-id="${set.id}" class="secondary">Copy share link</button>
          <button data-action="export" data-id="${set.id}" class="secondary">Export CSV</button>
          <button data-action="delete" data-id="${set.id}" class="secondary danger">Delete</button>
        </div>
      </div>
    `;
    })
    .join('');
}

async function handleSignOut() {
  if (!supabase) {
    setAccountStatusMessage('Supabase client is not available.', 'error');
    return;
  }
  setAccountFormsDisabled(true);
  setAccountStatusMessage('Signing you out…', 'info', true);
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Could not sign out', error);
    setAccountStatusMessage('Could not log you out. Please try again.', 'error');
  } finally {
    setAccountFormsDisabled(false);
  }
}

async function initializeAccountState() {
  loadLegacySetsFromLocalStorage();
  restorePendingShareFromStorage();
  renderAccountUi();
  if (!supabase) {
    setAccountStatusMessage('Supabase client could not be initialised.', 'error');
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
    setAccountStatusMessage('Could not connect to Supabase. Please refresh the page.', 'error');
  }
  supabase.auth.onAuthStateChange(async (_event, session) => {
    await handleAuthChange(session);
  });
  await handleShareLinkFromUrl();
}

async function handleAuthChange(session) {
  currentSession = session;
  currentUser = session?.user ?? null;
  legacySetsPrompted = false;
  renderAccountUi();
  if (!currentUser) {
    sets = [];
    renderSetsList();
    return;
  }
  await refreshSetsFromDatabase({ showLoader: true });
  const importedLegacy = await adoptLegacySetsIfAvailable();
  if (!importedLegacy) {
    await handlePendingSharedImport();
  } else {
    await refreshSetsFromDatabase();
    await handlePendingSharedImport();
  }
}

function renderAccountUi() {
  if (!showSignUpBtn || !showLogInBtn || !logoutButton) {
    return;
  }
  if (currentUser) {
    logoutButton.classList.remove('hidden');
    showSignUpBtn.classList.add('hidden');
    showLogInBtn.classList.add('hidden');
    topLogoutBtn?.classList.remove('hidden');
    topSignUpBtn?.classList.add('hidden');
    topLogInBtn?.classList.add('hidden');
    setTopAuthMode(null);
    signUpForm?.classList.add('hidden');
    logInForm?.classList.add('hidden');
    updateTopAccountSummary('authenticated', `Signed in as ${currentUser.email}`);
    if (accountStatus?.dataset.locked !== 'true') {
      setAccountStatusMessage(`Logged in as ${currentUser.email}`, 'success', false);
    }
  } else {
    logoutButton.classList.add('hidden');
    topLogoutBtn?.classList.add('hidden');
    topSignUpBtn?.classList.remove('hidden');
    topLogInBtn?.classList.remove('hidden');
    const signupVisible = !signUpForm?.classList.contains('hidden');
    showSignUpBtn.classList.toggle('hidden', signupVisible);
    showLogInBtn.classList.toggle('hidden', !signupVisible);
    if (signUpForm?.classList.contains('hidden') && logInForm?.classList.contains('hidden')) {
      toggleAccountForms('login');
    } else {
      setTopAuthMode(signupVisible ? 'signup' : 'login');
    }
    if (accountStatus?.dataset.locked !== 'true') {
      setAccountStatusMessage('Log in or sign up to manage your flashcard sets.', 'info', false);
    } else if (!topAccountStatus?.dataset.state || topAccountStatus.dataset.state === 'authenticated') {
      updateTopAccountSummary('guest', 'You are browsing as a guest');
    }
  }
}

function toggleAccountForms(mode) {
  if (!signUpForm || !logInForm || !showSignUpBtn || !showLogInBtn) {
    return;
  }
  const showSignup = mode === 'signup';
  if (showSignup) {
    signUpForm.classList.remove('hidden');
    logInForm.classList.add('hidden');
    showSignUpBtn.classList.add('hidden');
    showLogInBtn.classList.remove('hidden');
    signUpEmailInput?.focus({ preventScroll: true });
  } else {
    logInForm.classList.remove('hidden');
    signUpForm.classList.add('hidden');
    showSignUpBtn.classList.remove('hidden');
    showLogInBtn.classList.add('hidden');
    logInEmailInput?.focus({ preventScroll: true });
  }
  setTopAuthMode(showSignup ? 'signup' : 'login');
  if (accountStatus?.dataset.locked !== 'true' && !currentUser) {
    setAccountStatusMessage('Log in or sign up to manage your flashcard sets.', 'info', false);
  }
}

function setTopAuthMode(mode) {
  if (topSignUpBtn) {
    const isSignup = mode === 'signup';
    topSignUpBtn.classList.toggle('is-active', isSignup);
    topSignUpBtn.setAttribute('aria-pressed', isSignup ? 'true' : 'false');
  }
  if (topLogInBtn) {
    const isLogin = mode === 'login';
    topLogInBtn.classList.toggle('is-active', isLogin);
    topLogInBtn.setAttribute('aria-pressed', isLogin ? 'true' : 'false');
  }
}

function updateTopAccountSummary(state, message) {
  if (!topAccountStatus) {
    return;
  }
  topAccountStatus.textContent = message;
  topAccountStatus.dataset.state = state;
}

function scrollToSection(section) {
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function focusAccountSection(mode = 'login') {
  scrollToSection(accountSection);
  toggleAccountForms(mode);
  const focusTarget = mode === 'signup' ? signUpEmailInput : logInEmailInput;
  if (focusTarget) {
    setTimeout(() => {
      focusTarget.focus({ preventScroll: true });
    }, 250);
  }
}

function setAccountStatusMessage(message, type = 'info', lock = type !== 'info') {
  if (!accountStatus) return;
  accountStatus.textContent = message;
  accountStatus.classList.remove('account-status--info', 'account-status--error', 'account-status--success');
  accountStatus.classList.add(`account-status--${type}`);
  accountStatus.dataset.locked = lock ? 'true' : 'false';
  if (lock) {
    updateTopAccountSummary(type, message);
  } else if (currentUser) {
    updateTopAccountSummary('authenticated', `Signed in as ${currentUser.email}`);
  } else {
    updateTopAccountSummary('guest', 'You are browsing as a guest');
  }
}

function setAccountFormsDisabled(disabled) {
  if (accountSection) {
    accountSection.setAttribute('aria-busy', disabled ? 'true' : 'false');
  }
  if (accountCard) {
    const interactiveElements = accountCard.querySelectorAll('input, button');
    interactiveElements.forEach(element => {
      element.disabled = disabled;
    });
    accountCard.classList.toggle('is-loading', disabled);
  }
  if (topSignUpBtn) {
    topSignUpBtn.disabled = disabled;
  }
  if (topLogInBtn) {
    topLogInBtn.disabled = disabled;
  }
  if (topLogoutBtn) {
    topLogoutBtn.disabled = disabled;
  }
  if (showSignUpBtn) {
    showSignUpBtn.disabled = disabled;
  }
  if (showLogInBtn) {
    showLogInBtn.disabled = disabled;
  }
  if (logoutButton) {
    logoutButton.disabled = disabled;
  }
}

function requireAccount(actionDescription) {
  if (currentUser) {
    return true;
  }
  setAccountStatusMessage(`Log in to ${actionDescription}.`, 'error');
  toggleAccountForms('login');
  return false;
}

function loadLegacySetsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    legacySets = Array.isArray(parsed) ? parsed : [];
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
    return false;
  }
  try {
    const normalisedSets = legacySets.map(set => cloneSetForEditing(set));
    for (const set of normalisedSets) {
      await saveSetToDatabase(set, { silent: true });
    }
    legacySets = [];
    localStorage.removeItem(storageKey);
    setAccountStatusMessage('Imported your locally saved sets into your account.', 'success');
    await refreshSetsFromDatabase();
    return true;
  } catch (error) {
    console.error('Could not import legacy sets', error);
    setAccountStatusMessage('Could not import your locally saved sets. Please try again.', 'error');
    return false;
  }
}

function restorePendingShareFromStorage() {
  try {
    const raw = localStorage.getItem(pendingShareStorageKey);
    pendingSharedSet = raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Could not restore pending shared set', error);
    pendingSharedSet = null;
  }
}

function storePendingSharedSet(payload) {
  pendingSharedSet = payload;
  if (!payload) {
    localStorage.removeItem(pendingShareStorageKey);
  } else {
    localStorage.setItem(pendingShareStorageKey, JSON.stringify(payload));
  }
}

function clearPendingSharedSet() {
  pendingSharedSet = null;
  localStorage.removeItem(pendingShareStorageKey);
}

async function handlePendingSharedImport() {
  if (!currentUser || !pendingSharedSet) {
    return false;
  }
  const preparedSet = prepareSharedSet(pendingSharedSet);
  clearPendingSharedSet();
  if (!preparedSet) {
    return false;
  }
  const shouldImport = confirm(`Add "${preparedSet.name}" to your sets?`);
  if (!shouldImport) {
    return false;
  }
  try {
    await saveSetToDatabase(preparedSet);
    await refreshSetsFromDatabase();
    setAccountStatusMessage(`Added "${preparedSet.name}" to your sets.`, 'success');
    return true;
  } catch (error) {
    console.error('Could not import shared set', error);
    setAccountStatusMessage('Could not add that shared set to your account. Please try again.', 'error');
    return false;
  }
}

async function handleShareLinkFromUrl() {
  const url = new URL(window.location.href);
  const shareParam = url.searchParams.get('share');
  if (!shareParam) {
    return;
  }
  url.searchParams.delete('share');
  const nextUrl = `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ''}${url.hash}`;
  window.history.replaceState({}, '', nextUrl);
  try {
    const decoded = decodeBase64(shareParam);
    const payload = JSON.parse(decoded);
    storePendingSharedSet(payload);
    if (currentUser) {
      await handlePendingSharedImport();
    } else {
      setAccountStatusMessage('Log in to add the shared set to your account.', 'info', true);
      toggleAccountForms('login');
    }
  } catch (error) {
    console.error('Could not import shared set', error);
    alert('Could not import that shared set link. It may have expired or been corrupted.');
  }
}

function copyShareLink(setId) {
  const set = sets.find(candidate => candidate.id === setId);
  if (!set) {
    return;
  }
  const payload = createShareablePayload(set);
  const encoded = encodeBase64(JSON.stringify(payload));
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  url.searchParams.set('share', encoded);
  const shareUrl = url.toString();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setAccountStatusMessage('Share link copied to your clipboard.', 'success');
      })
      .catch(() => {
        prompt('Copy this link to share your set:', shareUrl);
      });
  } else {
    prompt('Copy this link to share your set:', shareUrl);
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
  setAccountStatusMessage(`Exported "${set.name}" as a CSV.`, 'success');
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

function createShareablePayload(set) {
  return {
    version: 1,
    name: set.name,
    columns: [...set.columns],
    templates: { ...set.templates },
    cards: set.cards.map(card => ({ data: { ...card.data } }))
  };
}

function prepareSharedSet(payload) {
  try {
    const baseSet = normaliseIncomingSet(payload, { fallbackName: payload?.name || 'Shared set', preserveIds: false });
    return baseSet;
  } catch (error) {
    console.error('Could not prepare shared set', error);
    alert('The shared set could not be loaded.');
    return null;
  }
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

function encodeBase64(text) {
  const encoded = new TextEncoder().encode(text);
  let binary = '';
  encoded.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
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
  instructionsSection.classList.add('hidden');
  setManagerSection.classList.add('hidden');
  studySection.classList.add('hidden');
  setEditorSection.classList.remove('hidden');
  setNameInput.focus();
}

function closeSetEditor() {
  editorState = null;
  setEditorSection.classList.add('hidden');
  studySection.classList.add('hidden');
  instructionsSection.classList.remove('hidden');
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
  instructionsSection.classList.add('hidden');
  setManagerSection.classList.add('hidden');
  setEditorSection.classList.add('hidden');
  studySection.classList.remove('hidden');
}

function resetDeck() {
  deck = originalDeck.map(card => ({ id: card.id, data: { ...card.data } }));
  currentCard = null;
  cardHint.textContent = '';
  showAnswerBtn.classList.remove('hidden');
  knowBtn.classList.add('hidden');
  dontKnowBtn.classList.add('hidden');
  restartBtn.classList.add('hidden');
  returnBtn.classList.add('hidden');
  clearConfetti();
  updateProgress();
}

function prepareNextCard() {
  updateProgress();
  if (!deck.length) {
    cardText.textContent = 'Great job! You have completed this set for now.';
    cardHint.textContent = '';
    showAnswerBtn.classList.add('hidden');
    knowBtn.classList.add('hidden');
    dontKnowBtn.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    returnBtn.classList.remove('hidden');
    currentCard = null;
    triggerConfetti();
    return;
  }
  currentCard = deck[0];
  cardText.textContent = renderTemplate(activeTemplates.front, currentCard.data);
  cardHint.textContent = '';
  showAnswerBtn.classList.remove('hidden');
  knowBtn.classList.add('hidden');
  dontKnowBtn.classList.add('hidden');
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
  instructionsSection.classList.remove('hidden');
  setManagerSection.classList.remove('hidden');
}

function resetStudyState() {
  activeSetId = null;
  activeTemplates = { front: '', back: '', hint: '' };
  deck = [];
  originalDeck = [];
  currentCard = null;
  cardText.textContent = '';
  cardHint.textContent = '';
  progressLabel.textContent = 'learned this round: 0/0';
  progressFill.style.width = '0%';
  showAnswerBtn.classList.remove('hidden');
  knowBtn.classList.add('hidden');
  dontKnowBtn.classList.add('hidden');
  restartBtn.classList.add('hidden');
  returnBtn.classList.add('hidden');
  clearConfetti();
}

function renderTemplate(template, data) {
  return template.replace(/{{\s*([^{}\s]+)\s*}}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : '';
  });
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
