// =============================================
// Firebase設定
// =============================================
// 注意: 以下の設定を自分のFirebaseプロジェクトの設定に置き換えてください
// Firebase Console (https://console.firebase.google.com/) で:
// 1. プロジェクトを作成
// 2. Authentication > Sign-in method > メール/パスワード を有効化
// 3. Firestore Database を作成
// 4. プロジェクト設定から設定情報をコピー
const firebaseConfig = {
    apiKey: "AIzaSyAqeY7SrrXx_sVgx87UqNkMhxuBNSeKuTQ",
    authDomain: "memorize-app-d0b24.firebaseapp.com",
    projectId: "memorize-app-d0b24",
    storageBucket: "memorize-app-d0b24.firebasestorage.app",
    messagingSenderId: "768071173541",
    appId: "1:768071173541:web:6387a7dde7a9de1f92944c"
};

// Firebase初期化
let app, auth, db;
let currentUser = null;

function initFirebase() {
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        // オフライン対応
        db.enablePersistence().catch((err) => {
            console.log('Offline persistence error:', err);
        });

        return true;
    } catch (error) {
        console.error('Firebase init error:', error);
        return false;
    }
}

// =============================================
// データ構造
// =============================================
let folders = [];
let cards = [];
let currentFolder = null;
let currentStudyCards = [];
let currentCardIndex = 0;
let currentBlankIndex = 0;
let timerInterval = null;
let studyStartTime = null;
let timerSeconds = 0;
let timerEnabled = false;

