// ─── Pattern DSL ──────────────────────────────────────────────────────────────

function parsePattern(patternStr) {
  const raw = patternStr.trim();
  if (!raw) throw new Error('Empty pattern');

  const tokens = raw.split(/\s+/);
  const segments = [];
  const varSet = new Set();

  for (const token of tokens) {
    let chars, exponentStr;

    if (token.startsWith('(')) {
      const m = token.match(/^\(([a-zA-Z0-9]+)\)(?:\^(.+))?$/);
      if (!m) throw new Error(`Invalid grouped segment: "${token}"`);
      chars = m[1];
      exponentStr = m[2];
    } else {
      const ci = token.indexOf('^');
      if (ci === -1) {
        chars = token;
        exponentStr = undefined;
      } else {
        chars = token.substring(0, ci);
        exponentStr = token.substring(ci + 1);
      }
      if (!chars || !/^[a-zA-Z0-9]+$/.test(chars)) {
        throw new Error(`Invalid characters in "${token}"`);
      }
    }

    let coeff = null, varName = null;

    if (exponentStr !== undefined) {
      if (!exponentStr) throw new Error(`Empty exponent in "${token}"`);
      const em = exponentStr.match(/^(\d*)([a-z])$/);
      if (em) {
        coeff = em[1] === '' ? 1 : parseInt(em[1]);
        varName = em[2];
        varSet.add(varName);
      } else if (/^\d+$/.test(exponentStr)) {
        coeff = parseInt(exponentStr);
      } else {
        throw new Error(`Invalid exponent "${exponentStr}" in "${token}"`);
      }
    }

    segments.push({ chars, coeff, var: varName });
  }

  return { segments, variables: [...varSet].sort() };
}

// ─── Pattern helpers ──────────────────────────────────────────────────────────

function expandPattern(segments, assignment) {
  let out = '';
  for (const seg of segments) {
    const reps = seg.var !== null  ? seg.coeff * (assignment[seg.var] ?? 0)
               : seg.coeff !== null ? seg.coeff
               : 1;
    out += seg.chars.repeat(reps);
  }
  return out;
}

/** Check whether str can be decomposed according to segments for ANY variable assignment */
function matchesPattern(str, segments) {
  function tryMatch(pos, si, assignment) {
    if (si === segments.length) return pos === str.length;
    const seg = segments[si];
    const unit = seg.chars;
    const uLen = unit.length;

    // Literal or constant: fixed count
    if (seg.var === null) {
      const reps = seg.coeff ?? 1;
      const tLen = reps * uLen;
      if (pos + tLen > str.length) return false;
      for (let i = 0; i < reps; i++)
        if (str.substring(pos + i * uLen, pos + (i + 1) * uLen) !== unit) return false;
      return tryMatch(pos + tLen, si + 1, assignment);
    }

    // Variable already bound
    if (seg.var in assignment) {
      const reps = seg.coeff * assignment[seg.var];
      const tLen = reps * uLen;
      if (pos + tLen > str.length) return false;
      for (let i = 0; i < reps; i++)
        if (str.substring(pos + i * uLen, pos + (i + 1) * uLen) !== unit) return false;
      return tryMatch(pos + tLen, si + 1, assignment);
    }

    // Try all possible values for this variable
    const remaining = str.length - pos;
    const maxReps = Math.floor(remaining / uLen);
    for (let reps = 0; reps <= maxReps; reps++) {
      if (reps > 0 && str.substring(pos + (reps - 1) * uLen, pos + reps * uLen) !== unit) break;
      if (reps % seg.coeff !== 0) continue;
      if (tryMatch(pos + reps * uLen, si + 1, { ...assignment, [seg.var]: reps / seg.coeff }))
        return true;
    }
    return false;
  }

  return tryMatch(0, 0, {});
}

function getAlphabet(segments) {
  const s = new Set();
  for (const seg of segments) for (const c of seg.chars) s.add(c);
  return s;
}

// ─── Cartesian product ────────────────────────────────────────────────────────

function cartesianAssignments(variables, maxValues) {
  if (!variables.length) return [{}];
  const results = [];
  function go(i, cur) {
    if (i === variables.length) { results.push({ ...cur }); return; }
    const v = variables[i];
    for (let val = 0; val <= (maxValues[v] ?? 0); val++) {
      cur[v] = val;
      go(i + 1, cur);
    }
  }
  go(0, {});
  return results;
}

