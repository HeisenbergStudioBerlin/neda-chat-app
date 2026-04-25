# NEDA — Need A Voice

> We're building something for people at the end of the world who can't be here. If they were here, they'd build exactly this. So we're building it in their name.

**NEDA** (ندا) means "voice" in Persian. It's also the name of Neda Agha-Soltan, shot during Iran's Green Movement in 2009. Her death became a symbol for the fight for free speech.

NEDA is an offline-first messaging app for internet shutdowns. When governments kill the internet, NEDA keeps people connected via Bluetooth mesh networking — device to device, no servers, no internet.

## The Problem

In 2025, **313 internet shutdowns** were documented across **52 countries** — the highest number ever recorded. In January 2026, Iran shut down the internet for **53 consecutive days**, the longest blackout in history.

- **$35.7 million** lost per day
- **500,000 businesses** destroyed overnight
- **9 million people** affected
- **2.8 million** Psiphon connection attempts from Iran in a single day

WhatsApp, Telegram, Signal — all dead. Because they all need the internet. Iran has published a long-term plan for "Absolute Digital Isolation." The problem is getting worse, not better.

## How It Works

### Bluetooth Mesh Networking

Every phone becomes a relay. Your message hops from device to device via Bluetooth:

You → Phone A → Phone B → Phone C → Recipient (10m per hop)

- Range per hop: ~10–100m
- Max hops: 7 (TTL)
- Effective range: ~700m–7km
- Duplicates detected and dropped via packet ID

### The Vision: 30 Million Bluetooths

Tehran has 30 million people in a metro area that takes 6 hours to drive north to south. If 30 million people turn on Bluetooth, a message can travel from the south of the city to the north in minutes. The higher the density, the faster messages propagate. Every device becomes a cell tower. Every person becomes the network.

### Current Implementation

The prototype simulates mesh networking via Supabase Realtime (WebSocket). Each message displays simulated hop counts. The BLE mesh interfaces are production-ready code designed for the native Android build.

This approach is validated: BitChat proved that smartphone-to-smartphone BLE mesh works without additional hardware — 48,000+ downloads during Nepal's internet shutdown in September 2025.

## Features

### Auto-Translation (Google Gemini)
Messages are automatically translated into the recipient's language. Supports **121 languages** — Farsi, Arabic, Kurdish, Urdu, Chinese, and more. Powered by Google Gemini 2.5 Flash. An Iranian writes in Farsi, a German reads in German. Without pressing a button.

### Shutdown Detection (Tavily)
On app launch and every 10 minutes, NEDA checks via the Tavily Search API whether an internet shutdown is active in the user's country. If detected, a red pulsing banner appears: "INTERNET SHUTDOWN DETECTED" with a source link.

### Danger Radar
Canvas-based military-style radar with:
- Real-time compass (DeviceOrientation API)
- OpenStreetMap street map as background (dark theme)
- Crowd-sourced danger reports (red pulsing dots)
- Simulated NEDA peers (cyan dots)
- 5km radius, real-time via Supabase
- Sweep hand with phosphor afterglow (CRT effect)
- HUD with coordinates, heading, threat count, and peer count

### QR Verification
Peer-to-peer identity verification via QR code scan. Two tabs: "My QR" (shows your @name as QR) and "Scan" (camera with jsQR decoder). Manual input as fallback. After a successful scan, a chat with the verified user opens automatically.

### App Distribution Without Internet
NEDA is designed to spread itself without internet:
- Via Bluetooth (OBEX/RFCOMM): send APK device-to-device
- Via WiFi Direct: faster alternative for large files
- Via USB/SD card: copy APK to physical media
- Via QR/Link: download link (requires internet on receiver)

One person with NEDA can pass it to everyone around them. Like wildfire.

### Panic Mode
Triple-tap the NEDA header to instantly wipe all local data (identity, messages, everything). For situations where device confiscation is imminent.

### Country Groups
Automatic groups by country (e.g. #iran, #germany) plus custom groups. Join and leave with one tap.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + TanStack Start | UI framework (via Lovable) |
| Backend | Supabase Realtime | Message relay, user management |
| Translation | Google Gemini 2.5 Flash | Auto-translation into 121 languages |
| Threat Detection | Tavily Search API | Detects active internet shutdowns by country |
| Mesh Protocol | BLE Interfaces | Device-to-device communication (designed, not yet active) |
| Distribution | PWA | Installable via link, no app store needed |

### Partner Technologies (BigBerlinHack 2026)

1. **Lovable** — AI-powered app builder, frontend + Supabase Cloud backend
2. **Google Gemini** — Real-time message translation via Lovable AI Gateway
3. **Tavily** — Internet shutdown detection via search API

## Security

- No accounts, no passwords, no phone numbers
- Ephemeral identities (@name1234 format, randomly generated)
- Panic Mode for instant data destruction
- Production roadmap includes Noise Protocol end-to-end encryption

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

git clone https://github.com/HeisenbergStudioBerlin/neda-chat-app.git
cd neda-chat-app
npm install
npm run dev

The app runs at http://localhost:5173

### Environment

The prototype uses Supabase Realtime via Lovable Cloud. No additional API keys are needed for local development — translation and shutdown detection run through the Lovable AI Gateway and Supabase Edge Functions.

## Live Demo

**Try NEDA: https://neda-chat-app.lovable.app**

Best experienced on mobile (PWA installable).

## The Numbers

| Metric | Value |
|--------|-------|
| Internet shutdowns (2025) | 313 in 52 countries |
| Iran's longest shutdown | 53 days (Jan 2026) |
| Economic loss per day | $35.7 million |
| Loss in first month | $1.8 billion |
| Businesses destroyed | 500,000 |
| People affected | 9 million |
| Psiphon attempts (single day) | 2.8 million from Iran |
| BitChat downloads (Nepal) | 48,000 in one week |

## Hackathon

Solo built at **BigBerlinHack 2026** (April 25–26, Berlin). Wildcard Track.

---

*They can take our internet. Our GSM. But they can't take our phones. Not our Bluetooths. And definitely not our voices.*

---

*Built with determination by Pedram @ Heisenberg Studio Berlin*
