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

    if (!['l', 'r', '*'].includes(dir)) {
      errors.push(`Line ${lineNum}: direction must be l, r, or *`);
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

class TuringMachine {
  constructor() {
    this.tape    = [];
    this.head    = 0;
    this.state   = '';
    this.steps   = 0;
    this.rules   = [];
    this.halted  = false;
    this.history = [];
  }

  load(rules, tapeStr, initState) {
    this.rules = rules;

    // '*' in tape input marks head start position
    let headPos = 0;
    const starIdx = tapeStr.indexOf('*');
    if (starIdx !== -1) {
      headPos = starIdx;
      tapeStr = tapeStr.slice(0, starIdx) + tapeStr.slice(starIdx + 1);
    }

    this.tape    = tapeStr.split('').map(c => c === '_' ? BLANK : c);
    if (this.tape.length === 0) this.tape = [BLANK];

    this.head    = Math.min(headPos, this.tape.length - 1);
    this.state   = initState;
    this.steps   = 0;
    this.halted  = false;
    this.history = [];
  }

  get(i) {
    return this.tape[i] ?? BLANK;
  }

  // Extend tape leftward if i < 0, shifting all indices.
  set(i, ch) {
    if (i < 0) {
      const shift = -i;
      for (let k = 0; k < shift; k++) this.tape.unshift(BLANK);
      this.head += shift;
      i = 0;
    }
    while (i >= this.tape.length) this.tape.push(BLANK);
    this.tape[i] = ch;
  }

  // Returns: 'ok' | 'halted' | 'no-rule' | 'breakpoint'
  step() {
    if (this.halted) return 'halted';

    const sym  = this.get(this.head);
    const symKey = (sym === BLANK) ? '_' : sym;
    const rule = matchRule(this.rules, this.state, symKey);

    if (!rule) return 'no-rule';

    const readDisplay  = symKey;
    const rawWrite     = rule.newSymbol === '*' ? sym
                       : rule.newSymbol === '_'  ? BLANK
                       : rule.newSymbol;
    const writeDisplay = (rawWrite === BLANK) ? '_' : rawWrite;
    const newState     = rule.newState === '*' ? this.state : rule.newState;

    this.set(this.head, rawWrite);

    this.history.push({
      step: this.steps + 1,
      state: this.state,
      read: readDisplay,
      write: writeDisplay,
      dir: rule.dir,
      newState,
      head: this.head,
      rule,
    });

    if      (rule.dir === 'l') this.head--;
    else if (rule.dir === 'r') this.head++;

    // Extend right if needed
    while (this.head >= this.tape.length) this.tape.push(BLANK);
    // Extend left if head went negative
    if (this.head < 0) {
      this.tape.unshift(BLANK);
      this.head = 0;
    }

    this.state  = newState;
    this.steps++;
    this.halted = this.state.startsWith('halt');

    if (this.halted)       return 'halted';
    if (rule.breakpoint)   return 'breakpoint';
    return 'ok';
  }
}
