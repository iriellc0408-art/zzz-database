// js/features/agents.js
import { state } from '../main.js';
import { allAgentsData } from '../data/agents.js'; // 必要なデータを直接インポート
import { constants } from '../constants.js';
import { createCustomSelect, showToast, updateComparisonBar } from '../ui/components.js';
import { showAgentModal, showMyCharactersModal, showLoginModal } from '../ui/modals.js';

// Chart.jsを動的に読み込む関数
async function loadChartJs() {
    if (window.Chart) return; // 既に読み込まれていれば何もしない
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
}

function toggleAgentComparison(agentId) {
    if (!Array.isArray(state.comparisonList)) {
        state.comparisonList = [];
    }

    const index = state.comparisonList.indexOf(agentId);
    if (index > -1) {
        state.comparisonList.splice(index, 1);
    } else {
        if (state.comparisonList.length >= 3) {
            showToast('比較リストには3人まで追加できます。', 'bg-red-500');
            return;
        }
        state.comparisonList.push(agentId);
    }

    updateComparisonBar();

    const agentGrid = document.getElementById('agent-grid');
    if (agentGrid) {
        const card = agentGrid.querySelector(`.card [data-agent-id="${agentId}"]`)?.closest('.card');
        if (card) {
            card.classList.toggle('agent-compare-selected', index === -1);
        } else {
            renderAgents();
        }
    }
}

export function initAgentsPage() {
    // データをstateに格納
    state.allAgents = allAgentsData;

    document.getElementById('header-actions').innerHTML = `<button id="my-characters-btn" class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition interactive-scale">マイキャラ管理</button>`;
    document.getElementById('content-wrapper').innerHTML = `
        <div id="filters-container-parent" class="bg-[var(--bg-secondary)] p-4 rounded-xl shadow-lg mb-6 card">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" id="agent-filters-container"></div>
        </div>
        <div class="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
            <div id="owned-filter-container"></div>
            <div id="sort-controls-container" class="flex items-center gap-2"></div>
        </div>
        <div id="agent-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6"></div>
        <div class="bg-[var(--bg-secondary)] p-4 sm:p-6 rounded-xl shadow-md mt-12 card">
            <h2 class="text-2xl font-bold text-center mb-6 text-[var(--text-primary)]">エージェント分布サマリー</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div><h3 class="text-xl font-semibold text-center mb-4 text-[var(--text-secondary)]">役割分布</h3><div class="chart-container"><canvas id="role-chart"></canvas></div></div>
                <div><h3 class="text-xl font-semibold text-center mb-4 text-[var(--text-secondary)]">属性分布</h3><div class="chart-container"><canvas id="attribute-chart"></canvas></div></div>
            </div>
        </div>`;

    document.getElementById('my-characters-btn').addEventListener('click', handleMyCharactersClick);
    setupAgentFilters();
    renderAgents();
    createCharts(); // 変更なし
}

export function handleMyCharactersClick() {
    if (!state.currentUser) {
        showLoginModal();
        showToast('マイキャラ管理機能を利用するにはログインが必要です。', 'bg-blue-500');
    } else {
        showMyCharactersModal();
    }
}

