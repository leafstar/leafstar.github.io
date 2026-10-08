/*!
 * Surrogate explorer
 * Interactive comparison of the true return eta(pi~) and the TRPO surrogate
 * L_pi(pi~) in a two-state MDP whose states share one policy parameter.
 * All quantities are computed in closed form; nothing is sampled.
 *
 * Usage (plain script):
 *   <link rel="stylesheet" href="surrogate-explorer.css">
 *   <div id="demo"></div>
 *   <script src="surrogate-explorer.js"></script>
 *   <script>SurrogateExplorer.mount(document.getElementById('demo'));</script>
 *
 * Usage (bundler / CommonJS):
 *   const SurrogateExplorer = require('./surrogate-explorer.js');
 *   const handle = SurrogateExplorer.mount(el, { gamma: 0.9 });
 *   handle.destroy();
 *
 * No dependencies. MIT-style: use it however you like.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.SurrogateExplorer = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Model: closed-form quantities for the two-state MDP
   *
   *   s1: R -> s2 (reward 0),  L -> terminal (reward c)
   *   s2: R -> s1 (reward 0),  L -> terminal (reward 1)
   *   shared parameter p = pi(R | s), start state s1.
   * ------------------------------------------------------------------ */

  function values(p, g, c) {
    // V(s1) = (1-p)(c + g p) / (1 - g^2 p^2),  V(s2) = (1-p) + p g V(s1)
    const v1 = (1 - p) * (c + g * p) / (1 - g * g * p * p);
    const v2 = (1 - p) + p * g * v1;
    return [v1, v2];
  }

  function eta(p, g, c) {
    return values(p, g, c)[0];
  }

  function anchor(p0, g, c) {
    const [v1, v2] = values(p0, g, c);

    // Advantages A_{p0}(s, a) = Q_{p0}(s, a) - V_{p0}(s)
    const A1R = g * v2 - v1, A1L = c - v1;
    const A2R = g * v1 - v2, A2L = 1 - v2;

    // Unnormalized discounted visitation: rho^T = e1^T (I - g P)^{-1}
    const d = 1 - g * g * p0 * p0;
    const rho1 = 1 / d, rho2 = g * p0 / d;

    // TRPO constant C = 4 eps g / (1-g)^2,  eps = max |A|
    const eps = Math.max(Math.abs(A1R), Math.abs(A1L), Math.abs(A2R), Math.abs(A2L));
    const C = 4 * eps * g / ((1 - g) * (1 - g));

    // Surrogate: L(p) = eta(p0) + sum_s rho(s) [p A(s,R) + (1-p) A(s,L)]
    const L = p => v1 + rho1 * (p * A1R + (1 - p) * A1L) + rho2 * (p * A2R + (1 - p) * A2L);

    // Lower bound: L(p) - C alpha^2,  alpha = |p - p0|  (TV of two Bernoullis)
    const lower = p => L(p) - C * (p - p0) * (p - p0);

    return { eta0: v1, L, lower, C, eps, rho: [rho1, rho2], A: { A1R, A1L, A2R, A2L } };
  }

  /* ------------------------------------------------------------------ *
   * View
   * ------------------------------------------------------------------ */

  const sigmoid = t => 1 / (1 + Math.exp(-t));
  let instanceCount = 0;

  const DEFAULTS = {
    mode: 'p',            // 'p' = policy space, 'theta' = parameter space
    anchor: 0.25,         // initial anchor, in units of the current mode
    evaluate: 0.6,        // initial evaluation point, same units
    gamma: 0.9,
    reward: 0.3,          // reward c for action L in s1
    showLowerBound: false,
    thetaRange: 6,        // theta axis spans [-thetaRange, thetaRange]
    samples: 400,         // curve resolution
    equalAspect: true     // in policy space, use one scale for both axes
  };

  const MARGIN = { l: 56, r: 16, t: 14, b: 40 };  // canvas space around the plot box

  function template(id) {
    return `
      <div class="se-row">
        <label for="${id}-mode">Horizontal axis</label>
        <select id="${id}-mode" data-se="mode">
          <option value="p">Policy space: p = π(R|s)</option>
          <option value="theta">Parameter space: θ, p = σ(θ)</option>
        </select>
        <label class="se-check"><input type="checkbox" data-se="lb"> Show TRPO lower bound L − Cα²</label>
      </div>
      <div class="se-row">
        <label for="${id}-anc" data-se="alab">Anchor π (old policy)</label>
        <input type="range" id="${id}-anc" data-se="anc" min="0" max="1000">
        <span class="se-val" data-se="ancv"></span>
      </div>
      <div class="se-row">
        <label for="${id}-ev" data-se="elab">Evaluation point π̃</label>
        <input type="range" id="${id}-ev" data-se="ev" min="0" max="1000">
        <span class="se-val" data-se="evv"></span>
      </div>
      <div class="se-row">
        <label for="${id}-gam">Discount γ</label>
        <input type="range" id="${id}-gam" data-se="gam" min="50" max="98" step="1">
        <span class="se-val" data-se="gamv"></span>
      </div>
      <div class="se-legend">
        <span><i style="border-color:var(--se-eta)"></i>η(π̃) true return</span>
        <span><i style="border-color:var(--se-sur);border-top-style:dashed"></i>L<sub>π</sub>(π̃) surrogate</span>
        <span data-se="lbleg"><i style="border-color:var(--se-lb);border-top-style:dotted"></i>L − Cα² lower bound</span>
        <span>● anchor &nbsp; ◆ evaluation point (on η and on L)</span>
      </div>
      <canvas data-se="canvas" role="img"
        aria-label="True return eta and surrogate L plotted against the policy parameter"></canvas>
      <div class="se-cards">
        <div class="se-card"><div class="se-l">η(π̃) at evaluation point</div><div class="se-n" data-se="o1"></div></div>
        <div class="se-card"><div class="se-l">L<sub>π</sub>(π̃) at evaluation point</div><div class="se-n" data-se="o2"></div></div>
        <div class="se-card"><div class="se-l">Gap η − L</div><div class="se-n" data-se="o3"></div></div>
        <div class="se-card"><div class="se-l">Constant C = 4εγ/(1−γ)²</div><div class="se-n" data-se="o4"></div></div>
      </div>
      <p class="se-note">
        MDP: in s₁, R moves to s₂ (reward 0) and L terminates (reward <span data-se="cval"></span>);
        in s₂, R returns to s₁ (reward 0) and L terminates (reward 1). Both states share
        p = π(R|s); the episode starts in s₁. The lower bound uses α = |p − p₀|, the TV distance
        between the two Bernoulli policies (identical in both states), and ε = max<sub>s,a</sub>|A<sub>π</sub>(s,a)|.
      </p>`;
  }

  function niceStep(span, n) {
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  }

  function ticks(lo, hi, step) {
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function mount(container, userOptions) {
    if (!container) throw new Error('SurrogateExplorer.mount: container element is required.');
    const opt = Object.assign({}, DEFAULTS, userOptions || {});
    const id = 'se' + (++instanceCount);

    container.classList.add('se-root');
    container.innerHTML = template(id);
    const q = name => container.querySelector(`[data-se="${name}"]`);
    const el = {
      mode: q('mode'), lb: q('lb'), anc: q('anc'), ev: q('ev'), gam: q('gam'),
      alab: q('alab'), elab: q('elab'), ancv: q('ancv'), evv: q('evv'), gamv: q('gamv'),
      lbleg: q('lbleg'), canvas: q('canvas'), cval: q('cval'),
      o1: q('o1'), o2: q('o2'), o3: q('o3'), o4: q('o4')
    };
    const ctx = el.canvas.getContext('2d');
    const css = name => getComputedStyle(container).getPropertyValue(name).trim();

    // Slider <-> axis value conversion
    const range = mode => mode === 'p' ? [0, 1] : [-opt.thetaRange, opt.thetaRange];
    const fromSlider = (v, mode) => { const [a, b] = range(mode); return a + (b - a) * v / 1000; };
    const toSlider = (x, mode) => { const [a, b] = range(mode); return Math.round(1000 * (x - a) / (b - a)); };
    const toP = (x, mode) => mode === 'p' ? x : sigmoid(x);

    el.mode.value = opt.mode === 'theta' ? 'theta' : 'p';
    el.lb.checked = !!opt.showLowerBound;
    el.anc.value = toSlider(opt.anchor, el.mode.value);
    el.ev.value = toSlider(opt.evaluate, el.mode.value);
    el.gam.value = Math.round(opt.gamma * 100);
    el.cval.textContent = opt.reward;

    // One vertical range for every gamma on the slider, so the plot neither
    // rescales nor changes height while gamma is dragged.
    const yr = (() => {
      let lo = Infinity, hi = -Infinity;
      for (let gi = +el.gam.min; gi <= +el.gam.max; gi++) {
        for (let i = 0; i <= opt.samples; i++) {
          const e = eta(i / opt.samples, gi / 100, opt.reward);
          lo = Math.min(lo, e); hi = Math.max(hi, e);
        }
      }
      const span = (hi - lo) || 1;
      return [lo - 0.15 * span, hi + 0.3 * span];
    })();

    // With equal axes the policy-space plot box is (width) x (width * eta range),
    // since p spans [0, 1]. The canvas keeps that height in both modes, up to --se-height.
    function fitHeight() {
      const W = el.canvas.clientWidth;
      if (!W) return;
      const cap = parseFloat(css('--se-height')) || 480;
      const natural = (W - MARGIN.l - MARGIN.r) * (yr[1] - yr[0]) + MARGIN.t + MARGIN.b;
      const H = `${Math.round(opt.equalAspect ? Math.min(cap, natural) : cap)}px`;
      if (el.canvas.style.height !== H) el.canvas.style.height = H;
    }

    function draw(series, points, xr, yr, xlabel, equal) {
      const dpr = window.devicePixelRatio || 1;
      const W = el.canvas.clientWidth, H = el.canvas.clientHeight;
      if (!W || !H) return;
      el.canvas.width = W * dpr; el.canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const m = MARGIN;
      let pw = W - m.l - m.r, ph = H - m.t - m.b, ox = m.l;
      if (equal) {
        // Same pixels per unit on both axes; centre the box if the height cap narrows it.
        const k = Math.min(pw / (xr[1] - xr[0]), ph / (yr[1] - yr[0]));
        ox += (pw - k * (xr[1] - xr[0])) / 2;
        pw = k * (xr[1] - xr[0]); ph = k * (yr[1] - yr[0]);
      }
      const X = x => ox + (x - xr[0]) / (xr[1] - xr[0]) * pw;
      const Y = y => m.t + (1 - (y - yr[0]) / (yr[1] - yr[0])) * ph;
      const font = getComputedStyle(container).fontFamily || 'sans-serif';

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = css('--se-plot');
      ctx.fillRect(ox, m.t, pw, ph);

      // Equal axes also share one tick step, so the grid cells are square.
      const xstep = niceStep(xr[1] - xr[0], 8);
      const ystep = equal ? xstep : niceStep(yr[1] - yr[0], 6);
      ctx.strokeStyle = css('--se-grid'); ctx.lineWidth = 1;
      ctx.fillStyle = css('--se-muted'); ctx.font = `12px ${font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const t of ticks(xr[0], xr[1], xstep)) {
        ctx.beginPath(); ctx.moveTo(X(t), m.t); ctx.lineTo(X(t), m.t + ph); ctx.stroke();
        ctx.fillText(String(+t.toFixed(3)), X(t), m.t + ph + 6);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const t of ticks(yr[0], yr[1], ystep)) {
        ctx.beginPath(); ctx.moveTo(ox, Y(t)); ctx.lineTo(ox + pw, Y(t)); ctx.stroke();
        ctx.fillText(String(+t.toFixed(3)), ox - 6, Y(t));
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = css('--se-ink');
      ctx.fillText(xlabel, ox + pw / 2, m.t + ph + m.b - 2);

      ctx.save();
      ctx.beginPath(); ctx.rect(ox, m.t, pw, ph); ctx.clip();
      for (const s of series) {
        if (s.hidden) continue;
        ctx.strokeStyle = s.color; ctx.lineWidth = 2.5;
        ctx.setLineDash(s.dash || []); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        s.data.forEach((pt, i) => i ? ctx.lineTo(X(pt.x), Y(pt.y)) : ctx.moveTo(X(pt.x), Y(pt.y)));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const p of points) {
        const px = X(p.x), py = Y(p.y), r = 6;
        ctx.fillStyle = p.fill; ctx.strokeStyle = p.stroke || p.fill; ctx.lineWidth = 2;
        ctx.beginPath();
        if (p.diamond) {
          ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py);
          ctx.closePath();
        } else {
          ctx.arc(px, py, r, 0, 2 * Math.PI);
        }
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    function update() {
      fitHeight();
      const mode = el.mode.value, g = el.gam.value / 100, c = opt.reward;
      const xa = fromSlider(+el.anc.value, mode), xe = fromSlider(+el.ev.value, mode);
      const pa = toP(xa, mode), pe = toP(xe, mode);
      const S = anchor(pa, g, c);
      const [x0, x1] = range(mode);

      const etaPts = [], surPts = [], lbPts = [];
      for (let i = 0; i <= opt.samples; i++) {
        const x = x0 + (x1 - x0) * i / opt.samples, p = toP(x, mode);
        etaPts.push({ x, y: eta(p, g, c) });
        surPts.push({ x, y: S.L(p) });
        lbPts.push({ x, y: S.lower(p) });
      }
      const showLB = el.lb.checked;
      const ee = eta(pe, g, c), le = S.L(pe);

      draw(
        [
          { data: etaPts, color: css('--se-eta') },
          { data: surPts, color: css('--se-sur'), dash: [8, 5] },
          { data: lbPts, color: css('--se-lb'), dash: [2, 4], hidden: !showLB }
        ],
        [
          { x: xa, y: S.eta0, fill: css('--se-ink') },
          { x: xe, y: ee, fill: css('--se-eval'), stroke: css('--se-eta'), diamond: true },
          { x: xe, y: le, fill: css('--se-eval'), stroke: css('--se-sur'), diamond: true }
        ],
        [x0, x1],
        yr,
        mode === 'p' ? 'p = π(R|s)' : 'θ   (p = σ(θ))',
        opt.equalAspect && mode === 'p'
      );

      const sym = mode === 'p' ? 'p' : 'θ';
      el.alab.textContent = `Anchor π (${sym}₀)`;
      el.elab.textContent = `Evaluation point π̃ (${sym})`;
      el.lbleg.classList.toggle('se-off', !showLB);
      el.ancv.textContent = xa.toFixed(2);
      el.evv.textContent = xe.toFixed(2);
      el.gamv.textContent = g.toFixed(2);
      el.o1.textContent = ee.toFixed(4);
      el.o2.textContent = le.toFixed(4);
      el.o3.textContent = (ee - le).toFixed(4);
      el.o4.textContent = S.C.toFixed(1);
    }

    // Keep the same p when switching axes, so the picture does not jump.
    function onModeChange() {
      const newMode = el.mode.value, oldMode = newMode === 'p' ? 'theta' : 'p';
      const logit = p => Math.log(p / (1 - p));
      const clampP = p => Math.min(Math.max(p, 1e-4), 1 - 1e-4);
      const convert = v => {
        const x = fromSlider(+v, oldMode);
        const nx = newMode === 'p' ? sigmoid(x) : logit(clampP(x));
        return Math.min(1000, Math.max(0, toSlider(nx, newMode)));
      };
      el.anc.value = convert(el.anc.value);
      el.ev.value = convert(el.ev.value);
      update();
    }

    const inputs = [el.anc, el.ev, el.gam, el.lb];
    inputs.forEach(i => i.addEventListener('input', update));
    el.lb.addEventListener('change', update);
    el.mode.addEventListener('change', onModeChange);

    // update() may resize the canvas it observes; deferring a frame avoids a ResizeObserver loop.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => requestAnimationFrame(update)) : null;
    if (ro) ro.observe(el.canvas); else window.addEventListener('resize', update);
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', update);

    update();

    return {
      update,
      destroy() {
        inputs.forEach(i => i.removeEventListener('input', update));
        el.lb.removeEventListener('change', update);
        el.mode.removeEventListener('change', onModeChange);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', update);
        if (mq && mq.removeEventListener) mq.removeEventListener('change', update);
        container.innerHTML = '';
        container.classList.remove('se-root');
      }
    };
  }

  return { mount, model: { values, eta, anchor } };
});
