# Balerina (Hully Gully) Ride Simulator

A physics-first, engineering-oriented browser-based simulation of a classic Balerina amusement ride.

## Overview

This simulator accurately models the kinematics and resulting forces on passengers of a Balerina ride, which consists of:
- A main circular platform rotating around a vertical axis
- A secondary rotating eccentric ("windmill") with its own angular velocity
- Variable eccentric radius (simulating hydraulic lift)
- Fixed cabins (no free rotation)
- Superposition of motions producing lateral acceleration and G-forces

**This is NOT a game.** It is a physics-first simulator with 3D visualization designed for engineering analysis.

## Architecture

The project follows strict separation of concerns:

- **Physics Module** (`src/physics/`) - Explicit equations, no hidden engines
- **Simulation Engine** (`src/simulation/`) - Deterministic time stepping, state management
- **Rendering Module** (`src/rendering/`) - Three.js visualization, no physics logic
- **Types** (`src/types/`) - Core interfaces and type definitions

## Tech Stack

- **TypeScript** - Type-safe development
- **Three.js** - 3D rendering only (no physics)
- **Custom Physics** - Explicit equations, RK4 integration (to be implemented)
- **Chart.js/D3** - Data visualization (to be implemented)

## Project Structure

```
balerina/
├── src/
│   ├── types/
│   │   └── index.ts          # Core type definitions
│   ├── physics/
│   │   └── index.ts          # Physics calculations
│   ├── simulation/
│   │   └── index.ts          # Simulation engine
│   ├── rendering/
│   │   └── index.ts          # Three.js rendering
│   └── index.ts              # Main entry point
├── dist/                     # Compiled JavaScript (generated)
├── index.html                # HTML entry point
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies
└── README.md                 # This file
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev  # Start Vite dev server (handles TypeScript + bundling)
```

This will automatically open `http://localhost:8080` in your browser.

### Build for Production

```bash
npm run build  # Compile TypeScript and bundle with Vite
```

### Preview Production Build

```bash
npm run preview  # Preview the production build
```

## Usage

### Browser Console API

Once the simulator is running, you can control it via the browser console:

```javascript
// Access the simulator
const sim = window.simulator;

// Update operator controls
sim.getSimulation().updateControls({
  platformSpeed: 1.0,        // rad/s
  eccentricSpeed: 2.0,        // rad/s
  eccentricRadius: 5.0,       // meters
  platformDirection: 1,       // 1 = CCW, -1 = CW
  eccentricDirection: 1
});

// Control simulation
sim.pause();
sim.resume();
sim.reset();

// Toggle visualization
sim.getRendering().toggleForceVectors();
sim.getRendering().toggleGForceColors();
```

## Physics

All physics calculations use explicit equations with SI units:
- Distance: meters (m)
- Time: seconds (s)
- Angle: radians (rad)
- Angular velocity: rad/s
- Acceleration: m/s²
- G-force: dimensionless (multiples of 9.81 m/s²)

The motion is a superposition of:
1. Platform rotation: `θ_platform(t) = θ_0 + ω_platform * t`
2. Eccentric rotation: `θ_eccentric(t) = θ_0 + ω_eccentric * t`
3. Variable eccentric radius: `r_eccentric(t)` (ramped)

Cabin positions are computed in the platform frame, then transformed to world coordinates.

## Current Status

✅ Project structure
✅ Core type definitions
✅ Physics module skeleton
✅ Simulation engine skeleton
✅ Rendering module skeleton
✅ Basic 3D visualization

🚧 To be implemented:
- Full RK4 numerical integration
- Complete analytical acceleration calculations
- Data logging and charting
- Operator UI panel
- Preset ride profiles

## Development Principles

1. **Physics must be explicit** - No hidden "magic" physics engines
2. **Deterministic simulation** - Fixed timestep, independent of rendering
3. **Separation of concerns** - Physics ≠ Rendering ≠ UI
4. **Numerical stability** - Clarity over visual tricks
5. **Engineering focus** - Results must be mathematically explainable

## License

Private project - All rights reserved

