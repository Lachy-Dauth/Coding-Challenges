/* ============================================================
   main.js — typing tester UI + stats + localStorage history.
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
  const historyListEl = $('history-list');
  const histCountEl   = $('hist-count');
  const clearHistBtn  = $('clear-history');
  const chartCanvas   = $('progress-chart');

  /* ---------- Configuration state ---------- */
  const state = {
    mode:       'time',    // 'time' | 'words'
    target:     30,        // seconds or words depending on mode
    difficulty: 'normal',  // 'easy' | 'normal' | 'hard'
    snippet:    '',
    pos:        0,         // current index into snippet
    typed:      [],        // parallel array: 'correct' | 'wrong' | null per char
    correctChars:   0,
    incorrectChars: 0,
    extraChars:     0,
    missedChars:    0,
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
    state.extraChars = 0;
    state.missedChars = 0;
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
      liveTimerLabel.textContent = 'time';
    } else {
      liveTimer.textContent = '0/' + state.target;
      liveTimerLabel.textContent = 'words';
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
        span.textContent = '\u21b5\n'; // ↵ + real newline for layout
      } else if (ch === ' ') {
        span.classList.add('space');
        span.textContent = ' ';
      } else {
        span.textContent = ch;
      }
      const st = state.typed[i];
      if (st === 'correct') span.classList.add('correct');
      else if (st === 'wrong') span.classList.add('wrong');
      if (i === state.pos) span.classList.add('cursor');
      frag.appendChild(span);
    }
    codeEl.innerHTML = '';
    codeEl.appendChild(frag);
    positionCaret();
  }

  function positionCaret() {
    const spans = codeEl.querySelectorAll('.ch');
    const target = spans[state.pos];
    if (!target) {
      caretEl.style.display = 'none';
      return;
    }
    const rect = target.getBoundingClientRect();
    const parent = codeEl.getBoundingClientRect();
    caretEl.style.display = 'block';
    caretEl.style.left   = (rect.left - parent.left) + 'px';
    caretEl.style.top    = (rect.top  - parent.top)  + 'px';
    caretEl.style.height = rect.height + 'px';

    // Keep caret in view
    const visibleTop    = codeEl.scrollTop;
    const visibleBot    = codeEl.scrollTop + codeEl.clientHeight;
    const caretTop      = rect.top - parent.top + codeEl.scrollTop;
    const caretBot      = caretTop + rect.height;
    if (caretTop < visibleTop + 20) {
      codeEl.scrollTop = Math.max(0, caretTop - 40);
    } else if (caretBot > visibleBot - 20) {
      codeEl.scrollTop = caretBot - codeEl.clientHeight + 40;
    }
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
    // Restart shortcut: Tab+Enter
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
    // Ignore modifier-only or navigation keys
    if (e.key.length !== 1) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    handleChar(e.key);
  }

  function handleChar(ch) {
    if (state.pos >= state.snippet.length) {
      // ran off the end — just stop accepting input
      finish();
      return;
    }
    startIfNeeded();

    const expected = state.snippet[state.pos];
    if (ch === expected) {
      state.typed[state.pos] = 'correct';
      state.correctChars++;
    } else {
      // mark wrong, but still advance — classic typing-test semantics
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

    // Words-mode finish condition: count correctly-typed whitespace
    // runs in the already-typed prefix.
    if (state.mode === 'words') {
      const done = correctWordsTyped();
      liveTimer.textContent = done + '/' + state.target;
      if (done >= state.target) finish();
    }

    // Ran off the end of the snippet
    if (state.pos >= state.snippet.length) finish();
  }

  function handleBackspace() {
    if (state.pos === 0) return;
    state.pos--;
    // If the char we just landed on (and any run before it) was
    // an auto-skipped indent, rewind past all of them in one go
    // so backspacing a newline feels natural.
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

  // Cheaper than a full re-render: just toggle classes on the
  // small set of spans that changed since last paint.
  function updateCharSpans() {
    const spans = codeEl.querySelectorAll('.ch');
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      s.classList.remove('correct', 'wrong', 'cursor');
      const st = state.typed[i];
      if (st === 'correct') s.classList.add('correct');
      else if (st === 'wrong') s.classList.add('wrong');
      if (i === state.pos) s.classList.add('cursor');
    }
  }

  /* ---------- Stats ---------- */

  // Number of whitespace-separated "words" in the snippet for which
  // every character the user typed was correct.
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
    // If the user is currently inside a word, don't count it until
    // they finish it — matches the behaviour of typing tests.
    return count;
  }

  function computeWpm(elapsedSec) {
    if (elapsedSec <= 0) return 0;
    // Classic: (correct chars / 5) / minutes
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

  /* ---------- Finish + results ---------- */

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
    resChars.textContent =
      state.correctChars + '/' +
      state.incorrectChars + '/' +
      state.extraChars + '/' +
      state.missedChars;
    resTime.textContent = elapsed.toFixed(1) + 's';
    resMode.textContent = state.mode + ' ' + state.target +
                          ' · ' + state.difficulty;
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

    drawHistory();
  }

  /* ---------- localStorage history ---------- */

  const STORAGE_KEY = 'python-typing-tester:history:v1';

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveResult(r) {
    const h = loadHistory();
    h.push(r);
    // Keep the most recent 200 runs — more than enough for a chart
    // and avoids unbounded growth.
    while (h.length > 200) h.shift();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
    } catch (e) {
      // Quota full, storage disabled — silently ignore.
    }
  }

  function clearHistoryStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function drawHistory() {
    const h = loadHistory();
    histCountEl.textContent = h.length + ' run' + (h.length === 1 ? '' : 's') + ' saved';
    drawChart(h);
    drawHistoryList(h);
  }

  function drawHistoryList(h) {
    historyListEl.innerHTML = '';
    const recent = h.slice(-10).reverse();
    if (recent.length === 0) {
      historyListEl.innerHTML = '<div class="hist-empty">no runs yet — finish a test to start tracking progress</div>';
      return;
    }
    recent.forEach(r => {
      const row = document.createElement('div');
      row.className = 'hist-row';
      const d = new Date(r.date);
      const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
                   ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      row.innerHTML =
        '<span class="hist-wpm">' + r.wpm.toFixed(0) + ' wpm</span>' +
        '<span class="hist-acc">' + (r.accuracy * 100).toFixed(1) + '%</span>' +
        '<span class="hist-mode">' + r.mode + ' ' + r.target + '</span>' +
        '<span class="hist-diff">' + (r.difficulty || 'normal') + '</span>' +
        '<span class="hist-date">' + date + '</span>';
      historyListEl.appendChild(row);
    });
  }

  function drawChart(h) {
    const ctx = chartCanvas.getContext('2d');
    const W = chartCanvas.width;
    const H = chartCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const css = getComputedStyle(document.documentElement);
    const accent = (css.getPropertyValue('--accent') || '#b8f442').trim() || '#b8f442';
    const muted  = (css.getPropertyValue('--muted')  || '#888').trim()  || '#888';
    const text   = (css.getPropertyValue('--text')   || '#eee').trim()  || '#eee';

    const pad = { l: 40, r: 16, t: 18, b: 28 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;

    // Axes
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = '10px "DM Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('wpm', 4, pad.t + 10);

    if (h.length === 0) {
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      ctx.fillText('no data yet', W / 2, H / 2);
      return;
    }

    const wpms = h.map(r => r.wpm);
    const maxW = Math.max(60, Math.ceil(Math.max(...wpms) / 20) * 20);
    const minW = 0;

    // Grid lines + y labels
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.2;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = pad.t + plotH - (i / steps) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    for (let i = 0; i <= steps; i++) {
      const y = pad.t + plotH - (i / steps) * plotH;
      ctx.fillText(String(Math.round(minW + (maxW - minW) * i / steps)), pad.l - 4, y + 3);
    }

    // Map each run to x = index, y = wpm
    const n = h.length;
    const xAt = (i) => pad.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (w) => pad.t + plotH - ((w - minW) / (maxW - minW)) * plotH;

    // Best-so-far line
    let best = 0;
    const bestPts = h.map(r => {
      if (r.wpm > best) best = r.wpm;
      return best;
    });
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    bestPts.forEach((w, i) => {
      const x = xAt(i); const y = yAt(w);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // WPM line (accent)
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    h.forEach((r, i) => {
      const x = xAt(i); const y = yAt(r.wpm);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Points
    ctx.fillStyle = accent;
    h.forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(r.wpm), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Latest value label
    const last = h[h.length - 1];
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.fillText(last.wpm.toFixed(0) + ' wpm', pad.l + plotW, pad.t + 10);
  }

  /* ---------- Config UI wiring ---------- */

  function setMode(m) {
    state.mode = m;
    modeSeg.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === m));
    timeSeg.hidden  = m !== 'time';
    wordsSeg.hidden = m !== 'words';
    // Reset the target to whichever segment's active button is currently set
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
  clearHistBtn.addEventListener('click', () => {
    if (confirm('Delete all saved results?')) {
      clearHistoryStorage();
      drawHistory();
    }
  });

  /* ---------- Key handling ---------- */

  testArea.addEventListener('keydown', onKeyDown);
  testArea.addEventListener('click', () => testArea.focus());
  document.addEventListener('keydown', (e) => {
    // Tab+Enter restart works anywhere; otherwise redirect printable
    // keys to the test area when nothing else is focused.
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
  drawHistory();
  setTimeout(() => testArea.focus(), 50);

}());
