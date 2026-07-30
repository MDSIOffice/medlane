const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) },
  });
}

function methodNotAllowed() {
  return json({ error: "Method not allowed" }, { status: 405 });
}

async function storageUsage(env) {
  if (!env.DOCUMENTS_BUCKET) {
    return { configured: false, usedBytes: 0, objectCount: 0, truncated: false };
  }

  let cursor;
  let usedBytes = 0;
  let objectCount = 0;
  let truncated = false;

  do {
    const page = await env.DOCUMENTS_BUCKET.list({ cursor, limit: 1000 });
    for (const object of page.objects) {
      usedBytes += object.size || 0;
      objectCount += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
    truncated = Boolean(page.truncated);
  } while (cursor && objectCount < 10000);

  return { configured: true, usedBytes, objectCount, truncated };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed();
      return json({
        ok: true,
        app: "medlane",
        r2Configured: Boolean(env.DOCUMENTS_BUCKET),
        supabaseUrlConfigured: Boolean(env.SUPABASE_URL),
        supabaseAnonKeyConfigured: Boolean(env.SUPABASE_ANON_KEY),
        supabaseSecretConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      });
    }

    if (url.pathname === "/api/storage/usage") {
      if (request.method !== "GET") return methodNotAllowed();
      const maxBytes = Number(env.MAX_R2_BYTES || 536870912000);
      const usage = await storageUsage(env);
      return json({ ...usage, maxBytes, remainingBytes: Math.max(maxBytes - usage.usedBytes, 0) });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
