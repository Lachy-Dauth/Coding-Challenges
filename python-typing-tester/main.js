/* ============================================================
   main.js — typing tester UI + stats + localStorage save.
   The progress view is a separate page (profile.html / profile.js);
   this file only writes to localStorage.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  const $         = (id) => document.getElementById(id);
  const codeEl    = $('code-display');
  const caretEl   = $('caret');
  const testArea  = $('test-area');
  const hintEl    = $('hint');
  const modeSeg   = $('mode-seg');
  const timeSeg   = $('time-seg');
  const wordsSeg  = $('words-seg');
  const diffSeg   = $('difficulty-seg');
  const customVal = $('custom-val');
  const restartBtn = $('restart-btn');
  const liveWpm   = $('live-wpm');
  const liveAcc   = $('live-acc');
  const liveTimer = $('live-timer');
  const liveTimerLabel = $('live-timer-label');
  const resultsEl = $('results');
  const resWpm    = $('res-wpm');
  const resAcc    = $('res-acc');
  const resRaw    = $('res-raw');
  const resChars  = $('res-chars');
  const resTime   = $('res-time');
  const resMode   = $('res-mode');

  /* ---------- Configuration state ---------- */
  const state = {
    mode:       'time',    // 'time' | 'words'
    target:     30,        // seconds (time) or words (words)
    difficulty: 'normal',  // 'easy' | 'normal' | 'hard'
    snippet:    '',
    pos:        0,
    typed:      [],        // 'correct' | 'wrong' | null per char
    autoSkipped: [],       // true if char was auto-consumed as indent
    correctChars:   0,
    incorrectChars: 0,
    startTime:  0,
    endTime:    0,
    running:    false,
    finished:   false,
    timerId:    null,
    wpmTick:    null
  };

  /* ---------- Snippet generation + render ---------- */

  function regenerate() {
    state.snippet = PyGrammar.generate({
      mode: state.mode,
      target: state.target,
      difficulty: state.difficulty
    });
    state.pos = 0;
    state.typed = new Array(state.snippet.length).fill(null);
    state.autoSkipped = new Array(state.snippet.length).fill(false);
    state.correctChars = 0;
    state.incorrectChars = 0;
    state.running = false;
    state.finished = false;
    state.startTime = 0;
    state.endTime = 0;
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    if (state.wpmTick) { clearInterval(state.wpmTick); state.wpmTick = null; }

    render();
    updateStatsDisplay();
    if (state.mode === 'time') {
      liveTimer.textContent = state.target;
      liveTimerLabel.textContent = 'Time';
    } else {
      liveTimer.textContent = '0/' + state.target;
      liveTimerLabel.textContent = 'Words';
    }
    hintEl.hidden = false;
    resultsEl.hidden = true;
  }

  // Render the code character-by-character, wrapping each in a span
  // so we can colour + position the caret precisely.
  function render() {
    const frag = document.createDocumentFragment();
    const s = state.snippet;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const span = document.createElement('span');
      span.className = 'ch';
      if (ch === '\n') {
        span.classList.add('newline');
        span.textContent = '\u21b5\n'; // visible ↵ + real newline for layout
      } else if (ch === ' ') {
        span.classList.add('space');
        span.textContent = ' ';
      } else {
        span.textContent = ch;
      }
      const st = state.typed[i];
      if (st === 'correct') span.classList.add('correct');
      else if (st === 'wrong') span.classList.add('wrong');
      frag.appendChild(span);
    }
    codeEl.innerHTML = '';
    codeEl.appendChild(frag);
    positionCaret();
  }

  // Count the source-line number for the current position so we can
  // scroll the display to keep exactly three lines visible with the
  // current line in the middle (first line is clamped to top, last to
  // bottom — the browser clamps scrollTop automatically).
  function currentLineIdx() {
    let line = 0;
    for (let i = 0; i < state.pos; i++) {
      if (state.snippet[i] === '\n') line++;
    }
    return line;
  }

  function positionCaret() {
    const spans = codeEl.querySelectorAll('.ch');
    const target = spans[state.pos];
    if (!target) {
      caretEl.style.display = 'none';
      return;
    }

    // 1. Scroll so the current visual line is the middle of the
    //    three-line window. Using the span's position (not the
    //    source line count) so wrapped lines behave correctly too.
    const codeRect    = codeEl.getBoundingClientRect();
    const targetRect0 = target.getBoundingClientRect();
    const lineHeight  = parseFloat(getComputedStyle(codeEl).lineHeight) || targetRect0.height;
    const charTopInContent = (targetRect0.top - codeRect.top) + codeEl.scrollTop;
    codeEl.scrollTop = Math.max(0, charTopInContent - lineHeight);

    // 2. Re-read rects after scroll and position the caret relative
    //    to the test area (its positioning parent is #test-area).
    const rect     = target.getBoundingClientRect();
    const areaRect = testArea.getBoundingClientRect();
    caretEl.style.display = 'block';
    caretEl.style.left    = (rect.left - areaRect.left) + 'px';
    caretEl.style.top     = (rect.top  - areaRect.top)  + 'px';
    caretEl.style.height  = rect.height + 'px';
  }

  /* ---------- Input handling ---------- */

  function startIfNeeded() {
    if (state.running || state.finished) return;
    state.running = true;
    state.startTime = performance.now();
    hintEl.hidden = true;

    if (state.mode === 'time') {
      state.timerId = setInterval(() => {
        const elapsed = (performance.now() - state.startTime) / 1000;
        const remaining = Math.max(0, state.target - elapsed);
        liveTimer.textContent = Math.ceil(remaining);
        if (remaining <= 0) finish();
      }, 100);
    }
    state.wpmTick = setInterval(updateStatsDisplay, 250);
  }

  function onKeyDown(e) {
    // Restart shortcut: Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      regenerate();
      return;
    }
    if (state.finished) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleChar('\n');
      return;
    }
    if (e.key.length !== 1) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    handleChar(e.key);
  }

  function handleChar(ch) {
    if (state.pos >= state.snippet.length) { finish(); return; }
    startIfNeeded();

    const expected = state.snippet[state.pos];
    if (ch === expected) {
      state.typed[state.pos] = 'correct';
      state.correctChars++;
    } else {
      state.typed[state.pos] = 'wrong';
      state.incorrectChars++;
    }
    state.pos++;

    // After a newline, auto-skip the leading indentation on the
    // next line — the user shouldn't be penalised for Python's
    // mandatory whitespace.
    if (expected === '\n') {
      while (state.pos < state.snippet.length &&
             state.snippet[state.pos] === ' ') {
        state.typed[state.pos] = 'correct';
        state.autoSkipped[state.pos] = true;
        state.correctChars++;
        state.pos++;
      }
    }

    updateCharSpans();
    positionCaret();

    if (state.mode === 'words') {
      const done = correctWordsTyped();
      liveTimer.textContent = done + '/' + state.target;
      if (done >= state.target) finish();
    }

    if (state.pos >= state.snippet.length) finish();
  }

  function handleBackspace() {
    if (state.pos === 0) return;
    state.pos--;
    // Rewind past any auto-skipped indent run in one go.
    while (state.pos > 0 && state.autoSkipped[state.pos]) {
      state.typed[state.pos] = null;
      state.autoSkipped[state.pos] = false;
      state.correctChars--;
      state.pos--;
    }
    const st = state.typed[state.pos];
    if (st === 'correct') state.correctChars--;
    else if (st === 'wrong') state.incorrectChars--;
    state.typed[state.pos] = null;
    updateCharSpans();
    positionCaret();
  }

  // Cheaper than a full re-render.
  function updateCharSpans() {
    const spans = codeEl.querySelectorAll('.ch');
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      s.classList.remove('correct', 'wrong');
      const st = state.typed[i];
      if (st === 'correct') s.classList.add('correct');
      else if (st === 'wrong') s.classList.add('wrong');
    }
  }

  /* ---------- Stats ---------- */

  function correctWordsTyped() {
    let count = 0;
    let inWord = false;
    let wordOk = true;
    for (let i = 0; i < state.pos; i++) {
      const ch = state.snippet[i];
      if (/\s/.test(ch)) {
        if (inWord && wordOk) count++;
        inWord = false;
        wordOk = true;
      } else {
        inWord = true;
        if (state.typed[i] !== 'correct') wordOk = false;
      }
    }
    return count;
  }

  function computeWpm(elapsedSec) {
    if (elapsedSec <= 0) return 0;
    return (state.correctChars / 5) / (elapsedSec / 60);
  }
  function computeRawWpm(elapsedSec) {
    if (elapsedSec <= 0) return 0;
    return ((state.correctChars + state.incorrectChars) / 5) / (elapsedSec / 60);
  }
  function computeAccuracy() {
    const total = state.correctChars + state.incorrectChars;
    if (total === 0) return 1;
    return state.correctChars / total;
  }

  function updateStatsDisplay() {
    const now = state.running ? performance.now() : state.startTime;
    const elapsed = state.running ? (now - state.startTime) / 1000 : 0;
    liveWpm.textContent = Math.round(computeWpm(elapsed));
    liveAcc.textContent = Math.round(computeAccuracy() * 100) + '%';
  }

  /* ---------- Finish + save ---------- */

  function finish() {
    if (state.finished) return;
    state.finished = true;
    state.running = false;
    state.endTime = performance.now();
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    if (state.wpmTick) { clearInterval(state.wpmTick); state.wpmTick = null; }

    const elapsed = (state.endTime - state.startTime) / 1000;
    const wpm = computeWpm(elapsed);
    const raw = computeRawWpm(elapsed);
    const acc = computeAccuracy();

    resWpm.textContent = Math.round(wpm);
    resAcc.textContent = (acc * 100).toFixed(1) + '%';
    resRaw.textContent = Math.round(raw);
    resChars.textContent = state.correctChars + '/' + state.incorrectChars;
    resTime.textContent = elapsed.toFixed(1) + 's';
    resMode.textContent = state.mode + ' ' + state.target + ' · ' + state.difficulty;
    resultsEl.hidden = false;

    saveResult({
      date:       Date.now(),
      mode:       state.mode,
      target:     state.target,
      difficulty: state.difficulty,
      wpm:        Math.round(wpm * 10) / 10,
      rawWpm:     Math.round(raw * 10) / 10,
      accuracy:   Math.round(acc * 1000) / 1000,
      correct:    state.correctChars,
      incorrect:  state.incorrectChars,
      elapsed:    Math.round(elapsed * 10) / 10
    });
  }

  /* ---------- localStorage save ---------- */

  const STORAGE_KEY = 'python-typing-tester:history:v1';

  function saveResult(r) {
    let h;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      h = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(h)) h = [];
    } catch (e) { h = []; }
    h.push(r);
    while (h.length > 500) h.shift();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
    } catch (e) { /* quota full or storage disabled — silently ignore */ }
  }

  /* ---------- Config UI wiring ---------- */

  function setMode(m) {
    state.mode = m;
    modeSeg.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === m));
    timeSeg.hidden  = m !== 'time';
    wordsSeg.hidden = m !== 'words';
    const activeSeg = m === 'time' ? timeSeg : wordsSeg;
    const activeBtn = activeSeg.querySelector('.active') || activeSeg.querySelector('button');
    state.target = Number(activeBtn.dataset.val);
    customVal.value = '';
    regenerate();
  }

  function setTarget(val, segEl) {
    state.target = val;
    segEl.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', Number(b.dataset.val) === val));
    regenerate();
  }

  function setDifficulty(d) {
    state.difficulty = d;
    diffSeg.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.diff === d));
    regenerate();
  }

  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setMode(b.dataset.mode);
  });
  timeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setTarget(Number(b.dataset.val), timeSeg);
  });
  wordsSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setTarget(Number(b.dataset.val), wordsSeg);
  });
  diffSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setDifficulty(b.dataset.diff);
  });
  customVal.addEventListener('change', () => {
    const v = Number(customVal.value);
    if (!isFinite(v) || v < 1) return;
    const seg = state.mode === 'time' ? timeSeg : wordsSeg;
    seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    state.target = Math.floor(v);
    regenerate();
  });
  restartBtn.addEventListener('click', () => { regenerate(); testArea.focus(); });

  /* ---------- Key handling ---------- */

  testArea.addEventListener('keydown', onKeyDown);
  testArea.addEventListener('click', () => testArea.focus());
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === customVal) return;
    if (document.activeElement !== testArea) {
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Tab') {
        testArea.focus();
        onKeyDown(e);
      }
    }
  });
  window.addEventListener('resize', positionCaret);

  /* ---------- Init ---------- */
  regenerate();
  setTimeout(() => testArea.focus(), 50);

}());
