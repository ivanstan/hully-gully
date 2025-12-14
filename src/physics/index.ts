/**
 * Physics Module - Balerina Ride Simulator
 * 
 * This module contains all physics calculations with explicit equations.
 * No hidden physics engines - all math is visible and documented.
 * 
 * The motion is a superposition of:
 * 1. Main platform rotation around vertical axis
 * 2. Eccentric center at variable radius (rotates with platform, no independent rotation)
 * 3. Windmill (secondary platform: skirt + cabins) rotation around eccentric center
 * 4. Cabins fixed to windmill at specific positions
 * 
 * All calculations use SI units and are deterministic.
 */

import { Vector2D, Vector3D, CabinState, SimulationState } from '../types/index.js';

/**
 * Compute the position of a cabin in world coordinates
 * 
 * Equations:
 * - Platform center rotates: (0, 0) in platform frame
 * - Eccentric center: (r_ecc, 0) in platform frame (fixed angle, rotates with platform)
 * - Windmill rotates around eccentric center: cabin positions rotate by windmillPhase
 * - Cabin position: eccentric_center + rotated_cabin_offset in platform frame
 * - Transform to world: rotate by platform angle θ_plat
 * 
 * @param cabinAngle - Angle of cabin on windmill (rad) - fixed relative to windmill
 * @param cabinDistance - Distance from eccentric center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param windmillPhase - Current windmill rotation phase (rad) - rotation around skirt center
 * @param eccentricRadius - Current eccentric radius (m)
 * @returns 3D position vector (z = 0 for horizontal plane)
 */
