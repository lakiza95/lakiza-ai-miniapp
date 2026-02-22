
// ==========================================
// 1. КОНФИГУРАЦИЯ
// ==========================================
const N8N_WEBHOOK_URL = 'https://lakiza.n-8n.com/webhook/test123weqwe';// <-- ВАШ URL// <-- ВАШ URL

const tg = window.Telegram.WebApp;
tg.expand();

let currentSessionId = null;
let questionNumber = 1;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const screens = { 
    welcome: document.getElementById('screen-welcome'), 
    chat: document.getElementById('screen-chat'), 
    result: document.getElementById('screen-result'),
    history: document.getElementById('screen-history'),
    profile: document.getElementById('screen-profile') // <-- Добавлен экран профиля
};

const chatHistory = document.getElementById('chatHistory');
const historyList = document.getElementById('historyList');
const masterPlayer = document.getElementById('masterPlayer');
const recordBtn = document.getElementById('recordBtn');
const iconMic = recordBtn.querySelector('.icon-mic');
const iconStop = recordBtn.querySelector('.icon-stop');
const visualizer = document.getElementById('visualizer');
const statusText = document.getElementById('statusText');

let currentPlayingId = null; 

// ==========================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function showScreen(screenId) {
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

function toggleLoader(show, text = "Загрузка...") {
    const loader = document.getElementById('loader');
    document.getElementById('loaderText').innerText = text;
    show ? loader.classList.remove('hidden') : loader.classList.add('hidden');
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// ==========================================
// 3. ИСТОРИЯ ЧАТА (BUBBLES)
// ==========================================

function addMessageBubble(role, audioSrc) {
    const msgId = 'msg_' + Date.now();
    const isUser = role === 'user';
    
    let barsHTML = '';
    for (let i = 0; i < 35; i++) {
        const height = Math.floor(Math.random() * 40) + 20 + (Math.sin(i/5) * 20); 
        barsHTML += `<div class="wave-bar" style="height: ${Math.max(15, height)}%"></div>`;
    }

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${isUser ? 'msg-user' : 'msg-ai'}`;
    bubble.id = msgId;

    bubble.innerHTML = `
        <button class="play-btn" onclick="togglePlay('${msgId}', '${audioSrc}')">
            <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="icon-pause hidden" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        </button>
        <div class="wave-container">
            <div class="wave-layer">${barsHTML}</div>
            <div class="wave-layer wave-active-layer" id="progress_${msgId}">${barsHTML}</div>
        </div>
        <div class="time-label" id="time_${msgId}">0:00</div>
    `;

    chatHistory.appendChild(bubble);
    setTimeout(() => chatHistory.scrollTop = chatHistory.scrollHeight, 50);

    if (!isUser) togglePlay(msgId, audioSrc);
}

// ==========================================
// 4. УПРАВЛЕНИЕ МАСТЕР-ПЛЕЕРОМ
// ==========================================

function togglePlay(msgId, audioSrc) {
    if (currentPlayingId === msgId) {
        if (masterPlayer.paused) masterPlayer.play();
        else masterPlayer.pause();
        return;
    }
    if (currentPlayingId) resetBubbleUI(currentPlayingId);

    currentPlayingId = msgId;
    
    if (!audioSrc.startsWith('blob:') && !audioSrc.startsWith('data:')) {
        masterPlayer.src = `data:audio/mp3;base64,${audioSrc}`;
    } else {
        masterPlayer.src = audioSrc; 
    }
    masterPlayer.play().catch(e => console.log("Play error:", e));
}

function resetBubbleUI(msgId) {
    const bubble = document.getElementById(msgId);
    if (!bubble) return;
    bubble.querySelector('.icon-play').classList.remove('hidden');
    bubble.querySelector('.icon-pause').classList.add('hidden');
    document.getElementById(`progress_${msgId}`).style.clipPath = 'inset(0 100% 0 0)';
}

masterPlayer.addEventListener('play', () => {
    if(!currentPlayingId) return;
    const bubble = document.getElementById(currentPlayingId);
    bubble.querySelector('.icon-play').classList.add('hidden');
    bubble.querySelector('.icon-pause').classList.remove('hidden');
});

masterPlayer.addEventListener('pause', () => {
    if(!currentPlayingId) return;
    const bubble = document.getElementById(currentPlayingId);
    bubble.querySelector('.icon-play').classList.remove('hidden');
    bubble.querySelector('.icon-pause').classList.add('hidden');
});

masterPlayer.addEventListener('ended', () => {
    if(!currentPlayingId) return;
    resetBubbleUI(currentPlayingId);
    currentPlayingId = null;
});

masterPlayer.addEventListener('timeupdate', () => {
    if(!currentPlayingId) return;
    const current = masterPlayer.currentTime;
    const duration = masterPlayer.duration;
    if (duration && isFinite(duration)) {
        const percent = (current / duration) * 100;
        const clipRight = 100 - percent; 
        document.getElementById(`progress_${currentPlayingId}`).style.clipPath = `inset(0 ${clipRight}% 0 0)`;
        document.getElementById(`time_${currentPlayingId}`).innerText = formatTime(current);
    }
});

masterPlayer.addEventListener('loadedmetadata', () => {
    if(!currentPlayingId) return;
    if (isFinite(masterPlayer.duration)) {
        document.getElementById(`time_${currentPlayingId}`).innerText = formatTime(masterPlayer.duration);
    }
});

// ==========================================
// 5. ИСТОРИЯ И ПРОФИЛЬ
// ==========================================

async function loadHistory() {
    toggleLoader(true, "Загрузка истории...");
    
    try {
        const data = await sendToN8N({ action: 'get_history', userData: tg.initDataUnsafe });
        historyList.innerHTML = '';

        if (data.history && data.history.length > 0) {
            data.history.forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `<span class="history-date">${item.date}</span><span class="history-score">${item.score}/10</span>`;
                historyList.appendChild(div);
            });
        } else {
            historyList.innerHTML = '<p style="text-align:center; color:gray; margin-top:20px;">У вас пока нет тренировок</p>';
        }

        showScreen('history');
    } catch (e) {
        alert("Не удалось загрузить историю");
    } finally {
        toggleLoader(false);
    }
}

// Загрузка профиля (опционально, чтобы форма предзаполнялась)
async function loadProfile() {
    toggleLoader(true, "Загрузка профиля...");
    try {
        // Пытаемся получить профиль, если он уже есть
        const data = await sendToN8N({ action: 'get_profile', userData: tg.initDataUnsafe });
        if (data.name) document.getElementById('profileName').value = data.name;
        if (data.level) document.getElementById('profileLevel').value = data.level;
    } catch (e) {
        // Если база пустая или ошибка сети — просто открываем пустую форму
        console.log("Профиль не найден или ошибка сети");
    } finally {
        toggleLoader(false);
        showScreen('profile');
    }
}

// Сохранение профиля
async function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const level = document.getElementById('profileLevel').value;
    
    if (!name) {
        tg.HapticFeedback.notificationOccurred('error');
        alert("Пожалуйста, введите ваше имя");
        return;
    }

    toggleLoader(true, "Сохранение...");
    
    try {
        await sendToN8N({
            action: 'save_profile',
            name: name,
            level: level,
            userData: tg.initDataUnsafe
        });
        
        tg.HapticFeedback.notificationOccurred('success');
        showScreen('welcome');
    } catch (e) {
        alert("Ошибка сохранения: " + e.message);
    } finally {
        toggleLoader(false);
    }
}


// ==========================================
// 6. ЛОГИКА СЕССИИ (START & SEND)
// ==========================================

async function sendToN8N(payload) {
    const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return await res.json();
}

async function startSession() {
    toggleLoader(true, "Создаем сессию...");
    currentSessionId = generateUUID();
    questionNumber = 1;
    chatHistory.innerHTML = ''; 

    try {
        const data = await sendToN8N({
            action: 'start_session',
            session_id: currentSessionId,
            userData: tg.initDataUnsafe
        });

        showScreen('chat');
        document.getElementById('questionCounter').innerText = `Сессия #${currentSessionId.substring(0,4)}`;
        toggleLoader(false);

        if (data.audio) {
            addMessageBubble('ai', data.audio);
        }
    } catch (e) {
        alert("Ошибка старта: " + e.message);
        toggleLoader(false);
    }
}

recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    masterPlayer.pause();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            options = MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : undefined;
        }

        mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = sendVoiceAnswer;
        mediaRecorder.start();
        isRecording = true;
        
        recordBtn.classList.add('recording');
        iconMic.classList.add('hidden');
        iconStop.classList.remove('hidden');
        visualizer.classList.add('active');
        statusText.innerText = "Запись идет... Нажми для отправки";
        tg.HapticFeedback.impactOccurred('medium');

    } catch (e) {
        alert("Нет доступа к микрофону");
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        recordBtn.classList.remove('recording');
        iconMic.classList.remove('hidden');
        iconStop.classList.add('hidden');
        visualizer.classList.remove('active');
        statusText.innerText = "Отправка...";
        toggleLoader(true, "ИИ думает...");
    }
}

async function sendVoiceAnswer() {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    const localAudioUrl = URL.createObjectURL(audioBlob);
    addMessageBubble('user', localAudioUrl);

    const formData = new FormData();
    formData.append('action', 'submit_answer');
    formData.append('session_id', currentSessionId);
    formData.append('question_number', questionNumber);
    formData.append('userData', JSON.stringify(tg.initDataUnsafe));
    formData.append('file', audioBlob, `voice.${fileExt}`);

    try {
        const response = await fetch(N8N_WEBHOOK_URL, { method: 'POST', body: formData });
        const data = await response.json();
        
        if (data.status === 'finished') {
            showScreen('result');
            document.getElementById('finalScore').innerText = data.score;
            document.getElementById('finalFeedback').innerText = data.feedback;
            tg.HapticFeedback.notificationOccurred('success');
        } else if (data.audio) {
            questionNumber++;
            addMessageBubble('ai', data.audio);
            statusText.innerText = "Нажми, чтобы ответить";
        }
    } catch (e) {
        alert("Ошибка отправки: " + e.message);
    } finally {
        toggleLoader(false);
    }
}
