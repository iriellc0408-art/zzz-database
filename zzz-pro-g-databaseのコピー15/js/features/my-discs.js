// js/features/my-discs.js
import { state } from '../main.js';
import { showMyDiscCreatorModal, showConfirmModal, openFilterModal, showDiscModal as showDiscDetailsModal, showLoginModal } from '../ui/modals.js';
import { deleteDisc as deleteDiscFromDB } from '../firebase-auth.js';
import { createCustomSelect, showToast } from '../ui/components.js';
// ▼▼▼ 新しいスコア計算に必要な関数・データをインポート ▼▼▼
import { getCharacterWeights, normalizeStatKey, getCharacterSoftCapInfo } from '../data/disc-score-data.js';
import { mainStatsGrowthData, subStatsGrowthData } from '../data/growth-data.js';
import { constants } from '../constants.js'; 
// ▲▲▲

// --- CONSTANTS AND HELPERS (DISC-CALCULATORから共有) ---

const SCORE_RANKS = {
    SSS: { min: 95, label: '神', colors: ['#ffde59', '#ff914d', '#ff5757'] },
    SS:  { min: 90, label: '優', colors: ['#ff5757', '#c445a8', '#9642f5'] },
    S:   { min: 85, label: '良', colors: ['#9642f5', '#4f56f5', '#2196f3'] },
    A:   { min: 75, label: '可', colors: ['#2196f3', '#39c6a7', '#4caf50'] },
    B:   { min: 65, label: '並', colors: ['#66bb6a', '#9ccc65', '#d4e157'] },
    C:   { min: 0,  label: '要', colors: ['#9e9e9e', '#757575', '#616161'] }
};

const MAIN_STAT_OPTIONS_BY_SLOT = {
    '1': ['HP(実数値)'],
    '2': ['攻撃力(実数値)'],
    '3': ['防御力(実数値)'],
    '4': ['HP(%)', '攻撃力(%)', '防御力(%)', '会心率', '会心ダメージ', '異常マスタリー'],
    '5': ['HP(%)', '攻撃力(%)', '防御力(%)', '物理属性ダメージ%', '炎属性ダメージ%', '氷属性ダメージ%', '電気属性ダメージ%', 'エーテル属性ダメージ%', '玄墨属性ダメージ%', '貫通率'],
    '6': ['HP(%)', '攻撃力(%)', '防御力(%)', '異常掌握', 'エネルギー自動回復', '衝撃力']
};

/**
 * Lvとメインステ名から現在のER換算値を取得 (簡易ERテーブルの代用)
 */
function getMainStatER(mainStatName, level) {
    const normalized = normalizeStatKey(mainStatName);
    const keyToLookup = normalized.includes('属性ダメージ') ? '属性ダメージ' : normalized;
    const validLevel = [0, 3, 6, 9, 12, 15].includes(level) ? level : 15;
    
    // growth-dataからLv15のERを計算し、レベルに応じて線形補間する簡易実装 (本来はdisc-calculatorのテーブルを参照すべきだが、モジュール分離のためここで再計算)
    const mainStatInfo = mainStatsGrowthData.find(s => normalizeStatKey(s.name) === normalized || s.name === '属性ダメージ');
    const subStatGrowth = subStatsGrowthData.find(s => normalizeStatKey(s.name) === normalized || s.name.includes('%'));
    const subPerHitValue = subStatGrowth ? subStatGrowth.perHit : 1;
    if (!mainStatInfo || subPerHitValue === 0) return 0;

    // Lv15時の最大ERを計算 (約10ER)
    const erAtMax = mainStatInfo.max / subPerHitValue;
    
    // 現在のレベルのERを計算 (Lv15を基準にスケーリング)
    const erCurrent = erAtMax * (validLevel / 15);
    
    // Lv0の場合の初期ERを計算
    if (validLevel === 0) return mainStatInfo.initial / subPerHitValue;

    return parseFloat(erCurrent.toFixed(1));
}

/**
 * レベルと初期OP数から、サブステータスの理論的最大ER合計 (最大HIT数) を取得
 */
