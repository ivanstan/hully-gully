/**
 * Physics Module - Balerina Ride Simulator
 * 
 * This module contains all physics calculations with explicit equations.
 * No hidden physics engines - all math is visible and documented.
 * 
 * The motion is a superposition of:
 * 1. Main platform rotation around vertical axis (Y-axis in world frame)
 * 2. Pivot point at edge of primary platform (point of tangency)
 * 3. Secondary platform tilts about the pivot axis (tangent to platform edge)
 * 4. Windmill (secondary platform: skirt + cabins) rotates around its center
 * 5. Cabins fixed to windmill at specific positions
 * 
 * Coordinate system:
 * - World frame: X-Z is horizontal plane, Y is vertical (up)
 * - Platform frame: rotates with main platform
 * - Tilted frame: rotates with main platform and tilts about pivot axis
 * 
 * All calculations use SI units and are deterministic.
 */

import { Vector2D, Vector3D, CabinState, SimulationState } from '../types/index.js';

/**
 * Compute the position of a cabin in world coordinates with tilt
 * 
 * Geometry:
 * 1. Pivot point P is at distance pivotRadius from platform center, at angle 0 in platform frame
 * 2. Pivot axis is perpendicular to radial direction (tangent, along Y direction in platform frame)
 * 3. Secondary platform center S is at distance secondaryPlatformOffset from pivot point,
 *    in the direction perpendicular to pivot axis, tilted by tiltAngle from horizontal
 * 4. Cabin positions are on the secondary platform at cabinDistance from S center
 * 5. Everything rotates with platform (platformPhase)
 * 6. Cabins also rotate around S center (windmillPhase)
 * 
 * @param cabinAngle - Angle of cabin on windmill (rad) - fixed relative to windmill
 * @param cabinDistance - Distance from secondary platform center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param windmillPhase - Current windmill rotation phase (rad) - rotation around windmill center
 * @param pivotRadius - Distance from platform center to pivot point (m)
 * @param tiltAngle - Tilt angle of secondary platform (rad)
 * @param secondaryPlatformOffset - Distance from pivot to secondary platform center (m)
 * @returns 3D position vector in world frame
 */
