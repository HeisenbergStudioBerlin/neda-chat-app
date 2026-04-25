// NEDA Mesh Simulator
// ===================
// HACKATHON: Simulated via Supabase Realtime. Production: BLE mesh with
// TTL-based flooding, max 7 hops, Noise Protocol encryption (XX handshake),
// per-peer session keys, and store-and-forward for offline recipients.

import {
  MAX_TTL,
  createPacket,
  simulatedHopCount,
  type MeshNetwork,
  type MeshPacket,
  type MeshPeer,
} from "./protocol";

/** Random anonymous-looking peer ids used to fill the simulated hop trail. */
const FAKE_PEER_POOL: readonly string[] = [
  "@relay7720", "@relay3018", "@relay9981", "@relay4421", "@relay1102",
  "@relay8830", "@relay5567", "@relay6649", "@relay2218", "@relay7714",
];

function pickFakePeers(count: number, seed: string): string[] {
  // Deterministic pseudo-shuffle keyed by `seed` so the same packet always
  // shows the same trail.
  const out: string[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < count; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    out.push(FAKE_PEER_POOL[h % FAKE_PEER_POOL.length]);
  }
  return out;
}

export class MeshSimulator implements MeshNetwork {
  peers: MeshPeer[] = [];

  async broadcast(packet: MeshPacket): Promise<void> {
    // In a real BLE mesh, this would advertise the packet to all peers in range.
    // Here, the actual transport is Supabase Realtime — see ChatView.
    void packet;
  }

  async relay(packet: MeshPacket): Promise<void> {
    if (packet.ttl <= 0) return;
    packet.ttl -= 1;
    // Production: re-advertise to neighbors not in `packet.hops`.
    void packet;
  }

  async discover(): Promise<MeshPeer[]> {
    // Production: scan for BLE advertisements with NEDA service UUID.
    return this.peers;
  }

  /**
   * Build a fake relay trail for a stored message — used by the chat UI to
   * show "@sender ⟶ N peers ⟶ you" badges.
   */
  simulateRelay(message: { id: string; sender: string; recipient: string; content: string }): MeshPacket {
    const hopCount = simulatedHopCount(message.id);
    const packet = createPacket({
      id: message.id,
      sender: message.sender,
      recipient: message.recipient,
      content: message.content,
      encrypted: true, // Production: Noise Protocol XX-pattern.
    });
    packet.hops = pickFakePeers(hopCount, message.id);
    packet.ttl = MAX_TTL - hopCount;
    return packet;
  }
}

export const meshSim = new MeshSimulator();
