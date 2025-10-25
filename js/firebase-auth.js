// js/firebase-auth.js
import { state } from './main.js';
import { rerenderCurrentSection, navigateToSection } from './router.js';
import { showToast } from './ui/components.js';
import { showLoginModal, closeModal } from './ui/modals.js';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let auth, db, googleProvider;

export function initializeFirebase() {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();
}

export function authStateChangedHandler(user) {
    state.currentUser = user;
    updateLoginUI();
    if (user) {
        loadUserDataFromFirestore();
    } else {
        state.myCharacters = [];
        state.myBuilds = [];
        state.myWEngines = [];
        state.myDiscs = [];
        state.chatHistories = { general: [], disc: [], character: [], party: [] };
        state.consentGiven = false;
        const currentNavId = document.querySelector('.nav-link.active')?.dataset.section;
        if (['my-builds', 'my-discs'].includes(currentNavId)) {
            navigateToSection('agents');
        } else {
            rerenderCurrentSection(currentNavId);
        }
    }
}

function updateLoginUI() {
    const userProfileSection = document.getElementById('user-profile-section');
    if (!userProfileSection) return;

    if (state.currentUser) {
        userProfileSection.innerHTML = `
            <div class="flex items-center gap-3">
                <img src="${state.currentUser.photoURL || `https://i.pravatar.cc/40?u=${state.currentUser.uid}`}" alt="User Avatar" class="w-10 h-10 rounded-full border-2 border-[var(--border-primary)]">
                <div class="flex-1 overflow-hidden">
                    <p class="font-semibold text-sm text-[var(--text-primary)] truncate">${state.currentUser.displayName || state.currentUser.email}</p>
                    <p class="text-xs text-green-500">クラウド同期 ON</p>
                </div>
                <button id="sign-out-btn" title="ログアウト" class="text-[var(--text-secondary)] hover:text-red-500 transition-colors p-1 rounded-full flex-shrink-0 interactive-scale">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"></path></svg>
                </button>
            </div>`;
        document.getElementById('sign-out-btn').addEventListener('click', () => {
            auth.signOut().then(() => showToast('ログアウトしました。'));
        });
    } else {
        userProfileSection.innerHTML = `
            <button id="show-login-modal-btn" class="w-full flex items-center justify-center gap-2 bg-[var(--accent-blue)] hover:opacity-90 text-white font-semibold py-3 px-4 rounded-lg transition interactive-scale">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z"></path></svg>
                <span>ログイン / 新規登録</span>
            </button>`;
        document.getElementById('show-login-modal-btn').addEventListener('click', showLoginModal);
    }
}

async function loadUserDataFromFirestore() {
    if (!state.currentUser) return;
    const userDocRef = db.collection('users').doc(state.currentUser.uid);
    try {
        const doc = await userDocRef.get();
        if (doc.exists) {
            const data = doc.data();
            state.myCharacters = data.myCharacters || [];
            state.myBuilds = data.myBuilds || [];
            state.myWEngines = data.myWEngines || [];
            state.myDiscs = data.myDiscs || [];
            state.chatHistories = data.chatHistories || { general: [], disc: [], character: [], party: [] };
            state.consentGiven = data.consentGiven || false; // 同意設定を読み込む
        } else {
            await userDocRef.set({
                myCharacters: [],
                myBuilds: [],
                myWEngines: [],
                myDiscs: [],
                chatHistories: { general: [], disc: [], character: [], party: [] },
                consentGiven: false // 新規ユーザーのデフォルトはfalse
            });
        }
    } catch (error) {
        console.error("Firestoreからのデータ読み込みエラー: ", error);
        showToast('ユーザーデータの読み込みに失敗しました。', 'bg-red-500');
    } finally {
        const currentNavId = document.querySelector('.nav-link.active')?.dataset.section;
        rerenderCurrentSection(currentNavId);
    }
}

async function saveMyDataToFirestore(key, data) {
    if (!state.currentUser) return;
    const userDocRef = db.collection('users').doc(state.currentUser.uid);
    try {
        await userDocRef.set({ [key]: data }, { merge: true });
    } catch (error) {
        console.error("Firestoreへのデータ保存エラー: ", error);
        showToast('データの保存に失敗しました。', 'bg-red-500');
    }
}

export async function saveAnonymousLog(logData) {
    try {
        await db.collection('anonymous-chat-logs').add(logData);
    } catch (error) {
        console.error("匿名ログの保存エラー: ", error);
    }
}

export async function updateUserConsent(consent) {
    if (!state.currentUser) return;
    state.consentGiven = consent;
    await saveMyDataToFirestore('consentGiven', consent);
}

export async function saveChatHistory() {
    if (!state.currentUser) return;
    await saveMyDataToFirestore('chatHistories', state.chatHistories);
}

export async function saveMyCharacters(modalElement) {
    if (!state.currentUser) { showLoginModal(); return; }
    const checkboxes = modalElement.querySelectorAll('input[type="checkbox"]');
    state.myCharacters = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    await saveMyDataToFirestore('myCharacters', state.myCharacters);
    showToast('マイキャラ情報を保存しました。');
    closeModal();
    rerenderCurrentSection('agents');
}

export async function saveMyWEngines(modalElement) {
    if (!state.currentUser) { showLoginModal(); return; }
    const checkboxes = modalElement.querySelectorAll('input[type="checkbox"]');
    state.myWEngines = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    await saveMyDataToFirestore('myWEngines', state.myWEngines);
    showToast('マイ音動機情報を保存しました。');
    closeModal();
    rerenderCurrentSection('wEngines');
}

export async function saveMyDiscs() {
    if (!state.currentUser) { showLoginModal(); return; }
    await saveMyDataToFirestore('myDiscs', state.myDiscs);
    rerenderCurrentSection('my-discs');
}

export async function saveMyBuilds() {
    if (!state.currentUser) { showLoginModal(); return; }
    await saveMyDataToFirestore('myBuilds', state.myBuilds);
    rerenderCurrentSection('my-builds');
}

export async function deleteBuild(buildId) {
    if (!state.currentUser) { showLoginModal(); return; }
    state.myBuilds = state.myBuilds.filter(build => build.id !== buildId);
    await saveMyBuilds();
    showToast('ビルドを削除しました。', 'bg-red-500');
}

export async function deleteDisc(discId) {
    if (!state.currentUser) { showLoginModal(); return; }
    state.myDiscs = state.myDiscs.filter(disc => disc.id !== discId);
    await saveMyDiscs();
    showToast('ディスクを削除しました。', 'bg-red-500');
}

export async function handleEmailLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('auth-error');
    try {
        await auth.signInWithEmailAndPassword(email, password);
        closeModal();
        showToast('ログインしました。');
    } catch (error) {
        errorDiv.textContent = getFirebaseAuthErrorMessage(error.code);
        errorDiv.classList.remove('hidden');
    }
}

export async function signInWithGoogle() {
    try {
        await auth.signInWithPopup(googleProvider);
        closeModal();
        showToast('ログインしました。');
    } catch (error) {
        const errorDiv = document.getElementById('auth-error');
        if (errorDiv) {
            errorDiv.textContent = getFirebaseAuthErrorMessage(error.code);
            errorDiv.classList.remove('hidden');
        } else {
            showToast(`エラー: ${error.message}`, 'bg-red-500');
        }
    }
}

export async function handleSignUp() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('auth-error');
    if (!email || !password) {
        errorDiv.textContent = 'メールアドレスとパスワードを入力してください。';
        errorDiv.classList.remove('hidden');
        return;
    }
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        closeModal();
        showToast('新規登録が完了しました。ようこそ！');
    } catch (error) {
        errorDiv.textContent = getFirebaseAuthErrorMessage(error.code);
        errorDiv.classList.remove('hidden');
    }
}

function getFirebaseAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'メールアドレスまたはパスワードが間違っています。';
        case 'auth/email-already-in-use':
            return 'このメールアドレスは既に使用されています。';
        case 'auth/weak-password':
            return 'パスワードは6文字以上で設定してください。';
        case 'auth/invalid-email':
            return '無効なメールアドレスです。';
        default:
            return '認証中にエラーが発生しました。';
    }
}
