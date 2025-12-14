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
 * Tilt mechanism parameters
 * 
 * The secondary platform (windmill) tilts about a pivot axis that is tangent
 * to both platforms. The pivot point is located at the edge of the primary
 * platform, where the secondary platform touches it.
 * 
 * Geometry:
 * - The pivot axis is perpendicular to the line from platform center to pivot point
 * - The pivot point is at distance pivotRadius from the platform center
 * - The tilt angle determines how much the secondary platform is inclined
 * - The secondary platform center is offset from the pivot point
 * 
 * Note: Pivot point rotates with the main platform (fixed relative to platform)
 */
export interface TiltParams {
  /** Distance from platform center to pivot point (m) - point of tangency */
  pivotRadius: number;
  /** Current tilt angle (rad) - angle between primary and secondary platforms */
  tiltAngle: number;
  /** Target tilt angle (for hydraulic control) */
  targetTiltAngle: number;
  /** Distance from pivot point to secondary platform center along the tilt (m) */
  secondaryPlatformOffset: number;
}

/**
 * Windmill parameters (secondary platform: skirt + cabins)
 * The windmill motor rotates the secondary platform around the skirt center
 */
export interface WindmillParams {
  /** Angular velocity of windmill rotation (rad/s) */
  angularVelocity: number;
  /** Rotation direction */
  direction: RotationDirection;
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
  /** Tilt mechanism parameters (replaces old eccentric model) */
  tilt: TiltParams;
  /** Windmill parameters (secondary platform) */
  windmill: WindmillParams;
  /** Current phase angle of platform rotation (rad) */
  platformPhase: number;
  /** Current phase angle of windmill rotation (rad) - rotation around skirt center */
  windmillPhase: number;
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
  /** Target windmill angular velocity (rad/s) */
  windmillSpeed: number;
  /** Target tilt angle (rad) - angle between primary and secondary platforms */
  tiltAngle: number;
  /** Platform rotation direction */
  platformDirection: RotationDirection;
  /** Windmill rotation direction */
  windmillDirection: RotationDirection;
}

/**
 * Ramping parameters for smooth transitions
 */
export interface RampParams {
  /** Time constant for platform velocity ramping (s) */
  platformRampTime: number;
  /** Time constant for windmill velocity ramping (s) */
  windmillRampTime: number;
  /** Time constant for tilt angle ramping (s) */
  tiltRampTime: number;
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
  /** Radius of windmill/secondary platform (m) */
  windmillRadius: number;
  /** Distance from platform center to pivot point (m) - point of tangency */
  pivotRadius: number;
  /** Distance from pivot point to secondary platform center (m) */
  secondaryPlatformOffset: number;
  /** Minimum tilt angle (rad) */
  minTiltAngle: number;
  /** Maximum tilt angle (rad) */
  maxTiltAngle: number;
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
  windmillPhase: number;
  platformAngularVelocity: number;
  windmillAngularVelocity: number;
  tiltAngle: number;
  cabinData: Array<{
    gForce: number;
    totalAcceleration: number;
    radialAcceleration: number;
    tangentialAcceleration: number;
  }>;
}

