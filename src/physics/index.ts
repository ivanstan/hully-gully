/**
 * Physics Module - Balerina Ride Simulator
 * 
 * This module contains all physics calculations with explicit equations.
 * No hidden physics engines - all math is visible and documented.
 * 
 * The motion is a superposition of:
 * 1. Main platform rotation around vertical axis
 * 2. Eccentric (windmill) rotation with variable radius
 * 3. Cabins fixed to platform at specific positions
 * 
 * All calculations use SI units and are deterministic.
 */

import { Vector2D, Vector3D, CabinState, SimulationState } from '../types/index.js';

/**
 * Compute the position of a cabin in world coordinates
 * 
 * Equations:
 * - Platform center rotates: (0, 0) in platform frame
 * - Eccentric center: r_ecc * (cos(θ_ecc), sin(θ_ecc)) in platform frame
 * - Cabin position: eccentric_center + cabin_offset in platform frame
 * - Transform to world: rotate by platform angle θ_plat
 * 
 * @param cabinAngle - Angle of cabin on platform (rad)
 * @param cabinDistance - Distance from platform center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param eccentricPhase - Current eccentric rotation phase (rad)
 * @param eccentricRadius - Current eccentric radius (m)
 * @returns 3D position vector (z = 0 for horizontal plane)
 */
export function computeCabinPosition(
  cabinAngle: number,
  cabinDistance: number,
  platformPhase: number,
  eccentricPhase: number,
  eccentricRadius: number
): Vector3D {
  // Eccentric center position in platform frame
  const eccCenterX = eccentricRadius * Math.cos(eccentricPhase);
  const eccCenterY = eccentricRadius * Math.sin(eccentricPhase);
  
  // Cabin position relative to platform center (in platform frame)
  const cabinX = eccCenterX + cabinDistance * Math.cos(cabinAngle);
  const cabinY = eccCenterY + cabinDistance * Math.sin(cabinAngle);
  
  // Rotate to world frame by platform phase
  const cosPlat = Math.cos(platformPhase);
  const sinPlat = Math.sin(platformPhase);
  const worldX = cabinX * cosPlat - cabinY * sinPlat;
  const worldY = cabinX * sinPlat + cabinY * cosPlat;
  
  return { x: worldX, y: worldY, z: 0 };
}

/**
 * Compute the velocity of a cabin using time derivatives
 * 
 * Velocity = d(position)/dt
 * 
 * @param cabinAngle - Angle of cabin on platform (rad)
 * @param cabinDistance - Distance from platform center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param platformAngularVelocity - Platform angular velocity (rad/s)
 * @param eccentricPhase - Current eccentric rotation phase (rad)
 * @param eccentricAngularVelocity - Eccentric angular velocity (rad/s)
 * @param eccentricRadius - Current eccentric radius (m)
 * @param eccentricRadiusVelocity - Rate of change of eccentric radius (m/s)
 * @returns 3D velocity vector
 */
export function computeCabinVelocity(
  cabinAngle: number,
  cabinDistance: number,
  platformPhase: number,
  platformAngularVelocity: number,
  eccentricPhase: number,
  eccentricAngularVelocity: number,
  eccentricRadius: number,
  eccentricRadiusVelocity: number
): Vector3D {
  // Time derivatives in platform frame
  const cosEcc = Math.cos(eccentricPhase);
  const sinEcc = Math.sin(eccentricPhase);
  
  // Derivative of eccentric center position in platform frame
  // d/dt [r_ecc * (cos(θ_ecc), sin(θ_ecc))]
  const deccCenterX = eccentricRadiusVelocity * cosEcc - eccentricRadius * eccentricAngularVelocity * sinEcc;
  const deccCenterY = eccentricRadiusVelocity * sinEcc + eccentricRadius * eccentricAngularVelocity * cosEcc;
  
  // Cabin position in platform frame (eccentric center + cabin offset)
  const cabinX_plat = eccentricRadius * cosEcc + cabinDistance * Math.cos(cabinAngle);
  const cabinY_plat = eccentricRadius * sinEcc + cabinDistance * Math.sin(cabinAngle);
  
  // Derivative of cabin position in platform frame
  const dcabinX_plat = deccCenterX; // Cabin is fixed relative to eccentric
  const dcabinY_plat = deccCenterY;
  
  // Transform to world frame: rotate by platform phase
  // World position = R(θ_plat) * platform_position
  // World velocity = R(θ_plat) * platform_velocity + dR/dθ * platform_position * ω_plat
  const cosPlat = Math.cos(platformPhase);
  const sinPlat = Math.sin(platformPhase);
  
  // Rotated velocity component
  const velRotX = dcabinX_plat * cosPlat - dcabinY_plat * sinPlat;
  const velRotY = dcabinX_plat * sinPlat + dcabinY_plat * cosPlat;
  
  // Additional term from platform rotation (Coriolis-like effect)
  const velPlatX = -platformAngularVelocity * (cabinX_plat * sinPlat + cabinY_plat * cosPlat);
  const velPlatY = platformAngularVelocity * (cabinX_plat * cosPlat - cabinY_plat * sinPlat);
  
  const worldX = velRotX + velPlatX;
  const worldY = velRotY + velPlatY;
  
  return { x: worldX, y: worldY, z: 0 };
}

