self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  // Kailangan ito para makita ng Chrome na valid PWA
});
