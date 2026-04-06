// ════════════════════════════════════════════════════════════
// BASE AUTOMATA (subclass for NFA, GNFA, PDA, TM, etc.)
// ════════════════════════════════════════════════════════════
class AutomataBase {
  constructor(typeName) {
    this.typeName = typeName;
    this.states = new Map();   // id → {id,x,y,label,isStart,isAccept}
    this._counter = 0;
    this.startState = null;
  }

  _nextId() { return `q${this._counter++}`; }

  addState(x, y, label) {
    const id = this._nextId();
    const s = { id, x, y, label: label ?? id, isStart: false, isAccept: false };
    this.states.set(id, s);
    return s;
  }

  removeState(id) {
    this.states.delete(id);
    if (this.startState === id) this.startState = null;
  }

  setStart(id) {
    if (this.startState) {
      const prev = this.states.get(this.startState);
      if (prev) prev.isStart = false;
    }
    this.startState = id;
    const s = this.states.get(id);
    if (s) s.isStart = true;
  }

  toggleAccept(id) {
    const s = this.states.get(id);
    if (s) s.isAccept = !s.isAccept;
  }

  renameState(id, label) {
    const s = this.states.get(id);
    if (s) s.label = label;
  }

  // Override in subclasses:
  getTransitions()       { return []; }           // [{from,symbol,to}]
  simulate(input)        { return {accepted:false,path:[]}; }
  addTransition()        {}
  removeTransition()     {}
  reset() {
    this.states.clear();
    this.startState = null;
    this._counter = 0;
  }
}

// ════════════════════════════════════════════════════════════
// DFA
// ════════════════════════════════════════════════════════════
class DFA extends AutomataBase {
  constructor() {
    super('DFA');
    this.delta = new Map();   // "from,symbol" → toId
    this.alphabet = new Set();
  }

  addTransition(from, symbol, to) {
    this.delta.set(`${from},${symbol}`, to);
    this.alphabet.add(symbol);
  }

  removeTransition(from, symbol) {
    this.delta.delete(`${from},${symbol}`);
    this._rebuildAlphabet();
  }

  _rebuildAlphabet() {
    this.alphabet.clear();
    for (const k of this.delta.keys()) {
      this.alphabet.add(k.slice(k.indexOf(',') + 1));
    }
  }

  removeState(id) {
    super.removeState(id);
    for (const [k, to] of [...this.delta]) {
      if (k.split(',')[0] === id || to === id) this.delta.delete(k);
    }
    this._rebuildAlphabet();
  }

  getTransitions() {
    return [...this.delta].map(([k, to]) => {
      const ci = k.indexOf(',');
      return { from: k.slice(0, ci), symbol: k.slice(ci + 1), to };
    });
  }

  simulate(input) {
    if (!this.startState)
      return { accepted: false, error: 'No start state defined', path: [] };

    let cur = this.startState;
    const path = [{ state: cur, pos: 0 }];

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const next = this.delta.get(`${cur},${ch}`);
      if (next === undefined)
        return { accepted: false, error: `Dead: no δ(${this.states.get(cur)?.label ?? cur}, '${ch}')`, path, deadAt: i };
      cur = next;
      path.push({ state: cur, pos: i + 1 });
    }

    const fs = this.states.get(cur);
    return { accepted: !!fs?.isAccept, path, finalState: cur };
  }

  reset() {
    super.reset();
    this.delta.clear();
    this.alphabet.clear();
  }
}

// ════════════════════════════════════════════════════════════
// NFA
// ════════════════════════════════════════════════════════════
class NFA extends AutomataBase {
  constructor() {
    super('NFA');
    this.delta = new Map();   // "from,symbol" → Set<toId>
    this.alphabet = new Set();
  }

  addTransition(from, symbol, to) {
    const key = `${from},${symbol}`;
    if (!this.delta.has(key)) this.delta.set(key, new Set());
    this.delta.get(key).add(to);
    if (symbol !== 'ε') this.alphabet.add(symbol);
  }

  removeTransition(from, symbol, to) {
    const key = `${from},${symbol}`;
    if (!this.delta.has(key)) return;
    if (to !== undefined) {
      this.delta.get(key).delete(to);
      if (this.delta.get(key).size === 0) this.delta.delete(key);
    } else {
      this.delta.delete(key);
    }
    this._rebuildAlphabet();
  }

  _rebuildAlphabet() {
    this.alphabet.clear();
    for (const k of this.delta.keys()) {
      const sym = k.slice(k.indexOf(',') + 1);
      if (sym !== 'ε') this.alphabet.add(sym);
    }
  }

  removeState(id) {
    super.removeState(id);
    for (const [k, toSet] of [...this.delta]) {
      const from = k.slice(0, k.indexOf(','));
      if (from === id) {
        this.delta.delete(k);
      } else if (toSet.has(id)) {
        toSet.delete(id);
        if (toSet.size === 0) this.delta.delete(k);
      }
    }
    this._rebuildAlphabet();
  }

  epsilonClosure(stateSet) {
    const closure = new Set(stateSet);
    const stack = [...stateSet];
    while (stack.length > 0) {
      const s = stack.pop();
      const tos = this.delta.get(`${s},ε`);
      if (tos) for (const t of tos) if (!closure.has(t)) { closure.add(t); stack.push(t); }
    }
    return closure;
  }

  move(stateSet, symbol) {
    const result = new Set();
    for (const s of stateSet) {
      const tos = this.delta.get(`${s},${symbol}`);
      if (tos) for (const t of tos) result.add(t);
    }
    return result;
  }

  getTransitions() {
    const result = [];
    for (const [key, toSet] of this.delta) {
      const ci = key.indexOf(',');
      const from = key.slice(0, ci), symbol = key.slice(ci + 1);
      for (const to of toSet) result.push({ from, symbol, to });
    }
    return result;
  }

  simulate(input) {
    if (!this.startState)
      return { accepted: false, error: 'No start state defined', path: [] };

    let current = this.epsilonClosure(new Set([this.startState]));
    const path = [{ states: new Set(current), pos: 0 }];

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      current = this.epsilonClosure(this.move(current, ch));
      path.push({ states: new Set(current), pos: i + 1 });
      if (current.size === 0)
        return { accepted: false, error: `All branches died on '${ch}'`, path };
    }

    const accepted = [...current].some(id => this.states.get(id)?.isAccept);
    return { accepted, path };
  }

  reset() {
    super.reset();
    this.delta = new Map();
    this.alphabet = new Set();
  }
}

// ════════════════════════════════════════════════════════════
// GNFA — regex-labelled transitions, state elimination
// ════════════════════════════════════════════════════════════