/**
 * Compute the acceleration of a cabin
 * 
 * Acceleration = d(velocity)/dt
 * Includes:
 * - Centripetal acceleration from platform rotation
 * - Centripetal acceleration from eccentric rotation
 * - Coriolis effects
 * - Tangential acceleration from angular acceleration
 * 
 * @param cabinAngle - Angle of cabin on platform (rad)
 * @param cabinDistance - Distance from platform center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param platformAngularVelocity - Platform angular velocity (rad/s)
 * @param platformAngularAcceleration - Platform angular acceleration (rad/s²)
 * @param eccentricPhase - Current eccentric rotation phase (rad)
 * @param eccentricAngularVelocity - Eccentric angular velocity (rad/s)
 * @param eccentricAngularAcceleration - Eccentric angular acceleration (rad/s²)
 * @param eccentricRadius - Current eccentric radius (m)
 * @param eccentricRadiusVelocity - Rate of change of eccentric radius (m/s)
 * @param eccentricRadiusAcceleration - Second derivative of eccentric radius (m/s²)
 * @returns 3D acceleration vector
 */
export function computeCabinAcceleration(
  cabinAngle: number,
  cabinDistance: number,
  platformPhase: number,
  platformAngularVelocity: number,
  platformAngularAcceleration: number,
  eccentricPhase: number,
  eccentricAngularVelocity: number,
  eccentricAngularAcceleration: number,
  eccentricRadius: number,
  eccentricRadiusVelocity: number,
  eccentricRadiusAcceleration: number
): Vector3D {
  // This is the full second derivative calculation
  // For now, we'll compute it numerically from velocity differences
  // A full analytical solution would be more complex but more accurate
  
  // Compute acceleration components in platform frame first
  const cosEcc = Math.cos(eccentricPhase);
  const sinEcc = Math.sin(eccentricPhase);
  
  // Eccentric center position in platform frame
  const eccX_plat = eccentricRadius * cosEcc;
  const eccY_plat = eccentricRadius * sinEcc;
  
  // Eccentric center velocity in platform frame
  const eccVX_plat = eccentricRadiusVelocity * cosEcc - eccentricRadius * eccentricAngularVelocity * sinEcc;
  const eccVY_plat = eccentricRadiusVelocity * sinEcc + eccentricRadius * eccentricAngularVelocity * cosEcc;
  
  // Eccentric center acceleration in platform frame
  // d²/dt² [r_ecc * (cos(θ_ecc), sin(θ_ecc))]
  const accEccX_plat = (eccentricRadiusAcceleration - eccentricRadius * eccentricAngularVelocity * eccentricAngularVelocity) * cosEcc
    - (2 * eccentricRadiusVelocity * eccentricAngularVelocity + eccentricRadius * eccentricAngularAcceleration) * sinEcc;
  const accEccY_plat = (eccentricRadiusAcceleration - eccentricRadius * eccentricAngularVelocity * eccentricAngularVelocity) * sinEcc
    + (2 * eccentricRadiusVelocity * eccentricAngularVelocity + eccentricRadius * eccentricAngularAcceleration) * cosEcc;
  
  // Cabin position in platform frame
  const cabinX_plat = eccX_plat + cabinDistance * Math.cos(cabinAngle);
  const cabinY_plat = eccY_plat + cabinDistance * Math.sin(cabinAngle);
  
  // Cabin velocity in platform frame (same as eccentric since cabin is fixed to it)
  const cabinVX_plat = eccVX_plat;
  const cabinVY_plat = eccVY_plat;
  
  // Cabin acceleration in platform frame
  const cabinAccX_plat = accEccX_plat;
  const cabinAccY_plat = accEccY_plat;
  
  // Transform to world frame: R(θ_plat) rotates platform frame to world frame
  // World acceleration = R(θ) * a_plat + 2*ω × (R(θ) * v_plat) + ω × (ω × (R(θ) * r_plat))
  const cosPlat = Math.cos(platformPhase);
  const sinPlat = Math.sin(platformPhase);
  
  // Rotate position, velocity, and acceleration to world frame
  const rWorldX = cabinX_plat * cosPlat - cabinY_plat * sinPlat;
  const rWorldY = cabinX_plat * sinPlat + cabinY_plat * cosPlat;
  
  const vWorldX = cabinVX_plat * cosPlat - cabinVY_plat * sinPlat;
  const vWorldY = cabinVX_plat * sinPlat + cabinVY_plat * cosPlat;
  
  const aWorldX_rot = cabinAccX_plat * cosPlat - cabinAccY_plat * sinPlat;
  const aWorldY_rot = cabinAccX_plat * sinPlat + cabinAccY_plat * cosPlat;
  
  // Coriolis term: 2 * ω × v
  const coriolisX = -2 * platformAngularVelocity * vWorldY;
  const coriolisY = 2 * platformAngularVelocity * vWorldX;
  
  // Centripetal term: ω × (ω × r) = -ω² * r
  const centripetalX = -platformAngularVelocity * platformAngularVelocity * rWorldX;
  const centripetalY = -platformAngularVelocity * platformAngularVelocity * rWorldY;
  
  // Euler term (angular acceleration): α × r (if platformAngularAcceleration != 0)
  const eulerX = -platformAngularAcceleration * rWorldY;
  const eulerY = platformAngularAcceleration * rWorldX;
  
  // Total acceleration in world frame
  const worldAccX = aWorldX_rot + coriolisX + centripetalX + eulerX;
  const worldAccY = aWorldY_rot + coriolisY + centripetalY + eulerY;
  
  return { x: worldAccX, y: worldAccY, z: 0 };
}

