// js/features/disc-calculator.js
import { state } from '../main.js';
import { createCustomSelect, showToast, closeAllSelects } from '../ui/components.js';
import { showMyDiscCreatorModal, openModal, closeModal, showLoginModal } from '../ui/modals.js'; // showLoginModal を追加
import { saveMyDiscs, deleteDisc } from '../firebase-auth.js'; // マイディスク保存・削除機能
import {
  getCharacterWeights,
  normalizeStatKey,
  getCharacterSoftCapInfo
} from '../data/disc-score-data.js';
import { mainStatsGrowthData, subStatsGrowthData } from '../data/growth-data.js';
import { constants } from '../constants.js'; // 役割色など

// --- STATE ---
// 各カード（ディスク部位）の状態を保持するオブジェクト
// { discNum: { level, initialOpCount, evaluationCriteria, mainStat, subStats:[{name, hits, value},...], useSoftCap } }
let cardStates = {};
// 現在アクティブ（表示中）のディスク部位の Set
let activeDiscs = new Set([1, 2, 3, 4, 5, 6]);
// 他キャラ推奨リストの現在のフィルター状態
let currentOtherAgentRoleFilter = 'all';
// 他キャラ推奨リストの計算結果を保持 (フィルタリング用)
let lastOtherAgentScores = [];

// --- CONSTANTS ---
// スコアランク定義
const SCORE_RANKS = {
  SSS: { min: 95, label: '理論値級 / 神装備', colors: ['#ffde59', '#ff914d', '#ff5757'] },
  SS:  { min: 90, label: '厳選完了レベル',     colors: ['#ff5757', '#c445a8', '#9642f5'] },
  S:   { min: 85, label: '非常に強力',         colors: ['#9642f5', '#4f56f5', '#2196f3'] },
  A:   { min: 75, label: '妥協点として優秀',   colors: ['#2196f3', '#39c6a7', '#4caf50'] },
  B:   { min: 65, label: 'つなぎとして使用可能', colors: ['#66bb6a', '#9ccc65', '#d4e157'] },
  C:   { min: 0,  label: '素材推奨',           colors: ['#9e9e9e', '#757575', '#616161'] }
};

// サブステータスの最大強化回数（単一 / 合計） - Lv15 Sランク基準
const MAX_SUBSTAT_UPGRADES_SINGLE_MAX = 5; // 1つのサブステに振れる最大強化回数 (初期値含めると6HIT)

// メインステータスの選択肢リスト (ディスク番号ごと)
const MAIN_STAT_OPTIONS_BY_SLOT = {
    '1': ['HP(実数値)'],
    '2': ['攻撃力(実数値)'],
    '3': ['防御力(実数値)'],
    '4': ['HP(%)', '攻撃力(%)', '防御力(%)', '会心率', '会心ダメージ', '異常マスタリー'],
    '5': ['HP(%)', '攻撃力(%)', '防御力(%)', '物理属性ダメージ%', '炎属性ダメージ%', '氷属性ダメージ%', '電気属性ダメージ%', 'エーテル属性ダメージ%', '玄墨属性ダメージ%', '貫通率'], // 玄墨も追加
    '6': ['HP(%)', '攻撃力(%)', '防御力(%)', '異常掌握', 'エネルギー自動回復', '衝撃力']
};

// メインステータスER換算値テーブル (Lv別) - 事前計算
const mainStatERTable = {};
mainStatsGrowthData.forEach(mainStat => {
    // 属性ダメージは汎用キー '属性ダメージ' でテーブルを作成
    const baseName = mainStat.name.includes('属性ダメージ') ? '属性ダメージ' : mainStat.name;
    if (!mainStatERTable[baseName]) {
        mainStatERTable[baseName] = { 0: 0, 3: 0, 6: 0, 9: 0, 12: 0, 15: 0 };
    }
    // 対応するサブステの1HIT上昇値を取得
    const subStatKey = normalizeStatKey(baseName); // disc-score-data.js の normalizeStatKey を使用
    const subStatGrowth = subStatsGrowthData.find(s => normalizeStatKey(s.name) === subStatKey || (subStatKey.includes('属性ダメージ') && s.name.includes('%')));
    // サブステに存在しないメインステ（異常掌握など）の場合、perHit=1としてER=Valueとして扱う
    const subPerHitValue = subStatGrowth ? subStatGrowth.perHit : 1;

    // Lv0 (初期値) のER換算値
    if (mainStatERTable[baseName]) {
        // 0除算を避ける
        mainStatERTable[baseName][0] = subPerHitValue !== 0 ? parseFloat((mainStat.initial / subPerHitValue).toFixed(1)) : 0;
    }

    let currentValue = mainStat.initial;
    for (let i = 0; i < mainStat.perHit.length; i++) {
        currentValue += mainStat.perHit[i];
        const level = (i + 1) * 3;
        // ER換算値 (小数点第1位まで)
        if (mainStatERTable[baseName]) {
            mainStatERTable[baseName][level] = subPerHitValue !== 0 ? parseFloat((currentValue / subPerHitValue).toFixed(1)) : 0;
        }
    }
    // Lv15時の理論値 (max / subPerHitValue) を再計算して上書き (丸め誤差防止)
    if (mainStatERTable[baseName]) {
        // Lv15の理論値が0になる場合（例：サブにないステータス）、元の値を保持する（あるいはNaNを防ぐ）
        const calculatedMaxER = subPerHitValue !== 0 ? parseFloat((mainStat.max / subPerHitValue).toFixed(1)) : 0;
        // 0除算や計算不能でNaNになった場合も考慮し、0以下の場合は直前のレベルの値を参照（暫定処置）
        mainStatERTable[baseName][15] = (isNaN(calculatedMaxER) || calculatedMaxER <= 0) ? (mainStatERTable[baseName][12] || 0) : calculatedMaxER;
    }
});
// console.log("Pre-calculated Main Stat ER Table:", mainStatERTable); // デバッグ用

// --- HELPERS ---

/**
 * 与えられたスコア（達成率%）に対応するランク情報を取得する
 * @param {number} perfectionScore - 0から100のスコア
 * @returns {{rank: string, data: object}} ランク情報
 */
function getRankForPerfection(perfectionScore) {
  // スコアがマイナスやNaNの場合も考慮
  const score = isNaN(perfectionScore) ? 0 : Math.max(0, perfectionScore);
  for (const rank in SCORE_RANKS) {
    if (score >= SCORE_RANKS[rank].min) {
      return { rank, data: SCORE_RANKS[rank] };
    }
  }
  return { rank: 'C', data: SCORE_RANKS.C }; // デフォルト
}

/**
 * サブステータスの名前から、1HITあたりの上昇値を取得する
 * @param {string} subStatName - サブステータス名
 * @returns {number} 1HITあたりの上昇値 (見つからない場合は1)
 */
function getSubStatPerHitValue(subStatName) {
    const normalized = normalizeStatKey(subStatName); // disc-score-data.js の関数を使用
    const growthInfo = subStatsGrowthData.find(s => normalizeStatKey(s.name) === normalized);
    // initial と perHit は同じ値のはずなので perHit を返す
    return growthInfo ? growthInfo.perHit : 1;
}

/**
 * メインステータスの名前とレベルから、ER換算値を取得する
 * @param {string} mainStatName - メインステータス名
 * @param {number} level - ディスクレベル (0, 3, 6, 9, 12, 15)
 * @returns {number} ER換算値
 */
function getMainStatER(mainStatName, level) {
    const normalized = normalizeStatKey(mainStatName);
    // 属性ダメージ% の汎用キー処理
    const keyToLookup = normalized.includes('属性ダメージ') ? '属性ダメージ' : normalized;
    // level が 0, 3, 6, 9, 12, 15 以外の場合は 15 として扱う
    const validLevel = [0, 3, 6, 9, 12, 15].includes(level) ? level : 15;
    return mainStatERTable[keyToLookup]?.[validLevel] || 0;
}

/**
 * レベルと初期OP数から、サブステータスの最大合計強化回数上限を取得
 * @param {number} level - ディスクレベル (3, 6, 9, 12, 15)
 * @param {number} initialOpCount - 初期OP数 (3 or 4)
 * @returns {number} 最大合計強化回数
 */
function getMaxTotalSubUpgrades(level, initialOpCount) {
    const totalEnhancements = Math.floor(level / 3);
    if (initialOpCount === 3) {
        // 最初の強化は4OP目追加に使うため、強化に使える回数は1引く
        return Math.max(0, totalEnhancements - 1);
    } else {
        return totalEnhancements;
    }
}

/**
 * レベルと初期OP数から、サブステータスの理論的最大ER合計 (最大HIT数) を取得
 * @param {number} level - ディスクレベル (3, 6, 9, 12, 15)
 * @param {number} initialOpCount - 初期OP数 (3 or 4)
 * @returns {number} 理論的最大サブER合計 (最大HIT数)
 */
function getMaxSubERTotal(level, initialOpCount) {
    const maxUpgrades = getMaxTotalSubUpgrades(level, initialOpCount);
    // 初期OP数 + 最大強化回数 = 最大HIT数
    // Lv0 の場合 maxUpgrades は 0 なので、初期OP数のみが返る
    return initialOpCount + maxUpgrades;
}

/**
 * ステータスの値をフォーマットする（%表示など）
 * @param {number} value - 数値
 * @param {string} statName - ステータス名
 * @returns {string} フォーマットされた文字列
 */
function formatStatValue(value, statName) {
    if (!statName || isNaN(value) || value < 0) return ''; // 0は表示
    const normalizedName = normalizeStatKey(statName); // disc-score-data.js の関数を使用
    // メインステータスにしか付かないステータスも%表示対象に追加
    const isPercent = normalizedName.includes('%') ||
                      ['会心率', '会心ダメージ', 'エネルギー自動回復', '貫通率', '衝撃力', '異常掌握'].includes(normalizedName);

    // toFixed(1) は % の時だけ、実数値は round
    return isPercent ? value.toFixed(1) + '%' : String(Math.round(value));
}

/**
 * サブステータスの価値に応じたCSSクラスを返す
 * @param {string} agentId - キャラクターID
 * @param {string} subStatName - サブステータス名
 * @param {boolean} useSoftCap - 閾値評価を使うか
 * @returns {string} Tailwind CSSクラス名 (value-feedback-xxxx)
 */
function getValueFeedbackClass(agentId, subStatName, useSoftCap) {
    if (!agentId || !subStatName) return 'value-feedback-gray';
    const weights = getCharacterWeights(agentId, useSoftCap);
    const weight = weights[normalizeStatKey(subStatName)] ?? 0;

    if (weight >= 0.95) return 'value-feedback-gold';    // SSS
    else if (weight >= 0.8) return 'value-feedback-purple'; // SS
    else if (weight >= 0.6) return 'value-feedback-blue';   // S
    else if (weight >= 0.3) return 'value-feedback-green';  // A
    else return 'value-feedback-gray';                    // B or C
}


