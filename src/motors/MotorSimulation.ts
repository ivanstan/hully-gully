/**
 * Motor Simulation - Balerina Ride Simulator
 * 
 * Simulates 3-phase AC induction motors with VFD control.
 * 
 * Physics Model:
 * 1. VFD controls output frequency (0-60 Hz) and voltage (V/Hz constant)
 * 2. Motor speed follows synchronous speed with slip
 * 3. Torque-speed curve modeled using Kloss formula approximation
 * 4. Current draw based on torque and efficiency
 * 5. 3-phase currents with 120° phase separation
 * 
 * References:
 * - Induction motor equivalent circuit model
 * - VFD V/Hz control principles
 * - Motor thermal model (simplified)
 */

import {
  MotorNameplate,
  MotorState,
  MotorOperatingState,
  MotorFault,
  MotorDirection,
  VFDSettings,
  ThreePhaseElectrical,
  PhaseValues,
  calculateSynchronousSpeed,
  rpmToRadPerSec,
  radPerSecToRpm,
  MOTOR_SPECS
} from './types.js';

/**
 * Create initial VFD settings
 */
function createInitialVFD(maxFreq: number = 60): VFDSettings {
  return {
    targetFrequency: 0,
    maxFrequency: maxFreq,
    accelerationTime: 8.0, // 8 seconds typical for amusement rides
    decelerationTime: 10.0, // Longer decel for smooth stop
    outputFrequency: 0,
    vPerHzRatio: 380 / 50, // 7.6 V/Hz for 380V/50Hz
    lowFrequencyBoost: 5, // 5% voltage boost at low frequency
    dcBusVoltage: 540, // Typical DC bus for 380V input
    targetDirection: MotorDirection.FORWARD,
    currentDirection: MotorDirection.FORWARD,
    directionChangePending: false
  };
}

/**
 * Create initial 3-phase electrical state
 */
function createInitialElectrical(ratedVoltage: number): ThreePhaseElectrical {
  const lineToNeutral = ratedVoltage / Math.sqrt(3);
  return {
    phaseA: { voltage: lineToNeutral, current: 0, phaseAngle: 0, power: 0 },
    phaseB: { voltage: lineToNeutral, current: 0, phaseAngle: (2 * Math.PI) / 3, power: 0 },
    phaseC: { voltage: lineToNeutral, current: 0, phaseAngle: (4 * Math.PI) / 3, power: 0 },
    neutralCurrent: 0,
    lineVoltage: ratedVoltage,
    totalPower: 0,
    reactivePower: 0,
    apparentPower: 0,
    powerFactor: 1.0
  };
}

/**
 * Create initial motor state
 */
export function createMotorState(nameplate: MotorNameplate): MotorState {
  return {
    nameplate,
    operatingState: MotorOperatingState.STOPPED,
    fault: MotorFault.NONE,
    vfd: createInitialVFD(),
    electrical: createInitialElectrical(nameplate.ratedVoltage),
    shaftSpeed: 0,
    slip: 0,
    outputTorque: 0,
    loadTorque: 0,
    mechanicalPower: 0,
    electricalPower: 0,
    temperature: 25, // Ambient temperature
    runtime: 0
  };
}

/**
 * Motor Simulation Class
 * 
 * Handles the physics of a single 3-phase induction motor with VFD.
 */
export class MotorSimulator {
  private state: MotorState;
  private time: number = 0;
  
  // Thermal constants
  private readonly thermalTimeConstant = 300; // seconds to reach thermal equilibrium
  private readonly maxTemperature = 120; // °C - Class F insulation limit
  private readonly ambientTemperature = 25; // °C
  
  constructor(nameplate: MotorNameplate) {
    this.state = createMotorState(nameplate);
  }
  
  /**
   * Get current motor state (read-only)
   */
  getState(): Readonly<MotorState> {
    return this.state;
  }
  
  /**
   * Set VFD target frequency (speed command)
   * @param frequency - Target frequency in Hz (0 to maxFrequency)
   */
  setTargetFrequency(frequency: number): void {
    this.state.vfd.targetFrequency = Math.max(0, Math.min(frequency, this.state.vfd.maxFrequency));
  }
  
