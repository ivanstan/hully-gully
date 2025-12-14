/**
 * Simulation Engine - Balerina Ride Simulator
 * 
 * This module manages the deterministic time-stepping simulation.
 * It is completely independent of rendering.
 * 
 * Responsibilities:
 * - Fixed time step physics updates
 * - State management
 * - Ramping between target values
 * - Direction changes
 * - Pause/resume/reset
 * - Power loss scenarios
 * - Motor simulation with 3-phase electrical system
 */

import {
  SimulationState,
  SimulationConfig,
  OperatorControls,
  RotationDirection,
  CabinState
} from '../types/index.js';
import { updateCabinPhysics } from '../physics/index.js';
import {
  MotorSimulator,
  createPlatformMotor,
  createWindmillMotor,
  createHydraulicMotor,
  MotorState,
  MotorFault,
  MotorDirection,
  radPerSecToRpm,
  rpmToRadPerSec
} from '../motors/index.js';

/**
 * Simulation Engine Class
 * 
 * Manages the physics simulation loop with deterministic time stepping.
 * Includes realistic 3-phase motor simulation with VFD control.
 */
export class SimulationEngine {
  private state: SimulationState;
  private config: SimulationConfig;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastUpdateTime: number = 0;
  private accumulator: number = 0; // For fixed timestep accumulation
  
  // Motor simulators
  private platformMotor: MotorSimulator;
  private windmillMotor: MotorSimulator;
  private hydraulicMotor: MotorSimulator;
  
  // Motor control state
  private useMotorSimulation: boolean = true;
  private hydraulicRunning: boolean = false;
  
  // Gear ratios (motor shaft to platform rotation)
  // These convert high-speed motor rotation to slow platform rotation
  private readonly platformGearRatio = 150; // Motor RPM / Platform RPM
  private readonly windmillGearRatio = 100; // Motor RPM / Windmill RPM
  
  // Load inertia (reflected to motor shaft) in kg·m²
  // J_reflected = J_load / (gear_ratio²)
  private readonly platformLoadInertia = 500; // kg·m² at platform (very heavy ride)
  private readonly windmillLoadInertia = 200; // kg·m² at windmill
  
  /**
   * Create a new simulation engine
   * 
   * @param config - Simulation configuration
   */
  constructor(config: SimulationConfig) {
    this.config = config;
    this.state = this.createInitialState();
    
    // Initialize motors
    this.platformMotor = createPlatformMotor();
    this.windmillMotor = createWindmillMotor();
    this.hydraulicMotor = createHydraulicMotor();
    
    // Set default VFD ramp times for smooth ride operation
    this.platformMotor.setAccelerationTime(8.0);
    this.platformMotor.setDecelerationTime(10.0);
    this.windmillMotor.setAccelerationTime(6.0);
    this.windmillMotor.setDecelerationTime(8.0);
  }
  
  /**
   * Create initial simulation state from configuration
   */
  private createInitialState(): SimulationState {
    const cabins: CabinState[] = [];
    const angleStep = (2 * Math.PI) / this.config.numCabins;
    
    for (let i = 0; i < this.config.numCabins; i++) {
      const cabinAngle = i * angleStep;
      const cabinDistance = this.config.windmillRadius; // Place cabins at the edge of the skirt (windmill radius)
      
      cabins.push({
        platformAngle: cabinAngle,
        distanceFromCenter: cabinDistance,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
        radialAcceleration: 0,
        tangentialAcceleration: 0,
        totalAcceleration: 0,
        gForce: 0
      });
    }
    
    return {
      time: 0,
      platform: {
        angularVelocity: this.config.initialControls.platformSpeed,
        direction: this.config.initialControls.platformDirection,
        targetAngularVelocity: this.config.initialControls.platformSpeed
      },
      tilt: {
        pivotRadius: this.config.pivotRadius,
        tiltAngle: this.config.initialControls.tiltAngle,
        targetTiltAngle: this.config.initialControls.tiltAngle,
        secondaryPlatformOffset: this.config.secondaryPlatformOffset
      },
      windmill: {
        angularVelocity: this.config.initialControls.windmillSpeed,
        direction: this.config.initialControls.windmillDirection,
        targetAngularVelocity: this.config.initialControls.windmillSpeed
      },
      platformPhase: 0,
      windmillPhase: 0,
      cabins
    };
  }
  
  /**
   * Get current simulation state (read-only)
   */
  getState(): Readonly<SimulationState> {
    return this.state;
  }
  
  /**
   * Get simulation configuration (read-only)
   */
  getConfig(): Readonly<SimulationConfig> {
    return this.config;
  }
  
