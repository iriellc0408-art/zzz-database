// js/features/w-engines.js
import { state } from '../main.js';
import { constants } from '../constants.js';
import { createCustomSelect, showToast } from '../ui/components.js';
import { showWEngineModal, showMyWEnginesModal, showLoginModal } from '../ui/modals.js';

export function initWEnginesPage() {
    document.getElementById('header-actions').innerHTML = `<button id="my-wengines-btn" class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition interactive-scale">マイ音動機管理</button>`;
    document.getElementById('content-wrapper').innerHTML = `
        <div id="filters-container-parent" class="bg-[var(--bg-secondary)] p-4 rounded-xl shadow-lg mb-6 card">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" id="wEngine-filters-container"></div>
        </div>
        <div class="flex items-center justify-end mb-4">
            <div id="sort-controls-container" class="flex items-center gap-2"></div>
        </div>
        <div id="wEngine-list" class="space-y-6"></div>`;

    document.getElementById('my-wengines-btn').addEventListener('click', handleMyWEnginesClick);
    setupWEngineFilters();
    renderWEngines();
}

function handleMyWEnginesClick() {
    if (!state.currentUser) {
        showLoginModal();
        showToast('マイ音動機管理機能を利用するにはログインが必要です。', 'bg-blue-500');
    } else {
        showMyWEnginesModal();
    }
}

export function setupWEngineFilters() {
    const uniqueAttributes = [...new Set(state.allWEngines.flatMap(w => w.compatibleAttributes || []))].sort();
    const uniqueTypes = ['限定S級', '恒常S級', '限定A級', '恒常A級', 'B級'];
    const filters = {
        type: { label: '全ランク', options: uniqueTypes },
        role: { label: '全役割', options: [...new Set(state.allWEngines.map(w => w.role))].sort() },
        attribute: { label: '全適合属性', options: uniqueAttributes }
    };
    const container = document.getElementById('wEngine-filters-container');
    if (!container) return;
    container.innerHTML = `<input type="text" id="wEngine-search" placeholder="名前・モチーフで検索..." class="col-span-1 sm:grid-cols-2 lg:col-span-2 w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent text-[var(--text-primary)]">`;

    for (const key in filters) {
        const select = document.createElement('select');
        select.id = `wEngine-${key}-filter`;
        select.innerHTML = `<option value="all">${filters[key].label}</option>` + filters[key].options.map(o => `<option value="${o}">${o}</option>`).join('');
        select.addEventListener('change', () => {
            state.activeFilters[key] = select.value;
            renderWEngines();
        });
        container.appendChild(createCustomSelect(select));
        state.activeFilters[key] = 'all';
    }

    const searchInput = document.getElementById('wEngine-search');
    searchInput.addEventListener('input', (e) => { state.activeFilters.searchTerm = e.target.value.toLowerCase(); renderWEngines(); });
    state.activeFilters.searchTerm = '';
    state.activeFilters.attribute = 'all';

    const sortContainer = document.getElementById('sort-controls-container');
    const sortSelect = document.createElement('select');
    sortSelect.id = 'sort-by';
    sortSelect.innerHTML = `
        <option value="releaseDate">実装順</option>
        <option value="rank">レアリティ順</option>
        <option value="name">名前順</option>
    `;
    sortSelect.addEventListener('change', (e) => { state.activeFilters.sortBy = e.target.value; renderWEngines(); });
    sortContainer.appendChild(createCustomSelect(sortSelect));
    state.activeFilters.sortBy = 'releaseDate';

    const orderButton = document.createElement('button');
    orderButton.id = 'sort-order-btn';
    orderButton.className = 'p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] text-[var(--text-secondary)] transition-colors interactive-scale';
    orderButton.addEventListener('click', () => {
        state.activeFilters.sortOrder = state.activeFilters.sortOrder === 'desc' ? 'asc' : 'desc';
        renderWEngines();
    });
    sortContainer.appendChild(orderButton);
    state.activeFilters.sortOrder = 'desc';
}

