/**
 * Control Panel UI - Balerina Ride Simulator
 * 
 * Operator-style control panel for adjusting simulation parameters.
 * 
 * Controls:
 * - Platform motor speed and direction
 * - Windmill (eccentric) motor speed and direction
 * - Eccentric radius (hydraulic control)
 * - Emergency stop
 */

import { OperatorControls, RotationDirection } from '../types/index.js';

export interface ControlPanelCallbacks {
  onControlsChange: (controls: Partial<OperatorControls>) => void;
  onEmergencyStop: () => void;
  onReset: () => void;
}

/**
 * Control Panel Class
 * 
 * Creates and manages the operator control panel UI.
 */
export class ControlPanel {
  private container: HTMLElement;
  private callbacks: ControlPanelCallbacks;
  
  // Platform controls
  private platformSpeedInput: HTMLInputElement;
  private platformDirectionCW: HTMLButtonElement;
  private platformDirectionCCW: HTMLButtonElement;
  
  // Windmill controls
  private windmillSpeedInput: HTMLInputElement;
  private windmillDirectionCW: HTMLButtonElement;
  private windmillDirectionCCW: HTMLButtonElement;
  
  // Eccentric radius controls
  private radiusInput: HTMLInputElement;
  private radiusUpButton: HTMLButtonElement;
  private radiusDownButton: HTMLButtonElement;
  
  // System controls
  private emergencyStopButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  
  // Current state
  private currentPlatformDirection: RotationDirection = RotationDirection.COUNTER_CLOCKWISE;
  private currentWindmillDirection: RotationDirection = RotationDirection.COUNTER_CLOCKWISE;
  
  constructor(container: HTMLElement, callbacks: ControlPanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.createPanel();
  }
  
  /**
   * Create the control panel UI
   */
  private createPanel(): void {
    this.container.innerHTML = '';
    this.container.className = 'control-panel';
    
    // Platform Motor Section
    const platformSection = this.createMotorSection(
      'Platform Motor',
      'platform',
      (speed) => this.updatePlatformSpeed(speed),
      (direction) => this.updatePlatformDirection(direction)
    );
    
    // Windmill Motor Section
    const windmillSection = this.createMotorSection(
      'Windmill Motor',
      'windmill',
      (speed) => this.updateWindmillSpeed(speed),
      (direction) => this.updateWindmillDirection(direction)
    );
    
    // Eccentric Radius Section
    const radiusSection = this.createRadiusSection();
    
    // System Controls Section
    const systemSection = this.createSystemSection();
    
    this.container.appendChild(platformSection);
    this.container.appendChild(windmillSection);
    this.container.appendChild(radiusSection);
    this.container.appendChild(systemSection);
  }
  
