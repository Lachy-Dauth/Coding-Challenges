// ─── 2D → 1D Converter ───────────────────────────────────────────────────────

// Symbol name safe for state names (_ → BL to avoid confusion)
function sn(s) { return s === '_' ? 'BL' : s; }

// State-name suffix for a carried symbol in the carry chain
function carrySuffix(sym) {
  if (sym === '_') return 'BL';
  if (sym === '$') return 'END';
  if (sym === '#') return 'HASH';
  if (sym === "#'") return 'HASHP';
  if (sym.endsWith('^')) return sn(sym.slice(0, -1)) + 'h';
  if (sym.endsWith('~')) return sn(sym.slice(0, -1)) + 't';
  return sn(sym);
}

// All possible tape symbols (regular, hatted, tilded, separators)
function allTapeSymbols(alphabet) {
  const syms = [];
  for (const s of alphabet) syms.push(s, s + '^', s + '~');
  syms.push('#', "#'", '$');
  return syms;
}

function extractAlphabet(programSrc, tapeStr) {
  const { rules } = parseProgram(programSrc);
  const syms = new Set();
  for (const r of rules) {
    if (r.symbol !== '*') syms.add(r.symbol);
    if (r.newSymbol !== '*') syms.add(r.newSymbol);
  }
  const { cells } = parseTapeString(tapeStr);
  for (const { ch } of cells) {
    if (ch !== '') syms.add(ch);
  }
  syms.add('_');
  return [...syms];
}

function generateInitPhase(alphabet, initState) {
  const lines = [];
  lines.push('; === INIT ===');
  lines.push('; Transforms raw input into: $ w1^ w2 ... wn $');
  lines.push('');

  const nonBlank = alphabet.filter(s => s !== '_');

  for (const s of nonBlank) {
    lines.push(`init ${s} $ r init_hat_${sn(s)}`);
  }
  lines.push(`init _ $ r init_hat_BL`);
  lines.push('');

  for (const s of alphabet) {
    for (const t of nonBlank) {
      lines.push(`init_hat_${sn(s)} ${t} ${s}^ r init_carry_${sn(t)}`);
    }
    lines.push(`init_hat_${sn(s)} _ ${s}^ r init_end`);
    lines.push('');
  }

  for (const s of alphabet) {
    for (const t of nonBlank) {
      lines.push(`init_carry_${sn(s)} ${t} ${s} r init_carry_${sn(t)}`);
    }
    lines.push(`init_carry_${sn(s)} _ ${s} r init_end`);
    lines.push('');
  }

  lines.push('init_end _ $ l init_rewind');
  lines.push('');

  // rewind: hatted symbols stop, everything else scan left
  for (const s of alphabet) {
    lines.push(`init_rewind ${s}^ ${s}^ * ${initState}_findHat`);
  }
  lines.push(`init_rewind * * l init_rewind`);

  return lines.join('\n');
}

function generateFindHatAndWrite(alphabet, state, rules2D) {
  const lines = [];
  lines.push(`; === FIND HAT + WRITE (state: ${state}) ===`);

  // Go left to $ first, then scan right to find hat
  lines.push(`${state}_findHat $ $ r ${state}_scanHat`);
  lines.push(`${state}_findHat * * l ${state}_findHat`);
  lines.push('');

  // Scan right: hatted symbols branch to write, skip everything else
  const handled = new Set();
  for (const s of alphabet) {
    const rule = matchRule(rules2D, state, s);
    if (!rule) continue;
    const key = sn(s);
    if (handled.has(key)) continue;
    handled.add(key);

    const writeSym = rule.newSymbol === '*' ? s : rule.newSymbol;
    const dir = rule.dir;
    const newState = rule.newState === '*' ? state : rule.newState;

    let nextPhase;
    if (newState.startsWith('halt')) {
      nextPhase = newState;
    } else if (dir === '*') {
      nextPhase = `${newState}_findHat`;
    } else {
      nextPhase = `${newState}_${dir.toUpperCase()}_peek`;
    }

    lines.push(`${state}_scanHat ${s}^ ${s}^ * ${state}_${key}_write`);
    lines.push(`; ${state} reads ${s} -> write ${writeSym}, ${dir}, -> ${newState}`);
    lines.push(`${state}_${key}_write ${s}^ ${writeSym}^ * ${nextPhase}`);
    lines.push('');
  }
  lines.push(`${state}_scanHat * * r ${state}_scanHat`);

  return lines.join('\n');
}