export function computeCabinPosition(
  cabinAngle: number,
  cabinDistance: number,
  platformPhase: number,
  windmillPhase: number,
  pivotRadius: number,
  tiltAngle: number,
  secondaryPlatformOffset: number
): Vector3D {
  // Step 1: Pivot point position in platform frame (horizontal plane)
  // Pivot is at angle 0 in platform frame, at distance pivotRadius
  const pivotX_plat = pivotRadius;
  const pivotY_plat = 0;
  const pivotZ_plat = 0; // On the platform surface
  
  // Step 2: Secondary platform center position relative to pivot point
  // The secondary platform tilts about the pivot axis (which is along Y in platform frame)
  // The secondary platform extends INWARD (over the primary platform), so offset is negative in X
  // This is a 180° rotation from extending outward
  // When tilted, the center moves in the X-Z plane:
  //   - horizontal offset (X): -secondaryPlatformOffset * cos(α) (negative = toward platform center)
  //   - vertical offset (Z): secondaryPlatformOffset * sin(α) (positive = upward)
  const centerOffsetX = -secondaryPlatformOffset * Math.cos(tiltAngle);
  const centerOffsetZ = secondaryPlatformOffset * Math.sin(tiltAngle);
  
  const centerX_plat = pivotX_plat + centerOffsetX;
  const centerY_plat = pivotY_plat;
  const centerZ_plat = pivotZ_plat + centerOffsetZ;
  
  // Step 3: Cabin position relative to secondary platform center
  // The cabin is on the tilted disc at angle (cabinAngle + windmillPhase) from disc center
  // The disc is tilted by tiltAngle about the Y-axis (pivot axis)
  // 
  // In the disc's local frame (before tilt), cabin is at:
  //   local_x = cabinDistance * cos(cabinAngle + windmillPhase)
  //   local_y = cabinDistance * sin(cabinAngle + windmillPhase)
  //   local_z = 0
  //
  // After tilting about Y-axis by tiltAngle, this becomes:
  //   tilted_x = local_x * cos(tiltAngle) + local_z * sin(tiltAngle) = local_x * cos(tiltAngle)
  //   tilted_y = local_y
  //   tilted_z = -local_x * sin(tiltAngle) + local_z * cos(tiltAngle) = -local_x * sin(tiltAngle)
  // 
  // Wait, I need to think about this more carefully.
  // The tilt axis is perpendicular to the radial direction (tangent to platform edge).
  // In platform frame, if pivot is at (pivotRadius, 0, 0), the tilt axis is along Y.
  // Tilting means rotating about the Y-axis of the tilted frame.
  // But the disc itself also rotates (windmill rotation).
  // 
  // Let me reconsider: the secondary platform is a disc that:
  // 1. Is centered at the secondary platform center (which is at an offset from pivot)
  // 2. Is tilted relative to horizontal by tiltAngle (rotation about pivot axis)
  // 3. Rotates about its own center axis (perpendicular to disc surface)
  //
  // The cabin's position in the disc-local frame (disc is horizontal, not tilted):
  const cabinAngleInDisc = cabinAngle + windmillPhase;
  const localX = cabinDistance * Math.cos(cabinAngleInDisc);
  const localY = cabinDistance * Math.sin(cabinAngleInDisc);
  const localZ = 0;
  
  // Apply tilt rotation about the Y-axis (pivot axis, which is tangent to platform edge)
  // The tilt angle is measured at T between:
  //   - Line from T to Primary platform center (horizontal, toward -X)
  //   - Line from T to Secondary platform center (tilted up)
  // 
  // Cabins on the inner side (negative localX, toward primary center) should go UP
  // Cabins on the pivot side (positive localX, toward T) should go DOWN
  //
  // Standard rotation about Y by angle α:
  // [cos(α)  0  sin(α)] [x]   [x*cos(α) + z*sin(α)]
  // [  0    1    0    ] [y] = [y                  ]
  // [-sin(α) 0  cos(α)] [z]   [-x*sin(α) + z*cos(α)]
  const cosTilt = Math.cos(tiltAngle);
  const sinTilt = Math.sin(tiltAngle);
  const tiltedX = localX * cosTilt + localZ * sinTilt;
  const tiltedY = localY;
  const tiltedZ = -localX * sinTilt + localZ * cosTilt;
  
  // Cabin position in platform frame = center position + tilted offset
  const cabinX_plat = centerX_plat + tiltedX;
  const cabinY_plat = centerY_plat + tiltedY;
  const cabinZ_plat = centerZ_plat + tiltedZ;
  
  // Step 4: Transform from platform frame to world frame
  // Platform rotates about vertical (world Y) axis by platformPhase
  // Rotation about Y axis:
  // [cos(θ)  0  -sin(θ)] [x]   [x*cos(θ) - z*sin(θ)]
  // [  0    1    0     ] [y] = [y                  ]
  // [sin(θ)  0   cos(θ)] [z]   [x*sin(θ) + z*cos(θ)]
  // 
  // Wait, I'm mixing up coordinate conventions. Let me be explicit:
  // - Physics convention: X and Y are horizontal, Z is vertical
  // - Three.js convention: X and Z are horizontal, Y is vertical
  //
  // For physics, let's use: X-Y horizontal plane, Z vertical (up)
  // Platform rotates about Z axis (vertical)
  //
  // Actually, looking at the existing code, it uses:
  // - position.x, position.y in horizontal plane
  // - position.z for vertical
  // This is consistent. Let me redo this properly.
  
  // Redefining with clear convention:
  // Platform frame: x-y is horizontal plane, z is vertical
  // Pivot is at (pivotRadius, 0, 0) in platform frame
  // Tilt axis is along y-direction (tangent to platform edge at pivot)
  // Tilt rotates about the y-axis
  
  // For tilt rotation about y-axis (standard 3D rotation matrix):
  // [cos(α)  0  sin(α)] [x]
  // [  0    1    0    ] [y]
  // [-sin(α) 0  cos(α)] [z]
  
  const finalCabinX_plat = centerX_plat + tiltedX;
  const finalCabinY_plat = centerY_plat + tiltedY;
  const finalCabinZ_plat = centerZ_plat + tiltedZ;
  
  // Transform to world frame: rotate about z-axis (vertical) by platformPhase
  // [cos(θ)  -sin(θ)  0] [x]
  // [sin(θ)   cos(θ)  0] [y]
  // [  0        0     1] [z]
  const cosPlat = Math.cos(platformPhase);
  const sinPlat = Math.sin(platformPhase);
  
  const worldX = finalCabinX_plat * cosPlat - finalCabinY_plat * sinPlat;
  const worldY = finalCabinX_plat * sinPlat + finalCabinY_plat * cosPlat;
  const worldZ = finalCabinZ_plat;
  
  return { x: worldX, y: worldY, z: worldZ };
}

