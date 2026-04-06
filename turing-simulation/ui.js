// ─── Constants ────────────────────────────────────────────────────────────────

const TAPE_WINDOW  = 40;
const SPEEDS       = [2000, 800, 300, 100, 30, 5];
const SPEED_LABELS = ['very slow', 'slow', 'medium', 'fast', 'very fast', 'max'];

// ─── State ────────────────────────────────────────────────────────────────────

const machine    = new TuringMachine();
let running      = false;
let boosting     = false;
let boostRAF     = null;
let runTimer     = null;
let savedTapeStr = '';
let savedInitSt  = '';

const boostBatchInput = document.getElementById('boost-batch');

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const tapeInner    = document.getElementById('tape-inner');
const stState      = document.getElementById('st-state');
const stHead       = document.getElementById('st-head');
const stSteps      = document.getElementById('st-steps');
const statusMsg    = document.getElementById('status-msg');
const historyBody  = document.getElementById('history-body');
const historyPanel = document.getElementById('history-panel');
const speedInput   = document.getElementById('speed');
const speedLabel   = document.getElementById('speed-label');
const btnStep      = document.getElementById('btn-step');
const btnRun       = document.getElementById('btn-run');
const btnBoost     = document.getElementById('btn-boost');
const btnReset     = document.getElementById('btn-reset');
const lineNumbers  = document.getElementById('line-numbers');
const programEl_   = document.getElementById('program');

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderTape() {
  const head = machine.head;
  const lo = Math.max(0, head - Math.floor(TAPE_WINDOW / 2));
  const hi = lo + TAPE_WINDOW;

  tapeInner.innerHTML = '';
  for (let i = lo; i <= hi; i++) {
    const cell = document.createElement('div');
    cell.className = 'tape-cell' + (i === head ? ' head' : '');
    const ch = machine.get(i);
    cell.textContent = ch === ' ' ? '_' : ch;
    tapeInner.appendChild(cell);
  }
}

function setStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className   = type || '';
}

function updateStatusBar() {
  stState.textContent = machine.state || '—';
  stHead.textContent  = machine.head;
  stSteps.textContent = machine.steps;
}

function updateButtons() {
  btnStep.disabled  = machine.halted || running;
  btnRun.disabled   = machine.halted;
  btnBoost.disabled = machine.halted;
  btnRun.textContent   = running && !boosting ? 'Pause' : 'Run';
  btnBoost.textContent = boosting ? 'Pause' : 'Boost';
  btnRun.classList.toggle('active', running && !boosting);
  btnBoost.classList.toggle('active', boosting);
}

function addHistoryRow(entry) {
  const prev = historyBody.querySelector('.current-step');
  if (prev) prev.classList.remove('current-step');

  const tr = document.createElement('tr');
  tr.className = 'current-step';
  tr.innerHTML =
    `<td>${entry.step}</td>` +
    `<td>${entry.state}</td>` +
    `<td>${entry.read}</td>` +
    `<td>${entry.write}</td>` +
    `<td>${entry.dir}</td>` +
    `<td>${entry.newState}</td>` +
    `<td>${entry.head}</td>`;
  historyBody.appendChild(tr);
  historyPanel.scrollTop = historyPanel.scrollHeight;
}

