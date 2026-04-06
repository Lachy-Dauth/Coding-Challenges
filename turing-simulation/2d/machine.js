// ─── Parser ───────────────────────────────────────────────────────────────────

function parseProgram(src) {
  const rules = [];
  const errors = [];
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineNum = i + 1;

    // Check for breakpoint marker
    let breakpoint = false;
    if (line.trimEnd().endsWith('!')) {
      breakpoint = true;
      line = line.trimEnd().slice(0, -1);
    }

    // Strip comment
    const commentIdx = line.indexOf(';');
    if (commentIdx !== -1) line = line.slice(0, commentIdx);

    line = line.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length !== 5) {
      errors.push(`Line ${lineNum}: expected 5 tokens, got ${parts.length}`);
      continue;
    }

    const [state, symbol, newSymbol, dir, newState] = parts;

    if (!['l', 'r', 'u', 'd', '*'].includes(dir)) {
      errors.push(`Line ${lineNum}: direction must be l, r, u, d, or *`);
      continue;
    }

    rules.push({ state, symbol, newSymbol, dir, newState, breakpoint, lineNum });
  }

  return { rules, errors };
}

function matchRule(rules, state, symbol) {
  // Priority: exact+exact > exact+wildcard > wildcard+exact > wildcard+wildcard
  const priorities = [
    r => r.state === state  && r.symbol === symbol,
    r => r.state === state  && r.symbol === '*',
    r => r.state === '*'    && r.symbol === symbol,
    r => r.state === '*'    && r.symbol === '*',
  ];
  for (const pred of priorities) {
    const found = rules.find(pred);
    if (found) return found;
  }
  return null;
}

// ─── Machine ──────────────────────────────────────────────────────────────────

const BLANK = ' '; // space internally; '_' in user-facing display

class TuringMachine2D {
  constructor() {
    this.tape    = new Map(); // key: "row,col" → char
    this.row     = 0;
    this.col     = 0;
    this.state   = '';
    this.steps   = 0;
    this.rules   = [];
    this.halted  = false;
    this.history = [];
  }

  load(rules, tapeStr, initState) {
    this.rules = rules;
    this.tape  = new Map();

    let headRow = 0;
    let headCol = 0;

    if (tapeStr.includes('|')) {
      // Multi-row format: row0|row1|row2|...  (* marks head position)
      const rows = tapeStr.split('|');
      for (let r = 0; r < rows.length; r++) {
        let row = rows[r];
        const si = row.indexOf('*');
        if (si !== -1) {
          headRow = r;
          headCol = si;
          row = row.slice(0, si) + row.slice(si + 1);
        }
        for (let c = 0; c < row.length; c++) {
          const ch = row[c] === '_' ? BLANK : row[c];
          if (ch !== BLANK) this.tape.set(`${r},${c}`, ch);
        }
      }
    } else {
      // Single-row format (original)
      const si = tapeStr.indexOf('*');
      if (si !== -1) {
        headCol = si;
        tapeStr = tapeStr.slice(0, si) + tapeStr.slice(si + 1);
      }
      for (let c = 0; c < tapeStr.length; c++) {
        const ch = tapeStr[c] === '_' ? BLANK : tapeStr[c];
        if (ch !== BLANK) this.tape.set(`0,${c}`, ch);
      }
      if (tapeStr.length > 0) headCol = Math.min(headCol, tapeStr.length - 1);
    }

    this.row     = headRow;
    this.col     = headCol;
    this.state   = initState;
    this.steps   = 0;
    this.halted  = false;
    this.history = [];
  }

  get(row, col) {
    return this.tape.get(`${row},${col}`) ?? BLANK;
  }

  set(row, col, ch) {
    if (ch === BLANK) {
      this.tape.delete(`${row},${col}`);
    } else {
      this.tape.set(`${row},${col}`, ch);
    }
  }

  // Returns: 'ok' | 'halted' | 'no-rule' | 'breakpoint'
  step() {
    if (this.halted) return 'halted';

    const sym    = this.get(this.row, this.col);
    const symKey = (sym === BLANK) ? '_' : sym;
    const rule   = matchRule(this.rules, this.state, symKey);

    if (!rule) return 'no-rule';

    const readDisplay  = symKey;
    const rawWrite     = rule.newSymbol === '*' ? sym
                       : rule.newSymbol === '_'  ? BLANK
                       : rule.newSymbol;
    const writeDisplay = (rawWrite === BLANK) ? '_' : rawWrite;
    const newState     = rule.newState === '*' ? this.state : rule.newState;

    this.set(this.row, this.col, rawWrite);

    this.history.push({
      step: this.steps + 1,
      state: this.state,
      read: readDisplay,
      write: writeDisplay,
      dir: rule.dir,
      newState,
      row: this.row,
      col: this.col,
      rule,
    });

    // Move head — boundary clamping at row 0 and col 0
    switch (rule.dir) {
      case 'l': this.col = Math.max(0, this.col - 1); break;
      case 'r': this.col++; break;
      case 'u': this.row++; break;
      case 'd': this.row = Math.max(0, this.row - 1); break;
      // '*' = stay
    }

    this.state  = newState;
    this.steps++;
    this.halted = this.state.startsWith('halt');

    if (this.halted)       return 'halted';
    if (rule.breakpoint)   return 'breakpoint';
    return 'ok';
  }
}