/**
 * Decompose acceleration into radial and tangential components
 * 
 * @param acceleration - Total acceleration vector
 * @param position - Current position vector
 * @param velocity - Current velocity vector
 * @returns Object with radial and tangential acceleration magnitudes
 */
export function decomposeAcceleration(
  acceleration: Vector3D,
  position: Vector3D,
  velocity: Vector3D
): { radial: number; tangential: number } {
  // Radial acceleration: component along position vector (toward/away from origin)
  const positionMagnitude = Math.sqrt(position.x * position.x + position.y * position.y);
  if (positionMagnitude < 1e-10) {
    return { radial: 0, tangential: Math.sqrt(acceleration.x * acceleration.x + acceleration.y * acceleration.y) };
  }
  
  const radialUnitX = position.x / positionMagnitude;
  const radialUnitY = position.y / positionMagnitude;
  const radialAcc = acceleration.x * radialUnitX + acceleration.y * radialUnitY;
  
  // Tangential acceleration: component perpendicular to position vector
  const tangentialUnitX = -radialUnitY;
  const tangentialUnitY = radialUnitX;
  const tangentialAcc = acceleration.x * tangentialUnitX + acceleration.y * tangentialUnitY;
  
  return {
    radial: radialAcc,
    tangential: tangentialAcc
  };
}

/**
 * Compute G-force from acceleration
 * 
 * G-force = |acceleration| / g
 * where g = 9.81 m/s²
 * 
 * @param acceleration - Acceleration vector (m/s²)
 * @returns G-force (dimensionless)
 */
export function computeGForce(acceleration: Vector3D): number {
  const g = 9.81; // Standard gravity (m/s²)
  const magnitude = Math.sqrt(
    acceleration.x * acceleration.x +
    acceleration.y * acceleration.y +
    acceleration.z * acceleration.z
  );
  return magnitude / g;
}

/**
 * Update cabin state with all physics calculations
 * 
 * This is the main entry point for physics calculations per cabin.
 * 
 * @param cabinAngle - Angle of cabin on platform (rad)
 * @param cabinDistance - Distance from platform center (m)
 * @param state - Current simulation state
 * @param dt - Time step (s)
 * @returns Updated cabin state
 */
export function updateCabinPhysics(
  cabinAngle: number,
  cabinDistance: number,
  state: SimulationState,
  dt: number
): CabinState {
  // Compute position using explicit equations
  const position = computeCabinPosition(
    cabinAngle,
    cabinDistance,
    state.platformPhase,
    state.eccentricPhase,
    state.eccentric.radius
  );
  
  // Compute velocity using time derivatives
  // For now, assume radius velocity is zero (will be computed from ramping later)
  const eccentricRadiusVelocity = 0; // TODO: compute from ramping
  const velocity = computeCabinVelocity(
    cabinAngle,
    cabinDistance,
    state.platformPhase,
    state.platform.angularVelocity,
    state.eccentricPhase,
    state.eccentric.angularVelocity,
    state.eccentric.radius,
    eccentricRadiusVelocity
  );
  
  // Compute acceleration using second derivatives
  // For now, assume angular accelerations and radius acceleration are zero
  // (These will be computed from ramping in the future)
  const platformAngularAcceleration = 0; // TODO: compute from ramping
  const eccentricAngularAcceleration = 0; // TODO: compute from ramping
  const eccentricRadiusAcceleration = 0; // TODO: compute from ramping
  
  const acceleration = computeCabinAcceleration(
    cabinAngle,
    cabinDistance,
    state.platformPhase,
    state.platform.angularVelocity,
    platformAngularAcceleration,
    state.eccentricPhase,
    state.eccentric.angularVelocity,
    eccentricAngularAcceleration,
    state.eccentric.radius,
    eccentricRadiusVelocity,
    eccentricRadiusAcceleration
  );
  
  // Decompose acceleration into components
  const { radial, tangential } = decomposeAcceleration(acceleration, position, velocity);
  const totalAcceleration = Math.sqrt(acceleration.x * acceleration.x + acceleration.y * acceleration.y);
  const gForce = computeGForce(acceleration);
  
  return {
    platformAngle: cabinAngle,
    distanceFromCenter: cabinDistance,
    position,
    velocity,
    acceleration,
    radialAcceleration: radial,
    tangentialAcceleration: tangential,
    totalAcceleration,
    gForce
  };
}

