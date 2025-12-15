/**
 * Motor Audio Engine - Balerina Ride Simulator
 * 
 * Synthesizes realistic electric motor sounds using Web Audio API.
 * 
 * Sound Components:
 * 1. Fundamental tone - scales with motor electrical frequency
 * 2. Harmonics - 2nd, 3rd, 4th harmonics for motor character
 * 3. VFD carrier whine - high-frequency PWM switching noise
 * 4. Mechanical noise - filtered noise for bearing/shaft sounds
 * 5. Transient modulation - effects during accel/decel
 * 
 * The goal is physically-motivated sound that correlates with actual
 * motor behavior, not generic "sci-fi" effects.
 */

import { MotorAudioConfig, MotorAudioState } from './types.js';

/**
 * Motor Audio Engine Class
 * 
 * Handles sound synthesis for a single electric motor.
 */
export class MotorAudioEngine {
  private config: MotorAudioConfig;
  private audioContext: AudioContext | null = null;
  
  // Oscillators for motor fundamental and harmonics
  private fundamentalOsc: OscillatorNode | null = null;
  private harmonic2Osc: OscillatorNode | null = null;
  private harmonic3Osc: OscillatorNode | null = null;
  private harmonic4Osc: OscillatorNode | null = null;
  
  // VFD carrier whine oscillator
  private vfdOsc: OscillatorNode | null = null;
  
  // Mechanical noise source
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  
  // Gain nodes for volume control
  private masterGain: GainNode | null = null;
  private fundamentalGain: GainNode | null = null;
  private harmonic2Gain: GainNode | null = null;
  private harmonic3Gain: GainNode | null = null;
  private harmonic4Gain: GainNode | null = null;
  private vfdGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  
  // Filters
  private noiseFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  
  // State tracking
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private currentFrequency: number = 0;
  private targetFrequency: number = 0;
  
  // Smoothing parameters
  private readonly frequencySmoothing = 0.05; // How quickly frequency changes follow input
  private readonly volumeSmoothing = 0.1;     // How quickly volume changes
  
  constructor(config: MotorAudioConfig) {
    this.config = config;
  }
  
  /**
   * Initialize audio nodes (must be called after user interaction)
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    if (this.isInitialized) return;
    
    this.audioContext = audioContext;
    
    // Create master gain
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(audioContext.destination);
    
    // Create lowpass filter to soften high frequencies
    this.lowpassFilter = audioContext.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 2000;
    this.lowpassFilter.Q.value = 0.7;
    this.lowpassFilter.connect(this.masterGain);
    
    // Create oscillators for motor fundamental and harmonics
    this.fundamentalOsc = audioContext.createOscillator();
    this.fundamentalOsc.type = 'sine';
    this.fundamentalOsc.frequency.value = this.config.baseFrequency;
    
    this.harmonic2Osc = audioContext.createOscillator();
    this.harmonic2Osc.type = 'sine';
    this.harmonic2Osc.frequency.value = this.config.baseFrequency * 2;
    
    this.harmonic3Osc = audioContext.createOscillator();
    this.harmonic3Osc.type = 'sine';
    this.harmonic3Osc.frequency.value = this.config.baseFrequency * 3;
    
    this.harmonic4Osc = audioContext.createOscillator();
    this.harmonic4Osc.type = 'sine';
    this.harmonic4Osc.frequency.value = this.config.baseFrequency * 4;
    
    // Create gain nodes for each harmonic
    this.fundamentalGain = audioContext.createGain();
    this.fundamentalGain.gain.value = this.config.harmonicLevels[0];
    
    this.harmonic2Gain = audioContext.createGain();
    this.harmonic2Gain.gain.value = this.config.harmonicLevels[1];
    
    this.harmonic3Gain = audioContext.createGain();
    this.harmonic3Gain.gain.value = this.config.harmonicLevels[2];
    
    this.harmonic4Gain = audioContext.createGain();
    this.harmonic4Gain.gain.value = this.config.harmonicLevels[3];
    
    // Connect oscillators through gains to lowpass filter
    this.fundamentalOsc.connect(this.fundamentalGain);
    this.fundamentalGain.connect(this.lowpassFilter);
    
    this.harmonic2Osc.connect(this.harmonic2Gain);
    this.harmonic2Gain.connect(this.lowpassFilter);
    
    this.harmonic3Osc.connect(this.harmonic3Gain);
    this.harmonic3Gain.connect(this.lowpassFilter);
    
    this.harmonic4Osc.connect(this.harmonic4Gain);
    this.harmonic4Gain.connect(this.lowpassFilter);
    
    // VFD carrier whine (if enabled)
    if (this.config.vfdCarrierFrequency > 0) {
      this.vfdOsc = audioContext.createOscillator();
      this.vfdOsc.type = 'sawtooth'; // Harsh VFD switching sound
      this.vfdOsc.frequency.value = this.config.vfdCarrierFrequency * 1000; // Convert kHz to Hz
      
      this.vfdGain = audioContext.createGain();
      this.vfdGain.gain.value = 0; // Start silent
      
      // VFD whine goes through a highpass filter
      const vfdFilter = audioContext.createBiquadFilter();
      vfdFilter.type = 'highpass';
      vfdFilter.frequency.value = 1500;
      vfdFilter.Q.value = 1;
      
      this.vfdOsc.connect(vfdFilter);
      vfdFilter.connect(this.vfdGain);
      this.vfdGain.connect(this.masterGain);
    }
    
    // Mechanical noise
    this.noiseBuffer = this.createNoiseBuffer(audioContext);
    
    this.noiseFilter = audioContext.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 400;
    this.noiseFilter.Q.value = 2;
    
    this.noiseGain = audioContext.createGain();
    this.noiseGain.gain.value = 0;
    
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.masterGain);
    
    // Start oscillators (but with zero gain)
    this.fundamentalOsc.start();
    this.harmonic2Osc.start();
    this.harmonic3Osc.start();
    this.harmonic4Osc.start();
    if (this.vfdOsc) {
      this.vfdOsc.start();
    }
    
    // Start noise loop
    this.startNoiseLoop();
    
    this.isInitialized = true;
  }
  
  /**
   * Create a noise buffer for mechanical sounds
   */
  private createNoiseBuffer(audioContext: AudioContext): AudioBuffer {
    const bufferSize = audioContext.sampleRate * 2; // 2 seconds of noise
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate pink-ish noise (more realistic for mechanical sounds)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      
      // Paul Kellet's pink noise filter
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    
    return buffer;
  }
  
