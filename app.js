const tg = window.Telegram.WebApp;
tg.expand();

// CONFIG
const N8N_URL = 'https://lakiza.n-8n.com/webhook/test123weqwe';

// STATE
let currentSessionId = null; // ID ТЕКУЩЕЙ СЕССИИ (null если нет)
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// DOM Elements
const screens = {
    welcome: document.getElementById('screen-welcome'),
    levels: document.getElementById('screen-levels'),
    chat: document.getElementById('screen-chat'),
    result: document.getElementById('screen-result')
};
const loader = document.getElementById('loader');

// --- NAVIGATION ---
function showScreen(name) {
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    screens[name].classList.remove('hidden');
}

function toggleLoader(show) {
    if(show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

function goToLevels() {
    showScreen('levels');
}

function restartApp() {
    currentSessionId = null; // Сбрасываем сессию
    showScreen('welcome');
}

// --- LOGIC: START SESSION ---
async function startSession(level) {
    toggleLoader(true);
    
    // 1. Готовим данные
    const payload = {
        action: 'start_session',
        level: level,
        userData: tg.initDataUnsafe
    };

    try {
        // 2. Отправляем в n8n запрос на создание сессии
        const response = await fetch(N8N_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        // 3. Сохраняем ID сессии, который прислал n8n
        currentSessionId = data.session_id; 
        
        // 4. Переходим в чат и играем первое аудио
        showScreen('chat');
        document.getElementById('sessionLevelBadge').innerText = level;
        playAudio(data.audio);
        updateStatus("Ваш черед говорить!");

    } catch (e) {
        alert("Ошибка старта: " + e.message);
    } finally {
        toggleLoader(false);
    }
}

// --- LOGIC: RECORD & SEND ---
const recordBtn = document.getElementById('recordBtn');
recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = sendVoiceAnswer;
        
        mediaRecorder.start();
        isRecording = true;
        
        // UI
        recordBtn.classList.add('recording');
        document.getElementById('visualizer').classList.add('active');
        updateStatus("Запись идет...");
    } catch (e) {
        alert("Нет доступа к микрофону");
    }
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    
    // UI
    recordBtn.classList.remove('recording');
    document.getElementById('visualizer').classList.remove('active');
    updateStatus("Отправка...");
    toggleLoader(true);
}

async function sendVoiceAnswer() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    const formData = new FormData();
    formData.append('action', 'submit_answer');
    formData.append('session_id', currentSessionId); // ОБЯЗАТЕЛЬНО шлем ID сессии
    formData.append('file', audioBlob, 'answer.webm');
    formData.append('userData', JSON.stringify(tg.initDataUnsafe));

    try {
        const res = await fetch(N8N_URL, { method: 'POST', body: formData });
        const data = await res.json();

        if (data.status === 'finished') {
            finishSession(data);
        } else {
            // Следующий вопрос
            playAudio(data.audio);
            updateStatus("Слушайте вопрос...");
        }
    } catch (e) {
        alert("Ошибка отправки");
    } finally {
        toggleLoader(false);
    }
}

// --- HELPERS ---
function playAudio(base64Audio) {
    const player = document.getElementById('audioPlayer');
    player.src = `data:audio/mp3;base64,${base64Audio}`;
    player.play();
}

function updateStatus(text) {
    document.getElementById('msgStatus').innerText = text;
}

function finishSession(data) {
    showScreen('result');
    document.getElementById('finalScore').innerText = data.score;
    document.getElementById('finalFeedback').innerText = data.feedback;
}
