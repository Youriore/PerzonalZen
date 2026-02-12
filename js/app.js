// State
let tasks = JSON.parse(localStorage.getItem('zenTasks')) || [];
let kanbanTasks = JSON.parse(localStorage.getItem('zenKanban')) || [];
let habits = JSON.parse(localStorage.getItem('zenHabits')) || [];
let scheduleItems = JSON.parse(localStorage.getItem('zenSchedule')) || [];
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

    // Date in Welcome Banner
    const dateEl = document.getElementById('header-date');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('es-ES', options);
    }


    // Switch to saved view
    const savedView = localStorage.getItem('currentView') || 'dashboard';
    switchView(savedView);

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
        const s = localStorage.getItem('zenSchedule');
        const v = localStorage.getItem('audioVolume');

        if (t) tasks = JSON.parse(t);
        else {
            // Rich Example Data
            tasks = [
                {
                    id: 1,
                    title: "Terminar informe de proyecto",
                    priority: "alta",
                    completed: false,
                    tags: ["Trabajo", "Urgente"],
                    subtasks: [
                        { title: "Recopilar datos", completed: true },
                        { title: "Redactar borrador", completed: false },
                        { title: "Revisión final", completed: false }
                    ],
                    date: new Date().toISOString().split('T')[0],
                    time: "10:00"
                },
                {
                    id: 2,
                    title: "Comprar víveres",
                    priority: "media",
                    completed: false,
                    tags: ["Casa"],
                    subtasks: [],
                    date: new Date().toISOString().split('T')[0]
                }
            ];
        }

        if (k) kanbanTasks = JSON.parse(k);
        else kanbanTasks = [
            { id: 1, title: 'Diseñar interfaz', status: 'pending', time: 45 },
            { id: 2, title: 'Implementar login', status: 'progress', time: 60, elapsed: 1200 },
            { id: 3, title: 'Configurar servidor', status: 'done', time: 30 }
        ];

        if (h) habits = JSON.parse(h);
        else {
            const today = new Date();
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
            const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

            habits = [
                {
                    id: 1,
                    title: "Leer 30 minutos",
                    description: "Libro actual: Hábitos Atómicos",
                    days: [true, true, true, true, true, true, true],
                    completedDates: [
                        twoDaysAgo.toISOString().split('T')[0],
                        yesterday.toISOString().split('T')[0]
                    ]
                }
            ];
        }

        if (s) scheduleItems = JSON.parse(s);
        if (v) audioVolume = parseFloat(v);

        // Save defaults if new
        if (!t || !k || !h) saveData();

    } catch (e) {
        tasks = [];
        kanbanTasks = [];
        habits = [];
        scheduleItems = [];
    }
}

function saveData() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
    localStorage.setItem('kanbanTasks', JSON.stringify(kanbanTasks));
    localStorage.setItem('habits', JSON.stringify(habits));
    localStorage.setItem('zenSchedule', JSON.stringify(scheduleItems));
}

function switchView(viewId) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');

    // Show selected view
    const view = document.getElementById(`${viewId}-view`);
    if (view) {
        view.style.display = viewId === 'dashboard' ? 'grid' : 'block';
        if (viewId === 'dashboard') {
            renderKanban();
            // updateStats(); // Removed
        } else if (viewId === 'calendar') {
            renderCalendar();
        } else if (viewId === 'habits') {
            renderHabits();
        } else if (viewId === 'schedule') {
            if (typeof renderSchedule === 'function') renderSchedule();
        } else if (viewId === 'timeblocking') {
            renderTimeBlocking();
        } else if (viewId === 'pomodoro') {
            initPomodoro();
        } else if (viewId === 'energy') {
            initEnergyManagement();
        }
    }

    // Update active nav item (Sidebar)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(viewId)) {
            link.classList.add('active');
        }
    });

    // Update active nav item (Bottom Nav)
    document.querySelectorAll('.bottom-nav-item').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(viewId)) {
            link.classList.add('active');
        }
    });

    localStorage.setItem('currentView', viewId);
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
            // Combine tasks and schedule items
            const allEvents = [
                ...dayTasks.map(t => ({ ...t, type: 'task' })),
            ];

            // Add schedule items + travel
            relevantScheduleItems.forEach(s => {
                // Main Event
                allEvents.push({ ...s, type: 'schedule', title: s.subject, timeStart: s.startTime });

                // Travel Before
                if (s.travelBefore && s.travelBefore > 0) {
                    // Calc start time
                    const [h, m] = s.startTime.split(':').map(Number);
                    const tStartMin = h * 60 + m - s.travelBefore;
                    const tH = Math.floor(tStartMin / 60);
                    const tM = tStartMin % 60;
                    const timeStr = formatTimeStr(tH, tM);
                    allEvents.push({
                        ...s,
                        type: 'travel',
                        title: `Viaje a ${s.subject}`,
                        timeStart: timeStr,
                        color: 'text-light' // muted color
                    });
                }
                // Travel After
                if (s.travelAfter && s.travelAfter > 0) {
                    // Calc start time = end of event
                    allEvents.push({
                        ...s,
                        type: 'travel',
                        title: `Regreso de ${s.subject}`,
                        timeStart: s.endTime,
                        color: 'text-light'
                    });
                }
            });

            allEvents.sort((a, b) => a.timeStart.localeCompare(b.timeStart)); // Sort by time
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
    renderKanban();
    if (typeof renderCalendar === 'function') renderCalendar();
    renderHabits();
    renderTasks();
}

// Stats function removed

