# EVFLO

EVFLO converts standard GPO outlets and OCPP-compliant chargers into managed, billable EV charging points. Targeting long-dwell sites (hotels, strata, tourism, carparks). No app required — drivers pay per kWh via browser, magic link auth, Stripe card capture. Site hosts get a revenue dashboard. EVFLO earns a per-kWh margin on top of retailer energy cost.

---

## Architecture

```
Driver Phone
     │
     ▼
Nginx (evflo.com.au, SSL)
     │
     ├──► React/Vite frontend  (/var/www/evflo/)
     │
     └──► Express API (:3001)  (/opt/evflo/middleware/)
               │
               ├──► Supabase (PostgreSQL)
               ├──► Stripe (PaymentIntents, manual capture)
               ├──► Resend (transactional email)
               ├──► Mosquitto MQTT (:1883) ──► Shelly 1PM Gen4 (Level 1)
               └──► OCPP 1.6J WebSocket (:9000) ──► Sungrow AC22E-01 (Level 2)
```

Every deployed unit uses a **Teltonika RUT241 cellular router** — site WiFi is not trusted.

---

## Tech Stack

- **Frontend:** React 19, Vite 6, Stripe.js
- **Backend:** Node.js, Express, PM2
- **Database:** Supabase (PostgreSQL + PostgREST)
- **Payments:** Stripe (manual capture PaymentIntents)
- **Email:** Resend SDK
- **Level 1 hardware:** Shelly 1PM Gen4 via MQTT
- **Level 2 hardware:** OCPP 1.6J WebSocket (Sungrow AC22E-01)
- **Connectivity:** Teltonika RUT241 cellular router (mandatory per unit)
- **Reverse proxy:** Nginx + Let's Encrypt SSL
- **Process manager:** PM2
- **Infrastructure:** DigitalOcean VPS (`134.199.164.17`)

---

## Local Development Setup

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Fill in .env values (see Environment Variables below)
npm run dev
# Runs at http://localhost:5173
```

### Middleware

```bash
cd middleware
npm install
cp .env.example .env
# Fill in .env values
node index.js
# Or: pm2 start index.js --name evflo-middleware
```

---

## Deployment

**NEVER deploy frontend without verifying the local build first.**

```bash
# Frontend
./deploy.sh frontend

# Middleware
./deploy.sh middleware
```

See `deploy.sh` for the full sequence. The script checks bundle size before deploying frontend and restarts PM2 after middleware deployment.

**Cardinal rule:** The last known production JS bundle is ~287KB. If your local build is more than 5% smaller, stop and investigate before deploying.

---

## Environment Variables

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API base URL (`https://evflo.com.au` in production) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_` or `pk_live_`) |
| `VITE_ADMIN_KEY` | Admin dashboard access key (must match `ADMIN_KEY` in middleware) |

### Middleware (`middleware/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (full DB access — keep secret) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_` or `sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `JWT_SECRET` | Secret for signing magic link JWTs |
| `MQTT_USER` | Mosquitto broker username |
| `MQTT_PASS` | Mosquitto broker password — **MUST be quoted if it contains `#`** |
| `ADMIN_KEY` | Admin dashboard access key — **MUST be quoted if it contains `#`** |
| `OCPP_PORT` | OCPP WebSocket server port (default: `9000`) |
| `OCPP_AUTH_KEY` | Shared auth key for OCPP charger connections (add when first OCPP unit commissioned) |

> ⚠️ **dotenv `#` truncation:** Any `.env` value containing `#` MUST be quoted: `KEY="VALUE#HERE"`. Unquoted values are silently truncated at `#`. This caused a production incident.

---

## Key Decisions & Constraints

- **Closed platform:** No OCPP roaming or interoperability. OCPP is used for hardware control only. Third-party CPO integration is a future additive layer (F11).
- **Teltonika RUT241 is mandatory:** Site WiFi failed at ~7m through brick/concrete during hardware testing. Every deployed unit requires cellular.
- **Magic link auth only:** No user passwords. Drivers authenticate via email magic link (JWT). No password reset flows needed.
- **Stripe manual capture:** PaymentIntents are created with `capture_method: 'manual'`. Energy cost is calculated post-session and captured against the held amount. Cap is $25.
- **dotenv `#` quoting:** See warning above — this is a known footgun.
- **PostgREST schema cache:** After any `ALTER TABLE`, run `NOTIFY pgrst, 'reload schema';` in Supabase SQL editor or inserts will fail.

---

## Docs

- [`docs/technical-review.md`](docs/technical-review.md) — Living technical review: current state, decisions, roadmap
- [`docs/engineering-playbook.md`](docs/engineering-playbook.md) — System contract: schema, endpoints, env vars, runbooks
- [`docs/billing-architecture.md`](docs/billing-architecture.md) — Billing design, Stripe flow, per-kWh formula
- [`docs/go-live-runbook.md`](docs/go-live-runbook.md) — Go-live execution sequence with verification gates