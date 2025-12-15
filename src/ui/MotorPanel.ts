/**
 * Motor Panel UI - Balerina Ride Simulator
 * 
 * Complete operator panel with electrical data and hydraulic controls.
 * Styled as an industrial control panel with analog-style meters.
 * 
 * Features:
 * - 3-phase amp meters for each motor (Platform, Windmill, Hydraulic)
 * - Voltage and frequency displays
 * - Power consumption
 * - Motor status indicators
 * - VFD frequency and direction control
 * - Hydraulic system: oil pressure, cylinder position, temperature
 * - Tilt angle control
 */

import { MotorState, MotorOperatingState, MotorFault, MotorDirection, ThreePhaseElectrical } from '../motors/types.js';

/**
 * Hydraulic system state for display
 */
export interface HydraulicDisplayState {
  /** System pressure (bar) */
  pressure: number;
  /** Cylinder position (0-1, normalized) */
  cylinderPosition: number;
  /** Oil temperature (°C) */
  oilTemperature: number;
  /** Current tilt angle (degrees) */
  tiltAngle: number;
  /** Target tilt angle (degrees) */
  targetTiltAngle: number;
}

export interface MotorPanelCallbacks {
  onPlatformFrequencyChange: (frequency: number) => void;
  onWindmillFrequencyChange: (frequency: number) => void;
  onPlatformDirectionChange: (direction: MotorDirection) => void;
  onWindmillDirectionChange: (direction: MotorDirection) => void;
  onHydraulicStart: () => void;
  onHydraulicStop: () => void;
  onTiltChange: (angleDegrees: number) => void;
  onTiltUp: () => void;
  onTiltDown: () => void;
  onEmergencyStop: () => void;
  onResetFaults: () => void;
}

/**
 * Motor Panel Class
 * 
 * Creates and manages the motor electrical display panel.
 */
export class MotorPanel {
  private container: HTMLElement;
  private callbacks: MotorPanelCallbacks;
  
  // Meter elements
  private platformMeters!: PhaseMeters;
  private windmillMeters!: PhaseMeters;
  private hydraulicMeters!: PhaseMeters;
  
  // Status elements
  private platformStatus!: HTMLElement;
  private windmillStatus!: HTMLElement;
  private hydraulicStatus!: HTMLElement;
  
  // Frequency controls
  private platformFreqSlider!: HTMLInputElement;
  private windmillFreqSlider!: HTMLInputElement;
  
  // Direction controls
  private platformFwdBtn!: HTMLButtonElement;
  private platformRevBtn!: HTMLButtonElement;
  private windmillFwdBtn!: HTMLButtonElement;
  private windmillRevBtn!: HTMLButtonElement;
  
  // Direction indicators
  private platformDirIndicator!: HTMLElement;
  private windmillDirIndicator!: HTMLElement;
  
  // Power displays
  private platformPowerDisplay!: HTMLElement;
  private windmillPowerDisplay!: HTMLElement;
  private hydraulicPowerDisplay!: HTMLElement;
  private totalPowerDisplay!: HTMLElement;
  
  // Hydraulic system displays
  private pressureGauge!: HTMLElement;
  private pressureValue!: HTMLElement;
  private cylinderPosition!: HTMLElement;
  private oilTempValue!: HTMLElement;
  
  // Tilt controls
  private tiltAngleDisplay!: HTMLElement;
  private tiltTargetDisplay!: HTMLElement;
  private tiltSlider!: HTMLInputElement;
  private tiltUpBtn!: HTMLButtonElement;
  private tiltDownBtn!: HTMLButtonElement;
  private tiltControlsSection!: HTMLElement;
  
  // Hydraulic system has sufficient pressure for tilt operation
  private hydraulicPressureOk: boolean = false;
  
  // Minimum pressure required for tilt operation (bar)
  private static readonly MIN_TILT_PRESSURE = 100;
  
  constructor(container: HTMLElement, callbacks: MotorPanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.createPanel();
  }
  