function generatePeekPhase(newState, dir) {
  const DIR = dir.toUpperCase();
  const prefix = `${newState}_${DIR}_peek`;
  const expandPrefix = `${newState}_${DIR}_expand`;
  const lines = [];
  lines.push(`; === ${DIR} PEEK (state: ${newState}) ===`);

  const movePrefix = `${newState}_${DIR}_move`;
  if (dir === 'u') {
    // Move right from hat to start scan
    lines.push(`${prefix} * * r ${prefix}_scan`);
    lines.push(`${prefix}_scan $ $ * ${expandPrefix}_start`);  // last block → expand → move
    lines.push(`${prefix}_scan # # * ${movePrefix}`);           // not last → move
    lines.push(`${prefix}_scan * * r ${prefix}_scan`);
  } else if (dir === 'd') {
    // Move left from hat to check if first block
    lines.push(`${prefix} * * l ${prefix}_scan`);
    lines.push(`${prefix}_scan $ $ * ${newState}_findHat`);     // first block → boundary clamp
    lines.push(`${prefix}_scan # # * ${movePrefix}`);            // not first → move down
    lines.push(`${prefix}_scan * * l ${prefix}_scan`);
  } else if (dir === 'r') {
    // Move right one cell from hat, check if at edge of block
    lines.push(`${prefix} * * r ${prefix}_check`);
    lines.push(`${prefix}_check # # l ${expandPrefix}_start`);   // at edge → expand all blocks
    lines.push(`${prefix}_check $ $ l ${expandPrefix}_start`);   // at edge (single block)
    lines.push(`${prefix}_check * * * ${movePrefix}`);            // not at edge → move right
  } else {
    // L: placeholder
    lines.push(`${prefix} * * l ${prefix}_check`);
    lines.push(`${prefix}_check $ $ * ${newState}_findHat`);     // left edge → boundary clamp
    lines.push(`${prefix}_check # # * ${newState}_findHat`);     // left edge → boundary clamp
    lines.push(`${prefix}_check * * * ${movePrefix}`);            // not at edge → move left
  }

  return lines.join('\n');
}