/**
 * Compute the velocity of a cabin using time derivatives
 * 
 * Velocity = d(position)/dt
 * 
 * This is computed numerically using central differences for simplicity
 * and to avoid complex analytical derivatives of the tilted geometry.
 * 
 * @param cabinAngle - Angle of cabin on windmill (rad) - fixed relative to windmill
 * @param cabinDistance - Distance from secondary platform center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param platformAngularVelocity - Platform angular velocity (rad/s)
 * @param windmillPhase - Current windmill rotation phase (rad)
 * @param windmillAngularVelocity - Windmill angular velocity (rad/s)
 * @param pivotRadius - Distance from platform center to pivot point (m)
 * @param tiltAngle - Tilt angle of secondary platform (rad)
 * @param tiltAngularVelocity - Rate of change of tilt angle (rad/s)
 * @param secondaryPlatformOffset - Distance from pivot to secondary platform center (m)
 * @returns 3D velocity vector
 */
export function computeCabinVelocity(
  cabinAngle: number,
  cabinDistance: number,
  platformPhase: number,
  platformAngularVelocity: number,
  windmillPhase: number,
  windmillAngularVelocity: number,
  pivotRadius: number,
  tiltAngle: number,
  tiltAngularVelocity: number,
  secondaryPlatformOffset: number
): Vector3D {
  // Use central differences for numerical derivative
  const dt = 0.0001; // Small time step for numerical derivative
  
  // Position at t - dt/2
  const pos1 = computeCabinPosition(
    cabinAngle,
    cabinDistance,
    platformPhase - platformAngularVelocity * dt / 2,
    windmillPhase - windmillAngularVelocity * dt / 2,
    pivotRadius,
    tiltAngle - tiltAngularVelocity * dt / 2,
    secondaryPlatformOffset
  );
  
  // Position at t + dt/2
  const pos2 = computeCabinPosition(
    cabinAngle,
    cabinDistance,
    platformPhase + platformAngularVelocity * dt / 2,
    windmillPhase + windmillAngularVelocity * dt / 2,
    pivotRadius,
    tiltAngle + tiltAngularVelocity * dt / 2,
    secondaryPlatformOffset
  );
  
  // Central difference
  return {
    x: (pos2.x - pos1.x) / dt,
    y: (pos2.y - pos1.y) / dt,
    z: (pos2.z - pos1.z) / dt
  };
}