// ─── Positive generation ──────────────────────────────────────────────────────

function generatePositive(segments, variables, maxValues) {
  const assignments = cartesianAssignments(variables, maxValues);
  const seen = new Set();
  const cases = [];
  for (const a of assignments) {
    const tape = expandPattern(segments, a);
    if (seen.has(tape)) continue;
    seen.add(tape);
    const label = variables.length
      ? variables.map(v => `${v}=${a[v]}`).join(' ')
      : 'literal';
    cases.push({ tape, label });
  }
  return cases;
}

// ─── Negative generation ──────────────────────────────────────────────────────

function fmtAssign(a) {
  return Object.keys(a).sort().map(k => `${k}=${a[k]}`).join(',');
}

function smallAssignments(variables, maxValues, cap) {
  const sm = {};
  for (const v of variables) sm[v] = Math.min(maxValues[v], cap);
  return cartesianAssignments(variables, sm);
}

function segmentReps(seg, assignment) {
  if (seg.var !== null) return seg.coeff * (assignment[seg.var] ?? 0);
  return seg.coeff ?? 1;
}

function negSwapSegments(segments, variables, maxValues) {
  if (segments.length < 2) return [];
  const cases = [];
  const assigns = smallAssignments(variables, maxValues, 3);

  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i], b = segments[i + 1];
    if (a.chars === b.chars && a.coeff === b.coeff && a.var === b.var) continue;

    const swapped = [...segments];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];

    for (const assign of assigns) {
      const tape = expandPattern(swapped, assign);
      if (tape) cases.push({ tape, label: `swap(${i}\u2194${i + 1}) ${fmtAssign(assign)}` });
    }
  }
  return cases;
}

function negSharedVarMismatch(segments, variables, maxValues) {
  const cases = [];

  for (const v of variables) {
    const indices = [];
    segments.forEach((s, i) => { if (s.var === v) indices.push(i); });
    if (indices.length < 2) continue;

    const otherVars = variables.filter(u => u !== v);
    const otherMax = {};
    for (const u of otherVars) otherMax[u] = Math.min(maxValues[u], 2);
    const otherAssigns = otherVars.length ? cartesianAssignments(otherVars, otherMax) : [{}];

    const vMax = Math.min(maxValues[v], 4);

    for (const oa of otherAssigns) {
      for (let v1 = 0; v1 <= vMax; v1++) {
        for (let v2 = 0; v2 <= vMax; v2++) {
          if (v1 === v2) continue;

          let tape = '';
          let occ = 0;
          for (const seg of segments) {
            let reps;
            if (seg.var === v) {
              reps = seg.coeff * (occ === 0 ? v1 : v2);
              occ++;
            } else if (seg.var !== null) {
              reps = seg.coeff * (oa[seg.var] ?? 0);
            } else {
              reps = seg.coeff ?? 1;
            }
            tape += seg.chars.repeat(reps);
          }
          cases.push({ tape, label: `${v}\u2260(${v1},${v2})` });
        }
      }
    }
  }
  return cases;
}

function negExtraChars(segments, variables, maxValues) {
  const alpha = [...getAlphabet(segments)];
  const assigns = smallAssignments(variables, maxValues, 2);
  const unique = [...new Set(assigns.map(a => expandPattern(segments, a)).filter(s => s))];

  const cases = [];
  for (const s of unique) {
    for (const c of alpha) {
      cases.push({ tape: s + c, label: `trail "${trunc(s)}"+${c}` });
      cases.push({ tape: c + s, label: `lead ${c}+"${trunc(s)}"` });
    }
  }
  return cases;
}

function negForeignChars(segments, variables, maxValues) {
  const alpha = getAlphabet(segments);
  const pool = ['x', 'z', '#', '0', '1', 'c'].filter(c => !alpha.has(c));
  if (!pool.length) return [];

  const fc = pool[0];
  const assigns = smallAssignments(variables, maxValues, 2);
  const strs = [...new Set(assigns.map(a => expandPattern(segments, a)).filter(s => s))];

  const cases = [{ tape: fc, label: `foreign "${fc}"` }];
  for (const s of strs) {
    cases.push({ tape: fc + s, label: `"${fc}"+${trunc(s)}` });
    cases.push({ tape: s + fc, label: `${trunc(s)}+"${fc}"` });
    if (s.length >= 2) {
      const mid = s.length >> 1;
      cases.push({ tape: s.slice(0, mid) + fc + s.slice(mid), label: `${trunc(s)}\u2295foreign` });
    }
  }
  return cases;
}