function generateExpandPhase(alphabet, newState, dir) {
  const DIR = dir.toUpperCase();
  const prefix = `${newState}_${DIR}_expand`;
  const lines = [];
  lines.push(`; === ${DIR} EXPAND (state: ${newState}) ===`);

  if (dir === 'u') {
    lines.push(`; Ping-pong: mark one old-block cell, add one new-block cell`);

    // Entry: at $, replace with #', write initial $ one right
    lines.push(`${prefix}_start $ #' r ${prefix}_initEnd`);
    lines.push(`${prefix}_initEnd _ $ l ${prefix}_goLeft`);
    lines.push('');

    // Go left to left boundary of hat's block
    lines.push(`${prefix}_goLeft $ $ r ${prefix}_mark`);
    lines.push(`${prefix}_goLeft # # r ${prefix}_mark`);
    lines.push(`${prefix}_goLeft * * l ${prefix}_goLeft`);
    lines.push('');

    // Mark: scan right, mark first unmarked cell
    // Regular symbols → mark with '
    for (const s of alphabet) {
      lines.push(`${prefix}_mark ${s} ${s}' r ${prefix}_goRight`);
    }
    // Hatted symbols → mark with ', use hat variant (adds _~ in new block)
    for (const s of alphabet) {
      lines.push(`${prefix}_mark ${s}^ ${s}^' r ${prefix}_goRight_hat`);
    }
    // Hit #' → all cells marked, finalize
    lines.push(`${prefix}_mark #' # l ${prefix}_unmark`);
    // Skip already-marked cells (s', s^', etc.)
    lines.push(`${prefix}_mark * * r ${prefix}_mark`);
    lines.push('');

    // Go right to $, replace with _, write $ one right
    lines.push(`${prefix}_goRight $ _ r ${prefix}_addEnd`);
    lines.push(`${prefix}_goRight * * r ${prefix}_goRight`);
    lines.push('');

    // Hat column variant: write _~ instead of _
    lines.push(`${prefix}_goRight_hat $ _~ r ${prefix}_addEnd`);
    lines.push(`${prefix}_goRight_hat * * r ${prefix}_goRight_hat`);
    lines.push('');

    // Write new $ after added cell, go left to repeat
    lines.push(`${prefix}_addEnd _ $ l ${prefix}_goLeft`);
    lines.push('');

    // Unmark: replace s' → s, s^' → s^
    for (const s of alphabet) {
      lines.push(`${prefix}_unmark ${s}' ${s} l ${prefix}_unmark`);
      lines.push(`${prefix}_unmark ${s}^' ${s}^ l ${prefix}_unmark`);
    }
    const movePrefix = `${newState}_${DIR}_move`;
    lines.push(`${prefix}_unmark $ $ * ${movePrefix}`);
    lines.push(`${prefix}_unmark # # * ${movePrefix}`);
    lines.push(`${prefix}_unmark * * l ${prefix}_unmark`);

  } else if (dir === 'r') {
    // R_expand: insert one blank at end of EVERY block
    // Find each #, replace with _ and carry #' right (shifting rest of tape).
    // Repeat for each #. Then expand final $. Replace #' with #.
    lines.push(`; Carry-chain: find each #, shift right, repeat`);
    lines.push('');

    // Entry: go left to $ (start of tape)
    lines.push(`${prefix}_start $ $ r ${prefix}_findSep`);
    lines.push(`${prefix}_start * * l ${prefix}_start`);
    lines.push('');

    // Scan right for next unmarked #
    lines.push(`${prefix}_findSep # _ r ${prefix}_carry_HASHP`);   // found #: replace with _, carry #'
    lines.push(`${prefix}_findSep $ _ r ${prefix}_placeEnd`);      // no more #: expand final $
    lines.push(`${prefix}_findSep * * r ${prefix}_findSep`);       // skip (#' and all others)
    lines.push('');

    // Carry chain: each symbol gets a carry state
    const all = allTapeSymbols(alphabet);
    for (const carried of all) {
      const cs = carrySuffix(carried);
      const carryState = `${prefix}_carry_${cs}`;

      if (carried === '$') {
        // Carrying $, next cell is blank (past end) → write $, go back to scan
        lines.push(`${carryState} _ $ l ${prefix}_backToStart`);
        continue;
      }

      // For each possible read symbol: write carried, carry read, move right
      for (const readSym of all) {
        const rs = carrySuffix(readSym);
        lines.push(`${carryState} ${readSym} ${carried} r ${prefix}_carry_${rs}`);
      }
    }
    lines.push('');

    // After carry chain ends, go back to start to find next #
    lines.push(`${prefix}_backToStart $ $ r ${prefix}_findSep`);
    lines.push(`${prefix}_backToStart * * l ${prefix}_backToStart`);
    lines.push('');

    // Expand final $: write _ where $ was, place $ one right
    lines.push(`${prefix}_placeEnd _ $ l ${prefix}_cleanup`);
    lines.push('');

    // Cleanup: replace all #' with #, then transition to move
    lines.push(`${prefix}_cleanup #' # l ${prefix}_cleanup`);
    const movePrefix = `${newState}_${DIR}_move`;
    lines.push(`${prefix}_cleanup $ $ * ${movePrefix}`);
    lines.push(`${prefix}_cleanup * * l ${prefix}_cleanup`);
  }

  return lines.join('\n');
}

