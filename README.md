# Balerina (Hully Gully) Ride Simulator

A physics-first engineering simulation of the classic Balerina / Hully Gully amusement ride. This project provides a physically accurate, deterministic simulation with explicit equations and clear outputs for forces, accelerations, and trajectories.

![Ride Type](https://img.shields.io/badge/Ride-Hully%20Gully%20%2F%20Balerina-orange)
![Physics](https://img.shields.io/badge/Physics-Explicit%20Equations-blue)
![3D](https://img.shields.io/badge/3D-Three.js-green)

## Overview

The Balerina ride (also known as Hully Gully, Trabant, or Fire Phoenix) is a dynamic amusement attraction that combines rotational and tilting movements. This simulator models the mechanical and physical behavior of the ride with engineering precision.

### Key Features

- **Explicit Physics**: All equations are visible and documented - no hidden physics engines
- **Deterministic Simulation**: Fixed timestep integration for reproducible results
- **3D Visualization**: Real-time Three.js rendering with camera controls
- **Operator Controls**: Adjust platform speed, windmill speed, tilt angle, and rotation directions
- **G-Force Tracking**: Real-time computation of forces and accelerations on each cabin

## How the Ride Works

### Mechanical System

The ride consists of two main components:

1. **Primary Platform**: A rotating disc that spins around a vertical axis
2. **Secondary Platform (Windmill)**: A tilted disc with passenger cabins that:
   - Is connected to the primary platform at a **pivot point** (point of tangency)
   - Tilts about this pivot axis
   - Rotates independently around its own center

### Geometry

```
Side View (showing tilt):

         ___Secondary Platform___
        /  (tilted disc with cabins)
       /
      T ←── Pivot Point (Point of Tangency)
     [=========|=========]
        Primary Platform
              ↑
         Platform Center
```

### Key Parameters

| Parameter | Description |
|-----------|-------------|
| **Pivot Point (T)** | Where the secondary platform touches the primary platform edge |
| **Tilt Angle (α)** | Angle at T between horizontal and the line to secondary platform center |
| **Platform Phase** | Rotation angle of the primary platform |
| **Windmill Phase** | Rotation angle of the secondary platform around its own center |

### Motion Superposition

The cabin motion is a superposition of:
1. Primary platform rotation (around vertical axis)
2. Tilt of secondary platform (about pivot axis)
3. Windmill rotation (around tilted disc center)

This creates complex trajectories where cabins experience varying G-forces as they cycle through high and low points on the tilted disc.

## Project Architecture

```
src/
├── index.ts          # Main entry point, coordinates simulation and rendering
├── types/
│   └── index.ts      # TypeScript interfaces and type definitions
├── physics/
│   └── index.ts      # Explicit physics calculations (position, velocity, acceleration)
├── simulation/
│   └── index.ts      # Time-stepping engine, state management, ramping
├── rendering/
│   └── index.ts      # Three.js 3D visualization
└── ui/
    └── ControlPanel.ts  # Operator control panel UI
```

### Design Principles

1. **Separation of Concerns**: Physics ≠ Rendering ≠ UI
2. **Explicit Math**: All equations documented in code comments
3. **Deterministic**: Simulation runs independently of frame rate
4. **No Magic**: No hidden physics abstractions or game-engine shortcuts

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd balerina

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

### Controls

| Control | Description |
|---------|-------------|
| **Platform Speed** | Angular velocity of the primary platform (0-3 rad/s) |
| **Windmill Speed** | Angular velocity of the secondary platform (0-3 rad/s) |
| **Tilt Angle** | Tilt of secondary platform (0-30°) |
| **Direction (CW/CCW)** | Rotation direction for each motor |
| **Emergency Stop** | Immediately sets all speeds to zero |
| **Reset** | Returns simulation to initial state |

### Camera Controls

- **Left Mouse + Drag**: Orbit camera around scene
- **Right Mouse + Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out

### Visual Indicators

- **Gray Disc**: Primary platform
- **Orange Transparent Disc**: Secondary platform (skirt)
- **Blue Boxes**: Passenger cabins
- **Red Box**: Tracked cabin (cabin #0) for motion analysis
- **Orange Box**: Pivot point marker

## Physics Model

### Coordinate System

- **Physics Frame**: X-Y horizontal plane, Z vertical (up)
- **Three.js Frame**: X-Z horizontal plane, Y vertical (up)
- **Mapping**: Physics (x, y, z) → Three.js (x, z, y)

### Position Calculation

Cabin position is computed through a series of transformations:

1. **Local Disc Frame**: Cabin at angle θ, distance r from disc center
   ```
   local_x = r × cos(θ + windmillPhase)
   local_y = r × sin(θ + windmillPhase)
   local_z = 0
   ```

2. **Apply Tilt** (rotation about Y-axis by tiltAngle):
   ```
   tilted_x = local_x × cos(α) + local_z × sin(α)
   tilted_y = local_y
   tilted_z = -local_x × sin(α) + local_z × cos(α)
   ```

3. **Add to Secondary Platform Center**:
   ```
   cabin_plat = center_plat + tilted
   ```

4. **Apply Platform Rotation** (rotation about Z-axis by platformPhase):
   ```
   world_x = cabin_x × cos(θ) - cabin_y × sin(θ)
   world_y = cabin_x × sin(θ) + cabin_y × cos(θ)
   world_z = cabin_z
   ```

### Velocity and Acceleration

Computed numerically using central differences for robustness with the complex tilted geometry:

```
velocity = (position(t + dt/2) - position(t - dt/2)) / dt
acceleration = (velocity(t + dt/2) - velocity(t - dt/2)) / dt
```

### G-Force Calculation

```
G-force = |acceleration| / 9.81 m/s²
```

## Configuration

Default configuration in `src/index.ts`:

```typescript
const config = {
  timeStep: 0.01,              // Physics timestep (seconds)
  numCabins: 8,                // Number of passenger cabins
  platformRadius: 6,           // Primary platform radius (meters)
  windmillRadius: 9,           // Secondary platform radius (meters)
  pivotRadius: 6,              // Distance to pivot point (meters)
  secondaryPlatformOffset: 9,  // Distance from pivot to disc center (meters)
  minTiltAngle: 0,             // Minimum tilt (radians)
  maxTiltAngle: Math.PI / 6,   // Maximum tilt (30°)
  ramping: {
    platformRampTime: 2.0,     // Speed change smoothing (seconds)
    windmillRampTime: 2.0,
    tiltRampTime: 1.0
  }
};
```

## Technical Details

### Simulation Loop

1. **Fixed Timestep**: Physics runs at 100 Hz (10ms steps)
2. **Accumulator Pattern**: Handles variable frame rates
3. **State Interpolation**: Smooth rendering between physics steps

### Ramping

All control changes are smoothed using exponential approach:
```
value = current + (target - current) × (1 - e^(-dt/timeConstant))
```

### Rendering

- **Engine**: Three.js with WebGL
- **Shadows**: PCF soft shadow mapping
- **Controls**: OrbitControls for camera manipulation

## Non-Goals

This simulator intentionally does NOT include:

- Arcade/game physics
- Passenger animation
- Cinematic effects
- CAD-level stress analysis

## Quality Bar

A correct simulation allows an engineer to:

- ✅ Reason about forces at any point in time
- ✅ Explain why certain motions feel "nauseating"
- ✅ Compare operator profiles quantitatively
- ✅ Validate intuition with explicit calculations

**If a result cannot be explained mathematically, it is considered a bug.**

## License

MIT License - See LICENSE file for details.

## Contributing

Contributions welcome! Please ensure:

1. Physics calculations include documented equations
2. No hidden abstractions or magic numbers
3. Separation between physics, simulation, and rendering
4. All units are explicit (SI units preferred)
