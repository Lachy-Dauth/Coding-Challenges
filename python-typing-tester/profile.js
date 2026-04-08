/* ============================================================
   profile.js — read-only view over the saved typing history.
   Filters results by mode, difficulty and target; renders a
   summary, a line chart, and a run list.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'python-typing-tester:history:v1';
  const $ = (id) => document.getElementById(id);

  const state = {
    all:     [],                // everything in localStorage
    filters: { mode: 'all', difficulty: 'all', target: 'all' }
  };

  /* ---------- Storage ---------- */

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveHistory(h) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); }
    catch (e) { /* storage disabled — ignore */ }
  }

  /* ---------- Filtering ---------- */

  function applyFilters(h) {
    return h.filter((r) => {
      if (state.filters.mode !== 'all' && r.mode !== state.filters.mode) return false;
      const d = r.difficulty || 'normal';
      if (state.filters.difficulty !== 'all' && d !== state.filters.difficulty) return false;
      if (state.filters.target !== 'all' && String(r.target) !== state.filters.target) return false;
      return true;
    });
  }

  function refresh() {
    const filtered = applyFilters(state.all);
    drawSummary(filtered);
    drawChart(filtered);
    drawRunsList(filtered);
  }

  /* ---------- Summary tiles ---------- */

  function drawSummary(h) {
    if (h.length === 0) {
      $('best-wpm').textContent   = '\u2014';
      $('avg-wpm').textContent    = '\u2014';
      $('avg-acc').textContent    = '\u2014';
      $('total-runs').textContent = '0';
      return;
    }
    const best   = Math.max.apply(null, h.map((r) => r.wpm));
    const avg    = h.reduce((s, r) => s + r.wpm,      0) / h.length;
    const avgAcc = h.reduce((s, r) => s + r.accuracy, 0) / h.length;
    $('best-wpm').textContent   = best.toFixed(0);
    $('avg-wpm').textContent    = avg.toFixed(0);
    $('avg-acc').textContent    = (avgAcc * 100).toFixed(1) + '%';
    $('total-runs').textContent = String(h.length);
  }

  /* ---------- Line chart ---------- */

  function drawChart(h) {
    const canvas = $('progress-chart');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const css    = getComputedStyle(document.documentElement);
    const accent = (css.getPropertyValue('--accent') || '#d9b54a').trim();
    const muted  = (css.getPropertyValue('--muted')  || '#8f877a').trim();
    const text   = (css.getPropertyValue('--text')   || '#ece5d2').trim();

    const pad = { l: 52, r: 20, t: 28, b: 34 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;

    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = '12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WPM', 8, pad.t + 12);

    if (h.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = muted;
      ctx.fillText('No runs match the current filter', W / 2, H / 2);
      return;
    }

    const wpms = h.map((r) => r.wpm);
    const maxW = Math.max(60, Math.ceil(Math.max.apply(null, wpms) / 20) * 20);

    // Grid + y labels
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.18;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = pad.t + plotH - (i / steps) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    for (let i = 0; i <= steps; i++) {
      const y = pad.t + plotH - (i / steps) * plotH;
      ctx.fillText(String(Math.round(maxW * i / steps)), pad.l - 8, y + 4);
    }

    const n = h.length;
    const xAt = (i) => pad.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (w) => pad.t + plotH - (w / maxW) * plotH;

    // Best-so-far trendline
    let best = 0;
    const bestPts = h.map((r) => {
      if (r.wpm > best) best = r.wpm;
      return best;
    });
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    bestPts.forEach((w, i) => {
      const x = xAt(i); const y = yAt(w);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Main WPM line
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    h.forEach((r, i) => {
      const x = xAt(i); const y = yAt(r.wpm);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = accent;
    h.forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(r.wpm), 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Latest label
    const last = h[h.length - 1];
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.fillText(last.wpm.toFixed(0) + ' wpm', pad.l + plotW, pad.t + 12);
  }

  /* ---------- Runs list ---------- */

  function drawRunsList(h) {
    const list = $('runs-list');
    list.innerHTML = '';
    $('run-count').textContent = h.length + ' run' + (h.length === 1 ? '' : 's');

    if (h.length === 0) {
      list.innerHTML = '<div class="empty-state">No runs match the current filter &mdash; finish a test to start tracking progress</div>';
      return;
    }

    const recent = h.slice().reverse();
    recent.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'run-row';
      const d = new Date(r.date);
      const date =
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const modeLabel = r.mode === 'time'
        ? r.target + 's'
        : r.target + ' words';
      row.innerHTML =
        '<span class="run-wpm">'  + r.wpm.toFixed(0) + ' wpm</span>' +
        '<span class="run-acc">'  + (r.accuracy * 100).toFixed(1) + '%</span>' +
        '<span class="run-mode">' + modeLabel + '</span>' +
        '<span class="run-diff">' + (r.difficulty || 'normal') + '</span>' +
        '<span class="run-date">' + date + '</span>' +
        '<button class="run-del" data-id="' + r.date + '" title="Delete this run">\u00d7</button>';
      list.appendChild(row);
    });
  }

  /* ---------- Target filter is dynamic per mode ---------- */

  function populateTargets() {
    // If the mode filter is set, only offer targets that exist for that mode.
    let relevant = state.all;
    if (state.filters.mode !== 'all') {
      relevant = relevant.filter((r) => r.mode === state.filters.mode);
    }
    const targets = Array.from(new Set(relevant.map((r) => r.target)))
      .sort((a, b) => a - b);

    // Relabel the filter group so the unit makes sense in context.
    // "Target" was ambiguous — it means seconds in time mode and words
    // in words mode, so we match whatever mode the user is viewing.
    const labelEl = $('target-filter-label');
    const mode = state.filters.mode;
    if (labelEl) {
      labelEl.textContent =
        mode === 'time'  ? 'Seconds' :
        mode === 'words' ? 'Words'   :
        'Length';
    }
    const unit = mode === 'time' ? 's' : mode === 'words' ? 'w' : '';

    const container = $('target-filter');
    const prevActive = state.filters.target;
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.dataset.val = 'all';
    allBtn.textContent = 'All';
    container.appendChild(allBtn);

    targets.forEach((t) => {
      const b = document.createElement('button');
      b.dataset.val = String(t);
      b.textContent = unit ? String(t) + unit : String(t);
      container.appendChild(b);
    });

    // Restore prior selection if it still exists, otherwise snap to All.
    const valid = prevActive === 'all' || targets.indexOf(Number(prevActive)) !== -1;
    if (!valid) state.filters.target = 'all';
    container.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('active', b.dataset.val === state.filters.target));
  }

  /* ---------- Wiring ---------- */

  function setupFilters() {
    document.querySelectorAll('#filters .seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const type = seg.dataset.filter;
        seg.querySelectorAll('button').forEach((b) =>
          b.classList.toggle('active', b === btn));
        state.filters[type] = btn.dataset.val;
        if (type === 'mode') populateTargets();
        refresh();
      });
    });
  }

  function setupClear() {
    $('clear-all').addEventListener('click', () => {
      if (state.all.length === 0) return;
      if (confirm('Delete all ' + state.all.length + ' saved runs? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        state.all = [];
        populateTargets();
        refresh();
      }
    });
  }

  function setupDeleteRow() {
    $('runs-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.run-del');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      state.all = state.all.filter((r) => r.date !== id);
      saveHistory(state.all);
      populateTargets();
      refresh();
    });
  }

  /* ---------- Init ---------- */
  state.all = loadHistory();
  populateTargets();
  setupFilters();
  setupClear();
  setupDeleteRow();
  refresh();
  window.addEventListener('resize', () => drawChart(applyFilters(state.all)));

}());
