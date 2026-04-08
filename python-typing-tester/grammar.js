/* ============================================================
   grammar.js — weighted generator for Python code snippets.

   Implements a pragmatic subset of the PEG grammar for Python
   (function_def, if/elif/else, for, while, class_def, assignment,
   augmented assignment, expressions, comparisons, calls,
   comprehensions, import, return, lambda, etc).

   Choices in each non-terminal are weighted to favour common
   constructs, so the generated text looks like plausible day-to-day
   Python rather than uniformly-random grammar exploration.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- RNG + weighted pick ----------------------------- */

  function randInt(n) { return Math.floor(Math.random() * n); }
  function pick(arr)  { return arr[randInt(arr.length)]; }
  function coin(p)    { return Math.random() < p; }

  /* ---------- Global recursion depth guard -------------------
     Individual rules track their own local depth, but the safest
     net is a single monotonically-increasing counter that every
     expression entry point checks. If we blow past the limit we
     stop recursing and return a terminal NAME. ---------------- */
  var RECURSION_DEPTH = 0;
  var RECURSION_LIMIT = 8;
  function enterRec() { RECURSION_DEPTH++; }
  function exitRec()  { RECURSION_DEPTH--; }
  function overBudget() { return RECURSION_DEPTH > RECURSION_LIMIT; }

  // weighted([[w, value|thunk], ...]) — returns value (calls thunk)
  function weighted(choices) {
    let total = 0;
    for (let i = 0; i < choices.length; i++) total += choices[i][0];
    let r = Math.random() * total;
    for (let i = 0; i < choices.length; i++) {
      r -= choices[i][0];
      if (r <= 0) {
        const v = choices[i][1];
        return (typeof v === 'function') ? v() : v;
      }
    }
    const last = choices[choices.length - 1][1];
    return (typeof last === 'function') ? last() : last;
  }

  /* ---------- Name pools -------------------------------------- */

  // Variable names — weighted: short classics most common.
  const VAR_NAMES = [
    // short classics
    'x', 'y', 'z', 'i', 'j', 'k', 'n', 'm', 'a', 'b', 'c',
    // everyday work names
    'count', 'total', 'result', 'value', 'values', 'data', 'items', 'item',
    'index', 'num', 'acc', 'temp', 'buf', 'key', 'val', 'name', 'flag',
    'msg', 'err', 'code', 'size', 'length', 'width', 'height', 'offset',
    // collections
    'arr', 'lst', 'nums', 'pairs', 'stack', 'queue', 'seen', 'visited',
    'cache', 'memo', 'table', 'graph', 'tree', 'grid', 'board',
    // tree/graph
    'node', 'left', 'right', 'parent', 'child', 'root', 'head', 'tail',
    'edge', 'nbr', 'src', 'dst',
    // snake_case pairs
    'start_time', 'end_time', 'max_depth', 'min_cost', 'row_count',
    'col_count', 'user_id', 'file_name', 'line_no', 'char_count',
    'word_list', 'prev_state', 'next_state'
  ];

  // Higher weights for the first (shorter, more common) section.
  function genName() {
    return weighted([
      [50, () => VAR_NAMES[randInt(11)]],                // x, y, i...
      [35, () => VAR_NAMES[11 + randInt(27)]],           // count, total...
      [20, () => VAR_NAMES[38 + randInt(16)]],           // arr, stack...
      [15, () => VAR_NAMES[54 + randInt(12)]],           // node, left...
      [10, () => VAR_NAMES[66 + randInt(VAR_NAMES.length - 66)]] // snake
    ]);
  }

  // Function names the generator may *define* (snake_case).
  const FUNC_NAMES = [
    'compute', 'process', 'handle', 'update', 'parse', 'validate',
    'check', 'find', 'build', 'make_node', 'get_value', 'set_value',
    'solve', 'search', 'traverse', 'visit', 'collect', 'run',
    'apply', 'merge', 'split', 'flatten', 'normalize', 'encode',
    'decode', 'load_data', 'save_data', 'dfs', 'bfs', 'step'
  ];

  // Python built-ins frequently called.
  const BUILTINS = [
    'print', 'len', 'range', 'sum', 'min', 'max', 'abs', 'int', 'str',
    'float', 'bool', 'list', 'dict', 'set', 'tuple', 'sorted',
    'reversed', 'enumerate', 'zip', 'map', 'filter', 'any', 'all',
    'type', 'isinstance', 'hasattr', 'getattr', 'round', 'open'
  ];

  // Attribute-style methods.
  const METHODS = [
    'append', 'pop', 'extend', 'insert', 'remove', 'clear', 'copy',
    'keys', 'values', 'items', 'get', 'update', 'split', 'join',
    'strip', 'replace', 'find', 'startswith', 'endswith', 'add',
    'discard', 'index', 'count'
  ];

  const MODULES = [
    'math', 'os', 'sys', 'json', 're', 'random', 'collections',
    'itertools', 'functools', 'time', 'pathlib'
  ];

  const STRING_WORDS = [
    'hello', 'world', 'ok', 'done', 'error', 'warning', 'info',
    'python', 'foo', 'bar', 'baz', 'name', 'value', 'result',
    '/tmp/data', 'config', 'token', 'id'
  ];

  /* ---------- Terminals --------------------------------------- */

  function genNumber() {
    return weighted([
      [5,  () => String(randInt(10))],          // 0..9
      [4,  () => String(randInt(100))],         // 0..99
      [2,  () => String(randInt(1000))],        // 0..999
      [1,  '0'],
      [1,  '1'],
      [1,  '-1'],
      [1,  () => (randInt(100) / 10).toFixed(1)] // 0.0..9.9
    ]);
  }

  function genString() {
    const w = pick(STRING_WORDS);
    return weighted([
      [5, '"' + w + '"'],
      [2, "'" + w + "'"],
      [1, 'f"' + w + ' {' + genName() + '}"']
    ]);
  }

  function genBool() {
    return weighted([[3, 'True'], [3, 'False'], [1, 'None']]);
  }

  /* ---------- Expression layer -------------------------------- */

  // atom :=  NAME | NUMBER | STRING | True/False/None | list | tuple | dict
  function genAtom(depth) {
    if (overBudget()) return genName();
    const rec = depth < 2 ? 1 : 0;
    enterRec();
    try {
      return weighted([
        [8,       () => genName()],
        [5,       () => genNumber()],
        [3,       () => genString()],
        [2,       () => genBool()],
        [rec * 2, () => genList(depth + 1)],
        [rec,     () => genTuple(depth + 1)],
        [rec,     () => genDict(depth + 1)],
        [rec,     () => genSet(depth + 1)]
      ]);
    } finally { exitRec(); }
  }

  function genList(depth) {
    if (coin(0.15)) return '[]';
    const n = weighted([[3, 2], [3, 3], [2, 1], [1, 4]]);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(genExpr(depth + 1));
    return '[' + parts.join(', ') + ']';
  }

  function genTuple(depth) {
    const n = weighted([[3, 2], [2, 3]]);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(genExpr(depth + 1));
    return '(' + parts.join(', ') + ')';
  }

  function genDict(depth) {
    if (coin(0.2)) return '{}';
    const n = weighted([[3, 1], [3, 2], [1, 3]]);
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push(genString() + ': ' + genExpr(depth + 1));
    }
    return '{' + parts.join(', ') + '}';
  }

  function genSet(depth) {
    const n = weighted([[3, 2], [2, 3]]);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(genAtom(depth + 1));
    return '{' + parts.join(', ') + '}';
  }

  // primary := atom (. NAME | [slices] | ( args ))*
  function genPrimary(depth) {
    if (overBudget()) return genName();
    let base = genAtom(depth);
    // chain 0..2 operations — fall off sharply with depth
    const ops = depth >= 2
      ? 0
      : weighted([[10, 0], [3, 1], [1, 2]]);
    for (let i = 0; i < ops; i++) {
      enterRec();
      try {
        base = weighted([
          [3, () => base + '.' + pick(METHODS) + '(' + genCallArgs(depth + 1) + ')'],
          [2, () => base + '[' + genName() + ']'],
          [1, () => base + '.' + genName()]
        ]);
      } finally { exitRec(); }
    }
    return base;
  }

  function genSliceOrIndex(depth) {
    return weighted([
      [5, () => genExpr(depth)],
      [2, () => genExpr(depth) + ':' + genExpr(depth)],
      [1, () => ':' + genExpr(depth)],
      [1, () => genExpr(depth) + ':']
    ]);
  }

  // Call: either builtin(a, b) or user_fn(a, b) or primary.method(...)
  function genCall(depth) {
    const fn = weighted([
      [5, () => pick(BUILTINS)],
      [3, () => pick(FUNC_NAMES)],
      [2, () => genName()]
    ]);
    return fn + '(' + genCallArgs(depth + 1) + ')';
  }

  function genCallArgs(depth) {
    const n = weighted([[2, 0], [5, 1], [3, 2], [1, 3]]);
    const parts = [];
    for (let i = 0; i < n; i++) {
      // At shallow depths allow a full expression; at depth>=2
      // force a simple atom so argument lists don't explode.
      parts.push(depth < 2 ? genExpr(depth) : genAtom(depth));
    }
    return parts.join(', ');
  }

  // factor/term/sum: binary arithmetic
  function genBinOp() {
    return weighted([
      [4, '+'], [3, '-'], [3, '*'], [2, '/'],
      [1, '//'], [1, '%'], [1, '**']
    ]);
  }

  // comparison operator
  function genCmpOp() {
    return weighted([
      [4, '=='], [2, '!='],
      [3, '<'], [3, '>'], [2, '<='], [2, '>='],
      [2, 'in'], [1, 'not in'], [1, 'is'], [1, 'is not']
    ]);
  }

  // expression layer with depth guard
  function genExpr(depth) {
    if (depth === undefined) depth = 0;
    if (depth > 2 || overBudget()) return genAtom(depth);
    enterRec();
    try {
      return weighted([
        [10, () => genPrimary(depth)],
        [5,  () => genPrimary(depth) + ' ' + genBinOp() + ' ' + genPrimary(depth + 1)],
        [4,  () => genCall(depth + 1)],
        [3,  () => genPrimary(depth) + ' ' + genCmpOp() + ' ' + genPrimary(depth + 1)],
        [1,  () => 'not ' + genPrimary(depth + 1)],
        [1,  () => '-' + genPrimary(depth + 1)],
        [1,  () => genPrimary(depth + 1) + ' if ' + genCondition(depth + 1) + ' else ' + genPrimary(depth + 1)],
        [1,  () => 'lambda ' + genName() + ': ' + genPrimary(depth + 1)]
      ]);
    } finally { exitRec(); }
  }

  // condition: disjunction of comparisons, favour short.
  function genCondition(depth) {
    if (depth === undefined) depth = 0;
    if (depth > 2 || overBudget()) {
      return genName() + ' ' + genCmpOp() + ' ' + genNumber();
    }
    const body = () => {
      if (overBudget()) return genName();
      enterRec();
      try {
        return weighted([
          [6, () => genPrimary(depth + 1) + ' ' + genCmpOp() + ' ' + genPrimary(depth + 1)],
          [3, () => genName() + ' ' + genCmpOp() + ' ' + genNumber()],
          [2, () => genName()],
          [1, () => 'not ' + genName()]
        ]);
      } finally { exitRec(); }
    };
    return weighted([
      [8, body],
      [2, () => body() + ' and ' + body()],
      [2, () => body() + ' or ' + body()]
    ]);
  }

  /* ---------- Comprehensions ---------------------------------- */

  function genListComp(depth) {
    const t = genName();
    const body = weighted([
      [3, () => t],
      [2, () => t + ' * ' + genNumber()],
      [2, () => t + ' + ' + genNumber()],
      [1, () => pick(BUILTINS) + '(' + t + ')']
    ]);
    let s = '[' + body + ' for ' + t + ' in ' + genIterable(depth + 1) + ']';
    if (coin(0.35)) {
      s = s.slice(0, -1) + ' if ' + t + ' ' + genCmpOp() + ' ' + genNumber() + ']';
    }
    return s;
  }

  function genIterable(depth) {
    return weighted([
      [4, () => 'range(' + genNumber() + ')'],
      [3, () => genName()],
      [2, () => 'enumerate(' + genName() + ')'],
      [1, () => genList(depth + 1)],
      [1, () => genName() + '.items()']
    ]);
  }

  /* ---------- Simple statements ------------------------------- */

  function genAssignment() {
    const rhs = weighted([
      [5, () => genExpr()],
      [2, () => genCall()],
      [2, () => genListComp(0)]
    ]);
    const lhs = weighted([
      [6, () => genName()],
      [1, () => genName() + ', ' + genName()]
    ]);
    return lhs + ' = ' + rhs;
  }

  function genAugAssignment() {
    const op = weighted([
      [5, '+='], [3, '-='], [2, '*='], [1, '/='],
      [1, '//='], [1, '%='], [1, '**=']
    ]);
    return genName() + ' ' + op + ' ' + genExpr();
  }

  function genReturn() {
    return coin(0.2) ? 'return' : 'return ' + genExpr();
  }

  function genImport() {
    const mod = pick(MODULES);
    return weighted([
      [3, 'import ' + mod],
      [2, 'from ' + mod + ' import ' + pick([
        'sqrt', 'floor', 'ceil', 'pi', 'log', 'sin', 'cos', 'gcd'
      ])],
      [1, 'import ' + mod + ' as ' + mod[0]]
    ]);
  }

  function genRaise() {
    return 'raise ' + pick([
      'ValueError', 'TypeError', 'KeyError', 'IndexError', 'RuntimeError'
    ]) + '(' + genString() + ')';
  }

  function genSimpleStmt() {
    return weighted([
      [8, () => genAssignment()],
      [4, () => genAugAssignment()],
      [4, () => genCall()],
      [3, () => 'print(' + genExpr() + ')'],
      [2, () => genReturn()],
      [1, () => 'pass'],
      [1, () => 'break'],
      [1, () => 'continue'],
      [1, () => genImport()],
      [1, () => genRaise()],
      [1, () => 'assert ' + genCondition()]
    ]);
  }

  /* ---------- Compound statements ----------------------------- */

  // These all return lines joined with '\n'. `indent` is the indent
  // prefix for the *header*; the body is indented further by 4 spaces.
  function genBlock(indent, depth, maxLines) {
    if (maxLines === undefined) maxLines = 3;
    const n = 1 + randInt(maxLines);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(indent + genStmtInBody(indent, depth + 1));
    }
    return out.join('\n');
  }

  // Inside a body we mostly generate simple statements but
  // sometimes a nested compound if the depth budget allows.
  function genStmtInBody(indent, depth) {
    if (depth >= 2) return genSimpleStmt();
    return weighted([
      [10, () => genSimpleStmt()],
      [2,  () => genIfStmt(indent, depth)],
      [2,  () => genForStmt(indent, depth)],
      [1,  () => genWhileStmt(indent, depth)]
    ]);
  }

  // Compound statement produced as a multi-line string.
  function genIfStmt(outer, depth) {
    const body = outer + '    ';
    let s = 'if ' + genCondition() + ':\n' + genBlock(body, depth);
    const extra = weighted([[4, 0], [2, 1], [1, 2]]);
    for (let i = 0; i < extra; i++) {
      s += '\n' + outer + 'elif ' + genCondition() + ':\n' + genBlock(body, depth);
    }
    if (coin(0.45)) {
      s += '\n' + outer + 'else:\n' + genBlock(body, depth);
    }
    return s;
  }

  function genForStmt(outer, depth) {
    const body = outer + '    ';
    const target = weighted([
      [5, () => genName()],
      [1, () => genName() + ', ' + genName()]
    ]);
    return 'for ' + target + ' in ' + genIterable(0) + ':\n' + genBlock(body, depth);
  }

  function genWhileStmt(outer, depth) {
    const body = outer + '    ';
    return 'while ' + genCondition() + ':\n' + genBlock(body, depth);
  }

  function genFuncDef(outer) {
    const body = outer + '    ';
    const name = pick(FUNC_NAMES);
    const nParams = weighted([[2, 0], [4, 1], [4, 2], [2, 3]]);
    const params = [];
    for (let i = 0; i < nParams; i++) params.push(genName());
    // optional default on last param
    if (params.length && coin(0.3)) {
      params[params.length - 1] += '=' + genNumber();
    }
    let s = 'def ' + name + '(' + params.join(', ') + '):\n';
    s += genBlock(body, 1, 4);
    // Most functions return something.
    if (coin(0.6)) s += '\n' + body + genReturn();
    return s;
  }

  function genClassDef(outer) {
    const body = outer + '    ';
    const name = pick([
      'Node', 'Graph', 'Tree', 'Stack', 'Queue', 'Solver',
      'Buffer', 'Cache', 'Parser', 'Counter'
    ]);
    const baseLine = coin(0.3) ? '(object)' : '';
    let s = 'class ' + name + baseLine + ':\n';
    // __init__ with a few attribute assigns
    s += body + 'def __init__(self, ' + genName() + '):\n';
    const inner = body + '    ';
    const k = 1 + randInt(3);
    for (let i = 0; i < k; i++) {
      s += inner + 'self.' + genName() + ' = ' + genExpr() + '\n';
    }
    // optional method
    if (coin(0.6)) {
      s += body + 'def ' + pick(FUNC_NAMES) + '(self):\n';
      s += inner + genSimpleStmt() + '\n';
      s += inner + 'return self.' + genName();
    } else {
      // drop trailing newline
      s = s.replace(/\n$/, '');
    }
    return s;
  }

  /* ---------- Top-level driver -------------------------------- */

  // Produce a top-level "statement unit" (may span many lines).
  function genTopStatement() {
    return weighted([
      [8, () => genSimpleStmt()],
      [4, () => genIfStmt('', 0)],
      [3, () => genForStmt('', 0)],
      [2, () => genWhileStmt('', 0)],
      [4, () => genFuncDef('')],
      [1, () => genClassDef('')]
    ]);
  }

  // Count "words" = whitespace-separated tokens (including
  // across newlines). This is the standard typing-test definition.
  function wordCount(s) {
    const m = s.match(/\S+/g);
    return m ? m.length : 0;
  }

  /**
   * Generate a snippet.
   * @param opts.mode     'time' | 'words'
   * @param opts.target   number of words (words mode) or seconds
   *                      (time mode — used only to estimate length).
   * @param opts.difficulty 'easy' | 'normal' | 'hard'
   *   easy   — mostly simple_stmt (assignments, calls, prints)
   *   normal — full mix (default weights)
   *   hard   — more compound, more depth, more nesting
   */
  function generate(opts) {
    opts = opts || {};
    const mode     = opts.mode     || 'time';
    const target   = opts.target   || (mode === 'time' ? 60 : 30);
    const difficulty = opts.difficulty || 'normal';

    // Words-budget: for words mode this is the exact target
    // (the driver may overshoot by one statement, which is fine —
    // the UI stops accepting input once `target` correct words are
    // typed). For time mode we estimate ~3 words/second and add a
    // generous safety buffer so the user never runs out.
    const budget = mode === 'words'
      ? target
      : Math.max(150, target * 5);

    const topFn = difficulty === 'easy'
      ? () => genSimpleStmt()
      : difficulty === 'hard'
        ? () => weighted([
            [5, () => genFuncDef('')],
            [3, () => genClassDef('')],
            [3, () => genIfStmt('', 0)],
            [3, () => genForStmt('', 0)],
            [2, () => genWhileStmt('', 0)],
            [1, () => genSimpleStmt()]
          ])
        : genTopStatement;

    // Cap the size of any single statement so one oversized block
    // doesn't blow past the target. Reject + regenerate if needed.
    const perStmtCap = Math.max(12, Math.min(30, Math.ceil(budget / 3)));

    const lines = [];
    let words = 0;
    let guard = 0;
    while (words < budget && guard < 4000) {
      guard++;
      RECURSION_DEPTH = 0; // reset per top-level statement
      const stmt = topFn();
      const sw = wordCount(stmt);
      if (sw > perStmtCap) continue;
      lines.push(stmt);
      words += sw;
    }
    let text = lines.join('\n');

    // Normalise trailing whitespace on each line.
    text = text.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n');
    return text;
  }

  /* ---------- Exports ----------------------------------------- */

  global.PyGrammar = {
    generate: generate,
    wordCount: wordCount,
    // exposed for tests / curiosity
    _internal: {
      VAR_NAMES: VAR_NAMES,
      FUNC_NAMES: FUNC_NAMES,
      BUILTINS: BUILTINS,
      genSimpleStmt: genSimpleStmt,
      genExpr: genExpr,
      genTopStatement: genTopStatement
    }
  };

}(typeof window !== 'undefined' ? window : this));
