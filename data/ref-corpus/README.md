# data/ref-corpus —— 解卦参考语料（原始汇编）

> 迁移日期：2026-09-08 ｜ 数量：64 份 JSON（本目录）
> **来源**：网络通行汇编。原始站点已从本项目移除，不再记录具体域名。
> 本目录内含**多方古今解读**（断易天机/邵雍/傅佩荣/传统解卦等），
> **本项目不是这些文本的作者**，逐项归属见 [`../sources-registry.json`](../sources-registry.json)
> 与 [`../NOTICE.md`](../NOTICE.md)。
> **性质声明（沿用外部原库口径）**：本语料为**网络汇编参考内容**（白话文解释 + 邵雍解/傅佩荣解/《断易天机》/传统解卦/哲学含义等多说汇编），**未逐条核对权威通行本**；对外展示/精确引用前须另行校对。经文原文类字段请以本项目 `data/zhouyi-classic.json`（同源通行本口径，`proofread` 状态见其 meta）为校对口。

## 内容与结构（每卦一文件 `NN-卦名.json`）

```js
{
  order: 1..64, name: '乾', source: '…/gua/NN.shtml',
  hexagram: { text(卦辞原文), xiang(象曰), baihua(白话·合并串),
              mutual/opposite/comprehensive(互/错/综 卦指向),
              masters(名家·合并串), plain(细分·普通解释), voices(细分·名家) },
  yaos: [ { wei:'初九'…'上六' | '用九'(仅乾), text, xiang, baihua, masters, plain, voices } ×6..7 ],
  meta: { file, aiFilled[], schema, repair? }
}
```

### 条目字段（v1 合并串 + v2 细分，二者并存）
| 块 | 字段 | 内容 |
|---|---|---|
| 原文 | `text` | 卦辞/爻辞（含爻题如 `初九。潜龙勿用。`；`用九` 仅乾卦） |
| 象曰 | `xiang` | 《象》辞 |
| 普通解释 | `plain` | `{ 译文(白话直译), 象辞白话(《象辞》说的白话转述) }` |
| 名家解释 | `voices` | 卦辞条：`断易天机 / 邵雍 / 傅佩荣{时运,财运,家宅,身体} / 传统解卦{导语,大象,运势,事业,经商,求名,婚恋,决策} / 哲学含义`；爻条：`邵雍 / 傅佩荣{…} / 变卦(动后之卦) / 哲学含义` |
| 合并串 | `baihua`/`masters` | 同上内容的 v1 合并版本，供旧消费方；引用请用 `plain`/`voices` |

> 爻序约定与项目一致：`yaos` 自下而上（初→上），条目以 `wei` 标识（可与 `pan.yao[i].title`、经文 `yaoCi[].ref` 对齐）。

## 覆盖与特殊说明
- **覆盖**：卦辞哲学含义 64/64；爻 385/385（384 + 乾·用九）哲学含义全齐。
- **AI 补写标记**：9 个文件 16 段 `哲学含义` 为本地 AI（qwen3.5:4b）补写，`meta.aiFilled` 逐条记录（03-屯×1、04-蒙×1、06-讼×1、29-坎×3、56-旅×1、57-巽×6、58-兑×1、61-中孚×1、63-既济×1），与源文严格区分、引用需甄别。
- **01-乾**：`yaos` 含第 7 条 `用九`（审校补入，源 md 无此节）；`meta.note` 说明。
- **11-泰**：源站"第十一卦详解"块首段误植豫卦文（抓取日与现网皆如此）；2026-09-08 已按**通行本**重建 原文/象曰/白话，页内泰"哲学含义"保留；《断易天机》/邵雍/傅佩荣/传统解卦 因源站缺失未收录（不虚构出处）——详见各文件 `meta.repair`。
- **57-巽**：源站页本身仅卦辞层有完整"哲学含义"，各爻哲学含义为 AI 补写（`aiFilled` 6 条），引用时注意。

## 使用建议（项目内）
- 定位：按 `pan.benGua.order` 取 `hexagram`，按动爻 `title`（初九…上六 / 用九·用六）匹配 `yaos[i].wei` 取爻；
- **已挂载 reader `baihua`（白话导读·参考汇编）**：`src/core/refguide.js` 已注册进 `readings.js` 默认链（verdict→classic→najia→baihua）；调用方只需提供 `deps.ref = { [order]: 本目录对应 JSON }`（可先读 `index.json` 取文件名；Node/CLI 见 `scripts/demo-readings.js`；Web 起卦后经 `web/js/loaders.js#loadRefMap` 按本卦/之卦序**按需载入**、逐卦缓存）。本目录 JSON 仅作**引用、不改写**；输出自带"网络汇编、未逐条核对通行本 / AI 补写段已标注"提示。
- 本目录为**只读快照**，不参与程序运行时（运行时只读 `data/interpret/`）。历史生成链：`extract.js all → build-structured.mjs all → ai-fill.mjs → patch-corpus.mjs → apply-curated.mjs → refine-voices.mjs all`（后四步涉及本地 Ollama 与人工甄选，勿在无配套时重跑）。