function renderKanban() {
    // Apply search filter if exists
    const filteredTasks = kanbanTasks.filter(task => {
        if (!kanbanSearchTerm) return true;
        return task.title.toLowerCase().includes(kanbanSearchTerm) ||
               (task.description && task.description.toLowerCase().includes(kanbanSearchTerm));
    });
    
    const pending = filteredTasks.filter(t => t.status === 'pending');
    const progress = filteredTasks.filter(t => t.status === 'progress');
    const done = filteredTasks.filter(t => t.status === 'done');

    // Update headers with counts
    document.querySelector('#colPending .kanban-header').setAttribute('data-count', pending.length);
    document.querySelector('#colProgress .kanban-header').setAttribute('data-count', progress.length);
    document.querySelector('#colDone .kanban-header').setAttribute('data-count', done.length);

    // Show empty states if filtered
    const emptyState = '<div class="kanban-empty">Sin tareas</div>';
    
    document.getElementById('kanbanPending').innerHTML = pending.length > 0 
        ? pending.map(t => createKanbanItem(t)).join('') 
        : emptyState;
    document.getElementById('kanbanProgress').innerHTML = progress.length > 0 
        ? progress.map(t => createKanbanItem(t)).join('') 
        : emptyState;
    document.getElementById('kanbanDone').innerHTML = done.length > 0 
        ? done.map(t => createKanbanItem(t)).join('') 
        : emptyState;
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
        const timeDisplay = task.time ? `${task.time}min` : '∞';
        timerHtml = `<span>⏱ ${timeDisplay}</span>`;
    }

    return `
                <div class="kanban-task" draggable="true" ondragstart="dragStart(event, ${task.id})" ondragend="dragEnd(event)" 
                     onclick="editKanban(${task.id})" ondblclick="quickEditKanban(${task.id}, event)">
                    <div class="kanban-task-title">${escapeHtml(task.title)}</div>
                    <div class="kanban-task-meta">
                        ${timerHtml}
                        <div class="kanban-actions" onclick="event.stopPropagation()">
                            <button class="btn-icon" data-tooltip="Iniciar Timer" onclick="startKanbanTimer(${task.id}, event)">⏱</button>
                            <button class="btn-icon" data-tooltip="Mover Columna" onclick="moveKanban(${task.id}, event)">↔</button>
                            <button class="btn-icon delete" data-tooltip="Eliminar" onclick="deleteKanban(${task.id}, event)">🗑</button>
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
                <div class="habit-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="habit-title">
                        ${escapeHtml(habit.title)}
                        ${streak > 0 ? `<span class="habit-streak" style="margin-left:8px; font-size:0.9rem; background:rgba(255,100,0,0.1); color:#ff6b00; padding:2px 8px; border-radius:12px;">🔥 ${streak}</span>` : ''}
                    </div>
                    <button class="btn-icon delete" onclick="deleteHabit(${habit.id})" style="width:24px;height:24px;font-size:1.2rem;display:flex;align-items:center;justify-content:center;">×</button>
                </div>
                <div class="habit-desc">${habit.description || ''}</div>
                        <div class="habit-days">
                            ${weekDays.map(d => `
                                <div class="habit-day ${d.completed ? 'completed' : ''} ${d.isToday ? 'today' : ''}"
                                     onclick="toggleHabitForDate(${habit.id}, '${d.dateStr}')"
                                     title="${fullDayNames[d.day]}">
                                    ${d.label}
                                </div>
                            `).join('')}
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

function openModal(mode, date = null, status = 'pending') {
    modalMode = mode;
    editingId = null;
    editingKanbanId = null;
    editingHabitId = null;
    selectedCalendarDate = date;
    
    // Store default status for kanban tasks
    if (mode === 'kanban' && status) {
        modalMode = { mode, status };
    }

    const modal = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    modalContent.className = 'zen-modal';

    if (mode === 'task') {
        title.textContent = 'Nueva Tarea';
        body.innerHTML = createTaskForm();
        setupTaskForm();
    } else if (mode === 'kanban' || (mode && mode.mode === 'kanban')) {
        const status = mode.status || 'pending';
        const statusLabel = getStatusLabel(status);
        title.textContent = `Nueva Tarea - ${statusLabel}`;
        body.innerHTML = createKanbanForm();
    } else if (mode === 'habit') {
        title.textContent = 'Nuevo Hábito';
        body.innerHTML = createHabitForm();
    } else if (mode === 'calendar') {
        title.textContent = `Agregar - ${formatDateDisplay(date)}`;
        body.innerHTML = createCalendarForm(date);
    } else if (mode === 'settings') {
        title.textContent = 'Configuración de Audio';
        modalContent.className = 'zen-modal large';
        body.innerHTML = createAudioSettingsForm();
    } else if (mode === 'delete') {
        title.textContent = 'Confirmar Eliminación';
        body.innerHTML = createDeleteForm();
    } else if (mode === 'schedule') {
        openScheduleModal(); // Call dedicated function
        return; // Exit here as openScheduleModal handles everything
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

// Subtasks Logic
let tempSubtasks = [];

function addSubtaskItem() {
    const input = document.getElementById('newSubtaskInput');
    const val = input.value.trim();
    if (val) {
        tempSubtasks.push({ title: val, completed: false });
        input.value = '';
        renderSubtasksList();
    }
}

function removeSubtaskItem(index) {
    tempSubtasks.splice(index, 1);
    renderSubtasksList();
}

function renderSubtasksList() {
    const container = document.getElementById('subtasksList');
    if (!container) return;

    container.innerHTML = tempSubtasks.map((st, i) => `
        <div class="subtask-edit-item" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:6px 10px; margin-bottom:4px; border-radius:6px;">
            <span>${st.title}</span>
            <button type="button" class="btn-icon delete" onclick="removeSubtaskItem(${i})" style="width:20px; height:20px; font-size:1.2rem;">×</button>
        </div>
    `).join('');
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

                    <div class="form-group">
                        <label class="form-label">Etiquetas</label>
                        <input type="text" id="taskTags" class="form-input" placeholder="Ej: Trabajo, Personal, Urgente (separar por comas)">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Subtareas</label>
                        <div class="subtask-input-group" style="display:flex; gap:8px; margin-bottom:8px;">
                            <input type="text" id="newSubtaskInput" class="form-input" placeholder="Nueva subtarea..." onkeypress="if(event.key==='Enter'){event.preventDefault(); addSubtaskItem();}">
                            <button type="button" class="btn-secondary" style="width:auto; padding:0 12px;" onclick="addSubtaskItem()">+</button>
                        </div>
                        <div id="subtasksList" class="subtasks-list-container">
                            <!-- Populated via JS -->
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
                    
                    <button type="submit" class="btn-primary">Guardar Tarea</button>
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
    tempSubtasks = []; // Reset for new task
    if (selectedCalendarDate) document.getElementById('taskDate').value = selectedCalendarDate;
}

function handleTaskSubmit(e) {
    e.preventDefault();

    const tagsVal = document.getElementById('taskTags').value;
    const tags = tagsVal ? tagsVal.split(',').map(s => s.trim()).filter(s => s) : [];

    if (editingId) {
        const task = tasks.find(t => t.id === editingId);
        if (task) {
            task.title = document.getElementById('taskTitle').value.trim();
            task.priority = selectedPriority;
            task.date = document.getElementById('taskDate').value;
            task.time = document.getElementById('taskTime').value;
            task.notes = document.getElementById('taskNotes').value.trim();
            task.tags = tags;
            task.subtasks = [...tempSubtasks]; // Save copy
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
            tags: tags,
            subtasks: [...tempSubtasks],
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
        // Get status from modalMode or default to 'pending'
        const taskStatus = (modalMode && modalMode.status) ? modalMode.status : 'pending';
        
        kanbanTasks.push({
            id: Date.now(),
            title: document.getElementById('kanbanTitle').value.trim(),
            time: parseInt(document.getElementById('kanbanTime').value) || 30,
            status: taskStatus,
            elapsed: taskStatus === 'progress' ? 0 : undefined,
            startTime: taskStatus === 'progress' ? Date.now() : null,
            endTime: taskStatus === 'progress' ? Date.now() + (parseInt(document.getElementById('kanbanTime').value) || 30) * 60 * 1000 : null,
            alarmTriggered: false
        });
        showNotification(`Tarea agregada a ${getStatusLabel(taskStatus)}`);
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
        document.getElementById('taskTags').value = task.tags ? task.tags.join(', ') : '';

        // Load subtasks
        tempSubtasks = task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : [];
        renderSubtasksList();

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

function startKanbanTimer(id, e) {
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
        requestWakeLock();
        
        saveData();
        renderKanban();
        showNotification('⏱ Timer iniciado');
    }
}

function quickEditKanban(id, e) {
    e.preventDefault();
    e.stopPropagation();
    
    const task = kanbanTasks.find(t => t.id === id);
    if (!task) return;
    
    const taskElement = e.currentTarget;
    const titleElement = taskElement.querySelector('.kanban-task-title');
    
    // Create inline edit
    const input = document.createElement('input');
    input.type = 'text';
    input.value = task.title;
    input.className = 'kanban-quick-edit';
    input.style.cssText = `
        background: var(--card);
        border: 2px solid var(--accent);
        border-radius: 6px;
        padding: 8px 12px;
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        color: inherit;
        width: 100%;
        outline: none;
    `;
    
    titleElement.innerHTML = '';
    titleElement.appendChild(input);
    input.focus();
    input.select();
    
    const saveEdit = () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== task.title) {
            task.title = newTitle;
            saveData();
            renderKanban();
            showNotification('✏️ Tarea actualizada');
        } else {
            renderKanban();
        }
    };
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            renderKanban();
        }
    });
}

let kanbanSearchTerm = '';
let timeBlocks = [];

function filterKanban(searchTerm) {
    kanbanSearchTerm = searchTerm.toLowerCase();
    renderKanban();
}

function clearKanbanSearch() {
    kanbanSearchTerm = '';
    document.getElementById('kanbanSearch').value = '';
    renderKanban();
    showNotification('🔍 Búsqueda limpiada');
}

// Time Blocking Functions
function generateTimeBlocking() {
    timeBlocks = [];
    
    // Get all pending and progress tasks
    const relevantTasks = [...tasks, ...kanbanTasks.filter(t => t.status === 'pending')];
    
    // Sort by priority and estimated time
    relevantTasks.sort((a, b) => {
        const priorityOrder = { alta: 3, media: 2, baja: 1 };
        const aPriority = priorityOrder[a.prioridad] || 1;
        const bPriority = priorityOrder[b.prioridad] || 1;
        
        if (aPriority !== bPriority) {
            return bPriority - aPriority; // Higher priority first
        }
        
        // If same priority, shorter tasks first
        const aTime = a.time || 30;
        const bTime = b.time || 30;
        return aTime - bTime;
    });
    
    // Generate time blocks
    const startTime = 8; // 8 AM
    const endTime = 18; // 6 PM
    
    let currentTime = startTime;
    let totalPlannedMinutes = 0;
    
    relevantTasks.forEach(task => {
        const taskDuration = task.time || 30;
        const taskHours = Math.floor(taskDuration / 60);
        const taskMinutes = taskDuration % 60;
        
        // Check if task fits in remaining time
        const endTimeAdjusted = currentTime + taskHours + (taskMinutes > 0 ? 1 : 0);
        
        if (endTimeAdjusted <= endTime) {
            timeBlocks.push({
                ...task,
                startTime: `${currentTime.toString().padStart(2, '0')}:00`,
                endTime: `${endTimeAdjusted.toString().padStart(2, '0')}:00`,
                duration: taskDuration,
                type: task.prioridad || 'media'
            });
            
            currentTime = endTimeAdjusted;
            totalPlannedMinutes += taskDuration;
        }
    });
    
    // Add breaks
    const finalTimeBlocks = [];
    timeBlocks.forEach((block, index) => {
        finalTimeBlocks.push(block);
        
        // Add break after each task (except last)
        if (index < timeBlocks.length - 1) {
            const nextTaskStart = timeBlocks[index + 1].startTime;
            const currentEnd = block.endTime;
            const breakStart = currentEnd;
            const breakEnd = nextTaskStart;
            
            finalTimeBlocks.push({
                type: 'break',
                startTime: breakStart,
                endTime: breakEnd,
                duration: 15 // 15 minute breaks
            });
        }
    });
    
    timeBlocks = finalTimeBlocks;
    renderTimeBlocking();
    updateTimeBlockingStats(totalPlannedMinutes);
    showNotification('🎯 Time blocking generado automáticamente');
}

function renderTimeBlocking() {
    const grid = document.getElementById('timeblockingGrid');
    if (!grid) return;
    
    const hours = Array.from({length: 13}, (_, i) => i + 8); // 8 AM to 8 PM
    
    let html = '';
    
    // Header row with hours
    html += '<div class="timeblock-header">Hora</div>';
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    days.forEach(day => {
        html += `<div class="timeblock-header">${day}</div>`;
    });
    
    // Time slots
    hours.forEach(hour => {
        html += `<div class="timeblock-cell">${hour.toString().padStart(2, '0')}:00</div>`;
        
        days.forEach((day, dayIndex) => {
            const timeSlot = timeBlocks.find(block => 
                block.startTime === `${hour.toString().padStart(2, '0')}:00` && 
                block.day === dayIndex + 1
            );
            
            if (timeSlot) {
                const taskClass = timeSlot.type === 'break' ? 'timeblock-break' : `timeblock-task timeblock-task-${timeSlot.type}`;
                html += `
                    <div class="timeblock-cell">
                        <div class="${taskClass}">
                            <div class="timeblock-task-title">${escapeHtml(timeSlot.title)}</div>
                            <div class="timeblock-task-time">${timeSlot.type === 'break' ? 'Descanso' : timeSlot.duration + 'min'}</div>
                        </div>
                    </div>
                `;
            } else {
                html += '<div class="timeblock-cell"></div>';
            }
        });
    });
    
    grid.innerHTML = html;
}

function updateTimeBlockingStats(totalPlannedMinutes) {
    const totalHours = Math.floor(totalPlannedMinutes / 60);
    const totalMinutes = totalPlannedMinutes % 60;
    
    document.getElementById('totalPlannedTime').textContent = `${totalHours}h ${totalMinutes}m`;
    document.getElementById('totalTasksCount').textContent = timeBlocks.filter(b => b.type !== 'break').length;
    
    // Calculate focus time percentage (assuming 8-hour workday = 480 minutes)
    const focusPercentage = Math.min(Math.round((totalPlannedMinutes / 480) * 100), 100);
    document.getElementById('focusTimePercent').textContent = `${focusPercentage}%`;
}

function clearTimeBlocking() {
    timeBlocks = [];
    renderTimeBlocking();
    updateTimeBlockingStats(0);
    showNotification('🗑️ Time blocking limpiado');
}

// Pomodoro Timer Functions
let pomodoroInterval = null;
let pomodoroTimeLeft = 25 * 60;
let pomodoroWorkDuration = 25;
let pomodoroBreakDuration = 5;
let pomodoroIsRunning = false;
let pomodoroIsBreak = false;
let pomodoroCompletedToday = 0;
let pomodoroTotalSecondsToday = 0;
let pomodoroCurrentStreak = 0;
let pomodoroSelectedTaskId = null;

function initPomodoro() {
    loadPomodoroStats();
    updatePomodoroDisplay();
    populatePomodoroTaskSelect();
}

function loadPomodoroStats() {
    const today = new Date().toDateString();
    const stats = JSON.parse(localStorage.getItem('pomodoroStats')) || {};
    const todayStats = stats[today] || { completed: 0, seconds: 0 };
    
    pomodoroCompletedToday = todayStats.completed;
    pomodoroTotalSecondsToday = todayStats.seconds;
    
    // Load streak
    pomodoroCurrentStreak = calculatePomodoroStreak();
}

function calculatePomodoroStreak() {
    const stats = JSON.parse(localStorage.getItem('pomodoroStats')) || {};
    let streak = 0;
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        
        if (stats[dateStr] && stats[dateStr].completed > 0) {
            streak++;
        } else if (i === 0) {
            // Today doesn't count as missed yet
            continue;
        } else {
            break;
        }
    }
    
    return streak;
}

function populatePomodoroTaskSelect() {
    const select = document.getElementById('pomodoroTaskSelect');
    if (!select) return;
    
    const relevantTasks = [...tasks.filter(t => !t.completed), ...kanbanTasks.filter(t => t.status !== 'done')];
    
    select.innerHTML = '<option value="">Elige una tarea...</option>';
    relevantTasks.forEach(task => {
        select.innerHTML += `<option value="${task.id}">${escapeHtml(task.title)}</option>`;
    });
    
    select.onchange = function() {
        pomodoroSelectedTaskId = this.value;
        const task = relevantTasks.find(t => t.id === parseInt(this.value));
        document.getElementById('pomodoroTaskTitle').textContent = task ? task.title : 'Selecciona una tarea';
    };
}

function togglePomodoro() {
    if (pomodoroIsRunning) {
        pausePomodoro();
    } else {
        startPomodoro();
    }
}

function startPomodoro() {
    pomodoroIsRunning = true;
    document.getElementById('pomodoroStartBtn').style.display = 'none';
    document.getElementById('pomodoroPauseBtn').style.display = 'flex';
    
    // Request wake lock for timer
    requestWakeLock();
    
    pomodoroInterval = setInterval(() => {
        pomodoroTimeLeft--;
        updatePomodoroDisplay();
        
        if (pomodoroTimeLeft <= 0) {
            completePomodoroSession();
        }
    }, 1000);
}

function pausePomodoro() {
    pomodoroIsRunning = false;
    clearInterval(pomodoroInterval);
    document.getElementById('pomodoroStartBtn').style.display = 'flex';
    document.getElementById('pomodoroPauseBtn').style.display = 'none';
    releaseWakeLock();
}

function resetPomodoro() {
    pausePomodoro();
    pomodoroIsBreak = false;
    pomodoroTimeLeft = pomodoroWorkDuration * 60;
    updatePomodoroDisplay();
    document.getElementById('sessionType').textContent = 'Trabajo';
}

function completePomodoroSession() {
    pausePomodoro();
    
    if (!pomodoroIsBreak) {
        // Work session completed
        pomodoroCompletedToday++;
        pomodoroTotalSecondsToday += pomodoroWorkDuration * 60;
        
        // Save stats
        const today = new Date().toDateString();
        const stats = JSON.parse(localStorage.getItem('pomodoroStats')) || {};
        stats[today] = { completed: pomodoroCompletedToday, seconds: pomodoroTotalSecondsToday };
        localStorage.setItem('pomodoroStats', JSON.stringify(stats));
        
        // Update current streak
        pomodoroCurrentStreak = calculatePomodoroStreak();
        updatePomodoroStats();
        
        // Play completion sound
        playAlarmSound();
        
        // Switch to break
        pomodoroIsBreak = true;
        pomodoroTimeLeft = pomodoroBreakDuration * 60;
        document.getElementById('sessionType').textContent = 'Descanso';
        showNotification('🍅 ¡Pomodoro completado! Time for a break.');
        
        // Auto-start break (optional)
        if (confirm('¿Iniciar descanso automáticamente?')) {
            startPomodoro();
        }
    } else {
        // Break completed
        pomodoroIsBreak = false;
        pomodoroTimeLeft = pomodoroWorkDuration * 60;
        document.getElementById('sessionType').textContent = 'Trabajo';
        showNotification('⏰ Descanso terminado. ¡Listo para otro pomodoro?');
    }
    
    updatePomodoroDisplay();
}

function updatePomodoroDisplay() {
    const minutes = Math.floor(pomodoroTimeLeft / 60);
    const seconds = pomodoroTimeLeft % 60;
    document.getElementById('pomodoroTimer').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    updatePomodoroStats();
}

function updatePomodoroStats() {
    document.getElementById('todayPomodoros').textContent = pomodoroCompletedToday;
    
    const hours = Math.floor(pomodoroTotalSecondsToday / 3600);
    const minutes = Math.floor((pomodoroTotalSecondsToday % 3600) / 60);
    document.getElementById('todayFocusTime').textContent = `${hours}h ${minutes}m`;
    
    document.getElementById('currentStreak').textContent = pomodoroCurrentStreak;
}

function setPomodoroDuration(minutes) {
    pomodoroWorkDuration = minutes;
    localStorage.setItem('pomodoroWorkDuration', minutes);
    
    document.querySelectorAll('.duration-btn[data-duration]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.duration) === minutes);
    });
    
    if (!pomodoroIsRunning && !pomodoroIsBreak) {
        pomodoroTimeLeft = minutes * 60;
        updatePomodoroDisplay();
    }
}

function setBreakDuration(minutes) {
    pomodoroBreakDuration = minutes;
    localStorage.setItem('pomodoroBreakDuration', minutes);
    
    document.querySelectorAll('.duration-btn[data-break]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.break) === minutes);
    });
    
    if (pomodoroIsBreak && !pomodoroIsRunning) {
        pomodoroTimeLeft = minutes * 60;
        updatePomodoroDisplay();
    }
}

// Energy Management Functions
let energyLogs = [];

function initEnergyManagement() {
    loadEnergyLogs();
    renderEnergyChart();
    generateEnergyInsights();
    generateEnergyRecommendations();
}

function loadEnergyLogs() {
    energyLogs = JSON.parse(localStorage.getItem('energyLogs')) || [];
}

function saveEnergyLogs() {
    localStorage.setItem('energyLogs', JSON.stringify(energyLogs));
}

function logEnergyLevel() {
    const energyLevel = prompt('¿Cómo está tu energía actual? (1-5)', '3');
    const level = parseInt(energyLevel);
    
    if (level >= 1 && level <= 5) {
        const now = new Date();
        const hour = now.getHours();
        
        energyLogs.push({
            level: level,
            hour: hour,
            timestamp: now.toISOString(),
            mood: null // Could add mood tracking later
        });
        
        saveEnergyLogs();
        renderEnergyChart();
        generateEnergyInsights();
        showNotification(`⚡ Energía registrada: ${level}/5`);
    }
}

function renderEnergyChart() {
    const container = document.getElementById('energyChart');
    if (!container) return;
    
    // Group by hour and calculate average
    const hourlyAverages = {};
    const timeSlots = ['6:00', '7:00', '8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
    
    timeSlots.forEach((slot, index) => {
        const hour = index + 6;
        const relevantLogs = energyLogs.filter(log => log.hour === hour);
        
        if (relevantLogs.length > 0) {
            const avg = relevantLogs.reduce((sum, log) => sum + log.level, 0) / relevantLogs.length;
            hourlyAverages[hour] = avg;
        }
    });
    
    let html = '<div class="energy-timeline">';
    html += '<h3>📊 Tu Patrón de Energía (Promedio)</h3>';
    
    timeSlots.forEach((slot, index) => {
        const hour = index + 6;
        const avgLevel = hourlyAverages[hour] || 0;
        const percentage = avgLevel * 20;
        const levelClass = avgLevel <= 2 ? 'low' : avgLevel <= 3.5 ? 'medium' : 'high';
        
        html += `
            <div class="energy-row">
                <div class="energy-time">${slot}</div>
                <div class="energy-bar-container">
                    <div class="energy-bar ${levelClass}" style="width: ${percentage}%"></div>
                </div>
                <div class="energy-value">${avgLevel > 0 ? avgLevel.toFixed(1) : '-'}</div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function generateEnergyInsights() {
    if (energyLogs.length < 5) {
        // Not enough data
        document.getElementById('bestMorning').textContent = 'Necesitas más registros';
        document.getElementById('bestAfternoon').textContent = 'Necesitas más registros';
        document.getElementById('complexTasksTime').textContent = '--';
        document.getElementById('lightTasksTime').textContent = '--';
        return;
    }
    
    // Calculate best times
    const morningLogs = energyLogs.filter(log => log.hour >= 6 && log.hour < 12);
    const afternoonLogs = energyLogs.filter(log => log.hour >= 12 && log.hour < 18);
    
    const morningAvg = morningLogs.length > 0 
        ? morningLogs.reduce((sum, log) => sum + log.level, 0) / morningLogs.length 
        : 0;
    
    const afternoonAvg = afternoonLogs.length > 0 
        ? afternoonLogs.reduce((sum, log) => sum + log.level, 0) / afternoonLogs.length 
        : 0;
    
    // Find best morning and afternoon hours
    const findBestHour = (start, end) => {
        let bestHour = start;
        let bestAvg = 0;
        
        for (let h = start; h < end; h++) {
            const hourLogs = energyLogs.filter(log => log.hour === h);
            if (hourLogs.length > 0) {
                const avg = hourLogs.reduce((sum, log) => sum + log.level, 0) / hourLogs.length;
                if (avg > bestAvg) {
                    bestAvg = avg;
                    bestHour = h;
                }
            }
        }
        
        return { hour: bestHour, avg: bestAvg };
    };
    
    const bestMorning = findBestHour(6, 12);
    const bestAfternoon = findBestHour(12, 18);
    
    document.getElementById('bestMorning').textContent = 
        bestMorning.avg > 0 ? `${bestMorning.hour}:00 - ${bestMorning.hour + 2}:00` : 'Sin datos';
    document.getElementById('bestAfternoon').textContent = 
        bestAfternoon.avg > 0 ? `${bestAfternoon.hour}:00 - ${bestAfternoon.hour + 2}:00` : 'Sin datos';
    
    // Suggest task types
    if (morningAvg > afternoonAvg) {
        document.getElementById('complexTasksTime').textContent = 'Mañana';
        document.getElementById('lightTasksTime').textContent = 'Tarde';
    } else {
        document.getElementById('complexTasksTime').textContent = 'Tarde';
        document.getElementById('lightTasksTime').textContent = 'Mañana';
    }
}