// Regex algebra helpers (strings; ∅ = empty language, ε = empty string)
function _rUnion(a, b) {
  if (a === '∅') return b;
  if (b === '∅') return a;
  if (a === b)   return a;
  return `${a}|${b}`;
}
function _rConcat(a, b) {
  if (a === '∅' || b === '∅') return '∅';
  if (a === 'ε') return b;
  if (b === 'ε') return a;
  return `${_rWrap(a)}${_rWrap(b)}`;
}
function _rStar(r) {
  if (r === '∅' || r === 'ε') return 'ε';
  if (r.length === 1) return `${r}*`;
  // Already fully parenthesized — just append *
  if (r[0] === '(' && _rMatchingClose(r, 0) === r.length - 1) return `${r}*`;
  return `(${r})*`;
}
function _rMatchingClose(r, open) {
  // Returns the index of the ')' matching the '(' at index `open`, or -1.
  let depth = 0;
  for (let i = open; i < r.length; i++) {
    if (r[i] === '(') depth++;
    else if (r[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function _rWrap(r) {
  // Wrap in parens only if there is a top-level | (outside balanced parens).
  if (r.length <= 1 || r === 'ε' || r === '∅') return r;
  // Already fully parenthesized — no extra layer needed
  if (r[0] === '(' && _rMatchingClose(r, 0) === r.length - 1) return r;
  let depth = 0;
  for (const ch of r) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '|' && depth === 0) return `(${r})`;
  }
  return r;
}

class GNFA extends AutomataBase {
  constructor() {
    super('GNFA');
    this.delta = new Map();   // "from|||to" → regexString
    this._acceptId = null;
  }

  addTransition(from, regexLabel, to) {
    const key = `${from}|||${to}`;
    const existing = this.delta.get(key) ?? '∅';
    this.delta.set(key, _rUnion(existing, regexLabel));
  }

  removeTransition(from, to) {
    this.delta.delete(`${from}|||${to}`);
  }

  getLabel(from, to) { return this.delta.get(`${from}|||${to}`) ?? '∅'; }

  setLabel(from, to, label) {
    this.delta.set(`${from}|||${to}`, label);
  }

  getTransitions() {
    const result = [];
    for (const [key, label] of this.delta) {
      const sep = key.indexOf('|||');
      result.push({ from: key.slice(0, sep), symbol: label, to: key.slice(sep + 3) });
    }
    return result;
  }

  removeState(id) {
    super.removeState(id);
    for (const key of [...this.delta.keys()]) {
      const sep = key.indexOf('|||');
      if (key.slice(0, sep) === id || key.slice(sep + 3) === id) this.delta.delete(key);
    }
    if (this._acceptId === id) this._acceptId = null;
  }

  // ── Build from DFA or NFA ──────────────────────────────────
  static fromAutomata(src) {
    const g = new GNFA();
    g._counter = src._counter;

    // Copy states (strip isStart/isAccept — they become internal nodes)
    for (const [id, s] of src.states)
      g.states.set(id, { ...s, isStart: false, isAccept: false });

    // Bounding box to place qS / qA outside the diagram
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of src.states.values()) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    if (!isFinite(minX)) { minX = 200; maxX = 600; minY = maxY = 300; }
    const cy = (minY + maxY) / 2;

    // New start state qS
    const qS = '_qs';
    g.states.set(qS, { id: qS, x: minX - 140, y: cy, label: 'qS', isStart: true, isAccept: false });
    g.startState = qS;

    // New (unique) accept state qA
    const qA = '_qa';
    g._acceptId = qA;
    g.states.set(qA, { id: qA, x: maxX + 140, y: cy, label: 'qA', isStart: false, isAccept: true });

    // ε: qS → original start
    if (src.startState) g.setLabel(qS, src.startState, 'ε');

    // ε: each old accept → qA
    for (const [id, s] of src.states)
      if (s.isAccept) g.setLabel(id, qA, 'ε');

    // Copy all transitions (union if same edge)
    for (const t of src.getTransitions())
      g.addTransition(t.from, t.symbol, t.to);

    // Fill in ∅ for all missing ordered pairs between distinct states
    const allIds = [...g.states.keys()];
    for (const qi of allIds)
      for (const qj of allIds)
        if (qi !== qj && !g.delta.has(`${qi}|||${qj}`))
          g.setLabel(qi, qj, '∅');

    return g;
  }

  // ── State elimination ──────────────────────────────────────
  getEliminable() {
    return [...this.states.keys()].filter(id => id !== this.startState && id !== this._acceptId);
  }

  eliminate(ripId) {
    const remaining = [...this.states.keys()].filter(id => id !== ripId);
    const r_rr = this.getLabel(ripId, ripId);   // self-loop

    for (const qi of remaining) {
      const r_ir = this.getLabel(qi, ripId);
      if (r_ir === '∅') continue;
      for (const qj of remaining) {
        const r_rj = this.getLabel(ripId, qj);
        if (r_rj === '∅') continue;
        const middle = _rConcat(_rConcat(r_ir, _rStar(r_rr)), r_rj);
        this.setLabel(qi, qj, _rUnion(this.getLabel(qi, qj), middle));
      }
    }

    // Drop all entries touching ripId
    for (const key of [...this.delta.keys()]) {
      const sep = key.indexOf('|||');
      if (key.slice(0, sep) === ripId || key.slice(sep + 3) === ripId) this.delta.delete(key);
    }
    this.states.delete(ripId);
  }

  // Auto-eliminate on a clone and return the regex string
  toRegex() {
    const c = this._clone();
    for (const id of c.getEliminable()) c.eliminate(id);
    return c.getLabel(c.startState, c._acceptId);
  }

  _clone() {
    const c = new GNFA();
    c.startState = this.startState;
    c._acceptId  = this._acceptId;
    c._counter   = this._counter;
    for (const [id, s] of this.states) c.states.set(id, { ...s });
    for (const [k,  v] of this.delta)  c.delta.set(k, v);
    return c;
  }

  reset() {
    super.reset();
    this.delta = new Map();
    this._acceptId = null;
  }
}

// ════════════════════════════════════════════════════════════
// PDA  (nondeterministic, acceptance by final state)
// Transition: (from, inputSym, popSym) → (to, pushStr)
//   inputSym: single char or 'ε' (don't consume input)
//   popSym  : single char or 'ε' (don't check/pop top)
//   pushStr : string of chars or 'ε' (push nothing);
//             leftmost char ends up on top of stack
// Stack is an array; index 0 = top.
// ════════════════════════════════════════════════════════════
class PDA extends AutomataBase {
  constructor() {
    super('PDA');
    this.delta = [];          // [{from, input, pop, push, to}]
    this.alphabet      = new Set();
    this.stackAlphabet = new Set(['Z']);
  }

  addTransition(from, input, pop, push, to) {
    this.delta.push({ from, input, pop, push, to });
    if (input !== 'ε') this.alphabet.add(input);
    if (pop   !== 'ε') this.stackAlphabet.add(pop);
    if (push  !== 'ε') for (const c of push) this.stackAlphabet.add(c);
  }

  removeTransition(idx) {
    this.delta.splice(idx, 1);
    this._rebuildAlphabets();
  }

  _rebuildAlphabets() {
    this.alphabet.clear(); this.stackAlphabet.clear();
    this.stackAlphabet.add('Z');
    for (const t of this.delta) {
      if (t.input !== 'ε') this.alphabet.add(t.input);
      if (t.pop   !== 'ε') this.stackAlphabet.add(t.pop);
      if (t.push  !== 'ε') for (const c of t.push) this.stackAlphabet.add(c);
    }
  }

  removeState(id) {
    super.removeState(id);
    this.delta = this.delta.filter(t => t.from !== id && t.to !== id);
    this._rebuildAlphabets();
  }

  getTransitions() {
    return this.delta.map((t, i) => ({
      from: t.from, to: t.to,
      symbol: `${t.input},${t.pop}/${t.push}`,
      input: t.input, pop: t.pop, push: t.push, idx: i
    }));
  }

  // BFS over (state, inputPos, stack); returns accepted path or empty.
  simulate(inputStr, maxConfigs = 20000) {
    if (!this.startState)
      return { accepted: false, error: 'No start state defined', steps: [] };

    const start = { state: this.startState, pos: 0, stack: ['Z'] };
    const queue = [{ ...start, path: [start] }];
    const visited = new Set();
    const key = c => `${c.state}|${c.pos}|${c.stack.join('\x01')}`;
    visited.add(key(start));

    let explored = 0;
    while (queue.length > 0 && explored < maxConfigs) {
      explored++;
      const { state, pos, stack, path } = queue.shift();

      if (pos === inputStr.length && this.states.get(state)?.isAccept)
        return { accepted: true, steps: path };

      for (const t of this.delta) {
        if (t.from !== state) continue;

        // Input check
        let newPos = pos;
        if (t.input !== 'ε') {
          if (pos >= inputStr.length || inputStr[pos] !== t.input) continue;
          newPos = pos + 1;
        }

        // Pop check
        const newStack = [...stack];
        if (t.pop !== 'ε') {
          if (newStack.length === 0 || newStack[0] !== t.pop) continue;
          newStack.shift();
        }

        // Push (leftmost char on top → prepend reversed)
        if (t.push !== 'ε') {
          for (let i = t.push.length - 1; i >= 0; i--) newStack.unshift(t.push[i]);
        }

        const next = { state: t.to, pos: newPos, stack: newStack };
        const k = key(next);
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push({ ...next, path: [...path, next] });
      }
    }

    return {
      accepted: false, steps: [],
      error: explored >= maxConfigs ? 'Search limit reached — possible infinite loop' : undefined
    };
  }

  reset() {
    super.reset();
    this.delta = [];
    this.alphabet = new Set();
    this.stackAlphabet = new Set(['Z']);
  }
}

// ════════════════════════════════════════════════════════════
// TURING MACHINE
// ════════════════════════════════════════════════════════════
class TuringMachine extends AutomataBase {
  constructor() {
    super('TM');
    this.delta = new Map();   // "stateId,readChar" → {nextState, writeChar, dir}
    this.blank = '_';
    this._rejectId = null;
  }

  // dir: 'L' | 'R' | 'S'
  addTransition(from, readChar, writeChar, dir, to) {
    this.delta.set(`${from},${readChar}`, { nextState: to, writeChar, dir });
  }

  removeTransition(from, readChar) {
    this.delta.delete(`${from},${readChar}`);
  }

  _readChar(key) { return key.slice(key.indexOf(',') + 1); }
  _fromId(key)   { return key.slice(0, key.indexOf(',')); }

  getTransitions() {
    const result = [];
    for (const [key, val] of this.delta) {
      const from = this._fromId(key);
      const rc = this._readChar(key);
      const wc = val.writeChar;
      // Label: r/w,D  (show ⊔ for blank)
      const label = `${rc === this.blank ? '⊔' : rc}/${wc === this.blank ? '⊔' : wc},${val.dir}`;
      result.push({ from, symbol: label, to: val.nextState, readChar: rc, writeChar: wc, dir: val.dir });
    }
    return result;
  }

  removeState(id) {
    super.removeState(id);
    for (const [k, v] of [...this.delta])
      if (this._fromId(k) === id || v.nextState === id) this.delta.delete(k);
    if (this._rejectId === id) this._rejectId = null;
  }

  setReject(id) {
    if (this._rejectId) {
      const prev = this.states.get(this._rejectId);
      if (prev) prev.isReject = false;
    }
    if (this._rejectId === id) { this._rejectId = null; return; } // toggle off
    this._rejectId = id;
    const s = this.states.get(id);
    if (s) s.isReject = true;
  }

  simulate(inputStr, maxSteps = 1000) {
    if (!this.startState)
      return { accepted: false, error: 'No start state defined', steps: [] };

    const tape = new Map();
    for (let i = 0; i < inputStr.length; i++) tape.set(i, inputStr[i]);

    let state = this.startState;
    let head = 0;
    const steps = [{ state, head, tape: new Map(tape) }];

    for (let i = 0; i < maxSteps; i++) {
      const stateObj = this.states.get(state);
      if (stateObj?.isAccept)  return { accepted: true,  steps };
      if (state === this._rejectId) return { accepted: false, steps };

      const rc = tape.get(head) ?? this.blank;
      const trans = this.delta.get(`${state},${rc}`);
      if (!trans)
        return { accepted: false, steps,
          error: `No δ(${stateObj?.label ?? state}, '${rc === this.blank ? '⊔' : rc}')` };

      // Write
      if (trans.writeChar === this.blank) tape.delete(head);
      else tape.set(head, trans.writeChar);

      // Move head
      if (trans.dir === 'L') head--;
      else if (trans.dir === 'R') head++;
      // 'S' = stay

      state = trans.nextState;
      steps.push({ state, head, tape: new Map(tape) });
    }

    return { accepted: false, steps, error: `Exceeded ${maxSteps} steps — possible infinite loop` };
  }

  reset() {
    super.reset();
    this.delta = new Map();
    this._rejectId = null;
  }
}

// ════════════════════════════════════════════════════════════
// GRAPH RENDERER  (Canvas 2D — reusable for all automata types)
// ════════════════════════════════════════════════════════════
class GraphRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.R = 27;
    this._hlStates = new Set();
    this._hlEdges  = [];      // [{from,to}]
    this._classic  = false;
    this.C = this._darkPalette();
    this._zoom = 1.0;
    this._fontSize = 1.0;
  }

  _darkPalette() {
    return {
      bg:'#0d1117', fill:'#1c2128', border:'#388bfd',
      accept:'#3fb950', hl:'#e3b341', sel:'#f85149', hov:'#8957e5',
      txt:'#c9d1d9', edge:'#6e7681', edgeHL:'#e3b341',
      lbl:'#79b8ff', startArr:'#58a6ff', grid:'rgba(255,255,255,.022)',
      hlFill:'rgba(227,179,65,.15)', selFill:'rgba(248,81,73,.15)',
      hovFill:'rgba(137,87,229,.15)', lblBg:'rgba(13,17,23,.88)'
    };
  }

  _classicPalette() {
    return {
      bg:'#ffffff', fill:'#ffffff', border:'#000000',
      accept:'#000000', hl:'#cc6600', sel:'#cc0000', hov:'#555555',
      txt:'#000000', edge:'#000000', edgeHL:'#cc6600',
      lbl:'#000000', startArr:'#000000', grid:'rgba(0,0,0,0)',
      hlFill:'rgba(204,102,0,.08)', selFill:'rgba(200,0,0,.08)',
      hovFill:'rgba(0,0,0,.05)', lblBg:'rgba(255,255,255,.92)'
    };
  }

  setClassic(bool) {
    this._classic = bool;
    this.C = bool ? this._classicPalette() : this._darkPalette();
  }

  setZoom(z) {
    this._zoom = Math.max(0.2, Math.min(4, z));
  }

  setFontSize(f) {
    this._fontSize = Math.max(0.4, Math.min(3, f));
  }

  setHighlight(states = new Set(), edges = []) {
    this._hlStates = states;
    this._hlEdges  = edges;
  }

  render(automata, selected, hovered) {
    const { cv, cx, R } = this;
    const W = cv.width, H = cv.height;

    cx.fillStyle = this.C.bg;
    cx.fillRect(0, 0, W, H);

    cx.save();
    cx.translate(W / 2, H / 2);
    cx.scale(this._zoom, this._zoom);
    cx.translate(-W / 2, -H / 2);

    this._grid(W, H);

    // Group transitions by (from,to) to merge multi-symbol labels
    const edgeMap = new Map();
    for (const t of automata.getTransitions()) {
      const k = `${t.from}→${t.to}`;
      if (!edgeMap.has(k)) edgeMap.set(k, { from: t.from, to: t.to, syms: [] });
      edgeMap.get(k).syms.push(t.symbol);
    }

    for (const e of edgeMap.values()) {
      const fS = automata.states.get(e.from);
      const tS = automata.states.get(e.to);
      if (!fS || !tS) continue;
      const label = automata.typeName === 'PDA' ? e.syms.join('\n') : e.syms.join(', ');
      const hl = this._hlEdges.some(h => h.from === e.from && h.to === e.to);
      const bidir = edgeMap.has(`${e.to}→${e.from}`);
      this._edge(fS, tS, label, hl, bidir);
    }

    for (const [id, s] of automata.states) {
      this._state(s,
        this._hlStates.has(id),
        selected === id,
        hovered === id
      );
    }

    cx.restore();
  }

  _grid(W, H) {
    if (this._classic) return;
    const cx = this.cx;
    cx.fillStyle = this.C.grid;
    for (let x = 30; x < W; x += 40)
      for (let y = 30; y < H; y += 40) {
        cx.beginPath(); cx.arc(x, y, 1.2, 0, Math.PI*2); cx.fill();
      }
  }

  _state(s, hl, sel, hov) {
    const cx = this.cx, R = this.R;
    let fill = this.C.fill;
    let bord = s.isAccept ? this.C.accept : s.isReject ? this.C.sel : this.C.border;

    if (hl)       { fill = this.C.hlFill;  bord = this.C.hl;  }
    else if (sel) { fill = this.C.selFill; bord = this.C.sel; }
    else if (hov) { fill = this.C.hovFill; bord = this.C.hov; }

    cx.shadowColor = bord;
    cx.shadowBlur  = this._classic ? 0 : (hl || sel ? 16 : 5);

    cx.beginPath(); cx.arc(s.x, s.y, R, 0, Math.PI*2);
    cx.fillStyle = fill; cx.fill();
    cx.strokeStyle = bord; cx.lineWidth = sel ? 2.5 : 2; cx.stroke();
    cx.shadowBlur = 0;

    if (s.isAccept) {
      cx.beginPath(); cx.arc(s.x, s.y, R - 5, 0, Math.PI*2);
      cx.strokeStyle = !hl && !sel && !hov ? this.C.accept : bord;
      cx.lineWidth = 1.5; cx.stroke();
    }

    if (s.isReject && !hl && !sel && !hov) {
      // Draw a small X inside reject states
      const x = s.x, y = s.y, d = 7;
      cx.beginPath();
      cx.moveTo(x-d, y-d); cx.lineTo(x+d, y+d);
      cx.moveTo(x+d, y-d); cx.lineTo(x-d, y+d);
      cx.strokeStyle = this.C.sel; cx.lineWidth = 2; cx.stroke();
    }

    if (s.isStart) {
      const ax = s.x - R - 28;
      cx.beginPath(); cx.moveTo(ax, s.y); cx.lineTo(s.x - R - 2, s.y);
      cx.strokeStyle = this.C.startArr; cx.lineWidth = 2; cx.stroke();
      cx.beginPath();
      cx.moveTo(s.x - R - 2, s.y);
      cx.lineTo(s.x - R - 10, s.y - 5);
      cx.lineTo(s.x - R - 10, s.y + 5);
      cx.closePath(); cx.fillStyle = this.C.startArr; cx.fill();
    }

    cx.fillStyle = hl ? this.C.hl : this.C.txt;
    cx.font = `bold ${Math.round(13 * this._fontSize)}px monospace`;
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(s.label, s.x, s.y);
  }

  _edge(f, t, label, hl, bidir) {
    if (f.id === t.id) { this._selfLoop(f, label, hl); return; }
    if (bidir) this._curved(f, t, label, hl);
    else       this._straight(f, t, label, hl);
  }

  _straight(f, t, label, hl) {
    const cx = this.cx, R = this.R;
    const dx = t.x - f.x, dy = t.y - f.y;
    const d = Math.hypot(dx, dy), nx = dx/d, ny = dy/d;
    const sx = f.x + nx*R, sy = f.y + ny*R;
    const ex = t.x - nx*R, ey = t.y - ny*R;

    cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(ex, ey);
    cx.strokeStyle = hl ? this.C.edgeHL : this.C.edge;
    cx.lineWidth = hl ? 2 : 1.5; cx.stroke();
    this._arrow(ex, ey, Math.atan2(dy, dx), hl);
    this._label(label, (sx+ex)/2 - ny*16, (sy+ey)/2 + nx*16, hl);
  }

  _curved(f, t, label, hl) {
    const cx = this.cx, R = this.R;
    const dx = t.x - f.x, dy = t.y - f.y;
    const d = Math.hypot(dx, dy);
    const ny = -dx/d, nx = dy/d;  // perpendicular (swap+negate)
    const off = 42;
    const cpx = (f.x+t.x)/2 + nx*off;
    const cpy = (f.y+t.y)/2 + ny*off;

    const sa = Math.atan2(cpy - f.y, cpx - f.x);
    const ea = Math.atan2(t.y  - cpy, t.x  - cpx);
    const sx = f.x + Math.cos(sa)*R, sy = f.y + Math.sin(sa)*R;
    const ex = t.x - Math.cos(ea)*R, ey = t.y - Math.sin(ea)*R;

    cx.beginPath(); cx.moveTo(sx, sy);
    cx.quadraticCurveTo(cpx, cpy, ex, ey);
    cx.strokeStyle = hl ? this.C.edgeHL : this.C.edge;
    cx.lineWidth = hl ? 2 : 1.5; cx.stroke();
    this._arrow(ex, ey, ea, hl);
    this._label(label, cpx, cpy, hl);
  }

  _selfLoop(s, label, hl) {
    const cx = this.cx, R = this.R;
    const ly = s.y - R - 20, lr = 18;

    cx.beginPath();
    cx.arc(s.x, ly, lr, Math.PI * 0.5, Math.PI * 0.95 * 2.4);
    cx.strokeStyle = hl ? this.C.edgeHL : this.C.edge;
    cx.lineWidth = hl ? 2 : 1.5; cx.stroke();

    const aAngle = Math.PI * 0.97 * 2.4;
    const ax = s.x + lr * Math.cos(aAngle);
    const ay = ly  + lr * Math.sin(aAngle);
    this._arrow(ax, ay, aAngle + Math.PI/2, hl);

    this._label(label, s.x, ly - lr - 4, hl);
  }

  _arrow(x, y, angle, hl) {
    const cx = this.cx, sz = 7;
    cx.save(); cx.translate(x, y); cx.rotate(angle);
    cx.beginPath();
    cx.moveTo(0, 0); cx.lineTo(-sz, -sz*.45); cx.lineTo(-sz, sz*.45);
    cx.closePath();
    cx.fillStyle = hl ? this.C.edgeHL : this.C.edge; cx.fill();
    cx.restore();
  }

  _label(text, x, y, hl) {
    const cx = this.cx;
    const fs = Math.round(12 * this._fontSize);
    cx.font = `${fs}px monospace`;
    const lines = text.split('\n');
    const lineH = Math.round(15 * this._fontSize);
    const w = Math.max(...lines.map(l => cx.measureText(l).width));
    const totalH = lineH * lines.length;
    cx.fillStyle = this.C.lblBg;
    cx.fillRect(x - w/2 - 4, y - totalH/2 - 2, w + 8, totalH + 4);
    cx.fillStyle = hl ? this.C.edgeHL : this.C.lbl;
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      cx.fillText(line, x, y + (i - (lines.length - 1) / 2) * lineH);
    });
  }

  // ── Hit-testing ──

  stateAt(px, py, states) {
    for (const [, s] of states)
      if (Math.hypot(px - s.x, py - s.y) <= this.R) return s;
    return null;
  }

  /** Returns edge object {from, to, syms} if (px,py) is near a transition label, else null */
  transitionAt(px, py, automata) {
    const edgeMap = new Map();
    for (const t of automata.getTransitions()) {
      const k = `${t.from}→${t.to}`;
      if (!edgeMap.has(k)) edgeMap.set(k, { from: t.from, to: t.to, syms: [] });
      edgeMap.get(k).syms.push(t.symbol);
    }

    for (const e of edgeMap.values()) {
      const fS = automata.states.get(e.from);
      const tS = automata.states.get(e.to);
      if (!fS || !tS) continue;
      const bidir = edgeMap.has(`${e.to}→${e.from}`);
      const lp = this._labelPos(fS, tS, bidir);
      // Generous hit radius (label text + padding)
      if (Math.hypot(px - lp.x, py - lp.y) < 22) return e;
    }
    return null;
  }

  /** Returns the canvas position of a transition's label — must mirror _straight/_curved/_selfLoop */
  _labelPos(f, t, bidir) {
    const R = this.R;
    if (f.id === t.id) {
      // Self-loop
      const ly = f.y - R - 20, lr = 18;
      return { x: f.x, y: ly - lr - 4 };
    }
    if (bidir) {
      // Curved (matches _curved)
      const dx = t.x - f.x, dy = t.y - f.y;
      const d  = Math.hypot(dx, dy);
      const nx = dy/d, ny = -dx/d;   // perpendicular
      return { x: (f.x+t.x)/2 + nx*42, y: (f.y+t.y)/2 + ny*42 };
    }
    // Straight
    const dx = t.x - f.x, dy = t.y - f.y;
    const d  = Math.hypot(dx, dy), nx = dx/d, ny = dy/d;
    return { x: (f.x+t.x)/2 - ny*16, y: (f.y+t.y)/2 + nx*16 };
  }

  /** Draw the "linking" preview: dashed line from srcState to mouse */
  drawLinkPreview(srcState, mx, my) {
    const cx = this.cx, R = this.R;
    const W = this.cv.width, H = this.cv.height;
    const dx = mx - srcState.x, dy = my - srcState.y;
    const d = Math.hypot(dx, dy);
    if (d < R + 2) return;   // don't draw inside the state circle

    const angle = Math.atan2(dy, dx);
    const sx = srcState.x + Math.cos(angle) * R;
    const sy = srcState.y + Math.sin(angle) * R;

    // Apply same zoom as render()
    cx.save();
    cx.translate(W / 2, H / 2);
    cx.scale(this._zoom, this._zoom);
    cx.translate(-W / 2, -H / 2);

    cx.setLineDash([7, 4]);
    cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(mx, my);
    cx.strokeStyle = this.C.edgeHL;
    cx.lineWidth = 2;
    cx.globalAlpha = 0.8;
    cx.stroke();
    cx.setLineDash([]);

    // Arrowhead at mouse
    cx.translate(mx, my); cx.rotate(angle);
    cx.beginPath();
    cx.moveTo(0,0); cx.lineTo(-9,-4); cx.lineTo(-9, 4);
    cx.closePath();
    cx.fillStyle = this.C.edgeHL; cx.fill();
    cx.restore();
  }
}

// ════════════════════════════════════════════════════════════
// CFG  (Context-Free Grammar)
// ════════════════════════════════════════════════════════════
class CFG {
  constructor() {
    this.variables    = [];
    this.terminals    = new Set();
    this.productions  = new Map(); // varName → string[][]
    this.startVariable = null;
  }

  parse(text) {
    this.variables    = [];
    this.terminals    = new Set();
    this.productions  = new Map();
    this.startVariable = null;

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('//') && !l.startsWith('#'));

    if (!lines.length) throw new Error('Empty input — enter at least one production rule.');

