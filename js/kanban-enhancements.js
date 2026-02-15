// ==========================================
// KANBAN ENHANCEMENTS - Auto-delete & History
// ==========================================

// Track deletion timers
let deletionTimers = {};

// Add task to history
function addToHistory(task) {
    const historyEntry = {
        id: task.id,
        title: task.title,
        description: task.description || '',
        completedAt: new Date().toISOString(),
        timeSpent: task.elapsed || 0,
        estimatedTime: task.time || 0,
        priority: task.priority || 'media',
        tags: task.tags || [],
        source: 'kanban'
    };
    
    completedTasksHistory.unshift(historyEntry);
    
    // Keep only last 1000 entries
    if (completedTasksHistory.length > 1000) {
        completedTasksHistory = completedTasksHistory.slice(0, 1000);
    }
    
    localStorage.setItem('zenCompletedHistory', JSON.stringify(completedTasksHistory));
}

// Schedule auto-delete after 2 minutes
function scheduleAutoDelete(taskId) {
    const task = kanbanTasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Add to history first
    addToHistory(task);
    
    // Mark for deletion
    task.scheduledForDeletion = true;
    task.deletionTime = Date.now() + (2 * 60 * 1000); // 2 minutes
    
    saveData();
    renderKanban();
    
    // Start countdown
    startDeletionCountdown(taskId);
    
    // Play completion sound
    playCompletionSound();
}

function startDeletionCountdown(taskId) {
    const updateCountdown = () => {
        const task = kanbanTasks.find(t => t.id === taskId);
        if (!task || !task.scheduledForDeletion) {
            clearInterval(deletionTimers[taskId]);
            delete deletionTimers[taskId];
            return;
        }
        
        const remaining = task.deletionTime - Date.now();
        
        if (remaining <= 0) {
            // Time's up, delete task
            clearInterval(deletionTimers[taskId]);
            delete deletionTimers[taskId];
            
            // Remove from kanban
            kanbanTasks = kanbanTasks.filter(t => t.id !== taskId);
            saveData();
            renderKanban();
            
            showNotification('Tarea completada y archivada');
        } else {
            // Update UI with remaining time
            updateDeletionUI(taskId, remaining);
        }
    };
    
    deletionTimers[taskId] = setInterval(updateCountdown, 1000);
    updateCountdown();
}

function updateDeletionUI(taskId, remainingMs) {
    const timerElement = document.querySelector(`#deletion-timer-${taskId}`);
    if (timerElement) {
        const seconds = Math.ceil(remainingMs / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerElement.textContent = `Se eliminará en ${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

function cancelAutoDelete(taskId) {
    const task = kanbanTasks.find(t => t.id === taskId);
    if (task && task.scheduledForDeletion) {
        clearInterval(deletionTimers[taskId]);
        delete deletionTimers[taskId];
        
        // Restore task
        task.scheduledForDeletion = false;
        task.deletionTime = null;
        task.status = 'progress';
        
        saveData();
        renderKanban();
        showNotification('Eliminación cancelada');
    }
}

// Play completion sound using Web Audio API
function playCompletionSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Create a pleasant "ding" sound
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log('Audio not supported');
    }
}
