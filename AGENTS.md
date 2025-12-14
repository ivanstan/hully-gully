# Project Agents – Balerina (Hully Gully) Ride Simulator

This project simulates the mechanical and physical behavior of a classic
Balerina / Hully Gully amusement ride.

The system consists of:
- a rotating main platform
- a secondary rotating eccentric ("windmill")
- a variable eccentric radius controlled by hydraulics
- fixed cabins (no free rotation)
- superposition of motions producing lateral acceleration and G-forces

The goal is NOT a game.
The goal is a physically interpretable, engineer-friendly simulation with
clear outputs: forces, accelerations, and trajectories.

---

## Core Principles

- Physics must be explicit and readable
- No hidden “magic” physics engines
- Deterministic, step-based simulation
- Separation of concerns:
    - physics ≠ rendering ≠ UI
- Numerical stability and clarity over visual tricks

---

## Agent Roles

### 1. Physics Agent
Responsible for:
- Mathematical modeling of motion
- Kinematic equations (position, velocity, acceleration)
- Numerical integration (RK4 preferred)
- Computing:
    - radial acceleration
    - tangential acceleration
    - total acceleration
    - experienced G-forces

Constraints:
- Must expose all intermediate values
- Must avoid game-oriented physics abstractions
- Must document equations clearly

---

### 2. Simulation Engine Agent
Responsible for:
- Time stepping (`dt`)
- State management
- Deterministic replay
- Direction changes (CW / CCW)
- Ramping (acceleration / deceleration)

Constraints:
- Simulation must run independently of rendering
- Must support pause, resume, reset, and power-loss scenarios

---

### 3. Visualization Agent (3D)
Responsible for:
- 3D rendering using Three.js
- Mapping simulation state → transforms
- Camera modes:
    - external observer
    - cabin-mounted view
- Visual debugging:
    - force vectors
    - acceleration arrows
    - color mapping by G-force

Constraints:
- Rendering must never influence physics
- No physics logic inside rendering code

---

### 4. Data & Charts Agent
Responsible for:
- Time-series data capture
- Plotting:
    - acceleration vs time
    - G-force vs time
    - angular velocities
    - eccentric radius
- Export (CSV / JSON)

Constraints:
- Charts reflect simulation truth, not smoothed visuals
- Units must be explicit (m/s², rad/s, g)

---

### 5. UI / Operator Panel Agent
Responsible for:
- Operator-style controls:
    - platform speed
    - eccentric speed
    - eccentric radius (UP / DOWN)
    - direction (CW / CCW)
    - ramp times
- Preset ride profiles
- Emergency stop / power-off simulation

Constraints:
- UI actions modify target parameters, not raw state
- All transitions must be physically plausible

---

## Non-Goals

- No arcade physics
- No passenger animation
- No cinematic exaggeration
- No CAD-level stress analysis (out of scope)

---

## Quality Bar

A correct simulation must allow an engineer to:
- reason about forces
- explain why a motion feels “nauseating”
- compare two operator profiles quantitatively
- validate intuition with graphs

If a result cannot be explained mathematically, it is considered a bug.
