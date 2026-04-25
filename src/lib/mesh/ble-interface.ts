// NEDA BLE Mesh Adapter Contract
// ==============================
// This file defines the surface a real Bluetooth Low Energy transport must
// implement so the rest of the app can stay transport-agnostic.
//
// Reference implementations:
//   • BitChat:           https://github.com/permissionlesstech/bitchat
//   • Bridgefy SDK:      https://bridgefy.me
//   • Briar (Tor+BT):    https://briarproject.org
//
// Recommended Android stack:
//   • react-native-ble-plx (Central)         — scan + GATT client
//   • react-native-ble-advertiser (Peripheral) — advertise NEDA service UUID
//   • Foreground service to keep BLE alive when screen is off
//
// Recommended iOS stack:
//   • CoreBluetooth via react-native-ble-manager
//   • Background modes: bluetooth-central, bluetooth-peripheral

import type { MeshPacket, MeshPeer } from "./protocol";

export interface BLEMeshAdapter {
  /** Begin advertising the NEDA service UUID so other phones can discover us. */
  startAdvertising(): Promise<void>;

  /** Begin scanning for nearby NEDA peers. */
  startScanning(): Promise<void>;

  /** Stop both advertising and scanning. */
  stop(): Promise<void>;

  /** Subscribe to peer discovery events (called for every new advertisement). */
  onPeerDiscovered(handler: (peer: MeshPeer) => void): () => void;

  /** Send a packet to a specific peer (or broadcast if peerId omitted). */
  sendPacket(packet: MeshPacket, peerId?: string): Promise<void>;

  /** Subscribe to inbound packets from any peer. */
  onPacketReceived(handler: (packet: MeshPacket, fromPeerId: string) => void): () => void;

  /** Best-effort connectivity status. */
  isReady(): boolean;
}

/**
 * Stub adapter used during the hackathon. All methods are no-ops; the actual
 * transport in this prototype is Supabase Realtime (see ChatView).
 */
export const NoopBLEAdapter: BLEMeshAdapter = {
  async startAdvertising() {},
  async startScanning() {},
  async stop() {},
  onPeerDiscovered() {
    return () => {};
  },
  async sendPacket() {},
  onPacketReceived() {
    return () => {};
  },
  isReady() {
    return false;
  },
};
