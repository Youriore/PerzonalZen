// State
let tasks = [];
let kanbanTasks = [];
let habits = [];
let currentFilter = 'all';
let selectedPriority = 'media';
let editingId = null;
let editingKanbanId = null;
let editingHabitId = null;
let modalMode = 'task';
let calendarView = 'month';
let currentDate = new Date();
let selectedCalendarDate = null;
let alarmAudio = null;
let alarmInterval = null;
let isAlarmPlaying = false;
let customAudioData = null;
let audioVolume = 0.8;
let pendingDelete = null; // Store item to delete

const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fullDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Registrar Service Worker para notificaciones en segundo plano
if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    navigator.serviceWorker.register('/sw.js')
        .then(registration => {
            console.log('Service Worker registrado:', registration.scope);

            // Escuchar mensajes del Service Worker
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data.action === 'stop-alarm') {
                    stopAlarm();
                } else if (event.data.action === 'snooze') {
                    // Implementar posponer
                    stopAlarm();
                    showNotification(`Alarma pospuesta ${event.data.minutes} minutos`);
                } else if (event.data.action === 'check-alarms') {
                    checkPendingAlarms();
                }
            });
        })
        .catch(error => {
            console.log('Error registrando Service Worker:', error);
        });
}

// Variable para Wake Lock (mantener pantalla encendida)
let wakeLock = null;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderAll();
    startTimerLoop();

    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark');
        document.getElementById('themeText').textContent = 'Claro';
    }

    requestNotificationPermission();
    loadCustomAudio();

    // Verificar alarmas pendientes cuando la app vuelve al primer plano
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkPendingAlarms();
        }
    });

    // También verificar cuando la ventana vuelva a tener foco
    window.addEventListener('focus', checkPendingAlarms);

    // Verificar alarmas cada vez que se carga la página
    checkPendingAlarms();
});

function loadData() {
    try {
        const t = localStorage.getItem('tasks');
        const k = localStorage.getItem('kanbanTasks');
        const h = localStorage.getItem('habits');
        const v = localStorage.getItem('audioVolume');

        if (t) tasks = JSON.parse(t);
        if (k) kanbanTasks = JSON.parse(k);
        if (h) habits = JSON.parse(h);
        if (v) audioVolume = parseFloat(v);
    } catch (e) {
        tasks = [];
        kanbanTasks = [];
        habits = [];
    }
}

function saveData() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
    localStorage.setItem('kanbanTasks', JSON.stringify(kanbanTasks));
    localStorage.setItem('habits', JSON.stringify(habits));
}

function loadCustomAudio() {
    const savedAudio = localStorage.getItem('customAlarmAudio');
    if (savedAudio) customAudioData = savedAudio;
}

function handleAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Límite de 500KB
    if (file.size > 500 * 1024) {
        alert('El archivo es demasiado grande (máx. 500KB). Por favor usa un archivo más corto o comprimido.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            customAudioData = e.target.result;
            localStorage.setItem('customAlarmAudio', customAudioData);
            const statusEl = document.getElementById('audioStatus');
            if (statusEl) statusEl.textContent = `✓ Audio personalizado: ${file.name}`;
            showNotification('Audio personalizado guardado');
        } catch (error) {
            console.error('Error guardando audio:', error);
            if (error.name === 'QuotaExceededError') {
                alert('No hay espacio suficiente para guardar este audio. Intenta con un archivo mp3 más corto y de menor calidad.');
            } else {
                showNotification('Error al guardar el audio');
            }
        }
    };
    reader.readAsDataURL(file);
}

function updateVolume(value) {
    audioVolume = value / 100;
    localStorage.setItem('audioVolume', audioVolume);
    const volEl = document.getElementById('volumeValue');
    if (volEl) volEl.textContent = `${Math.round(audioVolume * 100)}%`;
}

function playAlarmSound() {
    if (isAlarmPlaying) return;
    isAlarmPlaying = true;

    if (customAudioData) {
        playCustomAlarm();
    } else {
        playDefaultAlarm();
    }
}

function playCustomAlarm() {
    alarmAudio = new Audio(customAudioData);
    alarmAudio.volume = audioVolume;
    alarmAudio.loop = true;
    alarmAudio.play().catch(e => {
        console.log('Audio playback failed:', e);
        playDefaultAlarm();
    });
}

function playDefaultAlarm() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const playAlarmPattern = () => {
        if (!isAlarmPlaying) return;

        const now = audioContext.currentTime;

        for (let i = 0; i < 3; i++) {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(880, now + i * 0.4);

            gain.gain.setValueAtTime(0, now + i * 0.4);
            gain.gain.linearRampToValueAtTime(audioVolume * 0.3, now + i * 0.4 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.3);

            osc.connect(gain);
            gain.connect(audioContext.destination);

            osc.start(now + i * 0.4);
            osc.stop(now + i * 0.4 + 0.3);
        }

        if (isAlarmPlaying) {
            alarmInterval = setTimeout(playAlarmPattern, 1500);
        }
    };

    playAlarmPattern();
}

function stopAlarmSound() {
    isAlarmPlaying = false;

    if (alarmAudio) {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
        alarmAudio = null;
    }

    if (alarmInterval) {
        clearTimeout(alarmInterval);
        alarmInterval = null;
    }

    // Liberar Wake Lock
    releaseWakeLock();
}

