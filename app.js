// ==========================================
// 1. КОНФИГУРАЦИЯ
// ==========================================
// Вставь сюда свой Production URL из n8n
const N8N_WEBHOOK_URL = 'https://lakiza.n-8n.com/webhook/test123weqwe';

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ И СОСТОЯНИЕ
// ==========================================
const tg = window.Telegram.WebApp;
tg.expand(); // Разворачиваем на весь экран

// Основные переменные состояния
let currentSessionId = null;  // ID текущей сессии
let questionNumber = 1;       // Номер текущего вопроса
let mediaRecorder = null;     // Объект записи звука
let audioChunks = [];         // Буфер для данных звука
let isRecording = false;      // Флаг: идет ли запись

// Элементы интерфейса (DOM)
const screens = {
    welcome: document.getElementById('screen-welcome'),
    chat: document.getElementById('screen-chat'),
    result: document.getElementById('screen-result')
};
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const statusText = document.getElementById('statusText');
const botPlayer = document.getElementById('botPlayer');
const questionCounterDisplay = document.getElementById('questionCounter');
const recordBtn = document.getElementById('recordBtn');
const visualizer = document.getElementById('visualizer');

// ==========================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

// Генерация уникального ID (UUID v4) на клиенте
function generateUUID() {
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Фолбэк для старых браузеров
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Переключение экранов
function showScreen(screenId) {
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    screens[screenId].classList.remove('hidden');
}

// Управление лоадером (крутилкой)
function toggleLoader(show, text = "Загрузка...") {
    if (show) {
        loaderText.innerText = text;
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

// Обновление счетчика вопросов в UI
function updateQuestionCounter() {
    questionCounterDisplay.innerText = `Вопрос #${questionNumber}`;
}

// Установка аудио в плеер и попытка воспроизведения
function setBotAudio(base64) {
    botPlayer.src = `data:audio/mp3;base64,${base64}`;
    // Пытаемся запустить (может не сработать без клика, но у нас есть controls)
    botPlayer.play().catch(e => {
        console.log("Автоплей ограничен браузером, ждем действия пользователя");
    });
}

// ==========================================
// 4. ЛОГИКА: СТАРТ СЕССИИ
// ==========================================

async function startSession() {
    toggleLoader(true, "Создаем тренировку...");
    
    // 1. Генерируем ID сессии прямо здесь
    currentSessionId = generateUUID();
    questionNumber = 1;
    
    console.log("Новая сессия:", currentSessionId);

    try {
        // 2. Отправляем ID в n8n, чтобы он просто записал его в базу
        // и вернул нам первый аудио-вопрос
        const payload = {
            action: 'start_session',
            session_id: currentSessionId, // <-- МЫ ДИКТУЕМ ID
            userData: tg.initDataUnsafe
        };

        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // 3. Переходим к чату
        showScreen('chat');
        toggleLoader(false);

        // 4. Играем приветственный вопрос
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
// 5. ЛОГИКА: ЗАПИСЬ ГОЛОСА
// ==========================================

recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    // Останавливаем бота, если он говорит
    botPlayer.pause();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Определение формата (важно для iOS)
        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            options = MediaRecorder.isTypeSupported('audio/mp4') 
                ? { mimeType: 'audio/mp4' } 
                : undefined;
        }

        mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => { 
            if (e.data.size > 0) audioChunks.push(e.data); 
        };

        // При остановке сразу отправляем
        mediaRecorder.onstop = sendVoiceAnswer;
        
        mediaRecorder.start();
        isRecording = true;
        
        // UI обновления
        recordBtn.classList.add('recording');
        visualizer.classList.add('active');
        statusText.innerText = "Запись идет...";
        tg.HapticFeedback.impactOccurred('medium');

    } catch (e) {
        alert("Нет доступа к микрофону. Проверьте настройки прав.");
        console.error(e);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // UI обновления
        recordBtn.classList.remove('recording');
        visualizer.classList.remove('active');
        statusText.innerText = "Отправка ответа...";
        toggleLoader(true, "ИИ слушает...");
    }
}

// ==========================================
// 6. ЛОГИКА: ОТПРАВКА ОТВЕТА
// ==========================================

async function sendVoiceAnswer() {
    if (!currentSessionId) {
        alert("Ошибка: Сессия потеряна. Перезагрузите приложение.");
        location.reload();
        return;
    }

    // Собираем аудио-файл из кусочков
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    // Формируем данные для отправки
    const formData = new FormData();
    formData.append('action', 'submit_answer');
    formData.append('session_id', currentSessionId); // <-- ID СЕССИИ
    formData.append('question_number', questionNumber); // <-- НОМЕР ВОПРОСА
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
        statusText.innerText = "Нажми, чтобы повторить";
    } finally {
        toggleLoader(false);
    }
}

// ==========================================
// 7. ЛОГИКА: ОБРАБОТКА ОТВЕТА СЕРВЕРА
// ==========================================

function handleServerResponse(data) {
    
    // ВАРИАНТ А: Тренировка закончена
    if (data.status === 'finished') {
        showScreen('result');
        document.getElementById('finalScore').innerText = data.score || "-";
        document.getElementById('finalFeedback').innerText = data.feedback || "Нет комментария";
        tg.HapticFeedback.notificationOccurred('success');
        return;
    }

    // ВАРИАНТ Б: Продолжаем (следующий вопрос)
    if (data.audio) {
        // Увеличиваем счетчик, так как переходим к следующему шагу
        questionNumber++;
        updateQuestionCounter();
        
        // Включаем аудио
        setBotAudio(data.audio);
        statusText.innerText = "Нажми, чтобы ответить";
        tg.HapticFeedback.impactOccurred('light');
    }
}

