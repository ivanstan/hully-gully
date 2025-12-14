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
 */

import {
  SimulationState,
  SimulationConfig,
  OperatorControls,
  RotationDirection,
  CabinState
} from '../types/index.js';
import { updateCabinPhysics } from '../physics/index.js';

/**
 * Simulation Engine Class
 * 
 * Manages the physics simulation loop with deterministic time stepping.
 */
export class SimulationEngine {
  private state: SimulationState;
  private config: SimulationConfig;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastUpdateTime: number = 0;
  private accumulator: number = 0; // For fixed timestep accumulation
  
  /**
   * Create a new simulation engine
   * 
   * @param config - Simulation configuration
   */
  constructor(config: SimulationConfig) {
    this.config = config;
    this.state = this.createInitialState();
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
      eccentric: {
        radius: this.config.initialControls.eccentricRadius,
        targetRadius: this.config.initialControls.eccentricRadius
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
    if (controls.eccentricRadius !== undefined) {
      // Clamp to valid range
      const clamped = Math.max(
        this.config.minEccentricRadius,
        Math.min(this.config.maxEccentricRadius, controls.eccentricRadius)
      );
      this.state.eccentric.targetRadius = clamped;
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
    
    // Ramp eccentric radius toward target
    this.state.eccentric.radius = this.rampValue(
      this.state.eccentric.radius,
      this.state.eccentric.targetRadius,
      this.config.ramping.radiusRampTime,
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
    // In power loss, velocities decay exponentially
    // This would be implemented in the step() method
    // For now, this is a placeholder for the concept
  }
  
  /**
   * Check if simulation is running
   */
  isSimulationRunning(): boolean {
    return this.isRunning && !this.isPaused;
  }
}

