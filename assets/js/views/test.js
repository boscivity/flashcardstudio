// Practice test: written, multiple choice and true/false questions, graded at the end.
import { html, render, icon, plural, shuffle, confirmDialog, confetti } from '../ui.js?v=2.0.1';
import * as store from '../store.js?v=2.0.1';
import { cardSides, cardHasContent, sideLabel, isLong, pickDistractors, autoAnswerSide } from '../session.js?v=2.0.1';
import { gradeAnswer } from '../answer.js?v=2.0.1';
import { go, setHandoff, setGuard } from '../nav.js?v=2.0.1';

export function testView({ root, params }) {
  const deckId = decodeURIComponent(params[0]);
  const deck = store.getDeck(deckId);
  const backHref = `#/deck/${encodeURIComponent(deckId)}`;
  if (!deck) {
    render(root, html`<div class="page"><div class="empty"><h2>Deck not found</h2><a class="btn btn-primary" href="#/">Back to decks</a></div></div>`);
    return () => {};
  }
  const cards = deck.cards.filter(c => cardHasContent(deck, c));
  const front = sideLabel(deck, 'front'), back = sideLabel(deck, 'back');
  const config = { count: Math.min(20, cards.length), types: { written: true, mc: cards.length >= 2, tf: cards.length >= 2 }, answerWith: autoAnswerSide(deck) };
  let questions = [];
  let phase = 'setup';
  let inProgress = false;

  function build() {
    const picked = shuffle(cards).slice(0, config.count);
    const types = Object.entries(config.types).filter(([, on]) => on).map(([t]) => t);
    const rotation = shuffle(picked.map((_, i) => types[i % types.length]));
    questions = picked.map((card, i) => {
      const sides = cardSides(deck, card);
      const side = config.answerWith === 'both' ? (Math.random() < 0.5 ? 'front' : 'back') : config.answerWith;
      const promptSide = side === 'back' ? 'front' : 'back';
      const answer = sides[side];
      const pool = cards.filter(c => c.id !== card.id).map(c => cardSides(deck, c)[side]);
      let type = rotation[i];
      if (type === 'written' && isLong(answer) && types.length > 1) type = types.includes('mc') ? 'mc' : 'tf';
      const q = { card, type, prompt: sides[promptSide], answer, answerLabel: side === 'back' ? back : front, response: null };
      if (type === 'mc') {
        q.options = shuffle([answer, ...pickDistractors(answer, pool)]);
        if (q.options.length < 2) q.type = 'written';
      }
      if (type === 'tf') {
        const wrong = pickDistractors(answer, pool, Math.random, 1)[0];
        q.truth = !wrong || Math.random() < 0.5;
        q.shown = q.truth ? answer : wrong;
      }
      return q;
    });
  }

  function draw() {
    if (phase === 'setup') return drawSetup();
    if (phase === 'test') return drawTest();
    drawResults();
  }

  function drawSetup() {
    render(root, html`
      <div class="page narrow">
        <a class="back-link" href="${backHref}">${icon('back')} ${deck.name}</a>
        <h1>Practice test</h1>
        <p class="muted">Answer everything, then see your score. Tests don’t change your review schedule.</p>
        ${cards.length < 1 ? html`<div class="empty"><p>Add some cards first.</p></div>` : html`
        <form class="panel setup" data-setup>
          <label class="field"><span class="field__label">Questions</span>
            <select name="count">${[5, 10, 20, 30, 50].filter(n => n < cards.length).concat([cards.length]).map(n => html`<option value="${n}" ${n === config.count ? 'selected' : ''}>${n === cards.length ? `All ${n}` : n}</option>`)}</select>
          </label>
          <fieldset class="checks"><legend>Question types</legend>
            <label><input type="checkbox" name="written" ${config.types.written ? 'checked' : ''}> Written</label>
            <label><input type="checkbox" name="mc" ${config.types.mc ? 'checked' : ''} ${cards.length < 2 ? 'disabled' : ''}> Multiple choice</label>
            <label><input type="checkbox" name="tf" ${config.types.tf ? 'checked' : ''} ${cards.length < 2 ? 'disabled' : ''}> True / false</label>
          </fieldset>
          <fieldset class="segmented"><legend>Answer with</legend>
            ${[['back', back], ['front', front], ['both', 'Both']].map(([v, l]) => html`<label><input type="radio" name="answerWith" value="${v}" ${config.answerWith === v ? 'checked' : ''}><span>${l}</span></label>`)}
          </fieldset>
          <p class="field__error" data-error hidden>Pick at least one question type.</p>
          <button type="submit" class="btn btn-primary btn-lg">${icon('play')} Start test</button>
        </form>`}
      </div>`);
  }

  function drawTest() {
    render(root, html`
      <form class="page narrow test" data-test novalidate>
        <div class="test__head">
          <a class="back-link" href="${backHref}">${icon('back')} ${deck.name}</a>
          <span class="muted" data-answered>${answeredLabel()}</span>
        </div>
        <ol class="questions">
          ${questions.map((q, i) => html`
          <li class="question panel" id="q${i}">
            <div class="question__head"><span class="tag">${{ written: 'Written', mc: 'Multiple choice', tf: 'True or false' }[q.type]}</span><span class="muted small">${i + 1} of ${questions.length}</span></div>
            <p class="question__prompt">${q.prompt}</p>
            ${q.type === 'written' ? html`
              <label class="field"><span class="field__label">${q.answerLabel}</span><input name="q${i}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the answer"></label>` : ''}
            ${q.type === 'mc' ? html`<div class="choice-list" role="radiogroup" aria-label="Question ${i + 1} choices">
              ${q.options.map((opt, j) => html`<label class="choice"><input type="radio" name="q${i}" value="${j}"><span>${opt}</span></label>`)}</div>` : ''}
            ${q.type === 'tf' ? html`
              <p class="question__statement"><span class="muted small">${q.answerLabel}:</span> ${q.shown}</p>
              <div class="choice-list choice-list--row" role="radiogroup" aria-label="Question ${i + 1}">
                <label class="choice"><input type="radio" name="q${i}" value="true"><span>True</span></label>
                <label class="choice"><input type="radio" name="q${i}" value="false"><span>False</span></label>
              </div>` : ''}
          </li>`)}
        </ol>
        <button type="submit" class="btn btn-primary btn-lg btn-block">${icon('check')} Submit test</button>
      </form>`);
    root.querySelector('.question input')?.focus();
  }

  const answeredLabel = () => `${questions.filter(q => q.response !== null && q.response !== '').length} of ${questions.length} answered`;

  function grade() {
    for (const q of questions) {
      if (q.type === 'written') {
        const { verdict } = gradeAnswer(q.response || '', q.answer, { accents: store.prefs().strictAccents });
        q.correct = verdict === 'correct' || verdict === 'close';
        q.close = verdict === 'close';
      } else if (q.type === 'mc') q.correct = q.response !== null && q.options[Number(q.response)] === q.answer;
      else q.correct = q.response !== null && (q.response === 'true') === q.truth;
    }
  }

  function drawResults() {
    const right = questions.filter(q => q.correct).length;
    const pct = Math.round(right / questions.length * 100);
    const missed = questions.filter(q => !q.correct);
    render(root, html`
      <div class="page narrow">
        <a class="back-link" href="${backHref}">${icon('back')} ${deck.name}</a>
        <section class="score panel">
          <div class="score__ring" style="--pct:${pct}"><span>${pct}%</span></div>
          <div>
            <h1>${pct >= 90 ? 'Excellent!' : pct >= 70 ? 'Nice work' : pct >= 50 ? 'Getting there' : 'Keep practicing'}</h1>
            <p class="muted">${right} of ${questions.length} correct</p>
            <div class="done__actions done__actions--left">
              ${missed.length ? html`<button type="button" class="btn btn-primary" data-action="study-missed">${icon('zap')} Study the ${plural(missed.length, 'missed card')}</button>` : ''}
              <button type="button" class="btn" data-action="retake">${icon('undo')} New test</button>
              <a class="btn btn-ghost" href="${backHref}">Done</a>
            </div>
          </div>
        </section>
        <ol class="questions questions--results">
          ${questions.map((q, i) => html`
          <li class="question panel ${q.correct ? 'is-right' : 'is-wrong'}">
            <div class="question__head"><span class="result-badge">${q.correct ? icon('check') : icon('x')}</span><span class="muted small">${i + 1}. ${{ written: 'Written', mc: 'Multiple choice', tf: 'True or false' }[q.type]}</span></div>
            <p class="question__prompt">${q.prompt}</p>
            ${q.type === 'tf' ? html`<p class="question__statement"><span class="muted small">${q.answerLabel}:</span> ${q.shown} — <strong>${q.truth ? 'True' : 'False'}</strong></p>` : ''}
            <p class="result-line"><span class="muted small">Your answer</span> ${responseText(q) || html`<em class="muted">No answer</em>`}${q.close ? html` <span class="tag tag--ok">accepted</span>` : ''}</p>
            ${!q.correct || q.close ? html`<p class="result-line"><span class="muted small">Correct</span> <strong>${q.type === 'tf' ? (q.truth ? 'True' : 'False') : q.answer}</strong></p>` : ''}
          </li>`)}
        </ol>
      </div>`);
    if (pct >= 90) confetti();
  }

  const responseText = q => q.response === null || q.response === '' ? '' : q.type === 'mc' ? q.options[Number(q.response)] : q.type === 'tf' ? (q.response === 'true' ? 'True' : 'False') : q.response;

  const onSubmit = async event => {
    event.preventDefault();
    if (event.target.matches('[data-setup]')) {
      const f = event.target;
      config.count = Number(f.count.value);
      config.types = { written: f.written.checked, mc: f.mc.checked, tf: f.tf.checked };
      config.answerWith = f.answerWith.value;
      if (!Object.values(config.types).some(Boolean)) { root.querySelector('[data-error]').hidden = false; return; }
      build();
      phase = 'test';
      inProgress = true;
      draw();
    } else if (event.target.matches('[data-test]')) {
      const blank = questions.filter(q => q.response === null || q.response === '').length;
      if (blank && !(await confirmDialog({ title: 'Submit test?', body: html`<p>${plural(blank, 'question')} ${blank === 1 ? 'is' : 'are'} unanswered.</p>`, confirm: 'Submit anyway', cancel: 'Keep going' }))) return;
      grade();
      phase = 'results';
      inProgress = false;
      draw();
      window.scrollTo({ top: 0 });
    }
  };

  const onInput = event => {
    const m = /^q(\d+)$/.exec(event.target.name || '');
    if (!m) return;
    questions[Number(m[1])].response = event.target.value;
    const el = root.querySelector('[data-answered]');
    if (el) el.textContent = answeredLabel();
  };

  const onKeydown = event => {
    // Enter in a written answer moves to the next question instead of submitting.
    if (event.key === 'Enter' && event.target.matches?.('.question input[type="text"], .question input:not([type])')) {
      event.preventDefault();
      const items = [...root.querySelectorAll('.question')];
      const i = items.findIndex(li => li.contains(event.target));
      const nextInput = items[i + 1]?.querySelector('input');
      if (nextInput) { nextInput.focus(); nextInput.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      else root.querySelector('[data-test] [type="submit"]')?.focus();
    }
  };

  const onClick = event => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'retake') { phase = 'setup'; draw(); }
    else if (el.dataset.action === 'study-missed') {
      setHandoff({ ids: questions.filter(q => !q.correct).map(q => q.card.id), title: `${deck.name} · missed on test` });
      go(`#/study/${encodeURIComponent(deckId)}`);
    }
  };

  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('click', onClick);
  setGuard(async () => !inProgress || confirmDialog({ title: 'Leave the test?', body: html`<p>Your answers won’t be saved.</p>`, confirm: 'Leave', cancel: 'Stay', danger: true }));
  draw();
  return () => {
    setGuard(null);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', onInput);
    root.removeEventListener('keydown', onKeydown);
    root.removeEventListener('click', onClick);
  };
}