export function computeCabinPosition(
  cabinAngle: number,
  cabinDistance: number,
  platformPhase: number,
  windmillPhase: number,
  eccentricRadius: number
): Vector3D {
  // Eccentric center position in platform frame (fixed at angle 0, rotates with platform)
  const eccCenterX = eccentricRadius;
  const eccCenterY = 0;
  
  // Cabin position relative to eccentric center (in platform frame)
  // Cabin angle is relative to windmill, so we add windmillPhase
  const cabinAngleInPlatform = cabinAngle + windmillPhase;
  const cabinX = eccCenterX + cabinDistance * Math.cos(cabinAngleInPlatform);
  const cabinY = eccCenterY + cabinDistance * Math.sin(cabinAngleInPlatform);
  
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
 * @param cabinAngle - Angle of cabin on windmill (rad) - fixed relative to windmill
 * @param cabinDistance - Distance from eccentric center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param platformAngularVelocity - Platform angular velocity (rad/s)
 * @param windmillPhase - Current windmill rotation phase (rad)
 * @param windmillAngularVelocity - Windmill angular velocity (rad/s)
 * @param eccentricRadius - Current eccentric radius (m)
 * @param eccentricRadiusVelocity - Rate of change of eccentric radius (m/s)
 * @returns 3D velocity vector
 */
export function computeCabinVelocity(
  cabinAngle: number,
  cabinDistance: number,
  platformPhase: number,
  platformAngularVelocity: number,
  windmillPhase: number,
  windmillAngularVelocity: number,
  eccentricRadius: number,
  eccentricRadiusVelocity: number
): Vector3D {
  // Eccentric center position in platform frame (fixed at angle 0)
  const eccCenterX = eccentricRadius;
  const eccCenterY = 0;
  
  // Derivative of eccentric center position in platform frame
  // d/dt [r_ecc, 0] = [dr_ecc/dt, 0]
  const deccCenterX = eccentricRadiusVelocity;
  const deccCenterY = 0;
  
  // Cabin angle in platform frame (windmill rotation adds to cabin angle)
  const cabinAngleInPlatform = cabinAngle + windmillPhase;
  const cosCabin = Math.cos(cabinAngleInPlatform);
  const sinCabin = Math.sin(cabinAngleInPlatform);
  
  // Cabin position in platform frame (eccentric center + cabin offset)
  const cabinX_plat = eccCenterX + cabinDistance * cosCabin;
  const cabinY_plat = eccCenterY + cabinDistance * sinCabin;
  
  // Derivative of cabin position in platform frame
  // d/dt [eccCenter + cabinDistance * (cos(cabinAngle + windmillPhase), sin(...))]
  const dcabinX_plat = deccCenterX - cabinDistance * windmillAngularVelocity * sinCabin;
  const dcabinY_plat = deccCenterY + cabinDistance * windmillAngularVelocity * cosCabin;
  
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
 * - Centripetal acceleration from windmill rotation
 * - Coriolis effects
 * - Tangential acceleration from angular acceleration
 * 
 * @param cabinAngle - Angle of cabin on windmill (rad) - fixed relative to windmill
 * @param cabinDistance - Distance from eccentric center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param platformAngularVelocity - Platform angular velocity (rad/s)
 * @param platformAngularAcceleration - Platform angular acceleration (rad/s²)
 * @param windmillPhase - Current windmill rotation phase (rad)
 * @param windmillAngularVelocity - Windmill angular velocity (rad/s)
 * @param windmillAngularAcceleration - Windmill angular acceleration (rad/s²)
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
  windmillPhase: number,
  windmillAngularVelocity: number,
  windmillAngularAcceleration: number,
  eccentricRadius: number,
  eccentricRadiusVelocity: number,
  eccentricRadiusAcceleration: number
): Vector3D {
  // Eccentric center position in platform frame (fixed at angle 0)
  const eccX_plat = eccentricRadius;
  const eccY_plat = 0;
  
  // Eccentric center velocity in platform frame
  const eccVX_plat = eccentricRadiusVelocity;
  const eccVY_plat = 0;
  
  // Eccentric center acceleration in platform frame
  // d²/dt² [r_ecc, 0] = [d²r_ecc/dt², 0]
  const accEccX_plat = eccentricRadiusAcceleration;
  const accEccY_plat = 0;
  
  // Cabin angle in platform frame (windmill rotation adds to cabin angle)
  const cabinAngleInPlatform = cabinAngle + windmillPhase;
  const cosCabin = Math.cos(cabinAngleInPlatform);
  const sinCabin = Math.sin(cabinAngleInPlatform);
  
  // Cabin position in platform frame
  const cabinX_plat = eccX_plat + cabinDistance * cosCabin;
  const cabinY_plat = eccY_plat + cabinDistance * sinCabin;
  
  // Cabin velocity in platform frame
  const cabinVX_plat = eccVX_plat - cabinDistance * windmillAngularVelocity * sinCabin;
  const cabinVY_plat = eccVY_plat + cabinDistance * windmillAngularVelocity * cosCabin;
  
  // Cabin acceleration in platform frame
  // d²/dt² [eccCenter + cabinDistance * (cos(cabinAngle + windmillPhase), sin(...))]
  const cabinAccX_plat = accEccX_plat 
    - cabinDistance * windmillAngularVelocity * windmillAngularVelocity * cosCabin
    - cabinDistance * windmillAngularAcceleration * sinCabin;
  const cabinAccY_plat = accEccY_plat
    - cabinDistance * windmillAngularVelocity * windmillAngularVelocity * sinCabin
    + cabinDistance * windmillAngularAcceleration * cosCabin;
  
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
    state.windmillPhase,
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
    state.windmillPhase,
    state.windmill.angularVelocity,
    state.eccentric.radius,
    eccentricRadiusVelocity
  );
  
  // Compute acceleration using second derivatives
  // For now, assume angular accelerations and radius acceleration are zero
  // (These will be computed from ramping in the future)
  const platformAngularAcceleration = 0; // TODO: compute from ramping
  const windmillAngularAcceleration = 0; // TODO: compute from ramping
  const eccentricRadiusAcceleration = 0; // TODO: compute from ramping
  
  const acceleration = computeCabinAcceleration(
    cabinAngle,
    cabinDistance,
    state.platformPhase,
    state.platform.angularVelocity,
    platformAngularAcceleration,
    state.windmillPhase,
    state.windmill.angularVelocity,
    windmillAngularAcceleration,
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

