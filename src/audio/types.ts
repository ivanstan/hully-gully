/**
 * Audio Types - Balerina Ride Simulator
 * 
 * Types for the electric motor sound simulation system.
 * 
 * Sound Model:
 * Electric motors driven by VFDs produce characteristic sounds:
 * 1. Fundamental frequency proportional to electrical frequency (VFD output)
 * 2. Harmonics from motor construction (slots, poles)
 * 3. VFD carrier frequency whine (PWM switching)
 * 4. Mechanical resonance during acceleration/deceleration
 */

/**
 * Motor audio configuration
 */
export interface MotorAudioConfig {
  /** Motor identifier for logging/debugging */
  name: string;
  
  /** Base frequency at rated speed (Hz) - fundamental motor hum */
  baseFrequency: number;
  
  /** Maximum frequency at rated speed (Hz) */
  maxFrequency: number;
  
  /** VFD carrier frequency (kHz) - creates characteristic whine */
  vfdCarrierFrequency: number;
  
  /** Number of motor poles - affects harmonic content */
  poles: number;
  
  /** Base volume (0-1) */
  baseVolume: number;
  
  /** Harmonic mix levels [fundamental, 2nd, 3rd, 4th] */
  harmonicLevels: [number, number, number, number];
  
  /** VFD whine level (0-1) */
  vfdWhineLevel: number;
  
  /** Mechanical noise level (0-1) - bearing/shaft noise */
  mechanicalNoiseLevel: number;
}

/**
 * Motor audio state (updated each frame)
 */
export interface MotorAudioState {
  /** Current RPM (or rad/s converted) */
  rpm: number;
  
  /** RPM as percentage of rated (0-100+) */
  rpmPercent: number;
  
  /** Is motor running (speed > threshold) */
  isRunning: boolean;
  
  /** Is accelerating */
  isAccelerating: boolean;
  
  /** Is decelerating */
  isDecelerating: boolean;
  
  /** Load percentage (0-1) - affects sound character */
  loadPercent: number;
  
  /** VFD output frequency (Hz) */
  vfdFrequency: number;
  
  /** Motor temperature (affects some sound characteristics) */
  temperature: number;
}

/**
 * Default motor audio configurations
 */
export const MOTOR_AUDIO_CONFIGS = {
  /** Main platform motor - 15kW, 4-pole, deeper sound */
  PLATFORM_MOTOR: {
    name: 'Platform Motor',
    baseFrequency: 50,      // Base electrical frequency
    maxFrequency: 200,      // Max fundamental at full speed
    vfdCarrierFrequency: 4, // 4kHz PWM carrier
    poles: 4,
    baseVolume: 0.4,
    harmonicLevels: [1.0, 0.5, 0.25, 0.1] as [number, number, number, number],
    vfdWhineLevel: 0.15,
    mechanicalNoiseLevel: 0.08
  } as MotorAudioConfig,
  
  /** Windmill motor - 7.5kW, 4-pole, slightly higher pitch */
  WINDMILL_MOTOR: {
    name: 'Windmill Motor',
    baseFrequency: 60,
    maxFrequency: 240,
    vfdCarrierFrequency: 4,
    poles: 4,
    baseVolume: 0.35,
    harmonicLevels: [1.0, 0.45, 0.2, 0.08] as [number, number, number, number],
    vfdWhineLevel: 0.12,
    mechanicalNoiseLevel: 0.06
  } as MotorAudioConfig,
  
  /** Hydraulic pump motor - 3kW, constant speed, steady hum */
  HYDRAULIC_MOTOR: {
    name: 'Hydraulic Motor',
    baseFrequency: 100,     // Higher base frequency (pump whine)
    maxFrequency: 100,      // Constant speed pump
    vfdCarrierFrequency: 0, // No VFD on constant speed pump
    poles: 4,
    baseVolume: 0.25,
    harmonicLevels: [1.0, 0.6, 0.35, 0.15] as [number, number, number, number],
    vfdWhineLevel: 0,
    mechanicalNoiseLevel: 0.15  // Pump noise
  } as MotorAudioConfig
} as const;

/**
 * Global audio settings
 */
export interface AudioSettings {
  /** Master volume (0-1) */
  masterVolume: number;
  
  /** Is audio muted */
  muted: boolean;
  
  /** Enable VFD whine sounds */
  enableVFDWhine: boolean;
  
  /** Enable mechanical noise */
  enableMechanicalNoise: boolean;
  
  /** Doppler effect for moving sounds (future) */
  enableDoppler: boolean;
}

/**
 * Default audio settings
 */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.5,
  muted: false,
  enableVFDWhine: true,
  enableMechanicalNoise: true,
  enableDoppler: false
};


