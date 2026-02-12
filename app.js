// --- CONFIG ---
const N8N_WEBHOOK_URL = 'https://YOUR-DOMAIN.com/webhook/voice-tutor';

// --- INIT ---
const tg = window.Telegram.WebApp;
tg.expand();

// --- STATE ---
let currentSessionId = null;
let questionNumber = 1; // Счетчик ответов
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// --- DOM ELEMENTS ---
const screens = {
    welcome: document.getElementById('screen-welcome'),
    chat: document.getElementById('screen-chat'),
    result: document.getElementById('screen-result')
};
const loader = document.getElementById('loader');
const statusText = document.getElementById('statusText');
const botPlayer = document.getElementById('botPlayer');
const questionCounterDisplay = document.getElementById('questionCounter');

// --- NAVIGATION ---
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

// --- 1. START SESSION (Первый запуск) ---
async function startSession() {
    toggleLoader(true, "Создаем сессию...");
    
    try {
        // Отправляем запрос на старт. Никаких имен/уровней, только ID пользователя ТГ
        const payload = {
            action: 'start_session',
            userData: tg.initDataUnsafe
        };

        const data = await sendToN8N(payload);
        
        // n8n должен вернуть { session_id: "...", audio: "base64..." }
        currentSessionId = data.session_id; 
        questionNumber = 1; // Сбрасываем счетчик

        // Переходим в чат
        showScreen('chat');
        toggleLoader(false);

        // Ставим аудио первого вопроса
        if (data.audio) {
            setBotAudio(data.audio);
            updateQuestionCounter();
        }

    } catch (e) {
        alert("Ошибка старта: " + e.message);
        toggleLoader(false);
    }
}

// --- 2. RECORDING LOGIC ---
const recordBtn = document.getElementById('recordBtn');
recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    // Ставим на паузу плеер бота, если он играет
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
        
        // UI
        recordBtn.classList.add('recording');
        document.getElementById('visualizer').classList.add('active');
        statusText.innerText = "Запись идет...";
        tg.HapticFeedback.impactOccurred('light');

    } catch (e) {
        alert("Нет доступа к микрофону");
    }
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    
    recordBtn.classList.remove('recording');
    document.getElementById('visualizer').classList.remove('active');
    statusText.innerText = "Отправка...";
    toggleLoader(true, "ИИ слушает...");
}

// --- 3. SEND ANSWER ---
async function sendVoiceAnswer() {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    const formData = new FormData();
    formData.append('action', 'submit_answer');
    formData.append('session_id', currentSessionId);
    
    // ВАЖНО: Отправляем номер текущего вопроса (ответа)
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

// --- 4. HANDLE RESPONSE ---
function handleServerResponse(data) {
    if (data.status === 'finished') {
        // Конец - показываем скоринг
        showScreen('result');
        document.getElementById('finalScore').innerText = data.score;
        document.getElementById('finalFeedback').innerText = data.feedback;
        tg.HapticFeedback.notificationOccurred('success');
    } else {
        // Продолжение - пришел следующий вопрос
        if (data.audio) {
            // Увеличиваем счетчик, так как переходим к следующему вопросу
            questionNumber++;
            updateQuestionCounter();
            
            // Обновляем плеер и включаем его
            setBotAudio(data.audio);
            statusText.innerText = "Нажми, чтобы ответить";
        }
    }
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

// Функция для установки аудио в плеер
function setBotAudio(base64) {
    // Формируем source
    botPlayer.src = `data:audio/mp3;base64,${base64}`;
    
    // Пытаемся запустить автоплей (может не сработать на некоторых iOS без жеста, 
    // но у нас есть controls, пользователь сможет нажать сам)
    botPlayer.play().catch(e => {
        console.log("Автоплей заблокирован браузером, пользователь нажмет Play сам");
    });
}

function updateQuestionCounter() {
    questionCounterDisplay.innerText = `Вопрос #${questionNumber}`;
}