  /**
   * Set motor direction via VFD
   * 
   * VFDs reverse motor direction by electronically swapping phase sequence:
   * - Forward: A-B-C (standard 120° phase sequence)
   * - Reverse: A-C-B (swaps phases B and C)
   * 
   * For safety, direction change only occurs when motor speed is near zero.
   * If motor is running, VFD will decelerate to zero, swap phases, then accelerate.
   * 
   * @param direction - Target direction (FORWARD or REVERSE)
   */
  setDirection(direction: MotorDirection): void {
    if (this.state.vfd.targetDirection === direction) {
      return; // No change needed
    }
    
    this.state.vfd.targetDirection = direction;
    
    // If motor is nearly stopped, can change direction immediately
    if (this.state.shaftSpeed < 0.5) {
      this.state.vfd.currentDirection = direction;
      this.state.vfd.directionChangePending = false;
    } else {
      // Motor is running - need to decelerate first
      // Mark direction change as pending
      this.state.vfd.directionChangePending = true;
      // VFD will automatically decelerate to zero before reversing
      // (handled in step function)
    }
  }
  
  /**
   * Get current motor direction
   */
  getDirection(): MotorDirection {
    return this.state.vfd.currentDirection;
  }
  
  /**
   * Check if a direction change is pending (waiting for motor to stop)
   */
  isDirectionChangePending(): boolean {
    return this.state.vfd.directionChangePending;
  }
  
  /**
   * Set VFD acceleration time
   * @param time - Acceleration time in seconds
   */
  setAccelerationTime(time: number): void {
    this.state.vfd.accelerationTime = Math.max(0.5, time);
  }
  
  /**
   * Set VFD deceleration time
   * @param time - Deceleration time in seconds
   */
  setDecelerationTime(time: number): void {
    this.state.vfd.decelerationTime = Math.max(0.5, time);
  }
  
  /**
   * Set external load torque
   * @param torque - Load torque in Nm
   */
  setLoadTorque(torque: number): void {
    this.state.loadTorque = Math.max(0, torque);
  }
  
  /**
   * Trip the motor (fault condition)
   * @param fault - Type of fault
   */
  trip(fault: MotorFault): void {
    this.state.fault = fault;
    this.state.operatingState = MotorOperatingState.FAULT;
    this.state.vfd.targetFrequency = 0;
    this.state.vfd.outputFrequency = 0;
  }
  
  /**
   * Reset fault and motor
   */
  reset(): void {
    this.state = createMotorState(this.state.nameplate);
    this.time = 0;
  }
  
  /**
   * Calculate motor torque at given slip using Kloss formula approximation
   * 
   * T = 2 * T_max * s_max / (s + s_max²/s)
   * 
   * For simplification, we use a practical model where torque is approximately
   * proportional to slip in the normal operating range.
   * 
   * @param slip - Motor slip (0-1)
   * @param ratedTorque - Rated torque (Nm)
   * @param breakdownMultiplier - Breakdown torque multiplier
   * @returns Available torque in Nm
   */
  private calculateTorque(slip: number, ratedTorque: number, breakdownMultiplier: number): number {
    // Typical slip at rated torque is about 2-5% (0.02-0.05)
    const ratedSlip = 0.03;
    // Breakdown slip is typically 15-25%
    const breakdownSlip = 0.20;
    const breakdownTorque = ratedTorque * breakdownMultiplier;
    
    if (slip <= 0) return 0;
    if (slip >= 1) return breakdownTorque * 0.5; // Locked rotor
    
    // Kloss formula: T = 2 * Tb * sb / (s + sb²/s)
    // where Tb = breakdown torque, sb = breakdown slip
    const numerator = 2 * breakdownTorque * breakdownSlip;
    const denominator = slip + (breakdownSlip * breakdownSlip) / slip;
    
    return numerator / denominator;
  }
  