// =============================================
// 認証機能
// =============================================
function setupAuthListeners() {
    // タブ切り替え
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tabName}-form`).classList.add('active');
            hideAuthError();
        });
    });

    // ログインフォーム
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        showAuthLoading(true);
        hideAuthError();

        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            showAuthError(getAuthErrorMessage(error.code));
        }
        showAuthLoading(false);
    });

    // 新規登録フォーム
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const passwordConfirm = document.getElementById('register-password-confirm').value;

        if (password !== passwordConfirm) {
            showAuthError('パスワードが一致しません');
            return;
        }

        showAuthLoading(true);
        hideAuthError();

        try {
            await auth.createUserWithEmailAndPassword(email, password);
        } catch (error) {
            showAuthError(getAuthErrorMessage(error.code));
        }
        showAuthLoading(false);
    });

    // ログアウトボタン
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (confirm('ログアウトしますか？')) {
            await auth.signOut();
        }
    });

    // 認証状態の監視
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            showMainApp();
            loadDataFromFirestore();
        } else {
            currentUser = null;
            showAuthView();
        }
    });
}

function getAuthErrorMessage(code) {
    const messages = {
        'auth/email-already-in-use': 'このメールアドレスは既に登録されています',
        'auth/invalid-email': '無効なメールアドレスです',
        'auth/operation-not-allowed': 'メール/パスワード認証が無効です',
        'auth/weak-password': 'パスワードは6文字以上にしてください',
        'auth/user-disabled': 'このアカウントは無効になっています',
        'auth/user-not-found': 'アカウントが見つかりません',
        'auth/wrong-password': 'パスワードが正しくありません',
        'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません',
        'auth/too-many-requests': 'ログイン試行回数が多すぎます。しばらくお待ちください'
    };
    return messages[code] || 'エラーが発生しました';
}

function showAuthError(message) {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideAuthError() {
    document.getElementById('auth-error').style.display = 'none';
}

function showAuthLoading(show) {
    document.getElementById('auth-loading').style.display = show ? 'block' : 'none';
}

function showAuthView() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
}

// =============================================
// Firestoreデータ同期
// =============================================
async function loadDataFromFirestore() {
    if (!currentUser) return;

    try {
        // フォルダ読み込み
        const foldersSnapshot = await db.collection('users').doc(currentUser.uid)
            .collection('folders').orderBy('createdAt').get();

        folders = [];
        foldersSnapshot.forEach(doc => {
            folders.push({ id: doc.id, ...doc.data() });
        });

        // フォルダがなければデフォルトを作成
        if (folders.length === 0) {
            const defaultFolder = {
                name: 'デフォルト',
                createdAt: new Date().toISOString()
            };
            const docRef = await db.collection('users').doc(currentUser.uid)
                .collection('folders').add(defaultFolder);
            folders.push({ id: docRef.id, ...defaultFolder });
        }

        // カード読み込み
        const cardsSnapshot = await db.collection('users').doc(currentUser.uid)
            .collection('cards').orderBy('createdAt').get();

        cards = [];
        cardsSnapshot.forEach(doc => {
            cards.push({ id: doc.id, ...doc.data() });
        });

        renderFolders();
        updateFolderSelect();

    } catch (error) {
        console.error('Data load error:', error);
        // フォールバック: ローカルストレージから読み込み
        loadDataFromLocalStorage();
    }
}

function loadDataFromLocalStorage() {
    const savedFolders = localStorage.getItem('folders');
    const savedCards = localStorage.getItem('cards');

    if (savedFolders) {
        folders = JSON.parse(savedFolders);
    } else {
        folders = [{
            id: 'default-' + Date.now(),
            name: 'デフォルト',
            createdAt: new Date().toISOString()
        }];
    }

    if (savedCards) {
        cards = JSON.parse(savedCards);
    }

    renderFolders();
    updateFolderSelect();
}

async function saveFolder(folder) {
    if (!currentUser) {
        // ローカルストレージに保存
        localStorage.setItem('folders', JSON.stringify(folders));
        return;
    }

    try {
        if (folder.id && !folder.id.toString().startsWith('default-')) {
            await db.collection('users').doc(currentUser.uid)
                .collection('folders').doc(folder.id).set({
                    name: folder.name,
                    createdAt: folder.createdAt
                });
        } else {
            const docRef = await db.collection('users').doc(currentUser.uid)
                .collection('folders').add({
                    name: folder.name,
                    createdAt: folder.createdAt
                });
            folder.id = docRef.id;
        }
    } catch (error) {
        console.error('Folder save error:', error);
    }
}

async function saveCardToFirestore(card) {
    if (!currentUser) {
        localStorage.setItem('cards', JSON.stringify(cards));
        return;
    }

    try {
        const cardData = { ...card };
        delete cardData.id;

        const docRef = await db.collection('users').doc(currentUser.uid)
            .collection('cards').add(cardData);
        card.id = docRef.id;
    } catch (error) {
        console.error('Card save error:', error);
    }
}

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    const firebaseReady = initFirebase();

    if (firebaseReady && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        setupAuthListeners();
    } else {
        // Firebase未設定の場合はローカルモードで動作
        console.log('Firebase not configured. Running in local mode.');
        document.getElementById('auth-view').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('logout-btn').style.display = 'none';
        loadDataFromLocalStorage();
    }

    setupEventListeners();
});

// イベントリスナー設定
function setupEventListeners() {
    // ナビゲーション
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });

    // フォルダ追加
    document.getElementById('add-folder-btn').addEventListener('click', () => {
        document.getElementById('folder-modal').classList.add('active');
    });

    document.getElementById('save-folder-btn').addEventListener('click', createFolder);
    document.getElementById('close-folder-modal').addEventListener('click', () => {
        document.getElementById('folder-modal').classList.remove('active');
        document.getElementById('folder-name').value = '';
    });

    // カード作成モード切り替え
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.mode-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${mode}-mode`).classList.add('active');
        });
    });

    // カード保存
    document.getElementById('save-card-btn').addEventListener('click', saveCard);

    // フォルダから戻る
    document.getElementById('back-to-folders').addEventListener('click', () => {
        switchView('folders');
        currentFolder = null;
    });

    // 学習開始
    document.getElementById('start-study-btn').addEventListener('click', startStudy);

    // 学習終了
    document.getElementById('back-to-cards').addEventListener('click', () => {
        stopTimer();
        showCardsListView(currentFolder);
    });

    // タイマーモーダル
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.minutes);
            startStudyWithTimer(minutes * 60);
        });
    });

    document.getElementById('custom-timer-btn').addEventListener('click', () => {
        const minutes = parseInt(document.getElementById('custom-minutes').value);
        if (minutes > 0) {
            startStudyWithTimer(minutes * 60);
        }
    });

    document.getElementById('no-timer-btn').addEventListener('click', () => {
        document.getElementById('timer-modal').classList.remove('active');
        beginStudy();
    });

    document.getElementById('close-timer-modal').addEventListener('click', () => {
        document.getElementById('timer-modal').classList.remove('active');
    });

    // スワイプ操作
    setupSwipeControls();
}

// ビュー切り替え
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`${viewName}-view`).classList.add('active');
    document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
}

// フォルダ一覧表示
function renderFolders() {
    const foldersList = document.getElementById('folders-list');
    foldersList.innerHTML = '';

    folders.forEach(folder => {
        const cardCount = cards.filter(c => String(c.folderId) === String(folder.id)).length;
        
        const folderItem = document.createElement('div');
        folderItem.className = 'folder-item';
        folderItem.innerHTML = `
            <h3>📁 ${folder.name}</h3>
            <p>${cardCount} 枚のカード</p>
        `;
        folderItem.addEventListener('click', () => showCardsListView(folder));
        foldersList.appendChild(folderItem);
    });
}

