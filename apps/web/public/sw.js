/* Fundable PWA service worker. Only public campaign summaries are persisted. */
const CACHE_NAME = "fundable-pwa-v2";
const CACHE_PREFIX = "fundable-pwa-";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/fundable-192.png",
  "/icons/fundable-512.png",
  "/splash/fundable-startup.png",
  "/icons/fundable-192.svg",
  "/icons/fundable-512.svg",
  "/icons/fundable-maskable.svg",
  "/splash/fundable.svg"
];
const DB_NAME = "fundable-offline";
const DB_VERSION = 1;
const CAMPAIGN_STORE = "campaigns";

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map(function (url) {
      return cache.add(url).catch(function () { return undefined; });
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const names = await caches.keys();
    await Promise.all(names.filter(function (name) {
      return name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE_NAME;
    }).map(function (name) { return caches.delete(name); }));
    await self.clients.claim();
  })());
});

function openDatabase() {
  return new Promise(function (resolve, reject) {
    if (!("indexedDB" in self)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAMPAIGN_STORE)) {
        db.createObjectStore(CAMPAIGN_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("apiResponses")) {
        db.createObjectStore("apiResponses", { keyPath: "url" });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error("Unable to open offline database")); };
  });
}

function sanitizeCampaign(value) {
  if (!value || typeof value !== "object") return null;
  const candidate = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data
    : value;
  const rawId = candidate.id !== undefined ? candidate.id : candidate.campaignId;
  if ((typeof rawId !== "string" && typeof rawId !== "number") || !String(rawId).trim()) return null;
  const id = String(rawId).trim();
  const text = function (input, fallback) {
    return typeof input === "string" ? input.slice(0, 10000) : (typeof input === "number" ? String(input) : fallback);
  };
  return {
    id: id,
    name: text(candidate.name || candidate.title, "Untitled campaign"),
    description: text(candidate.description, ""),
    location: text(candidate.location, ""),
    goalAmount: text(candidate.goalAmount, ""),
    raisedAmount: text(candidate.raisedAmount, ""),
    treeCount: typeof candidate.treeCount === "number" && Number.isFinite(candidate.treeCount) ? candidate.treeCount : null,
    status: text(candidate.status, ""),
    deadline: typeof candidate.deadline === "number" && Number.isFinite(candidate.deadline) ? candidate.deadline : null,
    updatedAt: Date.now(),
    url: "/campaigns/" + encodeURIComponent(id)
  };
}

async function saveCampaignPayload(payload) {
  const values = payload && Array.isArray(payload.data)
    ? payload.data
    : [payload && payload.data && typeof payload.data === "object" ? payload.data : payload];
  const records = values.map(sanitizeCampaign).filter(Boolean);
  if (!records.length) return;
  const db = await openDatabase();
  try {
    await new Promise(function (resolve, reject) {
      const tx = db.transaction(CAMPAIGN_STORE, "readwrite");
      const store = tx.objectStore(CAMPAIGN_STORE);
      records.forEach(function (record) { store.put(record); });
      tx.oncomplete = function () { resolve(undefined); };
      tx.onerror = function () { reject(tx.error || new Error("Unable to save campaigns")); };
      tx.onabort = function () { reject(tx.error || new Error("Campaign save was aborted")); };
    });
  } finally {
    db.close();
  }
}

async function getSavedCampaigns() {
  const db = await openDatabase();
  try {
    return await new Promise(function (resolve, reject) {
      const tx = db.transaction(CAMPAIGN_STORE, "readonly");
      const request = tx.objectStore(CAMPAIGN_STORE).getAll();
      request.onsuccess = function () { resolve(Array.isArray(request.result) ? request.result : []); };
      request.onerror = function () { reject(request.error || new Error("Unable to read saved campaigns")); };
    });
  } finally {
    db.close();
  }
}

async function getSavedCampaign(id) {
  const db = await openDatabase();
  try {
    return await new Promise(function (resolve, reject) {
      const tx = db.transaction(CAMPAIGN_STORE, "readonly");
      const request = tx.objectStore(CAMPAIGN_STORE).get(id);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error || new Error("Unable to read saved campaign")); };
    });
  } finally {
    db.close();
  }
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function isCampaignApi(url) {
  if (url.pathname === "/api/campaigns") {
    return !url.searchParams.has("creator") &&
      !url.searchParams.has("includeStats") &&
      !url.searchParams.has("includeStreamStatus");
  }
  return /^\/api\/campaigns\/[^/]+$/.test(url.pathname);
}