  /**
   * Calculate motor current based on load
   * Uses a simplified model: I = I_noload + (I_rated - I_noload) * (T/T_rated)
   * 
   * @param torque - Output torque (Nm)
   * @param frequency - VFD output frequency (Hz)
   * @returns RMS current per phase (A)
   */
  private calculateCurrent(torque: number, frequency: number): number {
    const { ratedTorque, ratedCurrent, startingCurrentMultiplier } = this.state.nameplate;
    
    if (frequency <= 0) return 0;
    
    // No-load current is typically 30-40% of rated current
    const noLoadCurrent = ratedCurrent * 0.35;
    
    // Torque ratio (could be > 1 during starting)
    const torqueRatio = torque / ratedTorque;
    
    // At rated torque, draw rated current
    // Current increases roughly with square root of torque for induction motors
    // But we'll use a linear approximation for simplicity in normal range
    const loadCurrent = noLoadCurrent + (ratedCurrent - noLoadCurrent) * Math.min(torqueRatio, 1.5);
    
    // At very low frequencies, magnetizing current dominates
    const freqRatio = frequency / this.state.nameplate.ratedFrequency;
    if (freqRatio < 0.2) {
      // Current boost at low frequency
      return loadCurrent * (1 + (0.2 - freqRatio) * 0.5);
    }
    
    return loadCurrent;
  }
  
  /**
   * Calculate 3-phase electrical values
   * 
   * Phase sequence determines motor direction:
   * - Forward (A-B-C): Phase B leads Phase C by 120°
   * - Reverse (A-C-B): Phase C leads Phase B by 120° (VFD swaps B and C)
   */
  private updateElectrical(
    frequency: number,
    current: number,
    powerFactor: number
  ): void {
    const { ratedVoltage, ratedFrequency } = this.state.nameplate;
    const { vPerHzRatio, lowFrequencyBoost, currentDirection } = this.state.vfd;
    
    // Calculate output voltage (V/Hz control with low-frequency boost)
    let voltage = frequency * vPerHzRatio;
    if (frequency < 10 && frequency > 0) {
      // Apply voltage boost at low frequency to maintain torque
      const boostFactor = 1 + (lowFrequencyBoost / 100) * (1 - frequency / 10);
      voltage *= boostFactor;
    }
    // Cap at rated voltage
    voltage = Math.min(voltage, ratedVoltage);
    
    const lineToNeutral = voltage / Math.sqrt(3);
    const phaseAngle = Math.acos(powerFactor);
    
    // Phase currents with 120° separation
    // Direction is controlled by phase sequence:
    // - Forward: A(0°) → B(120°) → C(240°)
    // - Reverse: A(0°) → C(120°) → B(240°) - VFD swaps B and C phases
    const isReverse = currentDirection === MotorDirection.REVERSE;
    
    this.state.electrical.phaseA = {
      voltage: lineToNeutral,
      current: current,
      phaseAngle: 0,
      power: lineToNeutral * current * powerFactor
    };
    
    // In reverse, phases B and C are swapped
    this.state.electrical.phaseB = {
      voltage: lineToNeutral,
      current: current,
      phaseAngle: isReverse ? (4 * Math.PI) / 3 : (2 * Math.PI) / 3,
      power: lineToNeutral * current * powerFactor
    };
    
    this.state.electrical.phaseC = {
      voltage: lineToNeutral,
      current: current,
      phaseAngle: isReverse ? (2 * Math.PI) / 3 : (4 * Math.PI) / 3,
      power: lineToNeutral * current * powerFactor
    };
    
    // Neutral current is zero for balanced load
    this.state.electrical.neutralCurrent = 0;
    
    // System totals
    this.state.electrical.lineVoltage = voltage;
    this.state.electrical.totalPower = 3 * lineToNeutral * current * powerFactor;
    this.state.electrical.reactivePower = 3 * lineToNeutral * current * Math.sin(phaseAngle);
    this.state.electrical.apparentPower = 3 * lineToNeutral * current;
    this.state.electrical.powerFactor = powerFactor;
  }
  
