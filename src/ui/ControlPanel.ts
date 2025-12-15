/**
 * Control Panel UI - Balerina Ride Simulator
 * 
 * Operator-style control panel for adjusting simulation parameters.
 * 
 * Controls:
 * - Platform motor speed and direction
 * - Windmill motor speed and direction (rotates secondary platform around skirt center)
 * - Tilt angle (hydraulic control) - angle of secondary platform relative to primary
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
  
  // Tilt angle controls
  private tiltInput: HTMLInputElement;
  private tiltUpButton: HTMLButtonElement;
  private tiltDownButton: HTMLButtonElement;
  
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
    
    // Tilt Angle Section
    const tiltSection = this.createTiltSection();
    
    // System Controls Section
    const systemSection = this.createSystemSection();
    
    this.container.appendChild(platformSection);
    this.container.appendChild(windmillSection);
    this.container.appendChild(tiltSection);
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
   * Create tilt angle control section
   */
  private createTiltSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'control-section';
    
    const titleEl = document.createElement('h3');
    titleEl.textContent = 'Tilt Angle';
    section.appendChild(titleEl);
    
    const tiltGroup = document.createElement('div');
    tiltGroup.className = 'control-group';
    
    const tiltLabel = document.createElement('label');
    tiltLabel.textContent = 'Angle:';
    tiltLabel.setAttribute('for', 'tilt-input');
    tiltGroup.appendChild(tiltLabel);
    
    const tiltContainer = document.createElement('div');
    tiltContainer.className = 'tilt-control';
    
    const tiltDownBtn = document.createElement('button');
    tiltDownBtn.textContent = '▼';
    tiltDownBtn.className = 'tilt-btn';
    tiltDownBtn.addEventListener('click', () => this.decreaseTilt());
    
    const tiltInput = document.createElement('input');
    tiltInput.type = 'number';
    tiltInput.id = 'tilt-input';
    tiltInput.min = '0';
    tiltInput.max = '30';
    tiltInput.step = '1';
    tiltInput.value = '15';
    tiltInput.className = 'tilt-input';
    tiltInput.addEventListener('change', () => {
      const valueDegrees = parseFloat(tiltInput.value);
      this.updateTilt(valueDegrees * Math.PI / 180); // Convert degrees to radians
    });
    
    const tiltUpBtn = document.createElement('button');
    tiltUpBtn.textContent = '▲';
    tiltUpBtn.className = 'tilt-btn';
    tiltUpBtn.addEventListener('click', () => this.increaseTilt());
    
    tiltContainer.appendChild(tiltDownBtn);
    tiltContainer.appendChild(tiltInput);
    tiltContainer.appendChild(tiltUpBtn);
    tiltGroup.appendChild(tiltContainer);
    
    const tiltUnit = document.createElement('span');
    tiltUnit.className = 'tilt-unit';
    tiltUnit.textContent = '°';
    tiltGroup.appendChild(tiltUnit);
    
    section.appendChild(tiltGroup);
    
    this.tiltInput = tiltInput;
    this.tiltDownButton = tiltDownBtn;
    this.tiltUpButton = tiltUpBtn;
    
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
      windmillSpeed: speed
    });
  }
  
  /**
   * Update windmill direction
   */
  private updateWindmillDirection(direction: RotationDirection): void {
    this.currentWindmillDirection = direction;
    this.callbacks.onControlsChange({
      windmillDirection: direction
    });
  }
  
  /**
   * Increase tilt angle
   */
  private increaseTilt(): void {
    const currentDegrees = parseFloat(this.tiltInput.value);
    const newValueDegrees = Math.min(30, currentDegrees + 5);
    this.tiltInput.value = newValueDegrees.toString();
    this.updateTilt(newValueDegrees * Math.PI / 180);
  }
  
  /**
   * Decrease tilt angle
   */
  private decreaseTilt(): void {
    const currentDegrees = parseFloat(this.tiltInput.value);
    const newValueDegrees = Math.max(0, currentDegrees - 5);
    this.tiltInput.value = newValueDegrees.toString();
    this.updateTilt(newValueDegrees * Math.PI / 180);
  }
  
  /**
   * Update tilt angle (in radians)
   */
  private updateTilt(tiltAngle: number): void {
    this.callbacks.onControlsChange({
      tiltAngle: tiltAngle
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
      this.windmillSpeedInput.value = controls.windmillSpeed.toString();
      const speedValue = this.windmillSpeedInput.parentElement?.querySelector('.speed-value');
      if (speedValue) {
        speedValue.textContent = controls.windmillSpeed.toFixed(1) + ' rad/s';
      }
    }
    
    // Update windmill direction
    if (controls.windmillDirection !== this.currentWindmillDirection) {
      this.currentWindmillDirection = controls.windmillDirection;
      this.updateDirectionButtons(
        'windmill',
        controls.windmillDirection,
        this.windmillDirectionCW,
        this.windmillDirectionCCW
      );
    }
    
    // Update tilt angle (convert radians to degrees for display)
    if (this.tiltInput) {
      const tiltDegrees = (controls.tiltAngle * 180 / Math.PI).toFixed(0);
      this.tiltInput.value = tiltDegrees;
    }
  }
}



