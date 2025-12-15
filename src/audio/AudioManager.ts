/**
 * Audio Manager - Balerina Ride Simulator
 * 
 * Manages all audio for the ride simulation, including:
 * - Platform motor sound
 * - Windmill motor sound  
 * - Hydraulic pump sound
 * 
 * Handles initialization (requires user interaction for Web Audio),
 * master volume, muting, and coordinating all motor audio engines.
 */

import { MotorAudioEngine } from './MotorAudioEngine.js';
import { 
  MotorAudioState, 
  AudioSettings, 
  DEFAULT_AUDIO_SETTINGS,
  MOTOR_AUDIO_CONFIGS 
} from './types.js';
import { MotorState, MotorOperatingState } from '../motors/types.js';

/**
 * Convert motor state to audio state
 */
function motorStateToAudioState(motor: MotorState, ratedSpeedRadSec: number): MotorAudioState {
  const rpmPercent = (motor.shaftSpeed / ratedSpeedRadSec) * 100;
  
  return {
    rpm: motor.shaftSpeed * 60 / (2 * Math.PI), // Convert rad/s to RPM
    rpmPercent: Math.min(150, Math.max(0, rpmPercent)), // Clamp to 0-150%
    isRunning: motor.shaftSpeed > 0.5,
    isAccelerating: motor.operatingState === MotorOperatingState.ACCELERATING,
    isDecelerating: motor.operatingState === MotorOperatingState.DECELERATING,
    loadPercent: motor.outputTorque / motor.nameplate.ratedTorque,
    vfdFrequency: motor.vfd.outputFrequency,
    temperature: motor.temperature
  };
}

/**
 * Audio Manager Class
 */
