// js/features/rankings.js
import { state } from '../main.js';
import { constants } from '../constants.js';
import { createCustomSelect } from '../ui/components.js';
import { showAgentModal, showWEngineModal } from '../ui/modals.js';

export function initRankingsPage() {
    document.getElementById('content-wrapper').innerHTML = `
        <div id="filters-container-parent" class="bg-[var(--bg-secondary)] p-4 sm:p-6 rounded-xl shadow-lg mb-6 card">
            <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-4">ランキング</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-bold text-[var(--text-secondary)] mb-1">評価基準</label>
                    <div id="ranking-criteria-select-wrapper"></div>
                </div>
            </div>
        </div>
        <div id="ranking-list" class="space-y-4"></div>`;
    setupRankingFilters();
    renderRankings();
}

export function setupRankingFilters() {
    const container = document.getElementById('ranking-criteria-select-wrapper');
    if (!container) return;
    const criteriaSelect = document.createElement('select');
    criteriaSelect.id = `ranking-criteria-filter`;
    criteriaSelect.innerHTML = Object.keys(state.rankingData).map(key => `<option value="${key}">${state.rankingData[key].name}</option>`).join('');
    criteriaSelect.addEventListener('change', () => {
        state.activeFilters.rankingCriteria = criteriaSelect.value;
        renderRankings();
    });
    container.appendChild(createCustomSelect(criteriaSelect));
    state.activeFilters.rankingCriteria = Object.keys(state.rankingData)[0];
}

export function renderRankings() {
    const listContainer = document.getElementById('ranking-list');
    if(!listContainer) return;

    const criteriaKey = state.activeFilters.rankingCriteria;
    const rankingInfo = state.rankingData[criteriaKey];
    if(!rankingInfo) {
        listContainer.innerHTML = `<p class="text-center text-[var(--text-secondary)] py-10">ランキングデータが見つかりません。</p>`;
        return;
    }

    const itemsToRender = rankingInfo.list;
    const type = rankingInfo.type;

    let html = '';
    itemsToRender.forEach((item, index) => {
        const rank = index + 1;
        let rankColor = 'text-gray-500';
        if (rank === 1) rankColor = 'text-amber-400';
        if (rank === 2) rankColor = 'text-slate-400';
        if (rank === 3) rankColor = 'text-amber-600';

        let data, cardHtml = '';
        let itemIdentifier = '';

        if (type === 'agent') {
            data = state.allAgents.find(a => a.id === item.id);
            if (!data) return;
            itemIdentifier = `data-agent-id="${data.id}"`;

            const attributes = data.attributes || [data.attribute];
            const attributeTags = attributes.map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join('');
            const iconUrl = data.imageUrls?.style1?.['2d'];
            const iconHtml = iconUrl
                ? `<img src="${iconUrl}" alt="${data.name}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-xl font-black text-[var(--text-secondary)] opacity-20 select-none">${data.name.charAt(0)}</span></div>`;

            cardHtml = `
                <div class="flex-1 flex items-center gap-4">
                     <div class="icon-container w-12 h-12">${iconHtml}</div>
                     <div>
                         <p class="font-bold text-lg text-[var(--text-primary)]">${data.name}</p>
                         <div class="flex items-center gap-2 mt-1">${attributeTags}<span class="tag role-tag role-${data.role}">${data.role}</span><span class="tag faction-tag">${data.faction}</span></div>
                     </div>
                </div>
                <p class="text-sm text-[var(--text-secondary)] w-full md:w-1/3">${item.reason}</p>`;
        } else if (type === 'w-engine') {
            data = state.allWEngines.find(w => w.name === item.id);
            if (!data) return;
            itemIdentifier = `data-wengine-name="${data.name}"`;

            const iconHtml = data.iconUrl
                ? `<img src="${data.iconUrl}" alt="${data.name}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-lg font-black text-[var(--text-secondary)] opacity-20 select-none">${data.name.charAt(0)}</span></div>`;

            cardHtml = `
                 <div class="flex-1 flex items-center gap-4">
                      <div class="small-icon-container">${iconHtml}</div>
                      <div>
                          <p class="font-bold text-lg text-[var(--text-primary)]">${data.name}</p>
                          <div class="flex items-center gap-2 mt-1">
                              <span class="px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[data.rank]}">${data.rank}</span>
                              <span class="tag role-tag role-${data.role}">${data.role}</span>
                          </div>
                      </div>
                 </div>
                 <p class="text-sm text-[var(--text-secondary)] w-full md:w-1/3">${item.reason}</p>`;
        }

        html += `
            <div class="bg-[var(--bg-secondary)] rounded-xl shadow-lg p-4 flex flex-col md:flex-row items-center gap-4 card cursor-pointer" ${itemIdentifier}>
                <div class="font-black text-4xl w-12 text-center ${rankColor} flex-shrink-0">${rank}</div>
                <div class="w-full flex flex-col md:flex-row items-start md:items-center gap-4">${cardHtml}</div>
            </div>`;
    });

    listContainer.innerHTML = html;

    // Event Delegation for clicking ranking items
    listContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.card');
        if (!item) return;

        if (item.dataset.agentId) {
            showAgentModal(item.dataset.agentId);
        } else if (item.dataset.wengineName) {
            showWEngineModal(item.dataset.wengineName);
        }
    });
}
