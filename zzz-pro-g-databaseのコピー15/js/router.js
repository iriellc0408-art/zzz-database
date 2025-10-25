// js/router.js
import { state } from './main.js';
import { showLoginModal, showMyBuildEditorModal, showMyDiscEditorModal } from './ui/modals.js';
import { showToast } from './ui/components.js';

// 各機能ページの初期化関数をインポート
import { initAgentsPage, renderAgents } from './features/agents.js';
import { initDiscsPage, renderDiscs } from './features/discs.js';
import { initWEnginesPage, renderWEngines } from './features/w-engines.js';
import { initRankingsPage, renderRankings } from './features/rankings.js';
import { initMyBuildsPage, renderMyBuilds } from './features/my-builds.js';
import { initMyDiscsPage, renderMyDiscs } from './features/my-discs.js';
import { initAiStrategyPage } from './features/ai-strategy.js';
import { initDiscCalculatorPage } from './features/disc-calculator.js';

const sectionInitializers = {
  'agents': initAgentsPage,
  'wEngines': initWEnginesPage,
  'discs': initDiscsPage,
  'my-builds': initMyBuildsPage,
  'my-discs': initMyDiscsPage,
  'rankings': initRankingsPage,
  'ai-strategy': initAiStrategyPage,
  'disc-calculator': initDiscCalculatorPage
};

const NAV_PERSIST_KEY = 'lastActiveSection';
const RESTRICTED_SECTIONS = new Set(['my-builds', 'my-discs']);

export function navigateToSection(sectionName, editId = null) {
  // 未知セクション -> デフォルトへ
  if (!sectionInitializers[sectionName]) {
    console.warn(`[router] Unknown section "${sectionName}", fallback to "agents"`);
    sectionName = 'agents';
  }

  // 認可チェック（マイ系はログイン必須）
  if (RESTRICTED_SECTIONS.has(sectionName) && !state.currentUser) {
    showLoginModal?.();
    showToast(`「${sectionName === 'my-builds' ? 'マイビルド' : 'マイディスク'}」機能を利用するにはログインが必要です。`, 'bg-blue-500');

    // UI巻き戻し：直前のセクション表示状態を維持
    const fallback = localStorage.getItem(NAV_PERSIST_KEY) || 'agents';
    applyActiveNavClass(fallback);
    updateHeaderTitleBySection(fallback);
    return;
  }

  // すでにアクティブなら、編集モーダルだけ対応してreturn
  const currentActive = document.querySelector('.nav-link.active')?.dataset.section;
  const isSameSection = currentActive === sectionName;

  // アクティブ表示切替 & ヘッダー更新
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === sectionName);
  });
  applyActiveNavClass(sectionName);
  updateHeaderTitleBySection(sectionName);

  // 画面コンテンツの初期化
  const content = document.getElementById('content-wrapper');
  const headerActions = document.getElementById('header-actions');
  if (content) content.innerHTML = '';
  if (headerActions) headerActions.innerHTML = '';
  state.activeFilters = {};

  // セクション初期化
  const init = sectionInitializers[sectionName];
  try {
    if (!isSameSection && typeof init === 'function') {
      init();
    } else if (isSameSection && typeof init === 'function' && !content?.children?.length) {
      // 同一セクションだが空っぽなら再初期化
      init();
    }
  } catch (e) {
    console.error(`[router] init ${sectionName} failed:`, e);
    showToast('ページの読み込みでエラーが発生しました。再読み込みしてください。', 'bg-red-500');
  }

  // 編集モーダル（必要に応じて）
  if (editId) {
    if (sectionName === 'my-builds') {
      const buildData = state.myBuilds.find(b => b.id === editId);
      if (buildData) showMyBuildEditorModal?.(buildData);
    } else if (sectionName === 'my-discs') {
      const discData = state.myDiscs.find(d => d.id === editId);
      if (discData) showMyDiscEditorModal?.(discData);
    }
  }

  // モバイル時はメニューを閉じる
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (window.innerWidth < 1024 && sidebar && overlay) { // lg breakpoint
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }

  // 成功した遷移のみ保存
  localStorage.setItem(NAV_PERSIST_KEY, sectionName);
}

export function rerenderCurrentSection(sectionName) {
  if (!sectionName) return;
  switch (sectionName) {
    case 'agents':     if (document.getElementById('agent-grid')) renderAgents(); break;
    case 'my-builds':  if (document.getElementById('my-builds-grid')) renderMyBuilds(); break;
    case 'my-discs':   if (document.getElementById('my-discs-grid')) renderMyDiscs(); break;
    case 'rankings':   if (document.getElementById('ranking-list')) renderRankings(); break;
    case 'wEngines':   if (document.getElementById('wEngine-list')) renderWEngines(); break;
    case 'discs':      if (document.getElementById('disc-list')) renderDiscs(); break;
    // 'ai-strategy' や 'disc-calculator' は動的表示で再レンダ不要
  }
}

// ===== Helpers =====
function updateHeaderTitleBySection(sectionName) {
  const activeLink = document.querySelector(`.nav-link[data-section="${sectionName}"]`);
  const titleEl = document.getElementById('header-title');
  if (!titleEl) return;
  if (activeLink) {
    titleEl.textContent = activeLink.querySelector('svg + span')?.textContent.trim()
      || activeLink.textContent.trim()
      || '';
  } else {
    titleEl.textContent = '';
  }
}

/**
 * サイドバーの視覚的アクティブ表示（bg/text強調）を統一的に付与
 * index.html の nav-link クラスと相性の良い軽量なトグル
 */
function applyActiveNavClass(sectionName) {
  const links = document.querySelectorAll('#sidebar a.nav-link');
  links.forEach(a => {
    const isActive = a.dataset.section === sectionName;
    a.classList.toggle('active', isActive);
    a.classList.toggle('bg-[var(--bg-tertiary)]', isActive);
    a.classList.toggle('text-[var(--text-primary)]', isActive);
  });
}