function updateUI() {
  renderTape();
  updateStatusBar();
  updateButtons();
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function load() {
  const src = document.getElementById('program').value;
  const { rules, errors } = parseProgram(src);

  if (errors.length) {
    setStatus(errors[0], 'err');
    return;
  }

  savedTapeStr = document.getElementById('tape-input').value;
  savedInitSt  = document.getElementById('init-state').value.trim() || '0';

  machine.load(rules, savedTapeStr, savedInitSt);
  running = false;
  clearTimeout(runTimer);

  historyBody.innerHTML   = '';
  btnReset.disabled       = false;

  setStatus(`Loaded ${rules.length} rule(s). State: "${machine.state}"`, 'ok');
  updateUI();
}

function handleResult(result) {
  const last = machine.history[machine.history.length - 1];
  if (last) addHistoryRow(last);

  if (result === 'no-rule') {
    const sym = machine.get(machine.head);
    setStatus(`No rule for state="${machine.state}" symbol="${sym === ' ' ? '_' : sym}"`, 'err');
    stopRun();
  } else if (result === 'halted') {
    setStatus(`Halted in state "${machine.state}" after ${machine.steps} steps`, 'halted');
    stopRun();
  } else if (result === 'breakpoint') {
    setStatus(`Breakpoint hit (line ${last.rule.lineNum})`, 'brk');
    stopRun();
  }

  updateUI();
  return result === 'ok';
}

function doStep() {
  handleResult(machine.step());
}

function doRun() {
  if (running) {
    stopRun();
    setStatus(`Paused at step ${machine.steps}`, '');
    return;
  }
  if (machine.halted) return;

  running = true;
  updateUI();
  setStatus('Running…', 'ok');
  scheduleStep();
}

function scheduleStep() {
  if (!running) return;
  const delay = SPEEDS[parseInt(speedInput.value) - 1];
  runTimer = setTimeout(() => {
    if (!running) return;
    const result = machine.step();
    const cont   = handleResult(result);
    if (cont) scheduleStep();
    else running = false;
  }, delay);
}

function stopRun() {
  running  = false;
  boosting = false;
  machine.recording = true;
  clearTimeout(runTimer);
  if (boostRAF) { cancelAnimationFrame(boostRAF); boostRAF = null; }
  updateButtons();
}

function doBoost() {
  if (boosting) {
    stopRun();
    setStatus(`Paused at step ${machine.steps}`, '');
    updateUI();
    return;
  }
  if (running) stopRun();
  if (machine.halted) return;

  running  = true;
  boosting = true;
  machine.recording = false;
  updateButtons();
  setStatus('Boosting…', 'ok');
  boostFrame();
}

function boostFrame() {
  if (!boosting) return;

  const batch = parseInt(boostBatchInput.value) || 100;
  for (let i = 0; i < batch; i++) {
    const result = machine.step();
    if (result !== 'ok') {
      const last = machine.lastEntry;
      if (last) addHistoryRow(last);

      if (result === 'halted') {
        setStatus(`Halted in state "${machine.state}" after ${machine.steps} steps`, 'halted');
      } else if (result === 'no-rule') {
        const sym = machine.get(machine.head);
        setStatus(`No rule for state="${machine.state}" symbol="${sym === ' ' ? '_' : sym}"`, 'err');
      } else if (result === 'breakpoint') {
        setStatus(`Breakpoint hit (line ${last.rule.lineNum})`, 'brk');
      }
      stopRun();
      updateUI();
      return;
    }
  }

  renderTape();
  updateStatusBar();
  setStatus(`Boosting… step ${machine.steps}`, 'ok');
  boostRAF = requestAnimationFrame(boostFrame);
}

function doReset() {
  stopRun();
  machine.load(machine.rules, savedTapeStr, savedInitSt);
  historyBody.innerHTML = '';
  setStatus(`Reset. State: "${machine.state}"`, 'ok');
  updateUI();
}

// ─── Test Suite UI ────────────────────────────────────────────────────────────

const testPanel   = document.getElementById('test-panel');
const testSummary = document.getElementById('test-summary');
const testResults = document.getElementById('test-results');

document.getElementById('btn-tests').addEventListener('click', () => {
  testPanel.classList.toggle('hidden');
});

document.getElementById('btn-run-tests').addEventListener('click', () => {
  const { rules } = parseProgram(document.getElementById('program').value);
  if (!rules.length) {
    testSummary.textContent = 'No rules loaded.';
    testSummary.className = 'fail';
    return;
  }

  const patternStr  = document.getElementById('test-pattern').value.trim();
  const patternErr  = document.getElementById('pattern-error');

  try {
    parsePattern(patternStr);
    patternErr.textContent = '';
  } catch (e) {
    patternErr.textContent = e.message;
    return;
  }

  const initState   = document.getElementById('init-state').value.trim() || '0';
  const max         = parseInt(document.getElementById('test-max').value)   || 6;
  const acceptPfx   = document.getElementById('test-accept').value.trim()  || 'halt-accept';
  const stepLimit   = parseInt(document.getElementById('test-steps').value) || 10000;

  const results = runTestSuite(rules, initState, patternStr, max, acceptPfx, stepLimit);

  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  const posPass = results.filter(r => r.expected && r.pass).length;
  const posTot  = results.filter(r => r.expected).length;
  const negPass = results.filter(r => !r.expected && r.pass).length;
  const negTot  = results.filter(r => !r.expected).length;

  testSummary.textContent =
    `${passed}/${results.length} passed  (pos ${posPass}/${posTot}  neg ${negPass}/${negTot})`;
  testSummary.className = failed === 0 ? 'pass' : 'fail';

  // Render table — failures first, then passes
  const sorted = [...results].sort((a, b) => a.pass - b.pass);
  testResults.innerHTML = '';
  const table = document.createElement('table');
  table.innerHTML =
    '<thead><tr><th>tape</th><th>exp</th><th>got</th><th>steps</th><th>reason</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const r of sorted) {
    const tr = document.createElement('tr');
    tr.className = r.pass ? 't-pass' : 't-fail';
    const tapeDisplay = r.tape === '' ? '\u03b5' : r.tape.length > 16 ? r.tape.slice(0, 14) + '\u2026' : r.tape;
    tr.innerHTML =
      `<td>${tapeDisplay}</td>` +
      `<td>${r.expected ? 'acc' : 'rej'}</td>` +
      `<td>${r.accepted ? 'acc' : 'rej'}</td>` +
      `<td>${r.steps}</td>` +
      `<td>${r.reason}</td>`;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  testResults.appendChild(table);
});

document.getElementById('test-pattern').addEventListener('input', (e) => {
  const patternErr = document.getElementById('pattern-error');
  try {
    parsePattern(e.target.value.trim());
    patternErr.textContent = '';
  } catch (err) {
    patternErr.textContent = err.message;
  }
});

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.getElementById('btn-load').addEventListener('click', load);
btnStep.addEventListener('click', doStep);
btnRun.addEventListener('click', doRun);
btnBoost.addEventListener('click', doBoost);
btnReset.addEventListener('click', doReset);

speedInput.addEventListener('input', () => {
  speedLabel.textContent = SPEED_LABELS[parseInt(speedInput.value) - 1];
  if (running) { clearTimeout(runTimer); scheduleStep(); }
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === ' ')                            { e.preventDefault(); doRun(); }
  if (e.key === 'b')                            { e.preventDefault(); doBoost(); }
  if (e.key === 'n' || e.key === 'ArrowRight')  doStep();
});