// --- LOCAL STORAGE ---
function saveCalculatorState() {
  try {
    const agentSelect = document.getElementById('calc-agent-select');
    if (agentSelect) localStorage.setItem('calc_selectedAgent', agentSelect.value);

    // activeDiscsに含まれる番号のカード状態のみ保存する
    const stateToSave = {};
    activeDiscs.forEach(discNum => {
        // DOMから最新の状態を読み取って保存
        const card = document.querySelector(`.disc-input-card[data-card-id="${discNum}"]`);
        if (card) {
            cardStates[discNum] = readCardState(card); // cardStatesグローバルを更新
            stateToSave[discNum] = cardStates[discNum]; // 保存用オブジェクトにもセット
        } else if (cardStates[discNum]) {
            // DOMにないがメモリにある場合（非表示直後など）
            stateToSave[discNum] = cardStates[discNum];
        }
    });
    localStorage.setItem('calc_cardStates', JSON.stringify(stateToSave));
    localStorage.setItem('calc_activeDiscs', JSON.stringify(Array.from(activeDiscs)));

    const autoCalc = document.getElementById('auto-calc-toggle');
    if(autoCalc) localStorage.setItem('calc_autoCalc', autoCalc.checked);

  } catch (e) {
      console.error("Failed to save calculator state to localStorage:", e);
      showToast('設定の保存に失敗しました。ストレージ容量を確認してください。', 'bg-red-500');
  }
}

function loadCalculatorState() {
  try {
    const savedAgent = localStorage.getItem('calc_selectedAgent');
    const savedCardStates = localStorage.getItem('calc_cardStates');
    const savedActiveDiscs = localStorage.getItem('calc_activeDiscs');
    const savedAutoCalc = localStorage.getItem('calc_autoCalc');

    if (savedActiveDiscs) {
        const parsedActive = JSON.parse(savedActiveDiscs);
        activeDiscs = (Array.isArray(parsedActive) && parsedActive.length > 0)
            ? new Set(parsedActive.map(Number).filter(n => n >= 1 && n <= 6))
            : new Set([1, 2, 3, 4, 5, 6]);
    } else {
        activeDiscs = new Set([1, 2, 3, 4, 5, 6]);
    }
    cardStates = savedCardStates ? JSON.parse(savedCardStates) : {};

    activeDiscs.forEach(discNum => {
        const defaultState = {
            level: 15, initialOpCount: 4, evaluationCriteria: 'maxLevel',
            mainStat: '', subStats: [{}, {}, {}, {}], useSoftCap: false
        };
        // 保存されたステートとデフォルトをマージ（保存値を優先）
        cardStates[discNum] = { ...defaultState, ...(cardStates[discNum] || {}) };

        // subStats が配列でない、または4枠ない場合も修正
        if (!Array.isArray(cardStates[discNum].subStats) || cardStates[discNum].subStats.length < 4) {
            const existingSubs = Array.isArray(cardStates[discNum].subStats) ? cardStates[discNum].subStats : [];
            // 必ず4要素にする（足りない分は空オブジェクトで埋める）
            cardStates[discNum].subStats = [
                existingSubs[0] || {}, existingSubs[1] || {}, existingSubs[2] || {}, existingSubs[3] || {}
            ];
        } else {
             // 4要素以上ある場合（古いデータなど）は4要素に切り詰める
             cardStates[discNum].subStats = cardStates[discNum].subStats.slice(0, 4);
             // 各要素がオブジェクトであることを保証
             cardStates[discNum].subStats = cardStates[discNum].subStats.map(s => (typeof s === 'object' && s !== null) ? s : {});
        }

        // useSoftCap がなければ false を設定
        if (cardStates[discNum].useSoftCap === undefined) {
            cardStates[discNum].useSoftCap = false;
        }
    });

    // agentSelect の値も復元 (要素が存在すれば)
    const agentSelect = document.getElementById('calc-agent-select');
    if (agentSelect && savedAgent && state.characterWeights[savedAgent]) {
        agentSelect.value = savedAgent;
        // カスタムセレクトの表示更新は init 内で createCustomSelect 後に行う
    }

    // 自動計算トグルの状態復元 (要素が存在すれば)
    const autoCalcToggle = document.getElementById('auto-calc-toggle');
    if (autoCalcToggle) {
        autoCalcToggle.checked = savedAutoCalc === 'true'; // 文字列からブール値へ
    }

  } catch (e) {
      console.error("Failed to load calculator state from localStorage:", e);
      // エラー発生時はデフォルト値に戻し、ストレージをクリア
      cardStates = {};
      activeDiscs = new Set([1, 2, 3, 4, 5, 6]);
      localStorage.removeItem('calc_cardStates');
      localStorage.removeItem('calc_activeDiscs');
      localStorage.removeItem('calc_selectedAgent');
      localStorage.removeItem('calc_autoCalc');
      showToast('設定の読み込みに失敗しました。設定をリセットします。', 'bg-red-500');
  }
}

// カスタムセレクトの表示更新用ヘルパー (loadCalculatorState で使用)
function updateCustomSelectDisplay(container) {
    const selectElement = container.querySelector('select');
    const selectedDisplay = container.querySelector('.custom-select-trigger span:first-child');
    if (!selectElement || !selectedDisplay) return;

    const selectedOption = selectElement.options[selectElement.selectedIndex];
    let placeholderText = selectElement.options[0]?.textContent || '選択...';
    // 最初のオプションがvalue=""でプレースホルダー用ならそれを使う
    if (selectElement.options[0] && !selectElement.options[0].value) {
        placeholderText = selectElement.options[0].textContent;
    }
    let hasValue = false;
    let content = `<span>${placeholderText}</span>`;

    if (selectedOption && selectedOption.value) {
      const iconUrl = selectedOption.dataset.icon;
      content = `<span>${selectedOption.textContent}</span>`;
      if (iconUrl) {
        content = `<img src="${iconUrl}" class="option-icon w-5 h-5 rounded object-contain flex-shrink-0" alt="">${content}`;
      }
      hasValue = true;
      // Trigger の aria-label も更新
      const trigger = container.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-label', `選択中: ${selectedOption.textContent}`);
    } else {
        const trigger = container.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-label', placeholderText);
    }
    selectedDisplay.innerHTML = content;
    selectedDisplay.classList.toggle('text-[var(--text-secondary)]', !hasValue);
    selectedDisplay.classList.toggle('text-[var(--text-primary)]', hasValue);
}

// --- ▼▼▼ [エラー修正] UI更新関数群を先に定義 ▼▼▼ ---

/**
 * メインステータス選択肢を動的に更新する
 * @param {HTMLElement} card - 対象のカード要素
 * @param {number} discNum - ディスク番号
 * @param {string} selectedValue - 現在選択されている値
 */
function updateMainStatOptions(card, discNum, selectedValue) {
  const wrapper = card.querySelector('.main-stat-wrapper');
  if (!wrapper) return;

  const options = MAIN_STAT_OPTIONS_BY_SLOT[discNum] || [];

  if (discNum <= 3) {
    // 1-3番は固定表示
    const mainStatName = options[0] || '';
    // data-value属性に値を保持
    wrapper.innerHTML = `<div class="main-stat-placeholder font-medium" data-value="${mainStatName}">${mainStatName}</div>`;
  } else {
    // 4-6番はドロップダウン
    const newSelect = document.createElement('select');
    newSelect.id = `calc-main-stat-${discNum}`; // IDを追加
    newSelect.className = 'calc-main-stat w-full'; // class 追加
    // 選択肢を生成。selectedValueがあればそれを選択済みにする。
    newSelect.innerHTML = `<option value="">メイン選択</option>${options.map(s => `<option value="${s}" ${selectedValue === s ? 'selected' : ''}>${s}</option>`).join('')}`;
    wrapper.innerHTML = ''; // 中身をクリア
    wrapper.appendChild(createCustomSelect(newSelect, { placeholder: 'メインを選択...' }));
  }

  // メインステータスのERと数値表示も更新
  const cardState = readCardState(card); // 更新後のDOMから状態を読む
  updateHitLimitsAndMainERDisplay(card, cardState);
}


/**
 * メインステータス変更時に、サブステータスの選択肢の有効/無効を切り替える
 * @param {HTMLElement} card - 対象のカード要素
 * @param {string} selectedMainStat - 選択されたメインステータス名
 */
function updateSubStatOptionsValidity(card, selectedMainStat) {
    const mainStatNorm = normalizeStatKey(selectedMainStat);
    card.querySelectorAll('.calc-sub-stat').forEach(subSelect => {
        let needsRecreate = false; // カスタムセレクト再生成フラグ
        let currentValue = subSelect.value; // 現在の値

        Array.from(subSelect.options).forEach(option => {
            if (option.value) { // valueが空でないオプションのみ処理
                const subStatNorm = normalizeStatKey(option.value);
                const shouldDisable = subStatNorm === mainStatNorm;
                if (option.disabled !== shouldDisable) {
                    option.disabled = shouldDisable;
                    needsRecreate = true; // 無効状態が変わった
                }
                // もし現在選択中のものが無効になったら、選択を解除
                if (shouldDisable && currentValue === option.value) {
                    currentValue = ''; // 選択をリセット
                    // 対応する数値入力とHIT数表示もクリア
                    const row = subSelect.closest('.sub-stat-row');
                    if (row) {
                        const valueInput = row.querySelector('.calc-sub-value');
                        const hitDisplay = row.querySelector('.calc-sub-hits-display');
                        if (valueInput) valueInput.value = '';
                        if (hitDisplay) hitDisplay.textContent = '1';
                    }
                }
            }
        });

        // 無効状態が変わったか、選択が解除されたらカスタムセレクトを再生成
        if (needsRecreate || subSelect.value !== currentValue) {
            subSelect.value = currentValue; // select本体の値を更新
            const wrapper = subSelect.closest('.select-wrapper-sub-stat');
            if (!wrapper) return; // wrapper がなければ処理中断
            const placeholder = subSelect.options[0]?.textContent || `サブステ...`;
            // 再生成前に古いイベントリスナ等をクリーンアップ（念のため）

            const newCustomSelect = createCustomSelect(subSelect, { placeholder: placeholder });
            wrapper.innerHTML = ''; // 古いセレクタを削除 (インジケータも消えるので再追加)
             // value-feedback-indicator を再追加
             const indicator = document.createElement('div');
             indicator.className = 'value-feedback-indicator absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-4 rounded-full value-feedback-gray';
             wrapper.appendChild(indicator);
             wrapper.appendChild(newCustomSelect); // 新しいセレクタを追加
             // 再生成後、値フィードバックを更新
             updateValueFeedback(card);
        }
    });
}

/**
 * サブステ選択時の価値フィードバック（色分け）を更新
 * @param {HTMLElement} card - 対象のカード要素
 */
function updateValueFeedback(card) {
    const agentId = document.getElementById('calc-agent-select')?.value;
    if (!agentId) { // キャラ未選択時はデフォルト（灰色）
         card.querySelectorAll('.value-feedback-indicator').forEach(indicator => {
             if(indicator) indicator.className = 'value-feedback-indicator absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-4 rounded-full value-feedback-gray';
         });
         return;
    }

    const cardState = readCardState(card); // 現在の状態を読む
    const weights = getCharacterWeights(agentId, cardState.useSoftCap);
    if (!weights) return;

    card.querySelectorAll('.sub-stat-row').forEach(row => {
        const subStatName = row.querySelector('.calc-sub-stat')?.value;
        const indicator = row.querySelector('.value-feedback-indicator');
        if (!indicator) return;

        const colorClass = getValueFeedbackClass(agentId, subStatName, cardState.useSoftCap);
        // クラス名を付け替える
        indicator.className = `value-feedback-indicator absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-4 rounded-full ${colorClass}`;
    });
}


/**
 * +/- ボタンの状態を更新する
 * @param {HTMLElement} card - 対象のカード要素
 * @param {object} cardState - カードの状態オブジェクト
 */
