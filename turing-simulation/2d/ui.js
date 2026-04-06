// ─── Constants ────────────────────────────────────────────────────────────────

const TAPE_COLS    = 21;
const TAPE_ROWS    = 9;
const SPEEDS       = [2000, 800, 300, 100, 30, 5];
const SPEED_LABELS = ['very slow', 'slow', 'medium', 'fast', 'very fast', 'max'];

// ─── State ────────────────────────────────────────────────────────────────────

const machine    = new TuringMachine2D();
let running      = false;
let runTimer     = null;
let savedTapeStr = '';
let savedInitSt  = '';

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const tapeInner    = document.getElementById('tape-inner');
const stState      = document.getElementById('st-state');
const stRow        = document.getElementById('st-row');
const stCol        = document.getElementById('st-col');
const stSteps      = document.getElementById('st-steps');
const statusMsg    = document.getElementById('status-msg');
const historyBody  = document.getElementById('history-body');
const historyPanel = document.getElementById('history-panel');
const speedInput   = document.getElementById('speed');
const speedLabel   = document.getElementById('speed-label');
const btnStep      = document.getElementById('btn-step');
const btnRun       = document.getElementById('btn-run');
const btnReset     = document.getElementById('btn-reset');
const lineNumbers  = document.getElementById('line-numbers');
const programEl_   = document.getElementById('program');

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderTape() {
  const headRow = machine.row;
  const headCol = machine.col;

  const halfCols = Math.floor(TAPE_COLS / 2);
  const halfRows = Math.floor(TAPE_ROWS / 2);

  const colLo = Math.max(0, headCol - halfCols);
  const colHi = colLo + TAPE_COLS - 1;
  const rowLo = Math.max(0, headRow - halfRows);
  const rowHi = rowLo + TAPE_ROWS - 1;

  tapeInner.innerHTML = '';
  tapeInner.style.gridTemplateColumns = `auto repeat(${TAPE_COLS}, 28px)`;

  // Column header row
  const corner = document.createElement('div');
  corner.className = 'tape-label';
  tapeInner.appendChild(corner);

  for (let c = colLo; c <= colHi; c++) {
    const lbl = document.createElement('div');
    lbl.className = 'tape-label col-label';
    lbl.textContent = c;
    tapeInner.appendChild(lbl);
  }

  // Data rows (highest row at top of display)
  for (let r = rowHi; r >= rowLo; r--) {
    const lbl = document.createElement('div');
    lbl.className = 'tape-label row-label';
    lbl.textContent = r;
    tapeInner.appendChild(lbl);

    for (let c = colLo; c <= colHi; c++) {
      const cell = document.createElement('div');
      cell.className = 'tape-cell' + (r === headRow && c === headCol ? ' head' : '');
      const ch = machine.get(r, c);
      cell.textContent = ch === ' ' ? '_' : ch;
      tapeInner.appendChild(cell);
    }
  }
}

function setStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className   = type || '';
}

function updateStatusBar() {
  stState.textContent = machine.state || '—';
  stRow.textContent   = machine.row;
  stCol.textContent   = machine.col;
  stSteps.textContent = machine.steps;
}

function updateButtons() {
  btnStep.disabled = machine.halted || running;
  btnRun.disabled  = machine.halted;
  btnRun.textContent = running ? 'Pause' : 'Run';
  btnRun.classList.toggle('active', running);
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
    `<td>${entry.row},${entry.col}</td>`;
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
    const sym = machine.get(machine.row, machine.col);
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
  running = false;
  clearTimeout(runTimer);
  updateButtons();
}

function doReset() {
  stopRun();
  machine.load(machine.rules, savedTapeStr, savedInitSt);
  historyBody.innerHTML = '';
  setStatus(`Reset. State: "${machine.state}"`, 'ok');
  updateUI();
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.getElementById('btn-load').addEventListener('click', load);
btnStep.addEventListener('click', doStep);
btnRun.addEventListener('click', doRun);
btnReset.addEventListener('click', doReset);

speedInput.addEventListener('input', () => {
  speedLabel.textContent = SPEED_LABELS[parseInt(speedInput.value) - 1];
  if (running) { clearTimeout(runTimer); scheduleStep(); }
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === ' ')                            { e.preventDefault(); doRun(); }
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

// ─── Demo ─────────────────────────────────────────────────────────────────────

const DEMO_PROGRAM = `; Copy row 0 input up to row 1
; Reads each cell, marks it, writes the copy one row up

copy 0 X u w0
copy 1 Y u w1
copy _ _ * halt

w0 _ 0 d next
w1 _ 1 d next

next * * r copy
`;

document.getElementById('btn-demo').addEventListener('click', () => {
  programEl_.value = DEMO_PROGRAM;
  document.getElementById('tape-input').value = '1011';
  document.getElementById('init-state').value = 'copy';
  updateLineNumbers();
  load();
});

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
