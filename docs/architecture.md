# 架构总览（v5）

> 本文是**当前代码的实况地图**，不是设计提案。所有模块清单、字段、链序均逐文件读过源码后写成；
> 若代码与本文不一致，以代码为准并回改本文。
> 本文是代码结构的唯一索引；契约性约定已内联到各节。
> 项目形态：零 npm 依赖、免构建的静态 Web（HTML + CSS + 原生 ESM），Node ≥ 18。

---

## 1. 一句话架构

**两条起卦主线（先天链 / 铜钱链）→ 盘对象（纯数据）→ deps 收敛 → 解读注册表（可插拔 reader）→ 两条呈现出口（DOM 渲染 / 纯文本）**。
算法只在 `src/core/cast.js`（先天）与 `src/core/coin.js`（铜钱）各一处；其余模块一律**读盘**，不改盘、不重算卦。

---

## 2. 分层图

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 呈现层（web/，浏览器专用）                                                 │
│   web/index.html   三个入口面板（时间 / 数字 / 铜钱）+ 结果区               │
│   web/js/ui.js     交互编排：表单 → core 调用 → 渲染（零易学计算）          │
│   web/js/render.js 盘对象 → DOM（只消费，不计算）                           │
│   web/css/style.css 样式（含窄屏 @media、打印 @media）                      │
└───────────────▲───────────────────────────────────────▲──────────────────┘
                │ data / opts                            │ 文本
┌───────────────┴───────────────┐        ┌───────────────┴──────────────────┐
│ 数据装配层（环境无关）         │        │ 文本出口（环境无关）              │
│   src/catalog.js              │        │   src/core/text-pan.js#textPan    │
│     DATA_MANIFEST / assemble  │        │   src/core/readings.js#readingsText│
│     depsFromData / depsFromOpts│       └──────────────────────────────────┘
│   src/node-data.mjs  (Node 适配)│
│   web/js/loaders.js  (Web 适配) │
└───────────────▲───────────────┘
                │ data（唯一数据源结构）