function updateHitButtonStates(card, cardState) {
    const maxTotalSubUpgrades = getMaxTotalSubUpgrades(cardState.level, cardState.initialOpCount);
    // 現在の合計強化回数
    const currentTotalUpgrades = (cardState.subStats || []).reduce((sum, s) => sum + Math.max(0, (s.hits || 1) - 1), 0);

    card.querySelectorAll('.sub-stat-row').forEach((row, index) => {
        const plusButton = row.querySelector('.hit-change-btn[data-action="plus"]');
        const minusButton = row.querySelector('.hit-change-btn[data-action="minus"]');
        const currentHits = (cardState.subStats[index]?.hits || 1);

        if (plusButton) {
            const nextHit = currentHits + 1;
            // 単一上限チェック OR 合計上限チェック
            plusButton.disabled = nextHit > (MAX_SUBSTAT_UPGRADES_SINGLE_MAX + 1) ||
                                  currentTotalUpgrades >= maxTotalSubUpgrades; // 次に押すと超える場合
        }
        if (minusButton) {
            minusButton.disabled = currentHits <= 1; // 1HIT未満にはできない
        }
    });
}


/**
 * カード内の表示（HIT数上限、メインステER、サブステ数値、+/- ボタン状態）を更新
 * @param {HTMLElement} card - 対象のカード要素
 * @param {object} cardState - カードの状態オブジェクト
 */
function updateHitLimitsAndMainERDisplay(card, cardState) {
    // サブステ合計強化回数上限表示
    const limitSpan = card.querySelector('.sub-upgrades-limit');
    if (limitSpan) {
        limitSpan.textContent = getMaxTotalSubUpgrades(cardState.level, cardState.initialOpCount);
    }
    // メインステータスER表示
    const mainErSpan = card.querySelector('.main-stat-er-display');
    const mainValueSpan = card.querySelector('.calc-main-stat-value');
    if (mainErSpan && mainValueSpan) {
        const mainER = getMainStatER(cardState.mainStat, cardState.level);
        mainErSpan.textContent = mainER > 0 ? `(${mainER.toFixed(1)} ER)` : '';
        // メインステータスの数値表示も更新
        const mainStatInfo = mainStatsGrowthData.find(s => normalizeStatKey(s.name) === normalizeStatKey(cardState.mainStat) || (normalizeStatKey(cardState.mainStat).includes('属性ダメージ') && s.name === '属性ダメージ'));
        let currentValue = mainStatInfo ? mainStatInfo.initial : 0;
        if (mainStatInfo && mainStatInfo.perHit && cardState.level > 0) { // Lv0以上で計算
            const upgradeCount = Math.floor(cardState.level / 3);
            for(let i = 0; i < upgradeCount; i++) {
                // perHit 配列が存在し、インデックスが範囲内か確認
                if(mainStatInfo.perHit[i] !== undefined) {
                    currentValue += mainStatInfo.perHit[i];
                }
            }
        } else if (mainStatInfo && cardState.level === 0) {
            currentValue = mainStatInfo.initial; // Lv0 は初期値
        }
        mainValueSpan.textContent = formatStatValue(currentValue, cardState.mainStat);
    }
    // +/- ボタンの状態更新
    updateHitButtonStates(card, cardState);
}

/**
 * サブステータスの数値表示を現在のHIT数に基づいて更新
 * @param {HTMLElement} card - 対象のカード要素
 * @param {object} cardState - カードの状態オブジェクト
 */
function updateSubStatValueDisplays(card, cardState) {
    card.querySelectorAll('.sub-stat-row').forEach((row, index) => {
        const subStat = cardState.subStats[index];
        const valueInput = row.querySelector('.calc-sub-value');
        if (valueInput) {
            if (subStat && subStat.name && subStat.hits > 0) {
                const perHitValue = getSubStatPerHitValue(subStat.name);
                const calculatedValue = perHitValue * subStat.hits;
                valueInput.value = formatStatValue(calculatedValue, subStat.name);
            } else {
                valueInput.value = ''; // 名前が選択されていないかHIT数が0なら空
            }
        }
    });
}

/**
 * 合計強化回数の表示を更新
 * @param {HTMLElement} card - 対象のカード要素
 * @param {object} cardState - カードの状態オブジェクト
 */
function updateTotalUpgradesDisplay(card, cardState) {
    // 強化回数 (HIT数-1) の合計
    const currentTotalUpgrades = (cardState.subStats || []).reduce((sum, s) => sum + Math.max(0, (s.hits || 1) - 1), 0);
    const currentSpan = card.querySelector('.sub-upgrades-current');
    if (currentSpan) {
        currentSpan.textContent = currentTotalUpgrades;
    }
}

/**
 * cardStateオブジェクトに基づいてサブステのHIT数と数値表示を更新
 * @param {HTMLElement} card - 対象のカード要素
 * @param {object} cardState - カードの状態オブジェクト
 */
function updateSubStatDisplaysFromState(card, cardState) {
    card.querySelectorAll('.sub-stat-row').forEach((row, index) => {
        const subStat = cardState.subStats[index];
        const hitDisplay = row.querySelector('.calc-sub-hits-display');
        const valueInput = row.querySelector('.calc-sub-value');
        const name = subStat?.name || '';
        const hits = subStat?.hits || 1; // デフォルト1

        if (hitDisplay) hitDisplay.textContent = hits;
        if (valueInput) {
            if (name) {
                const perHitValue = getSubStatPerHitValue(name);
                const calculatedValue = perHitValue * hits;
                valueInput.value = formatStatValue(calculatedValue, name);
            } else {
                valueInput.value = ''; // 名前がなければクリア
                 if(hitDisplay) hitDisplay.textContent = '1'; // 名前がなければHIT数もリセット
            }
        }
    });
}

/**
 * サブステータスのHIT数が上限を超えていないか検証し、超えていれば補正
 * @param {HTMLElement} card - 対象のカード要素
 * @param {object} cardState - カードの状態オブジェクト (変更される可能性あり)
 */
function validateSubStatHits(card, cardState) {
    const maxTotalSubUpgrades = getMaxTotalSubUpgrades(cardState.level, cardState.initialOpCount);
    let currentTotalSubUpgrades = (cardState.subStats || []).reduce((sum, s) => sum + Math.max(0, (s.hits || 1) - 1), 0);

    if (currentTotalSubUpgrades > maxTotalSubUpgrades) {
        showToast(`レベル/初期OP変更により合計強化回数上限 (${maxTotalSubUpgrades}) を超過。HIT数を調整します。`, 'bg-yellow-500');
        // 超過分を、HIT数が最も多いサブステから減らす（簡易的な補正）
        let excess = currentTotalSubUpgrades - maxTotalSubUpgrades;

        // 減らす対象をHIT数が多い順にソート (indexも保持)
        const sortedSubs = (cardState.subStats || [])
            .map((s, index) => ({ hits: s.hits || 1, index }))
            .sort((a, b) => b.hits - a.hits);

        for (const sub of sortedSubs) {
            if (excess <= 0) break;
            const currentHits = sub.hits;
            if (currentHits > 1) { // 1HIT(初期値)未満にはしない
                const reduceAmount = Math.min(excess, currentHits - 1); // 減らせる量
                cardState.subStats[sub.index].hits -= reduceAmount;
                excess -= reduceAmount;
            }
        }

        // UIを更新
        updateSubStatDisplaysFromState(card, cardState); // HIT数と数値を更新
        updateTotalUpgradesDisplay(card, cardState); // 合計表示を更新
        updateHitButtonStates(card, cardState); // ボタン状態を更新
    } else {
        // 上限を超えていない場合も、ボタンの状態は更新が必要
        updateHitButtonStates(card, cardState);
    }
}


/**
 * カード内のUIを状態に基づいて更新し、重複があれば修正する
 * @param {HTMLElement} card - 対象のカード要素
 */
function updateAndValidateCardUI(card) {
    let cardState = readCardState(card); // まず現在の状態を読む
    const selectedSubStats = new Set();
    let needsUpdate = false; // UI更新が必要か
    const mainStatNorm = normalizeStatKey(cardState.mainStat);

    // サブステの重複チェックと修正
    card.querySelectorAll('.sub-stat-row').forEach((row, index) => {
        const select = row.querySelector('.calc-sub-stat');
        if (!select) return;
        const currentSubStat = select.value;

        if (currentSubStat) {
            const normSub = normalizeStatKey(currentSubStat);

            // メインステータスと同じか、他のサブステで既に選択されているか
            if ((mainStatNorm && normSub === mainStatNorm) || selectedSubStats.has(normSub)) {
                // 重複が発生した場合
                select.value = ''; // UIの選択を解除
                needsUpdate = true;

                // カスタムセレクトの表示をリセット
                const customSelectContainer = select.closest('.custom-select-container');
                if (customSelectContainer) updateCustomSelectDisplay(customSelectContainer);

                // 対応する数値入力とHIT数表示もクリア
                row.querySelector('.calc-sub-value').value = '';
                row.querySelector('.calc-sub-hits-display').textContent = '1';

                // 価値フィードバックもリセット
                const indicator = row.querySelector('.value-feedback-indicator');
                if (indicator) indicator.className = 'value-feedback-indicator absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-4 rounded-full value-feedback-gray';

            } else {
                selectedSubStats.add(normSub);
            }
        }
    });

    if (needsUpdate) {
        showToast('ステータスが重複したためリセットされました。', 'bg-yellow-500');
    }

    // 変更後の最新の状態で cardState を再取得
    const finalCardState = readCardState(card);

    // メインステータスのERと数値表示更新
    updateHitLimitsAndMainERDisplay(card, finalCardState);
    // サブステータスの数値表示更新 (重複解除後)
    updateSubStatValueDisplays(card, finalCardState);
    // 合計強化回数表示更新 (重複解除後)
    updateTotalUpgradesDisplay(card, finalCardState);
    // +/- ボタン状態更新 (重複解除後)
    updateHitButtonStates(card, finalCardState);
}

// --- ▲▲▲ [エラー修正] UI更新関数群を先に定義 ▲▲▲ ---

// --- ▼▼▼ [エラー修正] UI更新関数群を initDiscCalculatorPage より前に定義 ▼▼▼ ---


// --- EVENT HANDLERS ---

/**
 * カード内の入力変更を処理するメインハンドラ (イベント委譲用)
 * @param {Event} event - input, change, click イベント
 */