  /**
   * Update motor temperature (simplified thermal model)
   */
  private updateTemperature(electricalPower: number, dt: number): void {
    const { ratedPower } = this.state.nameplate;
    
    // Temperature rise proportional to losses (power loss = electrical - mechanical)
    const losses = electricalPower - this.state.mechanicalPower;
    const tempRiseMax = 70; // Maximum temperature rise above ambient at rated load
    const normalizedLosses = losses / (ratedPower * (1 - this.state.nameplate.efficiency));
    
    const targetTemp = this.ambientTemperature + tempRiseMax * Math.min(normalizedLosses, 1.5);
    
    // First-order thermal model
    const alpha = 1 - Math.exp(-dt / this.thermalTimeConstant);
    this.state.temperature += (targetTemp - this.state.temperature) * alpha;
    
    // Check for overtemperature fault
    if (this.state.temperature > this.maxTemperature) {
      this.trip(MotorFault.OVERTEMPERATURE);
    }
  }
  
  /**
   * Update VFD output frequency with acceleration/deceleration ramps
   * Also handles direction reversal (phase sequence swap when speed is zero)
   */
  private updateVFDFrequency(dt: number): void {
    const { 
      targetFrequency, 
      outputFrequency, 
      accelerationTime, 
      decelerationTime, 
      maxFrequency,
      targetDirection,
      currentDirection,
      directionChangePending
    } = this.state.vfd;
    
    // Handle direction change logic
    if (directionChangePending) {
      // Direction change is pending - must decelerate to zero first
      if (this.state.shaftSpeed < 0.5 && outputFrequency < 0.5) {
        // Motor has stopped - now safe to swap phase sequence
        this.state.vfd.currentDirection = targetDirection;
        this.state.vfd.directionChangePending = false;
        // Now can accelerate in new direction
      } else {
        // Still need to decelerate - override target to zero
        const rampRate = maxFrequency / decelerationTime;
        const step = rampRate * dt;
        this.state.vfd.outputFrequency = Math.max(0, outputFrequency - step);
        return;
      }
    }
    
    // Normal frequency ramping
    const error = targetFrequency - outputFrequency;
    
    if (Math.abs(error) < 0.01) {
      this.state.vfd.outputFrequency = targetFrequency;
      return;
    }
    
    if (error > 0) {
      // Accelerating
      const rampRate = maxFrequency / accelerationTime; // Hz/s
      const step = rampRate * dt;
      this.state.vfd.outputFrequency = Math.min(outputFrequency + step, targetFrequency);
    } else {
      // Decelerating
      const rampRate = maxFrequency / decelerationTime; // Hz/s
      const step = rampRate * dt;
      this.state.vfd.outputFrequency = Math.max(outputFrequency - step, targetFrequency);
    }
  }
  
  /**
   * Determine operating state based on conditions
   */
  private updateOperatingState(): void {
    if (this.state.fault !== MotorFault.NONE) {
      this.state.operatingState = MotorOperatingState.FAULT;
      return;
    }
    
    const { outputFrequency, targetFrequency } = this.state.vfd;
    
    if (outputFrequency === 0 && this.state.shaftSpeed < 0.01) {
      this.state.operatingState = MotorOperatingState.STOPPED;
    } else if (outputFrequency < targetFrequency) {
      this.state.operatingState = MotorOperatingState.ACCELERATING;
    } else if (outputFrequency > targetFrequency) {
      this.state.operatingState = MotorOperatingState.DECELERATING;
    } else if (this.state.mechanicalPower < 0) {
      this.state.operatingState = MotorOperatingState.REGENERATING;
    } else {
      this.state.operatingState = MotorOperatingState.RUNNING;
    }
  }
  
