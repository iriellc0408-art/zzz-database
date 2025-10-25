// js/features/discs.js
import { state } from '../main.js';
import { createCustomSelect } from '../ui/components.js';
import { showDiscModal } from '../ui/modals.js';

export function initDiscsPage() {
    document.getElementById('content-wrapper').innerHTML = `
        <div id="filters-container-parent" class="bg-[var(--bg-secondary)] p-4 rounded-xl shadow-lg mb-6 card">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="disc-filters-container"></div>
        </div>
        <div class="flex items-center justify-end mb-4">
            <div id="sort-controls-container" class="flex items-center gap-2"></div>
        </div>
        <div id="disc-list" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"></div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
            <div class="bg-[var(--bg-secondary)] p-4 sm:p-6 rounded-xl shadow-md card">
                <h3 class="text-xl font-semibold text-center mb-4 text-[var(--text-secondary)]">メインステータス成長値</h3>
                <div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="text-xs text-[var(--text-secondary)] uppercase bg-[var(--bg-tertiary)]"><tr><th class="px-4 py-3">ステータス</th><th class="px-4 py-3 whitespace-nowrap">初期値</th><th class="px-4 py-3 whitespace-nowrap">上昇値</th><th class="px-4 py-3">最大値(Lv.5)</th></tr></thead><tbody id="main-stats-table"></tbody></table></div>
            </div>
            <div class="bg-[var(--bg-secondary)] p-4 sm:p-6 rounded-xl shadow-md card">
                <h3 class="text-xl font-semibold text-center mb-4 text-[var(--text-secondary)]">サブステータス成長値</h3>
                <div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="text-xs text-[var(--text-secondary)] uppercase bg-[var(--bg-tertiary)]"><tr><th class="px-4 py-3">ステータス</th><th class="px-4 py-3">初期値</th><th class="px-4 py-3">1ヒット毎</th></tr></thead><tbody id="sub-stats-table"></tbody></table></div>
            </div>
        </div>`;
    setupDiscFilters();
    renderDiscs();
    renderStatGrowthTables();
}

export function setupDiscFilters() {
    const container = document.getElementById('disc-filters-container');
    if (!container) return;

    const allRoles = [...new Set(state.allDiscs.flatMap(d => d.roles))].sort();
    const allAttributes = [...new Set(state.allDiscs.flatMap(d => d.compatibleAttributes || []))].sort();

    container.innerHTML = `<input type="text" id="disc-search" placeholder="名前・効果で検索..." class="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent text-[var(--text-primary)]">`;

    const roleSelect = document.createElement('select');
    roleSelect.id = 'disc-role-filter';
    roleSelect.innerHTML = `<option value="all">全役割</option>` + allRoles.map(o => `<option value="${o}">${o}</option>`).join('');
    roleSelect.addEventListener('change', () => { state.activeFilters.role = roleSelect.value; renderDiscs(); });
    container.appendChild(createCustomSelect(roleSelect));
    state.activeFilters.role = 'all';

    const attrSelect = document.createElement('select');
    attrSelect.id = 'disc-attribute-filter';
    attrSelect.innerHTML = `<option value="all">全属性</option>` + allAttributes.map(o => `<option value="${o}">${o}</option>`).join('');
    attrSelect.addEventListener('change', () => { state.activeFilters.attribute = attrSelect.value; renderDiscs(); });
    container.appendChild(createCustomSelect(attrSelect));
    state.activeFilters.attribute = 'all';

    const searchInput = document.getElementById('disc-search');
    searchInput.addEventListener('input', (e) => {
        state.activeFilters.searchTerm = e.target.value.toLowerCase();
        renderDiscs();
    });
    state.activeFilters.searchTerm = '';

    const sortContainer = document.getElementById('sort-controls-container');
    const sortSelect = document.createElement('select');
    sortSelect.id = 'sort-by';
    sortSelect.innerHTML = `
        <option value="releaseDate">実装順</option>
        <option value="name">名前順</option>
    `;
    sortSelect.addEventListener('change', (e) => { state.activeFilters.sortBy = e.target.value; renderDiscs(); });
    sortContainer.appendChild(createCustomSelect(sortSelect));
    state.activeFilters.sortBy = 'releaseDate';

    const orderButton = document.createElement('button');
    orderButton.id = 'sort-order-btn';
    orderButton.className = 'p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] text-[var(--text-secondary)] transition-colors interactive-scale';
    orderButton.addEventListener('click', () => {
        state.activeFilters.sortOrder = state.activeFilters.sortOrder === 'desc' ? 'asc' : 'desc';
        renderDiscs();
    });
    sortContainer.appendChild(orderButton);
    state.activeFilters.sortOrder = 'desc';
}

