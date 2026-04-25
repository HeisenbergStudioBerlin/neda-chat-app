# NEDA — Need A Voice

> We are building something here for people at the end of the world who cannot be here with us. If they were here, they would build exactly this. So we build it in their name.

---

> "For there is always light, if only we're brave enough to see it." — Amanda Gorman

## What is NEDA?

NEDA (ندا, "voice" in Farsi) is an offline-first messaging app designed to work during internet shutdowns. When governments kill the internet, NEDA keeps people connected through device-to-device mesh networking via Bluetooth Low Energy. No servers. No internet. Just people.

Named after Neda Agha-Soltan, shot during Iran's Green Movement protests in 2009. Her death, captured on video, became a symbol of the fight for freedom of expression.

## The Problem

In 2025 alone, 313 internet shutdowns were documented across 52 countries — the highest number ever recorded. In January 2026, Iran shut down the internet for 53 consecutive days, the longest blackout in history. $35.7 million in losses per day. 500,000 businesses destroyed overnight. 9 million people affected.

WhatsApp, Telegram, Signal — all dead. Because they all require internet. Iran has published a long-term plan for "Absolute Digital Isolation." The problem is getting worse, not better.

## How It Works

### Mesh Networking (BLE)

NEDA uses a flooding-based mesh protocol where each device acts as both sender and relay:

1. User A sends a message
2. The message is broadcast via Bluetooth to all nearby devices (~10-100m range)
3. Each receiving device re-broadcasts (relays) the message
4. Messages hop up to 7 times (MAX_TTL), reaching ~700m-7km
5. Duplicate packets are dropped via packet ID tracking

### The Vision: 30 Million Bluetooths

Tehran has 30 million people in a metropolitan area that takes 6 hours to drive from south to north. If 30 million people turn on their Bluetooth, a message can travel from the south of the city to the north in minutes. The higher the density, the faster messages propagate from one phone to the next. Every device becomes a cell tower. Every person becomes the network.

Architecture files in the codebase:
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
| Translation | Google Gemini 2.5 Flash | Auto-translate messages across 121 languages |
| Threat Detection | Tavily Search API | Detect active internet shutdowns by country |
| Mesh Protocol | BLE interfaces | Device-to-device communication (designed, not yet active) |
| Distribution | PWA | Installable via link, no App Store needed |

## Features

### Auto-Translation (Google Gemini)
Messages are automatically translated into the recipient's language. Supports 121 languages — from Farsi, Arabic, Kurdish, and Urdu to Chinese, French, and German. Powered by Google Gemini 2.5 Flash via Lovable AI Gateway. An Iranian writes in Farsi, a German reads in German. Without pressing a single button.

### Shutdown Detection (Tavily)
On app start and every 10 minutes, NEDA queries the Tavily Search API for active internet shutdowns in the user's country. If detected, a red pulsing banner warns: "INTERNET SHUTDOWN DETECTED" with a link to the source.

### Danger Radar
Canvas-based military-style radar with:
- Real compass integration (DeviceOrientation API), N/E/S/W rotate to true north
- OpenStreetMap street map background (dark theme via CSS filters)
- Crowd-sourced danger reports (red pulsing dots)
- Simulated NEDA peers (cyan dots, always 3x more than threats)
- Simulated threats that randomly appear and fade
- 5km radius, real-time via Supabase
- Sweep line with phosphor afterglow (CRT effect)
- HUD with coordinates, heading, threat count, and peer count

### QR Verification
Peer-to-peer identity verification via QR code scanning. Two tabs: "My QR" (displays your @name as QR) and "Scan" (camera with jsQR decoder). Manual input field as fallback. After a successful scan, a chat with the verified user opens automatically.

### App Distribution Without Internet
NEDA is designed to spread itself without internet:
- Via Bluetooth (OBEX/RFCOMM): Send the APK directly from device to device
- Via WiFi Direct: Higher bandwidth alternative for large files
- Via USB/SD card: Copy the APK to physical media
- Via QR/Link: Download link (requires internet on receiver)

The app includes a share function with simulated BT/WiFi transfer for the demo. The native Android version will implement actual file transfer. One person with NEDA can distribute it to everyone around them. Like wildfire.

### Panic Mode
Triple-tap the NEDA header to instantly wipe all local data (localStorage, identity, messages). For situations where device seizure is imminent.

### Groups
Automatic groups by country (e.g. #iran, #germany) plus custom groups. Join and leave with a single tap.

## Database Schema

- `users` — identity, country, language, bluetooth status
- `messages` — content, translations (JSONB), sender/recipient/group
- `groups` — country-based auto-groups + custom groups
- `group_members` — join/leave tracking
- `danger_reports` — geo-located, 2-hour auto-expiry

## Security

- No accounts, no passwords, no phone numbers
- Ephemeral identities (@name1234 format, randomly generated)
- Panic Mode for instant data destruction
- Messages are not end-to-end encrypted in this prototype (noted for production roadmap)
- Production version would use Noise Protocol encryption (referenced in simulator.ts)

## Why NEDA Is Different From BitChat

1. Localization: Farsi-first, RTL support, 121 languages with auto-translation
2. Danger Radar: Crowd-sourced warning system with street map (no equivalent in BitChat)
3. Panic Mode: Instant data destruction when in danger
4. Shutdown Detection: Automatic detection of internet shutdowns via Tavily
5. App Distribution: Can spread itself via BT/WiFi without internet
6. Country Groups: Instantly connected with people in the same country

## Hackathon Context

Built solo at BigBerlinHack 2026 (April 25-26, Berlin). Wildcard track. Uses three partner technologies: Lovable, Google Gemini, and Tavily.

## The Numbers

- 313 shutdowns across 52 countries (2025)
- 53 consecutive days: Iran's shutdown, January 2026
- $35.7M in losses per day
- $1.8B in the first month alone
- 500,000 businesses destroyed
- 9 million people affected
- 2.8M Psiphon connection attempts in a single day from Iran
- 48,000 BitChat downloads in one week (Nepal, Sep 2025)

## Bundle Size

- Client code (JS + CSS, gzipped): ~248 kB
- With radar map tile: ~712 kB total
- Designed to load fast even on throttled connections

---

*They can take our internet. Our GSM towers. But they cannot take our phones. Not our Bluetooths. And definitely not our voices.*

---

*Built with determination by Pedram @ Heisenberg Studio Berlin*