  /**
   * Create a motor control section (platform or windmill)
   */
  private createMotorSection(
    title: string,
    prefix: string,
    onSpeedChange: (speed: number) => void,
    onDirectionChange: (direction: RotationDirection) => void
  ): HTMLElement {
    const section = document.createElement('div');
    section.className = 'control-section';
    
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    section.appendChild(titleEl);
    
    // Speed control
    const speedGroup = document.createElement('div');
    speedGroup.className = 'control-group';
    
    const speedLabel = document.createElement('label');
    speedLabel.textContent = 'Speed:';
    speedLabel.setAttribute('for', `${prefix}-speed`);
    speedGroup.appendChild(speedLabel);
    
    const speedContainer = document.createElement('div');
    speedContainer.className = 'speed-control';
    
    const speedInput = document.createElement('input');
    speedInput.type = 'range';
    speedInput.id = `${prefix}-speed`;
    speedInput.min = '0';
    speedInput.max = '3';
    speedInput.step = '0.1';
    speedInput.value = '0.5';
    speedInput.className = 'speed-slider';
    
    const speedValue = document.createElement('span');
    speedValue.className = 'speed-value';
    speedValue.textContent = '0.5 rad/s';
    
    speedInput.addEventListener('input', () => {
      const value = parseFloat(speedInput.value);
      speedValue.textContent = value.toFixed(1) + ' rad/s';
      onSpeedChange(value);
    });
    
    speedContainer.appendChild(speedInput);
    speedContainer.appendChild(speedValue);
    speedGroup.appendChild(speedContainer);
    section.appendChild(speedGroup);
    
    // Direction control
    const directionGroup = document.createElement('div');
    directionGroup.className = 'control-group';
    
    const directionLabel = document.createElement('label');
    directionLabel.textContent = 'Direction:';
    directionGroup.appendChild(directionLabel);
    
    const directionButtons = document.createElement('div');
    directionButtons.className = 'direction-buttons';
    
    const cwButton = document.createElement('button');
    cwButton.textContent = 'CW';
    cwButton.className = 'direction-btn';
    cwButton.addEventListener('click', () => {
      onDirectionChange(RotationDirection.CLOCKWISE);
      this.updateDirectionButtons(prefix, RotationDirection.CLOCKWISE, cwButton, ccwButton);
    });
    
    const ccwButton = document.createElement('button');
    ccwButton.textContent = 'CCW';
    ccwButton.className = 'direction-btn active';
    ccwButton.addEventListener('click', () => {
      onDirectionChange(RotationDirection.COUNTER_CLOCKWISE);
      this.updateDirectionButtons(prefix, RotationDirection.COUNTER_CLOCKWISE, cwButton, ccwButton);
    });
    
    directionButtons.appendChild(cwButton);
    directionButtons.appendChild(ccwButton);
    directionGroup.appendChild(directionButtons);
    section.appendChild(directionGroup);
    
    // Store references
    if (prefix === 'platform') {
      this.platformSpeedInput = speedInput;
      this.platformDirectionCW = cwButton;
      this.platformDirectionCCW = ccwButton;
    } else {
      this.windmillSpeedInput = speedInput;
      this.windmillDirectionCW = cwButton;
      this.windmillDirectionCCW = ccwButton;
    }
    
    return section;
  }
  
  /**
   * Update direction button states
   */
  private updateDirectionButtons(
    prefix: string,
    direction: RotationDirection,
    cwButton: HTMLButtonElement,
    ccwButton: HTMLButtonElement
  ): void {
    if (direction === RotationDirection.CLOCKWISE) {
      cwButton.classList.add('active');
      ccwButton.classList.remove('active');
    } else {
      ccwButton.classList.add('active');
      cwButton.classList.remove('active');
    }
  }
  
  /**
   * Create eccentric radius control section
   */
  private createRadiusSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'control-section';
    
    const titleEl = document.createElement('h3');
    titleEl.textContent = 'Eccentric Radius';
    section.appendChild(titleEl);
    
    const radiusGroup = document.createElement('div');
    radiusGroup.className = 'control-group';
    
    const radiusLabel = document.createElement('label');
    radiusLabel.textContent = 'Radius:';
    radiusLabel.setAttribute('for', 'radius-input');
    radiusGroup.appendChild(radiusLabel);
    
    const radiusContainer = document.createElement('div');
    radiusContainer.className = 'radius-control';
    
    const radiusDownBtn = document.createElement('button');
    radiusDownBtn.textContent = '▼';
    radiusDownBtn.className = 'radius-btn';
    radiusDownBtn.addEventListener('click', () => this.decreaseRadius());
    
    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.id = 'radius-input';
    radiusInput.min = '2';
    radiusInput.max = '6';
    radiusInput.step = '0.1';
    radiusInput.value = '4';
    radiusInput.className = 'radius-input';
    radiusInput.addEventListener('change', () => {
      const value = parseFloat(radiusInput.value);
      this.updateRadius(value);
    });
    
    const radiusUpBtn = document.createElement('button');
    radiusUpBtn.textContent = '▲';
    radiusUpBtn.className = 'radius-btn';
    radiusUpBtn.addEventListener('click', () => this.increaseRadius());
    
    radiusContainer.appendChild(radiusDownBtn);
    radiusContainer.appendChild(radiusInput);
    radiusContainer.appendChild(radiusUpBtn);
    radiusGroup.appendChild(radiusContainer);
    
    const radiusUnit = document.createElement('span');
    radiusUnit.className = 'radius-unit';
    radiusUnit.textContent = 'm';
    radiusGroup.appendChild(radiusUnit);
    
    section.appendChild(radiusGroup);
    