/**
 * Compute the acceleration of a cabin
 * 
 * Acceleration = d(velocity)/dt
 * 
 * This is computed numerically using central differences for simplicity
 * and to avoid complex analytical derivatives of the tilted geometry.
 * 
 * @param cabinAngle - Angle of cabin on windmill (rad) - fixed relative to windmill
 * @param cabinDistance - Distance from secondary platform center (m)
 * @param platformPhase - Current platform rotation phase (rad)
 * @param platformAngularVelocity - Platform angular velocity (rad/s)
 * @param platformAngularAcceleration - Platform angular acceleration (rad/s²)
 * @param windmillPhase - Current windmill rotation phase (rad)
 * @param windmillAngularVelocity - Windmill angular velocity (rad/s)
 * @param windmillAngularAcceleration - Windmill angular acceleration (rad/s²)
 * @param pivotRadius - Distance from platform center to pivot point (m)
 * @param tiltAngle - Tilt angle of secondary platform (rad)
 * @param tiltAngularVelocity - Rate of change of tilt angle (rad/s)
 * @param tiltAngularAcceleration - Second derivative of tilt angle (rad/s²)
 * @param secondaryPlatformOffset - Distance from pivot to secondary platform center (m)
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
  pivotRadius: number,
  tiltAngle: number,
  tiltAngularVelocity: number,
  tiltAngularAcceleration: number,
  secondaryPlatformOffset: number
): Vector3D {
  // Use central differences for numerical derivative of velocity
  const dt = 0.0001; // Small time step for numerical derivative
  
  // Velocity at t - dt/2
  const vel1 = computeCabinVelocity(
    cabinAngle,
    cabinDistance,
    platformPhase - platformAngularVelocity * dt / 2,
    platformAngularVelocity - platformAngularAcceleration * dt / 2,
    windmillPhase - windmillAngularVelocity * dt / 2,
    windmillAngularVelocity - windmillAngularAcceleration * dt / 2,
    pivotRadius,
    tiltAngle - tiltAngularVelocity * dt / 2,
    tiltAngularVelocity - tiltAngularAcceleration * dt / 2,
    secondaryPlatformOffset
  );
  
  // Velocity at t + dt/2
  const vel2 = computeCabinVelocity(
    cabinAngle,
    cabinDistance,
    platformPhase + platformAngularVelocity * dt / 2,
    platformAngularVelocity + platformAngularAcceleration * dt / 2,
    windmillPhase + windmillAngularVelocity * dt / 2,
    windmillAngularVelocity + windmillAngularAcceleration * dt / 2,
    pivotRadius,
    tiltAngle + tiltAngularVelocity * dt / 2,
    tiltAngularVelocity + tiltAngularAcceleration * dt / 2,
    secondaryPlatformOffset
  );
  
  // Central difference
  return {
    x: (vel2.x - vel1.x) / dt,
    y: (vel2.y - vel1.y) / dt,
    z: (vel2.z - vel1.z) / dt
  };
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
 * @param cabinAngle - Angle of cabin on windmill (rad)
 * @param cabinDistance - Distance from secondary platform center (m)
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
    state.tilt.pivotRadius,
    state.tilt.tiltAngle,
    state.tilt.secondaryPlatformOffset
  );
  
  // Compute velocity using time derivatives
  // For now, assume tilt velocity is zero (will be computed from ramping later)
  const tiltAngularVelocity = 0; // TODO: compute from ramping
  const velocity = computeCabinVelocity(
    cabinAngle,
    cabinDistance,
    state.platformPhase,
    state.platform.angularVelocity,
    state.windmillPhase,
    state.windmill.angularVelocity,
    state.tilt.pivotRadius,
    state.tilt.tiltAngle,
    tiltAngularVelocity,
    state.tilt.secondaryPlatformOffset
  );
  
  // Compute acceleration using second derivatives
  // For now, assume angular accelerations and tilt acceleration are zero
  // (These will be computed from ramping in the future)
  const platformAngularAcceleration = 0; // TODO: compute from ramping
  const windmillAngularAcceleration = 0; // TODO: compute from ramping
  const tiltAngularAcceleration = 0; // TODO: compute from ramping
  
  const acceleration = computeCabinAcceleration(
    cabinAngle,
    cabinDistance,
    state.platformPhase,
    state.platform.angularVelocity,
    platformAngularAcceleration,
    state.windmillPhase,
    state.windmill.angularVelocity,
    windmillAngularAcceleration,
    state.tilt.pivotRadius,
    state.tilt.tiltAngle,
    tiltAngularVelocity,
    tiltAngularAcceleration,
    state.tilt.secondaryPlatformOffset
  );
  
  // Decompose acceleration into components
  const { radial, tangential } = decomposeAcceleration(acceleration, position, velocity);
  const totalAcceleration = Math.sqrt(
    acceleration.x * acceleration.x + 
    acceleration.y * acceleration.y + 
    acceleration.z * acceleration.z
  );
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

