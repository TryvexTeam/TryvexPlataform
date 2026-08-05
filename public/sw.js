/* Service worker de Tryvex — instalación PWA + Web Push.
   Sin caché agresiva: el CRM siempre debe mostrar datos frescos.
   Solo se cachea el shell mínimo para que la app abra sin red. */

const CACHE = 'tryvex-shell-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/icon-192.png'])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Solo navegaciones: si no hay red, se muestra la página offline.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { titulo: 'Tryvex', cuerpo: event.data ? event.data.text() : '' }
  }

  const titulo = payload.titulo || 'Tryvex'

  /* Una llamada no es un aviso más: hay alguien esperando al otro lado ahora
     mismo. Con las opciones por defecto se comportaba igual que "nuevo lead
     asignado" -- aparecía y se iba sola a los pocos segundos, así que quien
     tenía el teléfono en el bolsillo se enteraba cuando ya habían colgado. */
  const esLlamada = payload.tag === 'llamada_entrante'

  const opciones = {
    body: payload.cuerpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { link: payload.link || '/hoy' },
    /* Se queda hasta que la persona haga algo con ella. */
    requireInteraction: esLlamada,
    /* Con el teléfono en silencio la vibración es lo único que avisa. */
    vibrate: esLlamada ? [200, 100, 200, 100, 200] : undefined,
    /* Sin esto, una llamada entrante puede llegar callada si el sistema decide
       agrupar. Para el resto de avisos el silencio está bien. */
    silent: false,
    actions: esLlamada ? [{ action: 'contestar', title: 'Contestar' }] : undefined,
  }

  event.waitUntil(self.registration.showNotification(titulo, opciones))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/hoy'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(link)
          return client.focus()
        }
      }
      return self.clients.openWindow(link)
    }),
  )
})