function getMaxSubERTotal(level, initialOpCount) {
    const totalEnhancements = Math.floor(level / 3);
    const maxUpgrades = initialOpCount === 3 ? Math.max(0, totalEnhancements - 1) : totalEnhancements;
    return initialOpCount + maxUpgrades;
}

/**
 * 簡易スコアランク取得
 */
function getRankForPerfection(perfectionScore) {
    const score = isNaN(perfectionScore) ? 0 : Math.max(0, perfectionScore);
    for (const rank in SCORE_RANKS) {
        if (score >= SCORE_RANKS[rank].min) {
            return { rank, data: SCORE_RANKS[rank] };
        }
    }
    return { rank: 'C', data: SCORE_RANKS.C };
}

/**
 * ステータスの値をフォーマットする（%表示など）
 */
function formatStatValue(value, statName) {
    if (!statName || isNaN(value) || value < 0) return ''; 
    const normalizedName = normalizeStatKey(statName); 
    const isPercent = normalizedName.includes('%') ||
                      ['会心率', '会心ダメージ', 'エネルギー自動回復', '貫通率', '衝撃力', '異常掌握'].includes(normalizedName);
    return isPercent ? value.toFixed(1) + '%' : String(Math.round(value));
}


// --- CORE SCORING LOGIC ---

/**
 * 単一ディスクのスコアを計算する関数 (ER正規化・部位別理論値)
 * @param {object} discData - 計算対象のディスクデータ (myDiscsの形式)
 * @param {string} agentId - 評価基準となるキャラクターID
 * @param {boolean} [useSoftCap=false] - 閾値評価を使用するかどうか
 * @param {string} [evaluationCriteria='maxLevel'] - 評価基準 ('maxLevel' or 'currentLevel')
 * @returns {number} 0-100 のスコア、計算不能なら 0
 */
function calculateDiscScore(discData, agentId, useSoftCap = false, evaluationCriteria = 'maxLevel') {
    if (!discData || !agentId || !discData.mainStat) return 0;

    const weights = getCharacterWeights(agentId, useSoftCap);
    if (Object.keys(weights).length === 0) return 0; // 重みデータなし

    const level = discData.level || 15;
    const initialOpCount = discData.opCount || 4;
    
    // 評価基準レベル
    const evalLevel = evaluationCriteria === 'maxLevel' ? 15 : level;

    // --- 分子 (Numerator): このディスクの加重ER合計 ---
    let mainWeightedER = 0;
    const mainStatER = getMainStatER(discData.mainStat, level); // 現在レベルのER
    const mainStatWeight = weights[normalizeStatKey(discData.mainStat)] ?? 0;
    mainWeightedER = mainStatER * mainStatWeight;

    let subWeightedERTotal = 0;
    if (Array.isArray(discData.subStats)) {
        discData.subStats.forEach(sub => {
            if (sub.name && sub.hits > 0) {
                const weight = weights[normalizeStatKey(sub.name)] ?? 0;
                subWeightedERTotal += sub.hits * weight;
            }
        });
    }
    const currentWeightedER = mainWeightedER + subWeightedERTotal;

    // --- 分母 (Denominator): この部位の理論的最大加重ER ---
    const discNum = discData.discNum;
    
    // 1. 理論的最良メインステータスの加重ERを計算 (部位別)
    let bestMainStatWeight = 0;
    const possibleMainStats = MAIN_STAT_OPTIONS_BY_SLOT[discNum] || [];
    let bestMainStatNameForCalc = possibleMainStats[0] || ''; 

    possibleMainStats.forEach(statName => {
        const weight = weights[normalizeStatKey(statName)] ?? 0;
        if (weight > bestMainStatWeight) {
            bestMainStatWeight = weight;
            bestMainStatNameForCalc = statName;
        }
    });
    const maxMainERForLevel = getMainStatER(bestMainStatNameForCalc, evalLevel);
    const bestMainStatWeightedER = maxMainERForLevel * bestMainStatWeight;

    // 2. 理論的最良サブステータスの加重ERを計算
    const maxSubHits = getMaxSubERTotal(evalLevel, initialOpCount);
    let bestSubWeight = 0;
    const agentNormalWeights = getCharacterWeights(agentId, false); 
    Object.keys(agentNormalWeights).forEach(statName => {
        if (subStatsGrowthData.some(s => normalizeStatKey(s.name) === normalizeStatKey(statName))) {
             const weight = agentNormalWeights[statName] ?? 0;
             if (weight > bestSubWeight) bestSubWeight = weight;
        }
    });
    const effectiveBestSubWeight = Math.min(1.0, bestSubWeight); 
    const bestSubStatWeightedER = maxSubHits * effectiveBestSubWeight;

    const theoreticalMaxWeightedER = bestMainStatWeightedER + bestSubStatWeightedER;

    // --- スコア計算 ---
    const score = theoreticalMaxWeightedER > 0.001 
        ? (currentWeightedER / theoreticalMaxWeightedER) * 100 
        : 0;

    return Math.max(0, Math.min(100, score)); // 0-100の範囲に収める
}


