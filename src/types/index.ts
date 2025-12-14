/**
 * Core Type Definitions for Balerina Ride Simulator
 * 
 * All physical quantities use SI units:
 * - Distance: meters (m)
 * - Time: seconds (s)
 * - Angle: radians (rad)
 * - Angular velocity: rad/s
 * - Acceleration: m/s²
 * - G-force: dimensionless (multiples of 9.81 m/s²)
 */

/**
 * 2D vector in the horizontal plane (x, y)
 * Used for positions, velocities, and accelerations
 */
export interface Vector2D {
  x: number;
  y: number;
}

/**
 * Complete 3D position vector
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Rotation direction
 */
export enum RotationDirection {
  CLOCKWISE = -1,
  COUNTER_CLOCKWISE = 1
}

/**
 * Platform parameters (main rotating platform)
 */
export interface PlatformParams {
  /** Angular velocity of main platform (rad/s) */
  angularVelocity: number;
  /** Rotation direction */
  direction: RotationDirection;
  /** Target angular velocity (for ramping) */
  targetAngularVelocity: number;
}

/**
 * Eccentric (windmill) parameters
 */
export interface EccentricParams {
  /** Angular velocity of eccentric rotation (rad/s) */
  angularVelocity: number;
  /** Rotation direction */
  direction: RotationDirection;
  /** Current eccentric radius (m) - distance from platform center to eccentric center */
  radius: number;
  /** Target radius (for hydraulic control) */
  targetRadius: number;
  /** Target angular velocity (for ramping) */
  targetAngularVelocity: number;
}

/**
 * Cabin state (fixed to platform, no free rotation)
 */
export interface CabinState {
  /** Position on platform (angle from platform center, rad) */
  platformAngle: number;
  /** Distance from platform center (m) */
  distanceFromCenter: number;
  /** Current 3D position in world coordinates (m) */
  position: Vector3D;
  /** Current velocity vector (m/s) */
  velocity: Vector3D;
  /** Current acceleration vector (m/s²) */
  acceleration: Vector3D;
  /** Radial acceleration magnitude (m/s²) */
  radialAcceleration: number;
  /** Tangential acceleration magnitude (m/s²) */
  tangentialAcceleration: number;
  /** Total acceleration magnitude (m/s²) */
  totalAcceleration: number;
  /** Experienced G-force (dimensionless) */
  gForce: number;
}

/**
 * Complete simulation state at a point in time
 */
export interface SimulationState {
  /** Simulation time (s) */
  time: number;
  /** Main platform parameters */
  platform: PlatformParams;
  /** Eccentric parameters */
  eccentric: EccentricParams;
  /** Current phase angle of platform rotation (rad) */
  platformPhase: number;
  /** Current phase angle of eccentric rotation (rad) */
  eccentricPhase: number;
  /** Array of cabin states */
  cabins: CabinState[];
}

/**
 * Operator control targets
 * These are desired values that the simulation will ramp toward
 */
export interface OperatorControls {
  /** Target platform angular velocity (rad/s) */
  platformSpeed: number;
  /** Target eccentric angular velocity (rad/s) */
  eccentricSpeed: number;
  /** Target eccentric radius (m) */
  eccentricRadius: number;
  /** Platform rotation direction */
  platformDirection: RotationDirection;
  /** Eccentric rotation direction */
  eccentricDirection: RotationDirection;
}

/**
 * Ramping parameters for smooth transitions
 */
export interface RampParams {
  /** Time constant for platform velocity ramping (s) */
  platformRampTime: number;
  /** Time constant for eccentric velocity ramping (s) */
  eccentricRampTime: number;
  /** Time constant for radius ramping (s) */
  radiusRampTime: number;
}

/**
 * Simulation configuration
 */
export interface SimulationConfig {
  /** Fixed time step for physics (s) */
  timeStep: number;
  /** Number of cabins */
  numCabins: number;
  /** Radius of main platform (m) */
  platformRadius: number;
  /** Minimum eccentric radius (m) */
  minEccentricRadius: number;
  /** Maximum eccentric radius (m) */
  maxEccentricRadius: number;
  /** Ramping parameters */
  ramping: RampParams;
  /** Initial operator controls */
  initialControls: OperatorControls;
}

/**
 * Time-series data point for logging/plotting
 */
export interface DataPoint {
  time: number;
  platformPhase: number;
  eccentricPhase: number;
  platformAngularVelocity: number;
  eccentricAngularVelocity: number;
  eccentricRadius: number;
  cabinData: Array<{
    gForce: number;
    totalAcceleration: number;
    radialAcceleration: number;
    tangentialAcceleration: number;
  }>;
}