// Funciones para Wake Lock (mantener pantalla encendida durante timers)
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock activado');

            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock liberado');
            });
        } catch (err) {
            console.log('Error al activar Wake Lock:', err);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// Verificar alarmas pendientes (útil cuando la app vuelve al primer plano)
function checkPendingAlarms() {
    const now = Date.now();
    let hasTriggeredAlarm = false;

    kanbanTasks.forEach(task => {
        if (task.status === 'progress' && task.endTime && !task.alarmTriggered) {
            if (now >= task.endTime) {
                task.alarmTriggered = true;
                task.elapsed = task.time * 60;
                triggerAlarm(task);
                hasTriggeredAlarm = true;
            } else {
                // Actualizar el tiempo transcurrido basado en el timestamp
                const elapsedSeconds = Math.floor((now - task.startTime) / 1000);
                task.elapsed = elapsedSeconds;
            }
        }
    });

    if (hasTriggeredAlarm) {
        saveData();
        renderKanban();
    }
}

function startTimerLoop() {
    setInterval(() => {
        updateTimers();
    }, 1000);
}

function updateTimers() {
    const now = Date.now();

    kanbanTasks.forEach(task => {
        if (task.status === 'progress' && task.startTime && !task.alarmTriggered) {
            // Calcular tiempo transcurrido basado en timestamps
            const elapsedSeconds = Math.floor((now - task.startTime) / 1000);
            task.elapsed = elapsedSeconds;

            const totalSeconds = task.time * 60;
            const remaining = totalSeconds - elapsedSeconds;

            if (remaining <= 0) {
                task.alarmTriggered = true;
                task.elapsed = totalSeconds;
                triggerAlarm(task);
            }

            const timerEl = document.getElementById(`timer-${task.id}`);
            if (timerEl) {
                timerEl.textContent = formatTime(task.elapsed);

                const timerDisplay = timerEl.closest('.timer-display');
                if (timerDisplay) {
                    const percent = (task.elapsed / totalSeconds) * 100;
                    timerDisplay.classList.remove('warning', 'danger');
                    if (percent >= 100) timerDisplay.classList.add('danger');
                    else if (percent >= 80) timerDisplay.classList.add('warning');
                }
            }
        }
    });

    saveData();
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function triggerAlarm(task) {
    document.getElementById('alarmMessage').textContent = `¡La tarea "${task.title}" ha completado su tiempo!`;
    document.getElementById('alarmOverlay').classList.add('active');

    playAlarmSound();
    sendNotification('¡Tiempo Completado!', `La tarea "${task.title}" ha terminado`);

    // Vibración más intensa y persistente para móviles
    if (navigator.vibrate) {
        // Patrón de vibración que se repite varias veces
        const vibratePattern = [500, 200, 500, 200, 1000, 200, 500, 200, 500];
        navigator.vibrate(vibratePattern);

        // Continuar vibrando mientras la alarma está activa
        const vibrateInterval = setInterval(() => {
            if (!isAlarmPlaying) {
                clearInterval(vibrateInterval);
            } else {
                navigator.vibrate(vibratePattern);
            }
        }, 3000);
    }

    // Intentar enviar notificación push a través del Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            action: 'schedule-alarm',
            title: '¡Tiempo Completado!',
            body: `La tarea "${task.title}" ha terminado`,
            timestamp: Date.now()
        });
    }
}

function stopAlarm() {
    document.getElementById('alarmOverlay').classList.remove('active');
    stopAlarmSound();
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendNotification(title, body) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        const options = {
            body: body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">◉</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">◉</text></svg>',
            tag: 'zen-tasks-alarm',
            requireInteraction: true,
            vibrate: [500, 200, 500, 200, 1000],
            sound: customAudioData || null, // Algunos navegadores soportan esto
            renotify: true,
            silent: false
        };

        // Usar Service Worker para notificaciones si está disponible
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, options);
            });
        } else {
            // Fallback a notificación normal
            new Notification(title, options);
        }
    }
}

function renderAll() {
    updateStats();
    renderKanban();
    renderCalendar();
    renderHabits();
    renderTasks();
}

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const highPriority = tasks.filter(t => !t.completed && t.priority === 'alta').length;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('completedCount').textContent = completed;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('highPriorityCount').textContent = highPriority;
    document.getElementById('habitsCount').textContent = habits.length;
}

function renderKanban() {
    const pending = kanbanTasks.filter(t => t.status === 'pending');
    const progress = kanbanTasks.filter(t => t.status === 'progress');
    const done = kanbanTasks.filter(t => t.status === 'done');

    document.getElementById('kanbanPending').innerHTML = pending.map(t => createKanbanItem(t)).join('');
    document.getElementById('kanbanProgress').innerHTML = progress.map(t => createKanbanItem(t)).join('');
    document.getElementById('kanbanDone').innerHTML = done.map(t => createKanbanItem(t)).join('');
}

