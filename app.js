
// ==========================================
// 1. КОНФИГУРАЦИЯ
// ==========================================
const N8N_WEBHOOK_URL = 'https://lakiza.n-8n.com/webhook/test123weqwe'; // <-- ВАШ URL

const tg = window.Telegram.WebApp;
tg.expand();

let currentSessionId = null;
let questionNumber = 1;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Элементы
const screens = { welcome: document.getElementById('screen-welcome'), chat: document.getElementById('screen-chat'), result: document.getElementById('screen-result') };
const chatHistory = document.getElementById('chatHistory');
const masterPlayer = document.getElementById('masterPlayer');
const recordBtn = document.getElementById('recordBtn');
const iconMic = recordBtn.querySelector('.icon-mic');
const iconStop = recordBtn.querySelector('.icon-stop');
const visualizer = document.getElementById('visualizer');
const statusText = document.getElementById('statusText');

// Состояние аудиоплеера
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
// 3. ЛОГИКА ИСТОРИИ ЧАТА (BUBBLES)
// ==========================================

// Добавление нового сообщения в чат
function addMessageBubble(role, audioSrc) {
    const msgId = 'msg_' + Date.now();
    const isUser = role === 'user';
    
    // Генерируем 35 случайных столбиков для реалистичной волны
    let barsHTML = '';
    for (let i = 0; i < 35; i++) {
        // Делаем края чуть ниже, а центр выше
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
    
    // Скролл вниз к новому сообщению
    setTimeout(() => {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }, 50);

    // Если это ИИ, запускаем автовоспроизведение
    if (!isUser) {
        togglePlay(msgId, audioSrc);
    }
}

// ==========================================
// 4. УПРАВЛЕНИЕ МАСТЕР-ПЛЕЕРОМ
// ==========================================

function togglePlay(msgId, audioSrc) {
    // Если кликнули на ТОТ ЖЕ самый трек
    if (currentPlayingId === msgId) {
        if (masterPlayer.paused) masterPlayer.play();
        else masterPlayer.pause();
        return;
    }

    // Если играл ДРУГОЙ трек, сбрасываем его интерфейс
    if (currentPlayingId) {
        resetBubbleUI(currentPlayingId);
    }

    // Запускаем НОВЫЙ трек
    currentPlayingId = msgId;
    
    // Если это base64 от n8n, добавляем префикс
    if (!audioSrc.startsWith('blob:') && !audioSrc.startsWith('data:')) {
        masterPlayer.src = `data:audio/mp3;base64,${audioSrc}`;
    } else {
        masterPlayer.src = audioSrc; // Для локальных Blob URL (сообщение юзера)
    }

    masterPlayer.play().catch(e => console.log("Play error:", e));
}

// Сброс иконок и прогресса у конкретного пузыря
function resetBubbleUI(msgId) {
    const bubble = document.getElementById(msgId);
    if (!bubble) return;
    bubble.querySelector('.icon-play').classList.remove('hidden');
    bubble.querySelector('.icon-pause').classList.add('hidden');
    document.getElementById(`progress_${msgId}`).style.width = '0%';
}

// Слушатели мастера плеера для обновления активного UI
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
        document.getElementById(`progress_${currentPlayingId}`).style.width = `${percent}%`;
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
// 5. ЛОГИКА СЕССИИ (START & SEND)
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
    chatHistory.innerHTML = ''; // Очищаем историю

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
            // Добавляем первое сообщение ИИ в чат
            addMessageBubble('ai', data.audio);
        }
    } catch (e) {
        alert("Ошибка старта: " + e.message);
        toggleLoader(false);
    }
}

// Запись звука Пользователя
recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    masterPlayer.pause(); // Глушим ИИ

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
        
        // Меняем вид кнопки (красная -> пульсирует, показываем стоп)
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
        
        // Возвращаем кнопку в исходный вид
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

    // Сразу добавляем сообщение пользователя в интерфейс чата!
    const localAudioUrl = URL.createObjectURL(audioBlob);
    addMessageBubble('user', localAudioUrl);

    // Отправляем на сервер
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
            // Добавляем ответ ИИ в чат
            addMessageBubble('ai', data.audio);
            statusText.innerText = "Нажми, чтобы ответить";
        }
    } catch (e) {
        alert("Ошибка отправки: " + e.message);
    } finally {
        toggleLoader(false);
    }
}
