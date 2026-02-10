// --- КОНФИГУРАЦИЯ ---
// Вставь сюда свой Production URL из n8n
const N8N_WEBHOOK_URL = 'https://lakiza.n-8n.com/webhook/test123weqwe';
// --- INIT ---
const tg = window.Telegram.WebApp;
tg.expand();

// --- STATE ---
let userData = {
    name: '',
    level: ''
};
let currentSessionId = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// --- DOM ELEMENTS ---
const screens = {
    name: document.getElementById('screen-name'),
    levels: document.getElementById('screen-levels'),
    prestart: document.getElementById('screen-prestart'),
    chat: document.getElementById('screen-chat'),
    result: document.getElementById('screen-result')
};
const loader = document.getElementById('loader');
const statusText = document.getElementById('statusText');
const audioPlayer = document.getElementById('audioPlayer');

// --- NAVIGATION HELPERS ---
function showScreen(screenId) {
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

function toggleLoader(show, text = "Загрузка...") {
    if (show) {
        document.getElementById('loaderText').innerText = text;
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

// --- STEP 1: NAME ---
function submitName() {
    const input = document.getElementById('nameInput');
    const name = input.value.trim();
    
    if (name.length < 2) {
        tg.HapticFeedback.notificationOccurred('error');
        input.style.borderColor = 'red';
        return;
    }
    
    userData.name = name;
    showScreen('levels'); // Переход к шагу 2
}

// --- STEP 2: LEVEL ---
function selectLevel(level) {
    userData.level = level;
    document.getElementById('displayUserLevel').innerText = level;
    showScreen('prestart'); // Переход к шагу 3
}

// --- STEP 3: START TRAINING ---
async function startTrainingSession() {
    toggleLoader(true, "Создаем сессию...");
    
    try {
        // Отправляем запрос в n8n на создание сессии
        // Передаем имя, уровень и данные телеграма
        const payload = {
            action: 'start_session',
            name: userData.name,
            level: userData.level,
            tg_data: tg.initDataUnsafe
        };

        const data = await sendToN8N(payload);
        
        currentSessionId = data.session_id; // Сохраняем ID сессии
        
        // Переходим в чат
        showScreen('chat'); // Переход к шагу 4
        toggleLoader(false);

        // И сразу проигрываем первое аудио от робота
        if (data.audio) {
            playAudio(data.audio);
            statusText.innerText = "Слушай вопрос...";
        }

    } catch (e) {
        alert("Ошибка: " + e.message);
        toggleLoader(false);
    }
}

// --- STEP 4: RECORDING LOOP ---
const recordBtn = document.getElementById('recordBtn');
recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Подбор формата (фикс для iOS)
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
        
        // UI
        recordBtn.classList.add('recording');
        document.getElementById('visualizer').classList.add('active');
        statusText.innerText = "Запись идет...";
        tg.HapticFeedback.impactOccurred('light');

    } catch (e) {
        alert("Нужен доступ к микрофону");
    }
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    
    recordBtn.classList.remove('recording');
    document.getElementById('visualizer').classList.remove('active');
    statusText.innerText = "Отправка...";
    toggleLoader(true, "Анализ ответа...");
}

async function sendVoiceAnswer() {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    const formData = new FormData();
    formData.append('action', 'submit_answer');
    formData.append('session_id', currentSessionId);
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

// --- LOGIC: HANDLE RESPONSE ---
function handleServerResponse(data) {
    if (data.status === 'finished') {
        // Конец - показываем скоринг
        showResultScreen(data);
    } else {
        // Продолжение - играем следующее аудио
        if (data.audio) {
            playAudio(data.audio);
            statusText.innerText = "Слушай следующий вопрос...";
        }
    }
}

function showResultScreen(data) {
    showScreen('result');
    document.getElementById('finalScore').innerText = data.score;
    document.getElementById('finalFeedback').innerText = data.feedback;
    tg.HapticFeedback.notificationOccurred('success');
}

// --- STEP 5: RESTART ---
function restartApp() {
    // Сбрасываем сессию, но можем оставить имя, чтобы не вводить заново
    // Если нужно совсем с нуля - вызываем showScreen('name')
    // Если только уровень сменить - showScreen('levels')
    
    currentSessionId = null;
    document.getElementById('nameInput').value = ''; // Очистим имя для чистого рестарта
    userData = { name: '', level: '' };
    
    showScreen('name');
}

// --- UTILS ---
async function sendToN8N(jsonPayload) {
    const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonPayload)
    });
    return await res.json();
}

function playAudio(base64) {
    audioPlayer.src = `data:audio/mp3;base64,${base64}`;
    audioPlayer.play().catch(e => console.log("Autoplay blocked:", e));
}