// --- INITIALIZATION ---
export function initMyDiscsPage() {
    // ログイン状態チェック
    if (!state.currentUser) {
        document.getElementById('content-wrapper').innerHTML = `<div class="p-6 bg-[var(--bg-secondary)] rounded-xl text-center"><p class="text-xl font-bold mb-4">マイディスク機能</p><p class="text-[var(--text-secondary)]">この機能を利用するには、サインインが必要です。</p></div>`;
        return;
    }

    document.getElementById('header-actions').innerHTML = `
        <div class="flex items-center gap-4">
             <button id="create-disc-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition interactive-scale">新規ディスク登録</button>
        </div>`;
    document.getElementById('content-wrapper').innerHTML = `
        <div id="my-discs-filters" class="bg-[var(--bg-secondary)] p-4 rounded-xl shadow-lg mb-6 card">
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <input type="text" id="my-disc-name-search" placeholder="セット名/個別名/ディスク名..." class="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent text-[var(--text-primary)]">
                <button id="main-stat-filter-btn" class="custom-select-trigger text-left text-[var(--text-secondary)]">メインステータス</button>
                <button id="sub-stat-filter-btn" class="custom-select-trigger text-left text-[var(--text-secondary)]">サブステータス</button>
                <div id="my-disc-op-filter-wrapper"></div>
            </div>
        </div>
         <div class="flex items-center justify-between mb-4 flex-wrap gap-4">
            <div id="my-disc-agent-select-wrapper" class="flex-shrink-0 w-full sm:w-auto min-w-[200px]"></div>
            <div class="flex items-center gap-2 flex-wrap">
                <div id="my-disc-softcap-toggle-wrapper" class="hidden items-center gap-2"></div>
                <div id="my-disc-eval-criteria-wrapper" class="flex items-center gap-2">
                    <span class="text-xs font-bold text-[var(--text-secondary)]">評価基準:</span>
                    <div class="op-toggle-group">
                        <button id="eval-current" type="button" class="op-toggle-btn" data-eval="currentLevel">現在Lv</button>
                        <button id="eval-max" type="button" class="op-toggle-btn active" data-eval="maxLevel">最大Lv</button>
                    </div>
                    <span class="tooltip ml-1">(?)<span class="tooltip-text tooltip-text-improved">スコア計算の理論値(分母)を現在のディスクレベルにするか、Lv15にするかを選択します。</span></span>
                </div>
            </div>
             <div id="sort-controls-container" class="flex items-center gap-2"></div>
        </div>
        <div id="my-discs-grid" class="space-y-6"></div>`;

    document.getElementById('create-disc-btn').addEventListener('click', () => showMyDiscCreatorModal());

    setupMyDiscsFilters();
    renderMyDiscs();
}

