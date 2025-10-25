// js/ui/components.js
import { state } from '../main.js';
import { renderAgents } from '../features/agents.js'; // toggleAgentComparisonで使用
import { showComparisonModal } from './modals.js'; // ComparisonBarで使用

/**
 * 標準のselect要素をリッチなカスタムセレクトに置き換える関数
 * @param {HTMLSelectElement} selectElement - 対象のselect要素
 * @param {object} options - オプション { isRich: boolean, placeholder: string, containerClass?: string }
 * @returns {HTMLDivElement} 生成されたカスタムセレクトのコンテナ要素
 */
export function createCustomSelect(selectElement, options = { isRich: false, placeholder: '', containerClass: '' }) {
  const container = document.createElement('div');
  // 追加されたコンテナクラスを適用
  container.className = `custom-select-container relative ${options.containerClass || ''}`;
  selectElement.style.display = 'none'; // 元のselectを隠す

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger flex items-center justify-between w-full p-2 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg cursor-pointer transition h-[42px]'; // h-[42px] で高さを固定
  trigger.setAttribute('aria-haspopup', 'listbox'); // ARIA属性
  trigger.setAttribute('aria-expanded', 'false'); // ARIA属性
  trigger.tabIndex = 0; // フォーカス可能にする
  if (selectElement.disabled) trigger.classList.add('opacity-50', 'cursor-not-allowed');

  const selectedDisplay = document.createElement('span');
  // 'whitespace-nowrap' を追加して省略記号(...)を効きやすくする
  selectedDisplay.className = `truncate flex items-center gap-2 whitespace-nowrap`;

  const arrow = document.createElement('span');
  arrow.className = 'custom-select-arrow ml-auto text-[var(--text-secondary)] transition-transform duration-200 flex-shrink-0'; // flex-shrink-0 を追加
  arrow.innerHTML = `<svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;

  trigger.append(selectedDisplay, arrow);

  const optionsWrapper = document.createElement('div');
  // 'custom-select-options' クラスは外側クリックでのクローズ処理にも使われるため重要
  optionsWrapper.className = 'custom-select-options absolute z-[110] left-0 mt-1 w-full min-w-[180px] bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-lg opacity-0 invisible transform translate-y-2 transition-all duration-200 max-h-60 overflow-y-auto custom-scroll p-1';
  optionsWrapper.setAttribute('role', 'listbox'); // ARIA属性
  optionsWrapper.tabIndex = -1; // フォーカス対象外
  // コンテナと選択肢リストを関連付け（closeAllSelects で参照）
  container.customSelectOptions = optionsWrapper;

  const updateSelectedDisplay = () => {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    // プレースホルダーのテキストをより具体的に
    let placeholderText = options.placeholder || selectElement.options[0]?.textContent || '選択してください';
    // 最初のオプションがvalue=""でプレースホルダー用ならそれを使う
    if (selectElement.options[0] && !selectElement.options[0].value && !options.placeholder) {
        placeholderText = selectElement.options[0].textContent;
    }

    let content = `<span>${placeholderText}</span>`;
    let hasValue = false;

    if (selectedOption && selectedOption.value) {
      const iconUrl = selectedOption.dataset.icon;
      content = `<span>${selectedOption.textContent}</span>`;
      if (iconUrl) {
        // 画像アイコンがある場合
        content = `<img src="${iconUrl}" class="option-icon w-5 h-5 rounded object-contain flex-shrink-0" alt="">${content}`; // alt属性を追加
      } else if (options.isRich && selectedOption.value) {
        // isRich オプションが有効な場合 (例: stat icon)
         content = `<span>${selectedOption.textContent}</span>`; // isRichでもアイコンなければテキストのみ
      }
      hasValue = true;
      trigger.setAttribute('aria-label', `選択中: ${selectedOption.textContent}`); // ARIA属性
    } else {
        trigger.setAttribute('aria-label', placeholderText); // ARIA属性
    }
    selectedDisplay.innerHTML = content;
    // 値が選択されている場合とプレースホルダーの場合で文字色を切り替え
    selectedDisplay.classList.toggle('text-[var(--text-secondary)]', !hasValue);
    selectedDisplay.classList.toggle('text-[var(--text-primary)]', hasValue);
  };

  const createOption = (optionEl) => {
    const option = document.createElement('div');
    option.className = 'custom-select-option flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-[var(--bg-primary)]';
    option.dataset.value = optionEl.value;
    option.setAttribute('role', 'option'); // ARIA属性
    option.setAttribute('aria-selected', optionEl.selected ? 'true' : 'false'); // ARIA属性
    option.tabIndex = 0; // キーボード操作可能に

    const iconUrl = optionEl.dataset.icon;
    let content = `<span>${optionEl.textContent}</span>`;
    if (iconUrl) {
      content = `<img src="${iconUrl}" class="option-icon w-7 h-7 rounded object-contain flex-shrink-0" alt="">${content}`; // alt属性を追加
    } else if (options.isRich && optionEl.value) {
      content = `<span>${optionEl.textContent}</span>`;
    }
    option.innerHTML = content;

    // 無効なオプションのスタイル
    if (optionEl.disabled) {
      option.classList.add('opacity-50', 'cursor-not-allowed', 'hover:bg-transparent'); // ホバー効果も無効化
      option.setAttribute('aria-disabled', 'true'); // ARIA属性
    }

    // ▼▼▼ エラー修正点 ▼▼▼
    // classList.add() には個別の引数としてクラスを渡す
    if (optionEl.selected) {
      option.classList.add('selected', 'bg-[var(--bg-primary)]', 'font-semibold');
    }
    // ▲▲▲ エラー修正点 ▲▲▲

    const selectOptionAction = () => {
        if (optionEl.disabled) return;
        selectElement.value = optionEl.value; // 元のselect要素の値を更新
        optionsWrapper.querySelectorAll('.custom-select-option').forEach(opt => { // ARIA選択状態をリセット
            opt.setAttribute('aria-selected', 'false');
        });
        option.setAttribute('aria-selected', 'true'); // クリックされたものを選択状態に
        closeAllSelects(); // 他の（自身を含む）開いているセレクトを閉じる
        selectElement.dispatchEvent(new Event('change', { bubbles: true })); // changeイベントを手動で発火
        trigger.focus(); // 選択後、トリガーにフォーカスを戻す
    };

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      selectOptionAction();
    });

    option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectOptionAction();
        }
        // TODO: ArrowUp/ArrowDown でのオプション間移動
    });

    return option;
  };

  // optionsWrapper の内容構築（optgroup 対応）
  optionsWrapper.innerHTML = ''; // 中身をクリア
  Array.from(selectElement.childNodes).forEach((node, index) => {
      const nodeKey = `${selectElement.id || 'select'}-opt-${index}`;
      if (node.nodeName === 'OPTGROUP') {
          const groupContainer = document.createElement('div');
          groupContainer.setAttribute('role', 'group'); // ARIA属性
          groupContainer.setAttribute('aria-labelledby', `group-label-${nodeKey}`);

          const groupLabel = document.createElement('div');
          groupLabel.id = `group-label-${nodeKey}`; // ARIA用ID
          // グルーブラベルのスタイル調整 (少し目立つように)
          groupLabel.className = 'custom-select-group-label px-2 pt-2 pb-1 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider sticky top-0 bg-[var(--bg-secondary)]';
          groupLabel.textContent = node.label;
          groupContainer.appendChild(groupLabel);

          // グループ内のオプションを追加
          Array.from(node.childNodes).forEach(optionEl => {
              if (optionEl.nodeName === 'OPTION') {
                  groupContainer.appendChild(createOption(optionEl));
              }
          });
          optionsWrapper.appendChild(groupContainer);

      } else if (node.nodeName === 'OPTION') {
          // グループ外のオプションを追加
          optionsWrapper.appendChild(createOption(node));
      }
  });


  const openSelect = () => {
      if (selectElement.disabled) return; // disabledなら何もしない

      const isOpen = container.classList.contains('open');
      closeAllSelects(isOpen ? null : container); // 自分以外を閉じる

      if (!isOpen) {
          // body にアタッチして最前面に表示
          if (optionsWrapper.parentElement !== document.body) {
            document.body.appendChild(optionsWrapper);
          }
          // 位置計算
          const triggerRect = trigger.getBoundingClientRect();
          // 幅をトリガーに合わせる (minWidthではなくwidthを指定)
          optionsWrapper.style.width = `${triggerRect.width}px`;
          optionsWrapper.style.left = `${triggerRect.left}px`;

          const optionsHeight = Math.min(240, optionsWrapper.scrollHeight); // オプションリストの高さを計算 (最大240px)
          const spaceBelow = window.innerHeight - triggerRect.bottom;
          const spaceAbove = triggerRect.top;

          // 下に十分なスペースがない、かつ上にスペースがある場合は上に表示
          if (spaceBelow < optionsHeight + 10 && spaceAbove > optionsHeight + 10) {
              optionsWrapper.style.top = 'auto';
              optionsWrapper.style.bottom = `${window.innerHeight - triggerRect.top + 5}px`; // 少し隙間を開ける
              optionsWrapper.style.transformOrigin = 'bottom center';
          } else {
              // 基本は下に表示
              optionsWrapper.style.bottom = 'auto';
              optionsWrapper.style.top = `${triggerRect.bottom + 5}px`; // 少し隙間を開ける
              optionsWrapper.style.transformOrigin = 'top center';
          }

          requestAnimationFrame(() => {
              const currentOptionsRect = optionsWrapper.getBoundingClientRect();
              // 画面幅を超える場合の調整 (左右10pxのマージンを確保)
              if(currentOptionsRect.right > window.innerWidth - 10) {
                  optionsWrapper.style.left = `${window.innerWidth - currentOptionsRect.width - 10}px`;
              }
              if(currentOptionsRect.left < 10) {
                   optionsWrapper.style.left = '10px';
              }

              container.classList.add('open');
              trigger.setAttribute('aria-expanded', 'true');
              arrow.style.transform = 'rotate(180deg)';
              optionsWrapper.classList.add('active'); // activeクラスで表示制御
              optionsWrapper.classList.remove('invisible', 'opacity-0', 'translate-y-2', 'translate-y-[-10px]'); // 古いクラス/transformを削除
              optionsWrapper.style.transform = 'translateY(0)'; // アニメーション終点

              // 最初の選択肢、または現在選択中の選択肢にフォーカス
              const selectedOpt = optionsWrapper.querySelector('.custom-select-option.selected') || optionsWrapper.querySelector('.custom-select-option');
              if (selectedOpt) selectedOpt.focus();
          });
      }
  };

  trigger.addEventListener('click', openSelect);
  trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          openSelect();
      }
      if (e.key === 'Escape') {
          e.preventDefault();
          closeAllSelects();
      }
      // TODO: 文字入力による選択肢ジャンプ
  });

  // オプションリスト内のキー操作
  optionsWrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
          e.preventDefault();
          closeAllSelects();
          trigger.focus(); // トリガーにフォーカスを戻す
      }
      // TODO: ArrowUp/ArrowDown でのオプション間移動
  });


  // select要素の値がプログラム的に変更された場合もカスタムUIを更新
  selectElement.addEventListener('change', () => {
    updateSelectedDisplay();
    // オプションリスト内の選択状態クラスとARIA属性も更新
    optionsWrapper.querySelectorAll('.custom-select-option').forEach(opt => {
      const isSelected = opt.dataset.value === selectElement.value;
      opt.classList.toggle('selected', isSelected);
      opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      // ▼▼▼ エラー修正点 ▼▼▼
      if (isSelected) {
          opt.classList.add('bg-[var(--bg-primary)]', 'font-semibold');
      } else {
          opt.classList.remove('bg-[var(--bg-primary)]', 'font-semibold');
      }
      // ▲▲▲ エラー修正点 ▲▲▲
    });
  });

  updateSelectedDisplay(); // 初期表示を更新
  container.append(trigger, selectElement); // selectElementもDOMに追加
  return container;
}

/**
 * 指定されたコンテナを除く、すべての開いているカスタムセレクトを閉じる
 * @param {HTMLDivElement|null} exceptThis -閉じたくないカスタムセレクトのコンテナ要素、またはnull
 */
export function closeAllSelects(exceptThis = null) {
  document.querySelectorAll('.custom-select-container.open').forEach((openSelect) => {
    if (openSelect !== exceptThis) {
      openSelect.classList.remove('open');
      const trigger = openSelect.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false'); // ARIA属性
      const arrow = openSelect.querySelector('.custom-select-arrow');
      if (arrow) arrow.style.transform = 'rotate(0deg)'; // 矢印を戻す

      const optionsWrapper = openSelect.customSelectOptions;
      if (optionsWrapper) {
        optionsWrapper.classList.remove('active'); // activeクラスを削除
        optionsWrapper.classList.add('invisible', 'opacity-0'); // 非表示クラスを追加
        // アニメーション用のtransformもリセット
        if (optionsWrapper.style.transformOrigin === 'bottom center') {
             optionsWrapper.style.transform = 'translateY(-10px)';
        } else {
             optionsWrapper.style.transform = 'translateY(10px)';
        }

        // アニメーション完了後にbodyから削除
        if (optionsWrapper.parentElement === document.body) {
             const removeHandler = () => {
                 if (optionsWrapper.parentElement === document.body) {
                     try { document.body.removeChild(optionsWrapper); } catch(e) {} // 既にない場合のエラーを無視
                 }
                 // 位置スタイルをリセット
                 optionsWrapper.style.minWidth = '';
                 optionsWrapper.style.width = '';
                 optionsWrapper.style.left = '';
                 optionsWrapper.style.top = '';
                 optionsWrapper.style.bottom = '';
                 optionsWrapper.removeEventListener('transitionend', removeHandler); // リスナー削除
             };
             // transitionendが発火しない場合（CSSアニメーションがない等）も考慮し、
             // 一定時間後（アニメーション時間+α）に強制実行するタイマーも設定
             const timerId = setTimeout(removeHandler, 300); // 300ms
             optionsWrapper.addEventListener('transitionend', () => {
                 clearTimeout(timerId); // transitionend が発火したらタイマーは不要
                 removeHandler();
             }, { once: true });
        } else {
             // 位置スタイルをリセット (body直下でない場合)
             optionsWrapper.style.minWidth = '';
             optionsWrapper.style.width = '';
             optionsWrapper.style.left = '';
             optionsWrapper.style.top = '';
             optionsWrapper.style.bottom = '';
        }
      }
    }
  });
}

/**
 * 比較バーのセットアップ
 */
export function setupComparisonBar() {
  const bar = document.getElementById('comparison-bar');
  if (!bar) return;
  bar.querySelector('#compare-now-btn').addEventListener('click', () => {
    if (state.comparisonList.length < 2) {
      showToast('比較するにはエージェントを2人以上選択してください。', 'bg-blue-500');
      return;
    }
    showComparisonModal();
  });
  bar.querySelector('#clear-comparison-btn').addEventListener('click', () => {
    state.comparisonList = [];
    updateComparisonBar();
    // エージェントページが表示されていれば再描画して選択状態を解除
    if (document.getElementById('agent-grid')) {
        renderAgents();
    }
  });
}

/**
 * エージェントを比較リストに追加/削除する
 * @param {string} agentId - 対象のエージェントID
 */
export function toggleAgentComparison(agentId) {
  if (!Array.isArray(state.comparisonList)) state.comparisonList = [];
  const index = state.comparisonList.indexOf(agentId);
  if (index > -1) {
      state.comparisonList.splice(index, 1);
  } else {
    if (state.comparisonList.length >= 3) {
      showToast('比較リストには3人まで追加できます。', 'bg-red-500');
      return; // 追加しない
    }
    state.comparisonList.push(agentId);
  }
  updateComparisonBar(); // バーの表示を更新

  // エージェントグリッド上のカードの選択状態を更新
  const agentGrid = document.getElementById('agent-grid');
  if (agentGrid) {
    // data-agent-id は card の子要素にあるためセレクタ修正
    const card = agentGrid.querySelector(`.card [data-agent-id="${agentId}"]`)?.closest('.card');
    if (card) {
        card.classList.toggle('agent-compare-selected', index === -1); // index === -1 は追加された場合
    } else {
        // カードが見つからない場合（フィルタリングされているなど）
        console.warn(`Card for agent ${agentId} not found in grid to toggle comparison state.`);
    }
  }
}

/**
 * 比較バーの表示内容を現在の比較リストに基づいて更新する
 */
export function updateComparisonBar() {
  const bar = document.getElementById('comparison-bar');
  const listDiv = document.getElementById('comparison-list');
  const compareBtn = document.getElementById('compare-now-btn');
  if (!bar || !listDiv || !compareBtn) return;

  if (state.comparisonList.length === 0) {
    bar.classList.add('translate-y-full'); // バーを隠す
    return;
  }

  bar.classList.remove('translate-y-full'); // バーを表示
  listDiv.innerHTML = state.comparisonList
    .map((id) => {
      const agent = state.allAgents.find((a) => a.id === id);
      const iconUrl = agent?.imageUrls?.style1?.['2d'];
      const iconHtml = iconUrl ? `<img src="${iconUrl}" alt="${agent?.name || id}" class="w-6 h-6 rounded-full object-cover mr-1.5 flex-shrink-0">` : ''; // alt属性に名前かIDを設定
      // テキストが長い場合に省略(...)するようにクラスを追加
      return `<span class="flex items-center px-2.5 py-1 text-xs sm:text-sm font-semibold rounded-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-sm max-w-[120px] sm:max-w-[150px]">
                ${iconHtml}
                <span class="truncate">${agent ? agent.name : '不明'}</span>
              </span>`;
    })
    .join('');
  compareBtn.disabled = state.comparisonList.length < 2; // 2人以上で比較ボタン有効化
}

/**
 * 画面右下にトーストメッセージを表示する
 * @param {string} message - 表示するメッセージ
 * @param {string} [bgColor='bg-green-500'] - 背景色のTailwindクラス
 */
export function showToast(message, bgColor = 'bg-green-500') {
  const toastId = `toast-${Date.now()}`; // 一意のIDを生成
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = `fixed bottom-5 right-5 text-white py-2 px-4 rounded-lg shadow-xl transform translate-y-full opacity-0 transition-all duration-300 ease-out z-[200] ${bgColor}`; // translate-y-full に変更
  toast.textContent = message;
  toast.setAttribute('role', 'alert'); // アクセシビリティのため
  document.body.appendChild(toast);

  // 表示アニメーション (requestAnimationFrameで確実に描画後に実行)
  requestAnimationFrame(() => {
      toast.classList.remove('translate-y-full', 'opacity-0');
      toast.classList.add('translate-y-0'); // 上にスライドイン
  });

  // 非表示アニメーションと削除
  const timeoutId = setTimeout(() => { // timeout ID を保持
    // 要素が存在するか確認してからクラスを追加
    const currentToast = document.getElementById(toastId);
    if (currentToast) {
        currentToast.classList.add('opacity-0', 'translate-y-full'); // 完全に非表示にする
        // transitionend イベントで削除
        currentToast.addEventListener('transitionend', () => {
            // 再度要素が存在するか確認してから削除
            if (currentToast.parentNode === document.body) {
                try { document.body.removeChild(currentToast); } catch(e) {} // 既にない場合のエラーを無視
            }
        }, { once: true });
    }
  }, 3000); // 3秒後に消え始める

   // Toastをクリックしたらすぐに消すイベントリスナーを追加
   toast.addEventListener('click', () => {
       clearTimeout(timeoutId); // 自動削除タイマーをキャンセル
       toast.classList.add('opacity-0', 'translate-y-full');
       toast.addEventListener('transitionend', () => {
           if (toast.parentNode === document.body) {
               try { document.body.removeChild(toast); } catch(e) {}
           }
       }, { once: true });
   }, { once: true });
}