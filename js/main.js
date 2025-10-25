// js/main.js

// --- Data Imports ---
import { allAgentsData } from './data/agents.js';
import { allWEnginesData } from './data/w-engines.js';
import { allDiscsData } from './data/discs.js';
import { mainStatsGrowthData, subStatsGrowthData } from './data/growth-data.js';
import { rankingDataData } from './data/rankings.js';
// ▼▼▼ [修正] character-weights.json をデフォルトインポートとして読み込む ▼▼▼
import characterWeightsData from './data/character-weights.json';

// --- Feature & UI Imports ---
import { initializeFirebase, authStateChangedHandler } from './firebase-auth.js';
import { navigateToSection, rerenderCurrentSection } from './router.js'; // rerenderCurrentSection もインポート
import { setupTheme } from './ui/theme.js';
import { setupComparisonBar, closeAllSelects } from './ui/components.js';
import { closeModal } from './ui/modals.js';

// --- Global State ---
export const state = {
  currentUser: null,
  allAgents: [],
  allWEngines: [],
  allDiscs: [],
  mainStatsGrowth: [],
  subStatsGrowth: [],
  rankingData: {},
  // ▼▼▼ [修正] characterWeights を state に追加 ▼▼▼
  characterWeights: {},
  myCharacters: [],
  myBuilds: [],
  myWEngines: [],
  myDiscs: [],
  comparisonList: [],
  // チャット履歴の初期化を改善
  chatHistories: { general: [], disc: [], character: [], party: [] },
  activeFilters: {}, // 各ページで初期化される想定
  roleChart: null,
  attributeChart: null,
  consentGiven: false, // firebase-auth.js で管理
  aiModel: 'flash', // ai-strategy.js で上書きされる可能性あり
};

// --- Constants ---
const NAV_PERSIST_KEY = 'lastActiveSection';
const RESTRICTED_SECTIONS = new Set(['my-builds', 'my-discs']); // ログイン必須セクション

// --- Core Application Logic ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM Content Loaded - Initializing App");
  // 1) データの初期化
  initializeData();

  // 2) Firebase 初期化＆認証監視
  try {
      initializeFirebase?.();
      if (window.firebase?.auth) {
          console.log("Setting up Firebase Auth Listener");
          window.firebase.auth().onAuthStateChanged(user => {
              console.log("Auth State Changed:", user ? user.uid : 'No user');
              try {
                  authStateChangedHandler?.(user); // ユーザー状態変更時の処理 (データ読み込みなど)
              } catch (e) {
                  console.error('authStateChangedHandler error:', e);
              }
          });
      } else {
          console.warn('Firebase Auth is not available. Running without authentication.');
          authStateChangedHandler?.(null); // UI更新のために呼び出す
      }
  } catch (e) {
      console.error("Firebase Initialization Failed:", e);
      authStateChangedHandler?.(null); // エラー時もUI更新
  }


  // 3) テーマ & UI 基盤
  try {
      setupTheme?.();
      setupComparisonBar?.();
  } catch (e) {
      console.error("Theme/UI setup failed:", e);
  }

  // 4) 直前に開いていたセクションへ（無ければ agents）
  const initialSection = localStorage.getItem(NAV_PERSIST_KEY) || 'agents';
  // ログイン必須セクションで未ログインなら agents にフォールバック
  const sectionToLoad = (RESTRICTED_SECTIONS.has(initialSection) && !state.currentUser) ? 'agents' : initialSection;
  console.log(`Initial navigation target: ${sectionToLoad}`);
  safeNavigate(sectionToLoad);

  // 5) モーダルの外側クリックで閉じる
  const modalContainer = document.getElementById('modal-container');
  if (modalContainer) {
    modalContainer.addEventListener('click', (e) => {
      // modal-content の内側でなければ閉じる
      if (e.target === modalContainer) {
          closeModal?.();
      }
    });
  }

  // 6) サイドバー開閉（モバイル）
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // イベント伝播を停止
      sidebar.classList.toggle('-translate-x-full');
      overlay.classList.toggle('hidden');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    });
  }

  // 7) カスタムセレクトの外側クリックでクローズ
  document.addEventListener('click', (e) => {
    // クリックされた要素がカスタムセレクト関連でなければ閉じる
    if (!e.target.closest('.custom-select-container') && !e.target.closest('.custom-select-options')) {
        closeAllSelects?.(null);
    }
  });

  // 8) Esc でモーダル/セレクトを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 最前面のモーダルorセレクトのみ閉じるように調整 (オプション)
      // もしカスタムセレクトが開いていればそれを閉じる
      if (document.querySelector('.custom-select-options.active')) { // 'active' クラスで判定
          closeAllSelects?.(null);
      }
      // もしモーダルが開いていればそれを閉じる (closeModalは履歴を考慮する)
      else if (modalContainer && !modalContainer.classList.contains('hidden')) {
          closeModal?.();
      }
    }
  });

  // 9) サイドバーのナビゲーション (イベント委譲)
  const navRoot = document.querySelector('#sidebar nav');
  if (navRoot) {
    navRoot.addEventListener('click', (e) => {
      const link = e.target.closest?.('a.nav-link');
      if (!link || !link.dataset.section) return;

      e.preventDefault(); // デフォルトのリンク遷移を無効化
      const section = link.dataset.section;
      safeNavigate(section); // セクション遷移処理

      // モバイル時はメニューを閉じる
      if (window.innerWidth < 1024 && sidebar && overlay) { // lg breakpoint
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
      }
    });
  }

  // 10) デバッグ用 (本番ではコメントアウトまたは削除)
  // window.__ZZZ_STATE__ = state;
  console.log("App Initialized. Current State:", state);
});

// --- Helpers ---

/**
 * アプリケーション起動時に静的データを state に読み込む
 */
function initializeData() {
  try {
      state.allAgents = allAgentsData || [];
      state.allWEngines = allWEnginesData || [];
      state.allDiscs = allDiscsData || [];
      state.mainStatsGrowth = mainStatsGrowthData || [];
      state.subStatsGrowth = subStatsGrowthData || [];
      state.rankingData = rankingDataData || {};
      // ▼▼▼ [修正] characterWeights をJSONデータから読み込む ▼▼▼
      state.characterWeights = characterWeightsData || {};
      console.log("Static data initialized.");
  } catch (e) {
      console.error("Failed to initialize static data:", e);
      // データ読み込み失敗時のフォールバック処理を検討
  }
}

/**
 * navigateToSection を安全に呼び出し、エラーハンドリングを行う
 * @param {string} section - 遷移先のセクション名
 */
function safeNavigate(section) {
  console.log(`Navigating to section: ${section}`);
  try {
    navigateToSection?.(section); // router.js の関数を呼び出す
  } catch (e) {
    console.error(`[main] navigateToSection to "${section}" failed:`, e);
    // エラー発生時は agents にフォールバック
    try {
        console.warn(`Falling back to 'agents' section.`);
        navigateToSection?.('agents');
    } catch (fallbackError) {
        console.error('[main] Fallback navigation to "agents" also failed:', fallbackError);
        const contentWrapper = document.getElementById('content-wrapper');
        if (contentWrapper) {
            contentWrapper.innerHTML = `<div class="p-4 text-red-600">ページの読み込みに致命的なエラーが発生しました。コンソールを確認してください。</div>`;
        }
    }
  }
}