┌───────────────┴──────────────────────────────────────────────────────────┐
│ 内核层（src/core/，纯函数：无 DOM、无 fs、无 node 依赖）                    │
│   起卦：cast.js（先天链） · coin.js（铜钱链） · calendar.js（历法换算）      │
│   读盘视图：pan-view.js（两条主线的差异归一）                               │
│   解读 reader：verdict.js · classic.js · najia.js · liuyao.js ·            │
│                xiangjie.js · refguide.js                                  │
│   注册表：readings.js（装配顺序 + 文本格式化）                              │
│   原子/呈现：lookup.js · mod.js · present.js · text-pan.js                 │
│   出口：index.js（唯一对外 re-export）                                     │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ 只读 JSON
┌───────────────┴──────────────────────────────────────────────────────────┐
│ 数据层（data/，JSON＝唯一数据源，Node 与浏览器共用同一份）                   │
│   trigrams / hexagrams / rules / coin-config / ganzhi-dict / cases        │
│   interpretations/（断语词库） · najia.json · zhouyi-classic.json         │
│   zhouyi-proofread.json（校对状态） · ref-corpus/（参考语料·只读）        │
│   interpret/（拆分详解库 v3-split-1） · proofread-sources/（只读外部源）    │
└──────────────────────────────────────────────────────────────────────────┘
```

**依赖方向铁律**：上层 → 下层单向。`src/core/*` 绝不 import `web/*`；`web/*` 只经 `src/core/index.js`
与 `src/catalog.js` 取能力。历史上 `textPan` 曾在 `web/` 被 CLI 反向 import（v3 审计的 B2/B3 缺陷），
现已迁入 `src/core/text-pan.js`，方向倒挂已消除。

---

## 3. 数据流（端到端）

```
① 输入
   时间：公历/农历 + 时辰 ──calendar.js──▶ { yearBranch, month, day, hourBranch } + ctx{dayStem,dayBranch,monthBranch}
   数字：1..N 个数 ────────────────────▶ { n } 或 { numbers:[…] }（按个数分派规则）
   铜钱：六爻掷币 ──────────────────────▶ throws[6]（自下而上）

② 起卦（唯一成卦核）
   先天链 cast(data, {ruleId,values})      → evaluateRule → mod8/mod6 → 查表 → 盘对象
   铜钱链 castCoinLines(data, throws, cfg) → 阳面数映射 → 查表 → 盘对象
   ★ 两条链只共享“无语义原子”（lookup.js 的查表/翻转/爻题、pan-view.js 的读盘归一）

③ 盘对象（纯数据，见 §5.1）
   benGua / zhiGua / huGua / tiYong / yao[] / lines[] / steps | records / warnings

④ deps 收敛（唯一出处）
   opts（= assembleData 整包 + ctx + 可选 ref/interp）
        ──catalog.js#depsFromOpts──▶ depsFromData（按 reader 所需挑字段）
        ──▶ { verdictHex, verdictTiYong, classic, proofread, trigrams, najia, ctx, refIndex, interpIndex, ref?, interp? }

⑤ 解读装配（注册表，一次装配）
   readings.js#interpretPan(pan, deps) 按注册顺序跑每个 reader，null 跳过，抛错隔离
        verdict → classic → najia → liuyao → xiangjie （baihua: defaultOff）

⑥ 呈现（两条出口，同一份装配结果）
   DOM：render.js#renderPan(el, pan, opts) → 每个 reader 取专属样式（SECTION_STYLES），未注册 → 通用折叠区
   文本：text-pan.js#textPan(pan, opts) → readings.js#readingsText 按 id 取 formatter → 整盘文本
```

**关键点**：`renderPan` 与 `textPan` **各自独立调用一次** `interpretPan`，但两者共用同一套 deps 收敛
（`depsFromOpts`）与同一批 reader，因此 DOM 与复制文本必然同源，不会出现“网页有、复制没有”。

---

## 4. 模块清单与职责

### 4.1 内核 `src/core/`（纯函数；无 DOM / 无 fs / 无 node 依赖）

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| `mod.js` | 取模工具（卦以八除、爻以六除；余 0 记作 8/6；负数取正余） | `mod`, `mod8`, `mod6` |
| `lookup.js` | 查表与爻线换算（八卦/六十四卦/爻题/翻转/互卦切片）。**爻序铁律的唯一实现处** | `trigramByNumber`, `hexagramByPair`, `hexLinesByPair`, `dongYaoToIndex`, `titleOfYao`, `flipAt`, `flipManyAt`, `huLinesOf` |
| `cast.js` | **先天链唯一成卦核**：规则求值 → 槽位原始数 → 上下卦 → 动爻 → 之卦/互卦/体用/五行 | `cast`, `castNumbers`, `ruleIdForNumberCount`, `evaluateRule`, `evaluateExpr`, `wuXingRelation`, `currentHourBranch` |
| `coin.js` | **铜钱链成卦**：三枚面 → 爻（阳面数映射）→ 六爻成卦 → 全动爻翻转得之卦；恒不取互卦/体用 | `COIN_SIDES`, `lineFromCoins`, `tossThree`, `lineOfToss`, `castCoinLines` |
| `calendar.js` | 历法换算适配：公历→农历/干支（立春换年、节气月）、时辰/24h 互转、五鼠遁、子时日界 | `GAN`, `ZHI`, `ZHI_DETAIL`, `branchFromClock`, `solarClockToCast`, `solarBranchToCast`, `hourGanZhi`, `zhiLabel` |
| `pan-view.js` | **两条主线的读盘归一**：动爻位集合/单动/铜钱盘判定/规整视图（不抹平语义） | `movingPositions`, `isCoinPan`, `dongYaoOf`, `panView` |
| `verdict.js` | 断语 reader：卦意导语（按 order）+ 体用断语（唯一动爻且词库有该关系）；静/多动给 untaken | `guaBriefOf`, `tiyongVerdictOf`, `assembleVerdict` |
| `classic.js` | 经文 reader：《周易》卦辞/动爻爻辞/之卦卦辞；校对判定（v5 起三级） | `classicEntry`, `isProofread`, `proofreadLevel`(v5), `PROOFREAD_LEVELS`(v5), `dongRefs`, `classicReading` |
| `najia.js` | 纳甲装卦 reader（京房）：八宫归属/世应/纳支/六亲/六神 + 月令旺衰 + 应期简注 | `najiaReading`, `gongOf` |
| `liuyao.js` | 六爻断法 reader（v5 新增）：世应 + 六亲 + 生克 + 参考措辞；**仅铜钱盘产出**，先天盘返回 `null` | `LIUYAO_NOTE`, `liuyaoReading`, `liuyaoText` |
| `xiangjie.js` | 详解 reader：消费拆分库 `data/interpret`，输出本卦/动爻/之卦的经文+象辞+白话+名家+哲学+卦象关联 | `XIANGJIE_NOTE`, `xiangjieReading`, `xiangjieText` |
| `refguide.js` | 白话导读 reader（旧语料 `data/ref-corpus`）：v4 起 `defaultOff`，仅 `only:['baihua']` 点名时跑 | `refGuideReading`, `refGuideText` |
| `readings.js` | **解读注册表**：注册/注销/装配/文本格式化；默认链序与 defaultOff 语义 | `registerReader`, `unregisterReader`, `listReaders`, `interpretPan`, `registerTextFormatter`, `readingsText` |
| `present.js` | 呈现层原语（从 render 提出，消除第三份爻画知识）：自然象/卦名全称/爻画字符/爻题序列 | `NATURE`, `fullName`, `lineChar`, `titlesOf` |
| `text-pan.js` | 整盘纯文本序列化（Node/浏览器/CLI 共用；渲染不掺文本拼接） | `textPan` |
| `index.js` | **唯一对外出口**：re-export 上述全部公开 API | — |

### 4.2 装配层

| 文件 | 职责 |
| --- | --- |
| `src/catalog.js` | **数据与 deps 的唯一契约**：`DATA_MANIFEST`（13 项，见 §5.3）、`assembleData`（缺必填即抛错 / 可选缺省按 null）、`depsFromData`（条件收敛）、`depsFromOpts`（+ref/interp 直通）、`refFileForOrder` / `interpFileForOrder`（索引条目→相对路径） |
| `src/node-data.mjs` | Node 侧适配：按 manifest 同步读 JSON → `assembleData`；`loadRefForOrders` / `loadInterpForOrders` |
| `web/js/loaders.js` | 浏览器侧适配：按 manifest `fetch` → `assembleData`（带缓存）；`loadRefMap` / `loadInterpMap` 按需取单卦文件、逐卦缓存、缺文件静默略过；`file://` 打开时给出可操作的报错 |

**为什么要有这一层**：v3 审计发现 9 个 JSON 的装配与字段挑选曾在 loaders / ui / render / 各脚本里各写一遍。
现在全部收口到 `catalog.js`，Node 与 Web 走同一份清单与同一个 `assembleData`，产出同构 data。

### 4.3 呈现层 `web/`

| 文件 | 职责 |
| --- | --- |
| `index.html` | 静态骨架：三个 Tab 面板 + 结果区；`<base href="/">` 使 `data/...` 根相对路径在 `/web/index.html` 下仍解析到站点根 |
| `js/ui.js` | 交互编排（**零易学计算**）：表单读取 → 调 `calendar.js`/`cast`/`castCoinLines` → 组织 opts（含 ctx、按需 ref/interp）→ `renderPan` |
| `js/render.js` | 盘对象 → DOM：卦卡/演算明细/掷出记录/体用框/各 reader 专属区块/复制与下载按钮。**只消费 `interpretPan` 的装配结果**，不再自行分发 |
| `css/style.css` | 样式：盘网格、经文区、详解折叠层、三级角标（含 `.badge-cross` 蓝）、窄屏 `@media (max-width:640px/380px)`、打印 `@media print` |

`render.js` 的 `SECTION_STYLES` 是“reader id → 专属样式”的唯一注册处：
`verdict` / `classic` / `baihua` / `xiangjie` 有专属 HTML；其余（如 `najia`、v5 的 `liuyao`）落 `genericSectionHtml`
通用折叠区（走 `readingsText` 的文本行）。**新增 reader 不改 render 也能显示**，这是可插拔的兜底。

### 4.4 工具与脚本

| 文件 | 职责 |
| --- | --- |
| `tools/serve.mjs` | 零依赖静态服务器（仅 Node 内置模块），默认端口 8642，`/` → `/web/index.html`，端口占用时自动换空闲端口 |
| `tools/split-interpret.mjs` | 幂等生成 `data/interpret/`（schema `v3-split-1`）：只读 `data/ref-corpus/` 与 `data/zhouyi-classic.json`，三重锚点（卦画/经文/引擎之卦）修正 5 类源站缺陷 |
| `tools/proofread-classic.mjs` | 幂等生成 `data/zhouyi-proofread.json`（schema `v5-proofread-1`）：多源交叉比对，只写 `meta`/`crosschecked`/`disputed`/`sources`，`checked` 原样保留 |
| `scripts/demo-flow.js` | 模块流程演示：数据层 → 规则求值 → 取模取卦 → 派生（之卦/互卦/体用） |
| `scripts/demo-readings.js` | CLI 全链演示：起卦 → 排盘文本；含“注册一个 reader 即自动出现在文本里”的插拔示例 |

---

## 5. 契约索引

### 5.1 盘对象 schema（`cast` 与 `castCoinLines` 输出，纯数据）

两条链**共享**的字段：`method`、`benGua`、`zhiGua`、`yao[]`、`lines[]`（自下而上）、`warnings[]`。
**分列**的字段（语义不同，不许抹平）：

| 字段 | 先天链 `cast` | 铜钱链 `castCoinLines` |
| --- | --- | --- |
| `kind` | 无（读盘归一为 `'number'`） | `'coin'` |
| `ruleId` | 规则 id（`time`/`one-number`/…） | `null` |
| `dongYao` | 单动爻位 1..6 或 `null` | 单动时才有值，多动为 `null` |
| `movingYao` | 无 | 动爻位数组（0..6 皆可） |
| `huGua` | 有（本卦求互，或配置 `huSource:'zhi'`） | **恒 `null`**（不带梅花派生） |
| `tiYong` | 有（唯一动爻时） | **恒 `null`** |
| `steps` | 演算明细 | **恒 `null`**（无演算） |
| `records` | 无 | 掷出记录（自下而上 6 条） |
| `coinConfig` | 无 | 生效的面约定 |

### 5.2 解读注册表契约（`readings.js`）

```js
registerReader({ id, title, run(pan, deps) → data | null, defaultOff? })
interpretPan(pan, deps, { only?: string[] }) → [{ id, title, data } | { id, title, error }]
registerTextFormatter(id, (data, pan) => string[])
readingsText(results, pan) → string[]
```

- `run` 返回 `null` ⇒ 该 reader 对本盘不产出，注册表自动跳过（**不猜、不硬凑**）；
- `run` 抛错 ⇒ 该条记为 `{error}`，其余 reader 照常（错误隔离）；
- `defaultOff` ⇒ 不进默认链，仅 `only:[id]` 显式点名时参与（`baihua` 即此）；
- 文本格式化按 `id` 注册，未注册的 reader 在 `readingsText` 中无输出 —— 因此**新增 reader 必须同时注册 formatter**，否则复制文本缺段。

### 5.3 `DATA_MANIFEST`（13 项，`src/catalog.js`）

| # | key | path | optional | pick |
| --- | --- | --- | --- | --- |
| 1 | `trigrams` | `data/trigrams.json` | ✗ | `j.trigrams` |
| 2 | `hexagrams` | `data/hexagrams.json` | ✗ | `j.hexagrams` |
| 3 | `rules` | `data/rules.json` | ✗ | `j.rules` |
| 4 | `coinConfig` | `data/coin-config.json` | ✗ | `j` |
| 5 | `verdictHex` | `data/interpretations/hexagram-verdicts.json` | ✗ | `j.hexagrams` |
| 6 | `verdictTiYong` | `data/interpretations/tiyong-verdicts.json` | ✗ | `j` |
| 7 | `classic` | `data/zhouyi-classic.json` | ✗ | `j` |
| 8 | `proofread` | `data/zhouyi-proofread.json` | ✓ | `j` |
| 9 | `najia` | `data/najia.json` | ✓ | `j` |
| 10 | `refIndex` | `data/ref-corpus/index.json` | ✓ | `j`（裸数组） |
| 11 | `interpIndex` | `data/interpret/index.json` | ✓ | `j.entries` |
| 12 | `ganzhiDict` | `data/ganzhi-dict.json` | ✓ | `j`（v5 补齐） |
| 13 | `cases` | `data/cases.json` | ✓ | `j.cases`（v5 补齐） |

- 缺**必填** ⇒ `assembleData` 抛错（数据缺失即错误，不静默降级）；
- 缺**可选** ⇒ `null`（`proofread` 特例缺省为 `{checked:[]}`，即“全未校对”）；
- `depsFromData` 只收敛进解读链的字段：`verdictHex`/`verdictTiYong`/`classic`+`proofread`/`trigrams`+`najia`+`ctx`/`refIndex`/`interpIndex`。
  **`ganzhiDict` 与 `cases` 不进 deps**（仅供展示/测试，不参与起卦或解读）。

### 5.4 关键呈现约定

经文三级校对的呈现口径：

- **三级校对角标**（契约 §1.4）：`checked` → 无角标；`crosschecked` → `.badge.badge-cross`（蓝）「交叉校验」；
  `none` → `.badge`（红）「未校对」。
  全局提示条：`⚠ 经文尚未人工对照纸质本校对；「交叉校验」为多源机器比对一致，非人工结论。`
  渲染侧归一写法 `const lvl = x.proofLevel || (x.proofread ? 'checked' : 'none')`，兼容未带 `proofLevel` 的旧块。
- **三级的判定来源**（`classic.js#proofreadLevel`，唯一口径，见契约 §1.3）：
  | 等级 | 判定 | 由谁写入 |
  | --- | --- | --- |
  | `checked` | `classic.meta.proofread === true`（全局）或 `order ∈ proofread.checked` | **只能由人**；生成器绝不写入 |
  | `crosschecked` | `order ∈ proofread.crosschecked` | 生成器 `tools/proofread-classic.mjs` 整份重算 |
  | `none` | 其余 | 缺省 |
  **铁律**：`checked` 只增不改；机器结论绝不冒充人工结论（`crosschecked ≠ checked`）。
- **`proofLevel` 与 `proofread` 并存**：`proofread` 保留 = `proofLevel !== 'none'`，以免破坏既有文本导出与测试。
  `metaUnchecked` 语义不变（`classic.meta.proofread !== true`）。
- **链序**：`verdict → classic → najia → liuyao → xiangjie`（`liuyao` 插在 `najia` 之后，消费其装卦结果；`baihua` 仍 defaultOff）。
- **应期口径**：月建 = 节气干支月的月支（沿用 `ctx.monthBranch`）；旬 = 由**日柱**推算空亡；月破 = 爻支与月建相冲。
  旬空与月破同时成立时**分别标注，不合并、不抵消**；缺 `ctx` 时 `xunKong: null` + `notes` 说明，不猜。

---

## 6. 红线（违反即打回）

1. **爻序铁律**：六爻数组**自下而上** `[0]=初爻 … [5]=上爻`；动爻位 `p`(1..6) → 下标 `p−1`。
   显示层倒序渲染**只发生在渲染**（`guaCard` 的 `for (i=5;i>=0;i--)`、`textPan` 的“爻画（自上而下）”），**绝不回写算法数组**。
   唯一实现处：`lookup.js`（`dongYaoToIndex` / `flipAt` / `flipManyAt` / `huLinesOf` / `titleOfYao`）。
2. **双链不合并**：先天链 `cast()`（单动 + `steps` + 互卦/体用）与铜钱链 `castCoinLines()`（0..6 动 + `records`，恒无互卦/体用）
   是两条语义不同的主线，**只共享语义无关原子**（查表/翻转/爻题/读盘归一）。不许为了“统一”把 `tiYong` 强塞给铜钱盘，
   也不许把 `records` 塞进先天盘。
3. **外部语料只读**：`data/ref-corpus/`（66 文件）与 `data/proofread-sources/` 一律**只读**，
   生成器只许写自己的输出文件（`data/interpret/`、`data/zhouyi-proofread.json`）。重跑生成器后这些目录的 sha256 必须零改动。
4. **单写者**：`data/zhouyi-proofread.json` 的 `checked` 字段**只能由人写入**，生成器绝不写、绝不改；
   `crosschecked` / `disputed` / `sources` / `meta` 由生成器整份重算。**机器结论不得冒充人工结论**（`crosschecked ≠ checked`）。
5. **不猜**：无法判定 ⇒ 输出 `null` / `false` / `"略"`，禁止编造字句、日期、吉凶。缺 `ctx` 时不崩、如实标注“略”。
6. **单一成卦核**：不引第二个成卦核；新增能力一律写成**读盘** reader（`run(pan, deps)`），不改盘、不碰 `cast`/`coin`。
7. **deps 收敛唯一出处**：所有消费端只经 `catalog.js#depsFromData` / `depsFromOpts` 取 deps，禁止各自手拼字段清单。
8. **不动的高稳定文件**：`src/core/cast.js`、`coin.js`、`calendar.js`、`verdict.js` 在 v5 中 `git diff --stat` 必须为空。

---

## 7. 测试矩阵

`npm test` 串行跑 12 套；v5 新增的 `tests/run-liuyao-tests.js` 由 `package.json` 的 `scripts.test` 追加后成为第 13 套
（`package.json` 为单一写入口，避免多处并发修改冲突）。任一失败即退出非 0。
每套自带 `check()` 计数，末尾打印「N 项通过，0 项失败」+ 大写 `* TESTS PASSED` 哨兵行。

> **项数以 `npm test` 输出为准，本文不写死。** 各套件的项数随阶段推进持续增长
> （v1 157 → v2 445 → v4 693 → v5 更高，且新增断言随时可能并入既有套件），
> 下表“v4 基线项数”一列是 **v4 的基线快照**，只用于判断“是否只增不减”，
> 不是当前值；查当前值请跑 `npm test` 并读末行。

| # | 套件 | v4 基线项数 | 覆盖重点 |
| --- | --- | --- | --- |
| 1 | `tests/run-tests.js` | 113 | 8 个 `data/cases.json` 用例（观梅/牡丹等）、取模边界、**64 卦 × 6 动爻 384 例穷举一致性** |
| 2 | `tests/run-calendar-tests.js` | 24 | 时辰/24h 换算（含 23:00 晚子跨日）、公历→农历/干支（立春换年）、五鼠遁、`ganzhi-dict.json` 与常量对拍 |
| 3 | `tests/run-coin-tests.js` | 24 | 铜钱面→爻映射、成卦/之卦、动爻标注、体用/互卦恒空、铜钱盘解卦放行 |
| 4 | `tests/run-verdict-tests.js` | 31 | 观梅盘端到端取词、体用五关系矩阵、静卦/多动未取体用提示、缺数据容错 |
| 5 | `tests/run-classic-tests.js` | 150 | 经文数据完整性自检（64 卦、爻数、乾坤用九/用六）、动爻定位、静卦/多动、校对判定、缺数据容错；v5 增三级 `proofLevel` 断言 |
| 6 | `tests/run-readings-tests.js` | 27 | 默认链序、按 deps 裁剪、插拔（register/unregister）、重复注册报错、`only` 过滤、错误隔离、`defaultOff`、铜钱链放行 |
| 7 | `tests/run-najia-tests.js` | 86 | 64 卦八宫归属与级别（对照通行八宫表）、乾宫世应、装卦明细（纳支/六亲/六神）、月令旺衰、应期、缺数据容错；v5 增旬空/月破与 60 甲子穷举 |
| 8 | `tests/run-panview-tests.js` | 22 | `movingPositions`/`dongYaoOf`/`isCoinPan`/`panView` 对三种盘形态的归一读取；`flipManyAt` 与 `flipAt` 一致；`huLinesOf` 与盘上互卦切片一致 |
| 9 | `tests/run-refguide-tests.js` | 20 | 本卦/动爻/之卦白话命中、无 ref 跳过、铜钱盘空置、AI 补写标记、去“卦名卦：”前缀 |
| 10 | `tests/run-catalog-tests.js` | 51 | manifest 键唯一/项数/路径/optional、`assembleData` 缺必填抛错、`depsFromData` 条件收敛、`{meta,entries}` 形状回归锁（★曾因 `pick=(j)=>j` 导致详解静默全空）、索引→文件闭环、`loadInterpMap` 集成；v5 增 `ganzhiDict`/`cases` 装配断言 |
| 11 | `tests/run-interpret-tests.js` | 65 | `v3-split-1` schema 完整性、64 卦零缺、5 处 repairs 回归、`alt` 判定（卦辞 2 / 爻 21） |
| 12 | `tests/run-xiangjie-tests.js` | 80 | Block 字段、缺 map 跳过、★动爻按 `pos` 对齐（非 `wei` 匹配）、铜钱盘放行、文本输出 |
| 13 | `tests/run-liuyao-tests.js`（v5 新增） | — | 铜钱盘产出/先天盘 `null`、世应与 `najiaReading` 一致（不重复实现）、静卦/单动/六爻全动不崩、缺 deps 时 `grade:'略'`、`liuyaoText` 非空、`verdict` 对铜钱盘仍不装配（回归锁） |

**测试纪律**：

- 既有断言的语义**只许加、不许改**；唯一允许的例外是“链序断言”（新增 reader 必然改变 `listReaders()` 的输出），
  且必须在断言上方注明原因。
- 回归锁（★）优先于新增覆盖：历史事故（`pick=(j)=>j` 致详解静默全空、动爻 `wei` 匹配致静默丢文、
  爻题剥离用字符类致 64/64 假异文）都已在对应套件内固化为断言。
- 测试一律**实跑**，不接受“应该能过”。

---

## 8. 已知边界

- **无构建、零依赖**：浏览器直接吃 ESM；`file://` 打开会被拦，必须经 `node tools/serve.mjs`。
- **`data/` 只读语义靠约定 + 测试**：`ref-corpus/`、`proofread-sources/` 的 sha256 由生成器/测试对拍守住。
- **农历闰月**：按“当月月数”取数（不另计月份序），这是口径选择，不是缺陷。
- **经文人工校对仍为零**：`data/zhouyi-proofread.json` 的 `checked` 为空数组 —— 只能由人填，生成器绝不写入。
  因此真实数据下 UI 目前只有 `crosschecked`（蓝）与 `none`（红）两态可见，“无角标”的 `checked` 态要等人。
  渲染层的第三态分支已实现并有测试覆盖（见 §7 第 5 套），只是**真实数据尚无法呈现**。
  当前 64 卦的实际分布：`crosschecked` 50 卦 / `none` 14 卦 / `checked` 0 卦。
- **`disputed` 不产生独立等级**：`disputed` 只留档（19 条，涉及 14 卦），这些卦**既不进 `crosschecked` 也不是 `checked`**，
  因此 `proofreadLevel` 判为 `none`，UI 显示红色「未校对」——这是设计意图（有分歧就不敢说“一致”），不是缺陷。
  想查看分歧明细请直接读 `data/zhouyi-proofread.json#disputed`，UI 不呈现该字段。
- **v5 范围外**（用户已拍板不做）：十翼增补、导出增强（MD/JSON）、懒加载优化、可访问性打磨、十二长生、推远端。
