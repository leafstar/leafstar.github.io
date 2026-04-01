(function () {
  'use strict';

  // ─── Perlin noise (seed 42) ──────────────────────────────────────────────
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
      gradX[i] = Math.cos(a); gradY[i] = Math.sin(a);
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
    return (lerp(
      lerp(dot(xi,yi,x,y), dot(xi+1,yi,x,y), fade(xf)),
      lerp(dot(xi,yi+1,x,y), dot(xi+1,yi+1,x,y), fade(xf)),
      fade(yf)
    ) * 0.5 + 0.5);
  }
  function fbm(x, y) {
    return perlin(x, y) * 0.65 + perlin(x * 2.1, y * 2.1) * 0.35;
  }
  function smoothstep(lo, hi, t) {
    t = Math.max(0, Math.min(1, (t - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  }

  // ─── Seeded RNG ──────────────────────────────────────────────────────────
  let rngState = 0x9e3779b9;
  function srng() {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    return (rngState >>> 0) / 0xffffffff;
  }
  function resetRng() { rngState = 0x9e3779b9; }

  // ─── Asset paths (individual PNGs cut from sprite sheets) ────────────────
  const BASE = '/assets/images/procedural-world';

  // terrain/terrain_01..14.png — ground patches
  //   Row 0: 01=grass1, 02=grass2, 03=grassPath, 04=grassRocky, 05=dirtDry
  //   Row 1: 06=dirtCracked, 07=mudpool, 08=dirtRuts, 09=mossy
  //   Row 2: 10=rootsGreen, 11=stonePile, 12=rockGrass, 13=roots, 14=logs
  const T_IDX = {
    grass1: 1, grass2: 2, grassPath: 3, grassRocky: 4, dirtDry: 5,
    dirtCracked: 6, mudpool: 7, dirtRuts: 8, mossy: 9,
    rootsGreen: 10, stonePile: 11, rockGrass: 12, roots: 13, logs: 14,
  };

  // flora/flora_01..22.png — trees, bushes, stumps, rocks, moss
  //   Row 0: 01=tree1, 02=tree2, 03=tree3, 04=bush1, 05=bush2, 06=bush3
  //   Row 1: 07=grass1, 08=flowers, 09=flowerSmall, 10=stump1, 11=stump2, 12=stump3
  //   Row 2: 13=fallenLog1, 14=rockLg, 15=rockSm, 16=moss1, 17=moss2
  //   Row 3: 18=fallenLog2, 19=rockLg2, 20=rockSm2, 21=moss3, 22=moss4
  const FL_IDX = {
    tree1: 1, tree2: 2, tree3: 3, bush1: 4, bush2: 5, bush3: 6,
    grass1: 7, flowers: 8, flowerSmall: 9, stump1: 10, stump2: 11, stump3: 12,
    fallenLog1: 13, rockLg: 14, rockSm: 15, moss1: 16, moss2: 17,
    fallenLog2: 18, rockLg2: 19, rockSm2: 20, moss3: 21, moss4: 22,
  };

  // props/prop_01..12.png — camp structures
  //   Row 0: 01=house, 02=tentSmall, 03=tentLarge, 04=cart
  //   Row 1: 05=barrels, 06=sign, 07=fenceA, 08=fenceB, 09=logPile
  //   Row 2: 10=campfire, 11=sacks, 12=chopBlock
  const PR_IDX = {
    house: 1, tentSmall: 2, tentLarge: 3, cart: 4,
    barrels: 5, sign: 6, fenceA: 7, fenceB: 8, logPile: 9,
    campfire: 10, sacks: 11, chopBlock: 12,
  };

  function pad2(n) { return String(n).padStart(2, '0'); }
  function terrainPath(name) { return BASE + '/terrain/terrain_' + pad2(T_IDX[name]) + '.png'; }
  function floraPath(name)   { return BASE + '/flora/flora_' + pad2(FL_IDX[name]) + '.png'; }
  function propPath(name)    { return BASE + '/props/prop_' + pad2(PR_IDX[name]) + '.png'; }

  // ─── Image loader ────────────────────────────────────────────────────────
  function loadImg(src) {
    return new Promise(r => {
      const img = new Image();
      img.onload  = () => r(img);
      img.onerror = () => r(null);
      img.src = src;
    });
  }

  function loadAll(pathFn, indexMap) {
    const entries = Object.entries(indexMap);
    return Promise.all(entries.map(([name]) => loadImg(pathFn(name))))
      .then(imgs => {
        const map = {};
        entries.forEach(([name], i) => { map[name] = imgs[i]; });
        return map;
      });
  }

  // ─── Double-grid terrain system ────────────────────────────────────────────

  // Second noise channel for biome variation
  function perlin2(x, y) { return perlin(x + 137.7, y + 251.3); }
  function fbm2(x, y) {
    return perlin2(x, y) * 0.65 + perlin2(x * 2.1, y * 2.1) * 0.35;
  }

  // Biome enum:  0=lushGrass  1=dryGrass  2=mossy  3=rocky  4=dirt  5=path
  const BIOME_LUSH = 0, BIOME_DRY = 1, BIOME_MOSS = 2,
        BIOME_ROCK = 3, BIOME_DIRT = 4, BIOME_PATH = 5;

  // Base fill colors per biome (painted under texture patches)
  const BIOME_COLORS = ['#3a5e1c', '#4a5a2a', '#2e4a1a', '#4a4a36', '#6a5a3a', '#7a6a45'];

  function getBiomeId(xFrac, yFrac) {
    const n1 = fbm(xFrac * 4.5, yFrac * 3.5);
    const n2 = fbm2(xFrac * 5.0, yFrac * 4.0);
    if (n2 > 0.62) return BIOME_ROCK;
    if (n1 > 0.58) return BIOME_MOSS;
    if (n1 < 0.35) return BIOME_DRY;
    if (n2 < 0.35) return BIOME_DIRT;
    return BIOME_LUSH;
  }

  // ── Data grid: assign biome to each cell ──
  function buildDataGrid(W, H, cellSz, pathStrength) {
    const cols = Math.ceil(W / cellSz) + 2;
    const rows = Math.ceil(H / cellSz) + 2;
    const grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const cx = c * cellSz, cy = r * cellSz;
        const ps = pathStrength(cx, cy);
        if (ps > 0.6) {
          row.push(BIOME_PATH);
        } else if (ps > 0.3) {
          // Transition zone — bias toward path or biome
          row.push(ps > 0.45 ? BIOME_DIRT : getBiomeId(cx / W, cy / H));
        } else {
          row.push(getBiomeId(cx / W, cy / H));
        }
      }
      grid.push(row);
    }
    return grid;
  }

  function drawTerrain(canvas, terrainImgs, W, H) {
    const ctx = canvas.getContext('2d');
    const CELL = 120; // data grid cell size

    // ── Path geometry ──
    const PATH_CX = W * 0.56;
    const PATH_HW = W * 0.075;
    function pathDist(x, y) {
      const wander = (fbm(y * 0.0022, x * 0.0007) - 0.5) * W * 0.10;
      return Math.abs(x - PATH_CX - wander);
    }
    function pathStrength(x, y) {
      const d = pathDist(x, y);
      if (d < PATH_HW * 0.7) return 1.0;
      if (d < PATH_HW * 1.3) return smoothstep(PATH_HW * 1.3, PATH_HW * 0.7, d);
      return 0;
    }

    // ── Pass 0: solid base ──
    ctx.fillStyle = '#2c4a14';
    ctx.fillRect(0, 0, W, H);
    if (!terrainImgs) { applyVignette(ctx, W, H); return; }

    // Patch drawing helper
    function drawPatch(img, x, y, sz, alpha, rot) {
      if (!img) return;
      ctx.globalAlpha = alpha;
      const aspect = img.naturalHeight / img.naturalWidth;
      const hw = sz / 2, hh = (sz * aspect) / 2;
      if (rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.drawImage(img, -hw, -hh, sz, sz * aspect);
        ctx.restore();
      } else {
        ctx.drawImage(img, x - hw, y - hh, sz, sz * aspect);
      }
    }

    // ── Biome texture pools ──
    const biomePatch = [
      /* 0 lush  */ [terrainImgs.grass1, terrainImgs.grass2],
      /* 1 dry   */ [terrainImgs.grassPath, terrainImgs.grassRocky],
      /* 2 moss  */ [terrainImgs.mossy, terrainImgs.rootsGreen, terrainImgs.grass2],
      /* 3 rock  */ [terrainImgs.rockGrass, terrainImgs.grassRocky, terrainImgs.stonePile],
      /* 4 dirt  */ [terrainImgs.dirtDry, terrainImgs.dirtCracked],
      /* 5 path  */ [terrainImgs.dirtDry, terrainImgs.dirtCracked, terrainImgs.dirtRuts],
    ];
    const detailImgs = [terrainImgs.logs, terrainImgs.stonePile, terrainImgs.roots,
                        terrainImgs.rockGrass, terrainImgs.rootsGreen];

    // ── Build data grid ──
    const grid = buildDataGrid(W, H, CELL, pathStrength);
    const rows = grid.length, cols = grid[0].length;

    // ── PASS 1: Base color fill per data cell ──
    // Solid color rectangles — guarantees zero gaps
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = BIOME_COLORS[grid[r][c]];
        ctx.globalAlpha = 1;
        ctx.fillRect(c * CELL, r * CELL, CELL + 1, CELL + 1);
      }
    }

    // ── PASS 2: Data-grid texture — one patch per cell ──
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const biome = grid[r][c];
        const pool = biomePatch[biome];
        // Deterministic pick from pool based on position
        const idx = ((c * 7 + r * 13) & 0x7fffffff) % pool.length;
        const img = pool[idx];
        const cx = c * CELL + CELL / 2;
        const cy = r * CELL + CELL / 2;
        // Slight rotation for variety
        const rot = ((c * 3 + r * 5) % 7 - 3) * 0.15;
        drawPatch(img, cx, cy, CELL * 1.35, 0.80, rot);
      }
    }

    // ── PASS 3: Render grid (offset half-cell) — transition blending ──
    // Each render cell sits at the junction of 4 data cells
    const halfCell = CELL / 2;
    // Offscreen canvas for compositing transitions
    const offW = CELL, offH = CELL;
    const off = document.createElement('canvas');
    off.width = offW; off.height = offH;
    const offCtx = off.getContext('2d');

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const tl = grid[r][c], tr = grid[r][c + 1];
        const bl = grid[r + 1][c], br = grid[r + 1][c + 1];
        // Skip if all same biome (no transition needed)
        if (tl === tr && tr === bl && bl === br) continue;

        // Render cell position (offset by half)
        const rx = c * CELL + halfCell;
        const ry = r * CELL + halfCell;

        // For each quadrant, draw the biome of that corner with radial fade
        offCtx.clearRect(0, 0, offW, offH);
        const corners = [
          { biome: tl, cx: 0,    cy: 0    },  // top-left quadrant
          { biome: tr, cx: offW, cy: 0    },  // top-right
          { biome: bl, cx: 0,    cy: offH },  // bottom-left
          { biome: br, cx: offW, cy: offH },  // bottom-right
        ];

        corners.forEach(function(corner) {
          const pool = biomePatch[corner.biome];
          const img = pool[((c + r + corner.cx + corner.cy) & 0x7fffffff) % pool.length];
          if (!img) return;

          offCtx.save();
          // Radial gradient mask from this corner
          const grad = offCtx.createRadialGradient(
            corner.cx, corner.cy, 0,
            corner.cx, corner.cy, CELL * 0.9
          );
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          grad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');

          // Draw biome color base into quadrant
          offCtx.globalCompositeOperation = 'source-over';
          offCtx.fillStyle = BIOME_COLORS[corner.biome];
          offCtx.globalAlpha = 1;
          offCtx.fillRect(0, 0, offW, offH);

          // Draw texture patch
          const aspect = img.naturalHeight / img.naturalWidth;
          offCtx.globalAlpha = 0.75;
          offCtx.drawImage(img, -offW * 0.15, -offH * 0.15, offW * 1.3, offW * 1.3 * aspect);

          // Apply radial mask
          offCtx.globalCompositeOperation = 'destination-in';
          offCtx.globalAlpha = 1;
          offCtx.fillStyle = grad;
          offCtx.fillRect(0, 0, offW, offH);
          offCtx.restore();
        });

        // Stamp transition cell onto main canvas
        ctx.globalAlpha = 0.85;
        ctx.drawImage(off, rx, ry, CELL, CELL);
      }
    }

    // ── PASS 4: Organic scatter overlay — breaks grid regularity ──
    ctx.globalAlpha = 1;
    const scatterCount = Math.floor((W * H) / 12000);
    for (let i = 0; i < scatterCount; i++) {
      const x = srng() * W, y = srng() * H;
      const xf = x / W, yf = y / H;
      const ps = pathStrength(x, y);
      // Look up biome at this point
      const gc = Math.min(Math.floor(x / CELL), cols - 1);
      const gr = Math.min(Math.floor(y / CELL), rows - 1);
      const biome = grid[gr][gc];
      const pool = biomePatch[biome];
      const img = pool[Math.floor(srng() * pool.length)];
      const sz = 100 + srng() * 140;
      const rot = srng() * Math.PI * 2;
      const alpha = ps > 0.5 ? 0.25 + srng() * 0.2  // subtle on path
                              : 0.30 + srng() * 0.30; // normal elsewhere
      drawPatch(img, x, y, sz, alpha, rot);
    }

    // ── PASS 5: Path mud accents ──
    const mudCount = Math.floor((W * H) / 22000);
    for (let i = 0; i < mudCount; i++) {
      const x = (0.28 + srng() * 0.55) * W;
      const y = srng() * H;
      const ps = pathStrength(x, y);
      if (ps < 0.4) continue;
      drawPatch(terrainImgs.mudpool, x, y, 120 + srng() * 90,
        (0.40 + srng() * 0.30) * ps, (srng() - 0.5) * 0.25);
    }

    // ── PASS 6: Edge darkening ──
    const edgeImgs = [terrainImgs.mossy, terrainImgs.rootsGreen, terrainImgs.roots];
    const edgeCount = Math.floor((W * H) / 8000);
    for (let i = 0; i < edgeCount; i++) {
      const xFrac = srng(), y = srng() * H;
      const edgeDist = Math.min(xFrac, 1 - xFrac);
      if (edgeDist > 0.28) continue;
      const x = xFrac * W;
      const img = edgeImgs[Math.floor(srng() * edgeImgs.length)];
      const ew = smoothstep(0.28, 0.0, edgeDist);
      drawPatch(img, x, y, 120 + srng() * 100,
        (0.45 + srng() * 0.30) * ew, srng() * Math.PI * 2);
    }

    // ── PASS 7: Scattered ground details ──
    const exclusions = buildExclusions();
    const detailCount = Math.floor((W * H) / 20000);
    for (let i = 0; i < detailCount; i++) {
      const x = srng() * W, y = srng() * H;
      if (nearStructure(x / W * 100, y / H * 100, exclusions)) continue;
      if (pathStrength(x, y) > 0.6 && srng() < 0.7) continue;
      const img = detailImgs[Math.floor(srng() * detailImgs.length)];
      drawPatch(img, x, y, 60 + srng() * 80, 0.50 + srng() * 0.35, srng() * Math.PI * 2);
    }

    ctx.globalAlpha = 1;
    applyVignette(ctx, W, H);
  }

  function applyVignette(ctx, W, H) {
    // Left (content area dark)
    const vL = ctx.createLinearGradient(0, 0, W * 0.38, 0);
    vL.addColorStop(0,    'rgba(12,20,6,0.78)');
    vL.addColorStop(0.50, 'rgba(12,20,6,0.22)');
    vL.addColorStop(1,    'rgba(12,20,6,0)');
    ctx.fillStyle = vL; ctx.fillRect(0, 0, W, H);
    // Right edge
    const vR = ctx.createLinearGradient(W, 0, W * 0.82, 0);
    vR.addColorStop(0, 'rgba(12,20,6,0.60)');
    vR.addColorStop(1, 'rgba(12,20,6,0)');
    ctx.fillStyle = vR; ctx.fillRect(0, 0, W, H);
    // Top
    const vT = ctx.createLinearGradient(0, 0, 0, H * 0.15);
    vT.addColorStop(0, 'rgba(12,20,6,0.45)');
    vT.addColorStop(1, 'rgba(12,20,6,0)');
    ctx.fillStyle = vT; ctx.fillRect(0, 0, W, H);
  }

  // ─── Layer 3: camp structures (fixed anchors) ─────────────────────────────
  const CAMP_ANCHORS = [
    // Left side (peek from behind content card)
    { spec: 'house',     xp:  1, yp: 10, size: 200, z: 20 },
    { spec: 'fenceA',   xp:  8, yp: 30, size: 130, z: 38 },
    { spec: 'barrels',  xp:  6, yp: 52, size: 110, z: 58 },
    // Right side (main visible area)
    { spec: 'tentLarge',xp: 72, yp:  8, size: 200, z: 18 },
    { spec: 'tentSmall',xp: 82, yp: 18, size: 150, z: 26 },
    { spec: 'cart',     xp: 78, yp: 32, size: 180, z: 40 },
    { spec: 'sign',     xp: 60, yp: 22, size:  90, z: 30 },
    { spec: 'fenceB',   xp: 68, yp: 42, size: 130, z: 48 },
    { spec: 'campfire', xp: 74, yp: 55, size: 130, z: 60 },
    { spec: 'barrels',  xp: 84, yp: 48, size: 110, z: 54 },
    { spec: 'sacks',    xp: 65, yp: 62, size: 100, z: 66 },
    { spec: 'chopBlock',xp: 80, yp: 68, size: 100, z: 72 },
    { spec: 'logPile',  xp: 90, yp: 35, size: 130, z: 42 },
    // Lower scattered
    { spec: 'tentSmall',xp:  4, yp: 72, size: 150, z: 76 },
    { spec: 'fenceA',   xp: 70, yp: 78, size: 110, z: 80 },
    { spec: 'barrels',  xp: 88, yp: 80, size: 100, z: 82 },
  ];

  // ─── Layer 3 placement ───────────────────────────────────────────────────
  function placeStructures(layer, propImgs, W, H) {
    if (!propImgs) return;
    CAMP_ANCHORS.forEach(a => {
      const img = propImgs[a.spec];
      if (!img) return;
      const aspect = img.naturalHeight / img.naturalWidth;
      const h = Math.round(a.size * aspect);
      const el = document.createElement('img');
      el.src = img.src;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'position:absolute',
        'left:'    + a.xp + '%',
        'top:'     + a.yp + '%',
        'width:'   + a.size + 'px',
        'z-index:' + a.z,
        'pointer-events:none',
        'image-rendering:auto',
      ].join(';');
      layer.appendChild(el);
    });
  }

  // ─── Layer 4: flora placement ─────────────────────────────────────────────

  // Exclusion zones around camp structures (percentage coords + radius)
  function buildExclusions() {
    return CAMP_ANCHORS.map(a => ({
      xp: a.xp, yp: a.yp,
      // Larger props get bigger exclusion radius
      r: a.size >= 180 ? 13 : a.size >= 130 ? 10 : 8,
    }));
  }

  function nearStructure(xPct, yPct, exclusions) {
    for (let i = 0; i < exclusions.length; i++) {
      const e = exclusions[i];
      const dx = xPct - e.xp, dy = yPct - e.yp;
      if (dx * dx + dy * dy < e.r * e.r) return true;
    }
    return false;
  }

  function placeFlora(layer, floraImgs, W, H) {
    if (!floraImgs) return;
    const attempts = Math.floor(W / 10);
    const exclusions = buildExclusions();

    for (let i = 0; i < attempts; i++) {
      const side = srng() < 0.5 ? 'left' : 'right';
      const xFrac = side === 'left' ? srng() * 0.30 : 0.70 + srng() * 0.30;
      const yFrac = 0.02 + srng() * 0.96;
      const n = fbm(xFrac * 5, yFrac * 4);
      if (n < 0.30) continue;

      // Skip if too close to a camp structure
      if (nearStructure(xFrac * 100, yFrac * 100, exclusions)) continue;

      const edgeFrac = side === 'left' ? (0.30 - xFrac) / 0.30 : (xFrac - 0.70) / 0.30;
      let img, baseSize;

      if (edgeFrac > 0.55 && srng() < 0.55) {
        // Large trees near outer edge
        const trees = [floraImgs.tree1, floraImgs.tree2, floraImgs.tree3];
        img = trees[Math.floor(srng() * trees.length)];
        baseSize = 130 + srng() * 80;
      } else if (srng() < 0.30) {
        // Bushes
        const bushes = [floraImgs.bush1, floraImgs.bush2, floraImgs.bush3];
        img = bushes[Math.floor(srng() * bushes.length)];
        baseSize = 80 + srng() * 50;
      } else if (srng() < 0.25) {
        // Stumps
        const stumps = [floraImgs.stump1, floraImgs.stump2, floraImgs.stump3];
        img = stumps[Math.floor(srng() * stumps.length)];
        baseSize = 70 + srng() * 40;
      } else if (srng() < 0.35) {
        // Rocks
        const rocks = [floraImgs.rockLg, floraImgs.rockSm, floraImgs.rockLg2, floraImgs.rockSm2];
        img = rocks[Math.floor(srng() * rocks.length)];
        baseSize = 65 + srng() * 35;
      } else if (srng() < 0.35) {
        // Grass / flower clumps
        const flowers = [floraImgs.grass1, floraImgs.flowers, floraImgs.flowerSmall];
        img = flowers[Math.floor(srng() * flowers.length)];
        baseSize = 70 + srng() * 40;
      } else if (srng() < 0.25) {
        // Fallen logs
        img = srng() < 0.5 ? floraImgs.fallenLog1 : floraImgs.fallenLog2;
        baseSize = 80 + srng() * 40;
      } else {
        // Moss mounds
        const mosses = [floraImgs.moss1, floraImgs.moss2, floraImgs.moss3, floraImgs.moss4];
        img = mosses[Math.floor(srng() * mosses.length)];
        baseSize = 70 + srng() * 50;
      }

      if (!img) continue;

      const el = document.createElement('img');
      el.src = img.src;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'position:absolute',
        'left:'    + (xFrac * 100).toFixed(1) + '%',
        'top:'     + (yFrac * 100).toFixed(1) + '%',
        'width:'   + Math.round(baseSize) + 'px',
        'z-index:' + Math.floor(yFrac * 100),
        'opacity:' + (0.82 + srng() * 0.15).toFixed(2),
        'pointer-events:none',
        'image-rendering:auto',
      ].join(';');
      layer.appendChild(el);
    }
  }

  // ─── Canvas setup ────────────────────────────────────────────────────────
  function setupCanvas(canvas, W, H) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2c4a14';
    ctx.fillRect(0, 0, W, H);
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  function render(canvas, spriteLayer, terrainImgs, floraImgs, propImgs, W, H) {
    resetRng();
    drawTerrain(canvas, terrainImgs, W, H);
    placeStructures(spriteLayer, propImgs, W, H);
    placeFlora(spriteLayer, floraImgs, W, H);
  }

  function loadAssets() {
    return Promise.all([
      loadAll(terrainPath, T_IDX),
      loadAll(floraPath, FL_IDX),
      loadAll(propPath, PR_IDX),
    ]);
  }

  function init() {
    const stage = document.getElementById('world-stage');
    if (!stage) return;
    const canvas      = document.getElementById('world-canvas');
    const spriteLayer = document.getElementById('world-sprite-layer');
    const W = stage.offsetWidth  || window.innerWidth;
    const H = stage.offsetHeight || window.innerHeight;
    setupCanvas(canvas, W, H);

    loadAssets().then(([terrainImgs, floraImgs, propImgs]) => {
      render(canvas, spriteLayer, terrainImgs, floraImgs, propImgs, W, H);
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nW = stage.offsetWidth, nH = stage.offsetHeight;
        setupCanvas(canvas, nW, nH);
        spriteLayer.innerHTML = '';
        loadAssets().then(([t, f, p]) => render(canvas, spriteLayer, t, f, p, nW, nH));
      }, 300);
    });
  }

  // ─── NPC walking animations ──────────────────────────────────────────────
  function initNPCs() {
    var layer = document.getElementById('world-sprite-layer');
    if (!layer) return;

    var npcs = [
      { sprite: '/assets/images/npcs/soldier-walk.png', frames: 8, w: 100, h: 100, speed: 0.15, y: 45, x0: 52, x1: 88, scale: 2.8 },
      { sprite: '/assets/images/npcs/orc-walk.png', frames: 8, w: 100, h: 100, speed: 0.1, y: 68, x0: 58, x1: 82, scale: 2.4 },
      { sprite: '/assets/images/npcs/soldier-walk.png', frames: 8, w: 100, h: 100, speed: 0.12, y: 82, x0: 62, x1: 92, scale: 3.0 },
    ];

    npcs.forEach(function(npc) {
      var el = document.createElement('div');
      var sz = Math.round(npc.w * npc.scale);
      el.style.cssText = 'position:absolute;width:' + sz + 'px;height:' + sz + 'px;background:url(' + npc.sprite + ') 0 0 / ' + (npc.frames * 100) + '% 100%;image-rendering:pixelated;z-index:5;pointer-events:none';
      el.style.top = npc.y + '%';
      el.style.left = npc.x0 + '%';
      layer.appendChild(el);

      var frame = 0;
      var xPct = npc.x0;
      var dir = 1;
      var fps = 8;
      var lastFrame = 0;
      var lastMove = 0;

      function animate(time) {
        // Frame animation
        if (time - lastFrame > 1000 / fps) {
          lastFrame = time;
          frame = (frame + 1) % npc.frames;
          el.style.backgroundPositionX = -(frame * sz) + 'px';
        }
        // Movement (fixed step per frame, no dt multiplication)
        if (time - lastMove > 16) {
          lastMove = time;
          xPct += dir * npc.speed;
          if (xPct > npc.x1) { dir = -1; el.style.transform = 'scaleX(-1)'; }
          if (xPct < npc.x0) { dir = 1; el.style.transform = 'scaleX(1)'; }
          el.style.left = xPct + '%';
        }
        requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
    });
  }

  // ─── UI: Toggle visibility ──────────────────────────────────────────────
  function initToggle() {
    var stage = document.getElementById('world-stage');
    var content = document.querySelector('.world-content');
    if (!stage || !content) return;

    var btn = document.createElement('div');
    btn.id = 'toggle-content';
    btn.style.cssText = 'position:fixed;top:1.2rem;right:1.2rem;z-index:10000;background:rgba(0,0,0,.45);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:50%;width:38px;height:38px;font-size:18px;line-height:38px;text-align:center;font-family:sans-serif;backdrop-filter:blur(4px);user-select:none;transition:background .2s;padding:0';
    var eyeOpen = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var eyeClosed = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    btn.innerHTML = eyeOpen;
    document.body.appendChild(btn);

    var bar = document.getElementById('game-bar');
    var hidden = false;
    btn.onclick = function(e) {
      e.stopPropagation();
      hidden = !hidden;
      content.style.opacity = hidden ? '0' : '';
      content.style.pointerEvents = hidden ? 'none' : '';
      if (bar) bar.style.opacity = hidden ? '0' : '';
      btn.innerHTML = hidden ? eyeClosed : eyeOpen;
    };
  }

  // ─── UI: Wand cursor selector ───────────────────────────────────────────
  function initWandSelector() {
    var WAND_COUNT = 50;
    var BASE = '/assets/images/wands/Icons_13_';
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function wandUrl(n) { return BASE + pad(n) + '.png'; }

    function applyCursor(id) {
      var url = wandUrl(parseInt(id));
      var rule = "url('" + url + "') 2 2, auto";
      var style = document.getElementById('wand-cursor-style');
      if (!style) { style = document.createElement('style'); style.id = 'wand-cursor-style'; document.head.appendChild(style); }
      style.textContent = 'html, *, *::before, *::after { cursor: ' + rule + ' !important; }';
    }

    // Load saved wand
    var saved = localStorage.getItem('cursor-wand') || '01';
    applyCursor(saved);

    // Wand button
    var btn = document.createElement('div');
    btn.id = 'wand-selector-btn';
    btn.style.cssText = 'position:fixed;top:4.2rem;right:1.2rem;z-index:10000;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.2);border-radius:50%;width:38px;height:38px;text-align:center;line-height:38px;backdrop-filter:blur(4px);user-select:none;transition:background .2s;padding:0';
    btn.innerHTML = '<img src="' + wandUrl(parseInt(saved)) + '" style="width:24px;height:24px;image-rendering:pixelated;vertical-align:middle" />';
    document.body.appendChild(btn);

    // Panel
    var panel = document.createElement('div');
    panel.id = 'wand-panel';
    panel.style.cssText = 'position:fixed;top:4.2rem;right:3.8rem;z-index:10001;background:rgba(20,18,30,.92);border:2px solid rgba(200,180,255,.25);border-radius:4px;padding:10px;display:none;max-width:500px;backdrop-filter:blur(6px)';

    var title = document.createElement('div');
    title.style.cssText = 'color:#c8b4ff;font-size:11px;font-family:Cinzel,serif;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;text-align:center';
    title.textContent = 'Choose your wand';
    panel.appendChild(title);

    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:4px';
    for (var i = 1; i <= WAND_COUNT; i++) {
      (function(idx) {
        var cell = document.createElement('div');
        cell.style.cssText = 'width:44px;height:44px;border:1px solid transparent;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:border-color .15s;background:rgba(255,255,255,.06)';
        cell.innerHTML = '<img src="' + wandUrl(idx) + '" style="width:38px;height:38px;image-rendering:pixelated" />';
        cell.onmouseenter = function() { cell.style.borderColor = 'rgba(200,180,255,.5)'; };
        cell.onmouseleave = function() { cell.style.borderColor = 'transparent'; };
        cell.onclick = function(e) {
          e.stopPropagation();
          var id = pad(idx);
          localStorage.setItem('cursor-wand', id);
          applyCursor(id);
          btn.querySelector('img').src = wandUrl(idx);
          panel.style.display = 'none';
        };
        grid.appendChild(cell);
      })(i);
    }
    panel.appendChild(grid);
    document.body.appendChild(panel);

    btn.onclick = function(e) {
      e.stopPropagation();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };
    document.addEventListener('click', function() { panel.style.display = 'none'; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); initNPCs(); initToggle(); initWandSelector(); });
  } else {
    init(); initNPCs(); initToggle(); initWandSelector();
  }
})();
