# NEDA — Architecture Overview

> "For there is always light, if only we're brave enough to see it." — Amanda Gorman

## What is NEDA?

NEDA (ندا, "voice" in Farsi) is an offline-first messaging app designed to work during internet shutdowns. When governments kill the internet, NEDA keeps people connected through device-to-device mesh networking via Bluetooth Low Energy.

## The Problem

In 2025 alone, 313 internet shutdowns were documented across 52 countries. In January 2026, Iran shut down the internet for 53 consecutive days — the longest blackout ever recorded. WhatsApp, Telegram, Signal — all dead. Because they all require internet.

## How It Works

### Mesh Networking (BLE)

NEDA uses a flooding-based mesh protocol where each device acts as both sender and relay:

1. User A sends a message
2. The message is broadcast via Bluetooth to all nearby devices (~10-100m range)
3. Each receiving device re-broadcasts (relays) the message
4. Messages hop up to 7 times (MAX_TTL), reaching ~700m-7km
5. Duplicate packets are dropped via packet ID tracking

Architecture files:
- `src/lib/mesh/protocol.ts` — MeshPacket, MeshPeer, MeshNetwork interfaces
- `src/lib/mesh/simulator.ts` — Cloud-based simulation of mesh relay behavior
- `src/lib/mesh/ble-interface.ts` — BLE adapter interface (production-ready design, references BitChat architecture)

### Current Implementation

The prototype simulates mesh networking via Supabase Realtime (WebSocket). Each message shows simulated hop counts ("@name → 3 peers → you"). The BLE mesh interfaces are production-ready code that can be swapped in when building the native Android app.

This approach is validated: BitChat proved that smartphone-to-smartphone BLE mesh works without additional hardware, reaching 48,000+ downloads during Nepal's internet shutdown in September 2025.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + TanStack Start | UI framework (via Lovable) |
| Backend | Supabase Realtime | Message relay, user management |
| Translation | Google Gemini 2.5 Flash | Auto-translate messages across 6 languages |
| Threat Detection | Tavily Search API | Detect active internet shutdowns by country |
| Mesh Protocol | BLE interfaces | Device-to-device communication (designed, not yet active) |
| Distribution | PWA | Installable via link, no App Store needed |

## Key Features

### Auto-Translation (Gemini)
Messages are automatically translated into the recipient's language. Supports: Farsi, Arabic, German, English, French, Chinese. Powered by Google Gemini via Lovable AI Gateway.

### Shutdown Detection (Tavily)
On app start and every 10 minutes, NEDA queries Tavily for active internet shutdowns in the user's country. If detected, a red pulsing banner warns: "INTERNET SHUTDOWN DETECTED".

### Danger Radar
Canvas-based military-style radar with:
- Real compass integration (DeviceOrientation API)
- OSM street map background (dark theme via CSS filters)
- Crowd-sourced danger reports (red pulsing dots)
- Simulated NEDA peers (cyan dots, always 3x threats)
- 5km radius, real-time via Supabase

### QR Verification
Peer-to-peer identity verification via QR code scanning. Camera-based with jsQR decoder, manual fallback for restricted environments.

### Panic Mode
Triple-tap the NEDA header to instantly wipe all local data (localStorage, identity, messages). For situations where device seizure is imminent.

## Database Schema

- `users` — identity, country, language, bluetooth status
- `messages` — content, translations (JSONB), sender/recipient/group
- `groups` — country-based auto-groups + custom groups
- `group_members` — join/leave tracking
- `danger_reports` — geo-located, 2-hour auto-expiry

## Security Considerations

- No accounts, no passwords, no phone numbers
- Ephemeral identities (@name1234 format)
- Panic Mode for instant data destruction
- Messages are not end-to-end encrypted in this prototype (noted for production roadmap)
- Production version would use Noise Protocol encryption (referenced in simulator.ts)

## Hackathon Context

Built solo at BigBerlinHack 2026 (April 25-26, Berlin). Wildcard track. Uses three partner technologies: Lovable, Google Gemini, and Tavily.

## Named After

Neda Agha-Soltan, shot during Iran's Green Movement protests in 2009. Her death, captured on video, became a symbol of the fight for freedom of expression.

---

*Built with determination by Pedram @ Heisenberg Studio Berlin*
