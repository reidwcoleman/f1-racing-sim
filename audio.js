export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.engineOscillator = null;
        this.engineGain = null;
        this.exhaustOscillator = null;
        this.exhaustGain = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;

        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create engine sound (main tone)
            this.engineOscillator = this.audioContext.createOscillator();
            this.engineOscillator.type = 'sawtooth';
            this.engineOscillator.frequency.setValueAtTime(100, this.audioContext.currentTime);

            this.engineGain = this.audioContext.createGain();
            this.engineGain.gain.setValueAtTime(0.3, this.audioContext.currentTime);

            // Create exhaust sound (lower frequency component)
            this.exhaustOscillator = this.audioContext.createOscillator();
            this.exhaustOscillator.type = 'square';
            this.exhaustOscillator.frequency.setValueAtTime(50, this.audioContext.currentTime);

            this.exhaustGain = this.audioContext.createGain();
            this.exhaustGain.gain.setValueAtTime(0.15, this.audioContext.currentTime);

            // Connect nodes
            this.engineOscillator.connect(this.engineGain);
            this.engineGain.connect(this.audioContext.destination);

            this.exhaustOscillator.connect(this.exhaustGain);
            this.exhaustGain.connect(this.audioContext.destination);

            // Start oscillators
            this.engineOscillator.start();
            this.exhaustOscillator.start();

            this.isInitialized = true;
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    updateEngineSound(rpm, speed) {
        if (!this.isInitialized) {
            this.init();
        }

        if (!this.audioContext) return;

        // Map RPM to frequency (1000-15000 RPM -> 80-800 Hz)
        const engineFreq = 80 + (rpm - 1000) / 14000 * 720;
        const exhaustFreq = engineFreq * 0.5;

        // Smoothly update frequencies
        const currentTime = this.audioContext.currentTime;
        this.engineOscillator.frequency.setTargetAtTime(engineFreq, currentTime, 0.05);
        this.exhaustOscillator.frequency.setTargetAtTime(exhaustFreq, currentTime, 0.05);

        // Volume based on throttle (simulated by speed change)
        const volume = Math.min(0.4, 0.2 + speed / 350 * 0.3);
        this.engineGain.gain.setTargetAtTime(volume, currentTime, 0.05);
        this.exhaustGain.gain.setTargetAtTime(volume * 0.5, currentTime, 0.05);
    }

    playCollisionSound() {
        if (!this.audioContext) return;

        // Create impact sound using noise
        const noiseBuffer = this.audioContext.createBuffer(
            1,
            this.audioContext.sampleRate * 0.1,
            this.audioContext.sampleRate
        );

        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;

        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + 0.1
        );

        noise.connect(noiseGain);
        noiseGain.connect(this.audioContext.destination);

        noise.start();
        noise.stop(this.audioContext.currentTime + 0.1);
    }

    playSkidSound() {
        if (!this.audioContext) return;

        // Create skid sound using filtered noise
        const noiseBuffer = this.audioContext.createBuffer(
            1,
            this.audioContext.sampleRate * 0.3,
            this.audioContext.sampleRate
        );

        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, this.audioContext.currentTime);

        const skidGain = this.audioContext.createGain();
        skidGain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        skidGain.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioContext.currentTime + 0.3
        );

        noise.connect(filter);
        filter.connect(skidGain);
        skidGain.connect(this.audioContext.destination);

        noise.start();
        noise.stop(this.audioContext.currentTime + 0.3);
    }

    setMasterVolume(volume) {
        if (!this.engineGain || !this.exhaustGain) return;

        const currentTime = this.audioContext.currentTime;
        this.engineGain.gain.setTargetAtTime(volume * 0.3, currentTime, 0.1);
        this.exhaustGain.gain.setTargetAtTime(volume * 0.15, currentTime, 0.1);
    }

    stop() {
        if (!this.isInitialized) return;

        try {
            this.engineOscillator.stop();
            this.exhaustOscillator.stop();
            this.audioContext.close();
            this.isInitialized = false;
        } catch (error) {
            console.warn('Error stopping audio:', error);
        }
    }
}
