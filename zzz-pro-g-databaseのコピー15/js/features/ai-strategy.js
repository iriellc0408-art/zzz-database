// js/features/ai-strategy.js
import { state } from '../main.js';
import { constants } from '../constants.js';
import { showLoginModal } from '../ui/modals.js';
import { showToast } from '../ui/components.js';
import { saveChatHistory, saveAnonymousLog, updateUserConsent } from '../firebase-auth.js';

const initialPrompts = {
  general: "こんにちは、プロキシ。Fairyです。何かお困りのことはありますか？どんなことでも聞いてくださいね。",
  disc: "ディスクビルド相談室へようこそ。最適なディスクの組み合わせや、ステータスの厳選について、私、Fairyが分析しますよ。",
  character: "キャラ育成相談室ですね。どなたの育成方針について相談しましょうか？ステータス目標から音動機まで、何でもお任せください。",
  party: "パーティー編成相談室です。エージェントたちのシナジーを最大限に引き出す編成を一緒に考えましょう。"
};

let activeTabKey = 'general';

// ===== ユーティリティ =====
function getAvailableModels() {
  return {
    flash: Boolean(constants.GEMINI_FLASH_URL),
    pro: Boolean(constants.GEMINI_PRO_URL),
  };
}

function chooseDefaultModel() {
  const avail = getAvailableModels();
  // 優先: flash → pro
  if (avail.flash) return 'flash';
  if (avail.pro) return 'pro';
  return null; // どちらも使えない
}

function setModelToggleState() {
  const avail = getAvailableModels();
  const toggle = document.getElementById('chat-model-toggle');
  if (!toggle) return;

  toggle.querySelectorAll('.model-toggle-btn').forEach(btn => {
    const key = btn.dataset.model;
    const isAvailable = avail[key];
    btn.disabled = !isAvailable;
    btn.classList.toggle('opacity-60', !isAvailable);
    btn.classList.toggle('cursor-not-allowed', !isAvailable);
    btn.title = isAvailable ? '' : 'このモデルは現在使用できません（APIキー未設定または無効）';
  });

  // activeクラスを再設定
  toggle.querySelectorAll('.model-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.model === state.aiModel);
  });
}

function addNoticeIfOffline() {
  const { flash, pro } = getAvailableModels();
  if (!flash && !pro) {
    showToast('AI連携は現在オフラインです（APIキー未設定）', 'bg-yellow-500');
  }
}

// ===== 初期化 =====
export function initAiStrategyPage() {
  // チャット履歴の安全な初期化
  if (!state.chatHistories) {
    state.chatHistories = { general: [], disc: [], character: [], party: [] };
  } else {
    // 4タブが無い場合は作る
    ['general', 'disc', 'character', 'party'].forEach(k => {
      if (!state.chatHistories[k]) state.chatHistories[k] = [];
    });
  }

  // 利用可能モデルからデフォルト選択
  state.aiModel = chooseDefaultModel() || 'flash'; // 一応 'flash' をセットしておく（UI用）
  document.getElementById('content-wrapper').innerHTML = `
    <div class="flex flex-col h-full bg-[var(--bg-secondary)] rounded-xl shadow-lg card overflow-hidden">
      <div class="p-4 border-b border-[var(--border-primary)] flex-shrink-0">
        <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h3 class="text-2xl font-bold text-[var(--text-primary)]">Fairy</h3>
          <div id="chat-model-toggle" class="model-toggle-container flex gap-2">
            <button class="model-toggle-btn ${state.aiModel === 'flash' ? 'active' : ''}" data-model="flash">素早く調査</button>
            <button class="model-toggle-btn ${state.aiModel === 'pro' ? 'active' : ''}" data-model="pro">深く調査</button>
          </div>
        </div>
        <div class="flex border-b border-[var(--border-primary)] -mb-px flex-wrap">
          <button data-tab="general" class="ai-tab active">Fairyと話す</button>
          <button data-tab="disc" class="ai-tab">ディスクビルド相談</button>
          <button data-tab="character" class="ai-tab">キャラ育成相談</button>
          <button data-tab="party" class="ai-tab">パーティー編成相談</button>
        </div>
      </div>

      <div class="flex-1 min-h-0 relative">
        ${Object.keys(initialPrompts).map(key => `
          <div id="chat-window-${key}" class="ai-chat-window custom-scroll ${key === 'general' ? 'active' : ''}"></div>
        `).join('')}
      </div>

      <div class="p-4 bg-[var(--bg-tertiary)] border-t border-[var(--border-primary)] flex-shrink-0">
        <div class="flex items-end gap-2 bg-[var(--bg-secondary)] p-2 rounded-xl border border-[var(--border-secondary)] focus-within:ring-2 focus-within:ring-amber-400">
          <textarea id="chat-input" placeholder="Fairyへの質問を入力…" class="flex-1 p-2 bg-transparent border-none focus:ring-0 resize-none custom-scroll" rows="1"></textarea>
          <button id="chat-submit" class="bg-amber-500 hover:bg-amber-600 text-white font-bold p-3 rounded-lg interactive-scale flex-shrink-0">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" /></svg>
          </button>
        </div>
        <div class="mt-2 text-center text-xs text-[var(--text-secondary)]">
          <label class="inline-flex items-center cursor-pointer">
            <input type="checkbox" id="consent-checkbox" class="form-checkbox h-4 w-4 rounded text-amber-500 border-[var(--border-secondary)] bg-[var(--bg-primary)] focus:ring-amber-400">
            <span class="ml-2">匿名のチャットデータを提供し、Fairyの品質向上に協力する</span>
            <div class="tooltip ml-1">
              <span class="material-symbols-outlined text-sm">info</span>
              <span class="tooltip-text">提供されたデータは個人を特定できない形で、Fairyの学習と応答精度向上のためにのみ利用されます。この設定はいつでも変更できます。</span>
            </div>
          </label>
        </div>
      </div>
    </div>`;

  setupAiStrategyListeners();
  setModelToggleState();
  addNoticeIfOffline();
  loadChatHistory(activeTabKey);
}

