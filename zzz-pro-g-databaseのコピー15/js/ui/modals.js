// js/ui/modals.js
import { state } from '../main.js';
import { constants } from '../constants.js';
import { handleEmailLogin, signInWithGoogle, handleSignUp, saveMyCharacters, saveMyBuilds as saveMyBuildsToDB, saveMyWEngines, saveMyDiscs } from '../firebase-auth.js';
import { createCustomSelect, showToast, closeAllSelects } from './components.js';
import { selectAndApplyTheme } from './theme.js';

let modalHistory = [];
// --- State for Disc Creator ---
let activeCreatorDiscs = new Set();
let creatorDiscStates = {};

export function openModal(modalHtml, callback, options = {}) {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    if (!options.isFromHistory) {
        if (options.historyInfo) {
            if (options.isChild) {
                modalHistory.push(options.historyInfo);
            } else {
                modalHistory = [options.historyInfo];
            }
        } else {
            modalHistory = [];
        }
    }

    modalContainer.innerHTML = modalHtml;
    if (modalContainer.classList.contains('hidden')) {
        modalContainer.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    const modalContent = modalContainer.querySelector('.modal-content');
    if (options.isChild) {
        modalContent.classList.add('child-modal');
    }

    modalContent.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-container')) {
            closeAllSelects();
        }
    });

    requestAnimationFrame(() => {
        modalContainer.classList.add('active');
        if (callback && modalContent) {
            callback(modalContent);
        }
    });
}

export function closeModal(forceCloseAll = false) {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer || !modalContainer.classList.contains('active')) return;

    modalContainer.classList.remove('active');

    if (forceCloseAll) {
        modalHistory = [];
    } else {
        modalHistory.pop();
    }

    setTimeout(() => {
        if (modalHistory.length > 0 && !forceCloseAll) {
            const previousModal = modalHistory[modalHistory.length - 1];
            _restorePreviousModal(previousModal);
        } else {
            modalContainer.classList.add('hidden');
            modalContainer.innerHTML = '';
            document.body.style.overflow = '';
            modalHistory = [];
        }
    }, 250);
}

function _restorePreviousModal(modalState) {
    if (!modalState) return;
    const options = { isFromHistory: true, isChild: modalHistory.length > 1 };
    switch (modalState.type) {
        case 'agent':
            showAgentModal(modalState.id, options);
            break;
            case 'disc':
                showDiscModal(modalState.id, options);
                break;
            case 'w-engine':
                showWEngineModal(modalState.id, options);
                break;
            case 'comparison':
                showComparisonModal(options);
                break;
    }
}


