/**
 * Main Entry Point - Balerina Ride Simulator
 * 
 * This file coordinates the simulation and rendering loops.
 * 
 * Architecture:
 * - Simulation runs at fixed timestep (independent of rendering)
 * - Rendering runs at display refresh rate
 * - State is passed from simulation to rendering
 * - Motor simulation provides realistic 3-phase electrical behavior
 */

import { SimulationEngine } from './simulation/index.js';
import { RenderingEngine } from './rendering/index.js';
import { MotorPanel } from './ui/MotorPanel.js';
import { SimulationConfig, RotationDirection } from './types/index.js';
import { MotorDirection } from './motors/types.js';

/**
 * Main Application Class
 */
class BalerinaSimulator {
  private simulation: SimulationEngine;
  private rendering: RenderingEngine;
  private motorPanel: MotorPanel | null = null;
  private animationFrameId: number | null = null;
  
  constructor(container: HTMLElement, motorPanelContainer?: HTMLElement) {
    // Create default simulation configuration
    // Main platform radius is 2/3 of secondary platform (windmill) radius
    const windmillRadius = 9; // meters (secondary platform radius)
    const platformRadius = (2 / 3) * windmillRadius; // meters (main platform radius = 2/3 * windmill)
    
    // Pivot point is at the edge of the primary platform where the secondary platform touches
    const pivotRadius = platformRadius; // Point of tangency at edge of primary platform
    
    // Secondary platform center offset from pivot point
    // This determines how far the center of the tilted disc is from the pivot
    // Set equal to windmillRadius so the outer edge of the disc is exactly at the pivot point
    // This ensures the disc doesn't extend past the pivot and go below the platform
    const secondaryPlatformOffset = windmillRadius; // Equal to disc radius
    
    const config: SimulationConfig = {
      timeStep: 0.01, // 10ms fixed timestep for physics
      numCabins: 8,
      platformRadius: platformRadius,
      windmillRadius: windmillRadius,
      pivotRadius: pivotRadius,
      secondaryPlatformOffset: secondaryPlatformOffset,
      minTiltAngle: 0, // radians (flat)
      maxTiltAngle: Math.PI / 6, // radians (30 degrees max tilt)
      ramping: {
        platformRampTime: 2.0, // seconds
        windmillRampTime: 2.0, // seconds
        tiltRampTime: 1.0 // seconds
      },
      initialControls: {
        platformSpeed: 0.5, // rad/s
        windmillSpeed: 1.0, // rad/s
        tiltAngle: 0, // radians (0 degrees initial tilt)
        platformDirection: RotationDirection.COUNTER_CLOCKWISE,
        windmillDirection: RotationDirection.COUNTER_CLOCKWISE
      }
    };
    
    // Initialize simulation engine
    this.simulation = new SimulationEngine(config);
    
    // Initialize rendering engine
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    this.rendering = new RenderingEngine(container, width, height, config.platformRadius, config.windmillRadius);
    
    // Handle window resize
    window.addEventListener('resize', () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      this.rendering.resize(w, h);
    });
    