function setupMyDiscsFilters() {
    // 状態オブジェクトを初期化または復元
    state.activeFilters.myDiscs = localStorage.getItem('myDiscsFilters') 
        ? JSON.parse(localStorage.getItem('myDiscsFilters'))
        : {
            searchTerm: '', mainStat: [], subStat: [], opCount: 'all',
            agentId: '', useSoftCap: false, evaluationCriteria: 'maxLevel',
            sortBy: 'createdAt', sortOrder: 'desc'
        };
    
    const saveFilters = () => localStorage.setItem('myDiscsFilters', JSON.stringify(state.activeFilters.myDiscs));
    
    // --- キャラクター選択 (スコア評価基準) ---
    const agentSelectWrapper = document.getElementById('my-disc-agent-select-wrapper');
    const agentSelect = document.createElement('select');
    agentSelect.id = 'my-disc-agent-select';
    
     const agentOptions = Object.keys(state.characterWeights || {})
        .map(agentId => {
            const agentInfo = state.allAgents.find(a => a.id === agentId);
            const name = state.characterWeights[agentId]?.name_jp || agentInfo?.name || agentId;
            const icon = agentInfo?.imageUrls?.style1?.['2d'] || '';
            return { id: agentId, name, icon };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
        .map(a => `<option value="${a.id}" data-icon="${a.icon}">${a.name}</option>`);

    agentSelect.innerHTML = `<option value="">キャラを選択してスコア評価</option>${agentOptions.join('')}`;
    agentSelect.value = state.activeFilters.myDiscs.agentId;

    agentSelect.addEventListener('change', (e) => {
        state.activeFilters.myDiscs.agentId = e.target.value;
        updateMyDiscSoftCapToggleVisibility(e.target.value);
        renderMyDiscs();
        saveFilters();
    });
    agentSelectWrapper.appendChild(createCustomSelect(agentSelect, { placeholder: "キャラを選択してスコア評価" }));

    // --- フィルタリング (名称、メイン、サブ、OP数) ---
    
    const nameSearch = document.getElementById('my-disc-name-search');
    nameSearch.value = state.activeFilters.myDiscs.searchTerm;
    nameSearch.addEventListener('input', (e) => {
        state.activeFilters.myDiscs.searchTerm = e.target.value.toLowerCase();
        renderMyDiscs();
        saveFilters();
    });

    const mainStatOptions = [...new Set(MAIN_STAT_OPTIONS_BY_SLOT['1'].concat(MAIN_STAT_OPTIONS_BY_SLOT['4'], MAIN_STAT_OPTIONS_BY_SLOT['5'], MAIN_STAT_OPTIONS_BY_SLOT['6']))].sort();
    document.getElementById('main-stat-filter-btn').addEventListener('click', () => {
        openFilterModal('メインステータス', mainStatOptions, state.activeFilters.myDiscs.mainStat, (selected) => {
            state.activeFilters.myDiscs.mainStat = selected;
            const btn = document.getElementById('main-stat-filter-btn');
            btn.textContent = selected.length > 0 ? `${selected.length}件選択中` : 'メインステータス';
            btn.classList.toggle('active', selected.length > 0);
            renderMyDiscs();
            saveFilters();
        });
    });

    const subStatOptions = subStatsGrowthData.map(s => s.name).sort();
     document.getElementById('sub-stat-filter-btn').addEventListener('click', () => {
        openFilterModal('サブステータス', subStatOptions, state.activeFilters.myDiscs.subStat, (selected) => {
            state.activeFilters.myDiscs.subStat = selected;
             const btn = document.getElementById('sub-stat-filter-btn');
             btn.textContent = selected.length > 0 ? `${selected.length}件選択中` : 'サブステータス';
             btn.classList.toggle('active', selected.length > 0);
            renderMyDiscs();
            saveFilters();
        });
    });
    // 初期フィルターボタンテキスト設定
    document.getElementById('main-stat-filter-btn').textContent = state.activeFilters.myDiscs.mainStat.length > 0 ? `${state.activeFilters.myDiscs.mainStat.length}件選択中` : 'メインステータス';
    document.getElementById('sub-stat-filter-btn').textContent = state.activeFilters.myDiscs.subStat.length > 0 ? `${state.activeFilters.myDiscs.subStat.length}件選択中` : 'サブステータス';
    
    const opFilter = document.createElement('select');
    opFilter.id = 'my-disc-op-filter';
    opFilter.innerHTML = `<option value="all">初期OP</option><option value="3">3 OP</option><option value="4">4 OP</option>`;
    opFilter.value = state.activeFilters.myDiscs.opCount;
    opFilter.addEventListener('change', (e) => {
        state.activeFilters.myDiscs.opCount = e.target.value;
        renderMyDiscs();
        saveFilters();
    });
    document.getElementById('my-disc-op-filter-wrapper').appendChild(createCustomSelect(opFilter, { placeholder: "初期OP" }));

    // --- 評価基準トグル (Max/Current) ---
    const evalWrapper = document.getElementById('my-disc-eval-criteria-wrapper');
    evalWrapper.querySelector(`#eval-current`).classList.toggle('active', state.activeFilters.myDiscs.evaluationCriteria === 'currentLevel');
    evalWrapper.querySelector(`#eval-max`).classList.toggle('active', state.activeFilters.myDiscs.evaluationCriteria === 'maxLevel');
    evalWrapper.querySelectorAll('.op-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            evalWrapper.querySelectorAll('.op-toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.activeFilters.myDiscs.evaluationCriteria = e.target.dataset.eval;
            renderMyDiscs(); // スコア再計算のため再描画
            saveFilters();
        });
    });

    // --- ソート ---
    const sortContainer = document.getElementById('sort-controls-container');
    const sortSelect = document.createElement('select');
    sortSelect.id = 'my-disc-sort-by';
    sortSelect.innerHTML = `<option value="createdAt">登録順</option><option value="score">スコア順</option>`;
    sortSelect.value = state.activeFilters.myDiscs.sortBy;
    sortSelect.addEventListener('change', e => { 
        state.activeFilters.myDiscs.sortBy = e.target.value; 
        renderMyDiscs(); 
        saveFilters();
    });
    sortContainer.appendChild(createCustomSelect(sortSelect));

    const orderButton = document.createElement('button');
    orderButton.id = 'my-disc-sort-order';
    orderButton.className = 'p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] text-[var(--text-secondary)] transition-colors interactive-scale';
    const updateOrderButtonIcon = () => {
        orderButton.innerHTML = state.activeFilters.myDiscs.sortOrder === 'desc'
            ? `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v10.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3.75A.75.75 0 0110 3z" clip-rule="evenodd"></path></svg>`
            : `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.56l-3.22 3.22a.75.75 0 11-1.06-1.06l4.5-4.5a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L10.75 5.56v10.69A.75.75 0 0110 17z" clip-rule="evenodd"></path></svg>`;
    };
    orderButton.onclick = () => {
        state.activeFilters.myDiscs.sortOrder = state.activeFilters.myDiscs.sortOrder === 'desc' ? 'asc' : 'desc';
        updateOrderButtonIcon();
        renderMyDiscs();
        saveFilters();
    };
    sortContainer.appendChild(orderButton);
    updateOrderButtonIcon();
    
    // 閾値トグルも初期表示
    updateMyDiscSoftCapToggleVisibility(state.activeFilters.myDiscs.agentId);
}

