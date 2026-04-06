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

// Standalone matchRule — kept for external callers (tests, converters)
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
    this.ruleMap = null;
    this.halted  = false;
    this.history = [];
    this.recording = true;
  }

  // Build O(1) lookup map keyed by "state\0symbol"
  // First rule per key wins (matches Array.find semantics)
  _buildRuleMap(rules) {
    const map = new Map();
    for (const rule of rules) {
      const key = rule.state + '\0' + rule.symbol;
      if (!map.has(key)) map.set(key, rule);
    }
    this.ruleMap = map;
  }

  // O(1) rule lookup — 4 Map.get calls instead of up to 4×R array scans
  _matchRule(state, symbol) {
    const m = this.ruleMap;
    return m.get(state + '\0' + symbol)
        ?? m.get(state + '\0*')
        ?? m.get('*\0' + symbol)
        ?? m.get('*\0*')
        ?? null;
  }

  load(rules, tapeStr, initState) {
    this.rules = rules;
    this._buildRuleMap(rules);

    // Tokenize: space-delimited if spaces present, else char-by-char
    let tokens = tapeStr.includes(' ')
      ? tapeStr.trim().split(/\s+/)
      : tapeStr.split('').filter(c => c !== '');

    // '*' token marks head start position
    let headPos = 0;
    const starIdx = tokens.indexOf('*');
    if (starIdx !== -1) {
      headPos = starIdx;
      tokens.splice(starIdx, 1);
    }

    this.tape    = tokens.map(t => t === '_' ? BLANK : t);
    if (this.tape.length === 0) this.tape = [BLANK];

    this.head    = Math.min(headPos, this.tape.length - 1);
    this.state   = initState;
    this.steps   = 0;
    this.halted  = false;
    this.history = [];
    this.recording = true;
  }

  get(i) {
    return (i >= 0 && i < this.tape.length) ? this.tape[i] : BLANK;
  }

  // Extend tape leftward if i < 0, shifting all indices.
  set(i, ch) {
    if (i < 0) {
      const grow = Math.max(-i, this.tape.length, 64);
      const oldLen = this.tape.length;
      const newTape = new Array(grow + oldLen);
      for (let j = 0; j < grow; j++) newTape[j] = BLANK;
      for (let j = 0; j < oldLen; j++) newTape[grow + j] = this.tape[j];
      this.tape = newTape;
      this.head += grow;
      i += grow;
    }
    while (i >= this.tape.length) this.tape.push(BLANK);
    this.tape[i] = ch;
  }

  // Returns: 'ok' | 'halted' | 'no-rule' | 'breakpoint'
  step() {
    if (this.halted) return 'halted';

    // Inline tape read (avoid method-call overhead)
    const head = this.head;
    const tape = this.tape;
    const sym = head < tape.length ? tape[head] : BLANK;
    const symKey = sym === BLANK ? '_' : sym;

    // O(1) Map lookup instead of O(R) linear scan
    const rule = this._matchRule(this.state, symKey);
    if (!rule) return 'no-rule';

    const rawWrite = rule.newSymbol === '*' ? sym
                   : rule.newSymbol === '_' ? BLANK
                   : rule.newSymbol;
    const newState = rule.newState === '*' ? this.state : rule.newState;

    // Inline tape write
    if (head >= tape.length) {
      while (head >= tape.length) tape.push(BLANK);
    }
    tape[head] = rawWrite;

    // Only allocate history entry when recording
    if (this.recording) {
      this.history.push({
        step: this.steps + 1,
        state: this.state,
        read: symKey,
        write: rawWrite === BLANK ? '_' : rawWrite,
        dir: rule.dir,
        newState,
        head,
        rule,
      });
    }

    // Move head
    const dir = rule.dir;
    if (dir === 'r') {
      this.head = head + 1;
      if (this.head >= tape.length) tape.push(BLANK);
    } else if (dir === 'l') {
      this.head = head - 1;
      // Amortized leftward growth: double the tape instead of O(N) unshift
      if (this.head < 0) {
        const oldLen = tape.length;
        const grow = Math.max(1, oldLen, 64);
        const newTape = new Array(grow + oldLen);
        for (let j = 0; j < grow; j++) newTape[j] = BLANK;
        for (let j = 0; j < oldLen; j++) newTape[grow + j] = tape[j];
        this.tape = newTape;
        this.head += grow;
      }
    }

    this.state  = newState;
    this.steps++;
    this.halted = newState.startsWith('halt');

    if (this.halted)       return 'halted';
    if (rule.breakpoint)   return 'breakpoint';
    return 'ok';
  }
}