// フォルダ作成
async function createFolder() {
    const name = document.getElementById('folder-name').value.trim();
    if (!name) return;

    const newFolder = {
        id: null,
        name: name,
        createdAt: new Date().toISOString()
    };

    folders.push(newFolder);
    await saveFolder(newFolder);
    renderFolders();
    updateFolderSelect();

    document.getElementById('folder-modal').classList.remove('active');
    document.getElementById('folder-name').value = '';
}

// フォルダ選択プルダウン更新
function updateFolderSelect() {
    const select = document.getElementById('folder-select');
    select.innerHTML = '';
    
    folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        select.appendChild(option);
    });
}

// カード保存
async function saveCard() {
    const folderId = document.getElementById('folder-select').value;
    const activeMode = document.querySelector('.mode-tab.active').dataset.mode;
    const tagsInput = document.getElementById('tags').value;

    let card;

    if (activeMode === 'fillblank') {
        const question = document.getElementById('question').value.trim();
        if (!question) {
            alert('問題文を入力してください');
            return;
        }

        card = {
            id: null,
            folderId: folderId,
            mode: 'fillblank',
            question: question,
            tags: tagsInput ? tagsInput.split(',').map(t => t.trim()) : [],
            createdAt: new Date().toISOString()
        };
    } else {
        const title = document.getElementById('title-fulltext').value.trim();
        const fulltext = document.getElementById('fulltext').value.trim();

        if (!fulltext) {
            alert('暗記する文章を入力してください');
            return;
        }

        card = {
            id: null,
            folderId: folderId,
            mode: 'fulltext',
            title: title || '無題',
            fulltext: fulltext,
            tags: tagsInput ? tagsInput.split(',').map(t => t.trim()) : [],
            createdAt: new Date().toISOString()
        };
    }

    cards.push(card);
    await saveCardToFirestore(card);

    // フォーム初期化
    document.getElementById('question').value = '';
    document.getElementById('title-fulltext').value = '';
    document.getElementById('fulltext').value = '';
    document.getElementById('tags').value = '';

    alert('カードを保存しました！');
}

// カード一覧表示
function showCardsListView(folder) {
    currentFolder = folder;
    // IDは文字列で比較（Firestore対応）
    const folderCards = cards.filter(c => String(c.folderId) === String(folder.id));
    
    document.getElementById('folder-title').textContent = folder.name;
    
    const cardsList = document.getElementById('cards-list');
    cardsList.innerHTML = '';
    
    if (folderCards.length === 0) {
        cardsList.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;">カードがありません</p>';
    } else {
        folderCards.forEach(card => {
            const cardItem = document.createElement('div');
            cardItem.className = 'card-item';
            
            const modeBadge = card.mode === 'fillblank' ? '穴埋め' : '全文暗記';
            const preview = card.mode === 'fillblank' 
                ? card.question.substring(0, 50) 
                : `${card.title}: ${card.fulltext.substring(0, 50)}`;
            
            cardItem.innerHTML = `
                <div class="card-item-header">
                    <span class="card-mode-badge">${modeBadge}</span>
                </div>
                <div class="card-item-content">${preview}${preview.length >= 50 ? '...' : ''}</div>
                ${card.tags.length > 0 ? `
                    <div class="card-tags">
                        ${card.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                ` : ''}
            `;
            
            cardsList.appendChild(cardItem);
        });
    }
    
    document.getElementById('cards-list-view').classList.add('active');
    document.querySelectorAll('.view').forEach(v => {
        if (v.id !== 'cards-list-view') v.classList.remove('active');
    });
}

// 学習開始（タイマー設定画面表示）
function startStudy() {
    const folderCards = cards.filter(c => String(c.folderId) === String(currentFolder.id));
    if (folderCards.length === 0) {
        alert('カードがありません');
        return;
    }
    
    currentStudyCards = [...folderCards];
    document.getElementById('timer-modal').classList.add('active');
}

// タイマー付き学習開始
function startStudyWithTimer(seconds) {
    timerSeconds = seconds;
    timerEnabled = true;
    document.getElementById('timer-modal').classList.remove('active');
    beginStudy();
}

// 学習開始
function beginStudy() {
    currentCardIndex = 0;
    currentBlankIndex = 0;
    studyStartTime = Date.now();
    
    document.getElementById('current-card').textContent = 1;
    document.getElementById('total-cards').textContent = currentStudyCards.length;
    
    if (timerEnabled) {
        startTimer();
    } else {
        document.getElementById('timer-display').textContent = '--:--';
    }
    
    displayCard();
    
    document.getElementById('study-view').classList.add('active');
    document.querySelectorAll('.view').forEach(v => {
        if (v.id !== 'study-view') v.classList.remove('active');
    });
}

// タイマー開始
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        
        if (timerSeconds <= 0) {
            stopTimer();
            showTimerResult();
        }
    }, 1000);
}

