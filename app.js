// --- КОНФИГУРАЦИЯ ---
// Вставь сюда свой Production URL из n8n
const N8N_WEBHOOK_URL = 'https://lakiza.n-8n.com/webhook/test123weqwe';

// Инициализация Telegram
const tg = window.Telegram.WebApp;
tg.expand(); // Развернуть на весь экран

// Переменные состояния
let currentSessionId = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Элементы DOM
const screens = {
    welcome: document.getElementById('screen-welcome'),
    levels: document.getElementById('screen-levels'),
    chat: document.getElementById('screen-chat'),
    result: document.getElementById('screen-result')
};
const loader = document.getElementById('loader');
const statusText = document.getElementById('statusText');
const audioPlayer = document.getElementById('audioPlayer');

// --- НАВИГАЦИЯ ---

function showScreen(screenId) {
    // Скрываем все экраны
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    // Показываем нужный
    screens[screenId].classList.remove('hidden');
}

function toggleLoader(show) {
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

function restartApp() {
    currentSessionId = null;
    showScreen('welcome');
}

// --- ЛОГИКА: 1. ПРИВЕТСТВИЕ ---

async function startWelcomeFlow() {
    toggleLoader(true);
    
    try {
        // Отправляем запрос на получение приветствия
        const data = await sendToN8N({
            action: 'get_welcome',
            userData: tg.initDataUnsafe
        });

        // Скрываем лоадер и переходим к выбору уровней
        toggleLoader(false);
        showScreen('levels');

        // Если n8n прислал аудио приветствия — играем
        if (data.audio) {
            playAudio(data.audio);
        }

    } catch (error) {
        alert('Ошибка связи: ' + error.message);
        toggleLoader(false);
    }
}

// --- ЛОГИКА: 2. СТАРТ СЕССИИ ---

async function startSession(level) {
    toggleLoader(true);
    
    try {
        const data = await sendToN8N({
            action: 'start_session',
            level: level,
            userData: tg.initDataUnsafe
        });

        currentSessionId = data.session_id; // Сохраняем ID сессии
        
        toggleLoader(false);
        showScreen('chat');
        document.getElementById('currentLevelDisplay').innerText = level;

        // Играем первый вопрос
        if (data.audio) {
            playAudio(data.audio);
            statusText.innerText = "Слушайте вопрос...";
        }

    } catch (error) {
        alert('Ошибка старта: ' + error.message);
        toggleLoader(false);
    }
}

// --- ЛОГИКА: 3. ЗАПИСЬ И ОТПРАВКА ОТВЕТА ---

const recordBtn = document.getElementById('recordBtn');
const visualizer = document.getElementById('visualizer');

recordBtn.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Браузер не поддерживает запись звука");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Выбор формата для iOS/Android
        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            options = MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : undefined;
        }

        mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = sendVoiceData;

        mediaRecorder.start();
        isRecording = true;

        // UI Updates
        recordBtn.classList.add('recording');
        visualizer.classList.add('active');
        statusText.innerText = "Запись идет...";
        tg.HapticFeedback.impactOccurred('light'); // Вибрация

    } catch (err) {
        console.error(err);
        alert("Нужен доступ к микрофону!");
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        // UI Updates
        recordBtn.classList.remove('recording');
        visualizer.classList.remove('active');
        statusText.innerText = "Отправка ответа...";
        toggleLoader(true);
    }
}

async function sendVoiceData() {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    const formData = new FormData();
    formData.append('action', 'submit_answer');
    formData.append('session_id', currentSessionId);
    formData.append('userData', JSON.stringify(tg.initDataUnsafe));
    formData.append('file', audioBlob, `voice.${fileExt}`);

    try {
        // Отправляем файл
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        handleServerResponse(data);

    } catch (error) {
        alert("Ошибка отправки аудио: " + error.message);
    } finally {
        toggleLoader(false);
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Универсальная отправка JSON (для текстовых команд)
async function sendToN8N(payload) {
    const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return await response.json();
}

// Обработка ответа от сервера
function handleServerResponse(data) {
    if (data.status === 'finished') {
        // Конец теста
        showScreen('result');
        document.getElementById('finalScore').innerText = data.score;
        document.getElementById('finalFeedback').innerText = data.feedback;
    } else {
        // Следующий вопрос
        if (data.audio) {
            playAudio(data.audio);
            statusText.innerText = "Слушайте следующий вопрос...";
        }
    }
}

// Воспроизведение Base64 аудио
function playAudio(base64String) {
    audioPlayer.src = `data:audio/mp3;base64,${base64String}`;
    audioPlayer.play().catch(e => console.log("Autoplay prevented:", e));
}
