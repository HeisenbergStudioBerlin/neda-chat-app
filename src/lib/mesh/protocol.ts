// NEDA Mesh Protocol Layer
// =========================
// Hackathon prototype: types & contracts for a TTL-flooded peer-to-peer mesh.
//
// Production target: Android BLE Central + Peripheral via react-native-ble-plx,
// or native Kotlin (BluetoothLeAdvertiser + BluetoothLeScanner + GATT). iOS uses
// CoreBluetooth (CBCentralManager + CBPeripheralManager).
// See BitChat architecture: https://github.com/permissionlesstech/bitchat

/** A single packet flooded through the mesh. */
export interface MeshPacket {
  /** Globally-unique packet id (uuid v4). Used for de-duplication on relay. */
  id: string;
  /** Sender user_code, e.g. "@sam4805". */
  sender: string;
  /** Recipient user_code, group id, or "*" for broadcast. */
  recipient: string;
  /** Payload (≤ 100 chars in NEDA). May be ciphertext when encrypted=true. */
  content: string;
  /** Time-to-live. Starts at MAX_TTL (7), decremented on each relay hop. */
  ttl: number;
  /** Ordered list of peer ids that have already forwarded this packet. */
  hops: string[];
  /** Origin timestamp (ms since epoch). */
  timestamp: number;
  /** True if `content` is ciphertext (Noise Protocol in production). */
  encrypted: boolean;
}

/** A peer discovered over BLE / simulated transport. */
export interface MeshPeer {
  /** Stable peer id (in NEDA, the user_code). */
  id: string;
  /** Last time we heard an advertisement from this peer (ms). */
  lastSeen: number;
  /** RSSI-derived signal strength, 0..1 (1 = strongest). */
  signalStrength: number;
  /** How many packets this peer has relayed for us. */
  relayCount: number;
}

/** Network abstraction. Implemented by the simulator and the BLE adapter. */
export interface MeshNetwork {
  peers: MeshPeer[];
  /** Send a fresh packet onto the mesh. */
  broadcast(packet: MeshPacket): Promise<void>;
  /** Forward a received packet (decrement TTL, dedupe, re-broadcast). */
  relay(packet: MeshPacket): Promise<void>;
  /** Trigger / refresh peer discovery. */
  discover(): Promise<MeshPeer[]>;
}

/** Maximum number of hops a packet may traverse before being dropped. */
export const MAX_TTL = 7;

/** Helper: build a fresh packet at the origin. */
export function createPacket(args: {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  encrypted?: boolean;
}): MeshPacket {
  return {
    id: args.id,
    sender: args.sender,
    recipient: args.recipient,
    content: args.content,
    ttl: MAX_TTL,
    hops: [],
    timestamp: Date.now(),
    encrypted: args.encrypted ?? false,
  };
}

/**
 * Deterministic hop count for UI display, derived from the message id.
 * Range: 1..7. Same id always yields the same number — gives the impression
 * of a stable mesh path without requiring real telemetry.
 */
export function simulatedHopCount(messageId: string): number {
  let h = 0;
  for (let i = 0; i < messageId.length; i++) {
    h = (h * 31 + messageId.charCodeAt(i)) >>> 0;
  }
  return (h % 7) + 1;
}
