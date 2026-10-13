/**
 * Utility to play a crisp, modern bell / chime "ting" sound
 * Uses Web Audio API synthesizer directly (zero network delay, 100% reliable)
 * and HTML5 Audio with ting.wav as parallel/backup.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Pre-unlock audio on user interaction
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

export function playSynthesizedChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: E6 (~1318.5 Hz) crisp bright bell
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.5, now);
    gain1.gain.setValueAtTime(0.5, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.85);

    // Tone 2: B6 (~1975.5 Hz) sparkling ting chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1975.5, now + 0.05);
    gain2.gain.setValueAtTime(0.6, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 1.2);

    // Tone 3: E7 (~2637 Hz) overtone
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(2637, now + 0.05);
    gain3.gain.setValueAtTime(0.25, now + 0.05);
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.05);
    osc3.stop(now + 0.95);
  } catch (err) {
    console.warn('Audio chime error:', err);
  }
}

export function playOrderNotificationSound() {
  // 1. Synthesize bell chime immediately (no network delay, instant feedback)
  playSynthesizedChime();

  // 2. Also attempt playing ting.wav file for extra resonance
  try {
    const soundUrl = `${import.meta.env.BASE_URL}ting.wav`;
    const audio = new Audio(soundUrl);
    audio.volume = 0.9;
    audio.play().catch(() => {});
  } catch {}
}