  /**
   * Create the motor panel UI
   */
  private createPanel(): void {
    this.container.innerHTML = '';
    this.container.className = 'motor-panel';
    
    // Header row: title + power summary + emergency stop
    const headerRow = document.createElement('div');
    headerRow.className = 'panel-header-row';
    
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.innerHTML = '<h2>⚡ OPERATOR PANEL</h2><span class="subtitle">3-Phase 380V 50Hz</span>';
    headerRow.appendChild(title);
    
    const powerSummary = this.createPowerSummary();
    headerRow.appendChild(powerSummary);
    
    const emergencySection = this.createEmergencySection();
    headerRow.appendChild(emergencySection);
    
    this.container.appendChild(headerRow);
    
    // Main content: Motors + Hydraulic/Tilt side by side
    const mainContent = document.createElement('div');
    mainContent.className = 'panel-main-content';
    
    // Left side: Motor sections
    const motorsGrid = document.createElement('div');
    motorsGrid.className = 'motors-grid';
    
    // Platform motor section
    const platformSection = this.createMotorSection('PLATFORM', 'platform', '15 kW');
    this.platformMeters = platformSection.meters;
    this.platformStatus = platformSection.status;
    this.platformPowerDisplay = platformSection.power;
    if (platformSection.freqSlider) {
      this.platformFreqSlider = platformSection.freqSlider;
    }
    motorsGrid.appendChild(platformSection.element);
    
    // Windmill motor section
    const windmillSection = this.createMotorSection('WINDMILL', 'windmill', '7.5 kW');
    this.windmillMeters = windmillSection.meters;
    this.windmillStatus = windmillSection.status;
    this.windmillPowerDisplay = windmillSection.power;
    if (windmillSection.freqSlider) {
      this.windmillFreqSlider = windmillSection.freqSlider;
    }
    motorsGrid.appendChild(windmillSection.element);
    
    // Hydraulic motor section
    const hydraulicSection = this.createMotorSection('HYDRAULIC', 'hydraulic', '3 kW', true);
    this.hydraulicMeters = hydraulicSection.meters;
    this.hydraulicStatus = hydraulicSection.status;
    this.hydraulicPowerDisplay = hydraulicSection.power;
    motorsGrid.appendChild(hydraulicSection.element);
    
    mainContent.appendChild(motorsGrid);
    
    // Right side: Hydraulic system and tilt control
    const hydraulicSystemSection = this.createHydraulicSystemSection();
    mainContent.appendChild(hydraulicSystemSection);
    
    this.container.appendChild(mainContent);
  }
  
  /**
   * Create hydraulic system display and tilt control section
   */
  private createHydraulicSystemSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'hydraulic-system-section';
    
    section.innerHTML = `
      <div class="section-header">
        <h3>🛢️ HYDRAULIC SYSTEM & TILT</h3>
      </div>
      <div class="hydraulic-grid">
        <div class="hydraulic-gauges">
          <div class="gauge-group">
            <div class="gauge pressure-gauge">
              <div class="gauge-arc">
                <div class="gauge-fill" style="--percentage: 0"></div>
              </div>
              <div class="gauge-needle" style="--rotation: -90deg"></div>
              <div class="gauge-center"></div>
              <div class="gauge-value">0</div>
              <div class="gauge-unit">bar</div>
              <div class="gauge-label">OIL PRESSURE</div>
              <div class="gauge-scale">
                <span>0</span>
                <span>100</span>
                <span>200</span>
              </div>
            </div>
          </div>
          <div class="hydraulic-stats">
            <div class="stat-row">
              <span class="stat-label">Cylinder:</span>
              <div class="cylinder-bar">
                <div class="cylinder-fill" style="width: 0%"></div>
                <span class="cylinder-value">0%</span>
              </div>
            </div>
            <div class="stat-row">
              <span class="stat-label">Oil Temp:</span>
              <span class="stat-value oil-temp">25°C</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Flow:</span>
              <span class="stat-value flow-rate">0 L/min</span>
            </div>
          </div>
        </div>
        <div class="tilt-control-section">
          <div class="tilt-display">
            <div class="tilt-indicator">
              <div class="tilt-platform">
                <div class="tilt-line" style="--tilt: 0deg"></div>
              </div>
              <div class="tilt-values">
                <div class="tilt-current">
                  <span class="tilt-label">CURRENT</span>
                  <span class="tilt-angle">0.0°</span>
                </div>
                <div class="tilt-target">
                  <span class="tilt-label">TARGET</span>
                  <span class="tilt-target-angle">0.0°</span>
                </div>
              </div>
            </div>
          </div>
          <div class="tilt-controls">
            <label>Tilt Angle:</label>
            <div class="tilt-buttons">
              <button class="tilt-btn tilt-down-btn" title="Decrease tilt">▼</button>
              <input type="range" class="tilt-slider" min="0" max="30" step="1" value="0">
              <button class="tilt-btn tilt-up-btn" title="Increase tilt">▲</button>
            </div>
            <span class="tilt-slider-value">0°</span>
          </div>
        </div>
      </div>
    `;
    
