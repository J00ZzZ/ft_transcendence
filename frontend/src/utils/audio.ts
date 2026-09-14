/* ==========================================================================
   RETRO WAVE ARCADE - WEB AUDIO CHIPTUNE SYNTHESIZER
   ========================================================================== */

export class RetroAudioEngine {
  ctx: AudioContext | null = null;
  isPlaying = false;
  currentTrackIndex = 0;
  timerId: number | null = null;
  noteStep = 0;
  volume = 0.2;
  muted = false;

  tracks = [
    {
      name: "SYNTHWAVE NIGHTS '84",
      tempo: 120,
      scale: [220, 247.0, 261.6, 293.7, 329.6, 349.2, 392.0, 440], // A Minor
      bass: [110, 110, 130.8, 146.8],
    },
    {
      name: 'CYBERPUNK CHIPTUNE PARADISE',
      tempo: 140,
      scale: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3], // C Pentatonic
      bass: [130.8, 130.8, 174.6, 196.0],
    },
    {
      name: '8-BIT ARCADE ADVENTURE',
      tempo: 150,
      scale: [329.6, 392.0, 440.0, 493.9, 523.3, 587.3, 659.3, 784.0], // E Minor
      bass: [164.8, 146.8, 130.8, 164.8],
    },
  ];

  initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        (window.AudioContext as typeof AudioContext | undefined) ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  // Play a retro blip sound for UI buttons
  playUiBeep(freq = 440, duration = 0.08, type: OscillatorType = 'square') {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, this.ctx.currentTime + duration);

      gain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.debug('Audio Context blocked until user gesture.', e);
    }
  }

  // Play Laser Sound FX for arcade games
  playLaserSound() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(this.volume * 1.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  // Play Cyber Slide FX when CyberModal opens
  playCyberSlide() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(740, this.ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(this.volume * 0.7, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  // Play Cyber Accept FX
  playCyberAccept() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(587.3, this.ctx.currentTime);
      osc1.frequency.setValueAtTime(880.0, this.ctx.currentTime + 0.09);
      osc2.frequency.setValueAtTime(1174.6, this.ctx.currentTime + 0.09);

      gain.gain.setValueAtTime(this.volume * 0.8, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.24);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start(this.ctx.currentTime + 0.09);
      osc1.stop(this.ctx.currentTime + 0.24);
      osc2.stop(this.ctx.currentTime + 0.24);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  // Play Cyber Reject FX
  playCyberReject() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(160, this.ctx.currentTime + 0.16);

      gain.gain.setValueAtTime(this.volume * 0.6, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.18);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  // Play subtle plasma ignition sound for Apex badges
  playIgnitionSound() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(360, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(this.volume * 0.45, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.14);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  // Play Explosion FX for arcade games
  playExplosionSound() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const bufferSize = this.ctx.sampleRate * 0.25;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // White noise
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
      filter.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.25);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 1.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start();
      whiteNoise.stop(this.ctx.currentTime + 0.25);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  // Play Retro Printer Chiptune Sound FX
  playPrinterSound() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const pulses = 14;
      for (let i = 0; i < pulses; i++) {
        const startTime = this.ctx.currentTime + i * 0.11;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const pitch = 350 + (i % 4) * 110;
        osc.type = 'square';
        osc.frequency.setValueAtTime(pitch, startTime);
        osc.frequency.linearRampToValueAtTime(pitch * 0.8, startTime + 0.07);

        gain.gain.setValueAtTime(this.volume * 0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.07);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.07);
      }

      this.playUiBeep(1200, 0.12, 'square');
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }

  togglePlay(): boolean {
    this.initContext();
    if (this.isPlaying) {
      this.stop();
    } else {
      this.isPlaying = true;
      this.scheduleNextNote();
    }
    return this.isPlaying;
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  nextTrack(): string {
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.tracks.length;
    this.noteStep = 0;
    return this.tracks[this.currentTrackIndex].name;
  }

  prevTrack(): string {
    this.currentTrackIndex = (this.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;
    this.noteStep = 0;
    return this.tracks[this.currentTrackIndex].name;
  }

  selectTrack(index: number): string {
    this.currentTrackIndex = Math.max(0, Math.min(this.tracks.length - 1, index));
    this.noteStep = 0;
    return this.tracks[this.currentTrackIndex].name;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  scheduleNextNote() {
    if (!this.isPlaying) return;

    const track = this.tracks[this.currentTrackIndex];
    const stepDuration = 60 / track.tempo / 2;

    const melodyIndex = (this.noteStep * 3 + (this.noteStep % 5)) % track.scale.length;
    const freq = track.scale[melodyIndex];

    if (!this.muted) {
      this.playNote(freq, stepDuration * 0.8, 'square', this.volume * 0.6);

      if (this.noteStep % 4 === 0) {
        const bassFreq = track.bass[(this.noteStep / 4) % track.bass.length];
        this.playNote(bassFreq, stepDuration * 1.5, 'triangle', this.volume * 0.8);
      }
    }

    if (
      typeof window !== 'undefined' &&
      (window as unknown as { updateSpectrumBars?: () => void }).updateSpectrumBars
    ) {
      (window as unknown as { updateSpectrumBars?: () => void }).updateSpectrumBars?.();
    }

    this.noteStep++;
    this.timerId = window.setTimeout(() => this.scheduleNextNote(), stepDuration * 1000);
  }

  playNote(freq: number, duration: number, type: OscillatorType, vol: number) {
    try {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.debug('Audio error:', e);
    }
  }
}

export const retroAudio = new RetroAudioEngine();

if (typeof window !== 'undefined') {
  (window as unknown as { retroAudio: typeof retroAudio }).retroAudio = retroAudio;
}