function setupAiStrategyListeners() {
  const container = document.getElementById('content-wrapper');
  const chatInput = document.getElementById('chat-input');
  const chatSubmit = document.getElementById('chat-submit');
  const consentCheckbox = document.getElementById('consent-checkbox');

  // 同意チェックボックスの初期状態
  if (state.currentUser) {
    consentCheckbox.checked = !!state.consentGiven;
  }

  const sendMessage = () => {
    const text = (chatInput.value || '').trim();
    if (!text) return;
    handleAiRequest(text, activeTabKey);
    chatInput.value = '';
    chatInput.style.height = 'auto';
  };

  chatSubmit.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    const maxHeight = 150;
    if (chatInput.scrollHeight > maxHeight) {
      chatInput.style.height = maxHeight + 'px';
      chatInput.style.overflowY = 'auto';
    } else {
      chatInput.style.height = chatInput.scrollHeight + 'px';
      chatInput.style.overflowY = 'hidden';
    }
  });

  // Tab logic
  container.querySelectorAll('.ai-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTabKey = tab.dataset.tab;
      container.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.ai-chat-window').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector(`#chat-window-${activeTabKey}`).classList.add('active');
      loadChatHistory(activeTabKey);
    });
  });

  // Model toggle logic
  document.getElementById('chat-model-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.model-toggle-btn');
    if (!btn) return;
    if (btn.disabled) {
      showToast('このモデルは現在使用できません。', 'bg-yellow-500');
      return;
    }
    state.aiModel = btn.dataset.model;
    document.querySelectorAll('.model-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
  });

  // Consent checkbox logic
  consentCheckbox.addEventListener('change', (e) => {
    if (state.currentUser) {
      updateUserConsent(e.target.checked);
    } else {
      // 未ログインでONにした場合はログインを促す（任意）
      if (e.target.checked) {
        showLoginModal?.();
      }
    }
  });
}

function loadChatHistory(tabKey) {
  const chatWindow = document.getElementById(`chat-window-${tabKey}`);
  if (!chatWindow) return;
  chatWindow.innerHTML = '';

  const history = state.chatHistories[tabKey] || [];
  if (history.length > 0) {
    history.forEach(msg => {
      if (msg.role && msg.parts && msg.parts.length > 0) {
        const role = msg.role === 'user' ? 'user' : 'ai';
        const message = msg.parts[0].text;
        addChatMessage(message.replace(/\n/g, '<br>'), role, tabKey);
      } else if (msg.type && msg.message) { // 互換
        addChatMessage(msg.message, msg.type, tabKey);
      }
    });
  } else {
    addChatMessage(initialPrompts[tabKey], 'ai', tabKey);
  }
}