    for (const line of lines) {
      const m = line.match(/^([A-Z][A-Za-z0-9₀-₉']*)\s*(?:->|→)\s*(.+)$/u);
      if (!m) throw new Error(`Cannot parse rule: "${line}"`);
      const varName = m[1];
      const rhsRaw  = m[2];

      if (!this.productions.has(varName)) {
        this.variables.push(varName);
        this.productions.set(varName, []);
      }

      for (const alt of rhsRaw.split('|')) {
        this.productions.get(varName).push(this._parseBody(alt.trim()));
      }
    }

    this.startVariable = this.variables[0];

    for (const [, bodies] of this.productions) {
      for (const body of bodies) {
        for (const sym of body) {
          if (!this._isVariable(sym) && sym !== 'ε') this.terminals.add(sym);
        }
      }
    }
  }

  _parseBody(bodyStr) {
    const s = bodyStr.trim();
    if (s === 'ε' || s === '' || s.toLowerCase() === 'eps' || s.toLowerCase() === 'epsilon')
      return ['ε'];

    const tokens = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === ' ') { i++; continue; }
      if (/[A-Z]/u.test(s[i])) {
        let j = i + 1;
        // Continue with lowercase, digits, subscripts, primes — NOT more uppercase
        // (so AB = two variables A and B, not variable named AB)
        while (j < s.length && /[a-z0-9₀-₉']/u.test(s[j])) j++;
        tokens.push(s.slice(i, j));
        i = j;
      } else {
        tokens.push(s[i]);
        i++;
      }
    }
    return tokens.length ? tokens : ['ε'];
  }

  _isVariable(sym) {
    return /^[A-Z]/u.test(sym);
  }

  clone() {
    const g = new CFG();
    g.variables     = [...this.variables];
    g.terminals     = new Set(this.terminals);
    g.startVariable = this.startVariable;
    g.productions   = new Map();
    for (const [v, bodies] of this.productions) {
      g.productions.set(v, bodies.map(b => [...b]));
    }
    return g;
  }

  toCNF() {
    const steps = [];

    steps.push({
      name       : 'ORIGINAL',
      title      : 'Original Grammar',
      description: 'This is your input grammar before any transformations. We will convert it to Chomsky Normal Form (CNF) step by step, following Sipser\'s procedure (Theorem 2.9). In CNF every rule has the form A → BC (two variables) or A → a (one terminal).',
      grammar    : this.clone(),
      added      : new Set(),
      modified   : new Set(),
      removed    : new Set()
    });

    // Step 1: START
    let g = this.clone();
    const oldStart = g.startVariable;

    // Only add S₀ if the old start variable appears on some RHS
    const startOnRhs = [...g.productions.values()].some(
      bodies => bodies.some(body => body.includes(oldStart))
    );

    let startAdded = new Set();
    let startDesc;
    if (startOnRhs) {
      let newStart = 'S\u2080'; // S₀
      if (g.variables.includes(newStart)) newStart = "S'";
      if (g.variables.includes(newStart)) {
        let k = 0;
        while (g.variables.includes(`S${k}`)) k++;
        newStart = `S${k}`;
      }
      g.variables.unshift(newStart);
      g.productions.set(newStart, [[oldStart]]);
      g.startVariable = newStart;
      startAdded = new Set([`${newStart}:${oldStart}`]);
      startDesc = `Added new start variable ${newStart} → ${oldStart} because ${oldStart} appears on the right-hand side of a rule. This ensures the start variable never appears on any RHS, which is required by CNF.`;
    } else {
      startDesc = `${oldStart} never appears on the right-hand side of any rule, so no new start variable is needed. Step ADD START is a no-op.`;
    }

    steps.push({
      name       : 'ADD START',
      title      : 'Step 1: Add New Start Variable',
      description: startDesc,
      grammar    : g.clone(),
      added      : startAdded,
      modified   : new Set(),
      removed    : new Set()
    });

    // Step 2: DEL
    g = g.clone();
    const delResult = _cfgRemoveEpsilon(g);
    steps.push({
      name       : 'DEL',
      title      : 'Step 2: Remove ε-Productions',
      description: delResult.description,
      grammar    : g.clone(),
      added      : delResult.added,
      modified   : new Set(),
      removed    : delResult.removed
    });

    // Step 3: UNIT
    g = g.clone();
    const unitResult = _cfgRemoveUnit(g);
    steps.push({
      name       : 'UNIT',
      title      : 'Step 3: Remove Unit Productions',
      description: unitResult.description,
      grammar    : g.clone(),
      added      : unitResult.added,
      modified   : new Set(),
      removed    : unitResult.removed
    });

    // Step 4: TERM
    g = g.clone();
    const termResult = _cfgAddTermVars(g);
    steps.push({
      name       : 'TERM',
      title      : 'Step 4: Replace Terminals in Mixed/Long Rules',
      description: termResult.description,
      grammar    : g.clone(),
      added      : termResult.added,
      modified   : termResult.modified,
      removed    : new Set()
    });

    // Step 5: BIN
    g = g.clone();
    const binResult = _cfgBinarize(g);
    steps.push({
      name       : 'BIN (CNF)',
      title      : 'Step 5: Binarize Long Rules — Grammar is now in CNF',
      description: binResult.description,
      grammar    : g.clone(),
      added      : binResult.added,
      modified   : new Set(),
      removed    : binResult.removed
    });

    // Step 6: SOLUTION — clean view of the final CNF grammar
    const cnfRules = [];
    for (const v of g.variables) {
      for (const body of (g.productions.get(v) ?? [])) {
        cnfRules.push(`${v} → ${body.join(' ')}`);
      }
    }
    steps.push({
      name       : 'SOLUTION',
      title      : 'Final CNF Grammar',
      description: `Your grammar is now in Chomsky Normal Form. Every rule is either A → BC (two variables) or A → a (one terminal)${g.startVariable !== oldStart ? `, with start variable ${g.startVariable}` : ''}. Rules: ${cnfRules.join(' ; ')}.`,
      grammar    : g.clone(),
      added      : new Set(),
      modified   : new Set(),
      removed    : new Set()
    });

    return steps;
  }
}

// ── CFG module-level helpers ─────────────────────────────────────────────────

function _cfgBodyKey(varName, body) {
  return `${varName}:${body.join(' ')}`;
}

function _cfgRemoveEpsilon(g) {
  const added   = new Set();
  const removed = new Set();

  // Compute nullable variables
  const nullable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [v, bodies] of g.productions) {
      if (nullable.has(v)) continue;
      for (const body of bodies) {
        const isEps      = body.length === 1 && body[0] === 'ε';
        const allNullable = body.length > 0 && body.every(s => nullable.has(s));
        if (isEps || allNullable) { nullable.add(v); changed = true; break; }
      }
    }
  }

  if (nullable.size === 0) {
    return {
      added, removed,
      description: 'No nullable variables found — no ε-productions exist. Step DEL is a no-op.'
    };
  }

  const nullList = [...nullable].join(', ');
  const startNullable = nullable.has(g.startVariable);

  for (const [v, bodies] of g.productions) {
    const existing = new Set(bodies.map(b => b.join('\x00')));
    const toAdd = [];
    for (const body of bodies) {
      for (const variant of _cfgEpsilonVariants(body, nullable)) {
        const key = variant.join('\x00');
        if (!existing.has(key)) {
          existing.add(key);
          toAdd.push(variant);
          added.add(_cfgBodyKey(v, variant));
        }
      }
    }
    bodies.push(...toAdd);
  }

  // If the start variable is nullable, ensure it has an explicit ε-production
  // (it may only be nullable transitively, e.g. S₀ → S and S is nullable,
  // so no ε body ever appeared directly for S₀).
  if (startNullable) {
    const startBodies = g.productions.get(g.startVariable);
    const hasEps = startBodies.some(b => b.length === 1 && b[0] === 'ε');
    if (!hasEps) {
      startBodies.push(['ε']);
      added.add(_cfgBodyKey(g.startVariable, ['ε']));
    }
  }

  for (const [v, bodies] of g.productions) {
    const filtered = bodies.filter(b => {
      if (b.length === 1 && b[0] === 'ε') {
        if (v === g.startVariable && startNullable) return true;
        removed.add(_cfgBodyKey(v, b));
        return false;
      }
      return true;
    });
    g.productions.set(v, filtered);
  }
  const desc = `Nullable variables: {${nullList}}. `+
    `Added ε-free rule variants for each rule containing a nullable symbol. `+
    `Removed all explicit ε-productions`+
    (startNullable ? ` (kept ${g.startVariable} → ε because ε ∈ L(G))` : '') + `.`;

  return { added, removed, description: desc };
}

function _cfgEpsilonVariants(body, nullable) {
  const results = [];
  function recurse(i, current) {
    if (i === body.length) {
      if (current.length > 0) results.push([...current]);
      return;
    }
    recurse(i + 1, [...current, body[i]]);
    if (nullable.has(body[i])) recurse(i + 1, [...current]);
  }
  recurse(0, []);
  return results;
}

function _cfgRemoveUnit(g) {
  const added   = new Set();
  const removed = new Set();

  // Compute unit-reachability
  const unitReach = new Map();
  for (const v of g.variables) unitReach.set(v, new Set([v]));

  let changed = true;
  while (changed) {
    changed = false;
    for (const [v, bodies] of g.productions) {
      for (const body of bodies) {
        if (body.length === 1 && g._isVariable(body[0])) {
          const target = body[0];
          for (const indirect of (unitReach.get(target) ?? [])) {
            if (!unitReach.get(v).has(indirect)) {
              unitReach.get(v).add(indirect);
              changed = true;
            }
          }
        }
      }
    }
  }

  // Copy non-unit productions for each reachable pair
  for (const [v, reachable] of unitReach) {
    const vBodies = g.productions.get(v);
    for (const target of reachable) {
      if (target === v) continue;
      for (const body of (g.productions.get(target) ?? [])) {
        if (body.length === 1 && g._isVariable(body[0])) continue;
        if (!vBodies.some(eb => eb.join(' ') === body.join(' '))) {
          vBodies.push([...body]);
          added.add(_cfgBodyKey(v, body));
        }
      }
    }
  }

  // Remove unit productions
  for (const [v, bodies] of g.productions) {
    const filtered = bodies.filter(b => {
      if (b.length === 1 && g._isVariable(b[0])) {
        removed.add(_cfgBodyKey(v, b));
        return false;
      }
      return true;
    });
    g.productions.set(v, filtered);
  }

  const anyUnits = removed.size > 0 || added.size > 0;
  const desc = anyUnits
    ? `Computed unit-reachability for each variable. Copied all non-unit productions transitively, then deleted every unit rule A → B (body is a single variable). ${added.size} new rule${added.size !== 1 ? 's' : ''} added, ${removed.size} unit rule${removed.size !== 1 ? 's' : ''} removed.`
    : 'No unit productions found. Step UNIT is a no-op.';

  return { added, removed, description: desc };
}

function _cfgAddTermVars(g) {
  const added    = new Set();
  const modified = new Set();
  const termMap  = new Map(); // terminal → proxy variable name

  // Pre-scan: find variables that already have exactly one production of one terminal.
  // These can be reused as proxies rather than creating duplicates.
  for (const [v, bodies] of g.productions) {
    if (bodies.length === 1 && bodies[0].length === 1 && !g._isVariable(bodies[0][0]) && bodies[0][0] !== 'ε') {
      const t = bodies[0][0];
      if (!termMap.has(t)) termMap.set(t, v);
    }
  }

  for (const [v, bodies] of g.productions) {
    for (let bi = 0; bi < bodies.length; bi++) {
      const body = bodies[bi];
      if (body.length < 2) continue;

      let wasChanged = false;
      const newBody = body.map(sym => {
        if (g._isVariable(sym) || sym === 'ε') return sym;
        if (!termMap.has(sym)) {
          let varName = `U${_cfgSubscriptChar(sym)}`;
          while (g.variables.includes(varName)) varName += '\u2032';
          termMap.set(sym, varName);
          g.variables.push(varName);
          g.productions.set(varName, [[sym]]);
          added.add(_cfgBodyKey(varName, [sym]));
        }
        wasChanged = true;
        return termMap.get(sym);
      });

      if (wasChanged) {
        bodies[bi] = newBody;
        modified.add(_cfgBodyKey(v, newBody));
      }
    }
  }

  const created = [...termMap.entries()].filter(([t, pv]) =>  added.has(_cfgBodyKey(pv, [t]))).map(([t, pv]) => `${pv} → ${t} (new)`);
  const reused  = [...termMap.entries()].filter(([t, pv]) => !added.has(_cfgBodyKey(pv, [t]))).map(([t, pv]) => `${pv} (existing rule for ${t})`);
  const parts   = [...created, ...reused];
  const desc = modified.size === 0
    ? 'No terminals appear in rules with body length ≥ 2. Step TERM is a no-op.'
    : `Terminal proxy variables: ${parts.join(', ')}. Replaced those terminals in all mixed/long rules with their proxy variable.`;

  return { added, modified, description: desc };
}

function _cfgSubscriptChar(ch) {
  const map = {
    a:'ₐ',e:'ₑ',o:'ₒ',x:'ₓ',h:'ₕ',k:'ₖ',l:'ₗ',m:'ₘ',n:'ₙ',p:'ₚ',s:'ₛ',t:'ₜ',
    '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'
  };
  // Use the subscript if available; otherwise append the char itself lowercase
  // (so 'b' → 'b' giving variable 'Ub', not 'UB')
  return map[ch] ?? ch.toLowerCase();
}