function handleCardInputChange(event) {
  const targetEl = event.target;
  const card = targetEl.closest('.disc-input-card');
  if (!card) return; // 関係ないイベントは無視

  let cardState = readCardState(card); // 現在のUIから状態を読む
  let stateChanged = false; // 状態が変更されたかどうかのフラグ

  // HIT数 +/- ボタンの処理
  if (event.type === 'click' && targetEl.classList.contains('hit-change-btn')) {
    handleHitButtonClick(targetEl, card, cardState);
    stateChanged = true;
  }
  // 数値入力フィールドの処理 (input イベントでリアルタイムに)
  else if (event.type === 'input' && targetEl.classList.contains('calc-sub-value')) {
    handleValueInputChange(targetEl, card, cardState);
    stateChanged = true;
  }
  // 数値入力フィールドからフォーカスが外れた時の処理 (最終補正)
  // 'change' イベントは blur 時に発火するためここで処理
  else if (event.type === 'change' && targetEl.classList.contains('calc-sub-value')) {
      handleValueInputBlur(targetEl);
      stateChanged = true;
  }
  // セレクトボックス（メイン、サブ）の変更処理
  else if (event.type === 'change' && (targetEl.classList.contains('calc-main-stat') || targetEl.classList.contains('calc-sub-stat'))) {
    stateChanged = true; // セレクト変更も状態変更

    // メインステータス変更時はサブステータスの選択肢を更新 & 重複チェック
    if (targetEl.classList.contains('calc-main-stat')) {
        updateSubStatOptionsValidity(card, targetEl.value);
    }
    // サブステータス変更時も重複チェックと値フィードバック更新
    updateAndValidateCardUI(card); // この中で readCardState が呼ばれ cardStates も更新される想定

    // 値フィードバック更新
    updateValueFeedback(card);
  }
  // レベル、初期OP、評価基準のトグル/セレクト変更処理
  // Note: トグルボタンのクリックイベントも拾う必要がある
  else if (event.type === 'change' || (event.type === 'click' && targetEl.closest('.op-toggle-group'))) {
      const levelSelect = targetEl.closest(`#calc-level-wrapper-${card.dataset.cardId}`)?.querySelector('select');
      const opToggle = targetEl.closest('.op-toggle-btn[data-op]');
      const evalToggle = targetEl.closest('.op-toggle-btn[data-eval]');

      if(levelSelect || opToggle || evalToggle) {
          stateChanged = true; // トグル/セレクト変更も状態変更

          // トグルボタンの active 状態を更新 (click イベント時)
          if (opToggle) {
              card.querySelectorAll(`.op-toggle-btn[data-op]`).forEach(btn => btn.classList.remove('active'));
              opToggle.classList.add('active');
              // ARIA属性も更新
              opToggle.setAttribute('aria-pressed', 'true');
              card.querySelectorAll(`.op-toggle-btn[data-op]:not(.active)`).forEach(btn => btn.setAttribute('aria-pressed', 'false'));
          }
          if (evalToggle) {
              card.querySelectorAll(`.op-toggle-btn[data-eval]`).forEach(btn => btn.classList.remove('active'));
              evalToggle.classList.add('active');
              // ARIA属性も更新
              evalToggle.setAttribute('aria-pressed', 'true');
              card.querySelectorAll(`.op-toggle-btn[data-eval]:not(.active)`).forEach(btn => btn.setAttribute('aria-pressed', 'false'));
          }

          cardState = readCardState(card); // 変更後の状態を読み込む
          updateHitLimitsAndMainERDisplay(card, cardState); // 上限表示などを更新
          validateSubStatHits(card, cardState); // 上限超過チェック
      }
  }
  // ソフトキャップチェックボックスの変更処理
  else if (event.type === 'change' && targetEl.id.startsWith(`soft-cap-checkbox-`)) {
      stateChanged = true;
      // readCardState で状態が読み取られ、saveCalculatorState で保存される
      // スコア計算のために値フィードバックも更新
      updateValueFeedback(card);
  }


  // 状態が変更された場合のみ保存と自動計算を実行
  if (stateChanged) {
    saveCalculatorState();
    if (document.getElementById('auto-calc-toggle')?.checked) {
      calculateDiscScores();
    }
  }
}

/**
 * HIT数 +/- ボタンクリック時の処理
 */
function handleHitButtonClick(button, card, cardState) {
    const row = button.closest('.sub-stat-row');
    if (!row) return;
    const inputHit = row.querySelector('.calc-sub-hits-display');
    const inputValue = row.querySelector('.calc-sub-value');
    const subStatSelect = row.querySelector('.calc-sub-stat');
    const subStatName = subStatSelect ? subStatSelect.value : '';
    const index = parseInt(row.dataset.index, 10);

    if (!subStatName) {
        showToast('先にサブステータスを選択してください。', 'bg-yellow-500');
        return;
    }
    if (!inputHit || !inputValue) return;

    let currentHits = parseInt(inputHit.textContent, 10) || 1; // 表示から取得
    const maxTotalSubUpgrades = getMaxTotalSubUpgrades(cardState.level, cardState.initialOpCount);
    // 他のサブステの現在の *強化回数* (HIT数-1) の合計
    const otherUpgradesSum = (cardState.subStats || []).reduce((sum, s, i) => sum + (i === index ? 0 : Math.max(0, (s.hits || 1) - 1)), 0);

    if (button.dataset.action === 'plus') {
        const nextHit = currentHits + 1;
        const nextUpgradeCount = nextHit - 1; // 次の強化回数
        if (nextHit > MAX_SUBSTAT_UPGRADES_SINGLE_MAX + 1) { // 初期値(1)+最大強化(5)=6
            showToast(`単一サブステの最大HIT数 (${MAX_SUBSTAT_UPGRADES_SINGLE_MAX + 1}) です。`, 'bg-yellow-500');
            return;
        }
        // 強化回数 (HIT数-1) が上限を超えないかチェック
        if (otherUpgradesSum + nextUpgradeCount > maxTotalSubUpgrades) {
             showToast(`サブステの合計強化回数上限 (${maxTotalSubUpgrades}) を超えます。`, 'bg-yellow-500');
             return;
        }
        currentHits++;
    } else {
        currentHits = Math.max(1, currentHits - 1); // 最低1HIT (初期値)
    }

    // UI更新 (HIT数と連動する数値)
    const perHitValue = getSubStatPerHitValue(subStatName);
    const calculatedValue = perHitValue * currentHits;
    inputHit.textContent = currentHits; // HIT数表示更新
    inputValue.value = formatStatValue(calculatedValue, subStatName); // 数値表示更新

    // 合計強化回数表示も更新
    const newState = readCardState(card); // UI変更後の状態を読む
    updateTotalUpgradesDisplay(card, newState);
    // +/- ボタン状態更新
    updateHitButtonStates(card, newState);
}


/**
 * 数値入力フィールド変更時の処理 (inputイベント)
 */
function handleValueInputChange(input, card, cardState) {
    const row = input.closest('.sub-stat-row');
    if (!row) return;
    const inputHit = row.querySelector('.calc-sub-hits-display');
    const subStatSelect = row.querySelector('.calc-sub-stat');
    const subStatName = subStatSelect ? subStatSelect.value : '';
    const index = parseInt(row.dataset.index, 10);

    if (!subStatName) {
        // サブステ未選択なら何もしない
        return;
    }
    if (!inputHit) return;

    const rawValueText = input.value.replace('%', '');
    // 入力が数値として無効なら何もしない（例: '-', '.' のみの入力途中）
    if (isNaN(parseFloat(rawValueText)) && rawValueText !== '' && rawValueText !== '.') return;

    const rawValue = parseFloat(rawValueText) || 0;
    const perHitValue = getSubStatPerHitValue(subStatName);
    if (perHitValue === 0) return; // 0除算防止

    // 最も近いHIT数を計算 (最低1HIT)
    let calculatedHits = Math.max(1, Math.round(rawValue / perHitValue));

    // HIT数上限チェック
    if (calculatedHits > MAX_SUBSTAT_UPGRADES_SINGLE_MAX + 1) {
        calculatedHits = MAX_SUBSTAT_UPGRADES_SINGLE_MAX + 1;
    }

    // 合計強化回数上限チェック
    const maxTotalSubUpgrades = getMaxTotalSubUpgrades(cardState.level, cardState.initialOpCount);
    // 他のサブステの現在の *強化回数* (HIT数-1) の合計
    const otherUpgradesSum = (cardState.subStats || []).reduce((sum, s, i) => sum + (i === index ? 0 : Math.max(0, (s.hits || 1) - 1)), 0);
    const proposedUpgrades = calculatedHits - 1; // 今回の強化回数

    if (otherUpgradesSum + proposedUpgrades > maxTotalSubUpgrades) {
        const availableUpgrades = maxTotalSubUpgrades - otherUpgradesSum;
        calculatedHits = Math.max(1, availableUpgrades + 1); // 可能な最大のHIT数に補正 (最低1)
    }

    // HIT数表示を更新
    inputHit.textContent = calculatedHits;

    // 合計強化回数表示も更新
    const newState = readCardState(card); // UI変更後の状態を読む
    updateTotalUpgradesDisplay(card, newState);
    // +/- ボタン状態更新
    updateHitButtonStates(card, newState);

    // 数値入力フィールドの blur イベントで最終的な値補正とToast通知を行うリスナーを追加
    input.removeEventListener('change', handleValueInputBlur); // change(blur) イベント
    input.addEventListener('change', handleValueInputBlur);
}

/**
 * 数値入力フィールドからフォーカスが外れた時の処理 (最終補正と通知)
 */
function handleValueInputBlur(event) {
    const input = event.target;
    const row = input.closest('.sub-stat-row');
    if (!row) return;
    const subStatName = row.querySelector('.calc-sub-stat')?.value;
    const currentHits = parseInt(row.querySelector('.calc-sub-hits-display')?.textContent || '1', 10);

    if (subStatName) {
        const perHitValue = getSubStatPerHitValue(subStatName);
        const correctedValue = perHitValue * currentHits;
        const formattedCorrectedValue = formatStatValue(correctedValue, subStatName);
        // 入力値が表示値と異なれば補正
        if (input.value !== formattedCorrectedValue) {
             showToast(`入力値を ${formattedCorrectedValue} (=${currentHits} HIT) に補正しました。`, 'bg-blue-500');
             input.value = formattedCorrectedValue; // blur時に最終的な補正値を表示
        }
    } else {
        // サブステが選択されていなければ数値もクリア
        input.value = '';
    }
    // blurはchangeイベントとしてhandleCardInputChangeにキャッチされ、保存と自動計算がトリガーされる
}