    // Get references to elements
    this.pressureGauge = section.querySelector('.pressure-gauge') as HTMLElement;
    this.pressureValue = section.querySelector('.gauge-value') as HTMLElement;
    this.cylinderPosition = section.querySelector('.cylinder-fill') as HTMLElement;
    this.oilTempValue = section.querySelector('.oil-temp') as HTMLElement;
    this.tiltAngleDisplay = section.querySelector('.tilt-angle') as HTMLElement;
    this.tiltTargetDisplay = section.querySelector('.tilt-target-angle') as HTMLElement;
    this.tiltSlider = section.querySelector('.tilt-slider') as HTMLInputElement;
    this.tiltUpBtn = section.querySelector('.tilt-up-btn') as HTMLButtonElement;
    this.tiltDownBtn = section.querySelector('.tilt-down-btn') as HTMLButtonElement;
    this.tiltControlsSection = section.querySelector('.tilt-control-section') as HTMLElement;
    
    const tiltSliderValue = section.querySelector('.tilt-slider-value') as HTMLElement;
    const cylinderValueEl = section.querySelector('.cylinder-value') as HTMLElement;
    const tiltLine = section.querySelector('.tilt-line') as HTMLElement;
    
    // Tilt slider event - only works if hydraulic pressure is sufficient
    this.tiltSlider.addEventListener('input', () => {
      if (!this.hydraulicPressureOk) {
        return; // Ignore input if no pressure
      }
      const angle = parseFloat(this.tiltSlider.value);
      tiltSliderValue.textContent = `${angle}°`;
      this.callbacks.onTiltChange(angle);
    });
    
    // Tilt up button - only works if hydraulic pressure is sufficient
    this.tiltUpBtn.addEventListener('click', () => {
      if (!this.hydraulicPressureOk) {
        return; // Ignore click if no pressure
      }
      const current = parseFloat(this.tiltSlider.value);
      const newVal = Math.min(30, current + 5);
      this.tiltSlider.value = newVal.toString();
      tiltSliderValue.textContent = `${newVal}°`;
      this.callbacks.onTiltUp();
    });
    
    // Tilt down button - only works if hydraulic pressure is sufficient
    this.tiltDownBtn.addEventListener('click', () => {
      if (!this.hydraulicPressureOk) {
        return; // Ignore click if no pressure
      }
      const current = parseFloat(this.tiltSlider.value);
      const newVal = Math.max(0, current - 5);
      this.tiltSlider.value = newVal.toString();
      tiltSliderValue.textContent = `${newVal}°`;
      this.callbacks.onTiltDown();
    });
    
    // Initially disable tilt controls until hydraulic pump is running
    this.updateTiltControlsEnabled(false);
    
