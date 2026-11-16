// 断语/导语读取模块（纯函数，无 DOM / 无 node 依赖，Node 与浏览器通用）
// 只“读盘”：消费 data/interpretations/hexagram-verdicts.json 与 tiyong-verdicts.json，不修改盘对象、不碰 cast。
// 约定：卦意导语与体用判断分离——导语按 benGua.order 取；体用断语仅唯一动爻且词库有该关系时给，
//       静卦/多动按 tiyong-verdicts.json 的 untaken 提示文案处理。
// 读盘统一经 pan-view（movingPositions）判定动爻数，不关心盘来源。
import { movingPositions } from './pan-view.js';

// 本卦卦意导语（按 order 命中词库；缺失返回 null，不抛错）
export function guaBriefOf(pan, hexVerdicts) {
  const order = pan && pan.benGua && pan.benGua.order;
  if (!order || !Array.isArray(hexVerdicts)) return null;
  const e = hexVerdicts.find((x) => x && x.order === order);
  return e && e.brief ? e.brief : null;
}

function movingCount(pan) {
  return movingPositions(pan).length; // 0 静 / 1 单动 / ≥2 多动
}

// 体用断语：{ taken, text, note, untakenKey? }
export function tiyongVerdictOf(pan, tiyongVerdicts) {
  if (!pan || !tiyongVerdicts || !tiyongVerdicts.relations) {
    return { taken: false, text: null, note: null };
  }
  const rel =
    pan.tiYong && tiyongVerdicts.relations[pan.tiYong.relation]
      ? tiyongVerdicts.relations[pan.tiYong.relation]
      : null;
  if (rel && rel.text) {
    return { taken: true, text: rel.text, note: rel.note || null, untakenKey: null };
  }
  if (pan.tiYong) {
    // 有体用但词库缺该关系：不硬凑，宁缺毋滥
    return { taken: false, text: null, note: null, untakenKey: null };
  }
  const untaken = tiyongVerdicts.untaken || {};
  const key = movingCount(pan) === 0 ? 'noDong' : 'multiDong';
  const msg = untaken[key] && untaken[key].text ? untaken[key].text : null;
  return { taken: false, text: msg, note: null, untakenKey: msg ? key : null };
}

// 组装一条排盘的断语视图（供 Web 渲染与 textPan 复制共用）
export function assembleVerdict(pan, hexVerdicts, tiyongVerdicts) {
  const ty = tiyongVerdictOf(pan, tiyongVerdicts);
  return {
    guaOrder: pan && pan.benGua ? pan.benGua.order : null,
    guaBrief: guaBriefOf(pan, hexVerdicts),
    tiYongText: ty.taken ? ty.text : null,
    tiYongNote: ty.taken ? ty.note || null : null,
    untakenText: !ty.taken && ty.text ? ty.text : null, // 词库缺关系时 ty.text 为 null → 无提示
  };
}