// タイマー停止
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerEnabled = false;
}

// タイマー表示更新
function updateTimerDisplay() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    document.getElementById('timer-display').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// タイマー終了時の結果表示
function showTimerResult() {
    const cardsCompleted = currentCardIndex;
    const timeElapsed = Math.floor((Date.now() - studyStartTime) / 1000);
    const minutes = Math.floor(timeElapsed / 60);
    const seconds = timeElapsed % 60;
    
    alert(`時間終了！\n完了: ${cardsCompleted}枚 / ${currentStudyCards.length}枚\n経過時間: ${minutes}分${seconds}秒`);
}

// カード表示
function displayCard() {
    const card = currentStudyCards[currentCardIndex];
    const display = document.getElementById('card-display');
    
    if (card.mode === 'fillblank') {
        displayFillBlankCard(card, display);
    } else {
        displayFullTextCard(card, display);
    }
    
    document.getElementById('current-card').textContent = currentCardIndex + 1;
}

// 穴埋めカード表示
function displayFillBlankCard(card, display) {
    const regex = /【([^】]+)】/g;
    let html = card.question;
    let match;
    let index = 0;
    let result = '';
    let lastIndex = 0;
    
    while ((match = regex.exec(card.question)) !== null) {
        result += card.question.substring(lastIndex, match.index);
        result += `<span class="blank hidden" data-index="${index}" data-answer="${match[1]}">${match[1]}</span>`;
        lastIndex = regex.lastIndex;
        index++;
    }
    result += card.question.substring(lastIndex);
    
    display.innerHTML = result;
    currentBlankIndex = 0;
}

// 全文暗記カード表示
function displayFullTextCard(card, display) {
    const title = `<h2 style="margin-bottom:20px;">${card.title}</h2>`;
    const chars = card.fulltext.split('').map((char, i) => {
        if (char === '\n') return '<br>';
        return `<span class="fulltext-char hidden" data-index="${i}">${char}</span>`;
    }).join('');
    
    display.innerHTML = title + chars;
    currentBlankIndex = 0;
}

// スワイプ操作設定
function setupSwipeControls() {
    const display = document.getElementById('card-display');
    let touchStartX = 0;
    let touchEndX = 0;
    
    display.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    display.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });
    
    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchEndX - touchStartX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // 右スワイプ：前に戻る
                revealPrevious();
            } else {
                // 左スワイプ：次を表示
                revealNext();
            }
        }
    }
    
    // ボタンでも操作可能
    document.getElementById('prev-blank-btn').addEventListener('click', revealPrevious);
    document.getElementById('next-blank-btn').addEventListener('click', revealNext);
}

// 次を表示
function revealNext() {
    const card = currentStudyCards[currentCardIndex];
    
    if (card.mode === 'fillblank') {
        const blanks = document.querySelectorAll('.blank');
        if (currentBlankIndex < blanks.length) {
            blanks[currentBlankIndex].classList.remove('hidden');
            blanks[currentBlankIndex].classList.add('revealed');
            currentBlankIndex++;
        } else {
            // 次のカードへ
            nextCard();
        }
    } else {
        const chars = document.querySelectorAll('.fulltext-char');
        if (currentBlankIndex < chars.length) {
            chars[currentBlankIndex].classList.remove('hidden');
            chars[currentBlankIndex].classList.add('revealed');
            currentBlankIndex++;
        } else {
            // 次のカードへ
            nextCard();
        }
    }
}

// 前に戻る
function revealPrevious() {
    const card = currentStudyCards[currentCardIndex];
    
    if (card.mode === 'fillblank') {
        const blanks = document.querySelectorAll('.blank');
        if (currentBlankIndex > 0) {
            currentBlankIndex--;
            blanks[currentBlankIndex].classList.remove('revealed');
            blanks[currentBlankIndex].classList.add('hidden');
        }
    } else {
        const chars = document.querySelectorAll('.fulltext-char');
        if (currentBlankIndex > 0) {
            currentBlankIndex--;
            chars[currentBlankIndex].classList.remove('revealed');
            chars[currentBlankIndex].classList.add('hidden');
        }
    }
}

// 次のカードへ
function nextCard() {
    if (currentCardIndex < currentStudyCards.length - 1) {
        currentCardIndex++;
        currentBlankIndex = 0;
        displayCard();
    } else {
        // 学習終了
        stopTimer();
        alert('学習完了！お疲れさまでした。');
        showCardsListView(currentFolder);
    }
}
