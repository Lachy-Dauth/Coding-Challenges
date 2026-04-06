// ─── Game of Life ─────────────────────────────────────────────────────────────

const canvas  = document.getElementById('grid');
const ctx     = canvas.getContext('2d');
const gridW   = document.getElementById('grid-w');
const gridH   = document.getElementById('grid-h');
const genLbl  = document.getElementById('gen-label');
const speedIn = document.getElementById('speed');

const SPEEDS = [500, 250, 100, 50, 20, 5];
let CELL = 20;

let W = 20, H = 20;
let cells = [];
let gen = 0;
let running = false;
let timer = null;

function init(w, h) {
  W = w; H = h;
  cells = new Uint8Array(W * H);
  gen = 0;
  genLbl.textContent = 'Gen: 0';
}

function idx(x, y) { return y * W + x; }

function get(x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return 0;
  return cells[idx(x, y)];
}

function step() {
  const next = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = get(x-1,y-1) + get(x,y-1) + get(x+1,y-1)
              + get(x-1,y)                 + get(x+1,y)
              + get(x-1,y+1) + get(x,y+1) + get(x+1,y+1);
      const alive = cells[idx(x, y)];
      if (alive) next[idx(x, y)] = (n === 2 || n === 3) ? 1 : 0;
      else       next[idx(x, y)] = (n === 3) ? 1 : 0;
    }
  }
  cells = next;
  gen++;
  genLbl.textContent = `Gen: ${gen}`;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function calcCellSize() {
  const wrap = document.getElementById('grid-wrap');
  const maxW = wrap.clientWidth - 20;
  const maxH = wrap.clientHeight - 20;
  CELL = Math.max(4, Math.min(30, Math.floor(Math.min(maxW / W, maxH / H))));
}

function render() {
  calcCellSize();
  canvas.width  = W * CELL;
  canvas.height = H * CELL;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#111';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (cells[idx(x, y)]) {
        ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      }
    }
  }

  // Grid lines
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL - 0.5, 0);
    ctx.lineTo(x * CELL - 0.5, H * CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL - 0.5);
    ctx.lineTo(W * CELL, y * CELL - 0.5);
    ctx.stroke();
  }
}

// ─── Mouse interaction ───────────────────────────────────────────────────────

let painting = false;
let paintVal = 1;

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  const { x, y } = cellAt(e);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  paintVal = cells[idx(x, y)] ? 0 : 1;
  cells[idx(x, y)] = paintVal;
  painting = true;
  render();
});

canvas.addEventListener('mousemove', e => {
  if (!painting) return;
  const { x, y } = cellAt(e);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  cells[idx(x, y)] = paintVal;
  render();
});

window.addEventListener('mouseup', () => { painting = false; });

function cellAt(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((e.clientX - rect.left) / CELL),
    y: Math.floor((e.clientY - rect.top) / CELL),
  };
}

// ─── Controls ────────────────────────────────────────────────────────────────

function stopRun() {
  running = false;
  clearInterval(timer);
  timer = null;
  document.getElementById('btn-run').textContent = 'Run';
  document.getElementById('btn-run').classList.remove('active');
}

function doRun() {
  if (running) { stopRun(); return; }
  running = true;
  document.getElementById('btn-run').textContent = 'Stop';
  document.getElementById('btn-run').classList.add('active');
  tick();
}

function tick() {
  if (!running) return;
  step();
  render();
  const spd = SPEEDS[parseInt(speedIn.value) - 1];
  timer = setTimeout(tick, spd);
}

document.getElementById('btn-step').addEventListener('click', () => {
  stopRun();
  step();
  render();
});

document.getElementById('btn-run').addEventListener('click', doRun);

document.getElementById('btn-clear').addEventListener('click', () => {
  stopRun();
  cells.fill(0);
  gen = 0;
  genLbl.textContent = 'Gen: 0';
  render();
});

document.getElementById('btn-random').addEventListener('click', () => {
  stopRun();
  for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < 0.3 ? 1 : 0;
  gen = 0;
  genLbl.textContent = 'Gen: 0';
  render();
});

document.getElementById('btn-resize').addEventListener('click', () => {
  stopRun();
  const w = Math.max(3, Math.min(100, parseInt(gridW.value) || 20));
  const h = Math.max(3, Math.min(100, parseInt(gridH.value) || 20));
  init(w, h);
  render();
});