function createKanbanItem(task) {
    let timerHtml = '';

    if (task.status === 'progress') {
        const totalSeconds = task.time * 60;
        const elapsed = task.elapsed || 0;
        const percent = (elapsed / totalSeconds) * 100;

        let timerClass = '';
        if (percent >= 100) timerClass = 'danger';
        else if (percent >= 80) timerClass = 'warning';

        timerHtml = `
                    <div class="timer-display ${timerClass}">
                        <span>◐</span>
                        <span id="timer-${task.id}">${formatTime(elapsed)}</span>
                        <span>/ ${formatTime(totalSeconds)}</span>
                    </div>
                `;
    } else if (task.status === 'done') {
        timerHtml = `<span style="color: var(--success);">✔ Completada</span>`;
    } else {
        timerHtml = `<span>◐ ${task.time}min</span>`;
    }

    return `
                <div class="kanban-task" draggable="true" ondragstart="dragStart(event, ${task.id})" ondragend="dragEnd(event)" onclick="editKanban(${task.id})">
                    <div class="kanban-task-title">${escapeHtml(task.title)}</div>
                    <div class="kanban-task-meta">
                        ${timerHtml}
                        <div class="kanban-actions" onclick="event.stopPropagation()">
                            <button class="btn-icon" onclick="moveKanban(${task.id}, event)" title="Mover">▶</button>
                            <button class="btn-icon delete" onclick="deleteKanban(${task.id}, event)" title="Eliminar">×</button>
                        </div>
                    </div>
                </div>
            `;
}

function setCalendarView(view) {
    calendarView = view;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');
    renderCalendar();
}

function navigateCalendar(direction) {
    const current = new Date(currentDate);

    if (calendarView === 'month') current.setMonth(current.getMonth() + direction);
    else if (calendarView === 'week') current.setDate(current.getDate() + (direction * 7));
    else if (calendarView === 'day') current.setDate(current.getDate() + direction);

    currentDate = current;
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const periodLabel = document.getElementById('currentPeriod');

    if (calendarView === 'month') renderMonthCalendar(grid, periodLabel);
    else if (calendarView === 'week') renderWeekCalendar(grid, periodLabel);
    else if (calendarView === 'day') renderDayCalendar(grid, periodLabel);
}

function renderMonthCalendar(grid, periodLabel) {
    grid.className = 'calendar-grid';

    const today = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    periodLabel.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    let html = '';

    dayNames.forEach(day => html += `<div class="calendar-day-header">${day}</div>`);

    for (let i = 0; i < 42; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const isToday = d.toDateString() === today.toDateString();
        const isOther = d.getMonth() !== month;

        html += createCalendarDay(d, dStr, isToday, isOther, 'month');
    }

    grid.innerHTML = html;
}

function renderWeekCalendar(grid, periodLabel) {
    grid.className = 'calendar-grid week-view';

    const today = new Date();
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    periodLabel.textContent = `${formatDateShort(weekStart)} - ${formatDateShort(weekEnd)}`;

    let html = '';

    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const isToday = d.toDateString() === today.toDateString();
        html += `<div class="calendar-day-header ${isToday ? 'today' : ''}">${dayNames[i]} ${d.getDate()}</div>`;
    }

    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        const isToday = d.toDateString() === today.toDateString();
        html += createCalendarDay(d, dStr, isToday, false, 'week');
    }

    grid.innerHTML = html;
}

function renderDayCalendar(grid, periodLabel) {
    grid.className = 'calendar-grid day-view';

    const today = new Date();
    const isToday = currentDate.toDateString() === today.toDateString();
    const dStr = currentDate.toISOString().split('T')[0];

    periodLabel.textContent = `${fullDayNames[currentDate.getDay()]}, ${currentDate.getDate()} de ${getMonthName(currentDate.getMonth())}`;

    grid.innerHTML = createCalendarDay(currentDate, dStr, isToday, false, 'day');
}

function createCalendarDay(date, dateStr, isToday, isOther, view) {
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const dayHabits = getHabitsForDate(date);

    const hasPending = dayTasks.some(t => !t.completed);
    const hasCompleted = dayTasks.some(t => t.completed);
    const hasHabits = dayHabits.length > 0;

    let eventsHtml = '';

    if (view === 'week' || view === 'day') {
        dayHabits.forEach(habit => {
            const isCompleted = isHabitCompletedOnDate(habit, date);
            eventsHtml += `
                        <div class="day-event habit ${isCompleted ? 'completed' : ''}" 
                             onclick="toggleHabitForDate(${habit.id}, '${dateStr}', event)">
                            ${isCompleted ? '✓ ' : ''}${escapeHtml(habit.title)}
                        </div>
                    `;
        });

        dayTasks.forEach(task => {
            eventsHtml += `
                        <div class="day-event task ${task.completed ? 'completed' : ''}">
                            ${task.completed ? '✓ ' : ''}${escapeHtml(task.title)}
                        </div>
                    `;
        });
    } else {
        if (hasHabits) eventsHtml += '<div class="habit-indicator"></div>';
    }

    const weekClass = view === 'week' || view === 'day' ? 'week-day' : '';

    return `
                <div class="calendar-day ${weekClass} ${isToday ? 'today' : ''} ${isOther ? 'other' : ''} ${(dayTasks.length || dayHabits.length) ? 'has-tasks' : ''}"
                     onclick="openCalendarModal('${dateStr}')">
                    <span class="day-number">${date.getDate()}</span>
                    <div class="day-events">${eventsHtml}</div>
                    <button class="add-event-btn" onclick="openCalendarModal('${dateStr}'); event.stopPropagation();">+</button>
                </div>
            `;
}

