EVFLO
EV Charging SaaS Platform
Technical Design Document (TDD)
Version	0.1 — Draft
Status	In Progress
Author	Shoan
Date	28 February 2026
Scope	Phase 1 — Strata Proof of Concept
OCPP Version	OCPP 1.6J
Primary Language	Node.js (JavaScript)
Database	Supabase (PostgreSQL)


1. Architecture Overview
The EVFLO platform is composed of five distinct layers that work together to convert a standard GPO socket into a fully managed, monetised EV charging point. Each layer has a single responsibility and communicates with adjacent layers via well-defined interfaces.

Layer	Responsibility
Hardware	Shelly 1 Gen 4 inside IPD GPO enclosure — relay control and energy metering
MQTT Broker	Receives real-time telemetry from Shelly devices over Wi-Fi
Middleware	Translates Shelly MQTT messages into OCPP 1.6J protocol messages
Application API	Session management, billing triggers, fault detection, dashboard data
Frontend	Mobile web app — QR entry, session control, resident account, manager dashboard

The guiding principle is separation of concerns. The middleware knows nothing about billing. The frontend knows nothing about MQTT. Each layer can be replaced or upgraded without breaking the others.

2. Hardware Layer
2.1 Shelly 1 Gen 4
The Shelly 1 Gen 4 is a smart relay and energy meter installed inside or adjacent to an IPD-certified GPO enclosure. It provides the physical switching and metering capability for each charging bay.
•	Relay: controls power to the GPO (on/off) — maps to OCPP StartTransaction / StopTransaction
•	Metering: reports real-time power (watts) and cumulative energy (kWh) — maps to OCPP MeterValues
•	Connectivity: Wi-Fi (2.4GHz) with TLS-encrypted MQTT communication
•	Protection: configurable current limits and temperature monitoring
•	Local rules: can be configured to auto-cut power on overcurrent without cloud dependency
2.2 IPD GPO Enclosure
The IPD certified GPO unit provides the compliant housing required for Australian electrical safety standards. It allows the Shelly device to be installed behind a certified outlet without voiding compliance. This is a critical requirement — unenclosed Shelly installations are not suitable for commercial or strata deployments.
2.3 QR Code
A weatherproof QR code label is fixed to each charging cable. The QR code encodes a URL in the following format:
https://app.evflo.com.au/session?point=<POINT_ID>
POINT_ID is a unique identifier assigned to each physical charging point at installation time. It is stored in the database and linked to the Shelly device ID, site, and parking bay.
2.4 Deployment Assumption
One Shelly device per GPO socket. One GPO socket per parking bay. All bays on site Wi-Fi. The Shelly device ID (MAC address) is the hardware identifier used throughout the system.

3. MQTT Broker
3.1 Technology Choice
Mosquitto is the chosen MQTT broker for Phase 1. It is lightweight, battle-tested, open source, and runs on a $6/month VPS alongside the middleware. For production scale, migration to AWS IoT Core or HiveMQ Cloud is straightforward as both are MQTT-compatible.
3.2 Topic Structure
Shelly devices publish and subscribe to MQTT topics following this naming convention:
shellies/<DEVICE_ID>/relay/0  (relay state)
shellies/<DEVICE_ID>/relay/0/power  (watts, real-time)
shellies/<DEVICE_ID>/relay/0/energy  (watt-minutes, cumulative)
shellies/<DEVICE_ID>/relay/0/command  (publish ON/OFF to control relay)
3.3 Security
•	MQTT over TLS (port 8883) — all device communication encrypted
•	Username/password authentication per device
•	Devices are provisioned at installation with credentials stored in Supabase
•	Broker rejects unauthenticated connections

4. Middleware Layer
4.1 Purpose
The middleware is the core technical innovation of the EVFLO platform. Shelly devices speak MQTT. OCPP-compliant systems speak OCPP 1.6J over WebSockets. The middleware bridges these two worlds, making each Shelly device appear as a standard OCPP charger to any OCPP-compatible system.
4.2 Technology
•	Runtime: Node.js 20 LTS
•	MQTT client: mqtt.js library
•	OCPP server: ocpp-js or node-ocpp library (OCPP 1.6J)
•	Hosted: VPS (DigitalOcean Droplet or Hetzner Cloud — 2GB RAM minimum)
•	Process manager: PM2 for auto-restart and logging
4.3 OCPP Message Mapping