function setupModalTabs(modal) {
    const tabs = modal.querySelectorAll('.agent-modal-tab');
    const panels = modal.querySelectorAll('.agent-modal-tab-panel');
    if (!tabs.length || !panels.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentActiveTab = modal.querySelector('.agent-modal-tab.active');
            const currentActivePanel = modal.querySelector('.agent-modal-tab-panel.active');
            if (currentActiveTab) currentActiveTab.classList.remove('active');
            if (currentActivePanel) currentActivePanel.classList.remove('active');

            tab.classList.add('active');
            const targetPanelId = tab.getAttribute('data-tab');
            const targetPanel = modal.querySelector(`#${targetPanelId}`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

// --- Specific Modals ---
export function openFilterModal(title, options, selectedValues, onSave) {
    const modalHtml = `
        <div class="modal-content w-full max-w-md h-auto flex flex-col glass-effect child-modal" onclick="event.stopPropagation()">
            <div class="p-6 border-b border-[var(--border-primary)] flex justify-between items-center">
                <h2 class="text-2xl font-bold text-[var(--text-primary)]">${title}で絞り込み</h2>
                <button class="modal-close-btn text-3xl">&times;</button>
            </div>
            <div id="filter-options-container" class="p-6 grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto custom-scroll">
                ${options.map(option => `
                    <label class="cursor-pointer block bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] border-2 ${selectedValues.includes(option) ? 'border-amber-400' : 'border-transparent'} rounded-lg p-2 transition-all duration-200">
                        <input type="checkbox" value="${option}" class="hidden" ${selectedValues.includes(option) ? 'checked' : ''}>
                        <div class="flex items-center justify-center">
                            <span class="font-semibold text-[var(--text-primary)] text-sm">${option}</span>
                        </div>
                    </label>
                `).join('')}
            </div>
            <div class="modal-footer flex gap-4">
                 <button id="clear-filter-btn" class="flex-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] text-[var(--text-primary)] font-bold py-3 px-4 rounded-lg transition">クリア</button>
                <button id="save-filter-btn" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg transition">適用</button>
            </div>
        </div>
    `;
    openModal(modalHtml, (modal) => {
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#save-filter-btn').addEventListener('click', () => {
            const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
            onSave(selected);
            closeModal();
        });
        modal.querySelector('#clear-filter-btn').addEventListener('click', () => {
            checkboxes.forEach(cb => {
                cb.checked = false;
                cb.parentElement.classList.remove('border-amber-400');
                cb.parentElement.classList.add('border-transparent');
            });
        });
        modal.addEventListener('change', e => {
            if (e.target.type === 'checkbox') {
                e.target.parentElement.classList.toggle('border-amber-400', e.target.checked);
                e.target.parentElement.classList.toggle('border-transparent', !e.target.checked);
            }
        });
    }, { isChild: true });
}


export function showLoginModal() {
    const modalHtml = `
        <div class="modal-content w-full max-w-md h-auto flex flex-col glass-effect" onclick="event.stopPropagation()">
            <div class="p-6 border-b border-[var(--border-primary)] flex justify-between items-center">
                <h2 class="text-2xl font-bold text-[var(--text-primary)]">ログイン</h2>
                <button class="modal-close-btn text-3xl">&times;</button>
            </div>
            <div class="p-8 space-y-6">
                <button id="google-signin-btn" class="w-full flex items-center justify-center gap-3 font-semibold py-3 px-4 rounded-lg transition btn-high-contrast interactive-scale">
                   <svg class="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.02,35.622,44,30.138,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                   Googleでログイン
                </button>
                <div class="relative"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-[var(--border-primary)]"></div></div><div class="relative flex justify-center text-sm"><span class="px-2 bg-[var(--bg-secondary)] text-[var(--text-secondary)]">または</span></div></div>
                <div id="auth-error" class="hidden text-sm text-red-500 bg-red-100 dark:bg-red-900/20 p-3 rounded-lg"></div>
                <form id="login-form" class="space-y-4">
                    <input type="email" id="email" placeholder="メールアドレス" class="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg text-[var(--text-primary)]" required>
                    <input type="password" id="password" placeholder="パスワード" class="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg text-[var(--text-primary)]" required>
                    <button type="submit" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300 interactive-scale">ログイン</button>
                    <p class="text-center text-sm">アカウントをお持ちでないですか？ <button type="button" id="signup-btn" class="font-semibold text-[var(--accent-blue)] hover:underline">新規登録</button></p>
                </form>
            </div>
        </div>`;
    openModal(modalHtml, (modal) => {
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#google-signin-btn').addEventListener('click', signInWithGoogle);
        modal.querySelector('#login-form').addEventListener('submit', handleEmailLogin);
        modal.querySelector('#signup-btn').addEventListener('click', handleSignUp);
    });
}

function handleCreatorStatChange(event) {
    const targetEl = event.target;
    const card = targetEl.closest('.disc-creator-card');
    if (!card) return;

    if (targetEl.classList.contains('remove-disc-form-btn')) {
        const idToRemove = parseInt(card.dataset.cardId, 10);
        if (activeCreatorDiscs.size > 1) {
            activeCreatorDiscs.delete(idToRemove);
            delete creatorDiscStates[idToRemove];
            card.remove();
        } else {
            showToast('最低1つのディスクが必要です。', 'bg-yellow-500');
        }
        return;
    }

    // Save state before updating UI
    saveCreatorCardState(card);
    updateAllCardValues(card);
}

function saveAllDiscs(modal) {
    const characterId = modal.querySelector('#my-disc-agent-select').value;
    const cards = modal.querySelectorAll('.disc-creator-card');
    let allValid = true;

    cards.forEach(card => saveCreatorCardState(card));

    const newDiscs = [];

    for (const id of activeCreatorDiscs) {
        const discData = creatorDiscStates[id];

        if (!discData.discName || !discData.discNum || !discData.mainStat) {
            showToast(`ディスク #${id} の必須項目（ディスク, 番号, メインステータス）が未入力です。`, 'bg-red-500');
            allValid = false;
            return;
        }

        const subStats = discData.subStats.filter(s => s.name);
        const totalHits = subStats.reduce((sum, s) => sum + s.hits, 0);

        if (totalHits > discData.opCount) {
             showToast(`ディスク #${id} のサブステ合計ヒット数が上限を超えています。`, 'bg-red-500');
             allValid = false;
             return;
        }

        newDiscs.push({
            id: `disc_${Date.now()}_${id}`,
            createdAt: Date.now(),
            characterId: characterId || null,
            customName: discData.customName,
            discName: discData.discName,
            discNum: discData.discNum,
            mainStat: discData.mainStat,
            opCount: discData.opCount,
            subStats: discData.subStats,
        });
    }

    if(allValid && newDiscs.length > 0) {
        state.myDiscs.push(...newDiscs);
        saveMyDiscs();
        showToast(`${newDiscs.length}個のディスクを保存しました。`);
        closeModal();
    }
}

export function showMyCharactersModal() {
    const sorter = (a, b) => {
        const order = state.activeFilters.sortOrder === 'asc' ? 1 : -1;
        const sortBy = state.activeFilters.sortBy || 'releaseVersion';

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

    const sortedAgents = [...state.allAgents].sort(sorter);

    const agentGridHtml = sortedAgents.map(agent => {
        const iconUrl = agent.imageUrls?.style1?.['2d'];
        const iconHtml = iconUrl ? `<img src="${iconUrl}" alt="${agent.name}" class="w-8 h-8 rounded-full object-cover">` : '';

        return `
        <label class="cursor-pointer block bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] border-2 ${state.myCharacters.includes(agent.id) ? 'border-amber-400' : 'border-transparent'} rounded-lg p-2 transition-all duration-200">
            <input type="checkbox" value="${agent.id}" class="hidden" ${state.myCharacters.includes(agent.id) ? 'checked' : ''}>
            <div class="flex items-center gap-3">
                ${iconHtml}
                <span class="font-semibold text-[var(--text-primary)] text-sm">${agent.name}</span>
                <span class="ml-auto px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[agent.rarity]}">${agent.rarity}</span>
            </div>
        </label>`;
    }).join('');

    const modalHtml = `
        <div class="modal-content w-full max-w-3xl h-full sm:h-auto sm:max-h-[80vh] flex flex-col">
            <div class="modal-header">
                <div class="flex-1">
                    <h2 class="text-2xl font-bold text-[var(--text-primary)]">マイキャラ管理</h2>
                    <p class="text-[var(--text-secondary)] mt-1 text-sm">所持しているエージェントを選択してください。</p>
                </div>
                <button class="modal-close-btn">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="modal-body grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 custom-scroll">${agentGridHtml}</div>
            <div class="modal-footer">
                <button id="save-chars-btn" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300">保存して閉じる</button>
            </div>
        </div>`;
    openModal(modalHtml, (modal) => {
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#save-chars-btn').addEventListener('click', () => saveMyCharacters(modal));
        modal.addEventListener('change', e => {
            if (e.target.type === 'checkbox') {
                e.target.parentElement.classList.toggle('border-amber-400', e.target.checked);
                e.target.parentElement.classList.toggle('border-transparent', !e.target.checked);
            }
        });
    });
}

export function showMyWEnginesModal() {
     const sorter = (a, b) => {
        const order = state.activeFilters.sortOrder === 'asc' ? 1 : -1;
        const sortBy = state.activeFilters.sortBy || 'releaseDate';

        if (sortBy === 'releaseDate') {
            return (new Date(a.releaseDate) - new Date(b.releaseDate)) * order;
        }
        if (sortBy === 'rank') {
            const rankOrder = { 'S': 2, 'A': 1, 'B': 0 };
            if (rankOrder[a.rank] !== rankOrder[b.rank]) {
                return (rankOrder[b.rank] - rankOrder[a.rank]) * order;
            }
        }
        return a.name.localeCompare(b.name, 'ja') * order;
    };
    const sortedWEngines = [...state.allWEngines].sort(sorter);

    const wEngineGridHtml = sortedWEngines.map(wEngine => {
        const iconUrl = wEngine.iconUrl;
        const iconHtml = iconUrl ? `<img src="${iconUrl}" alt="${wEngine.name}" class="w-8 h-8 rounded-md object-contain">` : '';
        return `
        <label class="cursor-pointer block bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] border-2 ${state.myWEngines.includes(wEngine.name) ? 'border-amber-400' : 'border-transparent'} rounded-lg p-2 transition-all duration-200">
            <input type="checkbox" value="${wEngine.name}" class="hidden" ${state.myWEngines.includes(wEngine.name) ? 'checked' : ''}>
            <div class="flex items-center gap-3">
                 ${iconHtml}
                <span class="font-semibold text-[var(--text-primary)] text-sm flex-1">${wEngine.name}</span>
                <span class="px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[wEngine.rank]}">${wEngine.rank}</span>
            </div>
        </label>`;
    }).join('');

    const modalHtml = `
        <div class="modal-content w-full max-w-4xl h-full sm:h-auto sm:max-h-[80vh] flex flex-col">
            <div class="modal-header">
                <div class="flex-1">
                    <h2 class="text-2xl font-bold text-[var(--text-primary)]">マイ音動機管理</h2>
                    <p class="text-[var(--text-secondary)] mt-1 text-sm">所持している音動機を選択してください。</p>
                </div>
                <button class="modal-close-btn">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="modal-body grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 custom-scroll">${wEngineGridHtml}</div>
            <div class="modal-footer">
                <button id="save-wengines-btn" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300">保存して閉じる</button>
            </div>
        </div>`;
    openModal(modalHtml, (modal) => {
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#save-wengines-btn').addEventListener('click', () => saveMyWEngines(modal));
        modal.addEventListener('change', e => {
            if (e.target.type === 'checkbox') {
                e.target.parentElement.classList.toggle('border-amber-400', e.target.checked);
                e.target.parentElement.classList.toggle('border-transparent', !e.target.checked);
            }
        });
    });
}

export function showMyBuildEditorModal(buildData) {
    showBuildCreatorModal(buildData);
}

export function showMyDiscEditorModal(setData) {
    showMyDiscCreatorModal(setData);
}

export function showComparisonModal(options = {}) {
    if (state.comparisonList.length < 2 && !options.isFromHistory) return;

    const historyInfo = { type: 'comparison' };
    const agentsToCompare = state.comparisonList.map(id => state.allAgents.find(a => a.id === id));

    const comparisonRows = [
        { label: 'レアリティ', key: 'rarity' }, { label: '属性', key: 'attribute' }, { label: '役割', key: 'role' },
        { label: '陣営', key: 'faction' }, { label: '概要', key: 'description' }, { label: '推奨音動機', key: 'wEngine' },
        { label: '目標ステータス', key: 'statGoals' }, { label: '推奨ディスクビルド', key: 'builds' }
    ];

    const formatStatGoals = (goals) => {
        if (!goals) return '<p class="text-sm text-[var(--text-secondary)]">情報なし</p>';
        const tiers = { theory: '理論値', ideal: '理想値', target: '目標値', compromise: '妥協値' };
        return Object.entries(tiers).map(([key, label]) => {
            const stats = goals[key];
            if (!stats) return '';
            return `<div class="mb-2"><strong class="text-amber-500">${label}</strong>: ${Object.entries(stats).map(([stat, value]) => `${stat} ${value}`).join(' / ')}</div>`;
        }).join('');
    };

    const formatBuilds = (builds) => {
        if (!builds || builds.length === 0) return '<div>情報なし</div>';
        return builds.map((build) => { // Show ALL builds
            const discsHtml = build.discBuild?.sets?.map(set => {
                const disc = state.allDiscs.find(d => d.name === set.name);
                if (!disc) return '';
                const iconHtml = disc.iconUrl ? `<img src="${disc.iconUrl}" alt="${disc.name}" class="w-full h-full object-cover">` : '';
                const setClass = `set-${set.count}`;
                return `
                <button data-disc-name="${set.name}" class="disc-build-button disc-link-btn ${setClass} w-full">
                    <div class="disc-build-icon !w-10 !h-10">${iconHtml}</div>
                    <div class="disc-build-info">
                        <p class="disc-build-name !text-base">${disc.name}</p>
                        <p class="disc-build-set ${setClass}">${set.count}セット効果</p>
                    </div>
                </button>`;
            }).join('') || 'N/A';
            return `<div class="bg-[var(--bg-tertiary)] p-3 rounded-lg mb-2">
                        <div class="space-y-2">${discsHtml}</div>
                        <p class="text-xs mt-2 text-[var(--text-secondary)]"><strong>編成:</strong> ${build.team?.composition}</p>
                    </div>`;
        }).join('');
    };


    const modalHtml = `
        <div class="modal-content w-full max-w-7xl h-full lg:h-auto lg:max-h-[90vh] flex flex-col">
            <div class="modal-header">
                <h2 class="text-2xl font-bold text-[var(--text-primary)]">エージェント比較</h2>
                <button class="modal-close-btn">
                   <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="overflow-x-auto custom-scroll flex-1">
                <table class="w-full text-left min-w-[1280px]">
                    <thead class="sticky top-0 bg-[var(--bg-secondary)] shadow-sm">
                        <tr>
                            <th class="p-4 w-[15%] font-semibold">項目</th>
                            ${agentsToCompare.map(agent => {
                                if (!agent) return '<th></th>';
                                const iconUrl = agent.imageUrls?.style1?.['2d'];
                                const iconHtml = iconUrl
                                    ? `<img src="${iconUrl}" alt="${agent.name}" class="w-full h-full object-cover">`
                                    : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-3xl font-black text-[var(--text-secondary)] opacity-20 select-none">${agent.name.charAt(0)}</span></div>`;
                                return `<th class="p-4 text-center w-[28.3%]"><div class="flex flex-col items-center gap-2"><div class="icon-container w-16 h-16">${iconHtml}</div><span class="font-bold text-lg">${agent.name}</span></div></th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--border-primary)]">
                        ${comparisonRows.map(row => `
                            <tr class="hover:bg-[var(--bg-tertiary)]">
                                <td class="p-4 font-semibold align-top">${row.label}</td>
                                ${agentsToCompare.map(agent => {
                                    if (!agent) return '<td></td>';
                                    let value = agent[row.key];

                                    let displayValue = '';
                                    if (row.key === 'rarity') {
                                        let rankText = agent.type || (agent.rarity === 'S' ? '恒常S級' : 'A級');
                                        displayValue = `<span class="px-3 py-1 text-xs font-bold rounded-full ${constants.rarityClasses[value]}">${rankText}</span>`;
                                    } else if (row.key === 'attribute') {
                                        const attributes = agent.attributes || [agent.attribute];
                                        displayValue = attributes.map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join(' ');
                                    } else if (row.key === 'role' || row.key === 'faction') {
                                        const tagClass = row.key === 'role' ? 'role-tag' : 'faction-tag';
                                        displayValue = `<span class="tag ${tagClass} ${tagClass.split('-')[0]}-${value.replace(/\s/g, '')}">${value}</span>`;
                                    } else if (row.key === 'wEngine') {
                                        const wEngine = value ? state.allWEngines.find(w => w.name === value.motif?.name) : null;
                                        if (wEngine) {
                                            const iconHtml = wEngine.iconUrl ? `<img src="${wEngine.iconUrl}" alt="${wEngine.name}" class="w-full h-full object-cover">` : '';
                                            displayValue = `<button data-wengine-name="${wEngine.name}" class="w-engine-link-btn disc-build-button set-4 w-full">
                                                <div class="disc-build-icon !w-12 !h-12">${iconHtml}</div>
                                                <div class="disc-build-info">
                                                    <p class="disc-build-name !text-lg">${wEngine.name}</p>
                                                    <span class="px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[wEngine.rank]}">${wEngine.type}</span>
                                                </div>
                                            </button>`;
                                        } else {
                                             displayValue = `<p class="text-sm leading-relaxed">${value?.motif?.name || 'N/A'}</p>`;
                                        }
                                    } else if (row.key === 'statGoals') {
                                        displayValue = `<div class="text-xs leading-relaxed">${formatStatGoals(value)}</div>`;
                                    } else if (row.key === 'builds') {
                                        displayValue = `<div class="space-y-2">${formatBuilds(value)}</div>`;
                                    } else {
                                        displayValue = `<p class="text-sm leading-relaxed">${value || 'N/A'}</p>`;
                                    }
                                    return `<td class="p-4 align-top">${displayValue}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
        openModal(modalHtml, modal => {
            modal.querySelector('.modal-close-btn').addEventListener('click', () => closeModal(true));
            modal.querySelectorAll('.w-engine-link-btn, .disc-link-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const wengineName = e.currentTarget.dataset.wengineName;
                    const discName = e.currentTarget.dataset.discName;
                    if(wengineName) showWEngineModal(wengineName, { isChild: true });
                    if(discName) showDiscModal(discName, { isChild: true });
                });
            });
        }, { ...options, historyInfo });
    }

    export function showMyDiscCreatorModal(existingSet = null) {
        const isEditMode = existingSet !== null;
        const modalTitle = isEditMode ? 'ディスクセット編集' : '新規ディスクセット登録';
        const saveButtonText = isEditMode ? '変更を保存' : 'セットを保存';

        // Initialize state for the creator
        if (isEditMode && existingSet.discs) {
            creatorDiscStates = JSON.parse(JSON.stringify(existingSet.discs));
            activeCreatorDiscs = new Set(Object.keys(creatorDiscStates).map(Number));
        } else {
            creatorDiscStates = {};
            activeCreatorDiscs = new Set([1]); // Start with one disc by default
        }

        const modalHtml = `
            <div class="modal-content w-full max-w-4xl max-h-[95vh] flex flex-col" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2 class="text-2xl font-bold text-[var(--text-primary)]">${modalTitle}</h2>
                    <button class="modal-close-btn">&times;</button>
                </div>
                <div class="modal-body custom-scroll">
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div class="lg:col-span-1 space-y-4">
                            <div class="card p-4">
                                <label for="disc-set-name" class="block text-sm font-bold text-[var(--text-secondary)] mb-1">セット名 (任意)</label>
                                <input type="text" id="disc-set-name" placeholder="例: エレン会心特化セット" class="w-full p-2 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg" value="${isEditMode && existingSet.setName ? existingSet.setName : ''}">
                            </div>
                            <div class="card p-4" style="z-index: 10;">
                                 <label class="block text-sm font-bold text-[var(--text-secondary)] mb-2">ディスク番号</label>
                                 <div class="disc-selector-container">
                                    <div class="disc-selector-hexagon">
                                        ${[...Array(6)].map((_, i) => `
                                        <div class="disc-selector-circle-wrapper">
                                            <button class="disc-selector-circle ${activeCreatorDiscs.has(i + 1) ? 'active' : ''}" data-disc-num="${i + 1}">
                                                <span>${i + 1}</span>
                                            </button>
                                        </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="disc-creator-forms-container" class="lg:col-span-2 space-y-6"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="save-discs-btn" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg">${saveButtonText}</button>
                </div>
            </div>`;

        openModal(modalHtml, (modal) => {
            modal.querySelector('.disc-selector-container').addEventListener('click', (e) => {
                const button = e.target.closest('.disc-selector-circle');
                if (button) {
                    const discNum = parseInt(button.dataset.discNum, 10);
                    button.classList.toggle('active');
                    if (activeCreatorDiscs.has(discNum)) {
                        activeCreatorDiscs.delete(discNum);
                    } else {
                        activeCreatorDiscs.add(discNum);
                    }
                    renderDiscCreatorForms(modal);
                }
            });

            modal.querySelector('#save-discs-btn').addEventListener('click', () => saveDiscSet(modal, isEditMode ? existingSet.id : null));
            modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
            renderDiscCreatorForms(modal);
        });
    }


    function renderDiscCreatorForms(modal) {
        const container = modal.querySelector('#disc-creator-forms-container');

        // Save current state before re-rendering
        container.querySelectorAll('.disc-input-card').forEach(card => {
            const discNum = parseInt(card.dataset.cardId, 10);
            creatorDiscStates[discNum] = readCreatorCardState(card);
        });

        container.innerHTML = '';
        const sortedDiscs = [...activeCreatorDiscs].sort((a, b) => a - b);

        if (sortedDiscs.length === 0) {
            container.innerHTML = `<p class="text-center text-[var(--text-secondary)] pt-10">登録するディスク番号を選択してください。</p>`;
            return;
        }

        sortedDiscs.forEach(discNum => {
            const card = createDiscCreatorCard(discNum);
            container.appendChild(card);
        });

        // Re-attach event listeners
        const eventHandler = (e) => handleCreatorStatChange(e);
        container.removeEventListener('change', eventHandler);
        container.removeEventListener('input', eventHandler);
        container.removeEventListener('click', eventHandler);
        container.addEventListener('change', eventHandler);
        container.addEventListener('input', eventHandler);
        container.addEventListener('click', eventHandler);
    }


    function createDiscCreatorCard(discNum) {
        const card = document.createElement('div');
        card.className = 'card p-4 disc-input-card';
        card.dataset.cardId = discNum;
        const stateData = creatorDiscStates[discNum] || {};

        const discOptions = `<option value="">--- ディスク選択 ---</option>` + state.allDiscs
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
            .map(d => `<option value="${d.name}" data-icon="${d.iconUrl}" ${stateData.discName === d.name ? 'selected' : ''}>${d.name}</option>`).join('');

        const subStatOptions = state.subStatsGrowth.map(s => `<option value="${s.name}">${s.name}</option>`).join('');

        card.innerHTML = `
            <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 class="font-bold text-lg text-[var(--text-primary)]">ディスク ${discNum}</h3>
                <div class="w-full sm:w-2/3" id="disc-name-wrapper-${discNum}"></div>
            </div>
            <div class="mb-4">
                 <input type="text" id="disc-custom-name-${discNum}" placeholder="個別名 (例: 会心用)" class="w-full p-2 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg" value="${stateData.customName || ''}">
            </div>
            <div class="space-y-3">
                 <div><label class="block text-xs font-bold text-gray-400 mb-1">メインステータス</label><div id="main-stat-wrapper-${discNum}"></div></div>
                 <div><label class="block text-xs font-bold text-gray-400 mb-1">サブステータス</label><div id="sub-stats-container-${discNum}" class="space-y-2"></div></div>
            </div>`;

        const discSelect = document.createElement('select');
        discSelect.id = `disc-name-${discNum}`;
        discSelect.className = 'my-disc-name';
        discSelect.innerHTML = discOptions;
        card.querySelector(`#disc-name-wrapper-${discNum}`).appendChild(createCustomSelect(discSelect));

        const subStatsContainer = card.querySelector(`#sub-stats-container-${discNum}`);
        for (let i = 0; i < 4; i++) {
            const subStatState = stateData.subStats?.[i] || {};
            const row = document.createElement('div');
            row.className = "grid grid-cols-5 gap-2 items-center";
            row.innerHTML = `
                <div class="col-span-3" id="sub-stat-name-wrapper-${discNum}-${i}"></div>
                <div class="col-span-2 flex items-center justify-center gap-1 bg-[var(--bg-primary)] p-1 rounded-md">
                    <button type="button" class="hit-change-btn" data-action="minus">-</button>
                    <input type="number" id="sub-stat-hits-${discNum}-${i}" class="calc-sub-hits w-full text-center" min="0" max="5" value="${subStatState.hits || 0}">
                    <button type="button" class="hit-change-btn" data-action="plus">+</button>
                </div>
            `;
            subStatsContainer.appendChild(row);
            const subStatSelect = document.createElement('select');
            subStatSelect.id = `sub-stat-name-${discNum}-${i}`;
            subStatSelect.innerHTML = `<option value="">--- サブステ ---</option>${subStatOptions}`;
            if (subStatState.name) subStatSelect.value = subStatState.name;
            row.querySelector(`#sub-stat-name-wrapper-${discNum}-${i}`).appendChild(createCustomSelect(subStatSelect));
        }
        updateMainStatOptionsForCreator(card, discNum, stateData.mainStat);
        return card;
    }


    function readCreatorCardState(card) {
        const discNum = parseInt(card.dataset.cardId, 10);
        const mainStatSelect = card.querySelector(`#main-stat-wrapper-${discNum} select`);
        const mainStat = mainStatSelect ? mainStatSelect.value : card.querySelector(`#main-stat-wrapper-${discNum} .fixed-main-stat`)?.dataset.value;

        const subStats = [];
        let totalHits = 0;
        for (let i = 0; i < 4; i++) {
            const name = card.querySelector(`#sub-stat-name-${discNum}-${i}`).value;
            const hits = parseInt(card.querySelector(`#sub-stat-hits-${discNum}-${i}`).value) || 0;
            totalHits += hits;
            if (name) subStats.push({ name, hits });
        }

        return {
            discName: card.querySelector('.my-disc-name').value,
            customName: card.querySelector(`#disc-custom-name-${discNum}`).value,
            discNum: discNum,
            mainStat: mainStat,
            opCount: totalHits === 5 ? 4 : 3,
            subStats: subStats,
        };
    }


    function saveDiscSet(modal, editingSetId = null) {
        const setName = modal.querySelector('#disc-set-name').value || `マイディスクセット ${state.myDiscs.length + 1}`;
        let allValid = true;

        modal.querySelectorAll('.disc-input-card').forEach(card => {
            const discNum = parseInt(card.dataset.cardId, 10);
            creatorDiscStates[discNum] = readCreatorCardState(card);
        });

        const discsInSet = {};
        for (const discNum of activeCreatorDiscs) {
            const discData = creatorDiscStates[discNum];
            if (!discData || !discData.discName || !discData.mainStat) {
                showToast(`ディスク #${discNum} の必須項目が未入力です。`, 'bg-red-500');
                allValid = false;
                return;
            }
            discsInSet[discNum] = discData;
        }

        if (!allValid || Object.keys(discsInSet).length === 0) return;

        if (editingSetId) {
            const setIndex = state.myDiscs.findIndex(s => s.id === editingSetId);
            if (setIndex !== -1) {
                state.myDiscs[setIndex] = {
                    ...state.myDiscs[setIndex],
                    setName: setName,
                    discs: discsInSet
                };
            }
        } else {
            const newSet = {
                id: `set_${Date.now()}`,
                createdAt: Date.now(),
                setName: setName,
                discs: discsInSet
            };
            state.myDiscs.push(newSet);
        }

        saveMyDiscs();
        showToast(editingSetId ? 'ディスクセットを更新しました。' : 'ディスクセットを保存しました。');
        closeModal();
    }

function updateDiscPreview(modal) {
    const discSelect = modal.querySelector('#my-disc-name');
    const selectedOption = discSelect.options[discSelect.selectedIndex];
    const previewContainer = modal.querySelector('#disc-preview');
    const previewIcon = modal.querySelector('#disc-preview-icon');
    const previewName = modal.querySelector('#disc-preview-name');

    if (selectedOption && selectedOption.value) {
        previewIcon.src = selectedOption.dataset.icon || '';
        previewName.textContent = selectedOption.textContent;
        previewContainer.classList.remove('hidden');
        previewContainer.classList.add('flex');
    } else {
        previewContainer.classList.add('hidden');
        previewContainer.classList.remove('flex');
    }
}


function updateMainStatOptionsForCreator(card, discNum, selectedValue) {
    const wrapper = card.querySelector(`#main-stat-wrapper-${discNum}`);
    if (!wrapper) return;

    const mainStatOptions = {
        '1': ['HP(実数値)'], '2': ['攻撃力(実数値)'], '3': ['防御力(実数値)'],
        '4': ['HP(%)', '攻撃力(%)', '防御力(%)', '会心率', '会心ダメージ', '異常マスタリー'],
        '5': ['HP(%)', '攻撃力(%)', '防御力(%)', '物理属性ダメージ%', '炎属性ダメージ%', '氷属性ダメージ%', '電気属性ダメージ%', 'エーテル属性ダメージ%', '貫通率'],
        '6': ['HP(%)', '攻撃力(%)', '防御力(%)', '異常掌握', 'エネルギー自動回復', '衝撃力']
    };
    const options = mainStatOptions[discNum] || [];

    if (discNum <= 3) {
        wrapper.innerHTML = `<div class="fixed-main-stat" data-value="${options[0]}">${options[0]}</div>`;
    } else {
        const select = document.createElement('select');
        select.innerHTML = `<option value="">--- メインステータス ---</option>` + options.map(s => `<option value="${s}" ${s === selectedValue ? 'selected' : ''}>${s}</option>`).join('');
        wrapper.innerHTML = '';
        wrapper.appendChild(createCustomSelect(select));
    }
}

function updateAllStatValues(modal) {
    // Main Stat
    const mainStatSelect = modal.querySelector('#my-disc-main-stat');
    const mainStatName = mainStatSelect.value;
    const mainStatValueDiv = modal.querySelector('#my-disc-main-stat-value');
    if (mainStatName) {
        const statInfo = state.mainStatsGrowth.find(s => {
            if (s.name === '属性ダメージ') return mainStatName.includes('属性ダメージ');
            return s.name === mainStatName;
        });

        if (statInfo) {
            const isPercent = !['HP(実数値)', '攻撃力(実数値)', '防御力(実数値)', '異常マスタリー'].includes(mainStatName);
            const value = isNaN(statInfo.max) ? 0 : statInfo.max;
            mainStatValueDiv.textContent = isPercent ? `${value.toFixed(1)}%` : Math.round(value);
        }
        const placeholderOption = mainStatSelect.querySelector('option[value=""]');
        if (placeholderOption) placeholderOption.disabled = true;
    } else {
        mainStatValueDiv.textContent = '';
    }

    // Sub Stats
    for (let i = 0; i < 4; i++) {
        const subStatName = modal.querySelector(`#sub-stat-name-${i}`).value;
        const hits = parseInt(modal.querySelector(`#sub-stat-hits-${i}`).value) || 0;
        const valueDiv = modal.querySelector(`#sub-stat-value-${i}`);
        if(subStatName) {
            const statInfo = state.subStatsGrowth.find(s => s.name === subStatName);
            if(statInfo) {
                const value = parseFloat(statInfo.initial) + (parseFloat(statInfo.perHit) * hits);
                const isPercent = subStatName.includes('%') || ['会心率', '会心ダメージ'].includes(subStatName);
                valueDiv.textContent = isPercent ? `${value.toFixed(1)}%` : Math.round(value);
            }
        } else {
            valueDiv.textContent = '';
        }
    }
}


export function showBuildCreatorModal() {
    const ownedAgents = state.allAgents.filter(a => state.myCharacters.includes(a.id)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const unownedAgents = state.allAgents.filter(a => !state.myCharacters.includes(a.id)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const agentOptions = `<option value="">--- エージェント選択 ---</option><optgroup label="マイキャラ">${ownedAgents.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</optgroup><optgroup label="その他">${unownedAgents.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</optgroup>`;
    const wEngineOptions = `<option value="">--- 音動機選択 ---</option>` + state.allWEngines.sort((a, b) => b.rank.localeCompare(a.rank) || a.name.localeCompare(b.name, 'ja')).map(w => `<option value="${w.name}">${w.rank} | ${w.name}</option>`).join('');
    const discOptions = `<option value="">--- ディスク選択 ---</option>` + state.allDiscs.sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(d => `<option value="${d.name}" data-icon="${d.iconUrl}">${d.name}</option>`).join('');

    const modalHtml = `
        <div class="modal-content w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] grid lg:grid-cols-2 overflow-hidden" onclick="event.stopPropagation()">
            <div class="flex flex-col">
                <div class="modal-header">
                    <h2 class="text-2xl font-bold text-[var(--text-primary)]">新規ビルド作成</h2>
                    <button class="modal-close-btn lg:hidden">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <form id="build-form" class="modal-body space-y-4 custom-scroll flex-1">
                    <div><label for="build-name" class="block text-sm font-bold text-[var(--text-secondary)] mb-1">ビルド名</label><input type="text" id="build-name" placeholder="例：猫又 会心特化ビルド" class="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg text-[var(--text-primary)]" required></div>
                    <div><label class="block text-sm font-bold text-[var(--text-secondary)] mb-1">エージェント</label><div id="agent-select-wrapper"></div></div>
                    <div><label class="block text-sm font-bold text-[var(--text-secondary)] mb-1">音動機</label><div id="wengine-select-wrapper"></div></div>
                    <div>
                        <label class="block text-sm font-bold text-[var(--text-secondary)] mb-1">ドライバディスク</label>
                        <div class="space-y-2">
                            <div id="disc-select-1-wrapper"></div>
                            <div id="disc-select-2-wrapper"></div>
                            <div id="disc-select-3-wrapper"></div>
                        </div>
                        <p class="text-xs text-[var(--text-secondary)] mt-2">4セット効果は1つまで。最大3種類の2セット効果（キメラ）を選択できます。</p>
                    </div>
                </form>
                <div class="modal-footer">
                    <button id="save-build-btn" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg">このビルドを保存</button>
                </div>
            </div>
            <div class="hidden lg:flex flex-col bg-[var(--bg-tertiary)] border-l border-[var(--border-primary)]">
                <div class="modal-header">
                    <h3 class="text-xl font-bold text-[var(--text-primary)]">効果プレビュー</h3>
                    <button class="modal-close-btn">
                         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div id="build-preview" class="modal-body space-y-4 custom-scroll flex-1">
                    <p class="text-[var(--text-secondary)]">ディスクを選択すると効果が表示されます。</p>
                </div>
            </div>
        </div>`;
    openModal(modalHtml, (modal) => {
        modal.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', closeModal));

        const agentSelect = document.createElement('select'); agentSelect.id = 'build-agent'; agentSelect.innerHTML = agentOptions;
        modal.querySelector('#agent-select-wrapper').appendChild(createCustomSelect(agentSelect));

        const wengineSelect = document.createElement('select'); wengineSelect.id = 'build-wengine'; wengineSelect.innerHTML = wEngineOptions;
        modal.querySelector('#wengine-select-wrapper').appendChild(createCustomSelect(wengineSelect));

        const discSelect1 = document.createElement('select'); discSelect1.id = 'build-disc-1'; discSelect1.innerHTML = discOptions;
        modal.querySelector('#disc-select-1-wrapper').appendChild(createCustomSelect(discSelect1));

        const discSelect2 = document.createElement('select'); discSelect2.id = 'build-disc-2'; discSelect2.innerHTML = discOptions;
        modal.querySelector('#disc-select-2-wrapper').appendChild(createCustomSelect(discSelect2));

        const discSelect3 = document.createElement('select'); discSelect3.id = 'build-disc-3'; discSelect3.innerHTML = discOptions;
        modal.querySelector('#disc-select-3-wrapper').appendChild(createCustomSelect(discSelect3));

        const previewPane = modal.querySelector('#build-preview');

        const updatePreviewAndSelections = () => {
            const selects = [discSelect1, discSelect2, discSelect3];
            const selectedValues = selects.map(s => s.value).filter(Boolean);
            const counts = selectedValues.reduce((acc, val) => { acc[val] = (acc[val] || 0) + 1; return acc; }, {});

            let has4Set = false;
            Object.values(counts).forEach(count => {
                if (count >= 2) has4Set = true;
            });

            selects.forEach(select => {
                Array.from(select.options).forEach(option => {
                    if (!option.value) return;
                    const valueCount = counts[option.value] || 0;
                    if (has4Set && valueCount < 2 && selectedValues.includes(option.value)) {
                        option.disabled = true;
                    } else {
                        option.disabled = false;
                    }
                });
                const customSelect = select.closest('.custom-select-container');
                if(customSelect) {
                    const newCustomSelect = createCustomSelect(select);
                    customSelect.replaceWith(newCustomSelect);
                }
            });

            let html = '';
            for (const name in counts) {
                const disc = state.allDiscs.find(d => d.name === name);
                if (disc) {
                    if (counts[name] >= 2) {
                        html += `<div class="p-3 rounded-lg bg-[var(--bg-secondary)]"><h4 class="font-bold text-amber-500">${disc.name} (4セット)</h4><p class="text-sm text-[var(--text-secondary)] mt-1">${disc.set4}</p></div>`;
                    }
                    html += `<div class="p-3 rounded-lg bg-[var(--bg-secondary)]"><h4 class="font-bold text-sky-500">${disc.name} (2セット)</h4><p class="text-sm text-[var(--text-secondary)] mt-1">${disc.set2}</p></div>`;
                }
            }
            previewPane.innerHTML = html || `<p class="text-[var(--text-secondary)]">ディスクを選択すると効果が表示されます。</p>`;
        };

        modal.addEventListener('change', (e) => {
            if (e.target.matches('#build-disc-1, #build-disc-2, #build-disc-3')) {
                updatePreviewAndSelections();
            }
        });

        modal.querySelector('#save-build-btn').onclick = () => {
            const form = modal.querySelector('#build-form'); if (!form.checkValidity()) { form.reportValidity(); return; }
            const agentId = agentSelect.value;
            const wEngineName = wengineSelect.value;
            if (!agentId || !wEngineName) {
                showToast('エージェントと音動機を選択してください。', 'bg-red-500'); return;
            }

            const discSetNames = [discSelect1.value, discSelect2.value, discSelect3.value].filter(Boolean);
            if (discSetNames.length === 0) {
                showToast('ディスクを最低1つは選択してください。', 'bg-red-500'); return;
            }

            const counts = discSetNames.reduce((acc, val) => { acc[val] = (acc[val] || 0) + 1; return acc; }, {});
            if (Object.values(counts).filter(c => c >= 2).length > 1) {
                showToast('4セット効果は1種類までしか選択できません。', 'bg-red-500'); return;
            }

            const sets = [];
            for(const name in counts) {
                if (counts[name] >= 2) {
                    sets.push({ name, count: 4 });
                    if(counts[name] === 3) sets.push({ name, count: 2 });
                } else {
                    sets.push({ name, count: 2 });
                }
            }
            const finalSets = [];
            const processedNames = new Set();
            sets.sort((a,b) => b.count - a.count).forEach(s => {
                if(!processedNames.has(s.name)) {
                    finalSets.push(s);
                    processedNames.add(s.name);
                }
            });

            state.myBuilds.push({
                id: `build_${Date.now()}`,
                name: modal.querySelector('#build-name').value,
                agentId,
                wEngineName,
                discBuild: { sets: finalSets }
            });

            saveMyBuildsToDB();
            showToast('ビルドを保存しました。');
            closeModal();
        };
    });
}

export function showAgentModal(agentId, options = {}) {
    const agent = state.allAgents.find(a => a.id === agentId);
    if (!agent) return;

    const historyInfo = { type: 'agent', id: agentId };

    const formatStatGoals = (goals) => {
        if (!goals) return '<p class="text-[var(--text-secondary)]">情報なし</p>';
        const tiers = { theory: '理論値', ideal: '理想値', target: '目標値', compromise: '妥協値' };
        const stats = Object.keys(goals.theory || goals.ideal || goals.target || goals.compromise || {});
        if (stats.length === 0) return '<p class="text-[var(--text-secondary)]">情報なし</p>';

        let tableHtml = `<div class="overflow-x-auto custom-scroll bg-[var(--bg-tertiary)] rounded-lg"><table class="w-full text-sm text-left">
            <thead class="text-xs text-[var(--text-secondary)] uppercase">
                <tr><th class="px-4 py-3">ステータス</th>`;
        Object.values(tiers).forEach(tierName => tableHtml += `<th class="px-4 py-3 text-center">${tierName}</th>`);
        tableHtml += `</tr></thead><tbody>`;
        stats.forEach(stat => {
            tableHtml += `<tr class="border-b border-[var(--border-primary)] last:border-b-0 hover:bg-[var(--bg-primary)]">
                <th class="px-4 py-3 font-medium whitespace-nowrap">${stat}</th>`;
            Object.keys(tiers).forEach(tierKey => {
                tableHtml += `<td class="px-4 py-3 text-center font-mono">${goals[tierKey]?.[stat] || '-'}</td>`;
            });
            tableHtml += `</tr>`;
        });
        tableHtml += '</tbody></table></div>';
        return tableHtml;
    };

    const formatBuilds = (builds) => {
        if (!builds || builds.length === 0) return '<div>情報なし</div>';
        return builds.map((build, index) => {
            const discsHtml = build.discBuild?.sets?.map(set => {
                const disc = state.allDiscs.find(d => d.name === set.name);
                if (!disc) return '';
                const iconHtml = disc.iconUrl ? `<img src="${disc.iconUrl}" alt="${disc.name}">` : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-tertiary)]"></div>`;
                const setClass = `set-${set.count}`;
                return `
                <button data-disc-name="${set.name}" class="disc-build-button disc-link-btn ${setClass}">
                    <div class="disc-build-icon">${iconHtml}</div>
                    <div class="disc-build-info">
                        <p class="disc-build-name">${disc.name}</p>
                        <p class="disc-build-set ${setClass}">${set.count}セット効果</p>
                    </div>
                </button>`;
            }).join('') || 'N/A';
            return `
            <div class="bg-[var(--bg-tertiary)] p-4 rounded-lg">
                <h4 class="font-bold text-lg text-[var(--text-accent)] mb-3">推奨ビルド ${index + 1}</h4>
                <div class="space-y-4">
                    <div>
                        <p class="font-semibold text-sm mb-2 text-[var(--text-secondary)]">ドライバディスク</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${discsHtml}
                        </div>
                    </div>
                    <div>
                        <p class="font-semibold text-sm mb-1 text-[var(--text-secondary)]">推奨編成: <span class="font-normal text-[var(--text-primary)]">${build.team?.composition || 'N/A'}</span></p>
                        <p class="text-sm leading-relaxed">${build.team?.strategy || 'N/A'}</p>
                    </div>
                </div>
            </div>`;
        }).join('');
    };

    const formatConstellations = (consts) => {
        if (!consts || consts.length === 0) return '<div>情報なし</div>';
        return consts.map(c => `
            <div class="py-3 border-b border-[var(--border-primary)] last:border-b-0">
                <p class="font-bold text-[var(--text-accent)]">心象 ${c.level}： ${c.name}</p>
                <p class="text-sm text-[var(--text-secondary)] mt-1">${c.effect}</p>
            </div>
        `).join('');
    };

    const formatWEngines = (wEngineInfo) => {
        if (!wEngineInfo) return '<div>情報なし</div>';
        const motif = wEngineInfo.motif ? state.allWEngines.find(w => w.name === wEngineInfo.motif.name) : null;
        const alternatives = wEngineInfo.alternatives ? wEngineInfo.alternatives.map(alt => state.allWEngines.find(w => w.name === alt.name)).filter(Boolean) : [];

        const createWEngineButton = (w, isMotif) => {
            if (!w) return '';
            const iconHtml = w.iconUrl
                ? `<img src="${w.iconUrl}" alt="${w.name}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-lg font-black text-[var(--text-secondary)] opacity-20 select-none">${w.name.charAt(0)}</span></div>`;
            return `
            <button data-wengine-name="${w.name}" class="w-engine-link-btn disc-build-button ${isMotif ? 'set-4' : 'set-2'}">
                <div class="disc-build-icon">${iconHtml}</div>
                <div class="disc-build-info">
                    <p class="disc-build-name">${w.name}</p>
                    <span class="px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[w.rank]}">${w.type}</span>
                </div>
            </button>`;
        };

        let html = '';
        if (motif) {
            html += `<div class="p-2 rounded-lg bg-[var(--bg-secondary)]">
                        <p class="text-xs font-bold text-amber-500 mb-2">最適 (モチーフ)</p>
                        ${createWEngineButton(motif, true)}
                     </div>`;
        }
        if (alternatives.length > 0) {
            html += `<div class="p-2 rounded-lg bg-[var(--bg-secondary)]">
                        <p class="text-xs font-bold text-sky-500 mb-2">代替</p>
                        <div class="grid grid-cols-1 gap-2">${alternatives.map(alt => createWEngineButton(alt, false)).join('')}</div>
                     </div>`;
        }
        return html;
    };
    const attributes = agent.attributes || [agent.attribute];
    const attributeTags = attributes.map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join('');

    let rankText;
    if (agent.type) {
        rankText = agent.type;
    } else {
        rankText = (agent.rarity === 'S') ? '恒常S級' : 'A級';
    }

    const iconUrl = agent.imageUrls?.style1?.['2d'];
    const iconHtml = iconUrl
        ? `<img src="${iconUrl}" alt="${agent.name}" class="w-full h-full object-cover">`
        : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-3xl font-black text-[var(--text-secondary)] opacity-20 select-none">${agent.name.charAt(0)}</span></div>`;


    const modalHtml = `
        <div class="modal-content w-full max-w-6xl h-full lg:h-auto lg:max-h-[90vh] flex flex-col lg:flex-row overflow-hidden">
            <div class="flex-1 flex flex-col min-w-0 lg:w-2/3">
                <div class="modal-header">
                     <div class="flex items-start gap-4">
                        <div class="icon-container w-20 h-20 flex-shrink-0">
                           ${iconHtml}
                        </div>
                        <div>
                            <h2 class="text-3xl font-bold text-[var(--text-primary)]">${agent.name}</h2>
                            <div class="flex items-center flex-wrap gap-2 mt-2">
                                <span class="px-3 py-1 text-sm font-bold rounded-full ${constants.rarityClasses[agent.rarity]}">${rankText}</span>
                                <span class="tag role-tag role-${agent.role}">${agent.role}</span>
                                <span class="tag faction-tag">${agent.faction}</span>
                                ${attributeTags}
                            </div>
                        </div>
                     </div>
                </div>
                <div class="agent-modal-tabs-container px-6">
                    <button class="agent-modal-tab active" data-tab="panel-overview">概要</button>
                    <button class="agent-modal-tab" data-tab="panel-builds">ビルド</button>
                    <button class="agent-modal-tab" data-tab="panel-constellations">心象</button>
                </div>
                <div class="modal-body custom-scroll flex-1 space-y-6">
                    <div id="panel-overview" class="agent-modal-tab-panel active space-y-6">
                         <div><h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-[var(--text-accent)] pl-3">エージェント概要</h3><p class="leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-4 rounded-lg">${agent.description}</p></div>
                         <div><h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-[var(--text-accent)] pl-3">ステータス目標値</h3>${formatStatGoals(agent.statGoals)}</div>
                    </div>
                    <div id="panel-builds" class="agent-modal-tab-panel space-y-4">
                         ${formatBuilds(agent.builds)}
                    </div>
                     <div id="panel-constellations" class="agent-modal-tab-panel">
                        ${formatConstellations(agent.constellations)}
                    </div>
                </div>
                <div class="modal-footer text-xs text-right text-[var(--text-secondary)]">
                    <p>実装日: ${agent.releaseDate || '未定'} | 実装Ver: ${agent.releaseVersion || 'N/A'}</p>
                </div>
            </div>

            <div class="hidden lg:flex flex-col bg-[var(--bg-tertiary)] border-l border-[var(--border-primary)] w-1/3 relative">
                <button class="modal-close-btn">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div class="flex-1 flex flex-col min-h-0">
                    <div class="overflow-y-auto custom-scroll">
                        <div class="modal-header">
                            <h3 class="text-xl font-bold text-[var(--text-primary)]">推奨音動機</h3>
                        </div>
                        <div class="p-6 space-y-4">
                            ${formatWEngines(agent.wEngine)}
                        </div>
                        <div class="modal-header border-t border-[var(--border-primary)]">
                            <h3 class="text-xl font-bold text-[var(--text-primary)]">関連キャラクター</h3>
                        </div>
                        <div class="p-6 space-y-2">
                        ${(agent.relationships && agent.relationships.length > 0) ? agent.relationships.map(rel => {
                            const relAgent = state.allAgents.find(a => a.id === rel.id);
                            if(!relAgent) return '';
                            const relIconUrl = relAgent.imageUrls?.style1?.['2d'];
                            const relIconHtml = relIconUrl
                                ? `<img src="${relIconUrl}" alt="${relAgent.name}" class="w-full h-full object-cover">`
                                : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-lg font-black text-[var(--text-secondary)] opacity-20 select-none">${relAgent.name.charAt(0)}</span></div>`;

                            return `<button data-agent-id="${relAgent.id}" class="related-agent-btn w-full flex items-center gap-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] p-2 rounded-lg transition-colors interactive-scale text-left">
                                     <div class="icon-container w-10 h-10">${relIconHtml}</div>
                                     <div class="flex-1"><p class="font-semibold">${relAgent.name}</p></div>
                                     <span class="px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[relAgent.rarity]}">${relAgent.rarity}</span>
                                   </button>`;
                        }).join('') : '<p class="text-sm text-[var(--text-secondary)]">関連キャラクターなし</p>'}
                        </div>
                    </div>
                    <div class="modal-footer mt-auto">
                        <button id="apply-theme-btn" data-theme-name="agent_${agent.id}" class="w-full flex items-center justify-center gap-2 text-sm font-semibold text-[var(--text-primary)] py-2 px-4 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--border-primary)] transition-colors interactive-scale">
                            <span class="material-symbols-outlined text-base">palette</span>
                            このキャラクターをテーマに設定
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    openModal(modalHtml, (modal) => {
        setupModalTabs(modal);
        modal.querySelectorAll('.modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal(true));
        });
        modal.querySelector('#apply-theme-btn').addEventListener('click', (e) => selectAndApplyTheme(e.currentTarget.dataset.themeName));

        modal.querySelectorAll('.related-agent-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const nextAgentId = e.currentTarget.dataset.agentId;
                showAgentModal(nextAgentId, { isChild: false });
            });
        });

        const handleLinkClick = (e, type, id) => {
            e.stopPropagation();
            if (type === 'disc') showDiscModal(id, { isChild: true });
            if (type === 'w-engine') showWEngineModal(id, { isChild: true });
        };

        modal.querySelectorAll('.disc-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleLinkClick(e, 'disc', e.currentTarget.dataset.discName));
        });
        modal.querySelectorAll('.w-engine-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleLinkClick(e, 'w-engine', e.currentTarget.dataset.wengineName));
        });

    }, { ...options, historyInfo });
}