    return section;
  }
  
  /**
   * Create power summary display
   */
  private createPowerSummary(): HTMLElement {
    const summary = document.createElement('div');
    summary.className = 'power-summary';
    
    summary.innerHTML = `
      <div class="power-stat">
        <span class="power-label">MAINS</span>
        <span class="power-value" id="mains-voltage">380V</span>
        <span class="power-unit">50Hz</span>
      </div>
      <div class="power-stat total">
        <span class="power-label">TOTAL POWER</span>
        <span class="power-value" id="total-power">0.0</span>
        <span class="power-unit">kW</span>
      </div>
      <div class="power-stat">
        <span class="power-label">POWER FACTOR</span>
        <span class="power-value" id="total-pf">1.00</span>
      </div>
    `;
    
    this.totalPowerDisplay = summary.querySelector('#total-power')!;
    return summary;
  }
  
  /**
   * Create a motor section with 3-phase amp meters
   */
  private createMotorSection(
    name: string,
    prefix: string,
    rating: string,
    isHydraulic: boolean = false
  ): {
    element: HTMLElement;
    meters: PhaseMeters;
    status: HTMLElement;
    power: HTMLElement;
    freqSlider?: HTMLInputElement;
  } {
    const section = document.createElement('div');
    section.className = `motor-section ${prefix}-motor`;
    
    // Header
    const header = document.createElement('div');
    header.className = 'motor-header';
    header.innerHTML = `
      <h3>${name}</h3>
      <span class="motor-rating">${rating}</span>
    `;
    section.appendChild(header);
    
    // Status indicator
    const status = document.createElement('div');
    status.className = 'motor-status stopped';
    status.innerHTML = '<span class="status-led"></span><span class="status-text">STOPPED</span>';
    section.appendChild(status);
    
    // 3-phase amp meters
    const metersContainer = document.createElement('div');
    metersContainer.className = 'phase-meters';
    
    const phaseA = this.createAmpMeter('A', prefix);
    const phaseB = this.createAmpMeter('B', prefix);
    const phaseC = this.createAmpMeter('C', prefix);
    
    metersContainer.appendChild(phaseA.element);
    metersContainer.appendChild(phaseB.element);
    metersContainer.appendChild(phaseC.element);
    section.appendChild(metersContainer);
    
    // Power display
    const powerDisplay = document.createElement('div');
    powerDisplay.className = 'motor-power';
    powerDisplay.innerHTML = `
      <div class="power-row">
        <span>Power:</span>
        <span class="power-value">0.0 kW</span>
      </div>
      <div class="power-row">
        <span>Speed:</span>
        <span class="speed-value">0 RPM</span>
      </div>
      <div class="power-row">
        <span>Temp:</span>
        <span class="temp-value">25°C</span>
      </div>
    `;
    section.appendChild(powerDisplay);
    
    let freqSlider: HTMLInputElement | undefined;
    let fwdBtn: HTMLButtonElement | undefined;
    let revBtn: HTMLButtonElement | undefined;
    let dirIndicator: HTMLElement | undefined;
    
    if (!isHydraulic) {
      // Frequency control
      const freqControl = document.createElement('div');
      freqControl.className = 'freq-control';
      freqControl.innerHTML = `
        <label>VFD Frequency:</label>
        <input type="range" class="freq-slider" min="0" max="60" step="1" value="0">
        <span class="freq-value">0 Hz</span>
      `;
      section.appendChild(freqControl);
      
      freqSlider = freqControl.querySelector('.freq-slider') as HTMLInputElement;
      const freqValue = freqControl.querySelector('.freq-value') as HTMLElement;
      
      freqSlider.addEventListener('input', () => {
        const freq = parseFloat(freqSlider!.value);
        freqValue.textContent = `${freq} Hz`;
        if (prefix === 'platform') {
          this.callbacks.onPlatformFrequencyChange(freq);
        } else {
          this.callbacks.onWindmillFrequencyChange(freq);
        }
      });
      
      // Direction control (VFD phase sequence swap)
      const dirControl = document.createElement('div');
      dirControl.className = 'dir-control';
      dirControl.innerHTML = `
        <label>Direction (Phase Seq.):</label>
        <div class="dir-buttons">
          <button class="dir-btn fwd-btn active" title="Forward: A-B-C phase sequence">FWD</button>
          <button class="dir-btn rev-btn" title="Reverse: A-C-B phase sequence (B↔C swap)">REV</button>
        </div>
        <span class="dir-indicator">A→B→C</span>
      `;
      section.appendChild(dirControl);
      
      fwdBtn = dirControl.querySelector('.fwd-btn') as HTMLButtonElement;
      revBtn = dirControl.querySelector('.rev-btn') as HTMLButtonElement;
      dirIndicator = dirControl.querySelector('.dir-indicator') as HTMLElement;
      
      fwdBtn.addEventListener('click', () => {
        fwdBtn!.classList.add('active');
        revBtn!.classList.remove('active');
        dirIndicator!.textContent = 'A→B→C';
        dirIndicator!.classList.remove('reverse');
        if (prefix === 'platform') {
          this.callbacks.onPlatformDirectionChange(MotorDirection.FORWARD);
        } else {
          this.callbacks.onWindmillDirectionChange(MotorDirection.FORWARD);
        }
      });
      
      revBtn.addEventListener('click', () => {
        revBtn!.classList.add('active');
        fwdBtn!.classList.remove('active');
        dirIndicator!.textContent = 'A→C→B';
        dirIndicator!.classList.add('reverse');
        if (prefix === 'platform') {
          this.callbacks.onPlatformDirectionChange(MotorDirection.REVERSE);
        } else {
          this.callbacks.onWindmillDirectionChange(MotorDirection.REVERSE);
        }
      });
      
      // Store direction control references
      if (prefix === 'platform') {
        this.platformFwdBtn = fwdBtn;
        this.platformRevBtn = revBtn;
        this.platformDirIndicator = dirIndicator;
      } else {
        this.windmillFwdBtn = fwdBtn;
        this.windmillRevBtn = revBtn;
        this.windmillDirIndicator = dirIndicator;
      }
    } else {
      // Hydraulic start/stop buttons
      const controlBtns = document.createElement('div');
      controlBtns.className = 'hydraulic-controls';
      controlBtns.innerHTML = `
        <button class="hydraulic-start">START</button>
        <button class="hydraulic-stop">STOP</button>
      `;
      section.appendChild(controlBtns);
      
      controlBtns.querySelector('.hydraulic-start')!.addEventListener('click', () => {
        this.callbacks.onHydraulicStart();
      });
      controlBtns.querySelector('.hydraulic-stop')!.addEventListener('click', () => {
        this.callbacks.onHydraulicStop();
      });
    }
    
    return {
      element: section,
      meters: { phaseA, phaseB, phaseC },
      status,
      power: powerDisplay,
      freqSlider
    };
  }
  
  /**
   * Create an analog-style amp meter for a single phase
   */
  private createAmpMeter(phase: string, prefix: string): AmpMeter {
    const meter = document.createElement('div');
    meter.className = 'amp-meter';
    meter.dataset.phase = phase;
    
    // Determine max amps based on motor type
    let maxAmps = 30; // Default for platform
    if (prefix === 'windmill') maxAmps = 20;
    if (prefix === 'hydraulic') maxAmps = 10;
    
    meter.innerHTML = `
      <div class="meter-face">
        <div class="meter-scale">
          <span class="scale-0">0</span>
          <span class="scale-mid">${maxAmps / 2}</span>
          <span class="scale-max">${maxAmps}</span>
        </div>
        <div class="meter-arc">
          <div class="arc-bg"></div>
          <div class="arc-fill" style="--percentage: 0"></div>
          <div class="arc-warning"></div>
          <div class="arc-danger"></div>
        </div>
        <div class="meter-needle" style="--rotation: -45deg"></div>
        <div class="meter-pivot"></div>
      </div>
      <div class="meter-reading">
        <span class="reading-value">0.0</span>
        <span class="reading-unit">A</span>
      </div>
      <div class="meter-label">Phase ${phase}</div>
    `;
    
    const needle = meter.querySelector('.meter-needle') as HTMLElement;
    const reading = meter.querySelector('.reading-value') as HTMLElement;
    const arcFill = meter.querySelector('.arc-fill') as HTMLElement;
    
    return {
      element: meter,
      needle,
      reading,
      arcFill,
      maxAmps
    };
  }
  
  /**
   * Create emergency controls section
   */
  private createEmergencySection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'emergency-section';
    
    section.innerHTML = `
      <button class="emergency-stop-btn motor-estop">
        <span class="estop-icon">⬤</span>
        EMERGENCY STOP
      </button>
      <button class="reset-faults-btn">RESET FAULTS</button>
    `;
    
    section.querySelector('.motor-estop')!.addEventListener('click', () => {
      this.callbacks.onEmergencyStop();
    });
    
    section.querySelector('.reset-faults-btn')!.addEventListener('click', () => {
      this.callbacks.onResetFaults();
    });
    
    return section;
  }
  
  /**
   * Update amp meter display
   */
  private updateMeter(meter: AmpMeter, current: number): void {
    const percentage = Math.min(100, (current / meter.maxAmps) * 100);
    const rotation = -45 + (percentage * 0.9); // -45 to +45 degrees
    
    meter.needle.style.setProperty('--rotation', `${rotation}deg`);
    meter.reading.textContent = current.toFixed(1);
    meter.arcFill.style.setProperty('--percentage', `${percentage}`);
    
    // Color coding based on load
    meter.element.classList.remove('normal', 'warning', 'danger');
    if (percentage > 100) {
      meter.element.classList.add('danger');
    } else if (percentage > 80) {
      meter.element.classList.add('warning');
    } else {
      meter.element.classList.add('normal');
    }
  }
  
  /**
   * Update motor status indicator
   */
  private updateStatus(statusEl: HTMLElement, state: MotorOperatingState, fault: MotorFault): void {
    const statusText = statusEl.querySelector('.status-text') as HTMLElement;
    
    statusEl.className = 'motor-status';
    
    if (fault !== MotorFault.NONE) {
      statusEl.classList.add('fault');
      statusText.textContent = `FAULT: ${fault}`;
      return;
    }
    
    switch (state) {
      case MotorOperatingState.STOPPED:
        statusEl.classList.add('stopped');
        statusText.textContent = 'STOPPED';
        break;
      case MotorOperatingState.ACCELERATING:
        statusEl.classList.add('accelerating');
        statusText.textContent = 'ACCEL';
        break;
      case MotorOperatingState.RUNNING:
        statusEl.classList.add('running');
        statusText.textContent = 'RUNNING';
        break;
      case MotorOperatingState.DECELERATING:
        statusEl.classList.add('decelerating');
        statusText.textContent = 'DECEL';
        break;
      case MotorOperatingState.REGENERATING:
        statusEl.classList.add('regenerating');
        statusText.textContent = 'REGEN';
        break;
      case MotorOperatingState.FAULT:
        statusEl.classList.add('fault');
        statusText.textContent = 'FAULT';
        break;
    }
  }
  
  /**
   * Update power display for a motor
   */
  private updatePowerDisplay(powerEl: HTMLElement, state: MotorState): void {
    const powerValue = powerEl.querySelector('.power-value') as HTMLElement;
    const speedValue = powerEl.querySelector('.speed-value') as HTMLElement;
    const tempValue = powerEl.querySelector('.temp-value') as HTMLElement;
    
    powerValue.textContent = `${(state.electricalPower / 1000).toFixed(1)} kW`;
    
    // Convert rad/s to RPM for display
    const rpm = (state.shaftSpeed * 60) / (2 * Math.PI);
    speedValue.textContent = `${rpm.toFixed(0)} RPM`;
    
    tempValue.textContent = `${state.temperature.toFixed(0)}°C`;
    
    // Color code temperature
    tempValue.classList.remove('normal', 'warning', 'danger');
    if (state.temperature > 100) {
      tempValue.classList.add('danger');
    } else if (state.temperature > 80) {
      tempValue.classList.add('warning');
    }
  }
  
  /**
   * Update direction indicator display
   */
  private updateDirectionIndicator(
    fwdBtn: HTMLButtonElement,
    revBtn: HTMLButtonElement,
    indicator: HTMLElement,
    state: MotorState
  ): void {
    const { currentDirection, targetDirection, directionChangePending } = state.vfd;
    
    // Update button states based on target direction
    if (targetDirection === MotorDirection.FORWARD) {
      fwdBtn.classList.add('active');
      revBtn.classList.remove('active');
    } else {
      revBtn.classList.add('active');
      fwdBtn.classList.remove('active');
    }
    
    // Update indicator text and style
    if (directionChangePending) {
      // Direction change in progress - show pending state
      indicator.textContent = 'REVERSING...';
      indicator.classList.add('pending');
      indicator.classList.remove('reverse');
    } else if (currentDirection === MotorDirection.FORWARD) {
      indicator.textContent = 'A→B→C';
      indicator.classList.remove('reverse', 'pending');
    } else {
      indicator.textContent = 'A→C→B';
      indicator.classList.add('reverse');
      indicator.classList.remove('pending');
    }
  }
  
  /**
   * Update all motor displays from simulation state
   */
  update(platformMotor: MotorState, windmillMotor: MotorState, hydraulicMotor: MotorState): void {
    // Update platform motor
    this.updateMeter(this.platformMeters.phaseA, platformMotor.electrical.phaseA.current);
    this.updateMeter(this.platformMeters.phaseB, platformMotor.electrical.phaseB.current);
    this.updateMeter(this.platformMeters.phaseC, platformMotor.electrical.phaseC.current);
    this.updateStatus(this.platformStatus, platformMotor.operatingState, platformMotor.fault);
    this.updatePowerDisplay(this.platformPowerDisplay, platformMotor);
    this.updateDirectionIndicator(
      this.platformFwdBtn, 
      this.platformRevBtn, 
      this.platformDirIndicator, 
      platformMotor
    );
    
    // Update windmill motor
    this.updateMeter(this.windmillMeters.phaseA, windmillMotor.electrical.phaseA.current);
    this.updateMeter(this.windmillMeters.phaseB, windmillMotor.electrical.phaseB.current);
    this.updateMeter(this.windmillMeters.phaseC, windmillMotor.electrical.phaseC.current);
    this.updateStatus(this.windmillStatus, windmillMotor.operatingState, windmillMotor.fault);
    this.updatePowerDisplay(this.windmillPowerDisplay, windmillMotor);
    this.updateDirectionIndicator(
      this.windmillFwdBtn, 
      this.windmillRevBtn, 
      this.windmillDirIndicator, 
      windmillMotor
    );
    
    // Update hydraulic motor
    this.updateMeter(this.hydraulicMeters.phaseA, hydraulicMotor.electrical.phaseA.current);
    this.updateMeter(this.hydraulicMeters.phaseB, hydraulicMotor.electrical.phaseB.current);
    this.updateMeter(this.hydraulicMeters.phaseC, hydraulicMotor.electrical.phaseC.current);
    this.updateStatus(this.hydraulicStatus, hydraulicMotor.operatingState, hydraulicMotor.fault);
    this.updatePowerDisplay(this.hydraulicPowerDisplay, hydraulicMotor);
    
    // Update total power
    const totalPower = (
      platformMotor.electricalPower +
      windmillMotor.electricalPower +
      hydraulicMotor.electricalPower
    ) / 1000;
    this.totalPowerDisplay.textContent = totalPower.toFixed(1);
  }
  
  /**
   * Update tilt controls enabled/disabled state based on hydraulic pump status
   */
  private updateTiltControlsEnabled(enabled: boolean): void {
    if (this.tiltSlider) {
      this.tiltSlider.disabled = !enabled;
    }
    if (this.tiltUpBtn) {
      this.tiltUpBtn.disabled = !enabled;
    }
    if (this.tiltDownBtn) {
      this.tiltDownBtn.disabled = !enabled;
    }
    if (this.tiltControlsSection) {
      this.tiltControlsSection.classList.toggle('disabled', !enabled);
    }
  }
  
  /**
   * Set frequency slider values (for syncing with simulation)
   */
  setFrequencies(platformFreq: number, windmillFreq: number): void {
    if (this.platformFreqSlider) {
      this.platformFreqSlider.value = platformFreq.toString();
      const freqValue = this.platformFreqSlider.parentElement?.querySelector('.freq-value');
      if (freqValue) freqValue.textContent = `${platformFreq.toFixed(0)} Hz`;
    }
    if (this.windmillFreqSlider) {
      this.windmillFreqSlider.value = windmillFreq.toString();
      const freqValue = this.windmillFreqSlider.parentElement?.querySelector('.freq-value');
      if (freqValue) freqValue.textContent = `${windmillFreq.toFixed(0)} Hz`;
    }
  }
  
  /**
   * Update hydraulic system display
   */
  updateHydraulics(state: HydraulicDisplayState): void {
    // Update pressure gauge
    const pressurePercent = Math.min(100, (state.pressure / 200) * 100);
    const gaugeNeedle = this.pressureGauge.querySelector('.gauge-needle') as HTMLElement;
    const gaugeFill = this.pressureGauge.querySelector('.gauge-fill') as HTMLElement;
    
    if (gaugeNeedle) {
      // Needle rotates from -90deg (0) to +90deg (max)
      const rotation = -90 + (pressurePercent * 1.8);
      gaugeNeedle.style.setProperty('--rotation', `${rotation}deg`);
    }
    if (gaugeFill) {
      gaugeFill.style.setProperty('--percentage', pressurePercent.toString());
    }
    if (this.pressureValue) {
      this.pressureValue.textContent = state.pressure.toFixed(0);
    }
    
    // Update cylinder position
    const cylinderPercent = state.cylinderPosition * 100;
    if (this.cylinderPosition) {
      this.cylinderPosition.style.width = `${cylinderPercent}%`;
      const cylinderValue = this.cylinderPosition.parentElement?.querySelector('.cylinder-value') as HTMLElement;
      if (cylinderValue) {
        cylinderValue.textContent = `${cylinderPercent.toFixed(0)}%`;
      }
    }
    
    // Update oil temperature
    if (this.oilTempValue) {
      this.oilTempValue.textContent = `${state.oilTemperature.toFixed(0)}°C`;
      this.oilTempValue.classList.remove('normal', 'warning', 'danger');
      if (state.oilTemperature > 80) {
        this.oilTempValue.classList.add('danger');
      } else if (state.oilTemperature > 60) {
        this.oilTempValue.classList.add('warning');
      }
    }
    
    // Update tilt angle display
    if (this.tiltAngleDisplay) {
      this.tiltAngleDisplay.textContent = `${state.tiltAngle.toFixed(1)}°`;
    }
    if (this.tiltTargetDisplay) {
      this.tiltTargetDisplay.textContent = `${state.targetTiltAngle.toFixed(1)}°`;
    }
    
    // Update tilt visual indicator
    const tiltLine = this.container.querySelector('.tilt-line') as HTMLElement;
    if (tiltLine) {
      tiltLine.style.setProperty('--tilt', `${state.tiltAngle}deg`);
    }
    
    // Check if hydraulic pressure is sufficient for tilt operation
    const pressureOk = state.pressure >= MotorPanel.MIN_TILT_PRESSURE;
    if (pressureOk !== this.hydraulicPressureOk) {
      this.hydraulicPressureOk = pressureOk;
      this.updateTiltControlsEnabled(pressureOk);
    }
  }
  
  /**
   * Set tilt slider value (for syncing with simulation)
   */
  setTiltAngle(angleDegrees: number): void {
    if (this.tiltSlider) {
      this.tiltSlider.value = angleDegrees.toString();
      const sliderValue = this.tiltSlider.parentElement?.querySelector('.tilt-slider-value');
      if (sliderValue) sliderValue.textContent = `${angleDegrees.toFixed(0)}°`;
    }
  }
}

/**
 * Helper interface for phase meters
 */
interface PhaseMeters {
  phaseA: AmpMeter;
  phaseB: AmpMeter;
  phaseC: AmpMeter;
}

/**
 * Helper interface for amp meter elements
 */
interface AmpMeter {
  element: HTMLElement;
  needle: HTMLElement;
  reading: HTMLElement;
  arcFill: HTMLElement;
  maxAmps: number;
}