    // Create motor panel (main operator control panel) if container provided
    if (motorPanelContainer) {
      this.motorPanel = new MotorPanel(motorPanelContainer, {
        onPlatformFrequencyChange: (frequency) => {
          this.simulation.setPlatformMotorFrequency(frequency);
        },
        onWindmillFrequencyChange: (frequency) => {
          this.simulation.setWindmillMotorFrequency(frequency);
        },
        onPlatformDirectionChange: (direction) => {
          // Set motor direction via VFD (phase sequence swap)
          this.simulation.setPlatformMotorDirection(direction);
          // Also update the simulation's direction state for consistency
          this.simulation.updateControls({
            platformDirection: direction === MotorDirection.FORWARD 
              ? RotationDirection.COUNTER_CLOCKWISE 
              : RotationDirection.CLOCKWISE
          });
        },
        onWindmillDirectionChange: (direction) => {
          // Set motor direction via VFD (phase sequence swap)
          this.simulation.setWindmillMotorDirection(direction);
          // Also update the simulation's direction state for consistency
          this.simulation.updateControls({
            windmillDirection: direction === MotorDirection.FORWARD 
              ? RotationDirection.COUNTER_CLOCKWISE 
              : RotationDirection.CLOCKWISE
          });
        },
        onHydraulicStart: () => {
          this.simulation.startHydraulicMotor();
        },
        onHydraulicStop: () => {
          this.simulation.stopHydraulicMotor();
        },
        onTiltChange: (angleDegrees) => {
          const angleRad = angleDegrees * Math.PI / 180;
          this.simulation.updateControls({ tiltAngle: angleRad });
        },
        onTiltUp: () => {
          const state = this.simulation.getState();
          const currentDeg = state.tilt.targetTiltAngle * 180 / Math.PI;
          const newDeg = Math.min(30, currentDeg + 5);
          this.simulation.updateControls({ tiltAngle: newDeg * Math.PI / 180 });
        },
        onTiltDown: () => {
          const state = this.simulation.getState();
          const currentDeg = state.tilt.targetTiltAngle * 180 / Math.PI;
          const newDeg = Math.max(0, currentDeg - 5);
          this.simulation.updateControls({ tiltAngle: newDeg * Math.PI / 180 });
        },
        onEmergencyStop: () => {
          this.simulation.emergencyStopMotors();
          this.simulation.updateControls({
            platformSpeed: 0,
            windmillSpeed: 0
          });
        },
        onResetFaults: () => {
          this.simulation.resetMotorFaults();
        }
      });
      
      // Initialize tilt slider to initial value (hydraulic pump starts stopped)
      const initialTiltDeg = config.initialControls.tiltAngle * 180 / Math.PI;
      this.motorPanel.setTiltAngle(initialTiltDeg);
    }
  }
  
  /**
   * Start the simulation and rendering loop
   */
  start(): void {
    this.simulation.start();
    this.animate();
  }
  
  /**
   * Animation loop (runs at display refresh rate)
   */
  private animate = (): void => {
    // Update simulation (uses fixed timestep internally)
    const currentTime = performance.now() / 1000; // Convert to seconds
    this.simulation.update(currentTime);
    
    // Update rendering from simulation state
    const state = this.simulation.getState();
    this.rendering.update(state);
    
    // Update motor panel if exists
    if (this.motorPanel) {
      this.motorPanel.update(
        this.simulation.getPlatformMotorState(),
        this.simulation.getWindmillMotorState(),
        this.simulation.getHydraulicMotorState()
      );
      
      // Update hydraulic system display
      const hydraulicMotor = this.simulation.getHydraulicMotorState();
      // Calculate simulated hydraulic values based on motor state
      const motorRunning = hydraulicMotor.shaftSpeed > 1;
      const pressure = motorRunning ? 120 + Math.sin(state.time * 2) * 10 : 0;
      const cylinderPosition = state.tilt.tiltAngle / (Math.PI / 6); // Normalize to 0-1 (max 30°)
      
      this.motorPanel.updateHydraulics({
        pressure: pressure,
        cylinderPosition: Math.max(0, Math.min(1, cylinderPosition)),
        oilTemperature: hydraulicMotor.temperature * 0.7 + 20, // Approximate oil temp
        tiltAngle: state.tilt.tiltAngle * 180 / Math.PI,
        targetTiltAngle: state.tilt.targetTiltAngle * 180 / Math.PI
      });
    }
    
    // Render frame
    this.rendering.render();
    
    // Request next frame
    this.animationFrameId = requestAnimationFrame(this.animate);
  };
  
  /**
   * Pause the simulation
   */
  pause(): void {
    this.simulation.pause();
  }
  
  /**
   * Resume the simulation
   */
  resume(): void {
    this.simulation.resume();
  }
  
  /**
   * Reset the simulation
   */
  reset(): void {
    this.simulation.reset();
    this.simulation.resetMotorFaults();
    
    // Reset motor panel frequencies and tilt (hydraulic pump stays stopped)
    if (this.motorPanel) {
      this.motorPanel.setFrequencies(0, 0);
      const config = this.simulation.getConfig();
      this.motorPanel.setTiltAngle(config.initialControls.tiltAngle * 180 / Math.PI);
    }
  }
  
  /**
   * Stop the simulation and cleanup
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.simulation.reset();
    this.rendering.dispose();
  }
  
  /**
   * Get simulation engine (for external control)
   */
  getSimulation(): SimulationEngine {
    return this.simulation;
  }
  
  /**
   * Get rendering engine (for external control)
   */
  getRendering(): RenderingEngine {
    return this.rendering;
  }
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('simulator-container');
    const motorPanelContainer = document.getElementById('motor-panel');
    
    if (container) {
      const simulator = new BalerinaSimulator(
        container,
        motorPanelContainer || undefined
      );
      simulator.start();
      
      // Expose to global scope for debugging
      (window as any).simulator = simulator;
    } else {
      console.error('Container element #simulator-container not found');
    }
  });
}

export { BalerinaSimulator };

