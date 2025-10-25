// js/features/my-builds.js
import { state } from '../main.js';
import { constants } from '../constants.js';
import { showBuildCreatorModal, showConfirmModal, showMyBuildEditorModal } from '../ui/modals.js';
import { deleteBuild as deleteBuildFromDB } from '../firebase-auth.js';

export function initMyBuildsPage() {
    document.getElementById('header-actions').innerHTML = `<button id="create-build-btn" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition interactive-scale">新規ビルド作成</button>`;
    document.getElementById('content-wrapper').innerHTML = `<div id="my-builds-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"></div>`;

    document.getElementById('create-build-btn').addEventListener('click', () => showBuildCreatorModal());

    renderMyBuilds();
}

export function renderMyBuilds() {
    const grid = document.getElementById('my-builds-grid');
    if(!grid) return;

    if (state.myBuilds.length === 0) {
        grid.innerHTML = `<div class="md:col-span-2 xl:col-span-3 bg-[var(--bg-secondary)] border-2 border-dashed border-[var(--border-secondary)] rounded-xl flex flex-col items-center justify-center h-48 text-center p-4"><p class="font-semibold text-lg mb-2">保存されたビルドはありません</p><p class="text-[var(--text-secondary)] text-sm">右上の「新規ビルド作成」ボタンから、<br>最初のビルドを登録してみましょう！</p></div>`;
        return;
    }

    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.myBuilds.forEach(build => {
        const agent = state.allAgents.find(a => a.id === build.agentId);
        const wEngine = state.allWEngines.find(w => w.name === build.wEngineName);
        if (!agent || !wEngine) return;

        const discsHtml = build.discBuild?.sets?.map(set => {
            const disc = state.allDiscs.find(d => d.name === set.name);
            return disc ? `<div class="bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-medium px-2 py-1 rounded-md">${disc.name} x${set.count}</div>` : '';
        }).join('') || '';

        const card = document.createElement('div');
        card.className = 'bg-[var(--bg-secondary)] rounded-2xl shadow-lg p-5 flex flex-col justify-between card cursor-pointer';
        card.dataset.buildId = build.id;
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="text-2xl font-bold text-[var(--text-primary)] pointer-events-none">${build.name}</h3>
                        <div class="flex items-center gap-2 mt-1 pointer-events-none">
                            <span class="px-2 py-0.5 text-xs font-bold rounded-full ${constants.rarityClasses[agent.rarity]}">${agent.rarity}</span>
                            <span class="text-lg font-semibold text-[var(--text-secondary)]">${agent.name}</span>
                        </div>
                    </div>
                    <button data-build-id="${build.id}" class="delete-build-btn text-[var(--text-secondary)] hover:text-red-500 transition-colors p-1 rounded-full z-10">
                        <svg class="w-6 h-6 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd"></path></svg>
                    </button>
                </div>
                <div class="mt-4 space-y-3 pointer-events-none">
                    <div>
                        <h4 class="text-sm font-bold text-amber-600 mb-1">音動機</h4>
                        <div class="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 font-semibold p-2 rounded-lg">${wEngine.name}</div>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold text-sky-600 dark:text-sky-400 mb-1">ドライバディスク</h4>
                        <div class="flex flex-wrap gap-2">${discsHtml}</div>
                    </div>
                </div>
            </div>`;
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);

    grid.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-build-btn');
        const card = e.target.closest('.card');

        if (deleteBtn) {
            e.stopPropagation(); // カード本体のクリックイベントを発火させない
            const buildId = deleteBtn.dataset.buildId;
            const buildName = state.myBuilds.find(b => b.id === buildId)?.name;
            showConfirmModal(
                `ビルド「${buildName}」を削除`,
                "この操作は取り消せません。本当に削除しますか？",
                () => {
                    deleteBuildFromDB(buildId);
                }
            );
        } else if (card) {
            const buildId = card.dataset.buildId;
            const buildData = state.myBuilds.find(b => b.id === buildId);
            if (buildData) {
                showMyBuildEditorModal(buildData);
            }
        }
    });
}
