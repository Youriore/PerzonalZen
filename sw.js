// Service Worker para Zen Tasks - Maneja notificaciones y alarmas en segundo plano
const CACHE_NAME = 'zen-tasks-v1';
const urlsToCache = [
    '/',
    '/index.html'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activación
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Manejar notificaciones push
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : '¡Tiempo completado!',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">◉</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">◉</text></svg>',
        tag: 'zen-tasks-alarm',
        requireInteraction: true,
        actions: [
            {
                action: 'stop',
                title: 'Detener'
            },
            {
                action: 'snooze',
                title: 'Posponer 5min'
            }
        ],
        vibrate: [500, 200, 500, 200, 1000, 200, 500, 200, 500]
    };

    event.waitUntil(
        self.registration.showNotification('⏰ ¡Tiempo Completado!', options)
    );
});

// Manejar clic en notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'stop') {
        // Enviar mensaje a la app para detener la alarma
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ action: 'stop-alarm' });
                });
            })
        );
    } else if (event.action === 'snooze') {
        // Posponer 5 minutos
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ action: 'snooze', minutes: 5 });
                });
            })
        );
    } else {
        // Abrir la app
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then((clients) => {
                if (clients.length > 0) {
                    clients[0].focus();
                } else {
                    self.clients.openWindow('/');
                }
            })
        );
    }
});

// Sincronización en segundo plano
self.addEventListener('sync', (event) => {
    if (event.tag === 'check-alarms') {
        event.waitUntil(checkAlarms());
    }
});

// Verificar alarmas pendientes
async function checkAlarms() {
    // Esta función se ejecuta en segundo plano
    // La app principal debe guardar las alarmas en IndexedDB
    // y el SW las verifica periódicamente

    const clients = await self.clients.matchAll({ type: 'window' });

    // Enviar mensaje a la app para que verifique alarmas
    clients.forEach((client) => {
        client.postMessage({ action: 'check-alarms' });
    });
}

// Mensajes desde la app principal
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'schedule-alarm') {
        // Programar una notificación para el futuro
        // Nota: Los navegadores limitan esto, no es 100% confiable
        const { title, body, timestamp } = event.data;

        // Guardar en almacenamiento para verificación periódica
        // (en una implementación real usaríamos IndexedDB)
    }
});