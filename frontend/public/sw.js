const CACHE_NAME = "scanapp-v4";
const SHARE_CACHE_NAME = "scanapp-share-target-v1";
const SHARED_INVOICE_URL = "/shared-invoice-pdf";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["/", "/manifest.json", "/store-logo.jpeg"])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method === "POST" && requestUrl.pathname === "/share-invoice") {
    event.respondWith(handleSharedInvoice(event.request));
    return;
  }

  if (event.request.method === "GET" && requestUrl.pathname === SHARED_INVOICE_URL) {
    event.respondWith(getSharedInvoice());
    return;
  }

  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

async function handleSharedInvoice(request) {
  const formData = await request.formData();
  const sharedFile = formData.get("invoice");

  if (!sharedFile || typeof sharedFile === "string") {
    return Response.redirect("/share-invoice?error=missing-file", 303);
  }

  const cache = await caches.open(SHARE_CACHE_NAME);
  await cache.put(
    SHARED_INVOICE_URL,
    new Response(sharedFile, {
      headers: {
        "content-type": sharedFile.type || "application/pdf",
        "x-scanapp-filename": sharedFile.name || "shared-invoice.pdf"
      }
    })
  );

  return Response.redirect("/share-invoice?source=share-target", 303);
}

async function getSharedInvoice() {
  const cache = await caches.open(SHARE_CACHE_NAME);
  const response = await cache.match(SHARED_INVOICE_URL);

  if (!response) {
    return new Response("No shared invoice found", { status: 404 });
  }

  await cache.delete(SHARED_INVOICE_URL);
  return response;
}
