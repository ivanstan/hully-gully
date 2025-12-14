/**
 * Motor Types and Specifications - Balerina Ride Simulator
 * 
 * Models 3-phase AC induction motors with VFD (Variable Frequency Drive) control.
 * Based on real specifications from Hully Gully / Balerina amusement rides:
 * - Main platform motor: 15 kW, 380V 3-phase
 * - Windmill motor: 7.5 kW, 380V 3-phase
 * 
 * Electrical Specifications:
 * - Voltage: 380V line-to-line (220V line-to-neutral for 3-phase Y-connection)
 * - Frequency: 50 Hz nominal (VFD adjustable 0-60 Hz)
 * - Power factor: 0.85-0.89 typical
 * - Efficiency: 89-92% typical
 * 
 * All calculations use SI units:
 * - Power: Watts (W) / Kilowatts (kW)
 * - Voltage: Volts (V)
 * - Current: Amperes (A)
 * - Frequency: Hertz (Hz)
 * - Torque: Newton-meters (Nm)
 * - Angular velocity: rad/s
 */

/**
 * 3-Phase Induction Motor Nameplate Specifications
 * These are the rated values from the motor nameplate
 */
export interface MotorNameplate {
  /** Motor name/identifier */
  name: string;
  /** Rated power output (W) */
  ratedPower: number;
  /** Rated line-to-line voltage (V) */
  ratedVoltage: number;
  /** Number of poles (2, 4, 6, etc.) */
  poles: number;
  /** Rated frequency (Hz) */
  ratedFrequency: number;
  /** Rated current per phase (A) */
  ratedCurrent: number;
  /** Power factor at rated load (dimensionless, 0-1) */
  powerFactor: number;
  /** Efficiency at rated load (dimensionless, 0-1) */
  efficiency: number;
  /** Rated torque (Nm) - calculated from power and sync speed */
  ratedTorque: number;
  /** Starting torque multiplier (typical 1.5-2.5 × rated) */
  startingTorqueMultiplier: number;
  /** Breakdown torque multiplier (typical 2.0-3.0 × rated) */
  breakdownTorqueMultiplier: number;
  /** Starting current multiplier (typical 6-8 × rated) */
  startingCurrentMultiplier: number;
  /** Motor inertia (kg·m²) - affects acceleration */
  rotorInertia: number;
}

/**
 * 3-Phase Electrical Values (instantaneous)
 * Represents the current state of each phase
 */
export interface ThreePhaseElectrical {
  /** Phase A values */
  phaseA: PhaseValues;
  /** Phase B values */
  phaseB: PhaseValues;
  /** Phase C values */
  phaseC: PhaseValues;
  /** Neutral current (A) - should be ~0 for balanced load */
  neutralCurrent: number;
  /** Line-to-line voltage (V) */
  lineVoltage: number;
  /** Total 3-phase power (W) */
  totalPower: number;
  /** Total 3-phase reactive power (VAR) */
  reactivePower: number;
  /** Total apparent power (VA) */
  apparentPower: number;
  /** System power factor */
  powerFactor: number;
}

/**
 * Single phase electrical values
 */
export interface PhaseValues {
  /** Instantaneous voltage (V) - line to neutral */
  voltage: number;
  /** RMS current (A) */
  current: number;
  /** Phase angle (rad) */
  phaseAngle: number;
  /** Real power for this phase (W) */
  power: number;
}

/**
 * Motor rotation direction (determined by phase sequence)
 */
export enum MotorDirection {
  /** Forward: Phase sequence A-B-C */
  FORWARD = 1,
  /** Reverse: Phase sequence A-C-B (swapped) */
  REVERSE = -1
}

/**
 * VFD (Variable Frequency Drive) Settings
 * 
 * Direction Control:
 * - VFDs reverse motor direction by swapping phase sequence (B↔C)
 * - Forward: A-B-C sequence (120° phase shift)
 * - Reverse: A-C-B sequence (swap any two phases)
 * - Safe reversal: decelerate to 0, swap phases, accelerate
 */
