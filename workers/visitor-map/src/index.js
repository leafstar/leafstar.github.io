export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === "/visitors" && request.method === "GET") {
      return handleGet(env);
    }

    if (url.pathname === "/visitors" && request.method === "POST") {
      return handlePost(request, env);
    }

    return json({ error: "Not found" }, 404, env);
  }
};

async function handleGet(env) {
  const { results } = await env.DB.prepare(
    `SELECT
      city,
      region,
      country,
      lat,
      lon,
      visit_count AS count,
      last_seen
    FROM visitor_locations
    ORDER BY visit_count DESC, last_seen DESC`
  ).all();

  return json(results || [], 200, env);
}

async function handlePost(request, env) {
  const cf = request.cf || {};
  const city = cleanText(cf.city);
  const region = cleanText(cf.region);
  const country = cleanText(cf.country);
  const lat = toNumber(cf.latitude);
  const lon = toNumber(cf.longitude);

  if (!country || lat === null || lon === null) {
    return json(
      { ok: false, skipped: true, reason: "Location data unavailable for this request." },
      202,
      env
    );
  }

  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO visitor_locations (city, region, country, lat, lon, visit_count, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(city, region, country, lat, lon)
     DO UPDATE SET
       visit_count = visitor_locations.visit_count + 1,
       last_seen = excluded.last_seen`
  )
    .bind(city, region, country, lat, lon, now, now)
    .run();

  return json({ ok: true }, 200, env);
}

function cleanText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(payload, status, env) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: corsHeaders(env)
  });
}