function generateMovePhase(alphabet, newState, dir) {
  const DIR = dir.toUpperCase();
  const prefix = `${newState}_${DIR}_move`;
  const lines = [];
  lines.push(`; === ${DIR} MOVE (state: ${newState}) ===`);

  if (dir === 'u') {
    // Go left to $ then scan right to find hat
    lines.push(`${prefix} $ $ r ${prefix}_scanHat`);
    lines.push(`${prefix} * * l ${prefix}`);
    lines.push('');

    // Find hat: replace s^ with s~, then scan right for tilde in next block
    for (const s of alphabet) {
      lines.push(`${prefix}_scanHat ${s}^ ${s}~ r ${prefix}_findTilde`);
    }
    lines.push(`${prefix}_scanHat * * r ${prefix}_scanHat`);
    lines.push('');

    // Find tilde in next block (right): replace t~ with t^
    for (const s of alphabet) {
      lines.push(`${prefix}_findTilde ${s}~ ${s}^ * ${newState}_findHat`);
    }
    lines.push(`${prefix}_findTilde * * r ${prefix}_findTilde`);
  } else if (dir === 'd') {
    // Go right to $ then scan left to find hat
    lines.push(`${prefix} $ $ l ${prefix}_scanHat`);
    lines.push(`${prefix} * * r ${prefix}`);
    lines.push('');

    // Find hat: replace s^ with s~, then scan left for tilde in previous block
    for (const s of alphabet) {
      lines.push(`${prefix}_scanHat ${s}^ ${s}~ l ${prefix}_findTilde`);
    }
    lines.push(`${prefix}_scanHat * * l ${prefix}_scanHat`);
    lines.push('');

    // Find tilde in previous block (left): replace t~ with t^
    for (const s of alphabet) {
      lines.push(`${prefix}_findTilde ${s}~ ${s}^ * ${newState}_findHat`);
    }
    lines.push(`${prefix}_findTilde * * l ${prefix}_findTilde`);
  } else if (dir === 'r') {
    // Shift ALL ^ and ~ markers one cell right
    // Scan left-to-right; when a marker is found, remove it and add it to the next cell

    // Go left to $, then scan right
    lines.push(`${prefix} $ $ r ${prefix}_scan`);
    lines.push(`${prefix} * * l ${prefix}`);
    lines.push('');

    // Scan: find hatted or tilded symbols
    for (const s of alphabet) {
      lines.push(`${prefix}_scan ${s}^ ${s} r ${prefix}_addHat`);
    }
    for (const s of alphabet) {
      lines.push(`${prefix}_scan ${s}~ ${s} r ${prefix}_addTilde`);
    }
    lines.push(`${prefix}_scan $ $ l ${newState}_findHat`);   // done, all markers shifted
    lines.push(`${prefix}_scan * * r ${prefix}_scan`);
    lines.push('');

    // Add hat to next cell
    for (const s of alphabet) {
      lines.push(`${prefix}_addHat ${s} ${s}^ r ${prefix}_scan`);
    }
    lines.push('');

    // Add tilde to next cell
    for (const s of alphabet) {
      lines.push(`${prefix}_addTilde ${s} ${s}~ r ${prefix}_scan`);
    }
  } else if (dir === 'l') {
    // Shift ALL ^ and ~ markers one cell left
    // Scan right-to-left; when a marker is found, remove it and add it to the previous cell

    // Go right to $, then scan left
    lines.push(`${prefix} $ $ l ${prefix}_scan`);
    lines.push(`${prefix} * * r ${prefix}`);
    lines.push('');

    // Scan: find hatted or tilded symbols
    for (const s of alphabet) {
      lines.push(`${prefix}_scan ${s}^ ${s} l ${prefix}_addHat`);
    }
    for (const s of alphabet) {
      lines.push(`${prefix}_scan ${s}~ ${s} l ${prefix}_addTilde`);
    }
    lines.push(`${prefix}_scan $ $ * ${newState}_findHat`);   // done, all markers shifted
    lines.push(`${prefix}_scan * * l ${prefix}_scan`);
    lines.push('');

    // Add hat to previous cell
    for (const s of alphabet) {
      lines.push(`${prefix}_addHat ${s} ${s}^ l ${prefix}_scan`);
    }
    lines.push('');

    // Add tilde to previous cell
    for (const s of alphabet) {
      lines.push(`${prefix}_addTilde ${s} ${s}~ l ${prefix}_scan`);
    }
  }

  return lines.join('\n');
}

function generate1DProgram(alphabet, rules2D, initState) {
  const parts = [];

  // Phase 0: init
  parts.push(generateInitPhase(alphabet, initState));

  // Collect all 2D states
  const states2D = new Set();
  for (const r of rules2D) {
    states2D.add(r.state);
  }

  // Phase 1+2: findHat + write for every 2D state
  for (const st of states2D) {
    if (st.startsWith('halt')) continue;
    parts.push(generateFindHatAndWrite(alphabet, st, rules2D));
  }

  // Phase 3: peek + expand + move for each unique (newState, dir) pair
  const peeksGenerated = new Set();
  for (const rule of rules2D) {
    const dir = rule.dir;
    const newState = rule.newState === '*' ? rule.state : rule.newState;
    if (newState.startsWith('halt') || dir === '*') continue;

    const peekKey = `${newState}_${dir.toUpperCase()}`;
    if (peeksGenerated.has(peekKey)) continue;
    peeksGenerated.add(peekKey);

    parts.push(generatePeekPhase(newState, dir));
    if (dir === 'u' || dir === 'r') {
      parts.push(generateExpandPhase(alphabet, newState, dir));
      parts.push(generateMovePhase(alphabet, newState, dir));
    } else if (dir === 'd' || dir === 'l') {
      parts.push(generateMovePhase(alphabet, newState, dir));
    }
  }

  return parts.join('\n\n');
}

document.getElementById('btn-convert').addEventListener('click', async () => {
  const programSrc = document.getElementById('program').value;
  const tapeStr = document.getElementById('tape-input').value;
  const initState = document.getElementById('init-state').value.trim() || '0';

  const { rules } = parseProgram(programSrc);
  const alphabet = extractAlphabet(programSrc, tapeStr);
  const prog = generate1DProgram(alphabet, rules, initState);

  const p = await compress(prog);
  const params = new URLSearchParams({ p });
  if (tapeStr) params.set('t', tapeStr);
  params.set('s', 'init');

  const url = '../index.html#' + params.toString();
  window.open(url, '_blank');
});