export function renderWEngines() {
    const list = document.getElementById('wEngine-list');
    if(!list) return;
    list.innerHTML = '';

    const orderButton = document.getElementById('sort-order-btn');
    if(orderButton){
        orderButton.innerHTML = state.activeFilters.sortOrder === 'desc'
            ? `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v10.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3.75A.75.75 0 0110 3z" clip-rule="evenodd"></path></svg>`
            : `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.56l-3.22 3.22a.75.75 0 11-1.06-1.06l4.5-4.5a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L10.75 5.56v10.69A.75.75 0 0110 17z" clip-rule="evenodd"></path></svg>`;
    }

    let filteredEngines = state.allWEngines.filter(w =>
        (state.activeFilters.type === 'all' || w.type === state.activeFilters.type) &&
        (state.activeFilters.role === 'all' || w.role === state.activeFilters.role) &&
        (state.activeFilters.attribute === 'all' || (w.compatibleAttributes && w.compatibleAttributes.includes(state.activeFilters.attribute))) &&
        (w.name.toLowerCase().includes(state.activeFilters.searchTerm) || (w.motif && w.motif.toLowerCase().includes(state.activeFilters.searchTerm)))
    );

    const sorter = (a, b) => {
        const order = state.activeFilters.sortOrder === 'asc' ? 1 : -1;
        const sortBy = state.activeFilters.sortBy;

        if (sortBy === 'releaseDate') {
            return (new Date(a.releaseDate) - new Date(b.releaseDate)) * order;
        }
        if (sortBy === 'rank') {
            const rankOrder = { 'S': 2, 'A': 1, 'B': 0 };
            if (rankOrder[a.rank] !== rankOrder[b.rank]) {
                return (rankOrder[b.rank] - rankOrder[a.rank]) * order; // S > A > B
            }
        }
        return a.name.localeCompare(b.name, 'ja') * order;
    };
    filteredEngines.sort(sorter);

    if (filteredEngines.length === 0) {
        list.innerHTML = `<p class="text-center text-[var(--text-secondary)] py-10">該当する音動機が見つかりません。</p>`; return;
    }

    const fragment = document.createDocumentFragment();
    filteredEngines.forEach(w => {
        const card = document.createElement('div');
        const isOwned = state.myWEngines.includes(w.name);
        let cardClass = 'bg-[var(--bg-secondary)] rounded-xl shadow-lg p-5 transition-all card cursor-pointer';
        if (isOwned) {
            cardClass += ' is-owned';
        }
        card.className = cardClass;
        card.dataset.wengineName = w.name;

        const attributeTags = (w.compatibleAttributes || []).filter(attr => attr !== '汎用').map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join('');
        const iconHtml = w.iconUrl
            ? `<img src="${w.iconUrl}" alt="${w.name}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-lg font-black text-[var(--text-secondary)] opacity-20 select-none">${w.name.charAt(0)}</span></div>`;

        card.innerHTML = `
            <div class="flex items-start gap-4 mb-3">
                <div class="small-icon-container">${iconHtml}</div>
                <div class="flex-1">
                     <div class="flex justify-between items-start">
                         <div>
                            <h3 class="text-xl font-bold text-[var(--text-primary)]">${w.name}</h3>
                            ${w.motif && w.motif !== '-' ? `<p class="text-xs text-amber-600 font-semibold">モチーフ: ${w.motif}</p>` : ''}
                         </div>
                         <div class="flex items-center gap-2 flex-shrink-0">
                             <span class="tag role-tag role-${w.role}">${w.role}</span>
                             <span class="text-xs font-bold px-3 py-1 rounded-full ${constants.rarityClasses[w.rank]}">${w.type}</span>
                         </div>
                     </div>
                     <div class="text-sm text-[var(--text-secondary)] mt-3 border-t border-[var(--border-primary)] pt-3">
                        <p class="font-bold text-[var(--text-primary)]">${w.effectName || '追加効果'}</p>
                        <p class="line-clamp-2">${w.effect}</p>
                     </div>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2">
                <div class="flex justify-between items-center text-xs bg-[var(--bg-tertiary)] p-2 rounded-lg"><span class="text-[var(--text-secondary)]">${w.baseStat.name}</span><span class="font-semibold text-[var(--text-primary)]">${w.baseStat.value}</span></div>
                <div class="flex justify-between items-center text-xs bg-[var(--bg-tertiary)] p-2 rounded-lg"><span class="text-[var(--text-secondary)]">${w.advStat.name}</span><span class="font-semibold text-[var(--text-primary)]">${w.advStat.value}</span></div>
            </div>
            ${attributeTags ? `<div class="mt-3 pt-3 border-t border-[var(--border-primary)]"><div class="flex flex-wrap gap-2">${attributeTags}</div></div>` : ''}
            `;
        fragment.appendChild(card);
    });
    list.appendChild(fragment);

    list.addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (card && card.dataset.wengineName) {
            showWEngineModal(card.dataset.wengineName);
        }
    });
}
