// Interactive simulator for the docs. It mirrors pickTier() and decide() in src/core/decide.ts
// and evaluateGate() in src/core/approvals.ts, with the tiers of the example config.
(() => {
  const root = document.getElementById('rg-sim');
  if (!root) return;

  const TIERS = ['low', 'medium', 'high', 'critical'];
  const TIER_APPROVALS = [0, 1, 2, 2];
  const PRESETS = [
    { name: 'Docs only', w: [92, 6, 2, 0], floor: -1, agentcfg: true, bot: false, have: 0 },
    { name: 'Normal feature', w: [15, 60, 20, 5], floor: -1, agentcfg: true, bot: false, have: 1 },
    { name: 'Agent touches auth', w: [15, 50, 25, 10], floor: 3, agentcfg: true, bot: true, have: 1 },
    { name: 'Agent changes docs', w: [90, 8, 2, 0], floor: -1, agentcfg: true, bot: true, have: 0 },
  ];

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n.toFixed(2);
  const SVG = ['svg', 'rect', 'line', 'path', 'text'];
  const el = (tag, attrs = {}, text) => {
    const node = SVG.includes(tag)
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const weightInputs = TIERS.map((t, i) => {
    const row = el('div', { class: 'rg-sim__row' });
    const input = el('input', { type: 'range', id: `rg-w${i}`, min: '0', max: '100', step: '1' });
    const out = el('output', { for: `rg-w${i}` });
    row.append(el('label', { for: `rg-w${i}` }, `P(${t})`), input, out);
    $('rg-prob-sliders').append(row);
    return { input, out };
  });
  const floorSel = $('rg-floor');
  floorSel.append(el('option', { value: '-1' }, 'none'));
  TIERS.forEach((t, i) => floorSel.append(el('option', { value: String(i) }, t)));

  const presetButtons = PRESETS.map((p, i) => {
    const b = el('button', { type: 'button', class: 'md-button', 'aria-pressed': 'false' }, p.name);
    b.addEventListener('click', () => applyPreset(i));
    $('rg-presets').append(b);
    return b;
  });

  function applyPreset(i) {
    const p = PRESETS[i];
    p.w.forEach((w, k) => { weightInputs[k].input.value = String(w); });
    $('rg-mode').value = 'enforce';
    $('rg-agentcfg').checked = p.agentcfg;
    floorSel.value = String(p.floor);
    $('rg-bot').checked = p.bot;
    $('rg-have').value = String(p.have);
    presetButtons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    render();
  }

  // The most probable tier. A tie goes to the higher tier.
  function pickTier(p) {
    let best = 0;
    p.forEach((v, i) => { if (v >= p[best]) best = i; });
    return best;
  }

  function readState() {
    const w = weightInputs.map(({ input }) => Number(input.value));
    const sum = w.reduce((a, b) => a + b, 0);
    return {
      p: w.map((x) => Math.round((sum ? x / sum : 0.25) * 100) / 100),
      mode: $('rg-mode').value,
      agentcfg: $('rg-agentcfg').checked,
      floor: Number(floorSel.value),
      bot: $('rg-bot').checked,
      have: Math.max(0, Math.min(9, Math.round(Number($('rg-have').value) || 0))),
    };
  }

  function decide(s) {
    const picked = pickTier(s.p);
    const floor = Math.max(0, s.floor);
    const steps = [
      ['Jev tier (most probable)', TIERS[picked]],
      ['Minimum tier from the rules', s.floor < 0 ? 'none (low)' : TIERS[floor]],
    ];
    const tier = Math.max(floor, picked);
    let required = TIER_APPROVALS[tier];
    let why = `${TIERS[tier]} needs ${required}`;
    if (s.agentcfg && s.bot) {
      steps.push(['Agent PR', 'at least 1 approval']);
      if (required < 1) {
        required = 1;
        why = `minimum for an agent PR; ${TIERS[tier]} needs 0`;
      }
    }
    return { tier, required, steps, picked, why };
  }

  function gate(s, d) {
    let description = `${TIERS[d.tier]}: ${s.have}/${d.required} approvals`;
    if (s.mode === 'shadow') description = `shadow · ${description}`;
    const ok = s.have >= d.required;
    return { state: s.mode === 'shadow' || ok ? 'success' : 'pending', description };
  }

  // Chart: one series, one bar per tier.
  const svg = $('rg-chart');
  const tooltip = $('rg-tooltip');
  const box = $('rg-chart-box');
  const W = 560, H = 250, M = { t: 22, r: 16, b: 50, l: 40 };
  const IW = W - M.l - M.r, IH = H - M.t - M.b;
  const y = (v) => M.t + IH * (1 - v);
  const BAR = 24;

  function barPath(x, yTop, w, h) {
    if (h <= 0.5) return '';
    const r = Math.min(4, h, w / 2);
    return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`;
  }

  function showTip(evt, value, tier) {
    tooltip.replaceChildren();
    const row = el('div');
    row.append(el('span', { class: 'rg-sim__key' }), document.createTextNode(`P(${tier})`));
    tooltip.append(el('strong', {}, fmt(value)), row);
    tooltip.style.display = 'block';
    const b = box.getBoundingClientRect();
    let cx;
    let cy;
    if (evt && 'clientX' in evt && evt.clientX) {
      cx = evt.clientX - b.left;
      cy = evt.clientY - b.top;
    } else {
      const r = evt.target.getBoundingClientRect();
      cx = r.left - b.left + r.width / 2;
      cy = r.top - b.top + 20;
    }
    const tw = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(Math.max(cx - tw / 2, 0), b.width - tw)}px`;
    tooltip.style.top = `${Math.max(cy - tooltip.offsetHeight - 12, 0)}px`;
  }
  const hideTip = () => { tooltip.style.display = 'none'; };

  function drawChart(s, d) {
    svg.replaceChildren();
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(el('line', { class: v === 0 ? 'rg-axis' : 'rg-grid', x1: M.l, x2: M.l + IW, y1: y(v), y2: y(v) }));
      svg.append(el('text', { class: 'rg-tick', x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, v === 0 ? '0' : String(v)));
    }
    const band = IW / TIERS.length;
    TIERS.forEach((t, i) => {
      const x = M.l + i * band + (band - BAR) / 2;
      const v = Math.min(1, s.p[i]);
      const path = barPath(x, y(v), BAR, IH * v);
      if (path) svg.append(el('path', { class: 'rg-bar', d: path }));
      const hit = el('rect', {
        class: 'rg-hit', x: x - 8, y: M.t, width: BAR + 16, height: IH, tabindex: '0',
        'aria-label': `P(${t}): ${fmt(s.p[i])}`,
      });
      hit.addEventListener('pointermove', (e) => showTip(e, s.p[i], t));
      hit.addEventListener('focus', (e) => showTip(e, s.p[i], t));
      hit.addEventListener('pointerleave', hideTip);
      hit.addEventListener('blur', hideTip);
      svg.append(hit);
      const chosen = i === d.picked;
      const cx = M.l + i * band + band / 2;
      svg.append(el('text', { class: `rg-xl${chosen ? ' rg-xl--on' : ''}`, x: cx, y: H - M.b + 18, 'text-anchor': 'middle' }, t));
      if (chosen) {
        svg.append(el('text', { class: 'rg-note', x: cx, y: H - M.b + 34, 'text-anchor': 'middle' }, '▲ Jev picks'));
        svg.append(el('text', { class: 'rg-val', x: cx, y: y(v) - 6, 'text-anchor': 'middle' }, fmt(s.p[i])));
      }
    });

    const tbody = $('rg-prob-table').tBodies[0];
    tbody.replaceChildren();
    TIERS.forEach((t, i) => {
      const tr = el('tr');
      tr.append(el('td', {}, t), el('td', {}, fmt(s.p[i])), el('td', {}, String(TIER_APPROVALS[i])));
      tbody.append(tr);
    });
  }

  function render() {
    const s = readState();
    weightInputs.forEach(({ out }, i) => { out.value = fmt(s.p[i]); });
    const d = decide(s);
    drawChart(s, d);

    const steps = $('rg-steps');
    steps.replaceChildren();
    for (const [k, v] of d.steps) {
      const li = el('li');
      li.append(el('span', {}, k), el('strong', {}, v));
      steps.append(li);
    }
    $('rg-final-tier').textContent = `Final tier: ${TIERS[d.tier]}`;
    $('rg-final-approvals').textContent = `${d.required} ${d.required === 1 ? 'approval' : 'approvals'} (${d.why})`;

    const g = gate(s, d);
    const status = $('rg-status');
    status.replaceChildren(
      el('span', { class: `rg-sim__icon rg-sim__icon--${g.state}`, 'aria-hidden': 'true' }, g.state === 'success' ? '✓' : '●'),
      el('strong', {}, 'risk-gate'),
      el('span', {}, g.state),
      el('code', {}, g.description),
    );
  }

  root.querySelectorAll('.rg-sim__controls input, .rg-sim__controls select').forEach((n) => {
    n.addEventListener('input', () => {
      presetButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      render();
    });
  });
  applyPreset(2);
})();
