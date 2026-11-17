---
hide:
  - toc
---

# Simulator

Change the controls and see how risk-gate decides. The simulator uses the same logic as `src/core/decide.ts` and `src/core/approvals.ts`, with the tiers of the example config: `low` 0, `medium` 1, `high` 2 and `critical` 2 approvals.

<div id="rg-sim" class="rg-sim">
  <div class="rg-sim__controls">
    <div>
      <div class="rg-sim__label">Example cases</div>
      <div class="rg-sim__presets" id="rg-presets"></div>
    </div>
    <fieldset>
      <legend>Jev answer</legend>
      <div id="rg-prob-sliders"></div>
      <div class="rg-sim__hint">The probabilities are normalized to a sum of 1.</div>
    </fieldset>
    <fieldset>
      <legend>Config</legend>
      <div class="rg-sim__row2"><label for="rg-mode">mode</label><select id="rg-mode"><option value="enforce">enforce</option><option value="shadow">shadow</option></select></div>
      <label class="rg-sim__check"><input type="checkbox" id="rg-agentcfg"> <code>require_human_for_agent_prs</code></label>
    </fieldset>
    <fieldset>
      <legend>Pull request</legend>
      <div class="rg-sim__row2"><label for="rg-floor">minimum tier from the rules</label><select id="rg-floor"></select></div>
      <label class="rg-sim__check"><input type="checkbox" id="rg-bot"> the author is a bot (agent)</label>
    </fieldset>
    <fieldset>
      <legend>Reviews</legend>
      <div class="rg-sim__row2"><label for="rg-have">valid approvals</label><input type="number" id="rg-have" min="0" max="9" step="1"></div>
    </fieldset>
  </div>
  <div class="rg-sim__output">
    <div class="rg-sim__label">Probability of each tier, from Jev</div>
    <div class="rg-sim__chart" id="rg-chart-box">
      <svg id="rg-chart" viewBox="0 0 560 250" role="img" aria-label="Probability of each tier, from Jev"></svg>
      <div class="rg-sim__tooltip" id="rg-tooltip" role="status"></div>
    </div>
    <details class="rg-sim__table">
      <summary>Show as a table</summary>
      <table id="rg-prob-table"><thead><tr><th>Tier</th><th>Probability</th><th>Tier approvals</th></tr></thead><tbody></tbody></table>
    </details>
    <ul class="rg-sim__steps" id="rg-steps"></ul>
    <div class="rg-sim__final"><span class="rg-sim__big" id="rg-final-tier"></span><span id="rg-final-approvals"></span></div>
    <div class="rg-sim__status" id="rg-status" aria-live="polite"></div>
  </div>
</div>

## What the simulator does not cover

- How Jev reads a real diff. Here you set its probabilities by hand.
- Requested changes, approvals on older commits and reviewers without write access. The "valid approvals" number already excludes them. See [Which approvals count](concepts/approvals.md).