  /**
   * Update operator controls (targets for ramping)
   * 
   * @param controls - New target control values
   */
  updateControls(controls: Partial<OperatorControls>): void {
    if (controls.platformSpeed !== undefined) {
      this.state.platform.targetAngularVelocity = controls.platformSpeed;
    }
    if (controls.windmillSpeed !== undefined) {
      this.state.windmill.targetAngularVelocity = controls.windmillSpeed;
    }
    if (controls.tiltAngle !== undefined) {
      // Clamp to valid range
      const clamped = Math.max(
        this.config.minTiltAngle,
        Math.min(this.config.maxTiltAngle, controls.tiltAngle)
      );
      this.state.tilt.targetTiltAngle = clamped;
    }
    if (controls.platformDirection !== undefined) {
      this.state.platform.direction = controls.platformDirection;
    }
    if (controls.windmillDirection !== undefined) {
      this.state.windmill.direction = controls.windmillDirection;
    }
  }
  
  /**
   * Ramp a value toward a target using exponential approach
   * 
   * @param current - Current value
   * @param target - Target value
   * @param timeConstant - Time constant for ramping (s)
   * @param dt - Time step (s)
   * @returns New value after ramping
   */
  private rampValue(
    current: number,
    target: number,
    timeConstant: number,
    dt: number
  ): number {
    if (timeConstant <= 0) {
      return target; // Instant change
    }
    const alpha = 1 - Math.exp(-dt / timeConstant);
    return current + (target - current) * alpha;
  }
  
  /**
   * Update simulation state by one time step
   * 
   * @param dt - Time step (s) - should be fixed for determinism
   */
  step(dt: number): void {
    if (this.isPaused) {
      return;
    }
    
    if (this.useMotorSimulation) {
      // =========================================
      // MOTOR-BASED VELOCITY CONTROL
      // =========================================
      
      // Calculate load torque for each motor
      const platformLoadTorque = this.calculateLoadTorque(
        this.platformMotor.getState().shaftSpeed,
        this.platformMotor.getState().nameplate.ratedTorque
      );
      const windmillLoadTorque = this.calculateLoadTorque(
        this.windmillMotor.getState().shaftSpeed,
        this.windmillMotor.getState().nameplate.ratedTorque
      );
      
      // Set load torques
      this.platformMotor.setLoadTorque(platformLoadTorque);
      this.windmillMotor.setLoadTorque(windmillLoadTorque);
      this.hydraulicMotor.setLoadTorque(
        this.hydraulicRunning ? this.hydraulicMotor.getState().nameplate.ratedTorque * 0.6 : 0
      );
      
      // Calculate reflected inertia (J_load / gear_ratio²)
      const platformReflectedInertia = this.platformLoadInertia / (this.platformGearRatio * this.platformGearRatio);
      const windmillReflectedInertia = this.windmillLoadInertia / (this.windmillGearRatio * this.windmillGearRatio);
      
      // Step motor simulations
      this.platformMotor.step(dt, platformReflectedInertia);
      this.windmillMotor.step(dt, windmillReflectedInertia);
      this.hydraulicMotor.step(dt, 0.01); // Small pump inertia
      
      // Get motor output speeds and convert to platform/windmill speeds
      // Motor output speed is already signed based on VFD direction (phase sequence)
      const platformMotorSpeed = this.platformMotor.getOutputSpeed();
      const windmillMotorSpeed = this.windmillMotor.getOutputSpeed();
      
      // Apply gear ratio to get actual platform speeds
      // Direction is already handled by VFD phase sequence
      this.state.platform.angularVelocity = this.motorSpeedToPlatformSpeed(platformMotorSpeed);
      this.state.windmill.angularVelocity = this.motorSpeedToWindmillSpeed(windmillMotorSpeed);
      
    } else {
      // =========================================
      // SIMPLE RAMPING MODEL (original behavior)
      // =========================================
      
      // Ramp platform angular velocity toward target
      this.state.platform.angularVelocity = this.rampValue(
        this.state.platform.angularVelocity,
        this.state.platform.targetAngularVelocity * this.state.platform.direction,
        this.config.ramping.platformRampTime,
        dt
      );
      
      // Ramp windmill angular velocity toward target
      this.state.windmill.angularVelocity = this.rampValue(
        this.state.windmill.angularVelocity,
        this.state.windmill.targetAngularVelocity * this.state.windmill.direction,
        this.config.ramping.windmillRampTime,
        dt
      );
    }
    
    // Ramp tilt angle toward target (always uses simple ramping - hydraulic controlled)
    this.state.tilt.tiltAngle = this.rampValue(
      this.state.tilt.tiltAngle,
      this.state.tilt.targetTiltAngle,
      this.config.ramping.tiltRampTime,
      dt
    );
    
    // Update phases (integrate angular velocities)
    this.state.platformPhase += this.state.platform.angularVelocity * dt;
    this.state.windmillPhase += this.state.windmill.angularVelocity * dt;
    
    // Normalize phases to [0, 2π)
    this.state.platformPhase = this.state.platformPhase % (2 * Math.PI);
    if (this.state.platformPhase < 0) {
      this.state.platformPhase += 2 * Math.PI;
    }
    this.state.windmillPhase = this.state.windmillPhase % (2 * Math.PI);
    if (this.state.windmillPhase < 0) {
      this.state.windmillPhase += 2 * Math.PI;
    }
    
    // Update cabin physics
    for (let i = 0; i < this.state.cabins.length; i++) {
      const cabin = this.state.cabins[i];
      this.state.cabins[i] = updateCabinPhysics(
        cabin.platformAngle,
        cabin.distanceFromCenter,
        this.state,
        dt
      );
    }
    
    // Advance simulation time
    this.state.time += dt;
  }
  