function showRelatedAgent(agentId) {
    closeModal();
    setTimeout(() => showAgentModal(agentId), 350);
}

export function showDiscModal(discName, options = {}) {
    const disc = state.allDiscs.find(d => d.name === discName);
    if (!disc) {
        showToast(`ディスク「${discName}」の情報が見つかりません。`, 'bg-red-500');
        return;
    }

    const historyInfo = { type: 'disc', id: discName };

    const attributeTags = (disc.compatibleAttributes || []).map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join('');
    const iconHtml = disc.iconUrl
        ? `<img src="${disc.iconUrl}" alt="${disc.name}" class="w-full h-full object-cover">`
        : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-xl font-black text-[var(--text-secondary)] opacity-20 select-none">${disc.name.charAt(0)}</span></div>`;

    const modalHtml = `
        <div class="modal-content w-full max-w-2xl h-full sm:h-auto sm:max-h-[80vh] flex flex-col">
            <div class="modal-header">
                <div class="flex items-center gap-4">
                    <div class="small-icon-container">${iconHtml}</div>
                    <h2 class="text-2xl font-bold text-[var(--text-primary)]">${disc.name}</h2>
                </div>
                <button class="modal-close-btn">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="modal-body custom-scroll space-y-6">
                <div><h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-sky-400 pl-3">2セット効果</h3><p class="leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-4 rounded-lg">${disc.set2}</p></div>
                <div><h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-amber-400 pl-3">4セット効果</h3><p class="leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-4 rounded-lg">${disc.set4}</p></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><h4 class="font-semibold text-sm mb-2 text-[var(--text-secondary)]">適合役割</h4><div class="flex flex-wrap gap-2">${disc.roles.map(r => `<span class="tag role-tag role-${r}">${r}</span>`).join(' ')}</div></div>
                    <div><h4 class="font-semibold text-sm mb-2 text-[var(--text-secondary)]">相性の良い属性</h4><div class="flex flex-wrap gap-2">${attributeTags || '<p class="text-sm text-[var(--text-secondary)]">情報なし</p>'}</div></div>
                </div>
                <div class="text-xs text-right text-[var(--text-secondary)] pt-4 border-t border-[var(--border-primary)]"><p>実装日: ${disc.releaseDate || '未定'} | 実装Ver: ${disc.releaseVersion || 'N/A'}</p></div>
            </div>
        </div>`;

    openModal(modalHtml, modal => {
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    }, { ...options, historyInfo, isChild: true });
}

