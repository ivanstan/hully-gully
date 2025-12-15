/**
 * Audio Module - Balerina Ride Simulator
 * 
 * Provides electric motor sound simulation using Web Audio API.
 * Sounds are synthesized in real-time based on motor RPM, load, and state.
 * 
 * Usage:
 * ```typescript
 * import { AudioManager, createAudioManager } from './audio/index.js';
 * 
 * // Create audio manager
 * const audioManager = createAudioManager();
 * 
 * // Initialize after user interaction (required by browsers)
 * await audioManager.initialize();
 * 
 * // In animation loop, update with motor states
 * audioManager.update(platformMotor, windmillMotor, hydraulicMotor, deltaTime);
 * 
 * // Control volume
 * audioManager.setMasterVolume(0.5);
 * audioManager.setMuted(false);
 * ```
 */

export { MotorAudioEngine } from './MotorAudioEngine.js';
export { AudioManager, createAudioManager } from './AudioManager.js';
export type { 
  MotorAudioConfig,
  MotorAudioState,
  AudioSettings
} from './types.js';
export { 
  MOTOR_AUDIO_CONFIGS,
  DEFAULT_AUDIO_SETTINGS
} from './types.js';

