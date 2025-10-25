// js/data/disc-score-data.js

// stateからcharacterWeightsデータを参照するように変更
import { state } from '../main.js';

/**
 * サブステ初期値（S級ディスクの1HIT相当） = 1HITあたりの上昇値
 */
export const subStatInitialValues = {
  '会心率': 2.4,
  '会心ダメージ': 4.8,
  '攻撃力%': 3.0,
  'HP%': 3.0,
  '防御力%': 4.8,
  '攻撃力(実数値)': 19,
  'HP(実数値)': 112,
  '防御力(実数値)': 15,
  '異常マスタリー': 9,
  '貫通値': 9
  // ※「異常掌握」「貫通率」「衝撃力」「エネルギー自動回復」「属性ダメージ%」はサブには付かない
};

/* =========================
   ここからユーティリティ
   ========================= */

/**
 * キーの表記ゆれを正規化し、標準的なキー文字列を返す
 * @param {string} raw - 元のステータス名
 * @returns {string} 正規化されたステータス名、または不明な場合は元の文字列
 */
export function normalizeStatKey(raw) {
  if (!raw) return '';
  // 全角％や空白を除去
  const k = String(raw).trim().replace('％', '%').replace(/\s+/g, '');
  const isAttrDmg = k.includes('属性ダメージ%');

  const map = {
    '会心率': '会心率',
    '会心ダメージ': '会心ダメージ',
    '攻撃力%': '攻撃力%', // ▼▼▼ 警告解消のため追加 ▼▼▼
    '攻撃力(%)': '攻撃力%', // ▼▼▼ 警告解消のため追加 ▼▼▼
    'HP%': 'HP%',       // ▼▼▼ 警告解消のため追加 ▼▼▼
    'HP(%)': 'HP%',       // ▼▼▼ 警告解消のため追加 ▼▼▼
    '防御力%': '防御力%',   // ▼▼▼ 警告解消のため追加 ▼▼▼
    '防御力(%)': '防御力%',   // ▼▼▼ 警告解消のため追加 ▼▼▼
    '攻撃力(実数値)': '攻撃力(実数値)',
    '攻撃力実数値': '攻撃力(実数値)',
    'HP(実数値)': 'HP(実数値)',
    'HP実数値': 'HP(実数値)',
    '防御力(実数値)': '防御力(実数値)',
    '防御力実数値': '防御力(実数値)',
    '異常マスタリー': '異常マスタリー',
    '異常掌握': '異常掌握',
    '貫通値': '貫通値',
    'エネルギー自動回復': 'エネルギー自動回復',
    '衝撃力': '衝撃力',
    '貫通率': '貫通率',
    // 各属性ダメージも正規化キーとして扱う (メインステ用)
    '物理属性ダメージ%': '物理属性ダメージ%',
    '炎属性ダメージ%': '炎属性ダメージ%',
    '氷属性ダメージ%': '氷属性ダメージ%',
    '電気属性ダメージ%': '電気属性ダメージ%',
    'エーテル属性ダメージ%': 'エーテル属性ダメージ%',
    '玄墨属性ダメージ%': '玄墨属性ダメージ%'
  };

  // マップに存在すればそれを返す
  if (map[k]) {
    return map[k];
  }
  // 属性ダメージ% の場合もそのまま返す
  if (isAttrDmg) {
    const knownAttrs = ['物理', '炎', '氷', '電気', 'エーテル', '玄墨'];
    if (knownAttrs.some(attr => k.startsWith(attr))) {
        return k; // 例: "物理属性ダメージ%"
    }
  }
  // 不明なキーは警告を出さずにそのまま返す（新しいステータス等の可能性）
  // console.warn(`[normalizeStatKey] Unknown or unhandled key: ${raw} (normalized to: ${k})`);
  return k;
}


/**
 * キャラクターIDに対応する重み設定オブジェクトを取得する。
 * 閾値ビルドの評価が必要な場合は useSoftCapWeights = true を指定する。
 * @param {string} characterId - キャラクターID (例: 'nico', 'sokaku')
 * @param {boolean} [useSoftCapWeights=false] - 閾値達成前の重みを使用するかどうか
 * @returns {object} 重み係数オブジェクト (例: {'攻撃力%': 1.0, ...})。見つからない場合は空オブジェクト。
 */
export function getCharacterWeights(characterId, useSoftCapWeights = false) {
  const charData = state.characterWeights?.[characterId];
  if (!charData) {
    console.warn(`[disc-score-data] Weights not found for character ID: ${characterId}`);
    return {}; // 空の重みを返す
  }

  if (charData.has_soft_cap && useSoftCapWeights) {
    // 閾値評価用データがあればそれを、なければ通常データ、それでもなければ空を返す
    return charData.weights_soft_cap || charData.weights_normal || charData.weights || {};
  } else if (charData.has_soft_cap) {
    // 閾値持ちキャラだが通常評価の場合 (またはsoft_capデータがない場合) は normal を優先、なければ weights、それでもなければ空
    return charData.weights_normal || charData.weights || {};
  } else {
    // 閾値を持たないキャラは weights、なければ空
    return charData.weights || {};
  }
}

/**
 * キャラクターIDに対応する閾値情報（有無、説明）を取得する
 * @param {string} characterId - キャラクターID
 * @returns {{hasSoftCap: boolean, description?: string}} 閾値情報
 */
export function getCharacterSoftCapInfo(characterId) {
    const charData = state.characterWeights?.[characterId];
    if (charData && charData.has_soft_cap) {
        return {
            hasSoftCap: true,
            description: charData.soft_cap_desc || '特定の閾値' // 説明がなければデフォルト表示
        };
    }
    // 閾値情報がない場合は hasSoftCap: false を返す
    return { hasSoftCap: false };
}