  /**
   * Main simulation step
   * 
   * @param dt - Time step in seconds
   * @param loadInertia - Total load inertia (kg·m²) - includes motor rotor
   */
  step(dt: number, loadInertia: number = 0): void {
    if (this.state.fault !== MotorFault.NONE) {
      // In fault state, motor coasts down
      const friction = 0.05; // Friction coefficient
      this.state.shaftSpeed *= (1 - friction * dt);
      if (this.state.shaftSpeed < 0.01) this.state.shaftSpeed = 0;
      this.updateTemperature(0, dt);
      return;
    }
    
    this.time += dt;
    
    // Update VFD frequency (ramp toward target)
    this.updateVFDFrequency(dt);
    
    const { outputFrequency } = this.state.vfd;
    const { poles, ratedTorque, breakdownTorqueMultiplier, rotorInertia, powerFactor, efficiency } = this.state.nameplate;
    
    // Calculate synchronous speed at current frequency
    const syncSpeed = calculateSynchronousSpeed(poles, outputFrequency);
    
    // Calculate slip
    if (syncSpeed > 0) {
      this.state.slip = Math.max(0, (syncSpeed - this.state.shaftSpeed) / syncSpeed);
    } else {
      this.state.slip = 0;
    }
    
    // Calculate available motor torque at this slip
    // Scale rated torque by (frequency/rated_frequency)² for constant V/Hz
    const freqRatio = outputFrequency / this.state.nameplate.ratedFrequency;
    const scaledRatedTorque = ratedTorque * freqRatio * freqRatio;
    
    // At very low frequencies, torque is reduced but boosted by V/Hz boost
    let availableTorque = this.calculateTorque(this.state.slip, scaledRatedTorque, breakdownTorqueMultiplier);
    
    // Boost torque at low speeds due to V/Hz boost
    if (outputFrequency > 0 && outputFrequency < 10) {
      availableTorque *= (1 + (10 - outputFrequency) / 20);
    }
    
    // Net torque = motor torque - load torque
    const netTorque = availableTorque - this.state.loadTorque;
    this.state.outputTorque = availableTorque;
    
    // Calculate angular acceleration: α = τ / J
    const totalInertia = rotorInertia + loadInertia;
    const angularAcceleration = netTorque / totalInertia;
    
    // Update shaft speed
    this.state.shaftSpeed += angularAcceleration * dt;
    
    // Prevent negative speed (no reverse without reversing phases)
    if (this.state.shaftSpeed < 0) this.state.shaftSpeed = 0;
    
    // Calculate powers
    this.state.mechanicalPower = this.state.outputTorque * this.state.shaftSpeed;
    this.state.electricalPower = this.state.mechanicalPower / efficiency;
    
    // Calculate current
    const current = this.calculateCurrent(this.state.outputTorque, outputFrequency);
    
    // Check for overcurrent (> 150% rated for > 60 seconds, or > 200% instant trip)
    if (current > this.state.nameplate.ratedCurrent * 2.0) {
      this.trip(MotorFault.OVERCURRENT);
      return;
    }
    
    // Update 3-phase electrical values
    this.updateElectrical(outputFrequency, current, powerFactor);
    
    // Update temperature
    this.updateTemperature(this.state.electricalPower, dt);
    
    // Update operating state
    this.updateOperatingState();
    
    // Update runtime
    if (this.state.shaftSpeed > 0.1) {
      this.state.runtime += dt;
    }
  }
  
  /**
   * Get the effective output angular velocity in rad/s
   * This is what the mechanical system sees.
   * 
   * Returns signed value based on VFD direction setting:
   * - Positive for FORWARD direction
   * - Negative for REVERSE direction
   */
  getOutputSpeed(): number {
    return this.state.shaftSpeed * this.state.vfd.currentDirection;
  }
  
  /**
   * Get the absolute shaft speed (always positive) in rad/s
   */
  getAbsoluteSpeed(): number {
    return this.state.shaftSpeed;
  }
  
  /**
   * Get motor speed as percentage of rated
   */
  getSpeedPercent(): number {
    const ratedSpeed = calculateSynchronousSpeed(
      this.state.nameplate.poles,
      this.state.nameplate.ratedFrequency
    ) * (1 - 0.03); // Account for rated slip
    
    return (this.state.shaftSpeed / ratedSpeed) * 100;
  }
}

/**
 * Create default platform motor simulator
 */
export function createPlatformMotor(): MotorSimulator {
  return new MotorSimulator(MOTOR_SPECS.PLATFORM_MOTOR);
}

/**
 * Create default windmill motor simulator
 */
export function createWindmillMotor(): MotorSimulator {
  return new MotorSimulator(MOTOR_SPECS.WINDMILL_MOTOR);
}

/**
 * Create default hydraulic pump motor simulator
 */
export function createHydraulicMotor(): MotorSimulator {
  return new MotorSimulator(MOTOR_SPECS.HYDRAULIC_MOTOR);
}