/**
 * 選択中のキャラに応じて閾値評価トグルの表示を更新
 */
function updateMyDiscSoftCapToggleVisibility(agentId) {
    const wrapper = document.getElementById('my-disc-softcap-toggle-wrapper');
    if (!wrapper) return;
    const softCapInfo = getCharacterSoftCapInfo(agentId);

    if (softCapInfo.hasSoftCap) {
        wrapper.innerHTML = `
             <label for="my-disc-softcap-toggle" class="rich-toggle">
                <input type="checkbox" id="my-disc-softcap-toggle" class="sr-only rich-toggle-input" ${state.activeFilters.myDiscs.useSoftCap ? 'checked' : ''}>
                <div class="rich-toggle-switch"><div class="rich-toggle-switch-handle"></div></div>
             </label>
             <span class="text-xs font-medium text-[var(--text-secondary)]">閾値評価 (${softCapInfo.description})</span>
             <span class="tooltip ml-1">(?)<span class="tooltip-text tooltip-text-improved">ONにすると、${softCapInfo.description}達成を最優先する特別な重みでスコアを計算します。</span></span>
        `;
        wrapper.classList.remove('hidden');
        wrapper.classList.add('flex'); // 表示

        const toggle = wrapper.querySelector('#my-disc-softcap-toggle');
        toggle.addEventListener('change', (e) => {
            state.activeFilters.myDiscs.useSoftCap = e.target.checked;
            renderMyDiscs(); // スコア再計算のため再描画
            localStorage.setItem('myDiscsFilters', JSON.stringify(state.activeFilters.myDiscs));
        });
    } else {
        wrapper.innerHTML = '';
        wrapper.classList.add('hidden');
        wrapper.classList.remove('flex'); // 非表示
        state.activeFilters.myDiscs.useSoftCap = false; // 閾値がないキャラなら必ずfalse
    }
}


