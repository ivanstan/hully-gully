/**
 * Rendering Module - Balerina Ride Simulator
 * 
 * This module handles all 3D visualization using Three.js.
 * 
 * CRITICAL: This module contains NO physics logic.
 * It only maps simulation state to visual representation.
 * 
 * Responsibilities:
 * - 3D scene setup
 * - Camera management
 * - Object transforms from simulation state
 * - Force vector visualization (optional)
 * - G-force color mapping (optional)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SimulationState, CabinState } from '../types/index.js';

/**
 * Rendering Engine Class
 * 
 * Manages the 3D visualization of the simulation.
 */
export class RenderingEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private platformMesh: THREE.Mesh | null = null;
  private eccentricMesh: THREE.Mesh | null = null;
  private cabinMeshes: THREE.Mesh[] = [];
  private forceArrows: THREE.ArrowHelper[] = [];
  private showForceVectors: boolean = false;
  private showGForceColors: boolean = false;
  private axisHelperCanvas: HTMLCanvasElement | null = null;
  private axisHelperContainer: HTMLElement | null = null;
  
  /**
   * Create a new rendering engine
   * 
   * @param container - HTML element to render into
   * @param width - Viewport width (pixels)
   * @param height - Viewport height (pixels)
   */
  constructor(container: HTMLElement, width: number, height: number) {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    
    // Camera setup
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 20, 20);
    this.camera.lookAt(0, 0, 0);
    
    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    
    // Orbit controls for camera interaction
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Smooth camera movement
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 0, 0); // Look at the center of the scene
    this.controls.update();
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
    this.scene.add(gridHelper);
    
    // Axes helper (commented out - can be enabled for debugging)
    // const axesHelper = new THREE.AxesHelper(5);
    // this.scene.add(axesHelper);
    
    // Create Blender-style axis helper overlay
    this.createBlenderStyleAxisHelper(container);
    
    // Initialize geometry
    this.initializeGeometry();
  }
  
  /**
   * Create a Blender-style axis helper overlay in the bottom-left corner
   */
  private createBlenderStyleAxisHelper(container: HTMLElement): void {
    // Create container
    const helperContainer = document.createElement('div');
    helperContainer.style.position = 'absolute';
    helperContainer.style.bottom = '20px';
    helperContainer.style.left = '20px';
    helperContainer.style.width = '120px';
    helperContainer.style.height = '120px';
    helperContainer.style.backgroundColor = '#1a1a1a'; // Match scene background
    helperContainer.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    helperContainer.style.borderRadius = '5px';
    helperContainer.style.padding = '10px';
    helperContainer.style.pointerEvents = 'none';
    helperContainer.style.zIndex = '1000';
    
    // Create canvas for drawing
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    canvas.style.display = 'block';
    helperContainer.appendChild(canvas);
    
    this.axisHelperCanvas = canvas;
    this.axisHelperContainer = helperContainer;
    container.appendChild(helperContainer);
  }
  
  /**
   * Update the Blender-style axis helper based on camera orientation
   */
  private updateBlenderStyleAxisHelper(): void {
    if (!this.axisHelperCanvas) return;
    
    const ctx = this.axisHelperCanvas.getContext('2d')!;
    const size = 100;
    const center = size / 2;
    const axisLength = 35;
    
    // Clear canvas
    ctx.clearRect(0, 0, size, size);
    
    // Get camera's world direction vectors
    const right = new THREE.Vector3();
    right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3();
    up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    const forward = new THREE.Vector3();
    forward.setFromMatrixColumn(this.camera.matrixWorld, 2);
    
    // Project world axes onto camera's view plane
    // X axis (red) - world X projected onto camera's right/up plane
    const worldX = new THREE.Vector3(1, 0, 0);
    const xScreenX = worldX.dot(right) * axisLength;
    const xScreenY = -worldX.dot(up) * axisLength; // Negative because screen Y is inverted
    
    // Y axis (green) - world Y projected onto camera's right/up plane
    const worldY = new THREE.Vector3(0, 1, 0);
    const yScreenX = worldY.dot(right) * axisLength;
    const yScreenY = -worldY.dot(up) * axisLength;
    
    // Z axis (blue) - world Z projected onto camera's right/up plane
    const worldZ = new THREE.Vector3(0, 0, 1);
    const zScreenX = worldZ.dot(right) * axisLength;
    const zScreenY = -worldZ.dot(up) * axisLength;
    
    // Prettier colors - brighter and more vibrant
    const xColor = '#ff6b6b'; // Coral red
    const yColor = '#51cf66'; // Bright green
    const zColor = '#4dabf7'; // Sky blue
    
    // Draw X axis (coral red)
    ctx.strokeStyle = xColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + xScreenX, center + xScreenY);
    ctx.stroke();
    // Arrow head
    this.drawArrowHead(ctx, center, center, center + xScreenX, center + xScreenY, xColor);
    // Label
    ctx.fillStyle = xColor;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('X', center + xScreenX * 1.3, center + xScreenY * 1.3);
    
    // Draw Y axis (bright green)
    ctx.strokeStyle = yColor;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + yScreenX, center + yScreenY);
    ctx.stroke();
    // Arrow head
    this.drawArrowHead(ctx, center, center, center + yScreenX, center + yScreenY, yColor);
    // Label
    ctx.fillStyle = yColor;
    ctx.fillText('Y', center + yScreenX * 1.3, center + yScreenY * 1.3);
    
    // Draw Z axis (sky blue)
    ctx.strokeStyle = zColor;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + zScreenX, center + zScreenY);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrow head
    this.drawArrowHead(ctx, center, center, center + zScreenX, center + zScreenY, zColor);
    // Label
    ctx.fillStyle = zColor;
    ctx.fillText('Z', center + zScreenX * 1.3, center + zScreenY * 1.3);
  }
  
  /**
   * Draw an arrow head at the end of a line
   */
  private drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string
  ): void {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = 8;
    const arrowAngle = Math.PI / 6;
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - arrowLength * Math.cos(angle - arrowAngle),
      y2 - arrowLength * Math.sin(angle - arrowAngle)
    );
    ctx.lineTo(
      x2 - arrowLength * Math.cos(angle + arrowAngle),
      y2 - arrowLength * Math.sin(angle + arrowAngle)
    );
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Initialize 3D geometry for platform, eccentric, and cabins
   */
  private initializeGeometry(): void {
    // Platform (main rotating disc)
    const platformGeometry = new THREE.CylinderGeometry(10, 10, 0.5, 32);
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    this.platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
    this.platformMesh.rotation.x = Math.PI / 2; // Rotate to horizontal
    this.platformMesh.receiveShadow = true;
    this.scene.add(this.platformMesh);
    
    // Eccentric (windmill) - will be positioned dynamically
    const eccentricGeometry = new THREE.BoxGeometry(2, 2, 0.3);
    const eccentricMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
    this.eccentricMesh = new THREE.Mesh(eccentricGeometry, eccentricMaterial);
    this.eccentricMesh.castShadow = true;
    this.scene.add(this.eccentricMesh);
    
    // Cabins will be created dynamically based on simulation state
  }
  
  /**
   * Update visualization from simulation state
   * 
   * This is the ONLY way simulation state affects rendering.
   * No physics calculations happen here.
   * 
   * @param state - Current simulation state
   */
  update(state: SimulationState): void {
    // Update platform rotation
    if (this.platformMesh) {
      this.platformMesh.rotation.z = state.platformPhase;
    }
    
    // Update eccentric position and rotation
    if (this.eccentricMesh) {
      // Position eccentric based on radius and phase
      const eccX = state.eccentric.radius * Math.cos(state.eccentricPhase);
      const eccY = state.eccentric.radius * Math.sin(state.eccentricPhase);
      this.eccentricMesh.position.set(eccX, eccY, 0.5);
      // Eccentric rotates with platform
      this.eccentricMesh.rotation.z = state.platformPhase;
    }
    
    // Update or create cabin meshes
    while (this.cabinMeshes.length < state.cabins.length) {
      const cabinGeometry = new THREE.BoxGeometry(1.5, 1.5, 2);
      const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x00aaff });
      const cabinMesh = new THREE.Mesh(cabinGeometry, cabinMaterial);
      cabinMesh.castShadow = true;
      this.scene.add(cabinMesh);
      this.cabinMeshes.push(cabinMesh);
    }
    
    // Update cabin positions and colors
    for (let i = 0; i < state.cabins.length; i++) {
      const cabin = state.cabins[i];
      const mesh = this.cabinMeshes[i];
      
      // Set position from simulation state
      mesh.position.set(cabin.position.x, cabin.position.y, cabin.position.z + 1);
      
      // Rotate with platform
      mesh.rotation.z = state.platformPhase;
      
      // Optional: Color by G-force
      if (this.showGForceColors) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const gForce = cabin.gForce;
        // Color mapping: green (low) -> yellow -> red (high)
        const hue = Math.max(0, Math.min(120 - gForce * 30, 120)) / 360;
        material.color.setHSL(hue, 1, 0.5);
      }
    }
    
    // Update force vectors if enabled
    if (this.showForceVectors) {
      this.updateForceVectors(state.cabins);
    } else {
      this.clearForceVectors();
    }
  }
  
  /**
   * Update force vector visualization
   * 
   * @param cabins - Array of cabin states
   */
  private updateForceVectors(cabins: CabinState[]): void {
    // Clear existing arrows
    this.clearForceVectors();
    
    // Create arrows for each cabin
    for (const cabin of cabins) {
      const direction = new THREE.Vector3(
        cabin.acceleration.x,
        cabin.acceleration.y,
        cabin.acceleration.z
      ).normalize();
      
      const origin = new THREE.Vector3(
        cabin.position.x,
        cabin.position.y,
        cabin.position.z + 1
      );
      
      const length = cabin.totalAcceleration * 0.1; // Scale for visibility
      const color = 0xff0000;
      
      const arrow = new THREE.ArrowHelper(direction, origin, length, color);
      this.scene.add(arrow);
      this.forceArrows.push(arrow);
    }
  }
  
  /**
   * Clear all force vector arrows
   */
  private clearForceVectors(): void {
    for (const arrow of this.forceArrows) {
      this.scene.remove(arrow);
      arrow.dispose();
    }
    this.forceArrows = [];
  }
  
  /**
   * Toggle force vector visualization
   */
  toggleForceVectors(): void {
    this.showForceVectors = !this.showForceVectors;
  }
  
  /**
   * Toggle G-force color mapping
   */
  toggleGForceColors(): void {
    this.showGForceColors = !this.showGForceColors;
  }
  
  /**
   * Set camera position for external observer view
   */
  setExternalView(): void {
    this.camera.position.set(0, 20, 20);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
  
  /**
   * Set camera to follow a specific cabin
   * 
   * @param cabinIndex - Index of cabin to follow
   * @param state - Current simulation state
   */
  setCabinView(cabinIndex: number, state: SimulationState): void {
    if (cabinIndex >= 0 && cabinIndex < state.cabins.length) {
      const cabin = state.cabins[cabinIndex];
      this.camera.position.set(
        cabin.position.x,
        cabin.position.y + 2,
        cabin.position.z + 5
      );
      this.controls.target.set(cabin.position.x, cabin.position.y, cabin.position.z);
      this.controls.update();
    }
  }
  
  /**
   * Render the scene
   */
  render(): void {
    // Update controls (required for damping)
    this.controls.update();
    
    // Update Blender-style axis helper
    this.updateBlenderStyleAxisHelper();
    
    this.renderer.render(this.scene, this.camera);
  }
  
  /**
   * Handle window resize
   * 
   * @param width - New width (pixels)
   * @param height - New height (pixels)
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.controls.update();
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.axisHelperContainer && this.axisHelperContainer.parentElement) {
      this.axisHelperContainer.parentElement.removeChild(this.axisHelperContainer);
    }
    this.controls.dispose();
    this.renderer.dispose();
    // Additional cleanup would go here
  }
}