function negInterleave(segments, variables, maxValues) {
  if (segments.length < 2) return [];
  const cases = [];
  const assigns = smallAssignments(variables, maxValues, 3);

  for (const a of assigns) {
    const parts = segments.map(seg => seg.chars.repeat(segmentReps(seg, a)));

    for (let i = 0; i < parts.length - 1; i++) {
      if (!parts[i] || !parts[i + 1]) continue;
      if (segments[i].chars === segments[i + 1].chars) continue;

      const p1 = parts[i], p2 = parts[i + 1];
      const minLen = Math.min(p1.length, p2.length);
      let inter = '';
      for (let j = 0; j < minLen; j++) inter += p1[j] + p2[j];
      inter += p1.slice(minLen) + p2.slice(minLen);

      const tape = parts.slice(0, i).join('') + inter + parts.slice(i + 2).join('');
      if (tape) cases.push({ tape, label: `interleave(${i},${i + 1}) ${fmtAssign(a)}` });
    }
  }
  return cases;
}

function negPartial(segments, variables, maxValues) {
  if (segments.length < 2) return [];
  const cases = [];
  const assigns = smallAssignments(variables, maxValues, 3);

  for (const a of assigns) {
    const parts = segments.map(seg => seg.chars.repeat(segmentReps(seg, a)));
    const full = parts.join('');
    if (full.length < 2) continue;

    const dropLast = parts.slice(0, -1).join('');
    if (dropLast) cases.push({ tape: dropLast, label: `drop-last ${fmtAssign(a)}` });

    const dropFirst = parts.slice(1).join('');
    if (dropFirst) cases.push({ tape: dropFirst, label: `drop-first ${fmtAssign(a)}` });

    const mid = full.length >> 1;
    if (mid > 0 && mid < full.length)
      cases.push({ tape: full.slice(0, mid), label: `truncate ${fmtAssign(a)}` });
  }
  return cases;
}

function trunc(s, max) {
  max = max || 10;
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function generateNegative(segments, variables, maxValues) {
  const generators = [
    negSwapSegments,
    negSharedVarMismatch,
    negExtraChars,
    negForeignChars,
    negInterleave,
    negPartial,
  ];

  const seen = new Set();
  const cases = [];

  for (const gen of generators) {
    for (const c of gen(segments, variables, maxValues)) {
      if (seen.has(c.tape)) continue;
      seen.add(c.tape);
      if (!matchesPattern(c.tape, segments)) {
        cases.push(c);
      }
    }
  }

  return cases;
}

// ─── Headless runner ──────────────────────────────────────────────────────────

function runHeadless(rules, initState, tapeStr, acceptPrefix, stepLimit) {
  const m = new TuringMachine();
  m.load(rules, tapeStr, initState);

  while (m.steps < stepLimit) {
    const r = m.step();

    if (r === 'halted') {
      const accepted = m.state.startsWith(acceptPrefix);
      return { accepted, steps: m.steps, finalState: m.state, reason: `halted: "${m.state}"` };
    }
    if (r === 'no-rule') {
      const sym = m.get(m.head);
      const symKey = sym === ' ' ? '_' : sym;
      return {
        accepted: false, steps: m.steps, finalState: m.state,
        reason: `no-rule: state="${m.state}" sym="${symKey}"`
      };
    }
  }

  return { accepted: false, steps: m.steps, finalState: m.state, reason: 'step limit exceeded' };
}

// ─── Test orchestration ───────────────────────────────────────────────────────

function runTestSuite(rules, initState, patternStr, max, acceptPrefix, stepLimit) {
  const { segments, variables } = parsePattern(patternStr);
  const maxValues = {};
  for (const v of variables) maxValues[v] = max;

  const pos = generatePositive(segments, variables, maxValues);
  const neg = generateNegative(segments, variables, maxValues);
  const results = [];

  for (const tc of pos) {
    const r = runHeadless(rules, initState, tc.tape, acceptPrefix, stepLimit);
    results.push({ ...tc, expected: true,  ...r, pass: r.accepted === true  });
  }
  for (const tc of neg) {
    const r = runHeadless(rules, initState, tc.tape, acceptPrefix, stepLimit);
    results.push({ ...tc, expected: false, ...r, pass: r.accepted === false });
  }

  return results;
}