export function renderMyDiscs() {
    const grid = document.getElementById('my-discs-grid');
    if(!grid) return;

    // フィルター状態を取得
    const filters = state.activeFilters.myDiscs || {};
    const agentId = filters.agentId;
    const useSoftCap = filters.useSoftCap;
    const evaluationCriteria = filters.evaluationCriteria;

    // フィルタリング
    let filteredDiscs = (state.myDiscs || []).filter(disc => {
        if (disc.discs) return false; // セットデータは表示しない（個別ディスクのみ）

        const searchTerm = (filters.searchTerm || '').toLowerCase();
        const mainStatFilters = filters.mainStat || [];
        const subStatFilters = filters.subStat || [];
        const opFilter = filters.opCount;

        const searchMatch = !searchTerm ||
            (disc.customName && disc.customName.toLowerCase().includes(searchTerm)) ||
            (disc.discName && disc.discName.toLowerCase().includes(searchTerm));

        const mainStatMatch = mainStatFilters.length === 0 ||
            mainStatFilters.includes(normalizeStatKey(disc.mainStat));

        const subStatMatch = subStatFilters.length === 0 ||
            subStatFilters.every(filterStat => disc.subStats?.some(s => normalizeStatKey(s.name) === normalizeStatKey(filterStat)));

        const opMatch = !opFilter || opFilter === 'all' || (disc.opCount || 4) == opFilter;

        return searchMatch && mainStatMatch && subStatMatch && opMatch;
    });

    // スコア計算 (キャラクター選択時のみ)
    if (agentId) {
        filteredDiscs.forEach(disc => {
            disc.calculatedScore = calculateDiscScore(disc, agentId, useSoftCap, evaluationCriteria);
        });
    } else {
        filteredDiscs.forEach(disc => { disc.calculatedScore = -1; }); // 未選択時はスコア-1
    }

    // ソート
    filteredDiscs.sort((a, b) => {
        const order = filters.sortOrder === 'asc' ? 1 : -1;
        if (filters.sortBy === 'score') {
            // スコア未計算(-1)は最後に配置
            if (a.calculatedScore === -1 && b.calculatedScore !== -1) return 1 * order;
            if (a.calculatedScore !== -1 && b.calculatedScore === -1) return -1 * order;
            return (a.calculatedScore - b.calculatedScore) * order;
        } else { // createdAt (デフォルト)
            const dateA = a.createdAt || 0;
            const dateB = b.createdAt || 0;
            return (dateA - dateB) * order;
        }
    });

    // --- レンダリング ---
    grid.innerHTML = '';
    if (filteredDiscs.length === 0) {
        grid.innerHTML = `<div class="md:col-span-2 xl:col-span-3 bg-[var(--bg-secondary)] border-2 border-dashed border-[var(--border-secondary)] rounded-xl flex flex-col items-center justify-center h-48 text-center p-4"><p class="font-semibold text-lg mb-2">条件に合うディスクが見つかりません</p><p class="text-[var(--text-secondary)] text-sm">フィルター条件を変更するか、<br>右上の「新規ディスク登録」からディスクを追加してください。</p></div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    filteredDiscs.forEach(discData => {
        const discContainer = document.createElement('div');
        discContainer.className = 'bg-[var(--bg-secondary)] rounded-2xl shadow-lg p-5 flex flex-col card';
        discContainer.dataset.discId = discData.id;

        const discInfo = state.allDiscs.find(d => d.name === discData.discName);
        const discNameDisplay = discInfo?.name || "不明なディスク";
        
        const score = discData.calculatedScore ?? -1;
        const rankInfo = score >= 0 ? getRankForPerfection(score) : null;

        const mainStatInfo = mainStatsGrowthData.find(s => normalizeStatKey(s.name) === normalizeStatKey(discData.mainStat) || (normalizeStatKey(discData.mainStat).includes('属性ダメージ') && s.name === '属性ダメージ'));
        
        // レベルに応じたメインステータス値を計算
        let mainStatValueNum = 0;
        if (mainStatInfo && discData.level) {
            mainStatValueNum = mainStatInfo.initial;
            const upgradeCount = Math.floor(discData.level / 3);
            for(let i = 0; i < upgradeCount; i++) {
                 if(mainStatInfo.perHit && mainStatInfo.perHit[i] !== undefined) {
                    mainStatValueNum += mainStatInfo.perHit[i];
                }
            }
        }
        const mainStatValueStr = formatStatValue(mainStatValueNum, discData.mainStat);

        const subStatsHtml = (discData.subStats || []).slice(0, 4).map(sub => {
             if (!sub.name) return '<div class="h-[30px]"></div>';
             const subStatInfo = subStatsGrowthData.find(s => normalizeStatKey(s.name) === normalizeStatKey(sub.name));
             if (!subStatInfo) return '';
             const value = (subStatInfo.perHit || 0) * (sub.hits || 1);
             const displayValue = formatStatValue(value, sub.name);
             
             let indicatorColor = 'value-feedback-gray';
             if (agentId) {
                 indicatorColor = getScoreIndicatorClass(agentId, sub.name, useSoftCap);
             }

             return `<div class="flex justify-between items-center text-xs p-1 bg-[var(--bg-primary)] rounded-md relative pl-4">
                        <div class="value-feedback-indicator absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-3 rounded-full ${indicatorColor}"></div>
                        <span class="text-[var(--text-secondary)]">${sub.name} (+${(sub.hits || 1) - 1})</span>
                        <span class="font-mono font-semibold text-[var(--text-primary)]">${displayValue}</span>
                    </div>`;
        }).join('');
         // 4枠に満たない場合、空のdivで埋める
         const emptySlots = 4 - (discData.subStats?.length || 0);
         const emptyHtml = Array(emptySlots).fill('<div class="h-[30px]"></div>').join('');


        discContainer.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-3">
                    <img src="${discInfo?.iconUrl || ''}" alt="${discNameDisplay}" class="w-10 h-10 object-cover rounded-lg flex-shrink-0 border border-[var(--border-primary)]" loading="lazy">
                    <div class="overflow-hidden">
                        <p class="font-semibold text-base text-[var(--text-primary)] truncate" title="${discData.customName || discNameDisplay}">${discData.customName || discNameDisplay}</p>
                        <p class="text-xs text-[var(--text-secondary)]">#${discData.discNum || '?'} ${discData.customName ? `(${discNameDisplay})` : ''} | Lv.${discData.level || 15} | ${discData.opCount || 4}OP</p>
                    </div>
                </div>
                ${rankInfo ? `
                    <div class="text-right flex-shrink-0 ml-2">
                        <p class="text-xs text-[var(--text-secondary)]">スコア (${filters.evaluationCriteria === 'currentLevel' ? '現Lv': '最大Lv'})</p>
                        <p class="text-xl font-bold" style="color: ${rankInfo.data.colors[1]}">${score.toFixed(1)}<span class="text-sm">%</span></p>
                        <p class="text-xs font-semibold px-1.5 py-0.5 rounded text-white inline-block" style="background-color: ${rankInfo.data.colors[1]}">${rankInfo.rank}</p>
                    </div>
                ` : `<div class="text-right text-xs text-red-500 font-semibold ml-2">キャラ未選択</div>`}
            </div>
            <div class="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-2">
                <div class="flex justify-between items-center text-sm">
                    <span class="font-semibold text-amber-700 dark:text-amber-300">${discData.mainStat || 'メインステなし'}</span>
                    <span class="font-mono font-bold text-amber-700 dark:text-amber-300">${mainStatValueStr}</span>
                </div>
            </div>
            <div class="space-y-1 flex-1">${subStatsHtml}${emptyHtml}</div>
             <div class="mt-4 pt-3 border-t border-[var(--border-primary)] flex justify-end gap-2">
                 <button data-disc-name="${discNameDisplay}" class="disc-details-btn text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-blue)] py-1 px-2 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] transition flex items-center gap-1">
                      <span class="material-symbols-outlined text-sm">info</span>セット詳細
                 </button>
                 <button data-disc-id="${discData.id}" class="edit-disc-btn text-xs font-semibold text-[var(--text-secondary)] hover:text-green-500 py-1 px-2 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] transition flex items-center gap-1">
                     <span class="material-symbols-outlined text-sm">edit</span>編集
                 </button>
                 <button data-disc-id="${discData.id}" class="delete-disc-btn text-xs font-semibold text-[var(--text-secondary)] hover:text-red-500 py-1 px-2 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] transition flex items-center gap-1">
                     <span class="material-symbols-outlined text-sm">delete</span>削除
                 </button>
             </div>
        `;

        fragment.appendChild(discContainer);
    });

    grid.appendChild(fragment);

    // イベントリスナーを再設定 (イベント委譲)
    grid.removeEventListener('click', handleGridClick); // 古いリスナーを削除
    grid.addEventListener('click', handleGridClick);
}

