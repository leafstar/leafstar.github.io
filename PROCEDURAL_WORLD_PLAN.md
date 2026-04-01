# Procedural World Background — Design Plan

## 目标
让 `leafstar.github.io` 首页背景看起来像《紫色晶石》(Stoneshard) 风格的俯视角RPG场景。
不是真正的游戏地图，而是"像游戏地图的舞台"：
- 每次刷新生成一个漂亮的森林营地
- 中间稳定留白（内容区域）
- 边缘有丰富的随机变化

---

## 页面布局

```
┌──────────────────────────────────────────────────────────┐
│  LEFT (~40%)            │  RIGHT (~60%)                  │
│  内容卡片               │  可见背景                       │
│  (教育、论文…)           │  (树、小路、营地)               │
└──────────────────────────────────────────────────────────┘
```

### DOM 结构
```html
<div id="world-stage">
  <canvas id="world-canvas">      <!-- layer 1-2: 地形 + 小路 -->
  <div id="world-sprite-layer">   <!-- layer 3-5: 结构 + 植被 + 氛围 -->
  <div class="world-content">     <!-- 学术内容卡片 -->
</div>
```

---

## 五层渲染架构

### Layer 1 — Terrain（地形层）
**用柏林噪声生成地块类型**，每个像素点根据 fbm 值归类：

| noise 值 | 地块类型 | 颜色基调 |
|---------|---------|---------|
| > 0.72 | 林地边缘 (forest_edge) | 深绿 `#1e3a0e` |
| 0.58–0.72 | 草地 (grass) | `#2a4a14` |
| 0.44–0.58 | 稀疏草 (sparse_grass) | `#3a5a1e` |
| 0.30–0.44 | 泥地 (dirt) | `#7a5a38` |
| < 0.30 | 石头地 (stone) | `#6a6a5a` |

实现：先用 solid fill 打底，再按噪声分区叠加对应地形精灵图。

### Layer 2 — Path（小路层）
**手工规则生成**，不依赖噪声：
- 中间留出内容区（x: 0%–45%）强制空旷
- 一条泥土小路从画面右上蜿蜒到右下（使用低频噪声扰动边缘）
- 营地空地：右侧约 (70%, 45%) 处有一块平坦开阔地

```javascript
// 路径中心线：x = W * 0.62 + sin(y/H * π) * W * 0.06
// 路径半宽：W * 0.07，边缘用 fbm 扰动
```

### Layer 3 — Structure（结构层）
**固定或半固定摆放**，大型道具按 PROP_ANCHORS 放置：

左侧（内容区边缘）：
- 木屋 / 石头房子（大型，x: 3–8%）

右侧（营地区）：
- 帐篷 × 2–3（围绕营地空地）
- 木车（营地旁）
- 篝火（营地中心）
- 宝箱、木桶（散落）
- 木栅栏（营地边界）

### Layer 4 — Flora（植被层）
**带随机的规则放置**：

```
边缘 (edgeFrac > 0.6)  → 大树 (trees)
中间偏侧               → 灌木 (bushes)
散落                   → 花草、石头 (flowers/rocks)
```

密度由 `fbm(x, y) > threshold` 门控，确保中间内容区稀疏。

树种分布（需要素材）：
- 落叶乔木（大，边缘）
- 针叶树（中）
- 枯树 / 死树（点缀）
- 灌木丛（bush × 多种）
- 野花（flower × 多种）

### Layer 5 — Atmosphere（氛围层）*（进阶，后续实现）*
- **昼夜**：根据本地时间调整全局色温 overlay（日出/正午/黄昏/夜晚）
- **天气**：雨（canvas 粒子）、晨雾（低透明白色渐变）
- **萤火虫**：夜晚时小亮点随机漂浮（requestAnimationFrame）
- **角色走动**：小人沿小路随机游走
- **小动物**：松鼠、鹿偶尔出现在树边

---

## 技术实现细节

### Noise 函数
```javascript
// Perlin fbm (2 octaves), seed=42
function fbm(x, y) {
  return perlin(x, y) * 0.65 + perlin(x * 2.1, y * 2.1) * 0.35;
}
// 地形频率 FREQ = 0.003（大尺度变化）
// 路径扰动频率 0.0025（低频，缓慢弯曲）
```

### 确定性随机
```javascript
// XOR-shift PRNG，seed=0x9e3779b9（每次渲染结果一致）
let rngState = 0x9e3779b9;
function srng() { … }
// resize 时重置 rngState，保证布局稳定
```

### 渲染流程
```
setupCanvas(dpr)
  → drawTerrain(canvas, terrainImgs, W, H)   // Pass 1-4: 地形噪声
  → drawPath(canvas, dirtImgs, W, H)         // Pass 5: 小路
  → placeStructures(spriteLayer, propImgs)   // 固定锚点
  → placeFlora(spriteLayer, floraImgs, W, H) // 噪声门控随机
  → [后续] startAtmosphere(spriteLayer)      // 动画循环
```

---

## 资产需求清单

需要的素材类型（2D PNG，像素风，俯视角RPG）：

### 地形贴图
- [ ] 草地底图（可无缝平铺 or 有机贴片）
- [ ] 泥土底图（同上）
- [ ] 石头底图
- [ ] 草泥过渡贴片
- [ ] 地面小石子/草丛散件

### 植被
- [ ] 大树 × 4–6 种（落叶、针叶、枯树）
- [ ] 灌木 × 4–6 种
- [ ] 野花 × 3–4 种
- [ ] 蘑菇、草丛点缀

### 建筑/道具
- [ ] 木屋 / 石屋（大型）
- [ ] 帐篷 × 2–3 种
- [ ] 木车
- [ ] 篝火
- [ ] 木桶 × 2–3 种
- [ ] 宝箱
- [ ] 木栅栏（分段）
- [ ] 路标

### 氛围（进阶）
- [ ] 角色走路精灵图（4方向）
- [ ] 小动物（松鼠、鸟）
- [ ] 萤火虫粒子（可用 canvas 画）

---

## 美术风格约束

| 项目 | 要求 |
|------|------|
| 视角 | 45° 俯视角（top-down） |
| 渲染方式 | 像素艺术（pixel art） |
| 分辨率 | 精灵图 32px 或 16px 网格 |
| 饱和度 | 高饱和，参考 Stoneshard |
| 基础草色 | `#2a4a14` |
| Canvas 滤镜 | `saturate(1.35) contrast(1.12)` |
| 统一素材包 | **必须用同一套资产包**，避免拼贴感 |

---

## 风险与应对

| 风险 | 应对 |
|------|------|
| 素材不统一 → 拼贴感 | 只用同一个美术包的资产 |
| 噪声控制不好 → 杂乱 | 频率 FREQ 保持低值（0.003），大尺度变化 |
| 没有布局规则 → 像地图生成器 | 中间内容区强制留空，PROP_ANCHORS 固定大构图 |
| 动画帧率问题 | Layer 5 单独 requestAnimationFrame，按需开启 |

---

## 当前状态

- [x] 渲染架构设计完成
- [x] world.js 基础框架（Perlin noise + PRNG + canvas setup）
- [ ] **等待：找到合适的 2D 俯视角像素风素材包**
- [ ] 实现 Layer 1–2（地形 + 路径）
- [ ] 实现 Layer 3（结构放置）
- [ ] 实现 Layer 4（植被放置）
- [ ] 实现 Layer 5（氛围动画）
- [ ] 推送到 GitHub Pages