export interface VFDSettings {
  /** Target frequency (Hz) - 0 to maxFrequency */
  targetFrequency: number;
  /** Maximum output frequency (Hz) */
  maxFrequency: number;
  /** Acceleration time - time to ramp from 0 to max Hz (s) */
  accelerationTime: number;
  /** Deceleration time - time to ramp from max Hz to 0 (s) */
  decelerationTime: number;
  /** Current output frequency (Hz) */
  outputFrequency: number;
  /** V/Hz ratio mode - maintains constant flux */
  vPerHzRatio: number;
  /** Voltage boost at low frequency (%) */
  lowFrequencyBoost: number;
  /** DC bus voltage (V) */
  dcBusVoltage: number;
  /** Target direction command */
  targetDirection: MotorDirection;
  /** Current direction (phase sequence) */
  currentDirection: MotorDirection;
  /** Is direction change pending (waiting for speed to reach zero) */
  directionChangePending: boolean;
}

/**
 * Motor Operating State
 */
export enum MotorOperatingState {
  /** Motor is stopped */
  STOPPED = 'STOPPED',
  /** Motor is accelerating */
  ACCELERATING = 'ACCELERATING',
  /** Motor is at constant speed */
  RUNNING = 'RUNNING',
  /** Motor is decelerating */
  DECELERATING = 'DECELERATING',
  /** Motor is in fault state */
  FAULT = 'FAULT',
  /** Motor is regenerating (braking) */
  REGENERATING = 'REGENERATING'
}

/**
 * Motor Fault Types
 */
export enum MotorFault {
  NONE = 'NONE',
  OVERCURRENT = 'OVERCURRENT',
  OVERVOLTAGE = 'OVERVOLTAGE',
  UNDERVOLTAGE = 'UNDERVOLTAGE',
  OVERTEMPERATURE = 'OVERTEMPERATURE',
  GROUND_FAULT = 'GROUND_FAULT',
  PHASE_LOSS = 'PHASE_LOSS',
  OVERLOAD = 'OVERLOAD'
}

/**
 * Complete Motor State
 */
export interface MotorState {
  /** Motor specifications */
  nameplate: MotorNameplate;
  /** Current operating state */
  operatingState: MotorOperatingState;
  /** Current fault (if any) */
  fault: MotorFault;
  /** VFD settings and state */
  vfd: VFDSettings;
  /** 3-phase electrical measurements */
  electrical: ThreePhaseElectrical;
  /** Actual motor shaft speed (rad/s) */
  shaftSpeed: number;
  /** Motor slip (dimensionless, 0-1) */
  slip: number;
  /** Output torque (Nm) */
  outputTorque: number;
  /** Load torque being driven (Nm) */
  loadTorque: number;
  /** Mechanical power output (W) */
  mechanicalPower: number;
  /** Electrical power input (W) */
  electricalPower: number;
  /** Motor temperature estimate (°C) */
  temperature: number;
  /** Motor runtime since start (s) */
  runtime: number;
}

/**
 * Hydraulic System State (for tilt mechanism)
 */
export interface HydraulicState {
  /** Hydraulic pump motor state */
  pumpMotor: MotorState;
  /** System pressure (bar) */
  pressure: number;
  /** Target pressure (bar) */
  targetPressure: number;
  /** Cylinder position (0-1, normalized) */
  cylinderPosition: number;
  /** Target cylinder position (0-1, normalized) */
  targetPosition: number;
  /** Oil temperature (°C) */
  oilTemperature: number;
  /** Flow rate (L/min) */
  flowRate: number;
}

/**
 * Complete Electrical System State
 */