    this.radiusInput = radiusInput;
    this.radiusDownButton = radiusDownBtn;
    this.radiusUpButton = radiusUpBtn;
    
    return section;
  }
  
  /**
   * Create system controls section
   */
  private createSystemSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'control-section system-controls';
    
    const emergencyStopBtn = document.createElement('button');
    emergencyStopBtn.textContent = 'EMERGENCY STOP';
    emergencyStopBtn.className = 'emergency-stop-btn';
    emergencyStopBtn.addEventListener('click', () => {
      this.callbacks.onEmergencyStop();
    });
    
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'RESET';
    resetBtn.className = 'reset-btn';
    resetBtn.addEventListener('click', () => {
      this.callbacks.onReset();
    });
    
    section.appendChild(emergencyStopBtn);
    section.appendChild(resetBtn);
    
    this.emergencyStopButton = emergencyStopBtn;
    this.resetButton = resetBtn;
    
    return section;
  }
  
  /**
   * Update platform speed
   */
  private updatePlatformSpeed(speed: number): void {
    this.callbacks.onControlsChange({
      platformSpeed: speed
    });
  }
  
  /**
   * Update platform direction
   */
  private updatePlatformDirection(direction: RotationDirection): void {
    this.currentPlatformDirection = direction;
    this.callbacks.onControlsChange({
      platformDirection: direction
    });
  }
  
  /**
   * Update windmill speed
   */
  private updateWindmillSpeed(speed: number): void {
    this.callbacks.onControlsChange({
      eccentricSpeed: speed
    });
  }
  
  /**
   * Update windmill direction
   */
  private updateWindmillDirection(direction: RotationDirection): void {
    this.currentWindmillDirection = direction;
    this.callbacks.onControlsChange({
      eccentricDirection: direction
    });
  }
  
  /**
   * Increase eccentric radius
   */
  private increaseRadius(): void {
    const current = parseFloat(this.radiusInput.value);
    const newValue = Math.min(6, current + 0.5);
    this.radiusInput.value = newValue.toString();
    this.updateRadius(newValue);
  }
  
  /**
   * Decrease eccentric radius
   */
  private decreaseRadius(): void {
    const current = parseFloat(this.radiusInput.value);
    const newValue = Math.max(2, current - 0.5);
    this.radiusInput.value = newValue.toString();
    this.updateRadius(newValue);
  }
  
  /**
   * Update eccentric radius
   */
  private updateRadius(radius: number): void {
    this.callbacks.onControlsChange({
      eccentricRadius: radius
    });
  }
  
  /**
   * Update control values from simulation state (for syncing)
   */
  updateFromState(controls: OperatorControls): void {
    // Update platform speed
    if (this.platformSpeedInput) {
      this.platformSpeedInput.value = controls.platformSpeed.toString();
      const speedValue = this.platformSpeedInput.parentElement?.querySelector('.speed-value');
      if (speedValue) {
        speedValue.textContent = controls.platformSpeed.toFixed(1) + ' rad/s';
      }
    }
    
    // Update platform direction
    if (controls.platformDirection !== this.currentPlatformDirection) {
      this.currentPlatformDirection = controls.platformDirection;
      this.updateDirectionButtons(
        'platform',
        controls.platformDirection,
        this.platformDirectionCW,
        this.platformDirectionCCW
      );
    }
    
    // Update windmill speed
    if (this.windmillSpeedInput) {
      this.windmillSpeedInput.value = controls.eccentricSpeed.toString();
      const speedValue = this.windmillSpeedInput.parentElement?.querySelector('.speed-value');
      if (speedValue) {
        speedValue.textContent = controls.eccentricSpeed.toFixed(1) + ' rad/s';
      }
    }
    
    // Update windmill direction
    if (controls.eccentricDirection !== this.currentWindmillDirection) {
      this.currentWindmillDirection = controls.eccentricDirection;
      this.updateDirectionButtons(
        'windmill',
        controls.eccentricDirection,
        this.windmillDirectionCW,
        this.windmillDirectionCCW
      );
    }
    
    // Update radius
    if (this.radiusInput) {
      this.radiusInput.value = controls.eccentricRadius.toString();
    }
  }
}

