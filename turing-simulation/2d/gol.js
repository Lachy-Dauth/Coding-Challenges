// ─── Game of Life Program Generator ──────────────────────────────────────────
//
// Grid symbols:
//   Data:    0 = dead, 1 = alive
//   Marked:  a = born, b = survive, c = stay-dead, d = die
//   Borders: A(TL) ~(top/bottom) B(TR) <(left) >(right) C(BL) D(BR)
//
// Counting: 1/b/d count as "alive" (were alive this gen)
//           everything else counts as "dead"
//
// Phases:
//   0. INIT: draw bordered grid with blinker on blank tape
//   1. SCAN left-to-right, bottom-to-top
//   2. For each 0/1 cell, COUNT 8 neighbors (count in state name)
//   3. APPLY GoL rules → mark cell a/b/c/d
//   4. After all cells, CONVERT a→1 b→1 c→0 d→0
//   5. Return to bottom-left, repeat from 1

function generateGoLProgram() {
  const lines = [];
  const ALIVE = ['1', 'b', 'd'];

  // Neighbor directions: [go moves, return moves]
  const NB = [
    { go: ['u'],     ret: ['d']     },  // 0: up
    { go: ['u','r'], ret: ['l','d'] },  // 1: up-right
    { go: ['r'],     ret: ['l']     },  // 2: right
    { go: ['d','r'], ret: ['l','u'] },  // 3: down-right
    { go: ['d'],     ret: ['u']     },  // 4: down
    { go: ['d','l'], ret: ['r','u'] },  // 5: down-left
    { go: ['l'],     ret: ['r']     },  // 6: left
    { go: ['u','l'], ret: ['r','d'] },  // 7: up-left
  ];

  // 5x5 data grid with borders (7x7 total), vertical blinker at col 3
  //   Row 6: A ~ ~ ~ ~ ~ B
  //   Row 5: < 0 0 0 0 0 >
  //   Row 4: < 0 0 1 0 0 >
  //   Row 3: < 0 0 1 0 0 >
  //   Row 2: < 0 0 1 0 0 >
  //   Row 1: < 0 0 0 0 0 >
  //   Row 0: C ~ ~ ~ ~ ~ D
  const GRID = [
    'C~~~~~D',
    '<00000>',
    '<00100>',
    '<00100>',
    '<00100>',
    '<00000>',
    'A~~~~~B',
  ];
  const ROWS = GRID.length;
  const COLS = GRID[0].length;

  lines.push("; Conway's Game of Life - 2D Turing Machine");
  lines.push('; 0=dead 1=alive | a=born b=survive c=stay-dead d=die');
  lines.push('; Borders: A(TL) ~(T/B) B(TR) <(L) >(R) C(BL) D(BR)');
  lines.push('');

  // === INIT: draw grid on blank tape ===
  // Zigzag: even rows L→R, odd rows R→L — avoids rewinding
  lines.push('; === INIT: draw bordered grid with blinker ===');
  for (let r = 0; r < ROWS; r++) {
    const ltr = r % 2 === 0;
    for (let step = 0; step < COLS; step++) {
      const c = ltr ? step : COLS - 1 - step;
      const sym = GRID[r][c];
      const st = `i${r}${c}`;
      const isLastInRow = step === COLS - 1;
      const isLastCell = r === ROWS - 1 && isLastInRow;

      let dir, next;
      if (isLastCell) {
        // Last cell: start navigating down to (1,1)
        dir = 'd';
        next = 'inav0';
      } else if (isLastInRow) {
        // End of row: move up
        dir = 'u';
        const nr = r + 1;
        const nc = (nr % 2 === 0) ? 0 : COLS - 1;
        next = `i${nr}${nc}`;
      } else {
        dir = ltr ? 'r' : 'l';
        const nc = ltr ? c + 1 : c - 1;
        next = `i${r}${nc}`;
      }

      lines.push(`${st} _ ${sym} ${dir} ${next}`);
    }
  }
  // Navigate from (5,6) to (1,1): 4 down + 5 left
  for (let i = 0; i < 4; i++) {
    lines.push(`inav${i} * * d inav${i + 1}`);
  }
  for (let i = 4; i < 9; i++) {
    const next = i === 8 ? 'scan' : `inav${i + 1}`;
    lines.push(`inav${i} * * l ${next}`);
  }
  lines.push('');

  // === SCAN ===
  lines.push('; === SCAN: find next unprocessed cell ===');
  lines.push('scan 0 0 * n0_0');
  lines.push('scan 1 1 * n0_0');
  lines.push('scan a a r scan');
  lines.push('scan b b r scan');
  lines.push('scan c c r scan');
  lines.push('scan d d r scan');
  lines.push('scan > > u rup');
  lines.push('');

  // === ROW UP ===
  lines.push('; --- row up: advance to next row ---');
  lines.push('rup > > l rchk');
  lines.push('rup B B l rchk');
  lines.push('rchk ~ ~ * goconv');
  lines.push('rchk * * l rseek');
  lines.push('rseek < < r scan');
  lines.push('rseek * * l rseek');
  lines.push('');

  // === NEIGHBOR COUNTING ===
  lines.push('; === NEIGHBOR COUNTING ===');
  for (let ni = 0; ni < 8; ni++) {
    const nb = NB[ni];
    for (let C = 0; C <= ni; C++) {
      const p = `n${ni}_${C}`;
      const last = ni === 7;
      const nxA = last ? `ap_${C + 1}` : `n${ni + 1}_${C + 1}`;
      const nxD = last ? `ap_${C}`     : `n${ni + 1}_${C}`;

      if (nb.go.length === 1) {
        // Cardinal neighbor: 1 move out, read, 1 move back
        lines.push(`${p} * * ${nb.go[0]} ${p}_r`);
        for (const a of ALIVE) lines.push(`${p}_r ${a} ${a} ${nb.ret[0]} ${nxA}`);
        lines.push(`${p}_r * * ${nb.ret[0]} ${nxD}`);
      } else {
        // Diagonal neighbor: 2 moves out, read, 2 moves back
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

  // === APPLY RULES ===
  lines.push('; === APPLY: Game of Life rules ===');
  for (let C = 0; C <= 8; C++) {
    const deadRes  = C === 3               ? 'a' : 'c';
    const aliveRes = C === 2 || C === 3    ? 'b' : 'd';
    lines.push(`ap_${C} 0 ${deadRes} r scan`);
    lines.push(`ap_${C} 1 ${aliveRes} r scan`);
  }
  lines.push('');

  // === NAV TO BOTTOM-LEFT FOR CONVERSION ===
  lines.push('; --- navigate to bottom-left, start conversion ---');
  lines.push('goconv ~ ~ l goconv');
  lines.push('goconv A A d gocd');
  lines.push('gocd < < d gocd');
  lines.push('gocd C C r gocr');
  lines.push('gocr ~ ~ u conv');
  lines.push('');

  // === CONVERSION SWEEP ===
  lines.push('; --- conversion sweep ---');
  lines.push('conv a 1 r conv');
  lines.push('conv b 1 r conv');
  lines.push('conv c 0 r conv');
  lines.push('conv d 0 r conv');
  lines.push('conv 0 0 r conv');
  lines.push('conv 1 1 r conv');
  lines.push('conv > > u crow');
  lines.push('');

  // === CONVERSION ROW ADVANCE ===
  lines.push('crow > > l clft');
  lines.push('crow B B * gosc');
  lines.push('clft < < r conv');
  lines.push('clft * * l clft');
  lines.push('');

  // === NAV TO BOTTOM-LEFT FOR NEXT GENERATION ===
  lines.push('; --- navigate to bottom-left, start next gen ---');
  lines.push('gosc B B l gosc');
  lines.push('gosc ~ ~ l gosc');
  lines.push('gosc A A d gosd');
  lines.push('gosd < < d gosd');
  lines.push('gosd C C r gosr');
  lines.push('gosr ~ ~ u scan');

  return lines.join('\n');
}

// ─── Life Demo ───────────────────────────────────────────────────────────────

document.getElementById('btn-life').addEventListener('click', () => {
  document.getElementById('program').value = generateGoLProgram();
  document.getElementById('tape-input').value = '';
  document.getElementById('init-state').value = 'i00';
  updateLineNumbers();
  load();

  // Set speed to max and auto-run
  speedInput.value = '6';
  speedLabel.textContent = SPEED_LABELS[5];
  setTimeout(doRun, 300);
});
