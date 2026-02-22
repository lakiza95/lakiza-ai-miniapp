// 1. КОНФИГУРАЦИЯ
// ==========================================
const N8N_WEBHOOK_URL = 'https://lakiza.n-8n.com/webhook/test123weqwe';

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ И СОСТОЯНИЕ
// ==========================================
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
    result: document.getElementById('screen-result')
};

const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const statusText = document.getElementById('statusText');
const questionCounterDisplay = document.getElementById('questionCounter');
const recordBtn = document.getElementById('recordBtn');
const visualizer = document.getElementById('visualizer');

// Элементы кастомного плеера
const botPlayer = document.getElementById('botPlayer');
const playPauseBtn = document.getElementById('playPauseBtn');
const audioProgress = document.getElementById('audioProgress');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');

// ==========================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
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
    if (show) {
        loaderText.innerText = text;
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

function updateQuestionCounter() {
    questionCounterDisplay.innerText = `Вопрос #${questionNumber}`;
}

// ==========================================
// 4. ЛОГИКА КАСТОМНОГО ПЛЕЕРА
// ==========================================

function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

playPauseBtn.addEventListener('click', () => {
    if (botPlayer.paused) botPlayer.play();
    else botPlayer.pause();
});

botPlayer.addEventListener('play', () => playPauseBtn.innerText = '⏸');
botPlayer.addEventListener('pause', () => playPauseBtn.innerText = '▶️');
botPlayer.addEventListener('ended', () => {
    playPauseBtn.innerText = '▶️';
    audioProgress.value = 0;
    currentTimeDisplay.innerText = '0:00';
});

botPlayer.addEventListener('timeupdate', () => {
    const current = botPlayer.currentTime;
    const duration = botPlayer.duration;
    
    if (duration && isFinite(duration)) {
        audioProgress.value = (current / duration) * 100;
        currentTimeDisplay.innerText = formatTime(current);
        totalTimeDisplay.innerText = formatTime(duration);
    }
});

botPlayer.addEventListener('loadedmetadata', () => {
    if (isFinite(botPlayer.duration)) {
        totalTimeDisplay.innerText = formatTime(botPlayer.duration);
    }
});

audioProgress.addEventListener('input', (e) => {
    const duration = botPlayer.duration;
    if (duration && isFinite(duration)) {
        botPlayer.currentTime = (e.target.value / 100) * duration;
    }
});

function setBotAudio(base64) {
    botPlayer.src = `data:audio/mp3;base64,${base64}`;
    
    // Сбрасываем UI плеера
    audioProgress.value = 0;
    currentTimeDisplay.innerText = '0:00';
    totalTimeDisplay.innerText = '0:00';
    playPauseBtn.innerText = '▶️';

    // Пытаемся запустить
    botPlayer.play().catch(e => {
        console.log("Автоплей заблокирован, пользователь нажмет сам");
    });
}

// ==========================================
// 5. ЛОГИКА СЕССИИ И СЕТИ
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

    try {
        const data = await sendToN8N({
            action: 'start_session',
            session_id: currentSessionId,
            userData: tg.initDataUnsafe
        });

        showScreen('chat');
        toggleLoader(false);

        if (data.audio) {
            setBotAudio(data.audio);
            updateQuestionCounter();
        }
    } catch (e) {
        alert("Ошибка старта: " + e.message);
        toggleLoader(false);
    }
}

// ==========================================
// 6. ЛОГИКА ЗАПИСИ И ОТПРАВКИ ОТВЕТА
// ==========================================

recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    botPlayer.pause(); 

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
        visualizer.classList.add('active');
        statusText.innerText = "Запись идет...";
        tg.HapticFeedback.impactOccurred('light');

    } catch (e) {
        alert("Нет доступа к микрофону");
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        recordBtn.classList.remove('recording');
        visualizer.classList.remove('active');
        statusText.innerText = "Отправка...";
        toggleLoader(true, "ИИ анализирует...");
    }
}

async function sendVoiceAnswer() {
    if (!currentSessionId) {
        alert("Ошибка: Нет сессии!");
        return;
    }

    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    const formData = new FormData();
    formData.append('action', 'submit_answer');
    formData.append('session_id', currentSessionId);
    formData.append('question_number', questionNumber);
    formData.append('userData', JSON.stringify(tg.initDataUnsafe));
    formData.append('file', audioBlob, `voice.${fileExt}`);

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        handleServerResponse(data);

    } catch (e) {
        alert("Ошибка отправки: " + e.message);
    } finally {
        toggleLoader(false);
    }
}

function handleServerResponse(data) {
    if (data.status === 'finished') {
        showScreen('result');
        document.getElementById('finalScore').innerText = data.score;
        document.getElementById('finalFeedback').innerText = data.feedback;
        tg.HapticFeedback.notificationOccurred('success');
    } else {
        if (data.audio) {
            questionNumber++;
            updateQuestionCounter();
            setBotAudio(data.audio);
            statusText.innerText = "Нажми, чтобы ответить";
        }
    }
}
