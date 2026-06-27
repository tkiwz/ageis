/**
 * AEGIS sound library — synthesized alerts via Web Audio API.
 * No external assets. Works offline.
 *
 * Usage:
 *   import { playSound } from "@/lib/sound";
 *   playSound("critical");
 *   playSound("notification");
 */

export type SoundName =
  | "critical"       // CRITICAL incidents/leaks — urgent 3-beep alarm
  | "warning"        // WARNING level — single mid beep
  | "info"           // INFO notification — soft chirp
  | "success"        // confirmations, approvals — rising tone
  | "error"          // failures, rejections — falling tone
  | "siren"          // active emergency — pulsing alarm
  | "click"          // UI click feedback — short blip
  | "wellness"       // worker wellness alert — distinct rising pattern
  | "leak"           // pipeline leak — gas-hiss + alarm
  | "voice-ready"    // mic activated — friendly ping
  | "voice-done";    // voice action completed — chord

let ctx: AudioContext | null = null;
let muted = false;
let masterVolume = 0.5;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = Win.AudioContext || Win.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // Some browsers suspend the context until a user gesture
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

interface ToneOptions {
  freq: number;
  duration: number;       // seconds
  delay?: number;         // seconds from now
  gain?: number;          // 0-1 multiplier of master
  type?: OscillatorType;
  attack?: number;        // envelope attack (s)
  release?: number;       // envelope release (s)
  freqEnd?: number;       // glide to this freq
}

function tone({ freq, duration, delay = 0, gain = 1.0, type = "sine", attack = 0.005, release = 0.05, freqEnd }: ToneOptions) {
  const c = getCtx();
  if (!c) return;
  const start = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), start + duration);
  }

  const peak = gain * masterVolume;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + attack);
  g.gain.setValueAtTime(peak, start + duration - release);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(g);
  g.connect(c.destination);

  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noise({ duration, delay = 0, gain = 0.4, filterFreq = 4000 }: {
  duration: number; delay?: number; gain?: number; filterFreq?: number;
}) {
  const c = getCtx();
  if (!c) return;
  const start = c.currentTime + delay;
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = c.createBufferSource();
  source.buffer = buf;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;

  const g = c.createGain();
  const peak = gain * masterVolume;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  source.start(start);
  source.stop(start + duration);
}

// ──────────────────────────────────────────────────────────
// Sound presets
// ──────────────────────────────────────────────────────────

const PLAYERS: Record<SoundName, () => void> = {
  // Three-beep alarm at 1200Hz — classic warning
  critical: () => {
    tone({ freq: 1200, duration: 0.18, gain: 0.7, type: "square" });
    tone({ freq: 1200, duration: 0.18, gain: 0.7, type: "square", delay: 0.25 });
    tone({ freq: 1400, duration: 0.35, gain: 0.7, type: "square", delay: 0.5 });
  },
  // Single mid beep
  warning: () => {
    tone({ freq: 880, duration: 0.25, gain: 0.55, type: "triangle" });
  },
  // Soft 2-note chirp — friendly
  info: () => {
    tone({ freq: 660, duration: 0.08, gain: 0.4, type: "sine" });
    tone({ freq: 880, duration: 0.12, gain: 0.4, type: "sine", delay: 0.08 });
  },
  // Rising 3rd interval — success
  success: () => {
    tone({ freq: 523, duration: 0.12, gain: 0.45, type: "sine" });
    tone({ freq: 659, duration: 0.12, gain: 0.45, type: "sine", delay: 0.1 });
    tone({ freq: 784, duration: 0.22, gain: 0.5, type: "sine", delay: 0.2 });
  },
  // Falling tone — error
  error: () => {
    tone({ freq: 440, duration: 0.4, gain: 0.5, type: "sawtooth", freqEnd: 220 });
  },
  // Pulsing emergency siren — alternating two pitches
  siren: () => {
    tone({ freq: 700, duration: 0.4, gain: 0.6, type: "square", freqEnd: 1000 });
    tone({ freq: 1000, duration: 0.4, gain: 0.6, type: "square", delay: 0.4, freqEnd: 700 });
    tone({ freq: 700, duration: 0.4, gain: 0.6, type: "square", delay: 0.8, freqEnd: 1000 });
  },
  // Short blip
  click: () => {
    tone({ freq: 1500, duration: 0.04, gain: 0.25, type: "sine" });
  },
  // Wellness — distinctive descending chord
  wellness: () => {
    tone({ freq: 698, duration: 0.18, gain: 0.5, type: "triangle" });
    tone({ freq: 587, duration: 0.18, gain: 0.5, type: "triangle", delay: 0.15 });
    tone({ freq: 494, duration: 0.3, gain: 0.55, type: "triangle", delay: 0.3 });
  },
  // Pipeline leak — gas hiss + low alarm
  leak: () => {
    noise({ duration: 0.6, gain: 0.35, filterFreq: 2500 });
    tone({ freq: 400, duration: 0.4, gain: 0.5, type: "sawtooth", delay: 0.1, freqEnd: 600 });
    tone({ freq: 400, duration: 0.4, gain: 0.5, type: "sawtooth", delay: 0.55, freqEnd: 600 });
  },
  // Mic activated — neutral ping
  "voice-ready": () => {
    tone({ freq: 880, duration: 0.12, gain: 0.4, type: "sine" });
  },
  // Voice action done — happy two-note
  "voice-done": () => {
    tone({ freq: 784, duration: 0.1, gain: 0.4, type: "sine" });
    tone({ freq: 1047, duration: 0.18, gain: 0.45, type: "sine", delay: 0.08 });
  },
};

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