function generateEnergyRecommendations() {
    const container = document.getElementById('energyRecommendations');
    if (!container) return;
    
    const currentHour = new Date().getHours();
    const recentLogs = energyLogs.filter(log => {
        const logHour = new Date(log.timestamp).getHours();
        return logHour === currentHour;
    });
    
    const currentAvg = recentLogs.length > 0 
        ? recentLogs.reduce((sum, log) => sum + log.level, 0) / recentLogs.length 
        : 3;
    
    let recommendations = [];
    
    if (currentAvg <= 2) {
        recommendations = [
            {
                icon: '☕',
                title: 'Toma un descanso',
                content: 'Tu energía está baja. Considera tomar un café corto o hacer una pausa de 10 minutos.'
            },
            {
                icon: '🚶',
                title: 'Movimiento ligero',
                content: 'Un paseo corto de 5 minutos puede ayudar a aumentar tu nivel de energía.'
            },
            {
                icon: '📝',
                title: 'Tareas ligeras ahora',
                content: 'Guarda las tareas complejas para cuando tu energía sea mayor.'
            }
        ];
    } else if (currentAvg >= 4) {
        recommendations = [
            {
                icon: '🎯',
                title: 'Es tu momento pico',
                content: '¡Aprovecha! Este es el mejor momento para tareas que requieren concentración.'
            },
            {
                icon: '🧠',
                title: 'Retos importantes',
                content: 'Ideal para trabajar en proyectos difíciles o tomar decisiones importantes.'
            }
        ];
    } else {
        recommendations = [
            {
                icon: '⚖️',
                title: 'Buen equilibrio',
                content: 'Tu energía está en un nivel moderado. Continúa con tu trabajo regular.'
            },
            {
                icon: '📋',
                title: 'Revisa tu lista',
                content: 'Un buen momento para organizar y priorizar tus tareas del día.'
            }
        ];
    }
    
    let html = '';
    recommendations.forEach(rec => {
        html += `
            <div class="recommendation-item">
                <div class="recommendation-icon">${rec.icon}</div>
                <div class="recommendation-content">
                    <h4>${rec.title}</h4>
                    <p>${rec.content}</p>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
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
                <div class="task-item ${t.priority} ${t.completed ? 'completed' : ''}" 
                     draggable="true" 
                     ondragstart="dragTask(event, ${t.id})"
                     onclick="toggleTask(${t.id})">
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
                            ${t.tags && t.tags.length > 0 ? t.tags.map(tag => `<span class="priority-tag" style="background:var(--accent); color:var(--primary);">${tag}</span>`).join('') : ''}
                            ${t.date ? `<span>◐ ${formatDateDisplay(t.date)}</span>` : ''}
                            ${t.time ? `<span>◉ ${t.time}</span>` : ''}
                            ${t.subtasks && t.subtasks.length > 0 ? `
                                <span style="font-size:0.8rem; background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:4px;">
                                    ✓ ${t.subtasks.filter(st => st.completed).length}/${t.subtasks.length}
                                </span>
                            ` : ''}
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

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar.classList.contains('active')) {
        closeMobileSidebar();
    } else {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling
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
        scheduleItems: scheduleItems,
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

            if (data.scheduleItems) {
                scheduleItems = data.scheduleItems;
                localStorage.setItem('zenSchedule', JSON.stringify(scheduleItems));
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
// Schedule Logic

function renderSchedule() {
    const gridContent = document.getElementById('schedule-grid-content');
    gridContent.innerHTML = '';

    const startHour = 6; // 6 AM
    const endHour = 23; // 11 PM

    // Create Rows
    for (let hour = startHour; hour <= endHour; hour++) {
        // Time Cell
        const timeCell = document.createElement('div');
        timeCell.className = 'time-slot';
        timeCell.textContent = `${hour}:00`;
        timeCell.style.gridColumn = '1 / 2';
        timeCell.style.gridRow = `${hour - startHour + 2} / ${hour - startHour + 3}`; // +2 because header is row 1
        gridContent.appendChild(timeCell);

        // Day Cells (Backgrounds)
        for (let day = 1; day <= 7; day++) { // 1=Mon, 7=Sun
            const cell = document.createElement('div');
            cell.className = 'schedule-cell';
            cell.style.gridColumn = `${day + 1} / ${day + 2}`;
            cell.style.gridRow = `${hour - startHour + 2} / ${hour - startHour + 3}`;

            // Drag and Drop Events
            cell.ondragover = (e) => allowDrop(e);
            cell.ondrop = (e) => dropTaskOnSchedule(e, day, hour);

            cell.onclick = () => openScheduleModal(day, hour);
            gridContent.appendChild(cell);
        }
    }

    // Render Items
    scheduleItems.forEach(item => {
        // Handle migration on the fly if needed
        const itemDays = item.days || (item.day ? [item.day] : []);

        // Helper to render a block
        const renderBlock = (day, startH, startM, durationMin, type, label, isMain = false) => {
            const startRow = (startH - startHour) + 2;
            const pixelHeight = durationMin;
            const pixelMarginTop = startM;
            const dayCol = day + 1;

            const el = document.createElement('div');
            if (isMain) {
                el.className = `schedule-item sch-color-${item.color}`;
                el.innerHTML = `
                    <div style="font-weight:600; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${label}</div>
                    <div style="font-size:0.75rem; opacity:0.9;">${formatTimeStr(startH, startM)} - ${formatTimeStrAdd(startH, startM, durationMin)}</div>
                    <button class="btn-icon delete" style="position:absolute; top:2px; right:2px; color:white; padding:0; width:16px; height:16px; z-index:10;" onclick="deleteScheduleItem(${item.id}, event)">×</button>
                `;
                el.onclick = (e) => editScheduleItem(item.id, e);
                el.style.zIndex = '10';
            } else {
                // Travel Block styling
                el.className = `schedule-item`;
                el.style.background = `repeating-linear-gradient(45deg, var(--bg), var(--bg) 10px, var(--card) 10px, var(--card) 20px)`;
                el.style.border = `1px dashed var(--text-light)`;
                el.style.color = `var(--text-light)`;
                el.style.opacity = '0.7';
                el.innerHTML = `<div style="font-size:0.7rem; display:flex; align-items:center; justify-content:center; height:100%;"><span class="material-icons" style="font-size:1rem; margin-right:4px;">commute</span> ${durationMin}m</div>`;
                el.style.zIndex = '5';
            }

            el.style.gridColumn = `${dayCol} / ${dayCol + 1}`;
            el.style.gridRow = `${startRow} / span 1`;
            el.style.height = `${pixelHeight}px`;
            el.style.marginTop = `${pixelMarginTop}px`;
            el.style.position = 'relative';

            gridContent.appendChild(el);
        };

        const [startH, startM] = item.startTime.split(':').map(Number);
        const [endH, endM] = item.endTime.split(':').map(Number);

        // Duration of main event
        let durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        if (durationMinutes < 0) durationMinutes += 24 * 60;
        if (durationMinutes === 0) durationMinutes = 30;

        itemDays.forEach(day => {
            // Render Main Event
            renderBlock(day, startH, startM, durationMinutes, 'main', item.subject, true);

            // Render Travel Before
            if (item.travelBefore && item.travelBefore > 0) {
                // Calculate new start time
                const eventStartInMin = startH * 60 + startM;
                const travelStartInMin = eventStartInMin - item.travelBefore;
                const tStartH = Math.floor(travelStartInMin / 60);
                const tStartM = travelStartInMin % 60;
                renderBlock(day, tStartH, tStartM, item.travelBefore, 'travel', 'Ida');
            }

            // Render Travel After
            if (item.travelAfter && item.travelAfter > 0) {
                // Calculate new start time (is end of event)
                const eventEndInMin = endH * 60 + endM; // assuming simple calc, wrap around ignored for travel for now
                const tStartH = Math.floor(eventEndInMin / 60);
                const tStartM = eventEndInMin % 60;
                renderBlock(day, tStartH, tStartM, item.travelAfter, 'travel', 'Vuelta');
            }
        });
    });
}

function formatTimeStr(h, m) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
function formatTimeStrAdd(h, m, addMin) {
    let total = h * 60 + m + addMin;
    let nh = Math.floor(total / 60) % 24;
    let nm = total % 60;
    return formatTimeStr(nh, nm);
}

function openScheduleModal(day = 1, hour = 9) {
    modalMode = 'schedule';
    editingScheduleId = null;
    selectedColor = 'primary';

    // Default values
    const startTime = `${hour.toString().padStart(2, '0')}:00`;
    const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;

    // Generate form
    const modalTitle = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    modalTitle.textContent = 'Añadir Actividad';
    body.innerHTML = createScheduleForm(day, startTime, endTime, null);

    const modal = document.getElementById('modalOverlay'); // Changed to 'modalOverlay' to match existing HTML
    modal.classList.add('active');
}

function createScheduleForm(day, startTime, endTime, item) {
    // Safe check for item
    const travelBefore = (item && item.travelBefore) ? item.travelBefore : 0;
    const travelAfter = (item && item.travelAfter) ? item.travelAfter : 0;

    // Determine selected days for checkboxes
    const selectedDays = item && item.days ? item.days : (Array.isArray(day) ? day : [day]);

    return `
        <form onsubmit="handleScheduleSubmit(event)">
            <input type="text" id="schSubject" class="form-input" placeholder="Asunto / Actividad" value="${item ? item.subject : ''}" required style="font-size:1.1rem; font-weight:600; margin-bottom:16px;">
            
            <div class="form-group">
                <label class="form-label">Día(s)</label>
                <div class="week-days-selector">
                    <label class="checkbox-item"><input type="checkbox" name="schDay" value="1" ${selectedDays.includes(1) ? 'checked' : ''}><span>Lun</span></label>
                    <label class="checkbox-item"><input type="checkbox" name="schDay" value="2" ${selectedDays.includes(2) ? 'checked' : ''}><span>Mar</span></label>
                    <label class="checkbox-item"><input type="checkbox" name="schDay" value="3" ${selectedDays.includes(3) ? 'checked' : ''}><span>Mié</span></label>
                    <label class="checkbox-item"><input type="checkbox" name="schDay" value="4" ${selectedDays.includes(4) ? 'checked' : ''}><span>Jue</span></label>
                    <label class="checkbox-item"><input type="checkbox" name="schDay" value="5" ${selectedDays.includes(5) ? 'checked' : ''}><span>Vie</span></label>
                    <label class="checkbox-item"><input type="checkbox" name="schDay" value="6" ${selectedDays.includes(6) ? 'checked' : ''}><span>Sáb</span></label>
                    <label class="checkbox-item"><input type="checkbox" name="schDay" value="7" ${selectedDays.includes(7) ? 'checked' : ''}><span>Dom</span></label>
                </div>
            </div>
            
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex:1">
                    <label class="form-label">Inicio</label>
                    <input type="time" id="schStart" class="form-input" value="${item ? item.startTime : startTime}" required>
                </div>
                <div class="form-group" style="flex:1">
                    <label class="form-label">Fin</label>
                    <input type="time" id="schEnd" class="form-input" value="${item ? item.endTime : endTime}" required>
                </div>
            </div>

            <div style="display: flex; gap: 16px; margin-top: 10px;">
                <div class="form-group" style="flex:1">
                    <label class="form-label" style="font-size:0.85rem">Viaje Ida (min)</label>
                    <input type="number" id="schTravelBefore" class="form-input" value="${travelBefore}" min="0" step="5">
                </div>
                <div class="form-group" style="flex:1">
                    <label class="form-label" style="font-size:0.85rem">Viaje Regreso (min)</label>
                    <input type="number" id="schTravelAfter" class="form-input" value="${travelAfter}" min="0" step="5">
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Color</label>
                <div style="display:flex; gap:12px;">
                    ${['primary', 'success', 'warning', 'danger', 'info'].map(c => `
                        <div class="priority-option ${c === selectedColor ? 'selected' : ''}" 
                             style="width:30px; height:30px; border-radius:50%; background:var(--${c}); cursor:pointer; padding:0; border:2px solid transparent;"
                             onclick="selectScheduleColor('${c}', this)">
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <button type="submit" class="btn-primary">Guardar Actividad</button>
        </form>
    `;
}

function selectScheduleColor(color, el) {
    selectedColor = color;
    // Visually update selection
    el.parentNode.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
    el.style.borderColor = 'var(--text)';
}

function handleScheduleSubmit(e) {
    e.preventDefault();

    const subject = document.getElementById('schSubject').value.trim();

    const selectedDays = Array.from(document.querySelectorAll('input[name="schDay"]:checked'))
        .map(cb => parseInt(cb.value));

    const startTime = document.getElementById('schStart').value;
    const endTime = document.getElementById('schEnd').value;
    const travelBefore = parseInt(document.getElementById('schTravelBefore').value) || 0;
    const travelAfter = parseInt(document.getElementById('schTravelAfter').value) || 0;

    if (selectedDays.length === 0) {
        alert('Por favor selecciona al menos un día');
        return;
    }

    if (editingScheduleId) {
        const item = scheduleItems.find(i => i.id === editingScheduleId);
        if (item) {
            item.subject = subject;
            item.days = selectedDays; // Store as array
            item.startTime = startTime;
            item.endTime = endTime;
            item.travelBefore = travelBefore;
            item.travelAfter = travelAfter;
            item.color = selectedColor;
            // Remove legacy 'day' property if it exists
            delete item.day;
        }
    } else {
        scheduleItems.push({
            id: Date.now(),
            subject,
            days: selectedDays,
            startTime,
            endTime,
            travelBefore,
            travelAfter,
            color: selectedColor
        });
    }

    localStorage.setItem('zenSchedule', JSON.stringify(scheduleItems));
    renderSchedule();
    closeModal();
    showNotification('Horario actualizado');
}

// Ensure migration of old data structure
function migrateScheduleData() {
    let changed = false;
    scheduleItems.forEach(item => {
        if (!item.days && item.day) {
            item.days = [item.day];
            delete item.day;
            changed = true;
        }
    });
    if (changed) localStorage.setItem('zenSchedule', JSON.stringify(scheduleItems));
}

function deleteScheduleItem(id, e) {
    if (e) e.stopPropagation();
    if (confirm('¿Eliminar esta actividad?')) {
        scheduleItems = scheduleItems.filter(i => i.id !== id);
        localStorage.setItem('zenSchedule', JSON.stringify(scheduleItems));
        renderSchedule();
        showNotification('Actividad eliminada');
    }
}

function editScheduleItem(id, e) {
    if (e) e.stopPropagation();
    const item = scheduleItems.find(i => i.id === id);
    if (!item) return;

    modalMode = 'schedule';
    editingScheduleId = id;
    selectedColor = item.color;

    const modal = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    title.textContent = 'Editar Actividad';
    body.innerHTML = createScheduleForm(item.day, item.startTime, item.endTime);

    // Fill values after HTML injection
    document.getElementById('schSubject').value = item.subject;
    document.getElementById('schStart').value = item.startTime;
    document.getElementById('schEnd').value = item.endTime;
    document.getElementById('schTravelBefore').value = item.travelBefore || 0;
    document.getElementById('schTravelAfter').value = item.travelAfter || 0;

    modal.classList.add('active');
}

// Drag and Drop Logic for Schedule
function dragTask(ev, taskId) {
    ev.dataTransfer.setData("taskId", taskId);
    ev.dataTransfer.effectAllowed = "copy";
}

function allowDrop(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
}

function dropTaskOnSchedule(ev, day, hour) {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("taskId");
    const task = tasks.find(t => t.id == taskId);

    if (task) {
        // Create a new schedule item from the task
        const startTime = `${hour.toString().padStart(2, '0')}:00`;
        const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`; // Default 1 hour

        const newItem = {
            id: Date.now(),
            subject: task.title,
            days: [day], // The specific day dropped on
            startTime: startTime,
            endTime: endTime,
            travelBefore: 0,
            travelAfter: 0,
            color: 'primary' // Default color
        };

        scheduleItems.push(newItem);
        localStorage.setItem('zenSchedule', JSON.stringify(scheduleItems));
        renderSchedule();
        showNotification('Tarea agendada');
    }
}