function getHabitsForDate(date) {
    const dayOfWeek = date.getDay();
    return habits.filter(h => h.days && h.days[dayOfWeek]);
}

function isHabitCompletedOnDate(habit, date) {
    const dateStr = date.toISOString().split('T')[0];
    return habit.completedDates && habit.completedDates.includes(dateStr);
}

function toggleHabitForDate(habitId, dateStr, event) {
    if (event) event.stopPropagation();

    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    if (!habit.completedDates) habit.completedDates = [];

    const index = habit.completedDates.indexOf(dateStr);
    if (index > -1) {
        habit.completedDates.splice(index, 1);
        showNotification('Hábito desmarcado');
    } else {
        habit.completedDates.push(dateStr);
        showNotification('¡Hábito completado!');
    }

    saveData();
    renderCalendar();
    renderHabits();
}

function getMonthName(month) {
    const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return names[month];
}

function formatDateShort(date) {
    return `${date.getDate()}/${date.getMonth() + 1}`;
}

function renderHabits() {
    const container = document.getElementById('habitsList');

    if (habits.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">◉</div>
                        <p>No hay hábitos. ¡Crea tu primer hábito!</p>
                    </div>
                `;
        return;
    }

    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());

    container.innerHTML = habits.map(habit => {
        const weekDays = [];
        let completedCount = 0;

        for (let i = 0; i < 7; i++) {
            const d = new Date(currentWeekStart);
            d.setDate(currentWeekStart.getDate() + i);
            const dStr = d.toISOString().split('T')[0];
            const isCompleted = habit.completedDates && habit.completedDates.includes(dStr);
            const isToday = d.toDateString() === today.toDateString();

            if (isCompleted) completedCount++;

            if (habit.days && habit.days[i]) {
                weekDays.push({
                    day: i,
                    label: dayNames[i].charAt(0),
                    completed: isCompleted,
                    isToday: isToday,
                    dateStr: dStr
                });
            }
        }

        const streak = calculateStreak(habit);

        return `
                    <div class="habit-card">
                        <div class="habit-info">
                            <div class="habit-title">${escapeHtml(habit.title)}</div>
                            <div class="habit-meta">${habit.description || 'Sin descripción'}</div>
                        </div>
                        <div class="habit-days">
                            ${weekDays.map(d => `
                                <div class="habit-day ${d.completed ? 'completed' : ''} ${d.isToday ? 'today' : ''}"
                                     onclick="toggleHabitForDate(${habit.id}, '${d.dateStr}')"
                                     title="${fullDayNames[d.day]}">
                                    ${d.label}
                                </div>
                            `).join('')}
                        </div>
                        <div class="habit-streak">
                            <div class="streak-number">${streak}</div>
                            <div class="streak-label">días</div>
                        </div>
                        <div class="habit-actions" style="display: flex; gap: 8px;">
                            <button class="btn-icon" onclick="editHabit(${habit.id})" title="Editar">○</button>
                            <button class="btn-icon delete" onclick="deleteHabit(${habit.id}, event)" title="Eliminar">×</button>
                        </div>
                    </div>
                `;
    }).join('');
}

function calculateStreak(habit) {
    if (!habit.completedDates || habit.completedDates.length === 0) return 0;

    const sorted = habit.completedDates.sort();
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];

    const lastCompleted = sorted[sorted.length - 1];
    const lastDate = new Date(lastCompleted);
    const todayDate = new Date();
    const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) return 0;

    for (let i = sorted.length - 1; i >= 0; i--) {
        const current = new Date(sorted[i]);
        const expected = new Date(todayDate);
        expected.setDate(expected.getDate() - streak);

        if (current.toDateString() === expected.toDateString()) streak++;
        else break;
    }

    return streak;
}

function deleteHabit(id) {
    if (event) event.stopPropagation();
    pendingDelete = { type: 'habit', id: id };
    openModal('delete');
}

function deleteKanban(id, event) {
    if (event) event.stopPropagation();
    pendingDelete = { type: 'kanban', id: id };
    openModal('delete');
}

function deleteTask(id, event) {
    if (event) event.stopPropagation();
    pendingDelete = { type: 'task', id: id };
    openModal('delete');
}

function openModal(mode, date = null) {
    modalMode = mode;
    editingId = null;
    editingKanbanId = null;
    editingHabitId = null;
    selectedCalendarDate = date;

    const modal = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    modalContent.className = 'modal';

    if (mode === 'task') {
        title.textContent = 'Nueva Tarea';
        body.innerHTML = createTaskForm();
        setupTaskForm();
    } else if (mode === 'kanban') {
        title.textContent = 'Nueva Tarea Kanban';
        body.innerHTML = createKanbanForm();
    } else if (mode === 'habit') {
        title.textContent = 'Nuevo Hábito';
        body.innerHTML = createHabitForm();
    } else if (mode === 'calendar') {
        title.textContent = `Agregar - ${formatDateDisplay(date)}`;
        body.innerHTML = createCalendarForm(date);
    } else if (mode === 'settings') {
        title.textContent = 'Configuración de Audio';
        modalContent.className = 'modal large';
        body.innerHTML = createAudioSettingsForm();
    } else if (mode === 'delete') {
        title.textContent = 'Confirmar Eliminación';
        body.innerHTML = createDeleteForm();
    }

    modal.classList.add('active');
}

function createDeleteForm() {
    if (!pendingDelete) return '';
    let message = '¿Estás seguro de que quieres eliminar este elemento?';
    if (pendingDelete.type === 'task') message = '¿Eliminar esta tarea permanentemente?';
    if (pendingDelete.type === 'kanban') message = '¿Eliminar esta tarea del tablero?';
    if (pendingDelete.type === 'habit') message = '¿Eliminar este hábito y todo su historial?';

    return `
                <div style="text-align: center; padding: 20px 0;">
                    <p style="margin-bottom: 24px;">${message}</p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
                        <button class="btn-primary" onclick="confirmDelete()" style="background: var(--danger);">Eliminar</button>
                    </div>
                </div>
            `;
}

function confirmDelete() {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;

    if (type === 'task') {
        tasks = tasks.filter(t => t.id != id);
        showNotification('Tarea eliminada');
    } else if (type === 'kanban') {
        kanbanTasks = kanbanTasks.filter(t => t.id != id);
        showNotification('Tarea eliminada del tablero');
    } else if (type === 'habit') {
        habits = habits.filter(h => h.id != id);
        showNotification('Hábito eliminado');
    }

    saveData();
    if (type !== 'kanban') renderAll(); // RenderAll para task y habit
    else renderKanban(); // Optimización para Kanban

    closeModal();
    pendingDelete = null;
}

function createTaskForm() {
    return `
                <form onsubmit="handleTaskSubmit(event)">
                    <div class="form-group">
                        <label class="form-label">Título</label>
                        <input type="text" id="taskTitle" class="form-input" placeholder="¿Qué necesitas hacer?" required>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Prioridad</label>
                        <div class="priority-options">
                            <div class="priority-option alta" onclick="selectPriority('alta', this)">
                                <div style="font-size:1.5rem;margin-bottom:4px">●</div>
                                <div>Alta</div>
                            </div>
                            <div class="priority-option media selected" onclick="selectPriority('media', this)">
                                <div style="font-size:1.5rem;margin-bottom:4px">○</div>
                                <div>Media</div>
                            </div>
                            <div class="priority-option baja" onclick="selectPriority('baja', this)">
                                <div style="font-size:1.5rem;margin-bottom:4px">◐</div>
                                <div>Baja</div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div class="form-group">
                            <label class="form-label">Fecha</label>
                            <input type="date" id="taskDate" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Hora</label>
                            <input type="time" id="taskTime" class="form-input">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Notas</label>
                        <textarea id="taskNotes" class="form-textarea" placeholder="Detalles adicionales..."></textarea>
                    </div>
                    
                    <button type="submit" class="btn-primary">Crear Tarea</button>
                </form>
            `;
}

function createKanbanForm() {
    return `
                <form onsubmit="handleKanbanSubmit(event)">
                    <div class="form-group">
                        <label class="form-label">Título</label>
                        <input type="text" id="kanbanTitle" class="form-input" placeholder="¿Qué tarea vas a hacer?" required>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Tiempo estimado (minutos)</label>
                        <input type="number" id="kanbanTime" class="form-input" value="30" min="1" required>
                    </div>
                    
                    <button type="submit" class="btn-primary">Crear Tarea</button>
                </form>
            `;
}

function createHabitForm() {
    return `
                <form onsubmit="handleHabitSubmit(event)">
                    <div class="form-group">
                        <label class="form-label">Nombre del Hábito</label>
                        <input type="text" id="habitTitle" class="form-input" placeholder="Ej: Ejercicio, Meditación, Lectura..." required>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Descripción (opcional)</label>
                        <input type="text" id="habitDesc" class="form-input" placeholder="Detalles del hábito...">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Días de la semana</label>
                        <div class="checkbox-group">
                            <label class="checkbox-item">
                                <input type="checkbox" id="day0" checked>
                                <span>Dom</span>
                            </label>
                            <label class="checkbox-item">
                                <input type="checkbox" id="day1" checked>
                                <span>Lun</span>
                            </label>
                            <label class="checkbox-item">
                                <input type="checkbox" id="day2" checked>
                                <span>Mar</span>
                            </label>
                            <label class="checkbox-item">
                                <input type="checkbox" id="day3" checked>
                                <span>Mié</span>
                            </label>
                            <label class="checkbox-item">
                                <input type="checkbox" id="day4" checked>
                                <span>Jue</span>
                            </label>
                            <label class="checkbox-item">
                                <input type="checkbox" id="day5" checked>
                                <span>Vie</span>
                            </label>
                            <label class="checkbox-item">
                                <input type="checkbox" id="day6" checked>
                                <span>Sáb</span>
                            </label>
                        </div>
                    </div>
                    
                    <button type="submit" class="btn-primary">Crear Hábito</button>
                </form>
            `;
}

function createCalendarForm(date) {
    return `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="btn-primary" onclick="openModal('task'); document.getElementById('taskDate').value = '${date}';" 
                            style="background: var(--primary);">
                        ◑ Nueva Tarea
                    </button>
                    <button class="btn-primary" onclick="openModal('habit');" 
                            style="background: var(--info);">
                        ◉ Nuevo Hábito
                    </button>
                    <button class="btn-secondary" onclick="closeModal()">
                        Cancelar
                    </button>
                </div>
            `;
}

function createAudioSettingsForm() {
    const hasCustom = customAudioData !== null;
    return `
                <div class="audio-settings">
                    <h4>🎵 Sonido de Alarma</h4>
                    <p style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 12px;">
                        Sube tu propio audio o música para la alarma. Formatos soportados: MP3, WAV, OGG
                    </p>
                    
                    <input type="file" id="audioUpload" class="audio-file-input" accept="audio/*" onchange="handleAudioUpload(event)">
                    <label for="audioUpload" class="audio-upload-btn">
                        📁 Subir Audio Personalizado
                    </label>
                    
                    <div class="audio-status" id="audioStatus">
                        ${hasCustom ? '✓ Audio personalizado cargado' : 'Usando sonido por defecto'}
                    </div>
                    
                    <div class="volume-control">
                        <span>🔊</span>
                        <input type="range" class="volume-slider" min="0" max="100" value="${audioVolume * 100}" 
                               oninput="updateVolume(this.value)">
                        <span id="volumeValue">${Math.round(audioVolume * 100)}%</span>
                    </div>
                    
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                        <button type="button" class="btn-secondary" onclick="testAlarmSound()" style="width: 100%;">
                            🔊 Probar Sonido
                        </button>
                    </div>
                    
                    ${hasCustom ? `
                        <div style="margin-top: 12px;">
                            <button type="button" class="btn-icon delete" onclick="clearCustomAudio()" style="width: 100%;">
                                🗑️ Volver a Sonido por Defecto
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
}

function openCalendarModal(date) {
    selectedCalendarDate = date;
    openModal('calendar', date);
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modalOverlay').classList.remove('active');
    editingId = null;
    editingKanbanId = null;
    editingHabitId = null;
    selectedCalendarDate = null;
}

function selectPriority(priority, el) {
    selectedPriority = priority;
    document.querySelectorAll('.priority-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
}

function setupTaskForm() {
    if (selectedCalendarDate) document.getElementById('taskDate').value = selectedCalendarDate;
}

function handleTaskSubmit(e) {
    e.preventDefault();

    if (editingId) {
        const task = tasks.find(t => t.id === editingId);
        if (task) {
            task.title = document.getElementById('taskTitle').value.trim();
            task.priority = selectedPriority;
            task.date = document.getElementById('taskDate').value;
            task.time = document.getElementById('taskTime').value;
            task.notes = document.getElementById('taskNotes').value.trim();
            showNotification('Tarea actualizada');
        }
        editingId = null;
    } else {
        tasks.unshift({
            id: Date.now(),
            title: document.getElementById('taskTitle').value.trim(),
            priority: selectedPriority,
            date: document.getElementById('taskDate').value,
            time: document.getElementById('taskTime').value,
            notes: document.getElementById('taskNotes').value.trim(),
            completed: false
        });
        showNotification('Tarea creada');
    }

    saveData();
    renderAll();
    closeModal();
}

function handleKanbanSubmit(e) {
    e.preventDefault();

    if (editingKanbanId) {
        const task = kanbanTasks.find(t => t.id === editingKanbanId);
        if (task) {
            task.title = document.getElementById('kanbanTitle').value.trim();
            task.time = parseInt(document.getElementById('kanbanTime').value) || 30;
            showNotification('Tarea actualizada');
        }
        editingKanbanId = null;
    } else {
        kanbanTasks.push({
            id: Date.now(),
            title: document.getElementById('kanbanTitle').value.trim(),
            time: parseInt(document.getElementById('kanbanTime').value) || 30,
            status: 'pending',
            elapsed: 0,
            alarmTriggered: false
        });
        showNotification('Tarea agregada al kanban');
    }

    saveData();
    renderAll();
    closeModal();
}

function handleHabitSubmit(e) {
    e.preventDefault();

    const days = [];
    for (let i = 0; i < 7; i++) days.push(document.getElementById(`day${i}`).checked);

    if (editingHabitId) {
        const habit = habits.find(h => h.id === editingHabitId);
        if (habit) {
            habit.title = document.getElementById('habitTitle').value.trim();
            habit.description = document.getElementById('habitDesc').value.trim();
            habit.days = days;
            showNotification('Hábito actualizado');
        }
        editingHabitId = null;
    } else {
        habits.push({
            id: Date.now(),
            title: document.getElementById('habitTitle').value.trim(),
            description: document.getElementById('habitDesc').value.trim(),
            days: days,
            completedDates: [],
            createdAt: new Date().toISOString()
        });
        showNotification('Hábito creado');
    }

    saveData();
    renderAll();
    closeModal();
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    editingId = id;
    openModal('task');

    setTimeout(() => {
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDate').value = task.date || '';
        document.getElementById('taskTime').value = task.time || '';
        document.getElementById('taskNotes').value = task.notes || '';

        const priorityOpt = document.querySelector(`.priority-option.${task.priority}`);
        if (priorityOpt) selectPriority(task.priority, priorityOpt);

        document.getElementById('modalTitle').textContent = 'Editar Tarea';
    }, 10);
}

function editKanban(id) {
    const task = kanbanTasks.find(t => t.id === id);
    if (!task) return;

    editingKanbanId = id;
    openModal('kanban');

    setTimeout(() => {
        document.getElementById('kanbanTitle').value = task.title;
        document.getElementById('kanbanTime').value = task.time;
        document.getElementById('modalTitle').textContent = 'Editar Tarea Kanban';
    }, 10);
}

function editHabit(id) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;

    editingHabitId = id;
    openModal('habit');

    setTimeout(() => {
        document.getElementById('habitTitle').value = habit.title;
        document.getElementById('habitDesc').value = habit.description || '';

        if (habit.days) {
            habit.days.forEach((checked, i) => {
                document.getElementById(`day${i}`).checked = checked;
            });
        }

        document.getElementById('modalTitle').textContent = 'Editar Hábito';
    }, 10);
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveData();
        renderAll();
        showNotification(task.completed ? 'Tarea completada' : 'Tarea marcada como pendiente');
    }
}

function deleteTask(id) {
    if (event) event.stopPropagation();
    pendingDelete = { type: 'task', id: id };
    openModal('delete');
}

function deleteKanban(id, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    pendingDelete = { type: 'kanban', id: id };
    openModal('delete');
}

function moveKanban(id, e) {
    e.stopPropagation();
    const task = kanbanTasks.find(t => t.id === id);
    if (!task) return;

    if (task.status === 'pending') {
        task.status = 'progress';
        // Iniciar timer con timestamps
        const now = Date.now();
        task.startTime = now;
        task.endTime = now + (task.time * 60 * 1000);
        task.elapsed = 0;
        task.alarmTriggered = false;
        // Activar Wake Lock para mantener pantalla encendida
        requestWakeLock();
    } else if (task.status === 'progress') {
        task.status = 'done';
        // Limpiar timestamps
        task.startTime = null;
        task.endTime = null;
        releaseWakeLock();
    } else {
        task.status = 'pending';
        // Limpiar timestamps
        task.startTime = null;
        task.endTime = null;
        task.elapsed = 0;
    }

    saveData();
    renderKanban();
    showNotification('Estado actualizado');
}

function dragStart(e, id) {
    e.dataTransfer.setData('text/plain', id);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function dragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
}

function allowDrop(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function dragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

function drop(e, status) {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData('text/plain'));
    const task = kanbanTasks.find(t => t.id === id);

    if (task) {
        const previousStatus = task.status;
        task.status = status;

        if (status === 'progress' && previousStatus !== 'progress') {
            // Iniciar timer con timestamps
            const now = Date.now();
            task.startTime = now;
            task.endTime = now + (task.time * 60 * 1000);
            task.elapsed = 0;
            task.alarmTriggered = false;
            requestWakeLock();
        } else if (status !== 'progress' && previousStatus === 'progress') {
            // Limpiar timestamps si sale de progreso
            task.startTime = null;
            task.endTime = null;
            releaseWakeLock();
        }

        saveData();
        renderKanban();
        showNotification(`Tarea movida a ${getStatusLabel(status)}`);
    }

    document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
}

function getStatusLabel(status) {
    const labels = { pending: 'Por Hacer', progress: 'En Proceso', done: 'Completadas' };
    return labels[status] || status;
}

function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks();
}

function filterByDate(date) {
    currentFilter = `date:${date}`;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    renderTasks();
}

function searchTasks(query) {
    if (!query) {
        renderTasks();
        return;
    }

    const q = query.toLowerCase();
    const filtered = tasks.filter(t => t.title.toLowerCase().includes(q));

    document.getElementById('tasksList').innerHTML = filtered.map(t => `
                <div class="task-item ${t.priority} ${t.completed ? 'completed' : ''}" onclick="toggleTask(${t.id})">
                    <div class="task-content">
                        <div class="task-title">${escapeHtml(t.title)}</div>
                        <div class="task-meta">
                            <span class="priority-tag ${t.priority}">${t.priority.toUpperCase()}</span>
                            ${t.date ? `<span>◐ ${formatDateDisplay(t.date)}</span>` : ''}
                        </div>
                    </div>
                    <div class="task-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" onclick="editTask(${t.id})">○</button>
                        <button class="btn-icon delete" onclick="deleteTask(${t.id}, event)">×</button>
                    </div>
                </div>
            `).join('');
}

function renderTasks() {
    let filtered = tasks;

    if (currentFilter === 'pending') filtered = tasks.filter(t => !t.completed);
    else if (currentFilter === 'completed') filtered = tasks.filter(t => t.completed);
    else if (currentFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        filtered = tasks.filter(t => t.date === today);
    } else if (currentFilter.startsWith('date:')) {
        const date = currentFilter.split(':')[1];
        filtered = tasks.filter(t => t.date === date);
    }

    if (filtered.length === 0) {
        document.getElementById('tasksList').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">○</div>
                        <p>No hay tareas para mostrar</p>
                    </div>
                `;
        return;
    }

    document.getElementById('tasksList').innerHTML = filtered.map(t => `
                <div class="task-item ${t.priority} ${t.completed ? 'completed' : ''}" onclick="toggleTask(${t.id})">
                    <div class="task-content">
                        <div class="task-title">${escapeHtml(t.title)}</div>
                        <div class="task-meta">
                            <span class="priority-tag ${t.priority}">${t.priority.toUpperCase()}</span>
                            ${t.date ? `<span>◐ ${formatDateDisplay(t.date)}</span>` : ''}
                            ${t.time ? `<span>◉ ${t.time}</span>` : ''}
                        </div>
                    </div>
                    <div class="task-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" onclick="editTask(${t.id})">○</button>
                        <button class="btn-icon delete" onclick="deleteTask(${t.id}, event)">×</button>
                    </div>
                </div>
            `).join('');
}

function toggleTheme() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    document.getElementById('themeText').textContent = isDark ? 'Claro' : 'Oscuro';
}