/**
 * サブステータスの価値に応じたCSSクラスを返す (my-discs専用)
 */
function getScoreIndicatorClass(agentId, subStatName, useSoftCap) {
    if (!agentId || !subStatName) return 'value-feedback-gray';
    const weights = getCharacterWeights(agentId, useSoftCap);
    const weight = weights[normalizeStatKey(subStatName)] ?? 0;

    if (weight >= 0.95) return 'value-feedback-gold';    // SSS
    else if (weight >= 0.8) return 'value-feedback-purple'; // SS
    else if (weight >= 0.6) return 'value-feedback-blue';   // S
    else if (weight >= 0.3) return 'value-feedback-green';  // A
    else return 'value-feedback-gray';                    // B or C
}


/**
 * マイディスクグリッド内のクリックイベントを処理
 */
function handleGridClick(e) {
    const deleteBtn = e.target.closest('.delete-disc-btn');
    const editBtn = e.target.closest('.edit-disc-btn');
    const detailsBtn = e.target.closest('.disc-details-btn');

    if (deleteBtn) {
        e.stopPropagation();
        const discId = deleteBtn.dataset.discId;
        const disc = state.myDiscs.find(d => d.id === discId);
        const name = disc?.customName || (disc?.discName ? `「${disc.discName}」ディスク` : 'このディスク');
        showConfirmModal(
            `ディスク「${name}」を削除`,
            "この操作は取り消せません。本当に削除しますか？",
            () => deleteDiscFromDB(discId) // Firebase側の削除処理を呼び出す
        );
    } else if (editBtn) {
        e.stopPropagation();
        const discId = editBtn.dataset.discId;
        const discData = state.myDiscs.find(d => d.id === discId);
        if (discData) {
             // 編集モーダルを開く (showMyDiscCreatorModal を編集モードで呼び出す)
             showMyDiscCreatorModal(discData); 
        }
    } else if (detailsBtn) {
        e.stopPropagation();
        const discName = detailsBtn.dataset.discName;
        if (discName) {
            showDiscDetailsModal(discName, { isChild: true }); // 詳細モーダルを表示
        }
    }
}