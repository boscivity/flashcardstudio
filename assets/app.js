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

const deprecatedHeroMessages = new Set([
  'Everything is stored locally in this single HTML file, ready to study anytime.',
  'Built for offline study — save this file and open it directly in your browser anytime.'
]);

document.querySelectorAll('header p').forEach(paragraph => {
  const text = (paragraph.textContent || '').trim();
  if (deprecatedHeroMessages.has(text)) {
    paragraph.remove();
  }
});

const confettiColors = ['#3f87ff', '#7f5cff', '#22d3ee', '#facc15', '#f472b6', '#a855f7'];

const storageKey = 'flashcardStudioSets';

let sets = [];
let editorState = null;
let editorMode = 'create';

let activeSetId = null;
let activeTemplates = { front: '', back: '', hint: '' };
let originalDeck = [];
let deck = [];
let currentCard = null;

const storedTheme = localStorage.getItem('flashcard-studio-theme');
const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
applyTheme(initialTheme);

themeToggleBtn.addEventListener('click', () => {
  const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  localStorage.setItem('flashcard-studio-theme', nextTheme);
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

createSetBtn.addEventListener('click', () => {
  openSetEditor('create');
});

importSetBtn.addEventListener('click', () => {
  importSetInput.click();
});

importSetInput.addEventListener('change', event => {
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

setsList.addEventListener('click', event => {
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
  } else if (action === 'delete') {
    const set = sets.find(s => s.id === setId);
    if (!set) return;
    if (confirm(`Delete "${set.name}"? This cannot be undone.`)) {
      sets = sets.filter(s => s.id !== setId);
      saveSets();
      renderSetsList();
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

saveSetBtn.addEventListener('click', () => {
  if (!editorState) return;
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
  if (editorMode === 'create') {
    sets.push(setToSave);
  } else {
    sets = sets.map(set => (set.id === setToSave.id ? setToSave : set));
  }
  saveSets();
  renderSetsList();
  closeSetEditor();
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

loadSetsFromStorage();
renderSetsList();

function loadSetsFromStorage() {
  try {
    const raw = localStorage.getItem(storageKey);
    sets = raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Could not load saved sets', error);
    sets = [];
  }
  if (!Array.isArray(sets)) {
    sets = [];
  }
  if (!sets.length) {
    const starterSet = {
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
    sets.push(starterSet);
    saveSets();
  }
}

function saveSets() {
  localStorage.setItem(storageKey, JSON.stringify(sets));
}

function renderSetsList() {
  if (!sets.length) {
    setsList.innerHTML = '<div class="empty-state">No sets yet. Create one or import a CSV to get started.</div>';
    return;
  }
  setsList.innerHTML = sets.map(set => {
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
          <button data-action="delete" data-id="${set.id}" class="secondary danger">Delete</button>
        </div>
      </div>
    `;
  }).join('');
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
  return `set-${Math.random().toString(36).slice(2, 10)}`;
}

function generateCardId() {
  return `card-${Math.random().toString(36).slice(2, 10)}`;
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  themeToggleBtn.textContent = theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
  themeToggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}