  /**
   * Update simulation using fixed timestep with accumulator
   * 
   * This ensures deterministic physics regardless of frame rate.
   * 
   * @param currentTime - Current real time (s)
   */
  update(currentTime: number): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }
    
    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = currentTime;
      return;
    }
    
    const frameTime = currentTime - this.lastUpdateTime;
    this.lastUpdateTime = currentTime;
    
    // Accumulate time and step physics at fixed intervals
    this.accumulator += frameTime;
    const fixedDt = this.config.timeStep;
    
    while (this.accumulator >= fixedDt) {
      this.step(fixedDt);
      this.accumulator -= fixedDt;
    }
  }
  
  /**
   * Start the simulation
   */
  start(): void {
    this.isRunning = true;
    this.isPaused = false;
    this.lastUpdateTime = 0;
  }
  
  /**
   * Pause the simulation
   */
  pause(): void {
    this.isPaused = true;
  }
  
  /**
   * Resume the simulation
   */
  resume(): void {
    this.isPaused = false;
  }
  
  /**
   * Stop and reset the simulation
   */
  reset(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.state = this.createInitialState();
    this.lastUpdateTime = 0;
    this.accumulator = 0;
  }
  
  /**
   * Simulate power loss (physics continues, but no operator control)
   * Angular velocities decay naturally
   * 
   * @param decayRate - Decay rate (1/s)
   */
  simulatePowerLoss(decayRate: number = 0.1): void {
    // Trip all motors - they will coast down
    this.platformMotor.trip(MotorFault.PHASE_LOSS);
    this.windmillMotor.trip(MotorFault.PHASE_LOSS);
    this.hydraulicMotor.trip(MotorFault.PHASE_LOSS);
  }
  
  /**
   * Check if simulation is running
   */
  isSimulationRunning(): boolean {
    return this.isRunning && !this.isPaused;
  }
  
  // =========================================
  // MOTOR CONTROL METHODS
  // =========================================
  
  /**
   * Get platform motor state
   */
  getPlatformMotorState(): Readonly<MotorState> {
    return this.platformMotor.getState();
  }
  
  /**
   * Get windmill motor state
   */
  getWindmillMotorState(): Readonly<MotorState> {
    return this.windmillMotor.getState();
  }
  
  /**
   * Get hydraulic motor state
   */
  getHydraulicMotorState(): Readonly<MotorState> {
    return this.hydraulicMotor.getState();
  }
  
  /**
   * Set platform motor VFD frequency
   * 
   * @param frequency - Target frequency in Hz (0-60)
   */
  setPlatformMotorFrequency(frequency: number): void {
    this.platformMotor.setTargetFrequency(frequency);
  }
  
  /**
   * Set windmill motor VFD frequency
   * 
   * @param frequency - Target frequency in Hz (0-60)
   */
  setWindmillMotorFrequency(frequency: number): void {
    this.windmillMotor.setTargetFrequency(frequency);
  }
  
  /**
   * Set platform motor direction via VFD
   * 
   * The VFD reverses motor direction by swapping phase sequence:
   * - Forward: A-B-C phase sequence
   * - Reverse: A-C-B phase sequence (B and C swapped)
   * 
   * Direction change is safe - VFD decelerates to zero before reversing.
   * 
   * @param direction - MotorDirection.FORWARD or MotorDirection.REVERSE
   */
  setPlatformMotorDirection(direction: MotorDirection): void {
    this.platformMotor.setDirection(direction);
  }
  
  /**
   * Set windmill motor direction via VFD
   * 
   * @param direction - MotorDirection.FORWARD or MotorDirection.REVERSE
   */
  setWindmillMotorDirection(direction: MotorDirection): void {
    this.windmillMotor.setDirection(direction);
  }
  
  /**
   * Convert RotationDirection to MotorDirection
   */
  rotationToMotorDirection(rotDir: RotationDirection): MotorDirection {
    return rotDir === RotationDirection.COUNTER_CLOCKWISE 
      ? MotorDirection.FORWARD 
      : MotorDirection.REVERSE;
  }
  
  /**
   * Start hydraulic pump motor
   */
  startHydraulicMotor(): void {
    this.hydraulicRunning = true;
    this.hydraulicMotor.setTargetFrequency(50); // Run at line frequency
  }
  
  /**
   * Stop hydraulic pump motor
   */
  stopHydraulicMotor(): void {
    this.hydraulicRunning = false;
    this.hydraulicMotor.setTargetFrequency(0);
  }
  
  /**
   * Emergency stop all motors
   */
  emergencyStopMotors(): void {
    this.platformMotor.setTargetFrequency(0);
    this.windmillMotor.setTargetFrequency(0);
    this.hydraulicMotor.setTargetFrequency(0);
    this.hydraulicRunning = false;
  }
  
  /**
   * Reset all motor faults
   */
  resetMotorFaults(): void {
    this.platformMotor.reset();
    this.windmillMotor.reset();
    this.hydraulicMotor.reset();
  }
  
  /**
   * Enable or disable motor simulation
   * When disabled, uses simple ramping model
   */
  setMotorSimulationEnabled(enabled: boolean): void {
    this.useMotorSimulation = enabled;
  }
  
  /**
   * Check if motor simulation is enabled
   */
  isMotorSimulationEnabled(): boolean {
    return this.useMotorSimulation;
  }
  
  /**
   * Convert platform angular velocity (rad/s) to required motor frequency (Hz)
   * 
   * @param platformSpeed - Desired platform angular velocity (rad/s)
   * @returns Required VFD frequency (Hz)
   */
  platformSpeedToMotorFrequency(platformSpeed: number): number {
    // Platform speed in rad/s → RPM
    const platformRpm = radPerSecToRpm(Math.abs(platformSpeed));
    // Motor RPM needed (through gear ratio)
    const motorRpm = platformRpm * this.platformGearRatio;
    // Motor synchronous speed at 50Hz for 4-pole motor: 1500 RPM
    // Frequency = (Motor RPM × poles) / 120
    const frequency = (motorRpm * 4) / 120;
    return Math.min(60, Math.max(0, frequency));
  }
  
  /**
   * Convert windmill angular velocity (rad/s) to required motor frequency (Hz)
   * 
   * @param windmillSpeed - Desired windmill angular velocity (rad/s)
   * @returns Required VFD frequency (Hz)
   */
  windmillSpeedToMotorFrequency(windmillSpeed: number): number {
    const windmillRpm = radPerSecToRpm(Math.abs(windmillSpeed));
    const motorRpm = windmillRpm * this.windmillGearRatio;
    const frequency = (motorRpm * 4) / 120;
    return Math.min(60, Math.max(0, frequency));
  }
  
  /**
   * Convert motor shaft speed to platform angular velocity
   * 
   * @param motorSpeed - Motor shaft speed (rad/s)
   * @returns Platform angular velocity (rad/s)
   */
  private motorSpeedToPlatformSpeed(motorSpeed: number): number {
    return motorSpeed / this.platformGearRatio;
  }
  
  /**
   * Convert motor shaft speed to windmill angular velocity
   * 
   * @param motorSpeed - Motor shaft speed (rad/s)
   * @returns Windmill angular velocity (rad/s)
   */
  private motorSpeedToWindmillSpeed(motorSpeed: number): number {
    return motorSpeed / this.windmillGearRatio;
  }
  
  /**
   * Calculate load torque on motor based on acceleration needs
   * Simplified model: T_load = friction + some dynamic load
   * 
   * @param motorSpeed - Current motor speed (rad/s)
   * @param ratedTorque - Motor rated torque (Nm)
   * @returns Load torque (Nm)
   */
  private calculateLoadTorque(motorSpeed: number, ratedTorque: number): number {
    // Base friction load (10% of rated at full speed)
    const frictionTorque = ratedTorque * 0.1 * (motorSpeed / 150);
    // Some additional load variation
    const loadVariation = ratedTorque * 0.05 * Math.sin(this.state.time * 0.5);
    return Math.max(0, frictionTorque + loadVariation);
  }
}