speedIn.addEventListener('input', () => {
  if (running) { clearTimeout(timer); tick(); }
});

// ─── Export to 2D Turing Machine ─────────────────────────────────────────────

function generateGoLTMProgram(dataW, dataH) {
  const lines = [];
  const ALIVE = ['1', 'b', 'd'];

  const NB = [
    { go: ['u'],     ret: ['d']     },
    { go: ['u','r'], ret: ['l','d'] },
    { go: ['r'],     ret: ['l']     },
    { go: ['d','r'], ret: ['l','u'] },
    { go: ['d'],     ret: ['u']     },
    { go: ['d','l'], ret: ['r','u'] },
    { go: ['l'],     ret: ['r']     },
    { go: ['u','l'], ret: ['r','d'] },
  ];

  // Build the bordered grid array (bottom to top)
  // Row 0 = bottom border, rows 1..H = data, row H+1 = top border
  const ROWS = dataH + 2;
  const COLS = dataW + 2;
  const GRID = [];

  // Bottom border
  GRID.push('C' + '~'.repeat(dataW) + 'D');

  // Data rows (bottom to top = GoL row H-1 down to 0)
  for (let y = dataH - 1; y >= 0; y--) {
    let row = '<';
    for (let x = 0; x < dataW; x++) {
      row += cells[idx(x, y)] ? '1' : '0';
    }
    row += '>';
    GRID.push(row);
  }

  // Top border
  GRID.push('A' + '~'.repeat(dataW) + 'B');

  lines.push("; Conway's Game of Life - 2D Turing Machine");
  lines.push('; 0=dead 1=alive | a=born b=survive c=stay-dead d=die');
  lines.push('; Borders: A(TL) ~(T/B) B(TR) <(L) >(R) C(BL) D(BR)');
  lines.push('');

  // === INIT: draw bordered grid on blank tape (zigzag) ===
  lines.push('; === INIT: draw bordered grid ===');
  for (let r = 0; r < ROWS; r++) {
    const ltr = r % 2 === 0;
    for (let step = 0; step < COLS; step++) {
      const c = ltr ? step : COLS - 1 - step;
      const sym = GRID[r][c];
      const st = `i${r}_${c}`;
      const isLastInRow = step === COLS - 1;
      const isLastCell = r === ROWS - 1 && isLastInRow;

      let dir, next;
      if (isLastCell) {
        dir = 'd';
        next = 'inav0';
      } else if (isLastInRow) {
        dir = 'u';
        const nr = r + 1;
        const nc = (nr % 2 === 0) ? 0 : COLS - 1;
        next = `i${nr}_${nc}`;
      } else {
        dir = ltr ? 'r' : 'l';
        const nc = ltr ? c + 1 : c - 1;
        next = `i${r}_${nc}`;
      }

      lines.push(`${st} _ ${sym} ${dir} ${next}`);
    }
  }

  // Navigate to first data cell (row 1, col 1)
  // After last init cell + 'd' move, head is at (ROWS-2, lastCol)
  // Top row is (ROWS-1): even → L-to-R → lastCol = COLS-1; odd → R-to-L → lastCol = 0
  const topRowLTR = (ROWS - 1) % 2 === 0;
  const downSteps = ROWS - 3;  // from row ROWS-2 down to row 1
  const horzSteps = topRowLTR ? COLS - 2 : 1;
  const horzDir   = topRowLTR ? 'l' : 'r';
  let navIdx = 0;

  for (let i = 0; i < downSteps; i++) {
    lines.push(`inav${navIdx} * * d inav${navIdx + 1}`);
    navIdx++;
  }
  for (let i = 0; i < horzSteps; i++) {
    const next = i === horzSteps - 1 ? 'scan' : `inav${navIdx + 1}`;
    lines.push(`inav${navIdx} * * ${horzDir} ${next}`);
    navIdx++;
  }
  lines.push('');

  // SCAN
  lines.push('; === SCAN: find next unprocessed cell ===');
  lines.push('scan 0 0 * n0_0');
  lines.push('scan 1 1 * n0_0');
  lines.push('scan a a r scan');
  lines.push('scan b b r scan');
  lines.push('scan c c r scan');
  lines.push('scan d d r scan');
  lines.push('scan > > u rup');
  lines.push('');

  // ROW UP
  lines.push('; --- row up: advance to next row ---');
  lines.push('rup > > l rchk');
  lines.push('rup B B l rchk');
  lines.push('rchk ~ ~ * goconv');
  lines.push('rchk * * l rseek');
  lines.push('rseek < < r scan');
  lines.push('rseek * * l rseek');
  lines.push('');

  // NEIGHBOR COUNTING
  lines.push('; === NEIGHBOR COUNTING ===');
  for (let ni = 0; ni < 8; ni++) {
    const nb = NB[ni];
    for (let C = 0; C <= ni; C++) {
      const p = `n${ni}_${C}`;
      const last = ni === 7;
      const nxA = last ? `ap_${C + 1}` : `n${ni + 1}_${C + 1}`;
      const nxD = last ? `ap_${C}`     : `n${ni + 1}_${C}`;

      if (nb.go.length === 1) {
        lines.push(`${p} * * ${nb.go[0]} ${p}_r`);
        for (const a of ALIVE) lines.push(`${p}_r ${a} ${a} ${nb.ret[0]} ${nxA}`);
        lines.push(`${p}_r * * ${nb.ret[0]} ${nxD}`);
      } else {
        lines.push(`${p} * * ${nb.go[0]} ${p}_2`);
        lines.push(`${p}_2 * * ${nb.go[1]} ${p}_r`);
        for (const a of ALIVE) lines.push(`${p}_r ${a} ${a} ${nb.ret[0]} ${p}_a`);
        lines.push(`${p}_r * * ${nb.ret[0]} ${p}_b`);
        lines.push(`${p}_a * * ${nb.ret[1]} ${nxA}`);
        lines.push(`${p}_b * * ${nb.ret[1]} ${nxD}`);
      }
    }
  }
  lines.push('');

  // APPLY RULES
  lines.push('; === APPLY: Game of Life rules ===');
  for (let C = 0; C <= 8; C++) {
    const deadRes  = C === 3            ? 'a' : 'c';
    const aliveRes = C === 2 || C === 3 ? 'b' : 'd';
    lines.push(`ap_${C} 0 ${deadRes} r scan`);
    lines.push(`ap_${C} 1 ${aliveRes} r scan`);
  }
  lines.push('');

  // NAV TO BOTTOM-LEFT FOR CONVERSION
  lines.push('; --- navigate to bottom-left, start conversion ---');
  lines.push('goconv ~ ~ l goconv');
  lines.push('goconv A A d gocd');
  lines.push('gocd < < d gocd');
  lines.push('gocd C C r gocr');
  lines.push('gocr ~ ~ u conv');
  lines.push('');

  // CONVERSION SWEEP
  lines.push('; --- conversion sweep ---');
  lines.push('conv a 1 r conv');
  lines.push('conv b 1 r conv');
  lines.push('conv c 0 r conv');
  lines.push('conv d 0 r conv');
  lines.push('conv 0 0 r conv');
  lines.push('conv 1 1 r conv');
  lines.push('conv > > u crow');
  lines.push('');

  // CONVERSION ROW ADVANCE
  lines.push('crow > > l clft');
  lines.push('crow B B * gosc');
  lines.push('clft < < r conv');
  lines.push('clft * * l clft');
  lines.push('');

  // NAV TO BOTTOM-LEFT FOR NEXT GEN
  lines.push('; --- navigate to bottom-left, start next gen ---');
  lines.push('gosc B B l gosc');
  lines.push('gosc ~ ~ l gosc');
  lines.push('gosc A A d gosd');
  lines.push('gosd < < d gosd');
  lines.push('gosd C C r gosr');
  lines.push('gosr ~ ~ u scan');

  return lines.join('\n');
}

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

document.getElementById('btn-export').addEventListener('click', async () => {
  const btn = document.getElementById('btn-export');
  btn.textContent = 'Generating...';

  try {
    const program = generateGoLTMProgram(W, H);
    const p = await compress(program);
    const params = new URLSearchParams({ p });
    params.set('t', '');
    params.set('s', 'i0_0');

    const url = '../turing-simulation/2d/index.html#' + params.toString();
    window.open(url, '_blank');
  } finally {
    btn.textContent = 'Export to 2D Turing Machine';
  }
});

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') { e.preventDefault(); doRun(); }
  if (e.key === 'n' || e.key === 'ArrowRight') {
    stopRun(); step(); render();
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

init(20, 20);
render();