function _cfgBinarize(g) {
  const added   = new Set();
  const removed = new Set();
  const helperCounters = new Map();
  // Map: tail-symbols-key → helper variable already created for that tail
  const tailMap = new Map();

  function freshHelper(baseVar) {
    const base = baseVar.replace(/[₀-₉\u2032']+$/u, '');
    let cnt = (helperCounters.get(base) ?? 0) + 1;
    helperCounters.set(base, cnt);
    let name = base + _cfgSubscriptDigits(cnt);
    while (g.variables.includes(name)) {
      helperCounters.set(base, ++cnt);
      name = base + _cfgSubscriptDigits(cnt);
    }
    g.variables.push(name);
    g.productions.set(name, []);
    return name;
  }

  // Return (or create) the helper variable that represents the given tail.
  // Identical tails reuse the same helper variable.
  function ensureHelper(tail, baseVar) {
    const key = tail.join('\x00');
    if (tailMap.has(key)) return tailMap.get(key);

    const helper = freshHelper(baseVar);
    tailMap.set(key, helper);

    if (tail.length === 2) {
      g.productions.get(helper).push([...tail]);
      added.add(_cfgBodyKey(helper, tail));
    } else {
      const inner = ensureHelper(tail.slice(1), baseVar);
      const rule  = [tail[0], inner];
      g.productions.get(helper).push(rule);
      added.add(_cfgBodyKey(helper, rule));
    }

    return helper;
  }

  for (const v of [...g.variables]) {
    const bodies    = g.productions.get(v) ?? [];
    const newBodies = [];

    for (const body of bodies) {
      if (body.length <= 2) {
        newBodies.push(body);
        continue;
      }

      removed.add(_cfgBodyKey(v, body));
      const helper     = ensureHelper(body.slice(1), v);
      const binaryRule = [body[0], helper];
      newBodies.push(binaryRule);
      added.add(_cfgBodyKey(v, binaryRule));
    }

    g.productions.set(v, newBodies);
  }

  const newHelpers = tailMap.size;
  const desc = added.size === 0
    ? 'All rules already have bodies of length ≤ 2. Step BIN is a no-op. The grammar is now in CNF.'
    : `Broke every rule with |body| ≥ 3 into binary rules using ${newHelpers} shared helper variable${newHelpers !== 1 ? 's' : ''} (identical tails reuse the same helper). ${removed.size} long rule${removed.size !== 1 ? 's' : ''} removed. Every rule is now either A → BC (two variables) or A → a (one terminal). The grammar is in Chomsky Normal Form.`;

  return { added, removed, description: desc };
}

function _cfgSubscriptDigits(n) {
  return String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[parseInt(d)]).join('');
}

// ════════════════════════════════════════════════════════════
// APP CONTROLLER
// ════════════════════════════════════════════════════════════
const App = (() => {

  // ── Base64url helpers (Unicode-safe via TextEncoder) ──

  function _b64enc(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function _b64dec(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ── HTML / JS escaping helpers ──
  // Use esc() when inserting user-controlled text into innerHTML for display.
  // Use symEsc() when embedding user-controlled text inside a JS string literal
  // that itself lives in an HTML onclick="..." attribute.
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function symEsc(s) {
    // Escape for a single-quoted JS string literal inside a double-quoted HTML attribute
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── automata instances ──
  const _dfa  = new DFA();
  const _nfa  = new NFA();
  const _gnfa = new GNFA();
  const _pda  = new PDA();
  const _tm   = new TuringMachine();
  let M = _dfa;               // current automata
  let currentType = 'DFA';

  let renderer, canvas;
  let tool = 'add';
  let selId = null, hovId = null;
  let drag = null, dragOff = { x:0, y:0 };

  // linking mode
  let linking = null;
  let mousePos = { x:0, y:0 };
  let pendingLink = null;       // {fromId, toId}
  let _addStateTimer = null;

  // theme
  let classic = false;

  // sim
  let simPath = null, simStep = 0, simActive = false;
  let simInput = '';

  // TM sim
  let tmSteps = null, tmStepIdx = 0, tmResult = null;

  // PDA sim
  let pdaSteps = null, pdaStepIdx = 0, pdaResult = null, pdaInputStr = '';

  // CFG
  const _cfg = new CFG();
  let cfgSteps = null, cfgStepIdx = 0;

  // ── Undo / Redo ──────────────────────────────────────────────
  const _undoStacks = { DFA: [], NFA: [], GNFA: [], PDA: [], TM: [] };
  const _redoStacks = { DFA: [], NFA: [], GNFA: [], PDA: [], TM: [] };
  const _MAX_UNDO   = 60;

  // ── init ──
  function init() {
    canvas = document.getElementById('canvas');
    renderer = new GraphRenderer(canvas);
    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousedown',   onDown);
    canvas.addEventListener('mousemove',   onMove);
    canvas.addEventListener('mouseup',     onUp);
    canvas.addEventListener('mouseleave',  () => { hovId = null; drag = null; render(); });
    canvas.addEventListener('contextmenu', onCtx);
    canvas.addEventListener('dblclick',    onDbl);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      _setZoom(renderer._zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, { passive: false });

    document.addEventListener('click', () => {
      document.getElementById('ctx-menu').style.display = 'none';
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { _cancelLink(); _symCancel(); }

      // Ctrl/Cmd+Z → undo; Ctrl/Cmd+Y or Ctrl+Shift+Z → redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); redo(); return;
      }

      // Shortcuts that must NOT fire while the user is typing in an input
      const inInput = e.target.matches('input, textarea, select');
      if (inInput) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selId) { e.preventDefault(); _del(selId); }
        return;
      }
      if (e.key === 'a' || e.key === 'A') { setTool('add');    return; }
      if (e.key === 's' || e.key === 'S') { setTool('select'); return; }

      // Arrow keys → step through simulation
      if (currentType === 'CFG') {
        if (e.key === 'ArrowRight') { cfgStepFwd();  return; }
        if (e.key === 'ArrowLeft')  { cfgStepBack(); return; }
        return;
      }
      if (e.key === 'ArrowRight') {
        if (currentType === 'TM'  && tmSteps)   { tmStepFwd();  return; }
        if (currentType === 'PDA' && pdaSteps)  { pdaStepFwd(); return; }
        if (simActive) { stepFwd(); return; }
      }
      if (e.key === 'ArrowLeft') {
        if (currentType === 'TM'  && tmSteps)   { tmStepBack();  return; }
        if (currentType === 'PDA' && pdaSteps)  { pdaStepBack(); return; }
        if (simActive) { stepBack(); return; }
      }
    });

    document.getElementById('sym-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') _symConfirm();
    });

    document.getElementById('nav').addEventListener('click', e => {
      const btn = e.target.closest('button[data-type]');
      if (!btn || btn.classList.contains('locked')) return;
      switchType(btn.dataset.type);
    });

    render(); updateUI();
    _importFromHash();
  }

  function resize() {
    const w = document.getElementById('canvas-wrap');
    canvas.width  = w.clientWidth;
    canvas.height = w.clientHeight;
    render();
  }

  function render() {
    if (!renderer || currentType === 'CFG') return;
    let hlS = new Set(), hlE = [];

    if (simActive && simPath && simStep < simPath.length) {
      const step = simPath[simStep];
      if (step.states) {
        // NFA: highlight all active states
        hlS = new Set(step.states);
      } else {
        // DFA: highlight single state + edge
        hlS.add(step.state);
        if (simStep > 0)
          hlE = [{ from: simPath[simStep-1].state, to: step.state }];
      }
    }

    if (linking) hlS.add(linking);

    // TM: highlight current state during simulation
    if (currentType === 'TM' && tmSteps && tmStepIdx < tmSteps.length)
      hlS.add(tmSteps[tmStepIdx].state);

    // PDA: highlight current state during simulation
    if (currentType === 'PDA' && pdaSteps && pdaStepIdx < pdaSteps.length)
      hlS.add(pdaSteps[pdaStepIdx].state);

    renderer.setHighlight(hlS, hlE);
    renderer.render(M, selId, hovId);

    if (linking) {
      const src = M.states.get(linking);
      if (src) renderer.drawLinkPreview(src, mousePos.x, mousePos.y);
    }
  }

  // ── mouse ──
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const z = renderer._zoom;
    const W = canvas.width, H = canvas.height;
    return {
      x: (e.clientX - r.left - W / 2) / z + W / 2,
      y: (e.clientY - r.top  - H / 2) / z + H / 2
    };
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const p = pos(e);
    const s = renderer.stateAt(p.x, p.y, M.states);

    if (linking !== null) {
      if (s) {
        pendingLink = { fromId: linking, toId: s.id };
        const fLbl = M.states.get(linking)?.label ?? linking;
        document.getElementById('sym-from-lbl').textContent = fLbl;
        document.getElementById('sym-to-lbl').textContent   = s.label;
        const hint = currentType === 'GNFA' ? 'e.g. a|b, (ab)*, ε' : 'e.g. a, 0, ε';
        document.getElementById('sym-input').placeholder = hint;
        document.getElementById('sym-input').value = '';
        document.getElementById('sym-overlay').classList.add('show');
        setTimeout(() => document.getElementById('sym-input').focus(), 30);
      }
      _cancelLink();
      return;
    }

    if (s) {
      drag = s.id;
      dragOff = { x: p.x - s.x, y: p.y - s.y };
      if (tool === 'select') { selId = s.id; updateUI(); }
    } else if (tool === 'add') {
      clearTimeout(_addStateTimer);
      const px = p.x, py = p.y;
      _addStateTimer = setTimeout(() => {
        _addStateTimer = null;
        _pushUndo();
        const ns = M.addState(px, py);
        if (M.states.size === 1) M.setStart(ns.id);
        updateUI(); render();
      }, 220);
    } else {
      selId = null; updateUI();
    }
    render();
  }

  function onMove(e) {
    const p = pos(e);
    mousePos = p;
    hovId = renderer.stateAt(p.x, p.y, M.states)?.id ?? null;
    if (drag) {
      const s = M.states.get(drag);
      if (s) { s.x = p.x - dragOff.x; s.y = p.y - dragOff.y; }
      canvas.className = 'grab-cur';
    } else if (linking) {
      canvas.className = 'link-cur';
    } else {
      canvas.className = tool === 'select' ? 'sel-cur' : '';
    }
    render();
  }

  function onUp() {
    drag = null;
    if (!linking) canvas.className = tool === 'select' ? 'sel-cur' : '';
  }

  function onDbl(e) {
    clearTimeout(_addStateTimer);
    _addStateTimer = null;
    if (currentType !== 'PDA') return;
    const p = pos(e);
    const edge = renderer.transitionAt(p.x, p.y, M);
    if (!edge) return;
    e.preventDefault();
    _editEdge(edge, e.clientX, e.clientY);
  }

  // ── Inline PDA edge editor ──

  let _editingEdge = null;

  function _editEdge(edge, clientX, clientY) {
    _editingEdge = edge;
    const ta = document.getElementById('edge-edit');
    // Build current rules one per line: "input, pop/push"
    const rules = M.delta
      .filter(t => t.from === edge.from && t.to === edge.to)
      .map(t => `${t.input}, ${t.pop}/${t.push}`)
      .join('\n');
    ta.value = rules;
    // Position near the click
    ta.style.left = (clientX + 8) + 'px';
    ta.style.top  = (clientY - 10) + 'px';
    ta.style.display = 'block';
    // Auto-size rows
    ta.rows = Math.max(2, rules.split('\n').length);
    ta.focus();
    ta.select();
  }

  function _commitEdgeEdit() {
    const ta = document.getElementById('edge-edit');
    if (!_editingEdge) { ta.style.display = 'none'; return; }
    const { from, to } = _editingEdge;
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { ta.style.display = 'none'; _editingEdge = null; return; }
    _pushUndo();
    // Remove all existing transitions for this (from, to) pair
    for (let i = M.delta.length - 1; i >= 0; i--) {
      if (M.delta[i].from === from && M.delta[i].to === to) M.delta.splice(i, 1);
    }
    M._rebuildAlphabets();
    // Parse and add new rules. Format: "input, pop/push"
    for (const line of lines) {
      // split on first '/' for push part
      const slashIdx = line.indexOf('/');
      if (slashIdx === -1) continue;
      const before = line.slice(0, slashIdx).trim();   // "input, pop"
      const push   = line.slice(slashIdx + 1).trim();  // "push"
      const commaIdx = before.indexOf(',');
      if (commaIdx === -1) continue;
      const input = before.slice(0, commaIdx).trim();
      const pop   = before.slice(commaIdx + 1).trim();
      if (!input || !pop) continue;
      M.addTransition(from, input, pop, push, to);
    }
    _updatePdaTransUI();
    updateUI(); render();
    ta.style.display = 'none';
    _editingEdge = null;
  }

  function _cancelEdgeEdit() {
    document.getElementById('edge-edit').style.display = 'none';
    _editingEdge = null;
  }

  // Wire up the edge editor textarea
  document.getElementById('edge-edit').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); _cancelEdgeEdit(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _commitEdgeEdit(); }
  });
  document.getElementById('edge-edit').addEventListener('blur', () => {
    // Small delay so clicks on the textarea itself don't instantly close it
    setTimeout(() => { if (_editingEdge) _commitEdgeEdit(); }, 150);
  });

  function onCtx(e) {
    e.preventDefault();
    if (linking !== null) { _cancelLink(); return; }

    const p = pos(e);
    const s = renderer.stateAt(p.x, p.y, M.states);

    if (s) {
      selId = s.id; updateUI(); render();
      showStateCtxMenu(e.clientX, e.clientY, s);
      return;
    }

    const edge = renderer.transitionAt(p.x, p.y, M);
    if (edge) showEdgeCtxMenu(e.clientX, e.clientY, edge);
  }

  // ── Context menus ──

  function showStateCtxMenu(x, y, s) {
    const m = document.getElementById('ctx-menu');
    // For GNFA, don't allow deleting qS or qA
    const isSpecial = currentType === 'GNFA' &&
      (s.id === M.startState || s.id === M._acceptId);
    const tmRejectItem = currentType === 'TM'
      ? ci(s.id === M._rejectId ? '🚫 Remove Reject' : '🚫 Set as Reject', `App._setReject('${s.id}')`)
      : '';
    m.innerHTML = `
      <div class="cm-head">${esc(s.label)}</div>
      ${currentType === 'PDA' ? '' : ci('→ Add Transition', `App._startLink('${s.id}')`)}
      <hr class="cm-sep">
      ${isSpecial ? '' : ci('▶ Set as Start', `App._setStart('${s.id}')`)}
      ${isSpecial ? '' : ci(s.isAccept ? '★ Remove Accept' : '★ Set Accept', `App._toggleAccept('${s.id}')`)}
      ${tmRejectItem}
      ${ci('✎ Rename…', `App._rename('${s.id}')`)}
      <hr class="cm-sep">
      ${isSpecial ? '<div class="cm-item" style="opacity:.4;cursor:default">🔒 Protected state</div>'
                  : ci('🗑 Delete State', `App._del('${s.id}')`, true)}
    `;
    _showMenu(m, x, y);
  }

  function showEdgeCtxMenu(x, y, edge) {
    const m = document.getElementById('ctx-menu');
    const fLbl = M.states.get(edge.from)?.label ?? edge.from;
    const tLbl = M.states.get(edge.to)?.label   ?? edge.to;
    const symsStr = edge.syms.join(', ');

    let delItems;
    if (currentType === 'PDA') {
      // PDA transitions are removed by index — look up matching transitions
      const pdaTrans = M.getTransitions().filter(t => t.from === edge.from && t.to === edge.to);
      delItems = pdaTrans.length === 1
        ? ci('🗑 Delete Transition', `App._rmPdaTrans(${pdaTrans[0].idx})`, true)
        : pdaTrans.map(t =>
            ci(`🗑 Delete ─${esc(t.symbol)}→`, `App._rmPdaTrans(${t.idx})`, true)
          ).join('');
    } else {
      // Pass `to` so NFA can do precise triple removal
      delItems = edge.syms.length === 1
        ? ci(`🗑 Delete Transition`, `App._rmTrans('${edge.from}','${symEsc(edge.syms[0])}','${edge.to}')`, true)
        : edge.syms.map(sym =>
            ci(`🗑 Delete ─${esc(sym)}→`, `App._rmTrans('${edge.from}','${symEsc(sym)}','${edge.to}')`, true)
          ).join('');
    }

    m.innerHTML = `
      <div class="cm-head">${esc(fLbl)} ─${esc(symsStr)}→ ${esc(tLbl)}</div>
      ${delItems}
    `;
    _showMenu(m, x, y);
  }

  function _showMenu(m, x, y) {
    m.style.display = 'block';
    m.style.left = x + 'px';
    m.style.top  = y + 'px';
    requestAnimationFrame(() => {
      const rect = m.getBoundingClientRect();
      if (rect.right  > window.innerWidth)  m.style.left = (x - rect.width)  + 'px';
      if (rect.bottom > window.innerHeight) m.style.top  = (y - rect.height) + 'px';
    });
  }

  function ci(lbl, fn, danger = false) {
    return `<div class="cm-item${danger ? ' d' : ''}"
      onclick="${fn};document.getElementById('ctx-menu').style.display='none'">${lbl}</div>`;
  }

  // ── Linking mode ──

  function _startLink(fromId) {
    document.getElementById('ctx-menu').style.display = 'none';
    linking = fromId;
    canvas.className = 'link-cur';
    _setCanvasHint('Click destination state · Right-click or Esc to cancel');
    render();
  }

  function _cancelLink() {
    linking = null;
    canvas.className = tool === 'select' ? 'sel-cur' : '';
    _setCanvasHint('Right-click state or edge for options');
    render();
  }

  function _setCanvasHint(text) {
    const el = document.getElementById('canvas-hint');
    if (el) el.textContent = text;
  }

  // ── Symbol prompt ──

  function _symConfirm() {
    const sym = document.getElementById('sym-input').value.trim();
    if (sym && pendingLink) {
      _pushUndo();
      M.addTransition(pendingLink.fromId, sym, pendingLink.toId);
      updateUI(); render();
    }
    _symCancel();
  }

  function _symCancel() {
    pendingLink = null;
    document.getElementById('sym-overlay').classList.remove('show');
    document.getElementById('sym-input').value = '';
  }

  // ── Undo / Redo helpers ──────────────────────────────────────

  function _snapshotMachine() {
    const type = currentType;
    const states = [...M.states.values()].map(s => [
      s.id, s.x, s.y, s.label,
      (s.isStart ? 1 : 0) | (s.isAccept ? 2 : 0) | (s.isReject ? 4 : 0)
    ]);
    let delta;
    if (type === 'PDA')
      delta = M.delta.map(t => [t.from, t.input, t.pop, t.push, t.to]);
    else if (type === 'TM')
      delta = M.getTransitions().map(t => [t.from, t.readChar, t.writeChar, t.dir, t.to]);
    else
      delta = M.getTransitions().map(t => [t.from, t.symbol, t.to]);
    const snap = { t: type, q: states, d: delta, _counter: M._counter };
    if (type === 'GNFA') snap.qa = M._acceptId;
    if (type === 'TM')   snap.qr = M._rejectId;
    return snap;
  }

  function _restoreSnapshot(snap) {
    M.reset();
    for (const [id, x, y, label, flags] of snap.q) {
      M.states.set(id, { id, x, y, label,
        isStart:  !!(flags & 1),
        isAccept: !!(flags & 2),
        isReject: !!(flags & 4) });
    }
    M._counter = snap._counter ?? 0;
    const startEntry = snap.q.find(([,,,, f]) => f & 1);
    M.startState = startEntry ? startEntry[0] : null;
    if (snap.t === 'PDA') {
      for (const [from, input, pop, push, to] of snap.d) M.addTransition(from, input, pop, push, to);
    } else if (snap.t === 'TM') {
      for (const [from, read, write, dir, to] of snap.d) M.addTransition(from, read, write, dir, to);
      if (snap.qr) { M._rejectId = snap.qr; const rs = M.states.get(snap.qr); if (rs) rs.isReject = true; }
    } else {
      for (const [from, symbol, to] of snap.d) M.addTransition(from, symbol, to);
      if (snap.t === 'GNFA' && snap.qa) M._acceptId = snap.qa;
    }
    if (snap.t === 'TM')   _updateTmTransUI();
    if (snap.t === 'PDA')  _updatePdaTransUI();
    if (snap.t === 'GNFA') {
      const el = document.getElementById('gnfa-result');
      if (el) el.style.display = 'none';
    }
    selId = null;
    updateUI(); render();
  }

  function _pushUndo() {
    const us = _undoStacks[currentType];
    us.push(_snapshotMachine());
    if (us.length > _MAX_UNDO) us.shift();
    _redoStacks[currentType].length = 0;
    _updateUndoButtons();
  }

  function undo() {
    const us = _undoStacks[currentType], rs = _redoStacks[currentType];
    if (!us.length) return;
    rs.push(_snapshotMachine());
    _restoreSnapshot(us.pop());
    _updateUndoButtons();
  }

  function redo() {
    const us = _undoStacks[currentType], rs = _redoStacks[currentType];
    if (!rs.length) return;
    us.push(_snapshotMachine());
    _restoreSnapshot(rs.pop());
    _updateUndoButtons();
  }

  function _updateUndoButtons() {
    const ub = document.getElementById('undo-btn');
    const rb = document.getElementById('redo-btn');
    if (ub) ub.disabled = !_undoStacks[currentType].length;
    if (rb) rb.disabled = !_redoStacks[currentType].length;
  }

  // ── Public actions ──

  function setTool(t) {
    tool = t;
    document.getElementById('tool-add').classList.toggle('active', t === 'add');
    document.getElementById('tool-sel').classList.toggle('active', t === 'select');
    if (!linking) canvas.className = t === 'select' ? 'sel-cur' : '';
    document.getElementById('tool-hint').textContent =
      t === 'add' ? 'Click canvas to add states · Drag to move'
                  : 'Click state to select · Right-click for options';
  }

  function _setStart(id)     { _pushUndo(); M.setStart(id);     updateUI(); render(); }
  function _toggleAccept(id) { _pushUndo(); M.toggleAccept(id); updateUI(); render(); }
  function _del(id) {
    _pushUndo();
    M.removeState(id);
    if (selId === id) selId = null;
    updateUI(); render();
  }
  function _rename(id) {
    const s = M.states.get(id);
    if (!s) return;
    const nl = prompt('New label:', s.label);
    if (nl && nl.trim()) { _pushUndo(); M.renameState(id, nl.trim()); updateUI(); render(); }
  }

  function deleteSelected() { if (selId) _del(selId); }

  function addTransition() {
    const from = document.getElementById('t-from').value;
    const sym  = document.getElementById('t-sym').value.trim();
    const to   = document.getElementById('t-to').value;
    if (!from || !sym || !to) { alert('Fill all transition fields.'); return; }
    _pushUndo();
    M.addTransition(from, sym, to);
    document.getElementById('t-sym').value = '';
    updateUI(); render();
  }

  function _rmTrans(from, sym, to) {
    _pushUndo();
    if (currentType === 'GNFA') {
      M.removeTransition(from, to);
    } else {
      M.removeTransition(from, sym, to);
    }
    updateUI(); render();
  }

  // ── Simulation ──

  function runSim() {
    simInput = document.getElementById('sim-str').value;
    const res = M.simulate(simInput);
    simPath   = res.path;
    simStep   = 0;
    simActive = true;
    _renderSimResult(res, simInput);
    document.getElementById('step-ctrl').style.display = 'flex';
    _updateStep();
    render();
  }

  function resetSim() {
    simPath = null; simStep = 0; simActive = false; simInput = '';
    document.getElementById('step-ctrl').style.display = 'none';
    document.getElementById('result-badge').className = 'badge idle';
    document.getElementById('result-badge').textContent = '—';
    document.getElementById('path-row').innerHTML = '';
    document.getElementById('err-msg').textContent = '';
    render();
  }

  function onSimInput() { if (simActive) resetSim(); }

  function stepBack() {
    if (!simPath || simStep <= 0) return;
    simStep--; _updateStep(); render();
  }

  function stepFwd() {
    if (!simPath || simStep >= simPath.length - 1) return;
    simStep++; _updateStep(); render();
  }

  function _updateStep() {
    const len = simPath ? simPath.length - 1 : 0;
    document.getElementById('step-ind').textContent = `${simStep} / ${len}`;
    document.getElementById('btn-bk').disabled  = simStep <= 0;
    document.getElementById('btn-fwd').disabled = !simPath || simStep >= simPath.length - 1;
    document.querySelectorAll('.pnode').forEach((n, i) => {
      n.classList.toggle('cur', i === simStep);
    });
  }

  function _renderSimResult(res, input) {
    const badge = document.getElementById('result-badge');
    badge.className = 'badge ' + (res.accepted ? 'ok' : 'fail');
    badge.textContent = res.accepted ? 'ACCEPTED' : 'REJECTED';

    const pr = document.getElementById('path-row');
    let h = '';

    if (currentType === 'NFA') {
      // NFA: each step has a set of active states
      (res.path ?? []).forEach((step, i) => {
        const labels = [...step.states].map(id => M.states.get(id)?.label ?? id);
        const lbl = labels.length ? `{${labels.join(',')}}` : '∅';
        const fin = i === res.path.length - 1 && res.accepted;
        if (i > 0) h += `<span style="color:var(--dim);font-size:10px;align-self:center">─${esc(input[i-1])}→</span>`;
        h += `<span class="pnode${fin?' fin':''}" data-i="${i}" title="${esc(lbl)}">${esc(lbl)}</span>`;
      });
    } else {
      // DFA: each step has a single state
      (res.path ?? []).forEach((step, i) => {
        const s = M.states.get(step.state);
        const lbl = s?.label ?? step.state;
        const fin = i === res.path.length - 1 && res.accepted;
        if (i > 0) h += `<span style="color:var(--dim);font-size:10px;align-self:center">─${esc(input[i-1])}→</span>`;
        h += `<span class="pnode${fin?' fin':''}" data-i="${i}" title="${esc(lbl)}">${esc(lbl)}</span>`;
      });
    }

    pr.innerHTML = h;
    pr.querySelectorAll('.pnode').forEach(n =>
      n.addEventListener('click', () => { simStep = +n.dataset.i; _updateStep(); render(); })
    );
    document.getElementById('err-msg').textContent = res.error ?? '';
  }

  // ── GNFA controls ──

  function gnfaImport() {
    // Import from whichever of DFA/NFA was last used, defaulting to DFA
    const src = _gnfaSourceType === 'NFA' ? _nfa : _dfa;
    if (src.states.size === 0) {
      alert(`No states in the ${_gnfaSourceType === 'NFA' ? 'NFA' : 'DFA'} diagram. Build one first, then import.`);
      return;
    }
    _pushUndo();
    // Replace current GNFA data with import
    _gnfa.reset();
    const imported = GNFA.fromAutomata(src);
    _gnfa.startState = imported.startState;
    _gnfa._acceptId  = imported._acceptId;
    _gnfa._counter   = imported._counter;
    for (const [id, s] of imported.states) _gnfa.states.set(id, s);
    for (const [k,  v] of imported.delta)  _gnfa.delta.set(k, v);

    document.getElementById('status-txt').textContent = 'Imported from ' + (_gnfaSourceType === 'NFA' ? 'NFA' : 'DFA');
    document.getElementById('gnfa-result').style.display = 'none';
    selId = null;
    updateUI(); render();
  }

  let _gnfaSourceType = 'DFA';

  function gnfaSetSource(type) {
    _gnfaSourceType = type;
    document.getElementById('gnfa-src-dfa').classList.toggle('active', type === 'DFA');
    document.getElementById('gnfa-src-nfa').classList.toggle('active', type === 'NFA');
  }

  function gnfaEliminate() {
    const sel = document.getElementById('gnfa-elim-sel').value;
    if (!sel) { alert('Select a state to eliminate.'); return; }
    _pushUndo();
    _gnfa.eliminate(sel);
    if (selId === sel) selId = null;
    document.getElementById('gnfa-result').style.display = 'none';
    updateUI(); render();
  }

  function gnfaAutoRegex() {
    if (_gnfa.states.size === 0) { alert('GNFA is empty. Import from DFA/NFA first.'); return; }
    const regex = _gnfa.toRegex();
    document.getElementById('gnfa-regex').textContent = regex;
    document.getElementById('gnfa-result').style.display = 'block';
  }

  // ── NFA → DFA conversion ──

  function nfaToDfa() {
    if (_nfa.states.size === 0) { alert('NFA is empty. Build one first.'); return; }
    if (!_nfa.startState)       { alert('NFA has no start state.'); return; }
    _pushUndo();

    const nfa   = _nfa;
    const alpha = [...nfa.alphabet].sort();
    if (alpha.length === 0) { alert('NFA alphabet is empty — add some non-ε transitions first.'); return; }

    // Encode a set of NFA state IDs as a stable string key
    const setKey   = s => [...s].sort().join('\x00');
    const setLabel = s => `{${[...s].map(id => nfa.states.get(id)?.label ?? id).join(',')}}`;

    _dfa.reset();
    selId = null;
    resetSim();

    // Simple grid layout
    const cols = 4;
    const colW = Math.max(130, Math.min(190, (canvas.width - 80) / cols));
    let idx = 0;
    function nextPos() {
      const c = idx % cols, r = Math.floor(idx / cols);
      idx++;
      return { x: 55 + c * colW + colW / 2, y: 80 + r * 110 };
    }

    // Start state = ε-closure of NFA start
    const startSet = nfa.epsilonClosure(new Set([nfa.startState]));
    const visited  = new Map();   // setKey → DFA state id

    const p0 = nextPos();
    const s0 = _dfa.addState(p0.x, p0.y, setLabel(startSet));
    _dfa.setStart(s0.id);
    if ([...startSet].some(id => nfa.states.get(id)?.isAccept)) _dfa.toggleAccept(s0.id);
    visited.set(setKey(startSet), s0.id);

    const queue = [startSet];
    let deadId = null;   // lazily-created sink state for ∅

    while (queue.length > 0) {
      const cur   = queue.shift();
      const curId = visited.get(setKey(cur));

      for (const sym of alpha) {
        const next    = nfa.epsilonClosure(nfa.move(cur, sym));
        if (next.size === 0) {
          // Transition leads to the dead (∅) state — create it lazily
          if (!deadId) {
            const p  = nextPos();
            const ds = _dfa.addState(p.x, p.y, '∅');
            deadId = ds.id;
          }
          _dfa.addTransition(curId, sym, deadId);
          continue;
        }

        const nextKey = setKey(next);
        if (!visited.has(nextKey)) {
          const p  = nextPos();
          const ns = _dfa.addState(p.x, p.y, setLabel(next));
          if ([...next].some(id => nfa.states.get(id)?.isAccept)) _dfa.toggleAccept(ns.id);
          visited.set(nextKey, ns.id);
          queue.push(next);
        }
        _dfa.addTransition(curId, sym, visited.get(nextKey));
      }
    }

    // Dead state loops back to itself on every symbol
    if (deadId) {
      for (const sym of alpha) _dfa.addTransition(deadId, sym, deadId);
    }

    switchType('DFA');
    document.getElementById('status-txt').textContent =
      `NFA→DFA · ${_dfa.states.size} state${_dfa.states.size !== 1 ? 's' : ''} · Σ = {${alpha.join(',')}}`;
  }

  // ── TM controls ──

  function _setReject(id) {
    _pushUndo();
    M.setReject(id);
    updateUI(); render();
  }

  function tmAddTransition() {
    const from  = document.getElementById('tm-t-from').value;
    const read  = document.getElementById('tm-t-read').value   || M.blank;
    const write = document.getElementById('tm-t-write').value  || M.blank;
    const dir   = document.getElementById('tm-t-dir').value;
    const to    = document.getElementById('tm-t-to').value;
    if (!from || !to) { alert('Select From and To states.'); return; }
    _pushUndo();
    M.addTransition(from, read, write, dir, to);
    document.getElementById('tm-t-read').value  = '';
    document.getElementById('tm-t-write').value = '';
    _updateTmTransUI(); render();
  }

  function _rmTmTrans(from, readChar) {
    _pushUndo();
    M.removeTransition(from, readChar);
    _updateTmTransUI(); render();
  }

  function _updateTmTransUI() {
    let opts = '<option value="">Select…</option>';
    for (const [, s] of M.states) opts += `<option value="${s.id}">${esc(s.label)}</option>`;
    document.getElementById('tm-t-from').innerHTML = opts;
    document.getElementById('tm-t-to').innerHTML   = opts;

    let th = '';
    for (const t of M.getTransitions()) {
      const fl = M.states.get(t.from)?.label ?? t.from;
      const tl = M.states.get(t.to)?.label   ?? t.to;
      th += `<div class="titem">
        <span class="lbl">${esc(fl)}</span>
        <span class="sym">─${esc(t.symbol)}→</span>
        <span class="lbl">${esc(tl)}</span>
        <button class="del" onclick="App._rmTmTrans('${t.from}','${symEsc(t.readChar)}')" title="Remove">✕</button>
      </div>`;
    }
    document.getElementById('tm-t-list').innerHTML =
      th || '<div style="font-size:11px;color:var(--dim)">No transitions</div>';
  }

  function tmInit() {
    const input = document.getElementById('tm-input').value;
    tmResult  = M.simulate(input);
    tmSteps   = tmResult.steps;
    tmStepIdx = 0;
    document.getElementById('tm-sim-view').style.display = '';
    document.getElementById('tm-badge').className    = 'badge idle';
    document.getElementById('tm-badge').textContent  = 'Running…';
    document.getElementById('tm-err-msg').textContent = '';
    _updateTmStep();
    render();
  }

  function tmReset() {
    tmSteps = null; tmStepIdx = 0; tmResult = null;
    const view = document.getElementById('tm-sim-view');
    if (view) view.style.display = 'none';
    render();
  }

  function tmStepFwd() {
    if (!tmSteps) return;
    if (tmStepIdx < tmSteps.length - 1) { tmStepIdx++; _updateTmStep(); render(); }
    else _tmShowFinal();
  }

  function tmStepBack() {
    if (!tmSteps || tmStepIdx <= 0) return;
    tmStepIdx--; _updateTmStep(); render();
  }

  function tmRunFull() {
    if (!tmSteps) return;
    tmStepIdx = tmSteps.length - 1;
    _updateTmStep(); _tmShowFinal(); render();
  }

  function _updateTmStep() {
    if (!tmSteps || !tmSteps.length) return;
    const step = tmSteps[tmStepIdx];
    _renderTmTape(step.tape, step.head);
    const lbl = M.states.get(step.state)?.label ?? step.state;
    document.getElementById('tm-status').textContent =
      `State: ${lbl}  |  Head: ${step.head}`;
    document.getElementById('tm-step-ind').textContent =
      `${tmStepIdx} / ${tmSteps.length - 1}`;
    document.getElementById('tm-btn-bk').disabled  = tmStepIdx <= 0;
    document.getElementById('tm-btn-fwd').disabled = tmStepIdx >= tmSteps.length - 1;
    if (tmStepIdx === tmSteps.length - 1) _tmShowFinal();
    else {
      document.getElementById('tm-badge').className   = 'badge idle';
      document.getElementById('tm-badge').textContent = 'Running…';
      document.getElementById('tm-err-msg').textContent = '';
    }
  }

  function _renderTmTape(tape, head) {
    const positions = tape.size ? [...tape.keys()] : [];
    const minT = positions.length ? Math.min(...positions) : head;
    const maxT = positions.length ? Math.max(...positions) : head;
    const lo = Math.min(head - 4, minT - 1);
    const hi = Math.max(head + 4, maxT + 1);
    let html = '<div class="tm-tape">';
    for (let i = lo; i <= hi; i++) {
      const ch = tape.get(i) ?? '⊔';
      html += `<div class="tm-cell${i === head ? ' head' : ''}">${ch}</div>`;
    }
    html += '</div>';
    document.getElementById('tm-tape').innerHTML = html;
  }

  function _tmShowFinal() {
    if (!tmResult) return;
    const badge = document.getElementById('tm-badge');
    badge.className   = 'badge ' + (tmResult.accepted ? 'ok' : 'fail');
    badge.textContent = tmResult.accepted ? 'ACCEPTED' : 'REJECTED';
    document.getElementById('tm-err-msg').textContent = tmResult.error ?? '';
  }

  // ── PDA controls ──

  function pdaAddTransition() {
    const from  = document.getElementById('pda-t-from').value;
    const input = document.getElementById('pda-t-input').value.trim() || 'ε';
    const pop   = document.getElementById('pda-t-pop').value.trim()   || 'ε';
    const push  = document.getElementById('pda-t-push').value.trim()  || 'ε';
    const to    = document.getElementById('pda-t-to').value;
    if (!from || !to) { alert('Select From and To states.'); return; }
    _pushUndo();
    M.addTransition(from, input, pop, push, to);
    document.getElementById('pda-t-input').value = '';
    document.getElementById('pda-t-pop').value   = '';
    document.getElementById('pda-t-push').value  = '';
    _updatePdaTransUI(); render();
  }

  function _rmPdaTrans(idx) {
    _pushUndo();
    M.removeTransition(idx);
    _updatePdaTransUI(); render();
  }

  function _updatePdaTransUI() {
    let opts = '<option value="">Select…</option>';
    for (const [, s] of M.states) opts += `<option value="${s.id}">${esc(s.label)}</option>`;
    document.getElementById('pda-t-from').innerHTML = opts;
    document.getElementById('pda-t-to').innerHTML   = opts;

    let th = '';
    for (const t of M.getTransitions()) {
      const fl = M.states.get(t.from)?.label ?? t.from;
      const tl = M.states.get(t.to)?.label   ?? t.to;
      th += `<div class="titem">
        <span class="lbl">${esc(fl)}</span>
        <span class="sym" title="input,pop/push"> ─${esc(t.symbol)}→ </span>
        <span class="lbl">${esc(tl)}</span>
        <button class="del" onclick="App._rmPdaTrans(${t.idx})" title="Remove">✕</button>
      </div>`;
    }
    document.getElementById('pda-t-list').innerHTML =
      th || '<div style="font-size:11px;color:var(--dim)">No transitions</div>';
  }

  function pdaInit() {
    pdaInputStr = document.getElementById('pda-input').value;
    pdaResult   = M.simulate(pdaInputStr);
    pdaSteps    = pdaResult.steps;
    pdaStepIdx  = 0;
    document.getElementById('pda-sim-view').style.display = '';
    const badge = document.getElementById('pda-badge');
    badge.className   = 'badge ' + (pdaResult.accepted ? 'ok' : 'fail');
    badge.textContent = pdaResult.accepted ? 'ACCEPTED' : 'REJECTED';
    document.getElementById('pda-err-msg').textContent = pdaResult.error ?? '';
    _updatePdaStep();
    render();
  }

  function pdaReset() {
    pdaSteps = null; pdaStepIdx = 0; pdaResult = null; pdaInputStr = '';
    const view = document.getElementById('pda-sim-view');
    if (view) view.style.display = 'none';
    render();
  }

  function pdaStepFwd() {
    if (!pdaSteps || pdaStepIdx >= pdaSteps.length - 1) return;
    pdaStepIdx++; _updatePdaStep(); render();
  }

  function pdaStepBack() {
    if (!pdaSteps || pdaStepIdx <= 0) return;
    pdaStepIdx--; _updatePdaStep(); render();
  }

  function pdaRunFull() {
    if (!pdaSteps || !pdaSteps.length) return;
    pdaStepIdx = pdaSteps.length - 1;
    _updatePdaStep(); render();
  }

  function _updatePdaStep() {
    if (!pdaSteps || !pdaSteps.length) return;
    const step = pdaSteps[pdaStepIdx];
    _renderPdaInput(pdaInputStr, step.pos);
    _renderPdaStack(step.stack);
    document.getElementById('pda-step-ind').textContent =
      `${pdaStepIdx} / ${pdaSteps.length - 1}`;
    document.getElementById('pda-btn-bk').disabled  = pdaStepIdx <= 0;
    document.getElementById('pda-btn-fwd').disabled = pdaStepIdx >= pdaSteps.length - 1;
  }

  function _renderPdaInput(str, pos) {
    let h = '';
    for (let i = 0; i < str.length; i++) {
      const cur = i === pos;
      h += `<span style="padding:1px 3px;border-radius:3px;${
        cur ? 'border:1px solid var(--orange);color:var(--orange);font-weight:700' :
        i < pos ? 'color:var(--dim);text-decoration:line-through' :
        'border:1px solid transparent'
      }">${str[i]}</span>`;
    }
    if (pos >= str.length) h += '<span style="color:var(--green);font-size:11px"> ✓ all consumed</span>';
    document.getElementById('pda-input-disp').innerHTML = h || '<span style="color:var(--dim);font-size:11px">ε</span>';
  }

  function _renderPdaStack(stack) {
    if (stack.length === 0) {
      document.getElementById('pda-stack').innerHTML =
        '<span style="font-size:11px;color:var(--dim)">empty</span>';
      return;
    }
    let h = '';
    for (let i = 0; i < stack.length; i++) {
      h += `<div class="pda-cell${i === 0 ? ' top' : ''}">${stack[i]}</div>`;
    }
    document.getElementById('pda-stack').innerHTML = h;
  }

  // ── UI update ──

  function updateUI() {
    if (currentType === 'CFG') return;
    document.getElementById('sc').textContent = M.states.size;

    // State list
    let sh = '';
    for (const [, s] of M.states) {
      const isReject = currentType === 'TM' && s.id === M._rejectId;
      const dot  = isReject ? 'reject'
        : s.isStart && s.isAccept ? 'both'
        : s.isAccept ? 'accept'
        : s.isStart  ? 'start' : 'normal';
      const tags = (s.isStart ? '▶ ' : '') + (s.isAccept ? '★' : '') + (isReject ? ' ✕' : '');
      sh += `<div class="sitem${selId === s.id ? ' sel' : ''}" onclick="App._select('${s.id}')">
        <div class="sdot ${dot}"></div>
        <span style="font-family:monospace;font-size:12px">${esc(s.label)}</span>
        ${tags.trim() ? `<span class="stags">${tags.trim()}</span>` : ''}
      </div>`;
    }
    document.getElementById('state-list').innerHTML =
      sh || '<div style="font-size:12px;color:var(--dim);padding:3px">No states — click canvas to add</div>';

    if (currentType === 'TM') {
      // TM uses its own transition UI
      _updateTmTransUI();
      document.getElementById('alpha-disp').textContent =
        `${M.states.size} states · blank = '${M.blank}'`;
    } else if (currentType === 'PDA') {
      // PDA uses its own transition UI
      _updatePdaTransUI();
      const al = [...(M.alphabet ?? [])].sort().join(', ');
      const sal = [...(M.stackAlphabet ?? [])].sort().join(', ');
      document.getElementById('alpha-disp').textContent =
        `Σ = {${al || '∅'}} · Γ = {${sal || '∅'}}`;
    } else {
      // Selects
      let opts = '<option value="">Select…</option>';
      for (const [, s] of M.states) opts += `<option value="${s.id}">${esc(s.label)}</option>`;
      document.getElementById('t-from').innerHTML = opts;
      document.getElementById('t-to').innerHTML   = opts;

      // Transition list
      let th = '';
      for (const t of M.getTransitions()) {
        const fl = M.states.get(t.from)?.label ?? t.from;
        const tl = M.states.get(t.to)?.label   ?? t.to;
        th += `<div class="titem">
          <span class="lbl">${esc(fl)}</span>
          <span class="sym">─${esc(t.symbol)}→</span>
          <span class="lbl">${esc(tl)}</span>
          <button class="del" onclick="App._rmTrans('${t.from}','${symEsc(t.symbol)}','${t.to}')" title="Remove">✕</button>
        </div>`;
      }
      document.getElementById('t-list').innerHTML =
        th || '<div style="font-size:11px;color:var(--dim)">No transitions</div>';

      // Alphabet / info bar
      if (currentType === 'GNFA') {
        document.getElementById('alpha-disp').textContent =
          `${M.states.size} states · ${M.getTransitions().length} transitions`;
      } else {
        const al = [...(M.alphabet ?? [])].sort().join(', ');
        document.getElementById('alpha-disp').textContent = `Σ = {${al || '∅'}}`;
      }
    }

    // GNFA: update eliminable state dropdown
    if (currentType === 'GNFA') {
      const elim = _gnfa.getEliminable();
      let eopts = '<option value="">— choose —</option>';
      for (const id of elim) {
        const lbl = _gnfa.states.get(id)?.label ?? id;
        eopts += `<option value="${id}">${esc(lbl)}</option>`;
      }
      const sel = document.getElementById('gnfa-elim-sel');
      if (sel) sel.innerHTML = eopts;
    }

    // Delete button
    document.getElementById('del-btn').style.display = selId ? 'flex' : 'none';
  }

  function _select(id) { selId = id; setTool('select'); updateUI(); render(); }

  // ── Clear / Example ──

  function clearAll() {
    if (currentType === 'CFG') {
      const ta = document.getElementById('cfg-textarea');
      if (!cfgSteps && !ta.value) return;
      if (!confirm('Clear grammar?')) return;
      ta.value = '';
      document.getElementById('cfg-parse-err').textContent = '';
      document.getElementById('cfg-grammar-table').style.display = 'none';
      document.getElementById('cfg-empty-state').style.display   = '';
      document.getElementById('cfg-step-panel').style.display    = 'none';
      document.getElementById('cfg-hint').textContent = 'Enter a context-free grammar in the sidebar';
      document.getElementById('cfg-info').textContent = '';
      cfgSteps = null; cfgStepIdx = 0;
      return;
    }
    if (!M.states.size) return;
    if (!confirm('Clear all states and transitions?')) return;
    _pushUndo();
    M.reset(); selId = null; _cancelLink(); resetSim();
    if (currentType === 'GNFA') document.getElementById('gnfa-result').style.display = 'none';
    if (currentType === 'TM')  { tmReset(); _updateTmTransUI(); }
    if (currentType === 'PDA') { pdaReset(); _updatePdaTransUI(); }
    updateUI(); render();
  }

  function loadExample() {
    if (currentType === 'CFG') {
      document.getElementById('cfg-textarea').value =
        'S -> aSb | AB\nA -> aA | a\nB -> bB | b';
      cfgParse();
      return;
    }
    _pushUndo();
    M.reset(); selId = null; _cancelLink(); resetSim();
    if (currentType === 'TM')  { tmReset(); _updateTmTransUI(); }
    if (currentType === 'PDA') { pdaReset(); }
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2;

    if (currentType === 'NFA') {
      // NFA accepting strings where 2nd-to-last char is 'a'
      const q0 = M.addState(cx - 180, cy, 'q0');
      const q1 = M.addState(cx,       cy, 'q1');
      const q2 = M.addState(cx + 180, cy, 'q2');
      M.setStart(q0.id); M.toggleAccept(q2.id);
      M.addTransition(q0.id, 'a', q0.id);
      M.addTransition(q0.id, 'b', q0.id);
      M.addTransition(q0.id, 'a', q1.id);
      M.addTransition(q1.id, 'a', q2.id);
      M.addTransition(q1.id, 'b', q2.id);
      document.getElementById('status-txt').textContent = 'Example: 2nd-to-last char is "a"';
      updateUI(); render();

    } else if (currentType === 'GNFA') {
      // Load DFA example into _dfa, then import into GNFA
      _dfa.reset();
      const dx = W/2, dy = H/2;
      const q0 = _dfa.addState(dx - 200, dy, 'q0');
      const q1 = _dfa.addState(dx,       dy, 'q1');
      const q2 = _dfa.addState(dx + 200, dy, 'q2');
      _dfa.setStart(q0.id); _dfa.toggleAccept(q2.id);
      _dfa.addTransition(q0.id, 'a', q1.id);
      _dfa.addTransition(q0.id, 'b', q0.id);
      _dfa.addTransition(q1.id, 'a', q1.id);
      _dfa.addTransition(q1.id, 'b', q2.id);
      _dfa.addTransition(q2.id, 'a', q1.id);
      _dfa.addTransition(q2.id, 'b', q0.id);
      _gnfaSourceType = 'DFA';
      document.getElementById('gnfa-src-dfa').classList.add('active');
      document.getElementById('gnfa-src-nfa').classList.remove('active');
      gnfaImport();

    } else if (currentType === 'PDA') {
      // PDA recognising {aⁿbⁿ | n ≥ 1}
      // q0: push A for each 'a'
      // q1: pop A for each 'b'
      // q2: accept (ε-move from q1 when done)
      const q0 = M.addState(cx - 200, cy, 'q0');
      const q1 = M.addState(cx,       cy, 'q1');
      const q2 = M.addState(cx + 200, cy, 'q2');
      M.setStart(q0.id); M.toggleAccept(q2.id);
      // Push A for each a seen
      M.addTransition(q0.id, 'a', 'ε', 'A', q0.id);
      // First b: pop A, move to q1
      M.addTransition(q0.id, 'b', 'A', 'ε', q1.id);
      // Subsequent b's: pop A, stay in q1
      M.addTransition(q1.id, 'b', 'A', 'ε', q1.id);
      // ε-move to accept when done reading
      M.addTransition(q1.id, 'ε', 'ε', 'ε', q2.id);
      _updatePdaTransUI();
      document.getElementById('status-txt').textContent = 'Example: recognises aⁿbⁿ (n≥1)';
      updateUI(); render();

    } else if (currentType === 'TM') {
      // TM recognising 0*1*: reads 0s then 1s, rejects if 0 appears after a 1
      // States: q0 (read 0s), q1 (read 1s), qA (accept), qR (reject)
      const q0 = M.addState(cx - 240, cy, 'q0');
      const q1 = M.addState(cx - 60,  cy, 'q1');
      const qA = M.addState(cx + 120, cy - 70, 'qA');
      const qR = M.addState(cx + 120, cy + 70, 'qR');
      M.setStart(q0.id);
      M.toggleAccept(qA.id);
      M.setReject(qR.id);
      // q0: reading 0s
      M.addTransition(q0.id, '0', '0', 'R', q0.id);  // stay in q0 on 0
      M.addTransition(q0.id, '1', '1', 'R', q1.id);  // switch to q1 on 1
      M.addTransition(q0.id, '_', '_', 'S', qA.id);  // blank → accept (all 0s or empty)
      // q1: reading 1s
      M.addTransition(q1.id, '1', '1', 'R', q1.id);  // stay in q1 on 1
      M.addTransition(q1.id, '_', '_', 'S', qA.id);  // blank → accept
      M.addTransition(q1.id, '0', '0', 'S', qR.id);  // 0 after 1 → reject
      _updateTmTransUI();
      document.getElementById('status-txt').textContent = 'Example: recognises 0*1*';
      updateUI(); render();

    } else {
      // DFA accepting {a,b}* strings ending with 'ab'
      const q0 = M.addState(cx - 200, cy, 'q0');
      const q1 = M.addState(cx,       cy, 'q1');
      const q2 = M.addState(cx + 200, cy, 'q2');
      M.setStart(q0.id); M.toggleAccept(q2.id);
      M.addTransition(q0.id, 'a', q1.id);
      M.addTransition(q0.id, 'b', q0.id);
      M.addTransition(q1.id, 'a', q1.id);
      M.addTransition(q1.id, 'b', q2.id);
      M.addTransition(q2.id, 'a', q1.id);
      M.addTransition(q2.id, 'b', q0.id);
      document.getElementById('status-txt').textContent = 'Example: ends in "ab"';
      updateUI(); render();
    }
  }

  // ── Export / Import via URL hash ──

  function exportLink() {
    const type = currentType;
    // states: [id, x, y, label, flags]  flags: bit0=isStart, bit1=isAccept, bit2=isReject
    const states = [...M.states.values()].map(s => [
      s.id, Math.round(s.x), Math.round(s.y), s.label,
      (s.isStart ? 1 : 0) | (s.isAccept ? 2 : 0) | (s.isReject ? 4 : 0)
    ]);

    let delta;
    if (type === 'PDA')
      delta = M.delta.map(t => [t.from, t.input, t.pop, t.push, t.to]);
    else if (type === 'TM')
      delta = M.getTransitions().map(t => [t.from, t.readChar, t.writeChar, t.dir, t.to]);
    else
      delta = M.getTransitions().map(t => [t.from, t.symbol, t.to]);

    const payload = { v: 1, t: type, q: states, d: delta };
    if (type === 'GNFA') payload.qa = M._acceptId;
    if (type === 'TM')   payload.qr = M._rejectId;

    const encoded = _b64enc(JSON.stringify(payload));
    const url = new URL(window.location.href);
    url.hash = 'a=' + encoded;

    const btn = document.getElementById('export-btn');
    navigator.clipboard.writeText(url.toString())
      .then(() => {
        if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '🔗 Copy Link'; }, 2000); }
      })
      .catch(() => { prompt('Copy this link:', url.toString()); });
  }

  function exportLatex() {
    const states = [...M.states.values()];
    if (states.length === 0) {
      navigator.clipboard.writeText('% No states to export').catch(() => {});
      return;
    }

    const SCALE = 1 / 80; // canvas px → TikZ cm

    const xs = states.map(s => s.x);
    const ys = states.map(s => s.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    function coord(x, y) {
      const tx = +((x - minX) * SCALE).toFixed(2);
      const ty = +(-(y - minY) * SCALE).toFixed(2); // flip Y axis
      return `(${tx}, ${ty})`;
    }

    // Escape special LaTeX characters; replace ε with \varepsilon
    function esc(s) {
      if (s == null) return '';
      return String(s)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/\{/g, '\\{').replace(/\}/g, '\\}')
        .replace(/&/g, '\\&').replace(/\$/g, '\\$')
        .replace(/#/g, '\\#').replace(/%/g, '\\%')
        .replace(/_/g, '\\_').replace(/\^/g, '\\^{}').replace(/~/g, '\\textasciitilde{}')
        .replace(/ε/g, '$\\varepsilon$');
    }

    // TikZ requires node names to be alphanumeric
    function nodeId(id) { return id.replace(/[^a-zA-Z0-9]/g, ''); }

    // State node declarations
    const stateLines = states.map(s => {
      const opts = ['state'];
      if (s.isStart)  opts.push('initial');
      if (s.isAccept) opts.push('accepting');
      if (s.isReject) opts.push('accepting'); // closest TikZ equivalent
      return `  \\node[${opts.join(', ')}] (${nodeId(s.id)}) at ${coord(s.x, s.y)} {${esc(s.label)}};`;
    });

    // Collect edges: group labels by from→to pair
    const edgeMap = new Map(); // "from|||to" → string[]
    function addEdge(from, to, label) {
      const key = `${from}|||${to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push(label);
    }

    const type = currentType;
    if (type === 'PDA') {
      for (const t of M.delta)
        addEdge(t.from, t.to, `${esc(t.input)}, ${esc(t.pop)}/${esc(t.push)}`);
    } else if (type === 'TM') {
      for (const t of M.getTransitions())
        addEdge(t.from, t.to, `${esc(t.readChar)}/${esc(t.writeChar)}, ${t.dir}`);
    } else {
      for (const t of M.getTransitions())
        addEdge(t.from, t.to, esc(t.symbol));
    }

    // Build \path edge lines
    const edgeLines = [];
    for (const [key, labels] of edgeMap) {
      const [from, to] = key.split('|||');
      const isSelf   = from === to;
      const isBidir  = !isSelf && edgeMap.has(`${to}|||${from}`);
      const label    = (type === 'PDA' && labels.length > 1)
        ? `\\shortstack{${labels.join(' \\\\\\\\ ')}}`
        : labels.join(', ');
      const opts     = isSelf ? '[loop above] ' : isBidir ? '[bend left=20] ' : '';
      edgeLines.push(`    (${nodeId(from)}) edge ${opts}node {${label}} (${nodeId(to)})`);
    }

    const lines = [
      '\\begin{tikzpicture}[',
      '  ->,',
      '  >=stealth,',
      '  shorten >=1pt,',
      '  auto,',
      '  initial text={}',
      ']',
      '',
      '  % States',
      ...stateLines,
    ];

    if (edgeLines.length > 0) {
      lines.push('', '  % Transitions', '  \\path');
      edgeLines.forEach((line, i) =>
        lines.push(line + (i === edgeLines.length - 1 ? ';' : ''))
      );
    }

    lines.push('', '\\end{tikzpicture}');

    const latex = lines.join('\n');
    const btn = document.getElementById('latex-btn');
    navigator.clipboard.writeText(latex)
      .then(() => {
        if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '⟨/⟩ Export LaTeX'; }, 2000); }
      })
      .catch(() => { prompt('Copy this LaTeX:', latex); });
  }

  function exportTuple() {
    const states = [...M.states.values()];
    if (states.length === 0) {
      navigator.clipboard.writeText('% No states to export').catch(() => {});
      return;
    }

    const type = currentType;

    // Convert a symbol to a LaTeX math-mode string
    function ms(sym) {
      if (sym == null) return '?';
      if (sym === 'ε') return '\\varepsilon';
      if (sym === M.blank) return '\\sqcup';
      if (sym === '#') return '\\#';
      return String(sym);
    }

    // Format a list of state objects as a LaTeX set: \{ q_0, q_1 \}
    function stateSet(stateList) {
      if (stateList.length === 0) return '\\emptyset';
      return '\\{' + stateList.map(s => s.label).join(', ') + '\\}';
    }

    // Format a list of raw symbols as a LaTeX set
    function symSet(syms) {
      if (syms.length === 0) return '\\emptyset';
      return '\\{' + syms.map(ms).join(', ') + '\\}';
    }

    const startState   = states.find(s => s.isStart);
    const startLabel   = startState?.label ?? '?';
    const acceptStates = states.filter(s => s.isAccept);

    let latex = '';

    // ── DFA / NFA ──────────────────────────────────────────────────────────
    if (type === 'DFA' || type === 'NFA') {
      const alpha = [...M.alphabet].sort();

      // NFA: add ε column when ε-transitions exist (ε is excluded from M.alphabet)
      let hasEps = false;
      if (type === 'NFA') {
        for (const k of M.delta.keys()) {
          if (k.slice(k.indexOf(',') + 1) === 'ε') { hasEps = true; break; }
        }
      }
      const tableAlpha = hasEps ? [...alpha, 'ε'] : [...alpha];

      const colSpec   = 'c|' + 'c'.repeat(tableAlpha.length || 1);
      const headerRow = tableAlpha.map(ms).join(' & ');

      const tableRows = [];
      for (const s of states) {
        const cells = [s.label];
        for (const sym of tableAlpha) {
          if (type === 'DFA') {
            const toId = M.delta.get(`${s.id},${sym}`);
            cells.push(toId ? (M.states.get(toId)?.label ?? '-') : '-');
          } else {
            const toSet = M.delta.get(`${s.id},${sym}`);
            if (!toSet || toSet.size === 0) {
              cells.push('\\emptyset');
            } else {
              const lbls = [...toSet].map(id => M.states.get(id)?.label ?? '?');
              cells.push('\\{' + lbls.join(', ') + '\\}');
            }
          }
        }
        tableRows.push('    ' + cells.join(' & ') + ' \\\\');
      }

      const lines = [
        '\\[',
        `  M = (Q, \\Sigma, \\delta, ${startLabel}, F)`,
        '\\]',
        'where',
        '\\begin{itemize}',
        `  \\item $Q = ${stateSet(states)}$`,
        `  \\item $\\Sigma = ${symSet(alpha)}$`,
        `  \\item $${startLabel}$ is the start state`,
        `  \\item $F = ${stateSet(acceptStates)}$ is the set of accepting states`,
        '  \\item $\\delta$ is as follows:',
        '  \\[',
        `  \\begin{array}{${colSpec}}`,
        `    \\delta & ${headerRow} \\\\`,
        '    \\hline',
        ...tableRows,
        '  \\end{array}',
        '  \\]',
        '\\end{itemize}',
      ];
      latex = lines.join('\n');

    // ── PDA ────────────────────────────────────────────────────────────────
    } else if (type === 'PDA') {
      const alpha      = [...M.alphabet].sort();
      const stackAlpha = [...M.stackAlphabet].sort();

      // Group transitions by (from, input, pop) to produce set-valued output
      const transMap = new Map();
      for (const t of M.delta) {
        const fl  = M.states.get(t.from)?.label ?? t.from;
        const key = `${fl}\x01${t.input}\x01${t.pop}`;
        if (!transMap.has(key)) transMap.set(key, { fl, input: t.input, pop: t.pop, results: [] });
        const tl = M.states.get(t.to)?.label ?? t.to;
        transMap.get(key).results.push(`(${tl},\\, ${ms(t.push)})`);
      }
      const transLines = [...transMap.values()].map(({ fl, input, pop, results }) => {
        const rhs = results.length === 1 ? `\\{${results[0]}\\}` : `\\{${results.join(',\\, ')}\\}`;
        return `    \\delta(${fl},\\, ${ms(input)},\\, ${ms(pop)}) &= ${rhs} \\\\`;
      });

      const lines = [
        '\\[',
        `  M = (Q, \\Sigma, \\Gamma, \\delta, ${startLabel}, F)`,
        '\\]',
        'where',
        '\\begin{itemize}',
        `  \\item $Q = ${stateSet(states)}$`,
        `  \\item $\\Sigma = ${symSet(alpha)}$`,
        `  \\item $\\Gamma = ${symSet(stackAlpha)}$ is the stack alphabet`,
        `  \\item $${startLabel}$ is the start state`,
        `  \\item $F = ${stateSet(acceptStates)}$ is the set of accepting states`,
        '  \\item $\\delta$ is as follows:',
        '  \\[',
        '  \\begin{aligned}',
        ...transLines,
        '  \\end{aligned}',
        '  \\]',
        '\\end{itemize}',
      ];
      latex = lines.join('\n');

    // ── TM ─────────────────────────────────────────────────────────────────
    } else if (type === 'TM') {
      const tmTrans     = M.getTransitions(); // {from, readChar, writeChar, dir, to}
      const rejectState = M._rejectId ? M.states.get(M._rejectId) : null;
      const rejectLabel = rejectState?.label ?? '?';
      const acceptLabel = acceptStates[0]?.label ?? '?';

      const readSyms = [...new Set(tmTrans.map(t => t.readChar))].sort();

      // Σ = non-blank tape symbols; Γ = all tape symbols
      const allSyms = new Set();
      for (const t of tmTrans) { allSyms.add(t.readChar); allSyms.add(t.writeChar); }
      const tapeAlpha  = [...allSyms].sort();
      const inputAlpha = tapeAlpha.filter(s => s !== M.blank);

      const colSpec   = 'c|' + 'c'.repeat(readSyms.length || 1);
      const headerRow = readSyms.map(ms).join(' & ');

      const tableRows = [];
      for (const s of states) {
        const cells = [s.label];
        for (const rc of readSyms) {
          const t = tmTrans.find(tt => tt.from === s.id && tt.readChar === rc);
          if (t) {
            const nl = M.states.get(t.to)?.label ?? '?';
            cells.push(`(${nl},\\, ${ms(t.writeChar)},\\, \\mathrm{${t.dir}})`);
          } else {
            cells.push('-');
          }
        }
        tableRows.push('    ' + cells.join(' & ') + ' \\\\');
      }

      const lines = [
        '\\[',
        `  M = (Q, \\Sigma, \\Gamma, \\delta, ${startLabel}, q_{\\mathrm{accept}}, q_{\\mathrm{reject}})`,
        '\\]',
        'where',
        '\\begin{itemize}',
        `  \\item $Q = ${stateSet(states)}$`,
        `  \\item $\\Sigma = ${symSet(inputAlpha)}$ is the input alphabet`,
        `  \\item $\\Gamma = ${symSet(tapeAlpha)}$ is the tape alphabet (blank $= ${ms(M.blank)}$)`,
        `  \\item $${startLabel}$ is the start state`,
        `  \\item $${acceptLabel}$ is the accept state`,
        `  \\item $${rejectLabel}$ is the reject state`,
        '  \\item $\\delta$ is as follows:',
        '  \\[',
        `  \\begin{array}{${colSpec}}`,
        `    \\delta & ${headerRow} \\\\`,
        '    \\hline',
        ...tableRows,
        '  \\end{array}',
        '  \\]',
        '\\end{itemize}',
      ];
      latex = lines.join('\n');

    // ── GNFA ───────────────────────────────────────────────────────────────
    } else if (type === 'GNFA') {
      const acceptState = M._acceptId ? M.states.get(M._acceptId) : null;
      const acceptLabel = acceptState?.label ?? '?';
      const trans = M.getTransitions(); // {from, symbol, to}  (symbol = regex label)

      const transItems = trans.map(t => {
        const fl = M.states.get(t.from)?.label ?? t.from;
        const tl = M.states.get(t.to)?.label   ?? t.to;
        return `  \\item $\\delta(${fl}, ${tl}) = ${t.symbol}$`;
      });

      const lines = [
        '\\[',
        `  M = (Q, \\Sigma, \\delta, ${startLabel}, ${acceptLabel})`,
        '\\]',
        'where',
        '\\begin{itemize}',
        `  \\item $Q = ${stateSet(states)}$`,
        `  \\item $${startLabel}$ is the start state`,
        `  \\item $${acceptLabel}$ is the accept state`,
        '  \\item $\\delta$ is as follows:',
        '  \\begin{itemize}',
        ...transItems,
        '  \\end{itemize}',
        '\\end{itemize}',
      ];
      latex = lines.join('\n');
    }

    if (!latex) {
      navigator.clipboard.writeText('% Export not supported for this type').catch(() => {});
      return;
    }

    const btn = document.getElementById('tuple-btn');
    navigator.clipboard.writeText(latex)
      .then(() => {
        if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '(Q,\u03A3,..) Tuple'; }, 2000); }
      })
      .catch(() => { prompt('Copy this LaTeX:', latex); });
  }

  function _importFromHash() {
    const hash = window.location.hash;
    if (!hash.startsWith('#a=')) return;
    try {
      const payload = JSON.parse(_b64dec(hash.slice(3)));
      if (!payload?.t || !payload?.q) return;
      _restoreFromPayload(payload);
    } catch (e) { console.warn('Automata import failed:', e); }
  }

  function _restoreFromPayload(payload) {
    const type = payload.t;
    switchType(type);
    M.reset();

    // Re-populate states directly (bypass addState to preserve original IDs / coords)
    for (const [id, x, y, label, flags] of payload.q) {
      M.states.set(id, { id, x, y, label,
        isStart:  !!(flags & 1),
        isAccept: !!(flags & 2),
        isReject: !!(flags & 4) });
      const num = parseInt(id.replace(/^q/, ''));
      if (!isNaN(num) && num >= M._counter) M._counter = num + 1;
    }

    const startEntry = payload.q.find(([,,,, f]) => f & 1);
    M.startState = startEntry ? startEntry[0] : null;

    if (type === 'PDA') {
      for (const [from, input, pop, push, to] of payload.d) M.addTransition(from, input, pop, push, to);
    } else if (type === 'TM') {
      for (const [from, read, write, dir, to] of payload.d) M.addTransition(from, read, write, dir, to);
      if (payload.qr) {
        M._rejectId = payload.qr;
        const rs = M.states.get(payload.qr);
        if (rs) rs.isReject = true;
      }
    } else {
      for (const [from, symbol, to] of payload.d) M.addTransition(from, symbol, to);
      if (type === 'GNFA' && payload.qa) M._acceptId = payload.qa;
    }

    updateUI(); render();
  }

  // ── Zoom ──

  function _setZoom(z) {
    renderer.setZoom(z);
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(renderer._zoom * 100) + '%';
    render();
  }
  function zoomIn()    { _setZoom(renderer._zoom * 1.25); }
  function zoomOut()   { _setZoom(renderer._zoom / 1.25); }
  function zoomReset() { _setZoom(1); }

  function _setFontSize(f) {
    renderer.setFontSize(f);
    const el = document.getElementById('font-size-level');
    if (el) el.textContent = Math.round(renderer._fontSize * 100) + '%';
    render();
  }
  function fontSizeUp()    { _setFontSize(renderer._fontSize * 1.25); }
  function fontSizeDown()  { _setFontSize(renderer._fontSize / 1.25); }
  function fontSizeReset() { _setFontSize(1); }

  // ── Theme toggle ──

  function toggleTheme() {
    classic = !classic;
    document.body.classList.toggle('classic', classic);
    renderer.setClassic(classic);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = classic ? '🌙 Dark' : '☀ Classic';
    render();
  }

  // ── Type switching ──

  function switchType(type) {
    document.querySelectorAll('#nav button').forEach(b => b.classList.remove('active'));
    document.querySelector(`#nav button[data-type="${type}"]`).classList.add('active');

    currentType = type;
    selId = null;
    _cancelLink();
    resetSim();
    tmReset();
    pdaReset();

    // Point M at the right instance (CFG has no automata model — M keeps previous value)
    if (type === 'DFA')  M = _dfa;
    if (type === 'NFA')  M = _nfa;
    if (type === 'GNFA') M = _gnfa;
    if (type === 'PDA')  M = _pda;
    if (type === 'TM')   M = _tm;

    const isCFG = type === 'CFG';

    // Toggle canvas vs CFG display
    const dfaView = document.getElementById('dfa-view');
    const cfgView = document.getElementById('cfg-view');
    if (dfaView) dfaView.style.display = isCFG ? 'none' : '';
    if (cfgView) cfgView.style.display = isCFG ? 'flex' : 'none';

    // Show/hide type-specific panels
    const canvasToolPanel = document.getElementById('canvas-tool-panel');
    const statesPanel     = document.getElementById('states-panel');
    const actionsPanel    = document.getElementById('actions-panel');
    const simPanel        = document.getElementById('sim-panel');
    const gnfaPanel       = document.getElementById('gnfa-panel');
    const regTransPanel   = document.getElementById('reg-trans-panel');
    const pdaTransPanel   = document.getElementById('pda-trans-panel');
    const pdaPanel        = document.getElementById('pda-panel');
    const tmTransPanel    = document.getElementById('tm-trans-panel');
    const tmPanel         = document.getElementById('tm-panel');
    const dfaConvertPanel = document.getElementById('dfa-convert-panel');
    const nfaRegexPanel   = document.getElementById('nfa-regex-panel');
    const cfgInputPanel   = document.getElementById('cfg-input-panel');
    const cfgStepPanelEl  = document.getElementById('cfg-step-panel');

    // Canvas-only panels — hidden in CFG mode
    if (canvasToolPanel) canvasToolPanel.style.display = isCFG ? 'none' : '';
    if (statesPanel)     statesPanel.style.display     = isCFG ? 'none' : '';
    if (actionsPanel)    actionsPanel.style.display    = isCFG ? 'none' : '';

    if (simPanel)        simPanel.style.display        = (type === 'DFA' || type === 'NFA') ? '' : 'none';
    if (gnfaPanel)       gnfaPanel.style.display       = type === 'GNFA' ? '' : 'none';
    if (regTransPanel)   regTransPanel.style.display   = (!isCFG && type !== 'TM' && type !== 'PDA') ? '' : 'none';
    if (pdaTransPanel)   pdaTransPanel.style.display   = type === 'PDA' ? '' : 'none';
    if (pdaPanel)        pdaPanel.style.display        = type === 'PDA' ? '' : 'none';
    if (tmTransPanel)    tmTransPanel.style.display    = type === 'TM'  ? '' : 'none';
    if (tmPanel)         tmPanel.style.display         = type === 'TM'  ? '' : 'none';
    if (dfaConvertPanel) dfaConvertPanel.style.display = type === 'DFA' ? '' : 'none';
    if (nfaRegexPanel)   nfaRegexPanel.style.display   = type === 'NFA' ? '' : 'none';

    // CFG panels
    if (cfgInputPanel)  cfgInputPanel.style.display  = isCFG ? '' : 'none';
    if (cfgStepPanelEl) cfgStepPanelEl.style.display = (isCFG && cfgSteps) ? '' : 'none';

    document.getElementById('status-txt').textContent = type + ' mode';

    if (!isCFG) {
      const tSym = document.getElementById('t-sym');
      if (tSym) tSym.placeholder = type === 'GNFA' ? 'e.g. a|b, (ab)*, ε' : 'e.g. a, 0, ε';
      if (type === 'DFA' || type === 'NFA') _gnfaSourceType = type;
      _updateUndoButtons();
      updateUI(); render();
      // If we just left CFG, the canvas may have been resized to 0 while hidden
      // — resize() on next tick after browser reflows the newly-visible canvas
      setTimeout(resize, 0);
    }
  }

  // ── CFG controller ───────────────────────────────────────────────────────────

  function cfgParse() {
    const text  = (document.getElementById('cfg-textarea')?.value ?? '').trim();
    const errEl = document.getElementById('cfg-parse-err');
    errEl.textContent = '';

    if (!text) { errEl.textContent = 'Enter a grammar first.'; return; }

    try {
      _cfg.parse(text);
      cfgSteps   = _cfg.toCNF();
      cfgStepIdx = 0;
      document.getElementById('cfg-step-panel').style.display = '';
      document.getElementById('cfg-hint').textContent =
        `Parsed · ${_cfg.variables.length} variable${_cfg.variables.length !== 1 ? 's' : ''} · ${cfgSteps.length} steps`;
      cfgUpdateDisplay(0);
    } catch(e) {
      errEl.textContent = e.message;
      cfgSteps = null;
      document.getElementById('cfg-grammar-table').style.display = 'none';
      document.getElementById('cfg-empty-state').style.display   = '';
      document.getElementById('cfg-step-panel').style.display    = 'none';
    }
  }

  function cfgStepFwd() {
    if (!cfgSteps || cfgStepIdx >= cfgSteps.length - 1) return;
    cfgStepIdx++;
    cfgUpdateDisplay(cfgStepIdx);
  }

  function cfgStepBack() {
    if (!cfgSteps || cfgStepIdx <= 0) return;
    cfgStepIdx--;
    cfgUpdateDisplay(cfgStepIdx);
  }

  function cfgUpdateDisplay(idx) {
    if (!cfgSteps || !cfgSteps.length) return;
    const step = cfgSteps[idx];
    const g    = step.grammar;

    document.getElementById('cfg-step-ind').textContent  = `${idx + 1} / ${cfgSteps.length}`;
    document.getElementById('cfg-step-name').textContent = step.title;
    document.getElementById('cfg-step-desc').textContent = step.description;
    document.getElementById('cfg-btn-bk').disabled  = idx === 0;
    document.getElementById('cfg-btn-fwd').disabled = idx === cfgSteps.length - 1;

    let html = '';
    for (const v of g.variables) {
      const bodies = g.productions.get(v) ?? [];

      const prodHtml = bodies.map(body => {
        const key = _cfgBodyKey(v, body);
        const cls = step.added.has(key)    ? ' added'
                  : step.modified.has(key) ? ' modified'
                  : '';
        return `<span class="cfg-prod${cls}">${esc(body.join(' '))}</span>`;
      }).join('<span class="cfg-prod-sep"> | </span>');

      const removedForVar = [...step.removed].filter(k => k.startsWith(v + ':'));
      const removedHtml = removedForVar
        .map(k => `<span class="cfg-prod removed">${esc(k.slice(v.length + 1))}</span>`)
        .join('<span class="cfg-prod-sep"> | </span>');

      const allProds = [prodHtml, removedHtml].filter(Boolean).join(
        removedHtml && prodHtml ? '<span class="cfg-prod-sep"> | </span>' : '');

      const rowAdded    = [...step.added].some(k => k.startsWith(v + ':'));
      const rowModified = [...step.modified].some(k => k.startsWith(v + ':'));
      const rowCls = rowAdded ? ' added' : rowModified ? ' modified' : '';
      const varNewCls = rowAdded && !cfgSteps[Math.max(0, idx-1)].grammar.variables.includes(v) ? ' var-new' : '';

      html += `<tr class="cfg-row${rowCls}">
        <td class="var-col${varNewCls}">${esc(v)}</td>
        <td class="prod-col">${allProds || '<span style="color:var(--dim)">∅</span>'}</td>
      </tr>`;
    }

    const tbody = document.getElementById('cfg-grammar-body');
    tbody.innerHTML = html ||
      '<tr><td colspan="2" class="cfg-empty" style="padding:20px">Empty grammar</td></tr>';

    document.getElementById('cfg-grammar-table').style.display = '';
    document.getElementById('cfg-empty-state').style.display   = 'none';
    document.getElementById('cfg-info').textContent =
      `${step.name} · ${g.variables.length} var${g.variables.length !== 1 ? 's' : ''} · ` +
      `${g.terminals.size} terminal${g.terminals.size !== 1 ? 's' : ''}`;
  }

  // ── Regex → NFA  (Thompson's Construction) ──────────────────────────────

  function regexToNfa() {
    const input = (document.getElementById('nfa-regex-input')?.value ?? '').trim();
    if (!input) { alert('Enter a regular expression first.'); return; }
    try {
      const built = _thompsonBuild(input);
      _pushUndo();
      _nfa.reset(); selId = null; resetSim();
      for (const [id, s] of built.states) _nfa.states.set(id, { ...s });
      _nfa._counter   = built._counter;
      _nfa.startState = built.startState;
      for (const [key, toSet] of built.delta) _nfa.delta.set(key, new Set(toSet));
      _nfa._rebuildAlphabet();
      switchType('NFA');
      document.getElementById('status-txt').textContent = `Thompson's NFA: ${input}`;
      updateUI(); render();
    } catch (err) {
      alert('Regex parse error: ' + err.message);
    }
  }

  function _thompsonBuild(regex) {
    const states = new Map();   // id → {id,x,y,label,isStart,isAccept}
    const delta  = new Map();   // "from,sym" → Set<toId>
    let counter  = 0;

    function newState() {
      const id = `q${counter++}`;
      states.set(id, { id, x: 0, y: 0, label: id, isStart: false, isAccept: false });
      return id;
    }
    function addEdge(from, sym, to) {
      const key = `${from},${sym}`;
      if (!delta.has(key)) delta.set(key, new Set());
      delta.get(key).add(to);
    }

    // Thompson fragment builders — each fragment: { start, accept }
    function fLiteral(sym) {
      const s = newState(), a = newState();
      addEdge(s, sym, a);
      return { start: s, accept: a };
    }
    function fConcat(f1, f2) {
      addEdge(f1.accept, 'ε', f2.start);
      states.get(f1.accept).isAccept = false;
      return { start: f1.start, accept: f2.accept };
    }
    function fUnion(f1, f2) {
      const s = newState(), a = newState();
      addEdge(s, 'ε', f1.start); addEdge(s, 'ε', f2.start);
      addEdge(f1.accept, 'ε', a); addEdge(f2.accept, 'ε', a);
      states.get(f1.accept).isAccept = false;
      states.get(f2.accept).isAccept = false;
      return { start: s, accept: a };
    }
    function fStar(f) {
      const s = newState(), a = newState();
      addEdge(s, 'ε', f.start); addEdge(s, 'ε', a);
      addEdge(f.accept, 'ε', f.start); addEdge(f.accept, 'ε', a);
      states.get(f.accept).isAccept = false;
      return { start: s, accept: a };
    }
    function fPlus(f) {
      const s = newState(), a = newState();
      addEdge(s, 'ε', f.start);
      addEdge(f.accept, 'ε', f.start); addEdge(f.accept, 'ε', a);
      states.get(f.accept).isAccept = false;
      return { start: s, accept: a };
    }
    function fOptional(f) {
      const s = newState(), a = newState();
      addEdge(s, 'ε', f.start); addEdge(s, 'ε', a);
      addEdge(f.accept, 'ε', a);
      states.get(f.accept).isAccept = false;
      return { start: s, accept: a };
    }

    // ── Recursive-descent parser ──────────────────────────────────
    let pos = 0;
    const src = regex;

    function parseExpr() {
      let left = parseTerm();
      while (pos < src.length && src[pos] === '|') {
        pos++;
        left = fUnion(left, parseTerm());
      }
      return left;
    }
    function parseTerm() {
      let f = null;
      while (pos < src.length && src[pos] !== '|' && src[pos] !== ')') {
        const factor = parseFactor();
        f = f ? fConcat(f, factor) : factor;
      }
      if (!f) f = fLiteral('ε');
      return f;
    }
    function parseFactor() {
      let atom = parseAtom();
      while (pos < src.length && (src[pos] === '*' || src[pos] === '+' || src[pos] === '?')) {
        const op = src[pos++];
        if (op === '*') atom = fStar(atom);
        else if (op === '+') atom = fPlus(atom);
        else atom = fOptional(atom);
      }
      return atom;
    }
    function parseAtom() {
      if (pos >= src.length) throw new Error('Unexpected end of expression');
      const ch = src[pos];
      if (ch === ')' || ch === '|') throw new Error(`Unexpected '${ch}' at position ${pos}`);
      if (ch === '(') {
        pos++;
        const inner = parseExpr();
        if (pos >= src.length || src[pos] !== ')') throw new Error('Missing closing parenthesis');
        pos++;
        return inner;
      }
      pos++;
      return fLiteral(ch);   // handles ε, ∅, any char
    }

    const frag = parseExpr();
    if (pos < src.length) throw new Error(`Unexpected '${src[pos]}' at position ${pos}`);

    states.get(frag.start).isStart  = true;
    states.get(frag.accept).isAccept = true;

    // ── Layout: BFS-layered, left→right ──────────────────────────
    const layer = new Map();
    layer.set(frag.start, 0);
    const bfsQ = [frag.start];
    while (bfsQ.length) {
      const cur = bfsQ.shift();
      const ly  = layer.get(cur);
      for (const [key, toSet] of delta) {
        if (key.slice(0, key.indexOf(',')) !== cur) continue;
        for (const to of toSet) {
          if (!layer.has(to)) { layer.set(to, ly + 1); bfsQ.push(to); }
        }
      }
    }
    for (const id of states.keys()) if (!layer.has(id)) layer.set(id, 0);

    const byLayer = new Map();
    for (const [id, ly] of layer) {
      if (!byLayer.has(ly)) byLayer.set(ly, []);
      byLayer.get(ly).push(id);
    }
    const maxLy  = Math.max(...layer.values(), 0);
    const cellW  = Math.max(110, Math.min(160, (canvas.width  - 80) / (maxLy + 2)));
    const halfH  = canvas.height / 2;

    for (const [ly, ids] of byLayer) {
      ids.forEach((id, i) => {
        const s = states.get(id);
        s.x = 60 + ly * cellW + cellW / 2;
        s.y = halfH + (i - (ids.length - 1) / 2) * 100;
      });
    }

    return { states, delta, _counter: counter, startState: frag.start };
  }

  // ── DFA Minimization  (Table-filling / Myhill-Nerode) ────────────────────

  function minimizeDfa() {
    if (_dfa.states.size === 0) { alert('DFA is empty.'); return; }
    if (!_dfa.startState)       { alert('DFA has no start state.'); return; }

    const alpha = [..._dfa.alphabet].sort();
    if (alpha.length === 0) {
      alert('DFA has no transitions — nothing to minimize.');
      return;
    }

    // ── Capture current DFA before any modification ───────────────
    const stateData = new Map([..._dfa.states]);
    const deltaMap  = new Map([..._dfa.delta]);
    const startId   = _dfa.startState;

    // BFS reachability from start
    const reachable = new Set([startId]);
    const rQ = [startId];
    while (rQ.length) {
      const cur = rQ.shift();
      for (const sym of alpha) {
        const nxt = deltaMap.get(`${cur},${sym}`);
        if (nxt && !reachable.has(nxt)) { reachable.add(nxt); rQ.push(nxt); }
      }
    }

    const states = [...stateData.keys()].filter(id => reachable.has(id));
    const n      = states.length;
    if (n === 0) { alert('No reachable states.'); return; }

    // ── Table-filling ─────────────────────────────────────────────
    // marked[i][j]  (i < j)  = true → states[i] and states[j] are distinguishable
    const marked = Array.from({ length: n }, () => new Array(n).fill(false));

    // Base: one accept, one non-accept
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (!!stateData.get(states[i]).isAccept !== !!stateData.get(states[j]).isAccept)
          marked[i][j] = true;

    // Propagate
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (marked[i][j]) continue;
          for (const sym of alpha) {
            const di = deltaMap.get(`${states[i]},${sym}`);
            const dj = deltaMap.get(`${states[j]},${sym}`);
            if (!di || !dj || di === dj) continue;
            const ki = states.indexOf(di), kj = states.indexOf(dj);
            if (ki === -1 || kj === -1) continue;
            const lo = Math.min(ki, kj), hi = Math.max(ki, kj);
            if (lo !== hi && marked[lo][hi]) { marked[i][j] = true; changed = true; break; }
          }
        }
      }
    }

    // ── Union-Find to collect equivalence classes ─────────────────
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    function merge(x, y) { parent[find(x)] = find(y); }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (!marked[i][j]) merge(i, j);

    // representative state id for each reachable state id
    const stateToRep = new Map();
    for (let i = 0; i < n; i++) stateToRep.set(states[i], states[find(i)]);

    const reps = [...new Set([...stateToRep.values()])];
    const prevCount = n;

    // ── Rebuild minimized DFA ─────────────────────────────────────
    _pushUndo();
    _dfa.reset();
    selId = null; resetSim();

    const cols  = 4;
    const colW  = Math.max(130, Math.min(190, (canvas.width - 80) / cols));
    let   lidx  = 0;
    function nextPos() {
      const c = lidx % cols, r = Math.floor(lidx / cols);
      lidx++;
      return { x: 55 + c * colW + colW / 2, y: 80 + r * 110 };
    }

    const repToDfaId = new Map();
    for (const rep of reps) {
      // Collect labels of all states merged into this repr
      const groupLabels = states
        .filter(id => stateToRep.get(id) === rep)
        .map(id => stateData.get(id)?.label ?? id);
      const label = groupLabels.length > 1 ? `{${groupLabels.join(',')}}` : (stateData.get(rep)?.label ?? rep);
      const p  = nextPos();
      const ns = _dfa.addState(p.x, p.y, label);
      repToDfaId.set(rep, ns.id);
      if (stateData.get(rep)?.isAccept) _dfa.toggleAccept(ns.id);
    }

    _dfa.setStart(repToDfaId.get(stateToRep.get(startId)));

    const addedTrans = new Set();
    for (const rep of reps) {
      const newId = repToDfaId.get(rep);
      for (const sym of alpha) {
        const oldNext = deltaMap.get(`${rep},${sym}`);
        if (!oldNext || !reachable.has(oldNext)) continue;
        const nextRep = stateToRep.get(oldNext);
        if (!nextRep) continue;
        const key = `${newId},${sym}`;
        if (!addedTrans.has(key)) {
          addedTrans.add(key);
          _dfa.addTransition(newId, sym, repToDfaId.get(nextRep));
        }
      }
    }

    document.getElementById('status-txt').textContent =
      `Minimized: ${reps.length} state${reps.length !== 1 ? 's' : ''} (was ${prevCount})`;
    updateUI(); render();
  }

  // ── Expose ──
  return {
    init,
    setTool,
    _setStart, _toggleAccept, _del, _rename, _select, _rmTrans,
    _startLink, _cancelLink,
    _symConfirm, _symCancel,
    deleteSelected, addTransition,
    runSim, resetSim, onSimInput, stepBack, stepFwd,
    clearAll, loadExample, toggleTheme, exportLink, exportLatex, exportTuple,
    zoomIn, zoomOut, zoomReset,
    fontSizeUp, fontSizeDown, fontSizeReset,
    gnfaImport, gnfaSetSource, gnfaEliminate, gnfaAutoRegex,
    nfaToDfa,
    _rmPdaTrans,
    pdaAddTransition, pdaInit, pdaReset, pdaStepFwd, pdaStepBack, pdaRunFull,
    _setReject, _rmTmTrans,
    tmAddTransition, tmInit, tmReset, tmStepFwd, tmStepBack, tmRunFull,
    undo, redo,
    regexToNfa, minimizeDfa,
    cfgParse, cfgStepFwd, cfgStepBack
  };
})();