function testAlarmSound() {
    playAlarmSound();
    setTimeout(() => {
        if (confirm('¿Se escuchó el sonido correctamente?')) stopAlarmSound();
    }, 2000);
}

function clearCustomAudio() {
    if (confirm('¿Volver al sonido por defecto?')) {
        customAudioData = null;
        localStorage.removeItem('customAlarmAudio');
        renderAll();
        showNotification('Sonido por defecto restaurado');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateDisplay(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function showNotification(message) {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.classList.add('show');
    setTimeout(() => notif.classList.remove('show'), 3000);
}

/* Settings Modal Logic */
function openSettingsModal() {
    document.getElementById('settingsOverlay').classList.add('active');

    // Load current settings state
    const notificationsEnabled = localStorage.getItem('notificationsEnabled') !== 'false';
    const animationsEnabled = localStorage.getItem('animationsEnabled') !== 'false';

    updateToggleState('notifications', notificationsEnabled);
    updateToggleState('animations', animationsEnabled);

    // Load audio settings content if needed
    if (!document.getElementById('settings-audio-content').innerHTML) {
        document.getElementById('settings-audio-content').innerHTML = createAudioSettingsForm();
    }
}

function closeSettingsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('settingsOverlay').classList.remove('active');
}

function switchSettingsTab(tabId, element) {
    // Update tabs
    document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');

    // Update sections
    document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`settings-${tabId}`).classList.add('active');
}

function toggleSetting(settingKey) {
    const current = localStorage.getItem(`${settingKey}Enabled`) !== 'false';
    const newValue = !current;

    localStorage.setItem(`${settingKey}Enabled`, newValue);
    updateToggleState(settingKey, newValue);

    // Apply settings immediately
    if (settingKey === 'notifications') {
        if (newValue) requestNotificationPermission();
    } else if (settingKey === 'animations') {
        document.body.style.setProperty('--transition-speed', newValue ? '0.3s' : '0s');
    }

    showNotification(`Configuración guardada: ${newValue ? 'Activado' : 'Desactivado'}`);
}

function updateToggleState(key, enabled) {
    const toggle = document.getElementById(`toggle-${key}`);
    const status = document.getElementById(`${key}-status`);

    if (toggle) {
        if (enabled) toggle.classList.add('active');
        else toggle.classList.remove('active');
    }

    if (status) {
        status.textContent = enabled ? 'Activadas' : 'Desactivadas';
    }
}

function exportData() {
    const data = {
        tasks: tasks,
        kanbanTasks: kanbanTasks,
        habits: habits,
        audioVolume: audioVolume,
        customAudioData: customAudioData,
        settings: {
            notifications: localStorage.getItem('notificationsEnabled'),
            animations: localStorage.getItem('animationsEnabled'),
            darkMode: localStorage.getItem('darkMode')
        },
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "zen-tasks-backup_" + new Date().toISOString().slice(0, 10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    showNotification('Datos exportados correctamente');
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (data.tasks) {
                tasks = data.tasks;
                localStorage.setItem('tasks', JSON.stringify(tasks));
            }

            if (data.kanbanTasks) {
                kanbanTasks = data.kanbanTasks;
                localStorage.setItem('kanbanTasks', JSON.stringify(kanbanTasks));
            }

            if (data.habits) {
                habits = data.habits;
                localStorage.setItem('habits', JSON.stringify(habits));
            }

            if (data.audioVolume) {
                audioVolume = data.audioVolume;
                localStorage.setItem('audioVolume', audioVolume);
            }

            if (data.customAudioData) {
                customAudioData = data.customAudioData;
                localStorage.setItem('customAlarmAudio', customAudioData);
            }

            if (data.settings) {
                if (data.settings.notifications) localStorage.setItem('notificationsEnabled', data.settings.notifications);
                if (data.settings.animations) localStorage.setItem('animationsEnabled', data.settings.animations);
                if (data.settings.darkMode) localStorage.setItem('darkMode', data.settings.darkMode);
            }

            showNotification('Datos importados correctamente. Recargando...');
            setTimeout(() => window.location.reload(), 1500);

        } catch (error) {
            console.error('Error importando datos:', error);
            showNotification('Error al importar el archivo. Formato inválido.');
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    if (confirm('¿Estás seguro de que quieres BORRAR TODOS los datos? Esta acción no se puede deshacer.')) {
        if (confirm('Confirmación final: Se eliminarán todas tus tareas, hábitos y configuraciones.')) {
            localStorage.clear();
            showNotification('Todos los datos han sido eliminados.');
            setTimeout(() => window.location.reload(), 1500);
        }
    }
}
