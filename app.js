// Инициализация Telegram Mini App
const tg = window.Telegram.WebApp;
tg.expand(); // Разворачиваем на весь экран

// --- НАСТРОЙКИ ---
// Сюда вставь URL Production Webhook из n8n (тип POST)
const N8N_WEBHOOK_URL = 'https://твоя-n8n-установка.com/webhook/voice-handler';

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const recordBtn = document.getElementById('recordBtn');
const btnText = document.getElementById('btnText');
const statusText = document.getElementById('status');
const visualizer = document.getElementById('visualizer');

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    // Запрашиваем доступ к микрофону
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Ваш браузер не поддерживает запись аудио.');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = sendAudio;

        mediaRecorder.start();

        // Обновляем UI
        isRecording = true;
        recordBtn.classList.add('recording');
        btnText.innerText = '⏹ Остановить и отправить';
        statusText.innerText = 'Запись идет...';
        visualizer.classList.add('active');

        // Вибрация для тактильного отклика (работает на Android)
        tg.HapticFeedback.impactOccurred('medium');

    } catch (err) {
        console.error('Ошибка доступа к микрофону:', err);
        alert('Нужен доступ к микрофону для сдачи экзамена!');
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        isRecording = false;

        // Сбрасываем UI
        recordBtn.classList.remove('recording');
        btnText.innerText = '⏳ Отправка...';
        statusText.innerText = 'ИИ анализирует ответ...';
        visualizer.classList.remove('active');
        recordBtn.disabled = true; // Блокируем кнопку пока идет отправка
    }
}

async function sendAudio() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // WebM - стандарт для веба

    // Формируем данные для отправки
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice_message.webm');

    // ВАЖНО: Передаем данные пользователя из Telegram (ID, имя и т.д.)
    // n8n сможет распарсить это и понять, кто сдал тест
    formData.append('userData', JSON.stringify(tg.initDataUnsafe));
    formData.append('queryId', tg.initData); // Нужно для валидации (если требуется безопасность)

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            statusText.innerText = 'Ответ принят! Жди результат.';
            btnText.innerText = '🎙 Записать новый ответ';
            tg.HapticFeedback.notificationOccurred('success');

            // Здесь можно закрыть окно автоматически, если нужно
            // tg.close();
        } else {
            throw new Error('Ошибка сервера');
        }
    } catch (error) {
        statusText.innerText = 'Ошибка отправки 😢';
        tg.HapticFeedback.notificationOccurred('error');
        console.error(error);
    } finally {
        recordBtn.disabled = false;
    }
}