// ── Global helpers wired to inline onclick attributes ──
window.App            = App;
window.setTool        = t  => App.setTool(t);
window.addTransition  = () => App.addTransition();
window.runSim         = () => App.runSim();
window.resetSim       = () => App.resetSim();
window.onSimInput     = () => App.onSimInput();
window.stepBack       = () => App.stepBack();
window.stepFwd        = () => App.stepFwd();
window.clearAll       = () => App.clearAll();
window.loadExample    = () => App.loadExample();
window.deleteSelected = () => App.deleteSelected();
window.toggleTheme    = () => App.toggleTheme();
window.exportLink     = () => App.exportLink();
window.exportLatex    = () => App.exportLatex();
window.exportTuple    = () => App.exportTuple();
window.zoomIn         = () => App.zoomIn();
window.zoomOut        = () => App.zoomOut();
window.zoomReset      = () => App.zoomReset();
window.fontSizeUp     = () => App.fontSizeUp();
window.fontSizeDown   = () => App.fontSizeDown();
window.fontSizeReset  = () => App.fontSizeReset();
window.gnfaImport     = () => App.gnfaImport();
window.gnfaEliminate  = () => App.gnfaEliminate();
window.gnfaAutoRegex  = () => App.gnfaAutoRegex();
window.gnfaSetSource  = t  => App.gnfaSetSource(t);
window.nfaToDfa       = () => App.nfaToDfa();
window.pdaAddTransition = () => App.pdaAddTransition();
window.pdaInit        = () => App.pdaInit();
window.pdaReset       = () => App.pdaReset();
window.pdaStepFwd     = () => App.pdaStepFwd();
window.pdaStepBack    = () => App.pdaStepBack();
window.pdaRunFull     = () => App.pdaRunFull();
window.tmAddTransition = () => App.tmAddTransition();
window.tmInit         = () => App.tmInit();
window.tmReset        = () => App.tmReset();
window.tmStepFwd      = () => App.tmStepFwd();
window.tmStepBack     = () => App.tmStepBack();
window.tmRunFull      = () => App.tmRunFull();
window.regexToNfa     = () => App.regexToNfa();
window.minimizeDfa    = () => App.minimizeDfa();
window.cfgParse       = () => App.cfgParse();
window.cfgStepFwd     = () => App.cfgStepFwd();
window.cfgStepBack    = () => App.cfgStepBack();

document.addEventListener('DOMContentLoaded', () => App.init());