async function offlineCampaignResponse(url) {
  try {
    if (url.pathname === "/api/campaigns") {
      let campaigns = await getSavedCampaigns();
      const status = url.searchParams.get("status");
      const search = (url.searchParams.get("search") || "").toLowerCase();
      if (status) campaigns = campaigns.filter(function (campaign) { return campaign.status === status; });
      if (search) campaigns = campaigns.filter(function (campaign) {
        return [campaign.name, campaign.description, campaign.location].some(function (value) {
          return String(value || "").toLowerCase().includes(search);
        });
      });
      const total = campaigns.length;
      const limitValue = Number(url.searchParams.get("limit") || 20);
      const offsetValue = Number(url.searchParams.get("offset") || 0);
      const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
      const offset = Number.isFinite(offsetValue) && offsetValue >= 0 ? offsetValue : 0;
      campaigns.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return jsonResponse({ data: campaigns.slice(offset, offset + limit), pagination: { limit: limit, offset: offset, count: Math.min(limit, Math.max(0, total - offset)), total: total }, offline: true });
    }
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    const campaign = await getSavedCampaign(id);
    return campaign
      ? jsonResponse({ ...campaign, offline: true })
      : jsonResponse({ error: "This campaign has not been saved for offline use.", offline: true }, 503);
  } catch (_error) {
    return jsonResponse({ error: "Offline campaign storage is unavailable.", offline: true }, 503);
  }
}


function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character];
  });
}

function offlineCampaignPage(campaign) {
  const title = escapeHtml(campaign.name || "Saved campaign");
  const description = escapeHtml(campaign.description || "No description was saved for this campaign.");
  const location = escapeHtml(campaign.location || "Location not saved");
  const status = escapeHtml(campaign.status || "Status not saved");
  const funding = escapeHtml(campaign.raisedAmount || "0") + " raised of " + escapeHtml(campaign.goalAmount || "—");
  const trees = campaign.treeCount == null ? "" : "<p><strong>Trees:</strong> " + escapeHtml(campaign.treeCount) + "</p>";
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#8256ff"><title>' + title + ' · Fundable offline</title>' +
    '<style>:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#0d0019;color:#f8f7ff}' +
    'body{margin:0;padding:24px;background:radial-gradient(ellipse at top,#26134b,#0d0019 60%);min-height:100vh}' +
    'main{max-width:680px;margin:8vh auto 0}.brand{color:#b9a4ff;font-size:.85rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}' +
    '.pill{display:inline-block;border:1px solid #69558e;background:#201239;border-radius:999px;padding:7px 12px;font-size:.9rem;color:#fbbf24}' +
    'h1{font-size:clamp(2rem,6vw,3.25rem);line-height:1.05;margin:18px 0}p{color:#d0c8e2;line-height:1.65}' +
    'section{margin-top:24px;padding:20px;border:1px solid #403052;border-radius:16px;background:#160b25}' +
    'a{color:#c4b5fd;text-underline-offset:4px}a:focus-visible{outline:3px solid white;outline-offset:3px}</style>' +
    '</head><body><main><div class="brand">Fundable Stellar</div><p class="pill">Offline saved copy</p>' +
    '<h1>' + title + '</h1><p>' + description + '</p><section><p><strong>Location:</strong> ' + location + '</p>' +
    '<p><strong>Status:</strong> ' + status + '</p><p><strong>Funding:</strong> ' + funding + '</p>' + trees +
    '<p>This is a saved summary from this device. Wallet connections, donations, and live data need an internet connection.</p></section>' +
    '<p><a href="/offline.html">← All saved campaigns</a></p></main></body></html>';
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isCampaignApi(url)) {
    event.respondWith((async function () {
      try {
        const response = await fetch(request);
        if (response.ok && (response.headers.get("content-type") || "").includes("application/json")) {
          try { await saveCampaignPayload(await response.clone().json()); } catch (_error) { /* keep the online response usable */ }
        }
        return response;
      } catch (_error) {
        return offlineCampaignResponse(url);
      }
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async function () {
      try {
        return await fetch(request);
      } catch (_error) {
        const match = url.pathname.match(/^\/campaigns\/([^/]+)$/);
        if (match) {
          try {
            const id = decodeURIComponent(match[1]);
            const savedCampaign = await getSavedCampaign(id);
            if (savedCampaign) return offlineCampaignPage(savedCampaign);
          } catch (_storageError) {
            // Fall through to the offline campaign list if storage is unavailable.
          }
        }
        return (await caches.match(OFFLINE_URL)) || new Response("You're offline. Open /offline.html to view saved campaigns.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  const isStaticAsset = url.pathname.indexOf("/_next/static/") === 0 ||
    ["script", "style", "image", "font", "worker"].includes(request.destination);
  if (!isStaticAsset) return;

  event.respondWith((async function () {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_error) {
      return cached || Response.error();
    }
  })());
});