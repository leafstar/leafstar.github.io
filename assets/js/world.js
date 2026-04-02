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

  // Multi-octave noise (7 octaves, 0.5 falloff)
  function fbmRich(x, y) {
    let val = 0, amp = 1, freq = 1, total = 0;
    for (let i = 0; i < 7; i++) {
      val += perlin(x * freq, y * freq) * amp;
      total += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return val / total;
  }
  function fbmRich2(x, y) { return fbmRich(x + 137.7, y + 251.3); }

  // ─── Seeded RNG ──────────────────────────────────────────────────────────
  let rngState = 0x9e3779b9;
  function srng() {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    return (rngState >>> 0) / 0xffffffff;
  }
  function resetRng() { rngState = 0x9e3779b9; }

  // ─── Asset paths ──────────────────────────────────────────────────────────
  const BASE = '/assets/images/procedural-world';
  const SPRITE = BASE + '/sprites';

  // All sprite names — loaded into a flat { name: Image } map
  const SPRITE_NAMES = [
    // Trees (roboden forest, 6 variants + 2 fields)
    'tree_1','tree_2','tree_3','tree_4','tree_5','tree_6','tree_big','tree_small',
    // Bushes (6)
    'bush_1','bush_2','bush_3','bush_4','bush_5','bush_6',
    // Stones (16)
    'stone_1','stone_2','stone_3','stone_4','stone_5','stone_6','stone_7','stone_8',
    'stone_9','stone_10','stone_11','stone_12','stone_13','stone_14','stone_15','stone_16',
    // Flowers (12) & Grass tufts (6)
    'flower_1','flower_2','flower_3','flower_4','flower_5','flower_6',
    'flower_7','flower_8','flower_9','flower_10','flower_11','flower_12',
    'grass_1','grass_2','grass_3','grass_4','grass_5','grass_6',
    // Fences (10)
    'fence_1','fence_2','fence_3','fence_4','fence_5',
    'fence_6','fence_7','fence_8','fence_9','fence_10',
    // Camp structures
    'tent_open','tent_tall','tent_flat','tent_side',
    'campfire_stones','campfire_logs',
    // Decor
    'box1','box2','box3','box4',
    'log1','log2','log3','log4',
    'lamp1','lamp2','lamp3',
    'sign_1','sign_2','sign_3','sign_4','sign_5','sign_6',
    // Mountains
    'mountain_big','mountain_medium','mountain_small','mountain_tall','mountain_wide',
    // Shadows (plant base shadows)
    'shadow_1','shadow_2','shadow_3','shadow_4','shadow_5','shadow_6',
  ];

  // Animated sprites: sprite sheet approach (using first frame as static, animate via JS)
  const ANIM_SPRITES = [
    { name: 'flag1', frames: 6, prefix: 'flag1_frame' },
    { name: 'flag2', frames: 6, prefix: 'flag2_frame' },
    { name: 'flag3', frames: 6, prefix: 'flag3_frame' },
    { name: 'flag4', frames: 6, prefix: 'flag4_frame' },
    { name: 'flag5', frames: 6, prefix: 'flag5_frame' },
    { name: 'campfire1', frames: 6, prefix: 'campfire1_frame' },
    { name: 'campfire2', frames: 6, prefix: 'campfire2_frame' },
  ];

  // ─── Image loader ────────────────────────────────────────────────────────
  function loadImg(src) {
    return new Promise(r => {
      const img = new Image();
      img.onload  = () => r(img);
      img.onerror = () => r(null);
      img.src = src;
    });
  }

  // Load all sprites into a flat map
  function loadSprites() {
    const map = {};
    const promises = [];
    // Static sprites
    SPRITE_NAMES.forEach(name => {
      promises.push(loadImg(SPRITE + '/' + name + '.png').then(img => { map[name] = img; }));
    });
    // Animated sprite frames
    ANIM_SPRITES.forEach(anim => {
      map[anim.name] = []; // will hold array of frame images
      for (let f = 1; f <= anim.frames; f++) {
        const idx = f;
        promises.push(loadImg(SPRITE + '/' + anim.prefix + f + '.png').then(img => {
          map[anim.name][idx - 1] = img;
        }));
      }
    });
    return Promise.all(promises).then(() => map);
  }

  // ─── Seamless per-pixel terrain renderer ──────────────────────────────────
  const TILE_BASE = BASE + '/tiles';
  const TEX_SIZE = 64; // tile texture size

  // ─── Terrain height (shared for placement logic) ─────────────────────────
  const TERRAIN_ZOOM = 1400;
  function terrainHeight(sx, sy) {
    const h  = fbmRich(sx / TERRAIN_ZOOM, sy / TERRAIN_ZOOM);
    const h2 = fbmRich2(sx / (TERRAIN_ZOOM * 1.3), sy / (TERRAIN_ZOOM * 1.1));
    const raw = h * 0.65 + h2 * 0.35;
    return Math.max(0, Math.min(1, (raw - 0.25) * 2.0));
  }

  // Sub-biome noise for grass shade variation
  function subBiomeNoise(sx, sy) {
    return fbmRich(sx / 600 + 500, sy / 600 + 500);
  }

  // Extract pixel data from an Image into Uint8ClampedArray
  function extractPixels(img) {
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    return cx.getImageData(0, 0, c.width, c.height);
  }

  // Terrain type enum
  const T_DEEP = 0, T_SHALLOW = 1, T_BEACH = 2, T_GRASS_L = 3, T_GRASS_D = 4;

  // Height thresholds
  const H_DEEP = 0.35, H_SHALLOW = 0.50, H_BEACH = 0.58;

  // Tile texture definitions per terrain type
  const TILE_DEFS = [
    { type: T_DEEP,    name: 'deep0' },
    { type: T_SHALLOW, name: 'shallow0' },
    { type: T_BEACH,   name: 'beach0' },
    { type: T_GRASS_L, name: 'grass0' },
    { type: T_GRASS_D, name: 'grass3' },
  ];

  function loadTiles() {
    const promises = [];
    const textures = {}; // type → ImageData

    TILE_DEFS.forEach(def => {
      const path = TILE_BASE + '/' + def.name + '/straight/0/0.png';
      promises.push(loadImg(path).then(img => {
        textures[def.type] = extractPixels(img);
      }));
    });

    return Promise.all(promises).then(() => ({ textures }));
  }

  // Sample a color from a tiling texture at world position (sx, sy)
  function sampleTex(texData, sx, sy) {
    if (!texData) return [60, 100, 30, 255];
    const w = texData.width, h = texData.height;
    const tx = ((Math.floor(sx) % w) + w) % w;
    const ty = ((Math.floor(sy) % h) + h) % h;
    const idx = (ty * w + tx) * 4;
    return [texData.data[idx], texData.data[idx+1], texData.data[idx+2], 255];
  }

  // Classify terrain → type + blend weight to next type
  function classifySmooth(h, sub) {
    // Returns [typeA, typeB, blend] where blend is 0..1 transition weight
    const FADE = 0.04; // transition width in height units
    if (h < H_DEEP - FADE) return [T_DEEP, T_DEEP, 0];
    if (h < H_DEEP + FADE) return [T_DEEP, T_SHALLOW, (h - H_DEEP + FADE) / (2 * FADE)];
    if (h < H_SHALLOW - FADE) return [T_SHALLOW, T_SHALLOW, 0];
    if (h < H_SHALLOW + FADE) return [T_SHALLOW, T_BEACH, (h - H_SHALLOW + FADE) / (2 * FADE)];
    if (h < H_BEACH - FADE) return [T_BEACH, T_BEACH, 0];
    if (h < H_BEACH + FADE) {
      const gType = sub > 0.50 ? T_GRASS_D : T_GRASS_L;
      return [T_BEACH, gType, (h - H_BEACH + FADE) / (2 * FADE)];
    }
    return sub > 0.50 ? [T_GRASS_D, T_GRASS_D, 0] : [T_GRASS_L, T_GRASS_L, 0];
  }

  // ─── Draw terrain (per-pixel seamless) ───────────────────────────────────
  function drawTerrain(canvas, W, H, tiles) {
    const ctx = canvas.getContext('2d');
    const { textures } = tiles;

    // Render at half of 2x canvas = effective 1x viewport resolution
    const SCALE = 2;
    const rW = Math.ceil(W / SCALE);
    const rH = Math.ceil(H / SCALE);
    const offCanvas = document.createElement('canvas');
    offCanvas.width = rW;
    offCanvas.height = rH;
    const oCtx = offCanvas.getContext('2d');
    const imgData = oCtx.createImageData(rW, rH);
    const d = imgData.data;

    for (let py = 0; py < rH; py++) {
      for (let px = 0; px < rW; px++) {
        // World coordinates
        const sx = px * SCALE;
        const sy = py * SCALE;

        const h = terrainHeight(sx, sy);
        const sub = subBiomeNoise(sx, sy);
        const [tA, tB, blend] = classifySmooth(h, sub);

        // Sample textures (tile at world coords for seamless tiling)
        const cA = sampleTex(textures[tA], sx, sy);

        let r, g, b;
        if (blend < 0.01) {
          r = cA[0]; g = cA[1]; b = cA[2];
        } else {
          const cB = sampleTex(textures[tB], sx, sy);
          const inv = 1 - blend;
          r = cA[0] * inv + cB[0] * blend;
          g = cA[1] * inv + cB[1] * blend;
          b = cA[2] * inv + cB[2] * blend;
        }

        // Water specular highlights
        if (h < H_BEACH) {
          const spec = perlin(sx / 10 + 0.3, sy / 10 + 0.7);
          if (spec > 0.42) {
            const bright = (spec - 0.42) * 1.5;
            r = Math.min(255, r + 25 * bright);
            g = Math.min(255, g + 40 * bright);
            b = Math.min(255, b + 50 * bright);
          }
        }

        const idx = (py * rW + px) * 4;
        d[idx]     = r | 0;
        d[idx + 1] = g | 0;
        d[idx + 2] = b | 0;
        d[idx + 3] = 255;
      }
    }

    oCtx.putImageData(imgData, 0, 0);

    // Upscale to full resolution with nearest-neighbor (pixel art look)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offCanvas, 0, 0, W, H);
  }

  // ─── Camp structures (terrain-aware) ─────────────────────────────────────
  // Uses new sprites: tents, signs, boxes, logs, fences, campfire, flags, lamps
  const CAMP_ANCHORS = [
    // ── Main camp (right side) ──
    { sprite: 'tent_open',  xp: 70, yp: 12, size: 120, z: 20 },
    { sprite: 'tent_tall',  xp: 82, yp: 10, size: 100, z: 18 },
    { sprite: 'tent_flat',  xp: 75, yp: 28, size: 110, z: 36 },
    { sprite: 'tent_side',  xp: 86, yp: 25, size: 110, z: 33 },
    { sprite: 'flag1',      xp: 68, yp:  5, size:  70, z: 14, anim: true },
    { sprite: 'flag3',      xp: 90, yp:  6, size:  70, z: 15, anim: true },
    { sprite: 'flag4',      xp: 78, yp:  4, size:  70, z: 13, anim: true },
    { sprite: 'campfire_stones', xp: 78, yp: 44, size: 50, z: 47 },
    { sprite: 'campfire1',  xp: 78, yp: 42, size:  70, z: 48, anim: true },
    { sprite: 'sign_1',     xp: 65, yp: 22, size:  50, z: 30 },
    { sprite: 'sign_4',     xp: 92, yp: 18, size:  45, z: 26 },
    { sprite: 'box1',       xp: 88, yp: 38, size:  45, z: 44 },
    { sprite: 'box2',       xp: 91, yp: 40, size:  45, z: 46 },
    { sprite: 'log1',       xp: 83, yp: 48, size:  70, z: 54 },
    { sprite: 'log2',       xp: 72, yp: 50, size:  60, z: 56 },
    { sprite: 'log3',       xp: 90, yp: 52, size:  55, z: 58 },
    // Fence perimeter around right camp
    { sprite: 'fence_1',    xp: 66, yp: 35, size:  60, z: 42 },
    { sprite: 'fence_2',    xp: 69, yp: 35, size:  60, z: 42 },
    { sprite: 'fence_3',    xp: 72, yp: 35, size:  60, z: 42 },
    { sprite: 'fence_6',    xp: 88, yp: 35, size:  60, z: 42 },
    { sprite: 'fence_7',    xp: 91, yp: 35, size:  60, z: 42 },
    { sprite: 'lamp1',      xp: 76, yp: 36, size:  50, z: 43 },
    { sprite: 'lamp3',      xp: 93, yp: 30, size:  50, z: 38 },
    // ── Left camp ──
    { sprite: 'tent_open',  xp:  3, yp: 15, size: 120, z: 22 },
    { sprite: 'flag2',      xp:  1, yp:  8, size:  70, z: 16, anim: true },
    { sprite: 'flag5',      xp: 16, yp:  9, size:  70, z: 17, anim: true },
    { sprite: 'campfire_logs', xp: 8, yp: 34, size: 50, z: 37 },
    { sprite: 'campfire2',  xp:  8, yp: 32, size:  60, z: 38, anim: true },
    { sprite: 'box3',       xp:  5, yp: 28, size:  45, z: 35 },
    { sprite: 'sign_3',     xp: 14, yp: 18, size:  50, z: 26 },
    { sprite: 'sign_2',     xp: 20, yp: 24, size:  45, z: 32 },
    { sprite: 'fence_4',    xp:  1, yp: 30, size:  60, z: 36 },
    { sprite: 'fence_8',    xp:  4, yp: 30, size:  60, z: 36 },
    { sprite: 'log4',       xp: 12, yp: 36, size:  55, z: 42 },
    // ── Lower scattered ──
    { sprite: 'tent_side',  xp:  5, yp: 68, size: 110, z: 74 },
    { sprite: 'fence_5',    xp: 72, yp: 62, size:  60, z: 68 },
    { sprite: 'fence_9',    xp: 75, yp: 62, size:  60, z: 68 },
    { sprite: 'lamp2',      xp: 85, yp: 58, size:  50, z: 64 },
    { sprite: 'box4',       xp: 88, yp: 70, size:  40, z: 76 },
    { sprite: 'sign_5',     xp: 68, yp: 66, size:  45, z: 72 },
    // ── Mountains (deep forest / map edges) ──
    { sprite: 'mountain_big',    xp:  0, yp: 88, size: 180, z: 92 },
    { sprite: 'mountain_medium', xp: 15, yp: 85, size: 140, z: 90 },
    { sprite: 'mountain_small',  xp: 30, yp: 90, size: 100, z: 94 },
    { sprite: 'mountain_tall',   xp: 92, yp: 85, size: 110, z: 91 },
    { sprite: 'mountain_wide',   xp: 50, yp: 92, size: 120, z: 96 },
  ];

  function placeStructures(layer, sprites, W, H) {
    if (!sprites) return;
    const animEls = []; // collect animated elements for animation loop

    CAMP_ANCHORS.forEach(a => {
      const sx = a.xp / 100 * W, sy = a.yp / 100 * H;
      const th = terrainHeight(sx, sy);
      if (th < 0.62) return; // skip water and sand

      if (a.anim && Array.isArray(sprites[a.sprite])) {
        // Animated sprite — use div with background swap
        const frames = sprites[a.sprite];
        if (!frames[0]) return;
        const el = document.createElement('div');
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = [
          'position:absolute',
          'left:' + a.xp + '%', 'top:' + a.yp + '%',
          'width:' + a.size + 'px', 'height:' + Math.round(a.size * 2) + 'px',
          'z-index:' + a.z,
          'pointer-events:none', 'image-rendering:pixelated',
          'background-size:contain', 'background-repeat:no-repeat',
        ].join(';');
        layer.appendChild(el);
        animEls.push({ el, frames, frame: 0 });
      } else {
        const img = sprites[a.sprite];
        if (!img) return;
        const el = document.createElement('img');
        el.src = img.src;
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = [
          'position:absolute',
          'left:' + a.xp + '%', 'top:' + a.yp + '%',
          'width:' + a.size + 'px',
          'z-index:' + a.z,
          'pointer-events:none', 'image-rendering:pixelated',
        ].join(';');
        layer.appendChild(el);
      }
    });

    // Scatter small detail sprites (flowers, grass) around each placed structure
    const detailNames = [
      'flower_1','flower_2','flower_3','flower_4','flower_5','flower_6',
      'flower_7','flower_8','flower_9','flower_10','flower_11','flower_12',
      'grass_1','grass_2','grass_3','grass_4','grass_5','grass_6',
    ];
    CAMP_ANCHORS.forEach(a => {
      if (a.sprite.startsWith('mountain')) return; // no flowers on mountains
      const sx = a.xp / 100 * W, sy = a.yp / 100 * H;
      const th = terrainHeight(sx, sy);
      if (th < 0.62) return;
      // 2–5 tiny details per structure
      const count = 2 + Math.floor(srng() * 4);
      for (let d = 0; d < count; d++) {
        const dName = detailNames[Math.floor(srng() * detailNames.length)];
        const img = sprites[dName];
        if (!img) continue;
        const ox = a.xp + (srng() - 0.4) * 8; // scatter ±4% around structure
        const oy = a.yp + (srng() - 0.2) * 6;
        if (ox < 0 || ox > 100 || oy < 0 || oy > 100) continue;
        const el = document.createElement('img');
        el.src = img.src;
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = [
          'position:absolute',
          'left:' + ox.toFixed(1) + '%', 'top:' + oy.toFixed(1) + '%',
          'width:' + Math.round(12 + srng() * 10) + 'px',
          'z-index:' + (a.z - 1),
          'pointer-events:none', 'image-rendering:pixelated',
        ].join(';');
        layer.appendChild(el);
      }
    });

    // Animate flags & campfires
    if (animEls.length) {
      let lastTick = 0;
      function animLoop(time) {
        if (time - lastTick > 150) { // ~6.6 fps
          lastTick = time;
          animEls.forEach(a => {
            a.frame = (a.frame + 1) % a.frames.length;
            if (a.frames[a.frame]) {
              a.el.style.backgroundImage = 'url(' + a.frames[a.frame].src + ')';
            }
          });
        }
        requestAnimationFrame(animLoop);
      }
      requestAnimationFrame(animLoop);
    }
  }

  // ─── Flora placement (terrain-aware) ─────────────────────────────────────
  function buildExclusions() {
    return CAMP_ANCHORS.map(a => ({
      xp: a.xp, yp: a.yp,
      r: a.size >= 110 ? 10 : a.size >= 70 ? 7 : 5,
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

  // Helper: pick random from array using srng
  function rPick(arr) { return arr[Math.floor(srng() * arr.length)]; }

  // Helper: place a single sprite element
  function placeSprite(layer, img, xPct, yPct, size, z) {
    const el = document.createElement('img');
    el.src = img.src;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = [
      'position:absolute',
      'left:' + xPct.toFixed(1) + '%',
      'top:'  + yPct.toFixed(1) + '%',
      'width:' + Math.round(size) + 'px',
      'z-index:' + z,
      'pointer-events:none',
      'image-rendering:pixelated',
    ].join(';');
    layer.appendChild(el);
  }

  function placeFlora(layer, sprites, W, H) {
    if (!sprites) return;
    const attempts = Math.floor(W / 1.8);
    const exclusions = buildExclusions();

    // ── Overlap prevention for large sprites ──
    // Stores placed large objects as { x (%), y (%), r (%) }
    const placed = [];
    function overlapsPlaced(xPct, yPct, radiusPct) {
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const dx = xPct - p.x;
        // Trees extend upward: check more space above than below
        const dy = yPct - p.y;
        const dyUp = dy > 0 ? dy * 0.6 : dy * 2.5; // strong upward check (tree canopy extends far up)
        const minDist = radiusPct + p.r;
        if (dx * dx + dyUp * dyUp < minDist * minDist) return true;
      }
      return false;
    }
    // Convert pixel size to collision radius (percentage units)
    // Use generous radius to prevent visual overlap
    function sizeToRadius(sizePx) {
      return (sizePx / W) * 100 * 1.0;
    }

    // ── Sprite groups ──
    const trees     = ['tree_1','tree_2','tree_3','tree_4','tree_5','tree_6'].filter(n => sprites[n]);
    const bigTree   = sprites.tree_big ? ['tree_big'] : [];
    const smallTree = sprites.tree_small ? ['tree_small'] : [];
    const bushes    = ['bush_1','bush_2','bush_3','bush_4','bush_5','bush_6'].filter(n => sprites[n]);
    const stones    = ['stone_1','stone_2','stone_3','stone_4','stone_5','stone_6',
                       'stone_7','stone_8','stone_9','stone_10'].filter(n => sprites[n]);
    const bigStones = ['stone_11','stone_12','stone_13','stone_14','stone_15','stone_16'].filter(n => sprites[n]);
    const flowers   = ['flower_1','flower_2','flower_3','flower_4','flower_5','flower_6',
                       'flower_7','flower_8','flower_9','flower_10','flower_11','flower_12'].filter(n => sprites[n]);
    const grasses   = ['grass_1','grass_2','grass_3','grass_4','grass_5','grass_6'].filter(n => sprites[n]);
    const logs      = ['log1','log2','log3','log4'].filter(n => sprites[n]);
    const shadows   = ['shadow_1','shadow_2','shadow_3','shadow_4','shadow_5','shadow_6'].filter(n => sprites[n]);
    const details   = flowers.concat(grasses);

    // ── World narrative: camp clearings in a forest ──
    // Camp centers (percentage coords) — derived from CAMP_ANCHORS layout
    const campCenters = [
      { x: 80, y: 25 },  // main camp (right side)
      { x: 10, y: 25 },  // left camp
      { x:  8, y: 70 },  // lower left outpost
      { x: 80, y: 65 },  // lower right area
    ];

    // Distance to nearest camp center (in percentage units)
    function campDist(xPct, yPct) {
      let minD = 999;
      for (let i = 0; i < campCenters.length; i++) {
        const dx = xPct - campCenters[i].x;
        const dy = (yPct - campCenters[i].y) * 1.3; // stretch Y for top-down perspective
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minD) minD = d;
      }
      return minD;
    }

    // Vegetation zone based on distance from human activity:
    //   0-12%  = CLEARED (camp interior, no trees)
    //   12-22% = EDGE (tree stumps, sparse regrowth, small bushes)
    //   22-40% = OPEN WOODLAND (scattered trees, flowers, grassland)
    //   40%+   = DEEP FOREST (dense canopy, understory, fallen logs)
    // Rocky outcrops overlay via separate noise channel
    function rockyNoise(sx, sy) {
      return fbmRich(sx / 350 + 300, sy / 350 + 300);
    }

    // Edge irregularity: make tree line wavy, not circular
    function edgeJitter(sx, sy) {
      return (fbmRich(sx / 200 + 100, sy / 200 + 100) - 0.5) * 10;
    }

    // Scatter ground cover around a placed object
    function scatterDetails(cx, cy, radius, count) {
      for (let d = 0; d < count; d++) {
        const angle = srng() * Math.PI * 2;
        const dist  = srng() * radius;
        const dx = cx + Math.cos(angle) * dist;
        const dy = cy + Math.sin(angle) * dist * 0.6;
        if (dx < 0.5 || dx > 99.5 || dy < 0.5 || dy > 99.5) continue;
        const dth = terrainHeight(dx / 100 * W, dy / 100 * H);
        if (dth < 0.58) continue;
        const dName = rPick(details);
        const dImg = sprites[dName];
        if (dImg) placeSprite(layer, dImg, dx, dy, 6 + srng() * 7, Math.floor(dy));
      }
    }

    // Place a cluster of companion trees/bushes near a large tree
    function placeCluster(cx, cy, mainSize) {
      const count = 2 + Math.floor(srng() * 3);
      for (let c = 0; c < count; c++) {
        const angle = srng() * Math.PI * 2;
        const dist = 1.5 + srng() * 3.5;
        const nx = cx + Math.cos(angle) * dist;
        const ny = cy + Math.sin(angle) * dist * 0.6;
        if (nx < 0.5 || nx > 99.5 || ny < 0.5 || ny > 99.5) continue;
        if (nearStructure(nx, ny, exclusions)) continue;
        const nth = terrainHeight(nx / 100 * W, ny / 100 * H);
        if (nth < 0.58) continue;
        const roll = srng();
        let name, sz;
        if (roll < 0.35) {
          name = rPick(trees);
          sz = 50 + srng() * 25;
        } else if (roll < 0.60) {
          name = smallTree.length ? rPick(smallTree) : rPick(bushes);
          sz = 30 + srng() * 18;
        } else {
          name = rPick(bushes);
          sz = 22 + srng() * 20;
        }
        const img = sprites[name];
        if (img) {
          const cr = sizeToRadius(sz);
          if (overlapsPlaced(nx, ny, cr)) continue;
          placed.push({ x: nx, y: ny, r: cr });
          placeSprite(layer, img, nx, ny, sz, Math.floor(ny));
          if (details.length && srng() < 0.5) {
            scatterDetails(nx, ny, 2 + srng() * 2, 1 + Math.floor(srng() * 3));
          }
        }
      }
    }

    // ── Main placement loop ──
    for (let i = 0; i < attempts; i++) {
      const xFrac = 0.01 + srng() * 0.98;
      const yFrac = 0.01 + srng() * 0.98;
      const xPct = xFrac * 100, yPct = yFrac * 100;

      if (nearStructure(xPct, yPct, exclusions)) continue;

      const th = terrainHeight(xFrac * W, yFrac * H);
      if (th < 0.55) continue; // water

      // Distance to nearest camp + edge noise for organic tree line
      const dist = campDist(xPct, yPct) + edgeJitter(xFrac * W, yFrac * H);
      // Rocky overlay
      const rocky = rockyNoise(xFrac * W, yFrac * H);
      // Screen edge proximity (0 at center, 1 at edge) — forest thickens at edges
      const edgeX = Math.max(0, 1 - Math.min(xFrac, 1 - xFrac) / 0.15);
      const edgeY = Math.max(0, 1 - Math.min(yFrac, 1 - yFrac) / 0.12);
      const edgeFactor = Math.max(edgeX, edgeY); // 0..1, high at screen edges

      let spriteName, baseSize, isBig = false, isTree = false;

      if (th < 0.62) {
        // ── WATERSIDE — sparse stones, driftwood ──
        if (srng() < 0.60) continue;
        if (srng() < 0.6) {
          spriteName = rPick(stones);
          baseSize = 18 + srng() * 22;
        } else {
          spriteName = rPick(logs);
          baseSize = 30 + srng() * 22;
          isBig = true;
        }

      } else if (dist < 12) {
        // ── CAMP INTERIOR — almost bare, trampled ground ──
        // Very sparse: only small ground details
        if (srng() < 0.75) continue;
        const roll = srng();
        if (roll < 0.5) {
          spriteName = rPick(grasses);
          baseSize = 8 + srng() * 10;
        } else if (roll < 0.8) {
          spriteName = rPick(shadows);
          baseSize = 12 + srng() * 10;
        } else {
          spriteName = rPick(stones);
          baseSize = 12 + srng() * 14;
        }

      } else if (dist < 22) {
        // ── CAMP EDGE — tree stumps, sparse regrowth ──
        // Transition zone: small bushes coming back, some logs from felled trees
        if (srng() < 0.30) continue;
        const roll = srng();
        if (roll < 0.25) {
          spriteName = rPick(bushes);
          baseSize = 22 + srng() * 28;
          isBig = true;
        } else if (roll < 0.40) {
          spriteName = rPick(logs); // felled tree remains
          baseSize = 30 + srng() * 25;
          isBig = true;
        } else if (roll < 0.55) {
          spriteName = smallTree.length ? rPick(smallTree) : rPick(bushes);
          baseSize = 28 + srng() * 25;
          isBig = true;
        } else if (roll < 0.72) {
          spriteName = rPick(grasses);
          baseSize = 10 + srng() * 12;
        } else if (roll < 0.85) {
          spriteName = rPick(flowers); // wildflowers in cleared area
          baseSize = 7 + srng() * 7;
        } else {
          spriteName = rPick(stones);
          baseSize = 15 + srng() * 18;
        }

      } else if (rocky > 0.68 && dist > 18) {
        // ── ROCKY OUTCROP — boulders and tough plants ──
        if (srng() < 0.08) continue;
        const roll = srng();
        if (roll < 0.35) {
          spriteName = rPick(bigStones);
          baseSize = 35 + srng() * 50;
          isBig = true;
        } else if (roll < 0.60) {
          spriteName = rPick(stones);
          baseSize = 20 + srng() * 28;
        } else if (roll < 0.75) {
          spriteName = rPick(bushes);
          baseSize = 22 + srng() * 25;
        } else if (roll < 0.85) {
          spriteName = rPick(shadows);
          baseSize = 14 + srng() * 16;
        } else {
          spriteName = rPick(grasses);
          baseSize = 9 + srng() * 11;
        }

      } else if (dist < 40 && edgeFactor < 0.3) {
        // ── OPEN WOODLAND — scattered trees, wildflowers ──
        if (srng() < 0.12) continue;
        const roll = srng();
        if (roll < 0.14) {
          spriteName = rPick(trees);
          baseSize = 55 + srng() * 25;
          isBig = true; isTree = true;
        } else if (roll < 0.22) {
          spriteName = smallTree.length ? rPick(smallTree) : rPick(bushes);
          baseSize = 35 + srng() * 18;
          isBig = true;
        } else if (roll < 0.36) {
          spriteName = rPick(bushes);
          baseSize = 26 + srng() * 22;
          isBig = true;
        } else if (roll < 0.52) {
          spriteName = rPick(flowers);
          baseSize = 7 + srng() * 8;
        } else if (roll < 0.68) {
          spriteName = rPick(grasses);
          baseSize = 9 + srng() * 13;
        } else if (roll < 0.78) {
          spriteName = rPick(stones);
          baseSize = 14 + srng() * 18;
        } else if (roll < 0.88) {
          spriteName = rPick(shadows);
          baseSize = 14 + srng() * 14;
        } else {
          spriteName = rPick(logs);
          baseSize = 28 + srng() * 22;
          isBig = true;
        }

      } else {
        // ── DEEP FOREST — dense canopy, dark understory ──
        // Density increases toward screen edges
        if (srng() < 0.02) continue;
        const roll = srng();
        // Trees grow bigger and more frequent deeper in
        const depthBonus = Math.min(1, (dist - 35) / 30); // 0..1
        if (roll < 0.35 + depthBonus * 0.10) {
          spriteName = rPick(trees);
          baseSize = 60 + srng() * 30 + depthBonus * 10;
          isBig = true; isTree = true;
        } else if (roll < 0.50 + depthBonus * 0.08) {
          spriteName = bigTree.length ? rPick(bigTree) : rPick(trees);
          baseSize = bigTree.length ? (80 + srng() * 35) : (65 + srng() * 25);
          isBig = true; isTree = true;
        } else if (roll < 0.67) {
          spriteName = rPick(bushes);
          baseSize = 28 + srng() * 25;
          isBig = true;
        } else if (roll < 0.78) {
          spriteName = rPick(shadows);
          baseSize = 16 + srng() * 20;
        } else if (roll < 0.86) {
          spriteName = rPick(grasses);
          baseSize = 10 + srng() * 14;
        } else if (roll < 0.93) {
          spriteName = rPick(logs); // fallen trees in old forest
          baseSize = 38 + srng() * 35;
          isBig = true;
        } else {
          spriteName = rPick(bigStones);
          baseSize = 26 + srng() * 30;
          isBig = true;
        }
      }

      const img = sprites[spriteName];
      if (!img) continue;

      // Overlap check for large sprites (trees, big bushes, big stones)
      if (isBig) {
        const r = sizeToRadius(baseSize);
        if (overlapsPlaced(xPct, yPct, r)) continue;
        placed.push({ x: xPct, y: yPct, r: r });
      }

      const z = Math.floor(yPct);
      placeSprite(layer, img, xPct, yPct, baseSize, z);

      // Deep forest: frequent tree clusters for dense canopy
      if (isTree && dist > 30 && srng() < 0.55) {
        placeCluster(xPct, yPct, baseSize);
      }
      // Woodland: occasional clusters
      if (isTree && dist >= 22 && dist <= 30 && srng() < 0.25) {
        placeCluster(xPct, yPct, baseSize);
      }

      // Ground cover around large objects
      if (isBig && details.length) {
        scatterDetails(xPct, yPct, 3.5 + srng() * 3, 2 + Math.floor(srng() * 4));
      }
    }

    // ── Edge tree wall: dense trees covering ~50% of map borders ──
    const edgeAttempts = Math.floor(W * 3);
    for (let i = 0; i < edgeAttempts; i++) {
      let xFrac, yFrac;
      const side = srng();
      if (side < 0.25) {
        xFrac = 0.005 + srng() * 0.99;
        yFrac = 0.005 + srng() * 0.18;
      } else if (side < 0.50) {
        xFrac = 0.005 + srng() * 0.99;
        yFrac = 0.82 + srng() * 0.175;
      } else if (side < 0.75) {
        xFrac = 0.005 + srng() * 0.18;
        yFrac = 0.005 + srng() * 0.99;
      } else {
        xFrac = 0.82 + srng() * 0.175;
        yFrac = 0.005 + srng() * 0.99;
      }

      const th = terrainHeight(xFrac * W, yFrac * H);
      if (th < 0.55) continue;
      const xPct = xFrac * 100, yPct = yFrac * 100;
      if (nearStructure(xPct, yPct, exclusions)) continue;

      const roll = srng();
      let name, sz;
      if (roll < 0.50) {
        name = rPick(trees);
        sz = 60 + srng() * 30;
      } else if (roll < 0.75) {
        name = bigTree.length ? rPick(bigTree) : rPick(trees);
        sz = bigTree.length ? (80 + srng() * 35) : (65 + srng() * 25);
      } else if (roll < 0.88) {
        name = rPick(bushes);
        sz = 28 + srng() * 22;
      } else {
        name = smallTree.length ? rPick(smallTree) : rPick(bushes);
        sz = 32 + srng() * 20;
      }

      const img = sprites[name];
      if (!img) continue;

      // Use slightly tighter collision radius so trees pack closer at edges
      const r = sizeToRadius(sz) * 0.8;
      if (overlapsPlaced(xPct, yPct, r)) continue;
      placed.push({ x: xPct, y: yPct, r: r });
      placeSprite(layer, img, xPct, yPct, sz, Math.floor(yPct));

      if (details.length && srng() < 0.5) {
        scatterDetails(xPct, yPct, 2.5 + srng() * 2, 1 + Math.floor(srng() * 3));
      }
    }
  }

  // ─── Canvas setup ────────────────────────────────────────────────────────
  function setupCanvas(canvas, W, H) {
    // BG_SCALE already handles resolution — skip DPR to avoid 4x overhead
    canvas.width  = W;
    canvas.height = H;
    canvas.style.imageRendering = 'pixelated';
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1a4a80';
    ctx.fillRect(0, 0, W, H);
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  // Terrain canvas renders at 2x viewport for detail; sprites stay at 1x
  const BG_SCALE = 2;

  function render(canvas, spriteLayer, sprites, tiles, viewW, viewH) {
    resetRng();
    drawTerrain(canvas, viewW * BG_SCALE, viewH * BG_SCALE, tiles);
    placeStructures(spriteLayer, sprites, viewW, viewH);
    placeFlora(spriteLayer, sprites, viewW, viewH);
  }

  function loadAssets() {
    return Promise.all([
      loadSprites(),
      loadTiles(),
    ]);
  }

  function init() {
    const stage = document.getElementById('world-stage');
    if (!stage) return;
    const canvas      = document.getElementById('world-canvas');
    const spriteLayer = document.getElementById('world-sprite-layer');
    const W = stage.offsetWidth  || window.innerWidth;
    const H = stage.offsetHeight || window.innerHeight;
    setupCanvas(canvas, W * BG_SCALE, H * BG_SCALE);

    loadAssets().then(([sprites, tiles]) => {
      render(canvas, spriteLayer, sprites, tiles, W, H);
    });

    // On resize: only reposition sprites, don't re-render terrain
    // Canvas CSS width:100% auto-stretches the terrain with nearest-neighbor
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nW = stage.offsetWidth || window.innerWidth;
        const nH = stage.offsetHeight || window.innerHeight;
        spriteLayer.innerHTML = '';
        loadAssets().then(([s, t]) => {
          resetRng();
          placeStructures(spriteLayer, s, nW, nH);
          placeFlora(spriteLayer, s, nW, nH);
          initNPCs();
        });
      }, 300);
    });
  }

  // ─── NPC system (terrain-aware walkers + idle guards) ────────────────────
  var NPC_BASE = '/assets/images/npcs/';

  function findWalkableSpan(yPct, W, H, minSpanPct) {
    var sy = yPct / 100 * H;
    var spans = [];
    var spanStart = -1;
    for (var xPct = 2; xPct <= 98; xPct += 2) {
      var th = terrainHeight(xPct / 100 * W, sy);
      if (th >= 0.62) {
        if (spanStart < 0) spanStart = xPct;
      } else {
        if (spanStart >= 0) {
          spans.push({ x0: spanStart, x1: xPct - 2 });
          spanStart = -1;
        }
      }
    }
    if (spanStart >= 0) spans.push({ x0: spanStart, x1: 98 });
    var best = null;
    for (var i = 0; i < spans.length; i++) {
      var w = spans[i].x1 - spans[i].x0;
      if (w >= minSpanPct && (!best || w > best.x1 - best.x0)) best = spans[i];
    }
    return best;
  }

  function isWalkable(xPct, yPct, W, H) {
    return terrainHeight(xPct / 100 * W, yPct / 100 * H) >= 0.52;
  }

  function initNPCs() {
    var layer = document.getElementById('world-sprite-layer');
    if (!layer) return;
    var stage = document.getElementById('world-stage');
    if (!stage) return;
    var W = stage.offsetWidth || window.innerWidth;
    var H = stage.offsetHeight || window.innerHeight;

    // ── Walking patrol NPCs ──
    var walkers = [
      { sprite: 'soldier-walk.png', frames: 8, w: 100, h: 100, speed: 0.15, preferY: 35, scale: 1.5 },
      { sprite: 'orc-walk.png',     frames: 8, w: 100, h: 100, speed: 0.08, preferY: 55, scale: 1.5 },
      { sprite: 'soldier-walk.png', frames: 8, w: 100, h: 100, speed: 0.12, preferY: 75, scale: 1.5 },
      { sprite: 'orc-walk.png',     frames: 8, w: 100, h: 100, speed: 0.10, preferY: 45, scale: 1.5 },
    ];

    walkers.forEach(function(npc) {
      var bestY = npc.preferY, span = null;
      for (var dy = 0; dy <= 20; dy += 4) {
        span = findWalkableSpan(npc.preferY + dy, W, H, 15);
        if (span) { bestY = npc.preferY + dy; break; }
        if (dy > 0) {
          span = findWalkableSpan(npc.preferY - dy, W, H, 15);
          if (span) { bestY = npc.preferY - dy; break; }
        }
      }
      if (!span) return;

      var el = document.createElement('div');
      var sz = Math.round(npc.w * npc.scale);
      el.style.cssText = 'position:absolute;width:' + sz + 'px;height:' + sz + 'px;background:url(' + NPC_BASE + npc.sprite + ') 0 0 / ' + (npc.frames * 100) + '% 100%;image-rendering:pixelated;z-index:' + Math.floor(bestY) + ';pointer-events:none';
      el.style.top = bestY + '%';
      el.style.left = span.x0 + '%';
      layer.appendChild(el);

      var frame = 0, xPct = span.x0, dir = 1, fps = 8, lastFrame = 0, lastMove = 0;
      function animate(time) {
        if (time - lastFrame > 1000 / fps) {
          lastFrame = time;
          frame = (frame + 1) % npc.frames;
          el.style.backgroundPositionX = -(frame * sz) + 'px';
        }
        if (time - lastMove > 16) {
          lastMove = time;
          var nextX = xPct + dir * npc.speed;
          var th = terrainHeight(nextX / 100 * W, bestY / 100 * H);
          if (th < 0.62 || nextX > span.x1 || nextX < span.x0) {
            dir = -dir;
            el.style.transform = dir > 0 ? 'scaleX(1)' : 'scaleX(-1)';
          } else {
            xPct = nextX;
            el.style.left = xPct + '%';
          }
        }
        requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
    });

    // ── Idle NPCs near camp structures ──
    var idlers = [
      { sprite: 'soldier-idle.png', frames: 6, w: 100, h: 100, xp: 74, yp: 20, scale: 1.5 },
      { sprite: 'orc-idle.png',     frames: 6, w: 100, h: 100, xp: 84, yp: 30, scale: 1.5 },
      { sprite: 'soldier-idle.png', frames: 6, w: 100, h: 100, xp:  6, yp: 22, scale: 1.5 },
      { sprite: 'orc-idle.png',     frames: 6, w: 100, h: 100, xp:  8, yp: 65, scale: 1.5 },
    ];

    idlers.forEach(function(npc) {
      if (!isWalkable(npc.xp, npc.yp, W, H)) return;
      var el = document.createElement('div');
      var sz = Math.round(npc.w * npc.scale);
      el.style.cssText = 'position:absolute;width:' + sz + 'px;height:' + sz + 'px;background:url(' + NPC_BASE + npc.sprite + ') 0 0 / ' + (npc.frames * 100) + '% 100%;image-rendering:pixelated;z-index:' + Math.floor(npc.yp) + ';pointer-events:none';
      el.style.top = npc.yp + '%';
      el.style.left = npc.xp + '%';
      layer.appendChild(el);

      var frame = 0, fps = 6, lastFrame = 0;
      function animIdle(time) {
        if (time - lastFrame > 1000 / fps) {
          lastFrame = time;
          frame = (frame + 1) % npc.frames;
          el.style.backgroundPositionX = -(frame * sz) + 'px';
        }
        requestAnimationFrame(animIdle);
      }
      requestAnimationFrame(animIdle);
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

  // ─── UI: Font toggle (readable ↔ quill) ─────────────────────────────────
  function initFontToggle() {
    // Restore saved preference
    if (localStorage.getItem('readable-font') === '1') {
      document.body.classList.add('readable-font');
    }

    var isReadable = function() { return document.body.classList.contains('readable-font'); };

    var btn = document.createElement('div');
    btn.id = 'font-toggle-btn';
    btn.style.cssText = 'position:fixed;bottom:1.2rem;right:1.2rem;z-index:10000;background:rgba(0,0,0,.45);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:50%;width:42px;height:42px;text-align:center;line-height:42px;backdrop-filter:blur(4px);user-select:none;transition:background .2s;font-size:20px;padding:0';
    // Quill icon when in fancy mode, "Aa" when in readable mode
    function updateBtn() {
      if (isReadable()) {
        btn.innerHTML = '<span style="font-family:MedievalSharp,cursive;font-size:20px">Aa</span>';
        btn.title = 'Switch to quill font';
      } else {
        btn.innerHTML = '\u270E';
        btn.title = 'Switch to readable font';
      }
    }
    updateBtn();

    btn.onclick = function(e) {
      e.stopPropagation();
      var on = document.body.classList.toggle('readable-font');
      localStorage.setItem('readable-font', on ? '1' : '0');
      updateBtn();
    };
    document.body.appendChild(btn);
  }

  // ─── UI: Wand cursor selector ───────────────────────────────────────────
  function initWandSelector() {
    var WAND_COUNT = 50;
    var WBASE = '/assets/images/wands/Icons_13_';
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function wandUrl(n) { return WBASE + pad(n) + '.png'; }

    function applyCursor(id) {
      var url = wandUrl(parseInt(id));
      var rule = "url('" + url + "') 2 2, auto";
      var style = document.getElementById('wand-cursor-style');
      if (!style) { style = document.createElement('style'); style.id = 'wand-cursor-style'; document.head.appendChild(style); }
      style.textContent = 'html, *, *::before, *::after { cursor: ' + rule + ' !important; }';
    }

    var saved = localStorage.getItem('cursor-wand') || '01';
    applyCursor(saved);

    var btn = document.createElement('div');
    btn.id = 'wand-selector-btn';
    btn.style.cssText = 'position:fixed;top:4.2rem;right:1.2rem;z-index:10000;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.2);border-radius:50%;width:38px;height:38px;text-align:center;line-height:38px;backdrop-filter:blur(4px);user-select:none;transition:background .2s;padding:0';
    btn.innerHTML = '<img src="' + wandUrl(parseInt(saved)) + '" style="width:24px;height:24px;image-rendering:pixelated;vertical-align:middle" />';
    document.body.appendChild(btn);

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

  // ─── Wand glow effect on interactive elements ───────────────────────────
  function initWandGlow() {
    var glow = document.createElement('div');
    glow.id = 'wand-glow';
    glow.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;width:48px;height:48px;border-radius:50%;background:radial-gradient(circle,rgba(200,180,255,.45) 0%,rgba(160,140,255,.2) 35%,transparent 70%);opacity:0;transition:opacity .18s;transform:translate(-50%,-50%);mix-blend-mode:screen';
    document.body.appendChild(glow);

    // Selectors for interactive elements
    var INTERACTIVE = 'a, button, [role="button"], #toggle-content, #font-toggle-btn, #wand-selector-btn, #wand-panel div, .hud-stat, .game-bar a, .board-note a, .story-card a, .nav-link, input, select, textarea, [onclick], .clickable';
    var active = false;

    document.addEventListener('mousemove', function(e) {
      glow.style.left = e.clientX + 'px';
      glow.style.top  = e.clientY + 'px';

      var target = document.elementFromPoint(e.clientX, e.clientY);
      var hit = target && target.closest(INTERACTIVE);
      if (hit && !active) {
        active = true;
        glow.style.opacity = '1';
      } else if (!hit && active) {
        active = false;
        glow.style.opacity = '0';
      }
    });

    document.addEventListener('mouseleave', function() {
      active = false;
      glow.style.opacity = '0';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); initNPCs(); initToggle(); initFontToggle(); initWandSelector(); initWandGlow(); });
  } else {
    init(); initNPCs(); initToggle(); initFontToggle(); initWandSelector(); initWandGlow();
  }
})();