export function setupAgentFilters() {
    const filters = {
        attribute: { label: '全属性', options: [...new Set(state.allAgents.flatMap(a => a.attributes || [a.attribute]))].sort() },
        role:      { label: '全役割', options: [...new Set(state.allAgents.map(a => a.role))].sort() },
        faction:   { label: '全陣営', options: [...new Set(state.allAgents.map(a => a.faction))].sort() },
        rarity:    { label: '全レアリティ', options: ['S', 'A'] }
    };
    const container = document.getElementById('agent-filters-container');
    if (!container) return;
    container.innerHTML = `<input type="text" id="agent-search" placeholder="名前で検索..." class="col-span-1 sm:grid-cols-2 lg:col-span-1 w-full py-2 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent text-[var(--text-primary)]">`;
    for (const key in filters) {
        const select = document.createElement('select');
        select.id = `${key}-filter`;
        select.innerHTML = `<option value="all">${filters[key].label}</option>` + filters[key].options.map(o => `<option value="${o}">${o}</option>`).join('');
        select.addEventListener('change', () => { state.activeFilters[key] = select.value; renderAgents(); });
        container.appendChild(createCustomSelect(select));
        state.activeFilters[key] = 'all';
    }
    const searchInput = document.getElementById('agent-search');
    searchInput.addEventListener('input', (e) => { state.activeFilters.searchTerm = e.target.value.toLowerCase(); renderAgents(); });
    state.activeFilters.searchTerm = '';

    const ownedContainer = document.getElementById('owned-filter-container');
    ownedContainer.innerHTML = `
        <label for="sort-owned-first" class="rich-toggle">
            <input type="checkbox" id="sort-owned-first" class="sr-only rich-toggle-input" checked>
            <div class="rich-toggle-switch">
                <div class="rich-toggle-switch-handle"></div>
            </div>
            <span class="text-sm font-medium text-[var(--text-secondary)]">所持キャラを優先表示</span>
        </label>
    `;
    const sortOwnedCheckbox = document.getElementById('sort-owned-first');
    sortOwnedCheckbox.addEventListener('change', (e) => {
        state.activeFilters.sortOwnedFirst = e.target.checked;
        renderAgents();
    });
    state.activeFilters.sortOwnedFirst = true;

    const sortContainer = document.getElementById('sort-controls-container');
    const sortSelect = document.createElement('select');
    sortSelect.id = 'sort-by';
    sortSelect.innerHTML = `
        <option value="releaseVersion">実装順</option>
        <option value="rarity">レアリティ順</option>
        <option value="name">名前順</option>
    `;
    sortSelect.addEventListener('change', (e) => { state.activeFilters.sortBy = e.target.value; renderAgents(); });
    sortContainer.appendChild(createCustomSelect(sortSelect));
    state.activeFilters.sortBy = 'releaseVersion';

    const orderButton = document.createElement('button');
    orderButton.id = 'sort-order-btn';
    orderButton.className = 'p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] text-[var(--text-secondary)] transition-colors interactive-scale';
    orderButton.addEventListener('click', () => {
        state.activeFilters.sortOrder = state.activeFilters.sortOrder === 'desc' ? 'asc' : 'desc';
        renderAgents();
    });
    sortContainer.appendChild(orderButton);
    state.activeFilters.sortOrder = 'desc';
}

