(function () {
  'use strict';

  // ─── Perlin noise ────────────────────────────────────────────────────────────
  const perm = new Uint8Array(512);
  const gradX = new Float32Array(256);
  const gradY = new Float32Array(256);

  (function seed(s) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      s = Math.imul(s, 1664525) + 1013904223 | 0;
      const j = (s >>> 0) % (i + 1);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) {
      const a = (perm[i] / 256) * Math.PI * 2;
      gradX[i] = Math.cos(a);
      gradY[i] = Math.sin(a);
    }
  })(42);

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function dot(ix, iy, x, y) {
    const i = perm[(ix + perm[iy & 255]) & 255];
    return gradX[i] * (x - ix) + gradY[i] * (y - iy);
  }
  function lerp(a, b, t) { return a + t * (b - a); }

  function perlin(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    return (lerp(
      lerp(dot(xi, yi, x, y), dot(xi + 1, yi, x, y), u),
      lerp(dot(xi, yi + 1, x, y), dot(xi + 1, yi + 1, x, y), u),
      v
    ) * 0.5 + 0.5);
  }

  // Fractal noise (2 octaves) for more natural terrain variation
  function fbm(x, y) {
    return perlin(x, y) * 0.65 + perlin(x * 2.1, y * 2.1) * 0.35;
  }

  // ─── Seeded random (deterministic scatter) ───────────────────────────────────
  let rngState = 0x9e3779b9;
  function srng() {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    return ((rngState >>> 0) / 0xffffffff);
  }

  // ─── Asset paths ─────────────────────────────────────────────────────────────
  const BASE = '/assets/images/procedural-world';

  // terrain_01-04: grass  terrain_05-09: dirt/mud  terrain_10-14: rocks/roots
  const TERRAIN = Array.from({ length: 14 }, (_, i) =>
    BASE + '/terrain/terrain_' + String(i + 1).padStart(2, '0') + '.png');

  // flora_21 and flora_23 are bad cuts — skip them
  const FLORA_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,22];
  const FLORA = FLORA_IDS.map(i =>
    BASE + '/flora/flora_' + String(i).padStart(2, '0') + '.png');

  const PROPS = Array.from({ length: 12 }, (_, i) =>
    BASE + '/props/prop_' + String(i + 1).padStart(2, '0') + '.png');

  // ─── Image preloader ─────────────────────────────────────────────────────────
  function loadImages(srcs) {
    return Promise.all(srcs.map(src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    })));
  }


  // ─── Terrain canvas ──────────────────────────────────────────────────────────
  function drawTerrain(canvas, imgs, cssW, cssH) {
    const ctx = canvas.getContext('2d');
    // canvas.width/height are already in physical pixels; draw in CSS pixels via scale
    const W = cssW, H = cssH;

    // Base fill
    ctx.fillStyle = '#4e5a34';
    ctx.fillRect(0, 0, W, H);

    const FREQ = 0.003;
    // Small tile with generous overlap so no gap is ever bare
    const TILE = 95;

    // Pass 1 — dense base coverage (grass only, no jitter, tight grid)
    for (let row = 0; row * TILE < H + TILE; row++) {
      for (let col = 0; col * TILE < W + TILE; col++) {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        const n = fbm(cx * FREQ, cy * FREQ);
        const imgIdx = Math.min(Math.floor(n * 4), 3); // grass 0-3
        const img = imgs[imgIdx];
        if (!img || !img.naturalWidth) continue;
        const scale = TILE * (1.25 + srng() * 0.3);
        const aspect = img.naturalHeight / img.naturalWidth;
        ctx.globalAlpha = 0.78 + srng() * 0.16;
        ctx.drawImage(img, cx - scale / 2, cy - (scale * aspect) / 2, scale, scale * aspect);
      }
    }

    // Pass 2 — scattered detail patches (dirt/mud/rocks) in non-center zones
    const DTILE = 130;
    for (let row = 0; row * DTILE < H + DTILE; row++) {
      for (let col = 0; col * DTILE < W + DTILE; col++) {
        const jx = (srng() - 0.5) * DTILE * 0.6;
        const jy = (srng() - 0.5) * DTILE * 0.6;
        const cx = col * DTILE + DTILE / 2 + jx;
        const cy = row * DTILE + DTILE / 2 + jy;
        const xFrac = cx / W;
        const inCenter = xFrac > 0.32 && xFrac < 0.68;
        if (inCenter) continue; // keep center clean

        const n = fbm(cx * FREQ, cy * FREQ);
        if (n < 0.38) continue; // only place detail in higher-noise areas

        let imgIdx;
        if (n < 0.62) imgIdx = 4 + Math.floor((n - 0.38) / 0.24 * 5); // dirt 4-8
        else           imgIdx = 9 + Math.floor((n - 0.62) / 0.38 * 5); // rocks 9-13
        imgIdx = Math.min(imgIdx, 13);

        const img = imgs[imgIdx];
        if (!img || !img.naturalWidth) continue;
        const scale = DTILE * (1.1 + srng() * 0.35);
        const aspect = img.naturalHeight / img.naturalWidth;
        ctx.globalAlpha = 0.68 + srng() * 0.22;
        ctx.drawImage(img, cx - scale / 2, cy - (scale * aspect) / 2, scale, scale * aspect);
      }
    }
    ctx.globalAlpha = 1;

    // Vignette: darker sides + top/bottom
    const vLeft = ctx.createLinearGradient(0, 0, W * 0.26, 0);
    vLeft.addColorStop(0, 'rgba(22,30,12,0.60)');
    vLeft.addColorStop(1, 'rgba(22,30,12,0)');
    ctx.fillStyle = vLeft; ctx.fillRect(0, 0, W, H);

    const vRight = ctx.createLinearGradient(W, 0, W * 0.74, 0);
    vRight.addColorStop(0, 'rgba(22,30,12,0.60)');
    vRight.addColorStop(1, 'rgba(22,30,12,0)');
    ctx.fillStyle = vRight; ctx.fillRect(0, 0, W, H);

    const vTop = ctx.createLinearGradient(0, 0, 0, H * 0.12);
    vTop.addColorStop(0, 'rgba(22,30,12,0.40)');
    vTop.addColorStop(1, 'rgba(22,30,12,0)');
    ctx.fillStyle = vTop; ctx.fillRect(0, 0, W, H);
  }

  // ─── Flora placement (DOM) ───────────────────────────────────────────────────
  function placeFlora(layer, floraImgs, W, H) {
    // Trees are flora indices 0-3 (flora_01-04: round canopies)
    // Stumps are ~indices 8-9
    // Grasses/flowers: 4-7
    // Rocks/branches: 10+

    const attempts = Math.floor(W / 12); // scale with viewport width

    for (let i = 0; i < attempts; i++) {
      const side = srng() < 0.5 ? 'left' : 'right';
      let xFrac = side === 'left'
        ? srng() * 0.28
        : 0.72 + srng() * 0.28;
      const yFrac = 0.02 + srng() * 0.96;

      // Noise-driven density: sparse in some areas
      const n = fbm(xFrac * 5, yFrac * 4);
      if (n < 0.28) continue;

      // Pick flora type: edge gets trees, mid-side gets mix
      const edgeFrac = side === 'left' ? (0.28 - xFrac) / 0.28 : (xFrac - 0.72) / 0.28;
      let floraIdx;
      if (edgeFrac > 0.6 && srng() < 0.45) {
        floraIdx = Math.floor(srng() * 4); // trees near edge
      } else if (srng() < 0.3) {
        floraIdx = 8 + Math.floor(srng() * 4); // stumps/rocks
      } else {
        floraIdx = 4 + Math.floor(srng() * 17); // grasses/flowers/rocks
        floraIdx = Math.min(floraIdx, floraImgs.length - 1);
      }

      const img = floraImgs[floraIdx];
      if (!img) continue;

      const isTree = floraIdx < 4;
      const baseSize = isTree
        ? 100 + srng() * 70
        : 55 + srng() * 55;

      const el = document.createElement('img');
      el.src = img.src;
      el.className = 'world-flora';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'left:' + (xFrac * 100).toFixed(1) + '%',
        'top:' + (yFrac * 100).toFixed(1) + '%',
        'width:' + Math.round(baseSize) + 'px',
        'z-index:' + Math.floor(yFrac * 100),
        'opacity:' + (0.78 + srng() * 0.18).toFixed(2)
      ].join(';');
      layer.appendChild(el);
    }
  }

  // ─── Prop placement (fixed anchors) ─────────────────────────────────────────
  // prop_01=cabin  02=small tent  03=large tent  04=cart
  // prop_05=barrels  06=crates  07=signpost  08=fence
  // prop_09=log pile  10=campfire  11=sacks  12=bucket+axe
  const PROP_ANCHORS = [
    // Left side
    { idx: 0,  xp: 3.5, yp: 16,  size: 165, z: 30 },  // cabin
    { idx: 8,  xp: 9,   yp: 42,  size: 110, z: 55 },  // log pile
    { idx: 4,  xp: 6,   yp: 56,  size:  90, z: 65 },  // barrels
    { idx: 7,  xp: 13,  yp: 30,  size:  85, z: 42 },  // fence
    // Right side
    { idx: 2,  xp: 78,  yp: 18,  size: 145, z: 32 },  // large tent
    { idx: 3,  xp: 86,  yp: 36,  size: 135, z: 50 },  // cart
    { idx: 5,  xp: 80,  yp: 50,  size:  95, z: 62 },  // crates
    { idx: 7,  xp: 74,  yp: 28,  size:  85, z: 40 },  // fence
    // Lower (below content, sides)
    { idx: 9,  xp: 8,   yp: 74,  size:  95, z: 78 },  // campfire left
    { idx: 1,  xp: 82,  yp: 72,  size: 110, z: 76 },  // small tent right
    { idx: 6,  xp: 14,  yp: 84,  size:  75, z: 86 },  // signpost
    { idx: 11, xp: 85,  yp: 86,  size:  80, z: 88 },  // bucket+axe
  ];

  function placeProps(layer, propImgs) {
    PROP_ANCHORS.forEach(a => {
      const img = propImgs[a.idx];
      if (!img) return;
      const el = document.createElement('img');
      el.src = img.src;
      el.className = 'world-prop';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'left:' + a.xp + '%',
        'top:' + a.yp + '%',
        'width:' + a.size + 'px',
        'z-index:' + a.z
      ].join(';');
      layer.appendChild(el);
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function setupCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fill base color synchronously
    ctx.fillStyle = '#4e5a34';
    ctx.fillRect(0, 0, cssW, cssH);
  }

  function init() {
    const stage = document.getElementById('world-stage');
    if (!stage) return;

    const canvas = document.getElementById('world-canvas');
    const spriteLayer = document.getElementById('world-sprite-layer');

    const cssW = stage.offsetWidth  || window.innerWidth;
    const cssH = stage.offsetHeight || window.innerHeight;
    setupCanvas(canvas, cssW, cssH);

    Promise.all([
      loadImages(TERRAIN),
      loadImages(FLORA),
      loadImages(PROPS)
    ]).then(([terrainImgs, floraImgs, propImgs]) => {
      drawTerrain(canvas, terrainImgs, cssW, cssH);
      placeFlora(spriteLayer, floraImgs, cssW, cssH);
      placeProps(spriteLayer, propImgs);
    });

    // Redraw on resize (debounced)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nW = stage.offsetWidth;
        const nH = stage.offsetHeight;
        setupCanvas(canvas, nW, nH);
        spriteLayer.innerHTML = '';
        rngState = 0x9e3779b9;
        Promise.all([loadImages(TERRAIN), loadImages(FLORA), loadImages(PROPS)])
          .then(([t, f, p]) => {
            drawTerrain(canvas, t, nW, nH);
            placeFlora(spriteLayer, f, nW, nH);
            placeProps(spriteLayer, p);
          });
      }, 300);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