// --- INITIALIZATION ---
export function initDiscCalculatorPage() {
  console.log("Initializing Disc Calculator Page...");
  cardStates = {}; // ページ初期化時にリセット
  activeDiscs = new Set([1, 2, 3, 4, 5, 6]); // デフォルトは全表示
  currentOtherAgentRoleFilter = 'all'; // フィルター状態をリセット
  lastOtherAgentScores = []; // 計算結果をリセット

  const contentWrapper = document.getElementById('content-wrapper');
  if (!contentWrapper) {
      console.error("Content wrapper not found!");
      return;
  }

  contentWrapper.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2 space-y-6">
        <div class="card p-6" style="z-index: 100;">
          <h2 class="text-xl font-bold text-[var(--text-primary)] mb-4">ディスクスコア計算機</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
            <div>
              <label for="calc-agent-select" class="block text-sm font-bold text-[var(--text-secondary)] mb-1">キャラクター</label>
              <div id="calc-agent-select-wrapper"></div>
            </div>
            <div class="sm:row-span-2">
              <label class="block text-sm font-bold text-[var(--text-secondary)] mb-1">ディスク部位
                <span class="tooltip ml-1">(?)<span class="tooltip-text tooltip-text-improved">計算したいディスクの部位を選択してください。複数選択可能です。</span></span>
              </label>
              <div class="disc-selector-container">
                <div class="disc-selector-hexagon">
                  ${[...Array(6)].map((_, i) => `
                    <div class="disc-selector-circle-wrapper">
                      <button class="disc-selector-circle" data-disc-num="${i + 1}" aria-pressed="true" aria-label="ディスク部位 ${i + 1} を選択/解除">
                        <span>${i + 1}</span>
                      </button>
                    </div>`).join('')}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-4">
               <label for="auto-calc-toggle" class="rich-toggle">
                  <input type="checkbox" id="auto-calc-toggle" class="sr-only rich-toggle-input">
                  <div class="rich-toggle-switch"><div class="rich-toggle-switch-handle"></div></div>
                  <span class="text-sm font-medium text-[var(--text-secondary)]">自動計算</span>
               </label>
               <span class="tooltip ml-1">(?)<span class="tooltip-text tooltip-text-improved">ONにすると、入力変更時に自動でスコアを再計算します。OFFの場合は「スコアを計算」ボタンを押してください。</span></span>
            </div>
          </div>
        </div>
        <div id="calc-discs-container" class="space-y-6"></div>
      </div>
      <div class="space-y-6">
        <div class="card p-6 sticky top-6">
          <h2 class="text-xl font-bold text-[var(--text-primary)] mb-4">スコア評価</h2>
          <div class="flex justify-center mb-4">
            <button id="calc-submit-btn" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-lg transition interactive-scale">スコアを計算</button>
          </div>
          <div id="calc-results-container" class="space-y-4 text-center min-h-[150px]">
            <p class="text-[var(--text-secondary)]">キャラクターとディスク情報を入力して計算してください。</p>
          </div>
           <div id="calc-other-agents-container" class="mt-6 hidden">
                <h3 class="text-lg font-bold text-[var(--text-primary)] mb-3 border-l-4 border-sky-400 pl-3">他キャラでの評価 Top 5
                   <span class="tooltip ml-1">(?)<span class="tooltip-text tooltip-text-improved">入力されたディスクを全キャラで評価した場合のスコア上位5名です。クリックで詳細を確認できます。</span></span>
                </h3>
                <div id="other-agents-filters" class="flex flex-wrap gap-2 mb-3 bg-[var(--bg-tertiary)] p-1 rounded-lg">
                     <button data-role="all" class="other-agent-filter-btn active">全て</button>
                     <button data-role="強攻" class="other-agent-filter-btn">強攻</button>
                     <button data-role="撃破" class="other-agent-filter-btn">撃破</button>
                     <button data-role="異常" class="other-agent-filter-btn">異常</button>
                     <button data-role="支援" class="other-agent-filter-btn">支援</button>
                     <button data-role="防護" class="other-agent-filter-btn">防護</button>
                     <button data-role="命破" class="other-agent-filter-btn">命破</button>
                </div>
                <div id="other-agents-list" class="space-y-2"></div>
           </div>
           <div id="calc-save-action-container" class="mt-6 hidden">
                 <button id="save-to-my-discs-btn" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg transition interactive-scale text-sm flex items-center justify-center gap-1">
                    <span class="material-symbols-outlined text-base" aria-hidden="true">save</span><span>マイディスクに保存</span>
                 </button>
                 <span class="tooltip ml-1">(?)<span class="tooltip-text tooltip-text-improved">現在計算対象となっている全ディスクを、個別の装備として「マイディスク」に保存します（ログインが必要です）。</span></span>
           </div>
        </div>
      </div>
    </div>
    <style>
      /* --- 既存のスタイルは省略 --- */
      /* --- 新しいスタイル定義 --- */
      .other-agent-filter-btn { padding: 4px 10px; font-size: 11px; font-weight: 600; color: var(--text-secondary); background-color: transparent; border: none; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
      .other-agent-filter-btn.active { color: var(--text-primary); background-color: var(--bg-secondary); box-shadow: 0 1px 3px var(--shadow-color); }
      .tooltip { position: relative; display: inline-flex; align-items: center; justify-content: center; cursor: help; }
      /* ▼▼▼ [UI改善] ツールチップのスタイル調整 ▼▼▼ */
      .tooltip .tooltip-text-improved {
          visibility: hidden; opacity: 0; position: absolute;
          bottom: 140%; /* アイコンからの距離 */ left: 50%; transform: translateX(-50%) translateY(5px); /* 初期位置 */
          background-color: var(--bg-accent); color: var(--text-on-accent); /* 色 */
          padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
          line-height: 1.4; box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          width: max-content; max-width: 300px; text-align: left; /* サイズとテキスト */
          transition: opacity 0.2s ease-out, visibility 0.2s ease-out, transform 0.2s ease-out; /* アニメーション */
          pointer-events: none; z-index: 120; white-space: normal; /* その他 */
      }
      .tooltip .tooltip-text-improved::after { /* 吹き出しの矢印 */
          content: ''; position: absolute;
          top: 100%; left: 50%; transform: translateX(-50%);
          border-width: 5px; border-style: solid;
          border-color: var(--bg-accent) transparent transparent transparent;
      }
      /* ダークモード用の矢印の色調整 */
      html.dark .tooltip .tooltip-text-improved::after {
          border-top-color: var(--bg-accent);
      }
      .tooltip:hover .tooltip-text-improved, .tooltip:focus-visible .tooltip-text-improved {
          visibility: visible; opacity: 1; transform: translateX(-50%) translateY(0); /* 表示アニメーション */
      }
      /* ▲▲▲ [UI改善] ツールチップのスタイル調整 ▲▲▲ */
      /* ▼▼▼ [UI改善] 高級感のあるレベル選択 ▼▼▼ */
      .custom-select-container.level-select .custom-select-trigger {
          background: linear-gradient(145deg, var(--bg-tertiary), var(--bg-secondary));
          border-width: 1px; border-color: var(--border-primary);
          box-shadow: 2px 2px 4px var(--shadow-color-light), -2px -2px 4px var(--shadow-color-dark); /* 凹み表現 */
          font-weight: 700; color: var(--text-accent);
          transition: all 0.1s ease-in-out;
      }
       /* active (open) 状態のスタイル */
       .custom-select-container.level-select.open .custom-select-trigger {
            box-shadow: inset 2px 2px 4px var(--shadow-color-light), inset -2px -2px 4px var(--shadow-color-dark); /* 押し込み表現 */
       }

      .custom-select-container.level-select .custom-select-trigger:hover {
           border-color: var(--accent-color);
      }
       /* ダークモード用の影 */
       html.dark .custom-select-container.level-select .custom-select-trigger {
          box-shadow: inset 2px 2px 4px rgba(0,0,0,0.4), inset -2px -2px 4px rgba(255,255,255,0.05);
       }
        /* active (open) 状態のダークモード用スタイル */
       html.dark .custom-select-container.level-select.open .custom-select-trigger {
           box-shadow: inset 3px 3px 5px rgba(0,0,0,0.5), inset -3px -3px 5px rgba(255,255,255,0.08);
       }
       html.dark .custom-select-container.level-select .custom-select-trigger:hover {
           border-color: var(--accent-color);
       }
       /* ▲▲▲ [UI改善] 高級感のあるレベル選択 ▲▲▲ */
       /* ▼▼▼ [UI改善] 価値フィードバックの色定義 ▼▼▼ */
      .value-feedback-indicator { transition: background-color 0.3s, background-image 0.3s; }
      .value-feedback-gold { background: linear-gradient(135deg, #fde047, #f97316); } /* SSS */
      .value-feedback-purple { background-color: #a855f7; } /* SS */
      .value-feedback-blue { background-color: #3b82f6; }   /* S */
      .value-feedback-green { background-color: #22c55e; }  /* A */
      .value-feedback-gray { background-color: #6b7280; } /* B or C */
      /* ▲▲▲ [UI改善] 価値フィードバックの色定義 ▲▲▲ */
    </style>
    `;

  // --- キャラ選択 ---
  const agentSelectWrapper = document.getElementById('calc-agent-select-wrapper');
  const agentSelect = document.createElement('select');
  agentSelect.id = 'calc-agent-select';
  const agentOptions = Object.keys(state.characterWeights || {})
    .map(agentId => {
      const agentInfo = state.allAgents.find(a => a.id === agentId);
      const name = state.characterWeights[agentId]?.name_jp || agentInfo?.name || agentId;
      const icon = agentInfo?.imageUrls?.style1?.['2d'] || '';
      return { id: agentId, name, icon };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map(a => `<option value="${a.id}" data-icon="${a.icon}">${a.name}</option>`);
  agentSelect.innerHTML = `<option value="">キャラクターを選択...</option>${agentOptions.join('')}`;
  agentSelect.addEventListener('change', () => {
    // キャラ変更時の処理
    document.querySelectorAll('.disc-input-card').forEach(card => {
        const discNum = parseInt(card.dataset.cardId, 10);
        // メインステの選択肢を更新 (現在の選択値を保持)
        const currentCardState = readCardState(card);
        updateMainStatOptions(card, discNum, currentCardState.mainStat);
        // 値フィードバックを更新
        updateValueFeedback(card);
    });
    // ソフトキャップ情報を更新
    updateSoftCapCheckboxVisibility();
    // 自動計算ONなら再計算
    if (document.getElementById('auto-calc-toggle')?.checked) {
      calculateDiscScores();
    }
    saveCalculatorState(); // キャラ選択も保存
  });
  // カスタムセレクト生成
  const agentCustomSelectEl = createCustomSelect(agentSelect, { placeholder: 'キャラクターを選択...' });
  agentSelectWrapper.appendChild(agentCustomSelectEl);


  // --- 初期化 ---
  loadCalculatorState(); // load 時に activeDiscs と cardStates が設定される

  // ディスク部位選択の初期状態設定
  document.querySelectorAll('.disc-selector-circle').forEach(button => {
    const discNum = parseInt(button.dataset.discNum, 10);
    const isActive = activeDiscs.has(discNum);
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // イベントリスナー設定
  document.querySelector('.disc-selector-container')?.addEventListener('click', (e) => {
    const button = e.target.closest('.disc-selector-circle');
    if (button) {
      toggleDiscSelection(parseInt(button.dataset.discNum, 10));
      button.blur(); // クリック後にフォーカスを外す
    }
  });

  document.getElementById('calc-submit-btn')?.addEventListener('click', calculateDiscScores);

  const container = document.getElementById('calc-discs-container');
  // イベント委譲: カード内の入力要素の変更を監視
  if (container) {
      ['change', 'input', 'click'].forEach(evt => container.addEventListener(evt, handleCardInputChange));
  }

  const autoCalcToggle = document.getElementById('auto-calc-toggle');
  const calcSubmitBtn = document.getElementById('calc-submit-btn');
  if (autoCalcToggle && calcSubmitBtn) {
      autoCalcToggle.addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          calcSubmitBtn.style.display = isChecked ? 'none' : 'block';
          if(isChecked) calculateDiscScores(); // ONにしたら即計算
          localStorage.setItem('calc_autoCalc', isChecked); // 状態保存
      });
      // 初期状態を反映
      calcSubmitBtn.style.display = autoCalcToggle.checked ? 'none' : 'block';
  }

  document.getElementById('other-agents-filters')?.addEventListener('click', (e) => {
      const button = e.target.closest('.other-agent-filter-btn');
      if (button) {
          document.querySelectorAll('.other-agent-filter-btn').forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          currentOtherAgentRoleFilter = button.dataset.role;
          filterOtherAgentsList(currentOtherAgentRoleFilter); // フィルタリング実行
      }
  });

  document.getElementById('save-to-my-discs-btn')?.addEventListener('click', saveCurrentDiscToMyDiscs);

  // --- 初期表示 ---
  renderActiveDiscs(); // 選択中のディスクカードを描画
  updateSoftCapCheckboxVisibility(); // キャラ選択状態に基づきソフトキャップチェックボックス表示
  // ローカルストレージ復元後にカスタムセレクトの表示を更新
  if (agentCustomSelectEl) updateCustomSelectDisplay(agentCustomSelectEl);
  // 計算結果があれば復元表示（オプション）
  if (document.getElementById('auto-calc-toggle')?.checked) {
      // ページ読み込み時は、データが完全に揃ってから計算する方が安全
      // 少し遅延させるか、データロード完了のイベントを待つ
      setTimeout(calculateDiscScores, 100); // 100ms後に実行 (暫定)
  }


  console.log("Disc Calculator Page Initialized.");
}

// --- CALCULATION & RESULTS ---

/**
 * 全アクティブディスクのスコアを計算し、結果を表示する
 */
function calculateDiscScores() {
  const agentId = document.getElementById('calc-agent-select')?.value;
  if (!agentId) {
    showToast('キャラクターを選択してください。', 'bg-red-500');
    // 結果表示をリセット
    document.getElementById('calc-results-container').innerHTML = `<p class="text-[var(--text-secondary)]">キャラクターを選択して計算してください。</p>`;
    document.getElementById('calc-other-agents-container').classList.add('hidden');
    document.getElementById('calc-save-action-container').classList.add('hidden');
    return;
  }

  const discCards = document.querySelectorAll('.disc-input-card');
  if (discCards.length === 0) {
    showToast('計算するディスク部位を選択してください。', 'bg-blue-500');
    // 結果表示をリセット
    document.getElementById('calc-results-container').innerHTML = `<p class="text-[var(--text-secondary)]">計算するディスク部位を選択してください。</p>`;
    document.getElementById('calc-other-agents-container').classList.add('hidden');
    document.getElementById('calc-save-action-container').classList.add('hidden');
    return;
  }

  let totalWeightedER = 0;
  let totalTheoreticalMaxER = 0;
  const individualScores = []; // 各ディスクの結果を格納
  let allCardsValid = true;

  for (const card of discCards) {
    const discNum = parseInt(card.dataset.cardId, 10);
    const cardState = readCardState(card); // 最新の状態を読む

    if (!cardState.mainStat) {
      showToast(`ディスク ${discNum} のメインステータスを選択してください。`, 'bg-red-500');
      allCardsValid = false;
      break; // 一つでも無効なら計算中止
    }

    // サブステに未選択があるかチェック（名前がないもの）
    const hasEmptySubStat = cardState.subStats.some(sub => !sub.name);
    // 初期OP数より多いサブステが入力されているかチェック (Lv0 の場合のみ)
    const filledSubStatsCount = cardState.subStats.filter(sub => sub.name).length;
    if (cardState.level === 0 && filledSubStatsCount > cardState.initialOpCount) {
         showToast(`ディスク ${discNum}: Lv0 ディスクのサブステータスは${cardState.initialOpCount}個までです。`, 'bg-yellow-500');
         allCardsValid = false;
         break;
    }
    // Lv0でHIT数が1より大きいサブステがないかチェック
    if (cardState.level === 0 && cardState.subStats.some(sub => sub.hits > 1)) {
        // 自動補正するか、エラーとするか。ここではエラーとする。
        showToast(`ディスク ${discNum}: Lv0 ディスクのサブステータスHIT数は1です。`, 'bg-yellow-500');
        allCardsValid = false;
        break;
    }

    const useSoftCap = cardState.useSoftCap;
    const weights = getCharacterWeights(agentId, useSoftCap);
    if (Object.keys(weights).length === 0) {
        showToast(`キャラクター「${agentId}」の重みデータが見つかりません。`, 'bg-red-500');
        allCardsValid = false;
        break;
    }

    // --- 分子 (Numerator): このディスクの加重ER合計 ---
    let mainWeightedER = 0;
    const mainStatER = getMainStatER(cardState.mainStat, cardState.level); // 現在レベルのER
    const mainStatWeight = weights[normalizeStatKey(cardState.mainStat)] ?? 0;
    mainWeightedER = mainStatER * mainStatWeight;

    let subWeightedERTotal = 0;
    const subStatContributions = []; // 各サブステの貢献度
    cardState.subStats.forEach(sub => {
      if (sub.name && sub.hits > 0) {
        const weight = weights[normalizeStatKey(sub.name)] ?? 0;
        const weightedER = sub.hits * weight; // サブステは常にHIT数 * 重み
        subWeightedERTotal += weightedER;
        subStatContributions.push({ name: sub.name, hits: sub.hits, weightedER: weightedER });
      } else {
          subStatContributions.push({ name: '', hits: 0, weightedER: 0 }); // 枠を合わせる
      }
    });
     // 4枠に満たない場合も空データで埋める
     while (subStatContributions.length < 4) {
         subStatContributions.push({ name: '', hits: 0, weightedER: 0 });
     }

    const currentWeightedER = mainWeightedER + subWeightedERTotal;

    // --- 分母 (Denominator): このディスクの理論的最大加重ER ---
    let theoreticalMaxWeightedER = 0;
    // 評価基準に応じたレベル（現在レベル or Lv15）
    const evaluationLevel = cardState.evaluationCriteria === 'maxLevel' ? 15 : cardState.level;

    // 1. 理論的最良メインステータスの加重ERを計算
    let bestMainStatWeightedER = 0;
    const possibleMainStats = MAIN_STAT_OPTIONS_BY_SLOT[discNum] || [];
    let bestMainStatWeight = 0;
    let bestMainStatNameForCalc = ''; // 理論値計算用のメインステ名
    if (possibleMainStats.length > 0) {
        bestMainStatNameForCalc = possibleMainStats[0]; // とりあえず最初の
        possibleMainStats.forEach(statName => {
            const weight = weights[normalizeStatKey(statName)] ?? 0;
            if (weight > bestMainStatWeight) {
                bestMainStatWeight = weight;
                bestMainStatNameForCalc = statName; // 最良のステータス名を更新
            }
        });
        // 評価基準に応じたレベルのERを取得
        const maxMainERForLevel = getMainStatER(bestMainStatNameForCalc, evaluationLevel);
        bestMainStatWeightedER = maxMainERForLevel * bestMainStatWeight;
    }

    // 2. 理論的最良サブステータスの加重ERを計算
    let bestSubStatWeightedER = 0;
    // 評価基準に応じたレベルとOP数で最大HIT数を計算
    const maxSubHits = getMaxSubERTotal(evaluationLevel, cardState.initialOpCount);

    // サブステで最も重い重みを取得
    let bestSubWeight = 0;
    // characterWeights全体ではなく、現在のキャラの重みデータから探す
    const agentWeights = state.characterWeights[agentId]?.weights_normal || state.characterWeights[agentId]?.weights || {};
    Object.keys(agentWeights).forEach(statName => {
        // サブステに存在するステータス（subStatsGrowthDataにある）のみを対象
        if (subStatsGrowthData.some(s => normalizeStatKey(s.name) === normalizeStatKey(statName))) {
             const weight = agentWeights[statName] ?? 0;
             if (weight > bestSubWeight) bestSubWeight = weight;
        }
    });
     // 重みは1.0を上限とする
     const effectiveBestSubWeight = Math.min(1.0, bestSubWeight);

     bestSubStatWeightedER = maxSubHits * effectiveBestSubWeight;


    theoreticalMaxWeightedER = bestMainStatWeightedER + bestSubStatWeightedER;

    // --- スコア計算 ---
    // theoreticalMaxWeightedER が 0 になるケース（例: HPキャラでDisc1を評価）も考慮
    const score = theoreticalMaxWeightedER > 0.001 ? (currentWeightedER / theoreticalMaxWeightedER) * 100 : 0; // 0除算回避

    // デバッグ用ログ
    // console.log(`--- Disc ${discNum} ---`);
    // console.log(`State:`, cardState);
    // console.log(`Current Weighted ER: ${currentWeightedER.toFixed(2)} (Main: ${mainWeightedER.toFixed(2)}, Sub: ${subWeightedERTotal.toFixed(2)})`);
    // console.log(`Theoretical Max Weighted ER (${cardState.evaluationCriteria} Lv.${evaluationLevel} ${cardState.initialOpCount}OP): ${theoreticalMaxWeightedER.toFixed(2)}`);
    // console.log(`  Best Main (${bestMainStatNameForCalc}): ${bestMainStatWeightedER.toFixed(2)} (${getMainStatER(bestMainStatNameForCalc, evaluationLevel)} ER * ${bestMainStatWeight.toFixed(2)} W)`);
    // console.log(`  Best Sub: ${bestSubStatWeightedER.toFixed(2)} (${maxSubHits} Hits * ${effectiveBestSubWeight.toFixed(2)} W)`);
    // console.log(`Score: ${score.toFixed(1)}%`);


    individualScores.push({
      num: discNum,
      score: Math.max(0, Math.min(100, score)), // 0-100の範囲に収める
      mainStat: {
          name: cardState.mainStat,
          contribution: theoreticalMaxWeightedER > 0.001 ? (mainWeightedER / theoreticalMaxWeightedER) * 100 : 0
      },
      subStats: subStatContributions.map(sub => ({
          name: sub.name,
          hits: sub.hits,
          contribution: theoreticalMaxWeightedER > 0.001 ? (sub.weightedER / theoreticalMaxWeightedER) * 100 : 0
      })),
      // 保存用データ (他キャラ推奨、マイディスク保存で使用)
      rawData: { ...cardState } // cardStateのコピーを保存
    });

    totalWeightedER += currentWeightedER;
    totalTheoreticalMaxER += theoreticalMaxWeightedER;
  }

  // 無効なカードがあった場合は結果表示を更新しない
  if (!allCardsValid) {
     // 結果表示をリセットし、エラーメッセージ表示
    document.getElementById('calc-results-container').innerHTML = `<p class="text-red-500 font-semibold">入力エラーがあります。メッセージを確認してください。</p>`;
    document.getElementById('calc-other-agents-container').classList.add('hidden');
    document.getElementById('calc-save-action-container').classList.add('hidden');
    return;
  }

  // --- 全ディスクの平均スコア計算 ---
  // 平均スコアの分母は、各ディスクの理論値の合計ではなく、
  // 部位ごとの理論値(100%)に対する達成度の平均を取るべき
  const averageScore = individualScores.length > 0
      ? individualScores.reduce((sum, s) => sum + s.score, 0) / individualScores.length
      : 0;

  // --- 結果表示 ---
  renderResults(averageScore, individualScores);

  // --- 他キャラ推奨計算 & 表示 ---
  // グローバル変数に計算結果を保存
  lastOtherAgentScores = calculateOtherAgents(individualScores.map(s => s.rawData));
  // 現在のフィルターで表示
  filterOtherAgentsList(currentOtherAgentRoleFilter);
  // コンテナを表示
  document.getElementById('calc-other-agents-container')?.classList.remove('hidden');
  document.getElementById('calc-save-action-container')?.classList.remove('hidden');
}

/**
 * 計算結果をUIに表示する
 * @param {number} averageScore - 全ディスクの平均スコア (0-100)
 * @param {Array<object>} individualScores - 各ディスクの詳細スコア情報
 */
function renderResults(averageScore, individualScores) {
  const overallRankData = getRankForPerfection(averageScore);
  const resultsContainer = document.getElementById('calc-results-container');
  if (!resultsContainer) return;

  const agentId = document.getElementById('calc-agent-select')?.value;
  const softCapInfo = agentId ? getCharacterSoftCapInfo(agentId) : { hasSoftCap: false };
  // 評価基準は全ディスクで共通のはずなので最初のディスクから取得
  const evaluationCriteriaText = individualScores[0]?.rawData?.evaluationCriteria === 'currentLevel' ? '現Lv基準' : '最大Lv基準';

  resultsContainer.innerHTML = `
    <div class="text-center mb-6">
      <p class="text-sm font-bold text-[var(--text-secondary)]">平均完成度スコア (${evaluationCriteriaText})</p>
      <p class="text-5xl font-black text-[var(--text-primary)] my-1">${averageScore.toFixed(1)}<span class="text-3xl">%</span></p>
      <div class="inline-block bg-gradient-to-r from-[${overallRankData.data.colors[0]}] via-[${overallRankData.data.colors[1]}] to-[${overallRankData.data.colors[2]}] text-white text-lg font-bold px-4 py-1 rounded-full shadow-lg">
        ${overallRankData.rank} <span class="text-sm opacity-80">${overallRankData.data.label}</span>
      </div>
    </div>

    <div class="space-y-4">
      ${individualScores.map(({ num, score, mainStat, subStats, rawData }) => {
        const { rank, data } = getRankForPerfection(score);
        // 現在レベル基準の場合のみレベル表示
        const evalText = rawData.evaluationCriteria === 'currentLevel' ? ` (Lv.${rawData.level})` : '';
        return `
          <details class="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-secondary)] overflow-hidden group" ${individualScores.length === 1 ? 'open' : ''}>
            <summary class="flex justify-between items-center p-3 cursor-pointer hover:bg-[var(--bg-primary)] transition-colors list-none">
              <span class="font-bold text-lg text-[var(--text-primary)]">ディスク ${num}${evalText}</span>
              <div class="flex items-center gap-2 flex-shrink-0"> <span class="text-xl font-bold" style="color: ${data.colors[1]}">${score.toFixed(1)}<span class="text-sm">%</span></span>
                 <span class="text-sm font-semibold px-2 py-0.5 rounded-full text-white" style="background-color: ${data.colors[1]}">${rank}</span>
                 <span class="material-symbols-outlined text-[var(--text-secondary)] transition-transform duration-200 group-open:rotate-180">expand_more</span>
              </div>
            </summary>
            <div class="p-3 border-t border-[var(--border-secondary)] text-xs space-y-1 bg-[var(--bg-secondary)]">
              <p class="font-semibold text-[var(--text-secondary)]">スコア貢献度:</p>
              <p class="flex justify-between items-center">
                <span class="font-semibold text-amber-500">メイン (${mainStat.name || '---'}):</span>
                <span class="font-mono text-right">${mainStat.contribution.toFixed(1)}点</span>
              </p>
              ${subStats.map((sub, i) => sub.name ? `
                <p class="flex justify-between items-center">
                  <span class="flex items-center gap-1.5 font-semibold text-sky-500"> <span class="value-feedback-indicator w-1.5 h-3 rounded-full ${getValueFeedbackClass(agentId, sub.name, rawData.useSoftCap)} flex-shrink-0"></span> <span>サブ${i+1} (${sub.name} x${sub.hits}):</span>
                   </span>
                  <span class="font-mono text-right">${sub.contribution.toFixed(1)}点</span>
                 </p>` : `<div class="h-4"></div>` /* 空行の高さ調整 */ ).join('')}
            </div>
          </details>`;
      }).join('')}
    </div>
    <div class="mt-6 text-xs text-[var(--text-secondary)] space-y-2">
        <div>
            <p class="font-bold mb-1">完成度スコア指標 <span class="tooltip ml-1">(?)<span class="tooltip-text tooltip-text-improved"><b>部位別理論値</b>に対する達成度(%)です。<br><b>100%</b> = その部位で実現可能な完璧な厳選 (メイン不問の1-3番, メイン厳選済の4-6番) を達成した状態。<br>異なるキャラ/部位間でも厳選度合いを公平に比較できます。</span></span></p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1 text-center">
                ${Object.entries(SCORE_RANKS).reverse().map(([rank, data]) =>
                    `<span class="font-semibold bg-[var(--bg-tertiary)] p-1 rounded">${rank}: ${data.min}%+</span>`
                ).join('')}
            </div>
        </div>
        ${softCapInfo.hasSoftCap && individualScores.some(d => d.rawData.useSoftCap) ? `<p class="mt-2 text-amber-600 dark:text-amber-400 font-semibold">Tips: 一部のディスクで閾値評価(${softCapInfo.description})が有効です。</p>` : ''}
    </div>`;

    // details要素の開閉でアイコン回転 (summaryクリックで処理するように変更)
    resultsContainer.querySelectorAll('details summary').forEach(summary => {
        // 既存のリスナーがあれば削除（再描画時の重複防止）
        summary.removeEventListener('click', toggleDetailsIcon);
        summary.addEventListener('click', toggleDetailsIcon);
    });
}

/** detailsの開閉に合わせてアイコンを回転させる */
function toggleDetailsIcon(event) {
    // details要素のopen属性が変わるのを少し待つ
    requestAnimationFrame(() => {
        const detailsElement = event.currentTarget.closest('details');
        if (!detailsElement) return;
        const icon = detailsElement.querySelector('summary span.material-symbols-outlined');
        if (icon) {
            icon.style.transform = detailsElement.open ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    });
}


/**
 * 入力されたディスク情報をもとに、他キャラクターでのスコアを計算 (表示はしない)
 * @param {Array<object>} discRawDataArray - 計算対象のディスクの生データ配列 (readCardStateの返り値)
 * @returns {Array<object>} 全エージェントのスコア配列 [{id, name, role, score}]
 */
function calculateOtherAgents(discRawDataArray) {
    if (!discRawDataArray || discRawDataArray.length === 0) return [];

    const allAgentScores = [];
    const currentAgentId = document.getElementById('calc-agent-select')?.value;

    for (const agentId in state.characterWeights) {
        if (agentId === currentAgentId) continue; // 現在選択中のキャラは除外

        const agentInfo = state.allAgents.find(a => a.id === agentId);
        const agentName = state.characterWeights[agentId]?.name_jp || agentInfo?.name || agentId;
        const agentRole = agentInfo?.role || '不明';

        let totalWeightedER = 0;
        let totalTheoreticalMaxER = 0;
        let agentIsValid = true;
        let calculatedDiscCount = 0; // スコア計算できたディスクの数

        for (const discData of discRawDataArray) {
            const discNum = discData.discNum;
            // 他キャラ評価は、常に「そのキャラの通常重み」かつ「入力された評価基準」で行う
            const useSoftCap = false; // 他キャラ推奨では常に通常評価
            const weights = getCharacterWeights(agentId, useSoftCap);
            if (Object.keys(weights).length === 0) { agentIsValid = false; break; }

            // メインステが選択されていないディスクは評価対象外
            if (!discData.mainStat) continue;

            const level = discData.level;
            const initialOpCount = discData.initialOpCount;
            const evaluationLevel = discData.evaluationCriteria === 'maxLevel' ? 15 : level;

            // --- 分子 (Numerator) ---
            const mainStatER = getMainStatER(discData.mainStat, level);
            const mainStatWeight = weights[normalizeStatKey(discData.mainStat)] ?? 0;
            const mainWeightedER = mainStatER * mainStatWeight;

            let subWeightedERTotal = 0;
            (discData.subStats || []).forEach(sub => { // subStats が undefined の可能性を考慮
                if (sub.name && sub.hits > 0) {
                    const weight = weights[normalizeStatKey(sub.name)] ?? 0;
                    subWeightedERTotal += sub.hits * weight;
                }
            });
            const currentWeightedER = mainWeightedER + subWeightedERTotal;

            // --- 分母 (Denominator) ---
            let bestMainStatWeightedER = 0;
            const possibleMainStats = MAIN_STAT_OPTIONS_BY_SLOT[discNum] || [];
            let bestMainStatWeight = 0;
            let bestMainStatNameForCalc = '';
            if (possibleMainStats.length > 0) {
                bestMainStatNameForCalc = possibleMainStats[0];
                possibleMainStats.forEach(statName => {
                    const weight = weights[normalizeStatKey(statName)] ?? 0;
                    if (weight > bestMainStatWeight) { bestMainStatWeight = weight; bestMainStatNameForCalc = statName; }
                });
                bestMainStatWeightedER = getMainStatER(bestMainStatNameForCalc, evaluationLevel) * bestMainStatWeight;
            }

            let bestSubStatWeightedER = 0;
            const maxSubHits = getMaxSubERTotal(evaluationLevel, initialOpCount);
            let bestSubWeight = 0;
            // 通常重みを取得して計算
            const agentNormalWeights = getCharacterWeights(agentId, false); // useSoftCap=false
            Object.keys(agentNormalWeights).forEach(statName => {
                if (subStatsGrowthData.some(s => normalizeStatKey(s.name) === normalizeStatKey(statName))) {
                     const weight = agentNormalWeights[statName] ?? 0;
                     if (weight > bestSubWeight) bestSubWeight = weight;
                }
            });
            const effectiveBestSubWeight = Math.min(1.0, bestSubWeight); // 重み1.0を上限
            bestSubStatWeightedER = maxSubHits * effectiveBestSubWeight;

            const theoreticalMaxWeightedER = bestMainStatWeightedER + bestSubStatWeightedER;

            // ディスクごとのスコアを計算して加算 (加重平均のため)
            if (theoreticalMaxWeightedER > 0.001) {
                totalWeightedER += currentWeightedER;
                totalTheoreticalMaxER += theoreticalMaxWeightedER;
                calculatedDiscCount++; // 計算できたディスク数をカウント
            }
            // 理論値が0の場合でも calculatedDiscCount は増やす（平均の分母用）
            else if (possibleMainStats.length > 0) { // 部位が存在すればカウント
                 calculatedDiscCount++;
            }
        }

         // 計算できたディスクが1つ以上あればリストに追加
         if (agentIsValid && calculatedDiscCount > 0) {
             // 平均スコアを計算
             const averageScore = totalTheoreticalMaxER > 0.001
                 ? (totalWeightedER / totalTheoreticalMaxER) * 100
                 : 0; // 理論値合計が0ならスコアも0

            allAgentScores.push({ id: agentId, name: agentName, role: agentRole, score: Math.max(0, Math.min(100, averageScore)) }); // 0-100に補正
        }
    }

    // スコアで降順ソート
    allAgentScores.sort((a, b) => b.score - a.score);
    return allAgentScores;
}


/**
 * 他キャラ推奨リストのHTMLを生成して表示 (フィルター適用)
 * @param {string} roleFilter - フィルタリングする役割名 ('all' で全表示)
 */
function filterOtherAgentsList(roleFilter) {
    const listContainer = document.getElementById('other-agents-list');
    if (!listContainer) return;

    currentOtherAgentRoleFilter = roleFilter; // フィルター状態を更新

    // lastOtherAgentScores からフィルタリング
    const filteredAgents = (roleFilter === 'all')
        ? lastOtherAgentScores // 保存された計算結果を使用
        : lastOtherAgentScores.filter(agent => agent.role === roleFilter);

    // 上位5件を取得
    const topAgents = filteredAgents.slice(0, 5);

    if (topAgents.length === 0) {
        // フィルタ結果がない場合のメッセージ
        listContainer.innerHTML = `<p class="no-filter-result text-sm text-[var(--text-secondary)] text-center py-4">この役割では、より適したキャラクターが見つかりませんでした。</p>`;
        return;
    }

    listContainer.innerHTML = topAgents.map((agentScore, index) => {
        const agentInfo = state.allAgents.find(a => a.id === agentScore.id);
        const iconUrl = agentInfo?.imageUrls?.style1?.['2d'] || '';
        // 役割に応じた色を取得 (constants.js から)
        const roleColor = constants.ROLE_COLORS[agentScore.role] || 'gray';
        const iconHtml = iconUrl
            ? `<div class="w-8 h-8 flex-shrink-0 rounded-full overflow-hidden border-2 border-${roleColor}-500"><img src="${iconUrl}" alt="${agentScore.name}" class="w-full h-full object-cover" loading="lazy"></div>`
            : `<div class="w-8 h-8 flex-shrink-0 rounded-full bg-gray-500 border-2 border-${roleColor}-500"></div>`; // Placeholder
        const { rank, data } = getRankForPerfection(agentScore.score);

        return `
            <div class="other-agent-item flex items-center justify-between p-2 bg-[var(--bg-tertiary)] rounded-lg gap-2 cursor-pointer hover:bg-[var(--bg-primary)] transition-colors" data-agent-id="${agentScore.id}" title="クリックして ${agentScore.name} の詳細スコアを表示">
                <span class="font-bold text-sm w-6 text-center text-[var(--text-secondary)] flex-shrink-0">${index + 1}.</span>
                ${iconHtml}
                <span class="text-sm font-semibold flex-1 truncate text-[var(--text-primary)]">${agentScore.name}</span>
                <span class="tag role-tag role-${agentScore.role} text-xs flex-shrink-0">${agentScore.role}</span>
                <span class="text-sm font-bold w-16 text-right flex-shrink-0" style="color: ${data.colors[1]}">${agentScore.score.toFixed(1)}%</span>
                <span class="text-xs font-semibold px-1.5 py-0.5 rounded text-white flex-shrink-0" style="background-color: ${data.colors[1]}">${rank}</span>
                 <span class="material-symbols-outlined text-sm text-[var(--text-secondary)] flex-shrink-0">chevron_right</span>
            </div>`;
    }).join('');

     // 各項目にクリックリスナーを追加
     listContainer.querySelectorAll('.other-agent-item').forEach(item => {
         item.addEventListener('click', (e) => {
             showOtherAgentScoreDetails(item.dataset.agentId);
         });
     });
}

/**
 * 他キャラ推奨リストの詳細ポップアップを表示
 * @param {string} agentId - 対象のエージェントID
 */
function showOtherAgentScoreDetails(agentId) {
    const agentInfo = state.allAgents.find(a => a.id === agentId);
    const agentName = state.characterWeights[agentId]?.name_jp || agentInfo?.name || agentId;
    const role = agentInfo?.role || '不明';
    const roleColor = constants.ROLE_COLORS[role] || 'gray';

    let detailsHtml = `<div class="space-y-3 max-h-[60vh] overflow-y-auto custom-scroll pr-2">`; // スクロール可能に
    let totalScore = 0;
    let discCount = 0;

    document.querySelectorAll('.disc-input-card').forEach(card => {
        const discNum = parseInt(card.dataset.cardId, 10);
        const cardState = readCardState(card);
        if (!cardState.mainStat) return; // メインステがなければスキップ

        // 他キャラ評価は常に通常重み & 入力された評価基準
        const useSoftCap = false;
        const weights = getCharacterWeights(agentId, useSoftCap);
        if (Object.keys(weights).length === 0) return;

        const level = cardState.level;
        const initialOpCount = cardState.initialOpCount;
        const evaluationLevel = cardState.evaluationCriteria === 'maxLevel' ? 15 : level;
        const evaluationCriteriaText = cardState.evaluationCriteria === 'currentLevel' ? `(Lv.${level})` : `(最大Lv)`;


        // 分子
        const mainStatER = getMainStatER(cardState.mainStat, level);
        const mainStatWeight = weights[normalizeStatKey(cardState.mainStat)] ?? 0;
        const mainWeightedER = mainStatER * mainStatWeight;
        let subWeightedERTotal = 0;
        const subDetails = [];
        (cardState.subStats || []).forEach((sub, i) => { // 安全のため || []
            if (sub.name && sub.hits > 0) {
                const weight = weights[normalizeStatKey(sub.name)] ?? 0;
                const weightedER = sub.hits * weight;
                subWeightedERTotal += weightedER;
                subDetails.push({ name: sub.name, hits: sub.hits, weightedER: weightedER });
            } else {
                subDetails.push({ name: '', hits: 0, weightedER: 0 });
            }
        });
        const currentWeightedER = mainWeightedER + subWeightedERTotal;

        // 分母
        let bestMainStatWeightedER = 0;
        const possibleMainStats = MAIN_STAT_OPTIONS_BY_SLOT[discNum] || [];
        let bestMainStatWeight = 0;
        let bestMainStatName = '';
        if (possibleMainStats.length > 0) {
            bestMainStatName = possibleMainStats[0];
            possibleMainStats.forEach(statName => {
                const weight = weights[normalizeStatKey(statName)] ?? 0;
                if (weight > bestMainStatWeight) { bestMainStatWeight = weight; bestMainStatName = statName; }
            });
            bestMainStatWeightedER = getMainStatER(bestMainStatName, evaluationLevel) * bestMainStatWeight;
        }
        let bestSubStatWeightedER = 0;
        const maxSubHits = getMaxSubERTotal(evaluationLevel, initialOpCount);
        let bestSubWeight = 0;
        // 通常重みを取得して計算
        const agentNormalWeights = getCharacterWeights(agentId, false); // useSoftCap=false
        Object.keys(agentNormalWeights).forEach(statName => {
            if (subStatsGrowthData.some(s => normalizeStatKey(s.name) === normalizeStatKey(statName))) {
                 const weight = agentNormalWeights[statName] ?? 0;
                 if (weight > bestSubWeight) bestSubWeight = weight;
            }
        });
        const effectiveBestSubWeight = Math.min(1.0, bestSubWeight);
        bestSubStatWeightedER = maxSubHits * effectiveBestSubWeight;
        const theoreticalMaxWeightedER = bestMainStatWeightedER + bestSubStatWeightedER;

        // スコア
        const score = theoreticalMaxWeightedER > 0.001 ? (currentWeightedER / theoreticalMaxWeightedER) * 100 : 0;
        const finalScore = Math.max(0, Math.min(100, score)); // 0-100に補正
        const { rank, data } = getRankForPerfection(finalScore);

        totalScore += finalScore; // 平均計算用に補正後のスコアを足す
        discCount++;

        detailsHtml += `
            <div class="bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-secondary)]">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-base text-[var(--text-primary)]">ディスク ${discNum} ${evaluationCriteriaText}</span>
                    <span class="text-lg font-bold" style="color: ${data.colors[1]}">${finalScore.toFixed(1)}% (${rank})</span>
                </div>
                <div class="text-xs space-y-1">
                    <p class="flex justify-between"><span class="font-semibold text-amber-500">メイン (${cardState.mainStat}):</span> <span class="font-mono">${(theoreticalMaxWeightedER > 0.001 ? (mainWeightedER / theoreticalMaxWeightedER) * 100 : 0).toFixed(1)}点</span></p>
                    ${subDetails.map((sub, i) => sub.name ? `
                        <p class="flex justify-between">
                           <span class="flex items-center gap-1.5 font-semibold text-sky-500">
                              <span class="value-feedback-indicator w-1.5 h-3 rounded-full ${getValueFeedbackClass(agentId, sub.name, false)} flex-shrink-0"></span>
                              <span>サブ${i+1} (${sub.name} x${sub.hits}):</span>
                            </span>
                           <span class="font-mono">${(theoreticalMaxWeightedER > 0.001 ? (sub.weightedER / theoreticalMaxWeightedER) * 100 : 0).toFixed(1)}点</span>
                         </p>` : '').join('')}
                </div>
            </div>`;
    });

    const averageScore = discCount > 0 ? totalScore / discCount : 0;
    const overallRank = getRankForPerfection(averageScore);

    detailsHtml += `
        </div> <div class="mt-4 pt-4 border-t border-[var(--border-primary)] text-center">
            <p class="text-sm font-bold text-[var(--text-secondary)]">平均スコア</p>
            <p class="text-3xl font-bold" style="color: ${overallRank.data.colors[1]}">${averageScore.toFixed(1)}% (${overallRank.rank})</p>
        </div>`;

    // モーダルで表示
    openModal(
      `${agentName} のスコア詳細`, // タイトル
      detailsHtml, // 内容
      null, // フッターボタンなし
      `modal-lg bg-[var(--bg-secondary)] border-${roleColor}-500` // 少し大きめのモーダル
    );
}


/**
 * 現在計算機に入力されているディスク情報を「マイディスク」に保存する
 */
async function saveCurrentDiscToMyDiscs() { // async に変更
    if (!state.currentUser) {
        showLoginModal(); // modals.js の関数を呼び出す
        showToast('マイディスク機能を利用するにはログインが必要です。', 'bg-blue-500');
        return;
    }

    const discsToSave = [];
    let hasInvalidCard = false;

    document.querySelectorAll('.disc-input-card').forEach(card => {
        const discNum = parseInt(card.dataset.cardId, 10);
        const cardState = readCardState(card);

        if (!cardState.mainStat) {
            showToast(`ディスク ${discNum} のメインステータスが未入力のため保存できません。`, 'bg-yellow-500');
            hasInvalidCard = true;
            return; // このカードはスキップ
        }
        // Lv0 は保存しない（またはLv3として保存する？） - ここではスキップ
        if (cardState.level < 3) {
             showToast(`ディスク ${discNum} はLv3未満のため保存できません。`, 'bg-yellow-500');
             hasInvalidCard = true;
             return;
        }
         // サブステが1つも選択されていない場合もスキップ
         if (cardState.subStats.filter(s => s.name).length === 0) {
              showToast(`ディスク ${discNum} はサブステータスが未入力のため保存できません。`, 'bg-yellow-500');
              hasInvalidCard = true;
              return;
         }


        // 保存するデータ形式に変換
        discsToSave.push({
            // id や createdAt は Firestore に追加時に自動生成される
            // characterId: null, // 特定キャラには紐付けない
            customName: `計算機 (${new Date().toLocaleDateString()}) #${discNum}`, // 仮の名前
            discName: '', // discName は任意入力とする (my-discs.js側で対応が必要)
            discNum: discNum,
            mainStat: cardState.mainStat,
            opCount: cardState.initialOpCount,
            level: cardState.level,
            subStats: cardState.subStats
                .filter(s => s.name) // 名前があるものだけ
                .map(s => ({ name: s.name, hits: s.hits })) // hits のみを保存
        });
    });

    if (hasInvalidCard || discsToSave.length === 0) {
        if(!hasInvalidCard) showToast('保存できる有効なディスク情報がありません。', 'bg-yellow-500');
        return;
    }

    // 保存処理 (firebase-auth.js の saveMyDiscs を使う)
    try {
        // saveMyDiscs が配列を受け取るか確認が必要
        // もし単一ディスク保存ならループで呼び出す
        await saveMyDiscs(discsToSave); // 配列を渡す (firebase-auth.js側の実装依存)
        showToast(`${discsToSave.length}個のディスクをマイディスクに保存しました！`, 'bg-green-500');
        // 必要なら state.myDiscs を更新して再描画
        // TBD: state.myDiscs の更新ロジック (firebase-auth.js 側でやるべきか？)
        // 例: state.myDiscs = await fetchMyDiscs(); renderMyDiscs(); など
    } catch (error) {
        console.error("Error saving discs:", error);
        showToast(`ディスクの保存中にエラーが発生しました: ${error.message}`, 'bg-red-500');
    }
}