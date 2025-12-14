/**
 * Main Entry Point - Balerina Ride Simulator
 * 
 * This file coordinates the simulation and rendering loops.
 * 
 * Architecture:
 * - Simulation runs at fixed timestep (independent of rendering)
 * - Rendering runs at display refresh rate
 * - State is passed from simulation to rendering
 */

import { SimulationEngine } from './simulation/index.js';
import { RenderingEngine } from './rendering/index.js';
import { ControlPanel } from './ui/ControlPanel.js';
import { SimulationConfig, RotationDirection } from './types/index.js';

/**
 * Main Application Class
 */
class BalerinaSimulator {
  private simulation: SimulationEngine;
  private rendering: RenderingEngine;
  private controlPanel: ControlPanel | null = null;
  private animationFrameId: number | null = null;
  
  constructor(container: HTMLElement, controlPanelContainer?: HTMLElement) {
    // Create default simulation configuration
    // Main platform radius is 2/3 of secondary platform (windmill) radius
    const windmillRadius = 9; // meters (secondary platform radius)
    const platformRadius = (2 / 3) * windmillRadius; // meters (main platform radius = 2/3 * windmill)
    
    const config: SimulationConfig = {
      timeStep: 0.01, // 10ms fixed timestep for physics
      numCabins: 8,
      platformRadius: platformRadius,
      windmillRadius: windmillRadius,
      minEccentricRadius: 2, // meters
      maxEccentricRadius: 6, // meters
      ramping: {
        platformRampTime: 2.0, // seconds
        windmillRampTime: 2.0, // seconds
        radiusRampTime: 1.0 // seconds
      },
      initialControls: {
        platformSpeed: 0.5, // rad/s
        windmillSpeed: 1.0, // rad/s
        eccentricRadius: 4, // meters
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
    
    // Create control panel if container provided
    if (controlPanelContainer) {
      this.controlPanel = new ControlPanel(controlPanelContainer, {
        onControlsChange: (controls) => {
          this.simulation.updateControls(controls);
        },
        onEmergencyStop: () => {
          // Set all speeds to zero
          this.simulation.updateControls({
            platformSpeed: 0,
            windmillSpeed: 0
          });
        },
        onReset: () => {
          this.reset();
        }
      });
      
      // Initialize control panel with initial values
      this.controlPanel.updateFromState(config.initialControls);
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
    // Reset control panel to initial values
    if (this.controlPanel) {
      const config = this.simulation.getConfig();
      this.controlPanel.updateFromState(config.initialControls);
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
    const controlPanelContainer = document.getElementById('control-panel');
    
    if (container) {
      const simulator = new BalerinaSimulator(container, controlPanelContainer || undefined);
      simulator.start();
      
      // Expose to global scope for debugging
      (window as any).simulator = simulator;
    } else {
      console.error('Container element #simulator-container not found');
    }
  });
}

export { BalerinaSimulator };

