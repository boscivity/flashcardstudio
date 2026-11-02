(() => {
  const el = id => document.getElementById(id);
  const dialog = el('recall');
  const day = 86400000;
  const intervals = [1, 3, 7, 14, 30, 60];
  const starter = [
    ['Solute', 'The substance dissolved in a solution.'],
    ['Solvent', 'The substance that dissolves the solute.'],
    ['Oxidation', 'Loss of electrons during a reaction.'],
    ['Reduction', 'Gain of electrons during a reaction.'],
    ['Catalyst', 'A substance that speeds a reaction and is regenerated.'],
    ['Molarity', 'Moles of solute per liter of solution.'],
    ['Anion', 'An ion with a negative charge.'],
    ['Cation', 'An ion with a positive charge.']
  ];
  const normalize = text => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  let storageFailed = false;
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { storageFailed = true; }
  }
  function cardsFromPairs(pairs) {
    return pairs.map(([answer, cue]) => ({ id: JSON.stringify([answer,cue]), answer, cue }));
  }
  let cards, queue, memory, key, total, current;
  function start(all = false) {
    queue = cards.filter(c => all || !(memory[c.id]?.due > Date.now()));
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    queue = queue.slice(0, 12);
    total = queue.length;
    render();
  }
  function render() {
    current = queue[0];
    el('recallProgress').max = total || 1;
    el('recallProgress').value = current ? total - queue.length : total || 1;
    el('recallCard').hidden = !current;
    el('recallDone').hidden = !!current;
    el('recallFeedback').hidden = true;
    el('recallForm').hidden = false;
    el('recallInput').value = '';
    el('recallStatus').textContent = current ? (total - queue.length) + ' of ' + total + ' recalled' : total ? 'Round complete · ' + total + ' recalled' : 'You’re caught up';
    if (current) {
      el('recallPrompt').textContent = current.cue;
      el('recallInput').focus();
    } else {
      const next = Math.min(...cards.map(c => memory[c.id]?.due || 0));
      el('nextReview').textContent = storageFailed ? 'Progress could not be saved on this device.' : next <= Date.now() ? 'More terms are ready to practice.' : 'Next review on ' + new Date(next).toLocaleDateString(undefined, {month:'short', day:'numeric'}) + '.';
      el('practiceAll').textContent = next <= Date.now() ? 'Start next round' : 'Practice all now';
      el('practiceAll').focus();
    }
  }
  window.openRecall = (title, deck, scope) => {
    cards = deck.filter(c => c.cue?.trim() && c.answer?.trim());
    if (!cards.length) { alert('Add a term and definition to begin.'); return; }
    key = 'flashcard-recall-v1/' + scope;
    const stored = load(key, {});
    memory = Object.assign(Object.create(null), stored);
    el('recallTitle').textContent = title;
    if (!dialog.open) dialog.showModal();
    start();
  };
  el('quickPractice').onclick = () => window.openRecall('Chemistry essentials', cardsFromPairs(starter), 'chemistry');
  el('chooseTerms').onclick = () => {
    const f = el('termForm');
    f.hidden = !f.hidden;
    if (!f.hidden) { el('termLines').value ||= load('recall-local-terms', ''); el('termLines').focus(); }
  };
  el('termForm').onsubmit = e => {
    e.preventDefault();
    const text = el('termLines').value.trim();
    const pairs = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(/\t|\|/).map(x => x.trim()));
    if (!pairs.length || pairs.some(p => p.length !== 2 || !p[0] || !p[1])) {
      el('termError').textContent = 'Enter a term and definition on each line, separated by | or a tab.'; return;
    }
    el('termError').textContent = '';
    save('recall-local-terms', text);
    window.openRecall('My terms', cardsFromPairs(pairs), 'local');
  };
  el('recallForm').onsubmit = e => {
    e.preventDefault();
    const guess = el('recallInput').value;
    const match = normalize(guess) === normalize(current.answer);
    el('recallForm').hidden = true;
    el('recallFeedback').hidden = false;
    el('recallVerdict').textContent = match ? 'Correct' : guess.trim() ? 'Compare your answer' : 'The answer';
    el('recallAnswer').textContent = current.answer;
    el('recallGood').disabled = !guess.trim();
    (match ? el('recallGood') : el('recallAgain')).focus();
  };
  function rate(good) {
    if (!current || el('recallFeedback').hidden) return;
    queue.shift();
    if (good) {
      const level = Math.min((memory[current.id]?.level || 0) + 1, intervals.length);
      memory[current.id] = {level, due:Date.now() + day * intervals[level - 1]};
    } else {
      memory[current.id] = {level:0, due:0};
      queue.splice(Math.min(2, queue.length), 0, current);
    }
    save(key, memory);
    render();
  }
  el('recallGood').onclick = () => rate(true);
  el('recallAgain').onclick = () => rate(false);
  el('practiceAll').onclick = () => start(!cards.some(c => !(memory[c.id]?.due > Date.now())));
  el('closeRecall').onclick = () => dialog.close();
})();