function showRelatedWEngine(wEngineName) {
    closeModal();
    setTimeout(() => showWEngineModal(wEngineName), 350);
}

export function showWEngineModal(wengineName, options = {}) {
    const wEngine = state.allWEngines.find(w => w.name === wengineName);
    if (!wEngine) {
        showToast('音動機の情報が見つかりません。', 'bg-red-500');
        return;
    }

    const historyInfo = { type: 'w-engine', id: wengineName };

    const attributeTags = (wEngine.compatibleAttributes || []).filter(attr => attr !== '汎用').map(attr => `<span class="tag attribute-tag attribute-${attr.replace(/\s/g, '')}">${attr}</span>`).join('');

    let materialsHtml = '';
    if (wEngine.materials) {
        const materialItems = Object.entries(wEngine.materials).map(([key, value]) => {
            if (key === 'dinny') {
                return `<div class="bg-[var(--bg-tertiary)] p-3 rounded-lg"><p class="font-semibold text-[var(--text-secondary)]">ディニー</p><p class="font-mono">${value.toLocaleString()}</p></div>`;
            } else if (key === 'module') {
                return `<div class="bg-[var(--bg-tertiary)] p-3 rounded-lg"><p class="font-semibold text-[var(--text-secondary)]">音動機エネルギーモジュール</p><p class="font-mono">${value}個</p></div>`;
            } else if (key.startsWith('kit')) {
                 return `<div class="bg-[var(--bg-tertiary)] p-3 rounded-lg"><p class="font-semibold text-[var(--text-secondary)]">${value.name}</p><p class="font-mono">${value.amount}個</p></div>`;
            }
            return '';
        }).join('');

        materialsHtml = `
            <div>
                <h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-[var(--text-accent)] pl-3">最大強化素材 (Lv.1→60)</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    ${materialItems}
                </div>
            </div>`;
    }

    let alternativesHtml = '<p class="text-sm text-[var(--text-secondary)]">情報なし</p>';
    if (wEngine.alternatives) {
        const alternativeNames = wEngine.alternatives.match(/《([^》]+)》/g)?.map(name => name.slice(1, -1)) || [];
        if (alternativeNames.length > 0) {
            alternativesHtml = alternativeNames.map(name => {
                const altWEngine = state.allWEngines.find(w => w.name === name);
                if (!altWEngine) return `<div class="bg-[var(--bg-tertiary)] p-2 rounded-lg text-sm">${name} (データなし)</div>`;

                const iconContent = altWEngine.iconUrl
                    ? `<img src="${altWEngine.iconUrl}" alt="${altWEngine.name}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-lg font-black text-[var(--text-secondary)] opacity-20 select-none">${altWEngine.name.charAt(0)}</span></div>`;

                return `
                    <button data-wengine-name="${altWEngine.name}" class="related-wengine-btn w-full flex items-center gap-3 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] p-2 rounded-lg transition-colors interactive-scale text-left">
                        <div class="small-icon-container w-10 h-10">${iconContent}</div>
                        <div class="flex-1">
                            <p class="font-semibold">${altWEngine.name}</p>
                        </div>
                        <span class="px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[altWEngine.rank]}">${altWEngine.type}</span>
                    </button>
                `;
            }).join('');
        } else {
             alternativesHtml = `<p class="leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-4 rounded-lg">${wEngine.alternatives}</p>`
        }
    }

    const iconHtml = wEngine.iconUrl
        ? `<img src="${wEngine.iconUrl}" alt="${wEngine.name}" class="w-full h-full object-cover">`
        : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-xl font-black text-[var(--text-secondary)] opacity-20 select-none">${wEngine.name.charAt(0)}</span></div>`;

    const modalHtml = `
        <div class="modal-content w-full max-w-3xl h-full sm:h-auto sm:max-h-[85vh] flex flex-col">
            <div class="modal-header flex justify-between items-start">
                <div class="flex items-center gap-4">
                    <div class="small-icon-container">${iconHtml}</div>
                    <div>
                        <h2 class="text-2xl font-bold text-[var(--text-primary)]">${wEngine.name}</h2>
                        <div class="flex items-center flex-wrap gap-2 mt-1">
                            <span class="px-3 py-1 text-xs font-bold rounded-full ${constants.rarityClasses[wEngine.rank]}">${wEngine.type}</span>
                            <span class="tag role-tag role-${wEngine.role}">${wEngine.role}</span>
                            ${attributeTags}
                        </div>
                    </div>
                </div>
                <button class="modal-close-btn">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="modal-body custom-scroll space-y-6">
                <div>
                    <h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-[var(--text-accent)] pl-3">基本情報</h3>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div class="bg-[var(--bg-tertiary)] p-3 rounded-lg"><p class="font-semibold text-[var(--text-secondary)] mb-1">${wEngine.baseStat.name}</p><p class="font-mono text-lg">${wEngine.baseStat.value}</p></div>
                        <div class="bg-[var(--bg-tertiary)] p-3 rounded-lg"><p class="font-semibold text-[var(--text-secondary)] mb-1">${wEngine.advStat.name}</p><p class="font-mono text-lg">${wEngine.advStat.value}</p></div>
                        <div class="bg-[var(--bg-tertiary)] p-3 rounded-lg col-span-2"><p class="font-semibold text-[var(--text-secondary)] mb-1">モチーフ</p><p>${wEngine.motif || 'なし'}</p></div>
                    </div>
                </div>
                <div>
                    <h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-[var(--text-accent)] pl-3">${wEngine.effectName || '追加効果'}</h3>
                    <div class="leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-tertiary)] p-4 rounded-lg">${wEngine.effect}</div>
                </div>
                <div>
                    <h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 border-l-4 border-[var(--text-accent)] pl-3">代替音動機</h3>
                    <div class="space-y-2">${alternativesHtml}</div>
                </div>
                ${materialsHtml}
                <div class="text-xs text-right text-[var(--text-secondary)] pt-4 border-t border-[var(--border-primary)]">
                    <p>実装日: ${wEngine.releaseDate || 'N/A'} | 実装Ver: ${wEngine.releaseVersion || 'N/A'}</p>
                </div>
            </div>
        </div>`;

    openModal(modalHtml, modal => {
        modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        modal.querySelectorAll('.related-wengine-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showWEngineModal(e.currentTarget.dataset.wengineName, { isChild: true });
            });
        });
    }, { ...options, historyInfo, isChild: true });
}

export function showConfirmModal(title, message, onConfirm) {
    const modalHtml = `
        <div class="modal-content w-full max-w-md h-auto flex flex-col child-modal">
            <div class="modal-header">
                <h2 class="text-2xl font-bold text-[var(--text-primary)]">${title}</h2>
                <button class="modal-close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <p class="text-[var(--text-secondary)]">${message}</p>
            </div>
            <div class="modal-footer flex gap-4">
                <button id="confirm-cancel-btn" class="flex-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-primary)] text-[var(--text-primary)] font-bold py-3 px-4 rounded-lg transition">キャンセル</button>
                <button id="confirm-ok-btn" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition">削除する</button>
            </div>
        </div>`;

    openModal(modalHtml, (modal) => {
        modal.querySelector('.modal-close-btn').addEventListener('click', () => closeModal());
        modal.querySelector('#confirm-cancel-btn').addEventListener('click', () => closeModal());
        modal.querySelector('#confirm-ok-btn').addEventListener('click', () => {
            onConfirm();
            closeModal();
        });
    }, { isChild: true });
}