// ─── Line numbers ─────────────────────────────────────────────────────────────

function updateLineNumbers() {
  const count = programEl_.value.split('\n').length;
  lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
  lineNumbers.scrollTop = programEl_.scrollTop;
}

programEl_.addEventListener('input', updateLineNumbers);
programEl_.addEventListener('scroll', () => {
  lineNumbers.scrollTop = programEl_.scrollTop;
});

updateLineNumbers();

// Initial render
renderTape();

// ─── Share ────────────────────────────────────────────────────────────────────

async function compress(str) {
  const bytes = new TextEncoder().encode(str);
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(bytes);
  w.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  const arr = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function decompress(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}

async function doShare() {
  const prog  = document.getElementById('program').value;
  const tape  = document.getElementById('tape-input').value;
  const state = document.getElementById('init-state').value.trim();

  const p = await compress(prog);
  const params = new URLSearchParams({ p });
  if (tape)              params.set('t', tape);
  if (state && state !== '0') params.set('s', state);

  const url = location.href.split('#')[0] + '#' + params.toString();

  try {
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById('btn-share');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  } catch {
    prompt('Copy this URL:', url);
  }
}

async function loadFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  try {
    const params = new URLSearchParams(hash);
    const p = params.get('p');
    if (!p) return;

    const prog = await decompress(p);
    document.getElementById('program').value = prog;
    updateLineNumbers();

    const t = params.get('t');
    if (t !== null) document.getElementById('tape-input').value = t;

    const s = params.get('s');
    if (s !== null) document.getElementById('init-state').value = s;

    setStatus('Loaded from shared link', 'ok');
  } catch {
    setStatus('Could not decode shared link', 'err');
  }
}