export interface ElectricalSystemState {
  /** Main platform drive motor */
  platformMotor: MotorState;
  /** Windmill (secondary platform) drive motor */
  windmillMotor: MotorState;
  /** Hydraulic pump motor (for tilt) */
  hydraulicMotor: MotorState;
  /** Mains supply state */
  mainsSupply: {
    /** Supply voltage (V) line-to-line */
    voltage: number;
    /** Supply frequency (Hz) */
    frequency: number;
    /** Supply available */
    available: boolean;
    /** Total system power consumption (W) */
    totalPower: number;
  };
  /** Hydraulic system state */
  hydraulics: HydraulicState;
}

/**
 * Predefined motor specifications for typical Hully Gully ride
 */
export const MOTOR_SPECS = {
  /**
   * Main Platform Motor
   * 15 kW, 4-pole, 380V 3-phase
   * Synchronous speed: 1500 RPM at 50 Hz
   * Rated speed: ~1460 RPM (slip ~2.7%)
   */
  PLATFORM_MOTOR: {
    name: 'Main Platform Drive',
    ratedPower: 15000, // 15 kW
    ratedVoltage: 380, // 380V L-L (220V L-N)
    poles: 4,
    ratedFrequency: 50, // Hz
    ratedCurrent: 27.9, // A per phase
    powerFactor: 0.89,
    efficiency: 0.919,
    ratedTorque: 98.1, // Nm (P = T × ω, where ω = 2π × 1460/60)
    startingTorqueMultiplier: 2.0,
    breakdownTorqueMultiplier: 2.5,
    startingCurrentMultiplier: 7.0,
    rotorInertia: 0.35 // kg·m² (typical for 15kW motor)
  } as MotorNameplate,

  /**
   * Windmill Motor
   * 7.5 kW, 4-pole, 380V 3-phase
   * Synchronous speed: 1500 RPM at 50 Hz
   */
  WINDMILL_MOTOR: {
    name: 'Windmill Drive',
    ratedPower: 7500, // 7.5 kW
    ratedVoltage: 380,
    poles: 4,
    ratedFrequency: 50,
    ratedCurrent: 14.5, // A per phase
    powerFactor: 0.87,
    efficiency: 0.905,
    ratedTorque: 49.1, // Nm
    startingTorqueMultiplier: 2.2,
    breakdownTorqueMultiplier: 2.6,
    startingCurrentMultiplier: 7.5,
    rotorInertia: 0.15 // kg·m²
  } as MotorNameplate,

  /**
   * Hydraulic Pump Motor
   * 3 kW, 4-pole, 380V 3-phase
   */
  HYDRAULIC_MOTOR: {
    name: 'Hydraulic Pump',
    ratedPower: 3000, // 3 kW
    ratedVoltage: 380,
    poles: 4,
    ratedFrequency: 50,
    ratedCurrent: 6.2, // A per phase
    powerFactor: 0.85,
    efficiency: 0.87,
    ratedTorque: 19.5, // Nm
    startingTorqueMultiplier: 2.0,
    breakdownTorqueMultiplier: 2.3,
    startingCurrentMultiplier: 6.5,
    rotorInertia: 0.05 // kg·m²
  } as MotorNameplate
} as const;

/**
 * Convert RPM to rad/s
 */
export function rpmToRadPerSec(rpm: number): number {
  return (rpm * 2 * Math.PI) / 60;
}

/**
 * Convert rad/s to RPM
 */
export function radPerSecToRpm(radPerSec: number): number {
  return (radPerSec * 60) / (2 * Math.PI);
}

/**
 * Calculate synchronous speed from poles and frequency
 * @param poles - Number of motor poles
 * @param frequency - Supply frequency (Hz)
 * @returns Synchronous speed in rad/s
 */
export function calculateSynchronousSpeed(poles: number, frequency: number): number {
  // n_sync = 120 * f / p (in RPM)
  const rpmSync = (120 * frequency) / poles;
  return rpmToRadPerSec(rpmSync);
}

/**
 * Calculate rated torque from power and speed
 * @param power - Power in Watts
 * @param speed - Speed in rad/s
 * @returns Torque in Nm
 */
export function calculateTorque(power: number, speed: number): number {
  if (speed === 0) return 0;
  return power / speed;
}
