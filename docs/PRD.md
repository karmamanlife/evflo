EVFLO
EV Charging SaaS Platform
Product Requirements Document (PRD)
Version	0.1 — Draft
Status	In Progress
Author	Shoan
Date	28 February 2026
Scope	Phase 1 — Strata Proof of Concept


1. Overview
EVFLO is a SaaS-based Electric Vehicle (EV) Charge Point Operator (CPO) platform purpose-built for the Australian market. It enables strata buildings and hotels to offer smart, monetised EV charging to residents and guests at a fraction of the cost of traditional fast-charger infrastructure.
The platform converts standard 10A/15A general purpose outlets (GPOs) into managed charging points using low-cost smart hardware (Shelly + IPD GPO), a custom OCPP middleware layer, and a cloud-based billing and session management system.
EVFLO earns revenue through a per-kWh platform margin on top of the site's existing energy costs, plus a monthly SaaS fee per site. Revenue collected flows through EVFLO and is distributed to site hosts (strata bodies, hotels) on a monthly basis.

2. Problem Statement
Building owners and strata committees are under increasing pressure to provide EV charging as EV adoption accelerates across Australia. National Building Code (NCC) 2022 and NCC 2025 are reshaping infrastructure expectations for residential and commercial buildings.
The existing solutions are expensive, complex to install, and locked to proprietary hardware ecosystems. A typical Level 2 charger installation costs thousands of dollars per bay — unworkable for a strata body managing a shared car park on a fixed budget.
EVFLO solves this by delivering a fully managed, monetised charging service using hardware that costs a fraction of traditional solutions, installed into existing electrical infrastructure with minimal disruption.

3. Goals
3.1 Business Goals
•	Deploy 1,000 charging points across 170 sites in Year 1
•	Establish recurring revenue through kWh margin and SaaS fees
•	Build a defensible network of managed charging locations as acquisition asset
•	Target $165M exit at 5x revenue multiple via strategic acquirer (oil major or energy company)
3.2 Product Goals — Phase 1 (POC)
•	Demonstrate end-to-end charging session: QR scan → session start → live metering → session stop → billing record
•	Validate hardware stack: Shelly 1 Gen 4 + IPD GPO in real-world conditions
•	Prove payment robustness: account-based billing via Stripe, post-session charge
•	Demonstrate fault detection: power interruption flagged, session paused, billing adjusted, manager alerted
•	Produce a demo-ready system for investor and early customer presentations

4. Users
4.1 Strata Resident (Primary End User — Phase 1)
An apartment resident with an EV who parks in a shared basement or outdoor car park. They need a simple, reliable way to charge overnight without friction. They interact with the system via their smartphone by scanning a QR code on the charging cable.
•	Has an EVFLO account with a saved payment method
•	Expects charging to start immediately after scanning
•	Wants transparent billing — kWh used, cost per session, session history
•	Does not want to pay per session at the charger — expects post-session billing to account
4.2 Strata Manager (Site Administrator — Phase 1)
The building manager or strata committee representative responsible for the property. They oversee the charging infrastructure but do not interact with individual sessions. They need visibility into performance and usage across all charging points at their site.
•	Sees per-point metrics: kWh delivered, session duration, revenue generated
•	Sees aggregate site metrics: total power demand, total sessions, total revenue
•	Receives alerts when a charging point faults or goes offline
•	Receives monthly revenue reconciliation from EVFLO
4.3 Hotel Guest / Valet (Phase 2 — Out of Scope for POC)
Hotel flow requires integration with property management systems (PMS) for room-based billing and valet activation workflows. This is deferred to Phase 2 and will be documented in a separate PRD addendum.

5. Core User Flow — Strata Resident
Pre-requisite: Account Setup
•	Resident receives onboarding invite from strata manager or EVFLO directly
•	Creates EVFLO account via web app (name, email, unit number)
•	Adds payment method via Stripe (card on file)
•	Account is linked to their designated parking bay
Charging Session Flow
•	Resident arrives at parking bay and plugs EV into the charging cable
•	Scans QR code fixed to the charging cable with their smartphone camera
•	Browser opens EVFLO web app session page (no app download required)
•	System authenticates resident via session token or SMS verification
•	Resident confirms session start — relay activates, charging begins
•	Live session data displayed: kWh delivered, estimated cost, elapsed time
•	Session ends when resident taps Stop, or optionally auto-stops after a configurable duration
•	Post-session: Stripe charges saved card for kWh consumed at site rate
•	Resident receives session summary via email or SMS
Fault Mid-Session
•	Middleware detects wattage drop to zero while session is marked active
•	Session flagged as Interrupted in system
•	Billing clock pauses — resident not charged for outage period
•	When power restores, session resumes automatically
•	Strata manager receives alert: point ID, time of fault, duration
•	Session summary reflects actual kWh delivered only