OCPP Message	Shelly Action
BootNotification	Sent on middleware startup for each registered device
Heartbeat	Sent every 30 seconds per device to confirm connectivity
StartTransaction	Publishes ON to shellies/<ID>/relay/0/command
StopTransaction	Publishes OFF to shellies/<ID>/relay/0/command
MeterValues	Converts Shelly watt-minutes to kWh, forwards on interval
StatusNotification	Derived from relay state and metering data

4.4 Fault Detection Logic
The middleware monitors metering data continuously during active sessions. Fault detection works as follows:
•	Session is marked Active in Supabase when StartTransaction is processed
•	Middleware polls power reading every 10 seconds during active session
•	If power drops to 0W for more than 30 seconds during an active session, fault condition is triggered
•	Middleware updates session status to Interrupted in Supabase
•	Billing timestamp is paused — no kWh accrues during outage
•	Application API sends alert to site manager via email/SMS
•	When power resumes (>0W detected), session status returns to Active
•	Billing resumes from the point of restoration
•	Final session summary reflects only actual kWh delivered
4.5 Device Registry
At startup, the middleware loads all registered Shelly devices from Supabase. Each device record contains the device ID, MQTT credentials, associated point ID, site ID, and current status. The middleware maintains an in-memory map of active sessions keyed by device ID.

5. Application API
5.1 Technology
•	Runtime: Node.js 20 LTS with Express.js
•	Database: Supabase (PostgreSQL with real-time subscriptions)
•	Authentication: Supabase Auth (email/password + magic link)
•	Payments: Stripe (saved payment methods, post-session charge)
•	Notifications: Resend (email) + Twilio (SMS)
•	Hosted: same VPS as middleware, separate PM2 process
5.2 Core API Endpoints

Endpoint	Description
POST /session/start	Authenticate resident, validate point, trigger StartTransaction via middleware
POST /session/stop	Trigger StopTransaction, calculate kWh, initiate Stripe charge
GET /session/:id	Return live session data (kWh, cost, duration, status)
GET /dashboard/site/:id	Return site-level metrics for manager dashboard
GET /dashboard/point/:id	Return per-point metrics and session history
POST /webhook/stripe	Handle Stripe payment confirmation and failure events
POST /webhook/fault	Receive fault events from middleware, trigger manager alert

5.3 Session State Machine
Each charging session moves through the following states:
•	Pending — QR scanned, resident authenticated, awaiting confirmation
•	Active — relay ON, metering running, billing clock started
•	Interrupted — power fault detected, billing paused
•	Stopping — resident or system triggered stop, relay OFF command sent
•	Billing — kWh calculated, Stripe charge initiated
•	Complete — payment confirmed, session record finalised
•	Failed — payment failed or unrecoverable fault
5.4 Billing Logic
Billing is calculated post-session based on actual kWh delivered, excluding any interrupted periods.
total_kwh = sum of all Active period metering readings
session_cost = total_kwh * site_kwh_rate
evflo_margin = session_cost * margin_rate
site_host_share = session_cost - evflo_margin - stripe_fee
All rates are stored per-site in Supabase and set at installation time. Stripe fees are accounted for in the payout calculation.

6. Database Schema
The Supabase PostgreSQL database is the single source of truth for all platform state. Key tables are described below.
6.1 Core Tables

Table	Key Fields
sites	id, name, address, type (strata/hotel), kwh_rate, margin_rate, manager_id
charging_points	id, site_id, device_id (Shelly MAC), bay_number, qr_code_url, status
residents	id, site_id, unit_number, user_id (Supabase Auth), stripe_customer_id
sessions	id, point_id, resident_id, started_at, stopped_at, status, total_kwh, total_cost
session_intervals	id, session_id, started_at, ended_at, kwh, status (active/interrupted)
faults	id, point_id, session_id, detected_at, resolved_at, type
payouts	id, site_id, period_start, period_end, total_kwh, gross_revenue, site_share, status

6.2 Real-Time Subscriptions
Supabase real-time is used to push live session updates to the frontend without polling. The frontend subscribes to changes on the sessions table filtered by the active session ID. This drives the live kWh and cost display during an active charging session.

