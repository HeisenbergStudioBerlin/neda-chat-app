// Lightweight notification helpers — vibrate + short beep using WebAudio.
// All calls are no-ops on the server.

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

export function vibrate(pattern: number | number[] = [40, 60, 40]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  try {
    nav.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export function beep(freq = 880, durationMs = 120, volume = 0.08): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.stop(now + durationMs / 1000 + 0.02);
  } catch {
    // ignore
  }
}

export function notifyIncoming(): void {
  vibrate([30, 50, 30]);
  beep(740, 90);
  setTimeout(() => beep(980, 110), 110);
}
