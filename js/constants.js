// js/constants.js

// Vite 依存を排除。index.html で定義する window.__ENV からキーを受け取る
const GEMINI_API_KEY =
  (typeof window !== 'undefined' &&
    window.__ENV &&
    window.__ENV__.GEMINI_API_KEY) || "";

/**
 * アプリ全体で参照する定数
 */
export const constants = {
  // 属性カラー（CSSグラデにも対応）
  attributeColors: {
    '物理': '#f59e0b',
    '炎': '#ef4444',
    '氷': '#38bdf8',
    '電気': '#2563eb',
    'エーテル': '#ec4899',
    '玄墨': 'linear-gradient(45deg, #e0c47d, #b5862d)',
    '霜烈': 'linear-gradient(45deg, #38bdf8, #a78bfa)'
  },

  // ロールカラー（新ロール「命破」を含む）
  roleColors: {
    '強攻': '#f97316',
    '撃破': '#dc2626',
    '異常': '#8b5cf6',
    '支援': '#22c55e',
    '防護': '#3b82f6',
    '命破': '#b5862d'
  },

  // レアリティ → CSSクラス
  rarityClasses: { 'S': 'rarity-s', 'A': 'rarity-a', 'B': 'rarity-b' },

  // Gemini の呼び出し先。キー未設定時は null にして呼び出し側で分岐できるようにする
  GEMINI_PRO_URL: GEMINI_API_KEY
    ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`
    : null,

  GEMINI_FLASH_URL: GEMINI_API_KEY
    ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`
    : null,
};

// 便利：キーが入っているかどうか
export const hasGeminiKey = () => Boolean(GEMINI_API_KEY);