export function playSound(name: SoundName): void {
  if (muted) return;
  const player = PLAYERS[name];
  if (player) {
    try { player(); } catch { /* swallow audio errors */ }
  }
}

/** Convenience: pick the right sound for a severity label. */
export function playForSeverity(severity: string | null | undefined): void {
  if (!severity) return playSound("info");
  switch (severity.toUpperCase()) {
    case "CRITICAL": return playSound("critical");
    case "HIGH":     return playSound("warning");
    case "MEDIUM":   return playSound("warning");
    case "WARNING":  return playSound("warning");
    case "LOW":      return playSound("info");
    case "INFO":     return playSound("info");
    default:         return playSound("info");
  }
}

/** Pick a sound by alert type (LEAK/INCIDENT/etc.) — used by the global listener. */
export function playForType(type: string | null | undefined, severity?: string | null): void {
  if (!type) return playForSeverity(severity);
  const t = type.toUpperCase();
  if (t.includes("LEAK")) return playSound("leak");
  if (t.includes("EMERGENCY") || t.includes("EVACUATION")) return playSound("siren");
  if (t.includes("WELLNESS") || t.includes("HEAT") || t.includes("H2S")) return playSound("wellness");
  return playForSeverity(severity);
}

// ── Mute / volume controls (persisted in localStorage) ────

const MUTE_KEY = "aegis-sound-muted";
const VOLUME_KEY = "aegis-sound-volume";

export function isMuted(): boolean {
  if (typeof window === "undefined") return muted;
  if (muted) return true;
  return window.localStorage?.getItem(MUTE_KEY) === "1";
}

export function setMuted(value: boolean): void {
  muted = value;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(MUTE_KEY, value ? "1" : "0"); } catch { /* ignore */ }
  }
}

export function getMasterVolume(): number {
  if (typeof window !== "undefined") {
    const stored = window.localStorage?.getItem(VOLUME_KEY);
    if (stored) {
      const n = parseFloat(stored);
      if (!isNaN(n) && n >= 0 && n <= 1) masterVolume = n;
    }
  }
  return masterVolume;
}

export function setMasterVolume(v: number): void {
  masterVolume = Math.max(0, Math.min(1, v));
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(VOLUME_KEY, String(masterVolume)); } catch { /* ignore */ }
  }
}

// Initialise from storage on module load (client only)
if (typeof window !== "undefined") {
  if (window.localStorage?.getItem(MUTE_KEY) === "1") muted = true;
  const v = window.localStorage?.getItem(VOLUME_KEY);
  if (v) {
    const n = parseFloat(v);
    if (!isNaN(n)) masterVolume = Math.max(0, Math.min(1, n));
  }
}