export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  
  // Motor audio engines
  private platformMotorAudio: MotorAudioEngine;
  private windmillMotorAudio: MotorAudioEngine;
  private hydraulicMotorAudio: MotorAudioEngine;
  
  // Settings
  private settings: AudioSettings;
  
  // State
  private isInitialized: boolean = false;
  private isUserActivated: boolean = false;
  
  // Rated speeds for converting motor state (rad/s at 50Hz)
  // Sync speed = 120 * f / p = 120 * 50 / 4 = 1500 RPM = 157.08 rad/s
  // Rated speed ≈ 97% of sync (accounting for slip)
  private readonly platformRatedSpeed = 157.08 * 0.97;
  private readonly windmillRatedSpeed = 157.08 * 0.97;
  private readonly hydraulicRatedSpeed = 157.08 * 0.97;
  
  constructor(settings?: Partial<AudioSettings>) {
    this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...settings };
    
    // Create motor audio engines with appropriate configs
    this.platformMotorAudio = new MotorAudioEngine(MOTOR_AUDIO_CONFIGS.PLATFORM_MOTOR);
    this.windmillMotorAudio = new MotorAudioEngine(MOTOR_AUDIO_CONFIGS.WINDMILL_MOTOR);
    this.hydraulicMotorAudio = new MotorAudioEngine(MOTOR_AUDIO_CONFIGS.HYDRAULIC_MOTOR);
  }
  
  /**
   * Initialize audio system
   * Must be called after user interaction (browser requirement)
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;
    
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume context (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Create master gain
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.settings.masterVolume;
      this.masterGain.connect(this.audioContext.destination);
      
      // Initialize motor audio engines
      await Promise.all([
        this.platformMotorAudio.initialize(this.audioContext),
        this.windmillMotorAudio.initialize(this.audioContext),
        this.hydraulicMotorAudio.initialize(this.audioContext)
      ]);
      
      this.isInitialized = true;
      this.isUserActivated = true;
      
      console.log('[AudioManager] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[AudioManager] Failed to initialize:', error);
      return false;
    }
  }
  
  /**
   * Check if audio is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.isUserActivated;
  }
  
  /**
   * Update all motor sounds based on current motor states
   */
  update(
    platformMotor: MotorState,
    windmillMotor: MotorState,
    hydraulicMotor: MotorState,
    deltaTime: number = 1/60
  ): void {
    if (!this.isInitialized || this.settings.muted) return;
    
    // Convert motor states to audio states
    const platformAudioState = motorStateToAudioState(platformMotor, this.platformRatedSpeed);
    const windmillAudioState = motorStateToAudioState(windmillMotor, this.windmillRatedSpeed);
    const hydraulicAudioState = motorStateToAudioState(hydraulicMotor, this.hydraulicRatedSpeed);
    
    // Update each motor audio engine
    this.platformMotorAudio.update(platformAudioState, deltaTime);
    this.windmillMotorAudio.update(windmillAudioState, deltaTime);
    this.hydraulicMotorAudio.update(hydraulicAudioState, deltaTime);
  }
  
  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, volume));
    
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(
        this.settings.masterVolume,
        this.audioContext.currentTime,
        0.05
      );
    }
  }
  
  /**
   * Get current master volume
   */
  getMasterVolume(): number {
    return this.settings.masterVolume;
  }
  
  /**
   * Mute/unmute all audio
   */
  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : this.settings.masterVolume,
        this.audioContext.currentTime,
        0.05
      );
    }
    
    // Also notify individual engines
    this.platformMotorAudio.setMuted(muted);
    this.windmillMotorAudio.setMuted(muted);
    this.hydraulicMotorAudio.setMuted(muted);
  }
  
  /**
   * Toggle mute state
   */
  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }
  
  /**
   * Check if muted
   */
  isMuted(): boolean {
    return this.settings.muted;
  }
  
  /**
   * Set individual motor volume
   */
  setMotorVolume(motor: 'platform' | 'windmill' | 'hydraulic', volume: number): void {
    switch (motor) {
      case 'platform':
        this.platformMotorAudio.setVolume(volume);
        break;
      case 'windmill':
        this.windmillMotorAudio.setVolume(volume);
        break;
      case 'hydraulic':
        this.hydraulicMotorAudio.setVolume(volume);
        break;
    }
  }
  
  /**
   * Enable/disable VFD whine
   */
  setVFDWhineEnabled(enabled: boolean): void {
    this.settings.enableVFDWhine = enabled;
    // This would require recreating the audio nodes to take effect
    // For now, we just track the setting
  }
  
  /**
   * Enable/disable mechanical noise
   */
  setMechanicalNoiseEnabled(enabled: boolean): void {
    this.settings.enableMechanicalNoise = enabled;
  }
  
  /**
   * Get current settings
   */
  getSettings(): Readonly<AudioSettings> {
    return this.settings;
  }
  
  /**
   * Get debug info for all motors
   */
  getDebugInfo(): object {
    return {
      initialized: this.isInitialized,
      userActivated: this.isUserActivated,
      contextState: this.audioContext?.state ?? 'none',
      masterVolume: this.settings.masterVolume,
      muted: this.settings.muted,
      motors: {
        platform: this.platformMotorAudio.getDebugInfo(),
        windmill: this.windmillMotorAudio.getDebugInfo(),
        hydraulic: this.hydraulicMotorAudio.getDebugInfo()
      }
    };
  }
  
  /**
   * Suspend audio context (save resources when not needed)
   */
  async suspend(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'running') {
      await this.audioContext.suspend();
    }
  }
  
  /**
   * Resume audio context
   */
  async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  /**
   * Clean up and dispose of all audio resources
   */
  dispose(): void {
    this.platformMotorAudio.dispose();
    this.windmillMotorAudio.dispose();
    this.hydraulicMotorAudio.dispose();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isInitialized = false;
    this.isUserActivated = false;
  }
}

/**
 * Create a default AudioManager instance
 */
export function createAudioManager(settings?: Partial<AudioSettings>): AudioManager {
  return new AudioManager(settings);
}

