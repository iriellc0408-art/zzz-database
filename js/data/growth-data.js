// js/data/growth-data.js
// メインステータスの攻撃力(実数値)と防御力(実数値)の perHit 配列を修正済み
export const mainStatsGrowthData = [
    { name: 'HP(実数値)',         initial: 550,   perHit: [330, 330, 330, 330, 330],  max: 2200 },
    { name: 'HP(%)',             initial: 7.5,  perHit: [4.5, 4.5, 4.5, 4.5, 4.5], max: 30.0 },
    // ▼▼▼ 修正済み ▼▼▼ (Lv3, 6, 9, 12, 15 時の増加量 - ユーザー提示準拠)
    { name: '攻撃力(実数値)',     initial: 79,    perHit: [47, 47, 48, 47, 48], max: 316 }, // 3回目(Lv9)と5回目(Lv15)で48増加
    { name: '攻撃力(%)',         initial: 7.5,  perHit: [4.5, 4.5, 4.5, 4.5, 4.5], max: 30.0 },
    // ▼▼▼ 修正済み ▼▼▼ (Lv3, 6, 9, 12, 15 時の増加量 - ユーザー提示準拠)
    { name: '防御力(実数値)',     initial: 46,    perHit: [27, 28, 27, 28, 28], max: 184 }, // 1回目(Lv3)と3回目(Lv9)で27増加
    // ▲▲▲ 修正済み ▲▲▲
    { name: '防御力(%)',         initial: 12,   perHit: [7.2, 7.2, 7.2, 7.2, 7.2], max: 48.0 },
    { name: '会心率',             initial: 6,    perHit: [3.6, 3.6, 3.6, 3.6, 3.6], max: 24.0 },
    { name: '会心ダメージ',       initial: 12,   perHit: [7.2, 7.2, 7.2, 7.2, 7.2], max: 48.0 },
    { name: '異常マスタリー',     initial: 23,    perHit: [13, 14, 14, 14, 14], max: 92 }, // ユーザー提示と一致
    { name: '属性ダメージ',       initial: 7.5,  perHit: [4.5, 4.5, 4.5, 4.5, 4.5], max: 30.0 }, // 属性ダメージ% の汎用キー
    { name: '貫通率',             initial: 6,    perHit: [3.6, 3.6, 3.6, 3.6, 3.6], max: 24.0 },
    { name: '異常掌握',           initial: 7.5,  perHit: [4.5, 4.5, 4.5, 4.5, 4.5], max: 30.0 },
    { name: 'エネルギー自動回復', initial: 15,   perHit: [9, 9, 9, 9, 9],   max: 60.0 },
    { name: '衝撃力',             initial: 4.5,  perHit: [2.7, 2.7, 2.7, 2.7, 2.7], max: 18.0 }
];

export const subStatsGrowthData = [
    { name: 'HP(実数値)',         initial: 112,   perHit: 112 },
    { name: 'HP(%)',             initial: 3.0,    perHit: 3.0 },
    { name: '攻撃力(実数値)',     initial: 19,    perHit: 19 },
    { name: '攻撃力(%)',         initial: 3.0,    perHit: 3.0 },
    { name: '防御力(実数値)',     initial: 15,    perHit: 15 },
    { name: '防御力(%)',         initial: 4.8,  perHit: 4.8 },
    { name: '会心率',             initial: 2.4,  perHit: 2.4 },
    { name: '会心ダメージ',       initial: 4.8,  perHit: 4.8 },
    { name: '異常マスタリー',     initial: 9,     perHit: 9 },
    { name: '貫通値',             initial: 9,     perHit: 9 }
];