export function renderDiscs() {
    const list = document.getElementById('disc-list');
    if(!list) return;
    list.innerHTML = '';

    const orderButton = document.getElementById('sort-order-btn');
    if(orderButton){
        orderButton.innerHTML = state.activeFilters.sortOrder === 'desc'
            ? `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v10.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3.75A.75.75 0 0110 3z" clip-rule="evenodd"></path></svg>`
            : `<svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.56l-3.22 3.22a.75.75 0 11-1.06-1.06l4.5-4.5a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L10.75 5.56v10.69A.75.75 0 0110 17z" clip-rule="evenodd"></path></svg>`;
    }

    let filteredDiscs = state.allDiscs.filter(d =>
        (d.name.toLowerCase().includes(state.activeFilters.searchTerm) || d.set2.toLowerCase().includes(state.activeFilters.searchTerm) || d.set4.toLowerCase().includes(state.activeFilters.searchTerm)) &&
        (state.activeFilters.role === 'all' || d.roles.includes(state.activeFilters.role)) &&
        (state.activeFilters.attribute === 'all' || (d.compatibleAttributes && d.compatibleAttributes.includes(state.activeFilters.attribute)))
    );

    const sorter = (a, b) => {
        const order = state.activeFilters.sortOrder === 'asc' ? 1 : -1;
        if (state.activeFilters.sortBy === 'releaseDate') {
            return (new Date(a.releaseDate) - new Date(b.releaseDate)) * order;
        }
        return a.name.localeCompare(b.name, 'ja') * order;
    };
    filteredDiscs.sort(sorter);

    if (filteredDiscs.length === 0) {
        list.innerHTML = `<p class="col-span-full text-center text-[var(--text-secondary)] py-10">該当するディスクが見つかりません。</p>`; return;
    }

    const fragment = document.createDocumentFragment();
    filteredDiscs.forEach(d => {
        const card = document.createElement('div');
        card.className = 'bg-[var(--bg-secondary)] rounded-xl shadow-lg p-5 transition-all card flex flex-col cursor-pointer';
        card.dataset.discName = d.name;

        const attributeTags = (d.compatibleAttributes || []).map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join('');
        const iconHtml = d.iconUrl
            ? `<img src="${d.iconUrl}" alt="${d.name}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-lg font-black text-[var(--text-secondary)] opacity-20 select-none">${d.name.charAt(0)}</span></div>`;

        card.innerHTML = `
            <div class="flex items-center gap-4 mb-3">
                 <div class="small-icon-container">${iconHtml}</div>
                <h3 class="text-xl font-bold text-[var(--text-primary)]">${d.name}</h3>
            </div>
            <div class="space-y-2 text-sm flex-1">
                <div class="bg-[var(--bg-tertiary)] p-3 rounded-lg">
                    <p class="font-semibold text-[var(--text-secondary)]">2セット効果:</p>
                    <p class="line-clamp-2">${d.set2}</p>
                </div>
                <div class="p-3 rounded-lg" style="background-color: oklch(from var(--text-accent) l c h / 0.1);">
                    <p class="font-semibold" style="color: var(--text-accent);">4セット効果:</p>
                    <p class="line-clamp-2 text-[var(--text-primary)]">${d.set4}</p>
                </div>
            </div>
            <div class="pt-4 mt-auto space-y-2">
                <div class="text-xs font-medium"><span class="font-bold text-[var(--text-secondary)]">適合役割: </span><div class="flex flex-wrap gap-1 mt-1">${d.roles.map(r => `<span class="tag role-tag role-${r}">${r}</span>`).join(' ')}</div></div>
                ${attributeTags ? `<div class="text-xs font-medium"><span class="font-bold text-[var(--text-secondary)]">適合属性: </span><div class="flex flex-wrap gap-1 mt-1">${attributeTags}</div></div>` : ''}
            </div>`;
        fragment.appendChild(card);
    });
    list.appendChild(fragment);

    list.addEventListener('click', e => {
        const card = e.target.closest('.card');
        if (card && card.dataset.discName) {
            showDiscModal(card.dataset.discName);
        }
    });
}

export function renderStatGrowthTables() {
    const mainTable = document.getElementById('main-stats-table');
    const subTable = document.getElementById('sub-stats-table');
    if(!mainTable || !subTable) return;

    mainTable.innerHTML = state.mainStatsGrowth.map(s => {
        const isPercent = s.name.includes('%');
        let perHitText = '';
        if (Array.isArray(s.perHit)) {
            const uniqueHits = [...new Set(s.perHit)];
            perHitText = uniqueHits.join(' / ');
        } else {
            perHitText = s.perHit;
        }

        return `
        <tr class="border-b border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]">
            <th class="px-4 py-3 font-medium whitespace-nowrap">${s.name}</th>
            <td class="px-4 py-3 whitespace-nowrap">${s.initial}${isPercent ? '%' : ''}</td>
            <td class="px-4 py-3 whitespace-nowrap">${perHitText}${isPercent ? '%' : ''}</td>
            <td class="px-4 py-3">${s.max}${isPercent ? '%' : ''}</td>
        </tr>`
    }).join('');

    subTable.innerHTML = state.subStatsGrowth.map(s => `
        <tr class="border-b border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]">
            <th class="px-4 py-3 font-medium whitespace-nowrap">${s.name}</th>
            <td class="px-4 py-3">${s.initial}${s.name.includes('%') ? '%' : ''}</td>
            <td class="px-4 py-3">${s.perHit}${s.name.includes('%') ? '%' : ''}</td>
        </tr>`).join('');
}