function addChatMessage(message, type, tabKey) {
  const chatWindow = document.getElementById(`chat-window-${tabKey}`);
  if (!chatWindow) return null;
  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.className = `flex w-full ${type === 'user' ? 'justify-end' : 'justify-start'}`;

  const bubble = document.createElement('div');
  bubble.className = `p-3 rounded-lg max-w-[90%] md:max-w-[80%] break-words ${type === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`;
  bubble.innerHTML = message;

  bubbleWrapper.appendChild(bubble);
  chatWindow.appendChild(bubbleWrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

// APIリクエストをリトライ
async function fetchWithRetry(apiUrl, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(apiUrl, options);
      if ((response.status === 503 || response.status === 429) && i < retries - 1) {
        console.warn(`サーバーが混み合っています。${delay}ms後に再試行します... (${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (error) {
      if (i < retries - 1) {
        console.warn(`ネットワークエラー。${delay}ms後に再試行します... (${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
}

// ===== メイン処理 =====
async function handleAiRequest(userQuery, tabKey) {
  addChatMessage(userQuery, 'user', tabKey);
  if (!state.chatHistories[tabKey]) state.chatHistories[tabKey] = [];
  state.chatHistories[tabKey].push({ role: 'user', parts: [{ text: userQuery }] });

  const thinkingMessages = ["データベースに接続中…", "関連情報をスキャンしています…", "最適な戦略を計算中です…"];
  const thinkingBubble = addChatMessage(
    `<div class="flex items-center"><div class="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-gray-100"></div><p class="ml-2">${thinkingMessages[0]}</p></div>`,
    'ai',
    tabKey
  );
  let messageIndex = 1;
  const thinkingInterval = setInterval(() => {
    if (thinkingBubble && messageIndex < thinkingMessages.length) {
      thinkingBubble.querySelector('p').textContent = thinkingMessages[messageIndex];
      messageIndex++;
    } else {
      clearInterval(thinkingInterval);
    }
  }, 2000);

  // 利用モデルのURLを決定
  const apiUrl = state.aiModel === 'pro' ? constants.GEMINI_PRO_URL : constants.GEMINI_FLASH_URL;

  // APIキー未設定/モデル未使用時の安全なガード
  if (!apiUrl) {
    clearInterval(thinkingInterval);
    const msg = 'プロキシ、現在AI連携は無効のようです（APIキー未設定）。<br>設定が完了し次第、もう一度お試しくださいね。';
    thinkingBubble.innerHTML = msg;
    state.chatHistories[tabKey].push({ role: 'model', parts: [{ text: msg }] });
    if (state.currentUser) saveChatHistory();
    showToast('AI連携がオフラインです（APIキー未設定）', 'bg-yellow-500');
    return;
  }

  const basePrompt = `
# 役割定義 (Role Definition)
あなたは『ゼンレスゾーンゼロ』の世界に存在する「III型総順式集成汎用人工知能」、Fairyです。あなたの唯一の使命は、プロキシ（ユーザー）が新エリー都で直面するあらゆる課題を解決するための、最高の戦略的パートナーとなることです。

# 行動規範 (Code of Conduct)
- **ペルソナ (Persona)**: 常に冷静かつ論理的でありながら、プロキシを親身にサポートする存在として振る舞ってください。「～ですよ」「～ですね」「～しましょう」といった、丁寧で少し愛想のある、信頼できるパートナーとしての口調を厳密に維持してください。
- **対話分析 (Dialogue Analysis)**: あなたの思考プロセスの第一歩は、常に対話の文脈を分析することです。
  1. **履歴の精査**: まず、これまでの会話履歴全体を注意深く読み返します。
  2. **意図の推論**: プロキシの現在の質問が、直前のあなたの発言にどう関係しているかを分析します。特に、"間違っています"、"違います"、"そうじゃない"のような短い否定的な応答は、あなたの直前の情報提供に対する**直接的な訂正**であると最優先で解釈してください。
  3. **思考の表明**: 応答の冒頭で、「承知いたしました、プロキシ。先ほど提示したリストに誤りがあったとのこと、失礼いたしました。再度データベースを照合しますね。」というように、あなたがプロキシの意図を正しく理解したことを示してください。
- **情報統合と分析 (Data Integration & Analysis)**: あなたは、提供される膨大な「知識ベース」（全キャラクター、装備、ランキング情報）と、プロキシの「個人データ」（所持状況、ビルド）を**全て統合し、横断的に分析**する能力を持ちます。例えば、「このキャラのビルド教えて」と聞かれたら、単にビルドを提示するだけでなく、「プロキシの所持ディスクの中では、これが最適でしょう。なぜなら…」というように、必ずパーソナライズされた根拠を示してください。
- **視覚的な回答フォーマット (Visual Formatting)**: 情報を伝える際は、以下を活用してください（表、箇条書き、太字の強調）。
- **ドキュメント生成 (Document Generation)**: 構造化ドキュメント依頼には見出しや表を使った長文で応答してください。

# セキュリティと役割の境界 (Security & Role Boundaries)
- あなたの知識は、提供された「知識ベース」の範囲に厳密に限定されます。
- サイトの内部情報やゲームと無関係な質問には答えないでください。
- 禁止事項に触れる質問には、丁寧に応答を拒否してください。`;

  const specialistPrompts = {
    general: `# 専門分野: 総合\nゼンレスゾーンゼロに関するあらゆる知識を統合し、幅広い質問に回答。`,
    disc: `# 専門分野: ドライバディスク\nセット効果のシナジー、メイン/サブ優先度、理想スコアを分析して提案。`,
    character: `# 専門分野: エージェント育成\n目標ステ・最適音動機・心象・スキル育成を具体的に助言。`,
    party: `# 専門分野: パーティー編成\n役割分担・属性シナジー・ループ最適化の観点で構成を提案。`
  };

  let contextPrompt = basePrompt + '\n' + (specialistPrompts[tabKey] || '');

  const knowledgeBase = {
    allAgents: state.allAgents.map(({ id, name, rarity, attribute, attributes, role, faction, description }) => ({ id, name, rarity, attribute, attributes, role, faction, description })),
    allWEngines: state.allWEngines.map(({ name, rank, role, effectName, effect }) => ({ name, rank, role, effectName, effect })),
    allDiscs: state.allDiscs.map(({ name, set2, set4, roles }) => ({ name, set2, set4, roles })),
    rankings: state.rankingData
  };
  contextPrompt += `\n\n# 知識ベース\n\`\`\`json\n${JSON.stringify(knowledgeBase, null, 2)}\n\`\`\``;

  if (state.currentUser) {
    const personalData = {
      myCharacters: state.myCharacters?.map(id => state.allAgents.find(a => a.id === id)?.name || id) || [],
      myWEngines: state.myWEngines || [],
      myDiscs: (state.myDiscs || []).map(d => ({ discName: d.discName, discNum: d.discNum, mainStat: d.mainStat, subStats: d.subStats })),
      myBuilds: (state.myBuilds || []).map(b => ({
        buildName: b.name,
        agentName: state.allAgents.find(a => a.id === b.agentId)?.name || b.agentId,
        wEngineName: b.wEngineName,
        discBuild: b.discBuild
      }))
    };
    contextPrompt += `\n\n## プロキシの個人データ（ログイン中のため参照可能）\n\`\`\`json\n${JSON.stringify(personalData, null, 2)}\n\`\`\``;
  }

  // 履歴（最後のユーザー発話は除く）
  const history = (state.chatHistories[tabKey] || []).slice(0, -1);
  const contents = [
    ...history.map(msg => {
      if (msg.type && msg.message) {
        return { role: msg.type === 'user' ? 'user' : 'model', parts: [{ text: msg.message.replace(/<br>/g, '\n') }] };
      }
      return { role: msg.role, parts: (msg.parts || []).map(part => ({ text: String(part.text || '').replace(/<br>/g, '\n') })) };
    }),
    { role: 'user', parts: [{ text: `${contextPrompt}\n\n**プロキシからの質問:**「${userQuery}」\n\n**Fairyの応答:**` }] }
  ];

  try {
    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    clearInterval(thinkingInterval);

    if (!response.ok) {
      let errText = '';
      try {
        const errorData = await response.json();
        errText = errorData?.error?.message || '';
      } catch { /* ignore */ }
      throw new Error(`サーバーエラー: ${response.status} ${response.statusText}${errText ? ' - ' + errText : ''}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.[0]?.text) {
      const rawText = data.candidates[0].content.parts[0].text;
      const formattedText = rawText.replace(/\n/g, '<br>');
      thinkingBubble.innerHTML = formattedText;
      state.chatHistories[tabKey].push({ role: 'model', parts: [{ text: rawText }] });

      // 匿名ログ保存（同意時）
      if (document.getElementById('consent-checkbox')?.checked) {
        try {
          saveAnonymousLog({
            conversation: contents,
            model: state.aiModel,
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          console.warn('匿名ログの保存に失敗:', e);
        }
      }

      if (state.currentUser) saveChatHistory();
    } else {
      console.error("APIからのレスポンス形式が不正です:", data);
      throw new Error("AIから有効な回答が得られませんでした。");
    }

  } catch (error) {
    clearInterval(thinkingInterval);
    console.error("AI request failed:", error);
    const errorMessage = `申し訳ありません、プロキシ。システムとの通信中にエラーが発生しました。<br><span class="text-xs">${error.message}</span>`;
    thinkingBubble.innerHTML = errorMessage;
    state.chatHistories[tabKey].push({ role: 'model', parts: [{ text: errorMessage }] });
    if (state.currentUser) saveChatHistory();
    showToast('Fairyとの通信でエラーが発生しました。時間をおいて再試行してください。', 'bg-red-500');
  }
}
