// ─── Constants ────────────────────────────────────────────────────────────────

const TAPE_WINDOW  = 40;
const SPEEDS       = [2000, 800, 300, 100, 30, 5];
const SPEED_LABELS = ['very slow', 'slow', 'medium', 'fast', 'very fast', 'max'];

// ─── State ────────────────────────────────────────────────────────────────────

const machine    = new TuringMachine();
let running      = false;
let runTimer     = null;
let savedTapeStr = '';
let savedInitSt  = '';

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
const btnReset     = document.getElementById('btn-reset');
const lineNumbers  = document.getElementById('line-numbers');
const programEl_   = document.getElementById('program');

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderTape() {
  const head = machine.head;
  const lo = Math.max(0, head - Math.floor(TAPE_WINDOW / 2));
  const hi = lo + TAPE_WINDOW;

  while (machine.tape.length <= hi) machine.tape.push(' ');

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