7. Frontend
7.1 Technology
•	Framework: React (Vite)
•	Styling: Tailwind CSS
•	Mobile-first: optimised for smartphone browser, no native app
•	Hosted: Vercel or Netlify (free tier sufficient for POC)
•	Auth: Supabase Auth client SDK
7.2 Key Views

View	Description
Session Start	Entry point from QR scan. Shows point ID, site name, confirm button.
Active Session	Live kWh counter, elapsed time, estimated cost. Stop button.
Session Complete	Summary: kWh, cost, duration. Receipt link.
Account	Resident profile, saved card, session history.
Manager Dashboard	Site overview: all points, status, total kWh, revenue, faults.
Point Detail	Per-point session history, kWh, revenue, fault log.

7.3 Authentication Flow
Residents authenticate via Supabase magic link (passwordless email) or SMS OTP on first scan. Subsequent scans on the same device use a persisted session token — no re-authentication required. Manager accounts use email/password with Supabase Auth.

8. Infrastructure
8.1 Phase 1 — VPS
All backend services (MQTT broker, middleware, application API) run on a single VPS for POC simplicity. Recommended provider: Hetzner CX21 (2 vCPU, 4GB RAM, €4/month) or DigitalOcean Basic Droplet ($12/month).
•	OS: Ubuntu 22.04 LTS
•	Process manager: PM2 (auto-restart, log management)
•	Reverse proxy: Nginx (routes /api to Express, /ocpp to OCPP WebSocket server)
•	SSL: Let's Encrypt via Certbot (free, auto-renewing)
•	Domain: subdomain of evflo.com.au — e.g. api.evflo.com.au
8.2 Environment Variables
All secrets are stored as environment variables, never in code. Key variables:
SUPABASE_URL, SUPABASE_SERVICE_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
RESEND_API_KEY
EVFLO_KWH_DEFAULT_RATE
8.3 Deployment Process
For Phase 1, deployment is manual via SSH and git pull. A simple deploy script will be maintained in /scripts/deploy.sh. CI/CD via GitHub Actions will be added in Phase 2.

9. Security
•	All HTTP traffic over HTTPS — enforced by Nginx
•	All MQTT traffic over TLS — enforced by Mosquitto configuration
•	API routes protected by Supabase JWT verification middleware
•	Stripe webhook validated by signature header
•	No sensitive data stored in frontend — all secrets server-side only
•	Supabase Row Level Security (RLS) enforced — residents can only access their own sessions
•	Manager accounts have site-scoped access only — cannot see other sites
•	.env files in .gitignore — never committed to repository

10. Build Sequence
The following sequence is the recommended order of development for the POC. Each phase builds on the last and produces a testable output.

Phase	Deliverable
1 — Hardware	Shelly connected to Mosquitto. Relay toggles via MQTT command. Metering data visible in broker logs.
2 — Middleware	Middleware running. Shelly appears as OCPP charger. StartTransaction/StopTransaction working. MeterValues flowing.
3 — Database	Supabase schema created. Device registry populated. Session state machine implemented.
4 — API	Session start/stop endpoints working. Billing calculation correct. Fault detection logic active.
5 — Payments	Stripe integration complete. Post-session charge working against test card. Webhook confirmed.
6 — Frontend	QR → session start → live counter → stop → receipt flow working end-to-end in mobile browser.
7 — Dashboard	Manager dashboard showing live point status, session history, fault alerts.
8 — Demo	Full end-to-end demo including simulated fault and recovery. Ready for investor presentation.


11. Key Dependencies and Decisions

Decision	Rationale
OCPP 1.6J (not 2.0.1)	Wider compatibility, simpler implementation, sufficient for Phase 1 feature set
Supabase over Firebase	PostgreSQL gives proper relational data model for billing; real-time built in; already in use
Stripe over others	Best-in-class saved payment methods; strong Australian support; webhook reliability
VPS over serverless	Persistent WebSocket connections required for OCPP — serverless functions cannot hold long-lived connections
Mosquitto over AWS IoT	Simpler for POC; no AWS account overhead; trivially replaceable at scale
React over Next.js	Simpler deployment for POC; no SSR complexity; Vite is fast to iterate with
Node.js for middleware	Best MQTT and OCPP library ecosystem; single language across stack reduces context switching


EVFLO — Confidential — TDD v0.1 Draft
