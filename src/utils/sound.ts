/**
 * Utility to play a crisp, modern bell / chime "ting" sound
 * Uses HTML5 Audio with ting.wav as primary and Web Audio API synthesizer as fallback.
 */

function playSynthesizedChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Primary Bell Tone (E6: 1318.5 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.5, now);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.8);

    // Sparkling "Ting" Upper Tone (B6: 1975.5 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1975.5, now + 0.05);
    gain2.gain.setValueAtTime(0.45, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 1.1);

    // Harmonious High Overtone (E7: 2637 Hz)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(2637, now + 0.05);
    gain3.gain.setValueAtTime(0.15, now + 0.05);
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.05);
    osc3.stop(now + 0.9);
  } catch (err) {
    console.warn('Synthesized chime error:', err);
  }
}

export function playOrderNotificationSound() {
  try {
    const soundUrl = `${import.meta.env.BASE_URL}ting.wav`;
    const audio = new Audio(soundUrl);
    audio.volume = 0.85;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback to Web Audio API synthesizer
        playSynthesizedChime();
      });
    }
  } catch {
    playSynthesizedChime();
  }
}