document.getElementById('btn-share').addEventListener('click', doShare);
loadFromHash();

// ─── 2D Grid View ───────────────────────────────────────────────────────────

const show2dCheckbox = document.getElementById('show-2d');
const grid2dPanel    = document.getElementById('grid-2d-panel');
const grid2dEl       = document.getElementById('grid-2d');

show2dCheckbox.addEventListener('change', () => {
  grid2dPanel.classList.toggle('hidden', !show2dCheckbox.checked);
  if (show2dCheckbox.checked) render2DGrid();
});

function parse1DTo2D() {
  const tape = machine.tape;
  // Find $ boundaries
  let first = -1, last = -1;
  for (let i = 0; i < tape.length; i++) {
    const ch = tape[i] === ' ' ? '_' : tape[i];
    if (ch === '$') {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1 || first === last) return null;

  // Collect symbols between $ markers, split by # into blocks (rows)
  const blocks = [[]];
  for (let i = first + 1; i < last; i++) {
    let ch = tape[i] === ' ' ? '_' : tape[i];
    if (ch === '#' || ch === "#'") {
      blocks.push([]);
    } else {
      blocks[blocks.length - 1].push(ch);
    }
  }

  // Parse each cell: strip ' marks, detect ^ (head) and ~ (tilde)
  const grid = [];
  let headRow = -1, headCol = -1;
  for (let r = 0; r < blocks.length; r++) {
    const row = [];
    for (let c = 0; c < blocks[r].length; c++) {
      let sym = blocks[r][c].replace(/'/g, '');
      let isHead = false;
      if (sym.endsWith('^')) {
        sym = sym.slice(0, -1);
        isHead = true;
        headRow = r;
        headCol = c;
      } else if (sym.endsWith('~')) {
        sym = sym.slice(0, -1);
      }
      row.push({ symbol: sym, isHead });
    }
    grid.push(row);
  }

  return { grid, headRow, headCol };
}

function render2DGrid() {
  if (!show2dCheckbox.checked) return;
  const parsed = parse1DTo2D();
  if (!parsed) {
    grid2dEl.innerHTML = '<span style="padding:8px;font-size:11px;color:#999">No 2D encoding detected</span>';
    return;
  }

  const { grid } = parsed;
  const numRows = grid.length;
  const numCols = Math.max(...grid.map(r => r.length), 0);
  if (numCols === 0) return;

  grid2dEl.innerHTML = '';
  grid2dEl.style.gridTemplateColumns = `auto repeat(${numCols}, 26px)`;

  // Column header row
  const corner = document.createElement('div');
  corner.className = 'g2d-label';
  grid2dEl.appendChild(corner);
  for (let c = 0; c < numCols; c++) {
    const lbl = document.createElement('div');
    lbl.className = 'g2d-label g2d-col-label';
    lbl.textContent = c;
    grid2dEl.appendChild(lbl);
  }

  // Data rows (highest row at top)
  for (let r = numRows - 1; r >= 0; r--) {
    const lbl = document.createElement('div');
    lbl.className = 'g2d-label g2d-row-label';
    lbl.textContent = r;
    grid2dEl.appendChild(lbl);

    for (let c = 0; c < numCols; c++) {
      const cell = document.createElement('div');
      const data = grid[r]?.[c];
      cell.className = 'g2d-cell' + (data?.isHead ? ' head' : '');
      cell.textContent = data ? data.symbol : '_';
      grid2dEl.appendChild(cell);
    }
  }
}

// Hook into existing render cycle
const _origRenderTape = renderTape;
renderTape = function () {
  _origRenderTape();
  render2DGrid();
};

// ─── Resizable split ────────────────────────────────────────────────────────

(function () {
  const handle = document.getElementById('resize-handle');
  const right  = document.getElementById('right-panel');
  const main   = document.querySelector('main');

  let dragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const mainRect = main.getBoundingClientRect();
    const newWidth = mainRect.right - e.clientX;
    const clamped  = Math.max(200, Math.min(newWidth, mainRect.width - 200));
    right.style.width = clamped + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();