6. System Architecture Summary
The full technical architecture is documented in the Technical Design Document (TDD). A summary is provided here for product context.
6.1 Hardware Layer
•	Shelly 1 Gen 4: smart relay + energy metering per charging bay
•	IPD certified GPO enclosure: regulatory-compliant housing for Australian market
•	One Shelly device per charging bay, one bay per parking space
•	QR code fixed to the physical charging cable
6.2 Middleware Layer
•	Node.js service translating Shelly MQTT messages into OCPP 1.6J protocol
•	Hosted on cloud VPS (DigitalOcean / Hetzner)
•	MQTT broker (Mosquitto) for device communication
•	OCPP server presenting each Shelly as a standard-compliant charger
6.3 Application Layer
•	Web app frontend: React, mobile-first, QR-code entry point
•	Backend API: Node.js / Express, session management, billing triggers
•	Supabase: database, authentication, real-time session state
•	Stripe: payment processing, account billing, payout management
6.4 Dashboard
•	Strata manager dashboard: per-point and site-level metrics
•	Session history, kWh, revenue, fault log
•	Alert system: email/SMS notifications for faults and offline events

7. Revenue Model
7.1 Per-kWh Platform Margin
EVFLO sets the kWh rate for each site before installation. The rate covers the site's energy cost plus EVFLO's platform margin. The margin is reviewed periodically and set contractually per site.
•	Strata sites: lower platform margin (strata body also receives a share)
•	Hotel sites: higher platform margin (Phase 2)
7.2 SaaS Fee
Monthly per-site subscription covering platform access, dashboard, billing, support, and software updates.
7.3 Payment Flow
•	Resident pays EVFLO directly via Stripe post-session
•	EVFLO retains platform margin
•	Site host (strata body) receives monthly payout of their revenue share
•	Reconciliation report provided to site host each month

8. Out of Scope — Phase 1
•	Hotel guest flow and PMS integration
•	Level 2 / DC fast charging hardware
•	OCPP roaming and third-party network interoperability
•	Mobile app (native iOS / Android)
•	Energy retail licensing
•	Fleet management
•	Grid services / demand response

9. Success Criteria — Proof of Concept
The POC is considered successful when the following can be demonstrated end-to-end in a live environment:
•	QR code scan initiates an authenticated session without friction
•	Shelly relay activates and metering data flows to the dashboard in real time
•	Session stop triggers a Stripe charge to the resident's saved card
•	A simulated power interruption is detected, billing pauses, and the manager dashboard shows a fault alert
•	Session history is accurate and complete in the strata manager dashboard
•	The system recovers and resumes a session automatically after power restoration

10. Assumptions and Constraints
•	All charging points operate on existing 10A/15A GPO infrastructure — no new electrical circuits required for Phase 1
•	Shelly devices connect via site Wi-Fi — stable Wi-Fi coverage in car parks is assumed
•	All hardware must be installed by a licensed electrician
•	kWh rate is fixed per site and set before installation — dynamic pricing is out of scope for Phase 1
•	Residents must have a smartphone with a camera and a modern mobile browser
•	Stripe is available and approved for use in Australia for this use case

11. Open Questions
•	Hotel Phase 2: What is the exact integration point with hotel PMS — room charge, direct card, or EVFLO account?
•	Hotel Phase 2: What is the valet activation flow — staff app, PIN, or RFID?
•	Load management: What is the maximum number of simultaneous sessions per site before load balancing rules are required?
•	Payout: What is the strata body revenue share percentage — is this fixed or negotiated per site?
•	Regulatory: Are there any additional licensing or compliance requirements for operating as a CPO in specific Australian states?

EVFLO — Confidential — v0.1 Draft
