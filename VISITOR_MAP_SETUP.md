# Visitor Map Setup

This site can now load visitor markers from a small Cloudflare Worker API and fall back to local sample data when the API is not configured.

## What it does

- `GET /visitors` returns the aggregated visitor locations for the map
- `POST /visitors` records the requesting visitor's approximate location using Cloudflare's geolocation data
- The homepage map reads these entries and shows them as pins

## Why Cloudflare Worker

GitHub Pages is static, so it cannot record visitor locations by itself. A Worker is a lightweight companion backend that can sit in front of a small D1 database and expose exactly the JSON the homepage needs.

## Files

- `workers/visitor-map/src/index.js`: Worker API
- `workers/visitor-map/schema.sql`: D1 table schema
- `workers/visitor-map/wrangler.toml.example`: Worker configuration template
- `_config.yml`: site settings for the API URLs

## Deploy

1. Create a Cloudflare D1 database named `visitor-map`.
2. Apply `workers/visitor-map/schema.sql` to that database.
3. Copy `workers/visitor-map/wrangler.toml.example` to `workers/visitor-map/wrangler.toml`.
4. Replace `database_id` with your real D1 database id.
5. Set `ALLOWED_ORIGIN` to your site URL if it differs from `https://leafstar.github.io`.
6. Deploy the Worker so it exposes `https://your-worker-domain/visitors`.
7. In `_config.yml`, set:

```yml
visitor_map:
  read_url: "https://your-worker-domain/visitors"
  submit_url: "https://your-worker-domain/visitors"
```

8. Rebuild and publish the Jekyll site.

## Notes

- The Worker stores approximate location only, not IP addresses.
- If Cloudflare cannot determine a visitor location, the request is skipped gracefully.
- The homepage still works without the Worker because it falls back to `_data/visitor_locations.yml`.