  /**
   * Start the noise loop
   */
  private startNoiseLoop(): void {
    if (!this.audioContext || !this.noiseBuffer || !this.noiseFilter) return;
    
    // Stop existing noise node if any
    if (this.noiseNode) {
      try {
        this.noiseNode.stop();
      } catch {
        // Already stopped
      }
    }
    
    this.noiseNode = this.audioContext.createBufferSource();
    this.noiseNode.buffer = this.noiseBuffer;
    this.noiseNode.loop = true;
    this.noiseNode.connect(this.noiseFilter);
    this.noiseNode.start();
  }
  
  /**
   * Update motor sound based on current state
   */
  update(state: MotorAudioState, deltaTime: number): void {
    if (!this.isInitialized || !this.audioContext) return;
    
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    
    // Calculate target frequency based on RPM/VFD frequency
    // Electric motor sound frequency is proportional to electrical frequency
    const normalizedSpeed = state.rpmPercent / 100;
    this.targetFrequency = this.config.baseFrequency + 
      (this.config.maxFrequency - this.config.baseFrequency) * normalizedSpeed;
    
    // Smooth frequency transitions
    this.currentFrequency += (this.targetFrequency - this.currentFrequency) * this.frequencySmoothing;
    
    // Clamp to audible range
    const freq = Math.max(20, Math.min(this.currentFrequency, 500));
    
    // Update oscillator frequencies
    if (this.fundamentalOsc) {
      this.fundamentalOsc.frequency.setTargetAtTime(freq, now, 0.02);
    }
    if (this.harmonic2Osc) {
      this.harmonic2Osc.frequency.setTargetAtTime(freq * 2, now, 0.02);
    }
    if (this.harmonic3Osc) {
      this.harmonic3Osc.frequency.setTargetAtTime(freq * 3, now, 0.02);
    }
    if (this.harmonic4Osc) {
      this.harmonic4Osc.frequency.setTargetAtTime(freq * 4, now, 0.02);
    }
    
    // Calculate volume based on motor state
    let targetVolume = 0;
    
    if (state.isRunning || state.rpmPercent > 0.5) {
      // Base volume scales with speed (louder at higher RPM)
      const speedFactor = 0.3 + normalizedSpeed * 0.7;
      targetVolume = this.config.baseVolume * speedFactor;
      
      // Boost during acceleration (motors work harder)
      if (state.isAccelerating) {
        targetVolume *= 1.2;
      }
      
      // Slight reduction during deceleration (coasting/regen)
      if (state.isDecelerating) {
        targetVolume *= 0.9;
      }
      
      // Load affects volume (higher load = louder)
      targetVolume *= (0.8 + state.loadPercent * 0.4);
    }
    
    // Update master gain
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(targetVolume, now, 0.05);
    }
    
