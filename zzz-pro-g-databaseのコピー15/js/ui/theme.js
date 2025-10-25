// js/ui/theme.js
import { state } from '../main.js';
import { createCharts } from '../features/agents.js';
import { openModal, closeModal } from './modals.js';
import { showToast } from './components.js';

export function setupTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
        const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    document.getElementById('show-theme-modal-btn').addEventListener('click', showThemeSelectionModal);
    document.getElementById('reset-theme-btn').addEventListener('click', () => selectAndApplyTheme('light'));
}

export function applyTheme(themeName) {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.style.cssText = '';

    if (themeName === 'dark') {
        root.classList.add('dark');
    } else if (themeName && themeName.startsWith('agent_')) {
        const agentId = themeName.split('_')[1];
        const agent = state.allAgents.find(a => a.id === agentId);
        if (agent && agent.themeColors) {
            Object.entries(agent.themeColors).forEach(([key, value]) => {
                root.style.setProperty(key, value);
            });
        }
    }
    updateThemeUI(themeName);
}

export function updateThemeUI(themeName) {
    const toggleWrapper = document.getElementById('theme-toggle-wrapper');
    const resetBtn = document.getElementById('reset-theme-btn');
    if (!toggleWrapper || !resetBtn) return;

    const isDefaultTheme = (themeName === 'light' || themeName === 'dark');
    toggleWrapper.style.display = isDefaultTheme ? 'flex' : 'none';
    resetBtn.style.display = isDefaultTheme ? 'none' : 'block';

    const themeToggle = document.querySelector('#theme-toggle-btn .theme-switch-toggle');
    if (document.documentElement.classList.contains('dark')) {
        themeToggle.style.transform = 'translateX(24px)';
    } else {
        themeToggle.style.transform = 'translateX(0px)';
    }

    if (document.getElementById('role-chart')) {
        createCharts();
    }
}

export function selectAndApplyTheme(themeName) {
    localStorage.setItem('theme', themeName);
    applyTheme(themeName);
    closeModal();
    showToast('テーマを変更しました。');
}

export function showThemeSelectionModal() {
    const currentTheme = localStorage.getItem('theme') || 'light';

    const themeOptions = state.allAgents.map(agent => {
        const isActive = currentTheme === `agent_${agent.id}`;
        const iconUrl = agent.imageUrls?.style1?.['2d'];
        const iconHtml = iconUrl
            ? `<img src="${iconUrl}" alt="${agent.name}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full bg-gradient-to-br from-[var(--bg-tertiary)] to-[var(--bg-primary)] flex items-center justify-center"><span class="text-2xl font-black text-[var(--text-secondary)] opacity-20 select-none">${agent.name.charAt(0)}</span></div>`;
        return `
            <button data-theme-name="agent_${agent.id}" class="theme-select-btn text-left p-3 rounded-lg flex items-center gap-4 transition-colors ${isActive ? 'bg-[var(--accent-blue)]/20 ring-2 ring-[var(--accent-blue)]' : 'hover:bg-[var(--bg-tertiary)]'}">
                <div class="icon-container w-12 h-12 flex-shrink-0">${iconHtml}</div>
                <div>
                    <p class="font-semibold text-sm text-[var(--text-primary)]">${agent.name}</p>
                    <p class="text-xs text-[var(--text-secondary)]">${agent.faction}</p>
                </div>
                ${isActive ? '<span class="material-symbols-outlined text-[var(--accent-blue)] ml-auto">check_circle</span>' : ''}
            </button>`;
    }).join('');

    const modalHtml = `
        <div class="modal-content w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl">
            <div class="modal-header">
                <h2 class="text-2xl font-bold text-[var(--text-primary)]">テーマを選択</h2>
                <button class="modal-close-btn">
                   <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="modal-body custom-scroll space-y-4">
                <div>
                    <h3 class="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 px-2">デフォルトテーマ</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <button data-theme-name="light" class="theme-select-btn text-left p-3 rounded-lg flex items-center gap-4 transition-colors ${currentTheme === 'light' ? 'bg-[var(--accent-blue)]/20 ring-2 ring-[var(--accent-blue)]' : 'hover:bg-[var(--bg-tertiary)]'}">
                            <div class="w-12 h-12 rounded-lg bg-[#f4f7f9] border-2 border-[#e5e7eb] flex-shrink-0"></div>
                            <p class="font-semibold text-sm text-[#111827]">ライト</p>
                            ${currentTheme === 'light' ? '<span class="material-symbols-outlined text-[var(--accent-blue)] ml-auto">check_circle</span>' : ''}
                        </button>
                        <button data-theme-name="dark" class="theme-select-btn text-left p-3 rounded-lg flex items-center gap-4 transition-colors ${currentTheme === 'dark' ? 'bg-[var(--accent-blue)]/20 ring-2 ring-[var(--accent-blue)]' : 'hover:bg-[var(--bg-tertiary)]'}">
                            <div class="w-12 h-12 rounded-lg bg-[#0f172a] border-2 border-[#334155] flex-shrink-0"></div>
                            <p class="font-semibold text-sm text-[#f8fafc]">ダーク</p>
                             ${currentTheme === 'dark' ? '<span class="material-symbols-outlined text-[var(--accent-blue)] ml-auto">check_circle</span>' : ''}
                        </button>
                    </div>
                </div>
                 <div>
                    <h3 class="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 px-2">キャラクターテーマ</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${themeOptions}</div>
                </div>
            </div>
        </div>`;
    openModal(modalHtml, (modal) => {
        modal.addEventListener('click', (e) => {
            const button = e.target.closest('.theme-select-btn');
            const closeButton = e.target.closest('.modal-close-btn');
            if (button) {
                selectAndApplyTheme(button.dataset.themeName);
            }
            if(closeButton){
                closeModal();
            }
        });
    });
}