export function renderAgents() {
    const grid = document.getElementById('agent-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const orderButton = document.getElementById('sort-order-btn');
    if(orderButton){
        orderButton.innerHTML = state.activeFilters.sortOrder === 'desc'
            ? `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v10.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3.75A.75.75 0 0110 3z" clip-rule="evenodd"></path></svg>`
            : `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.56l-3.22 3.22a.75.75 0 11-1.06-1.06l4.5-4.5a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L10.75 5.56v10.69A.75.75 0 0110 17z" clip-rule="evenodd"></path></svg>`;
    }

    let agentsToRender = [...state.allAgents].filter(agent =>
        (state.activeFilters.rarity === 'all' || agent.rarity === state.activeFilters.rarity) &&
        (state.activeFilters.attribute === 'all' || (agent.attributes || [agent.attribute]).includes(state.activeFilters.attribute)) &&
        (state.activeFilters.role === 'all' || agent.role === state.activeFilters.role) &&
        (state.activeFilters.faction === 'all' || agent.faction === state.activeFilters.faction) &&
        agent.name.toLowerCase().includes(state.activeFilters.searchTerm)
    );

    const sorter = (a, b) => {
        const order = state.activeFilters.sortOrder === 'asc' ? 1 : -1;
        const sortBy = state.activeFilters.sortBy;

        if (sortBy === 'releaseVersion') {
            const versionA = parseFloat(a.releaseVersion.match(/[\d.]+/)) || 0;
            const versionB = parseFloat(b.releaseVersion.match(/[\d.]+/)) || 0;
            if (versionA !== versionB) return (versionA - versionB) * order;
            return (new Date(a.releaseDate) - new Date(b.releaseDate)) * order;
        }
        if (sortBy === 'rarity') {
            const rarityOrder = { 'S': 2, 'A': 1, 'B': 0 };
            if (rarityOrder[a.rarity] !== rarityOrder[b.rarity]) {
                return (rarityOrder[a.rarity] - rarityOrder[b.rarity]) * order;
            }
        }
        return a.name.localeCompare(b.name, 'ja') * order;
    };
    agentsToRender.sort(sorter);

    if (state.activeFilters.sortOwnedFirst) {
        agentsToRender.sort((a, b) => {
            const aOwned = state.myCharacters.includes(a.id);
            const bOwned = state.myCharacters.includes(b.id);
            if (aOwned !== bOwned) {
                return aOwned ? -1 : 1;
            }
            return 0;
        });
    }

    if (agentsToRender.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-[var(--text-secondary)] py-10">該当するエージェントが見つかりません。</p>`; return;
    }

    const fragment = document.createDocumentFragment();
    agentsToRender.forEach(agent => {
        const card = document.createElement('div');
        const isOwned = state.myCharacters.includes(agent.id);
        const isCompared = state.comparisonList.includes(agent.id);

        let cardClass = 'card';
        if (isCompared) cardClass += ' agent-compare-selected';
        if (isOwned) cardClass += ' is-owned';

        const attributes = agent.attributes || [agent.attribute];
        const attributeTags = attributes.map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join('');
        const iconUrl = agent.imageUrls?.style1?.['2d'];
        const iconHtml = iconUrl
    ? `<img src="${iconUrl}" alt="${agent.name}" class="w-full h-full object-cover" loading="lazy" decoding="async">`
    : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-2xl font-black text-[var(--text-secondary)] opacity-20 select-none">${agent.name.charAt(0)}</span></div>`;
        card.innerHTML = `
            <div tabindex="0" data-agent-id="${agent.id}" class="agent-card-body p-4 cursor-pointer flex-1 flex flex-col focus-visible:outline-none">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-4">
                       <div class="icon-container">${iconHtml}</div>
                       <div>
                         <h3 class="text-lg font-bold text-[var(--text-primary)]">${agent.name}</h3>
                         <span class="px-3 py-1 text-xs font-bold rounded-full ${constants.rarityClasses[agent.rarity]}">${agent.rarity}</span>
                       </div>
                    </div>
                </div>
                <div class="mt-auto pt-3 flex items-end justify-between">
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center flex-wrap gap-2 text-xs font-medium">${attributeTags}<span class="tag role-tag role-${agent.role}">${agent.role}</span></div>
                        <div class="flex items-center flex-wrap gap-2 text-xs font-medium"><span class="tag faction-tag">${agent.faction}</span></div>
                    </div>
                    <button data-agent-id="${agent.id}" title="比較リストに追加/削除" class="compare-btn p-2 rounded-full bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors interactive-scale">
                        <svg class="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"></path></svg>
                    </button>
                </div>
            </div>`;
        card.className = `bg-[var(--bg-secondary)] rounded-xl shadow-lg ${cardClass}`;
        fragment.appendChild(card);
    });

    grid.appendChild(fragment);

    grid.addEventListener('click', (e) => {
        const cardBody = e.target.closest('.agent-card-body');
        const compareBtn = e.target.closest('.compare-btn');
        if (compareBtn) {
            e.stopPropagation();
            toggleAgentComparison(compareBtn.dataset.agentId);
        } else if (cardBody) {
            showAgentModal(cardBody.dataset.agentId);
        }
    });
}

export async function createCharts() {
    try {
        await loadChartJs(); // チャート作成前にライブラリを読み込む
    } catch (error) {
        console.error("Chart.jsの読み込みに失敗しました。", error);
        return; // 読み込み失敗時はチャート作成を中止
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? 'rgba(249, 250, 251, 0.8)' : 'rgba(71, 85, 105, 0.8)';
    const gridColor = isDark ? 'rgba(55, 65, 81, 0.3)' : 'rgba(226, 232, 240, 0.3)';
    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;

    const roleCtx = document.getElementById('role-chart')?.getContext('2d');
    const attributeCtx = document.getElementById('attribute-chart')?.getContext('2d');
    if (!roleCtx || !attributeCtx) return;

    const roleCounts = state.allAgents.reduce((acc, agent) => { acc[agent.role] = (acc[agent.role] || 0) + 1; return acc; }, {});

    const attributeCounts = state.allAgents.reduce((acc, agent) => {
        const attributes = agent.attributes || [agent.attribute];
        attributes.forEach(attr => { if (attr) acc[attr] = (acc[attr] || 0) + 1; });
        return acc;
    }, {});

    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } } };

    if(state.roleChart) state.roleChart.destroy();
    state.roleChart = new Chart(roleCtx, { type: 'doughnut', data: {
        labels: Object.keys(roleCounts),
        datasets: [{ data: Object.values(roleCounts), backgroundColor: Object.keys(roleCounts).map(role => constants.roleColors[role]), borderWidth: 0 }]
    }, options: chartOptions });

    if(state.attributeChart) state.attributeChart.destroy();
    state.attributeChart = new Chart(attributeCtx, { type: 'doughnut', data: {
        labels: Object.keys(attributeCounts),
        datasets: [{ data: Object.values(attributeCounts), backgroundColor: Object.keys(attributeCounts).map(attr => (constants.attributeColors[attr] || '').startsWith('linear') ? '#ccc' : constants.attributeColors[attr]), borderWidth: 0 }]
    }, options: chartOptions });
}