    // Update VFD whine (intensity varies with frequency)
    if (this.vfdGain && this.vfdOsc && this.config.vfdCarrierFrequency > 0) {
      // VFD whine is more noticeable at lower speeds
      const vfdIntensity = this.config.vfdWhineLevel * (1 - normalizedSpeed * 0.5);
      this.vfdGain.gain.setTargetAtTime(
        state.isRunning ? vfdIntensity * 0.03 : 0, 
        now, 
        0.05
      );
      
      // Modulate VFD frequency slightly based on load
      const vfdFreqMod = 1 + (state.loadPercent - 0.5) * 0.02;
      this.vfdOsc.frequency.setTargetAtTime(
        this.config.vfdCarrierFrequency * 1000 * vfdFreqMod,
        now,
        0.1
      );
    }
    
    // Update mechanical noise (increases with speed)
    if (this.noiseGain && this.noiseFilter) {
      const noiseLevel = this.config.mechanicalNoiseLevel * normalizedSpeed;
      this.noiseGain.gain.setTargetAtTime(noiseLevel * 0.5, now, 0.05);
      
      // Filter frequency follows motor speed
      const noiseFreq = 200 + normalizedSpeed * 600;
      this.noiseFilter.frequency.setTargetAtTime(noiseFreq, now, 0.1);
    }
    
    // Update harmonic mix based on operating conditions
    if (state.isAccelerating) {
      // During acceleration, enhance 2nd and 3rd harmonics
      this.setHarmonicLevels(1.0, 0.6, 0.35, 0.15);
    } else if (state.isDecelerating) {
      // During deceleration, reduce harmonics for softer sound
      this.setHarmonicLevels(1.0, 0.35, 0.15, 0.05);
    } else {
      // Steady state - normal harmonic levels
      this.setHarmonicLevels(...this.config.harmonicLevels);
    }
    
    // Update lowpass filter based on speed
    if (this.lowpassFilter) {
      // Open up filter at higher speeds for brighter sound
      const filterFreq = 800 + normalizedSpeed * 2000;
      this.lowpassFilter.frequency.setTargetAtTime(filterFreq, now, 0.1);
    }
    
    this.isRunning = state.isRunning;
  }
  
  /**
   * Set harmonic gain levels
   */
  private setHarmonicLevels(h1: number, h2: number, h3: number, h4: number): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    
    if (this.fundamentalGain) {
      this.fundamentalGain.gain.setTargetAtTime(h1, now, 0.1);
    }
    if (this.harmonic2Gain) {
      this.harmonic2Gain.gain.setTargetAtTime(h2, now, 0.1);
    }
    if (this.harmonic3Gain) {
      this.harmonic3Gain.gain.setTargetAtTime(h3, now, 0.1);
    }
    if (this.harmonic4Gain) {
      this.harmonic4Gain.gain.setTargetAtTime(h4, now, 0.1);
    }
  }
  
  /**
   * Set volume multiplier
   */
  setVolume(volume: number): void {
    // Volume will be applied in update() through targetVolume calculation
    this.config.baseVolume = Math.max(0, Math.min(1, volume)) * 
      (this.config.baseVolume > 0 ? 1 : 0.4);
  }
  
  /**
   * Mute/unmute
   */
  setMuted(muted: boolean): void {
    if (this.masterGain && this.audioContext) {
      const now = this.audioContext.currentTime;
      if (muted) {
        this.masterGain.gain.setTargetAtTime(0, now, 0.01);
      }
    }
  }
  
  /**
   * Stop and clean up
   */
  dispose(): void {
    if (this.fundamentalOsc) {
      this.fundamentalOsc.stop();
      this.fundamentalOsc.disconnect();
    }
    if (this.harmonic2Osc) {
      this.harmonic2Osc.stop();
      this.harmonic2Osc.disconnect();
    }
    if (this.harmonic3Osc) {
      this.harmonic3Osc.stop();
      this.harmonic3Osc.disconnect();
    }
    if (this.harmonic4Osc) {
      this.harmonic4Osc.stop();
      this.harmonic4Osc.disconnect();
    }
    if (this.vfdOsc) {
      this.vfdOsc.stop();
      this.vfdOsc.disconnect();
    }
    if (this.noiseNode) {
      try {
        this.noiseNode.stop();
      } catch {
        // Already stopped
      }
      this.noiseNode.disconnect();
    }
    
    this.isInitialized = false;
  }
  
  /**
   * Get current state for debugging
   */
  getDebugInfo(): object {
    return {
      name: this.config.name,
      initialized: this.isInitialized,
      running: this.isRunning,
      currentFrequency: this.currentFrequency,
      targetFrequency: this.targetFrequency
    };
  }
}

