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
  private windmillGroup: THREE.Group | null = null;
  private skirtMesh: THREE.Mesh | null = null;
  private cabinMeshes: THREE.Mesh[] = [];
  private forceArrows: THREE.ArrowHelper[] = [];
  private showForceVectors: boolean = false;
  private showGForceColors: boolean = false;
  private axisHelperCanvas: HTMLCanvasElement | null = null;
  private axisHelperContainer: HTMLElement | null = null;
  private platformRadius: number;
  private windmillRadius: number;
  
  /**
   * Create a new rendering engine
   * 
   * @param container - HTML element to render into
   * @param width - Viewport width (pixels)
   * @param height - Viewport height (pixels)
   * @param platformRadius - Radius of main platform (m)
   * @param windmillRadius - Radius of windmill/secondary platform (m)
   */
  constructor(container: HTMLElement, width: number, height: number, platformRadius: number, windmillRadius: number) {
    this.platformRadius = platformRadius;
    this.windmillRadius = windmillRadius;
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
    const platformGeometry = new THREE.CylinderGeometry(this.platformRadius, this.platformRadius, 0.5, 32);
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });
    this.platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
    this.platformMesh.rotation.y = Math.PI / 2; // Rotate to Z-X plane (vertical)
    this.platformMesh.receiveShadow = true;
    this.scene.add(this.platformMesh);
    
    // Eccentric (windmill) - will be positioned dynamically
    const eccentricGeometry = new THREE.BoxGeometry(2, 2, 0.3);
    const eccentricMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
    this.eccentricMesh = new THREE.Mesh(eccentricGeometry, eccentricMaterial);
    this.eccentricMesh.castShadow = true;
    this.scene.add(this.eccentricMesh);
    
    // Create windmill group (skirt + cabins) - they rotate together as one system
    this.windmillGroup = new THREE.Group();
    this.scene.add(this.windmillGroup);
    
    // Skirt (semi-transparent disc, flat in X-Z plane)
    const skirtGeometry = new THREE.CircleGeometry(this.windmillRadius, 32);
    const skirtMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffaa00,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    this.skirtMesh = new THREE.Mesh(skirtGeometry, skirtMaterial);
    // Rotate to X-Z plane: CircleGeometry is in X-Y plane by default, rotate around X axis
    this.skirtMesh.rotation.x = -Math.PI / 2; // Rotate to X-Z plane (vertical)
    this.skirtMesh.position.y = 0.6; // Slightly above the main platform
    this.skirtMesh.receiveShadow = true;
    this.windmillGroup.add(this.skirtMesh);
    
    // Cabins will be created dynamically based on simulation state and added to windmillGroup
    // Skirt and cabins rotate together around Y-axis as one system
  }
  
  /**
   * Update visualization from simulation state
   * 
   * This is the ONLY way simulation state affects rendering.
   * No physics calculations happen here.
   * 
   * Coordinate mapping:
   * - Physics: X-Y horizontal plane, Z vertical (up)
   * - Three.js: X-Z horizontal plane, Y vertical (up)
   * - Mapping: physics (x, y, z) → Three.js (x, z, y)
   * 
   * @param state - Current simulation state
   */
  update(state: SimulationState): void {
    // Update platform rotation
    // Platform rotates around Y-axis (vertical in Three.js)
    if (this.platformMesh) {
      this.platformMesh.rotation.y = state.platformPhase;
    }
    
    // Calculate pivot point position in world coordinates
    // Pivot is at the edge of the primary platform (at angle 0 in platform frame)
    const pivotX_physics = state.tilt.pivotRadius;
    const pivotY_physics = 0;
    // Rotate by platform phase to get world position
    const pivotWorldX = pivotX_physics * Math.cos(state.platformPhase) - pivotY_physics * Math.sin(state.platformPhase);
    const pivotWorldY = pivotX_physics * Math.sin(state.platformPhase) + pivotY_physics * Math.cos(state.platformPhase);
    
    // Update pivot marker (using eccentricMesh as pivot visualization)
    if (this.eccentricMesh) {
      // Map physics (x, y) to Three.js (x, z)
      this.eccentricMesh.position.set(pivotWorldX, 0.3, pivotWorldY);
      this.eccentricMesh.rotation.y = state.platformPhase;
    }
    
    // Calculate secondary platform center position
    // Center is at offset from pivot, tilted by tiltAngle
    // The secondary platform extends INWARD (over primary platform), so offset is negative
    const tiltAngle = state.tilt.tiltAngle;
    const offset = state.tilt.secondaryPlatformOffset;
    
    // In platform frame, the offset is along -x (toward center) with tilt
    const centerOffsetX_plat = -offset * Math.cos(tiltAngle); // Negative = toward center
    const centerOffsetZ_plat = offset * Math.sin(tiltAngle); // Vertical offset (up)
    
    // Secondary platform center in platform frame
    const centerX_plat = state.tilt.pivotRadius + centerOffsetX_plat;
    const centerY_plat = 0;
    const centerZ_plat = centerOffsetZ_plat;
    
    // Rotate to world frame
    const centerWorldX = centerX_plat * Math.cos(state.platformPhase) - centerY_plat * Math.sin(state.platformPhase);
    const centerWorldY = centerX_plat * Math.sin(state.platformPhase) + centerY_plat * Math.cos(state.platformPhase);
    const centerWorldZ = centerZ_plat;
    
    // Update windmill group position and rotation
    if (this.windmillGroup) {
      // Position windmill group at secondary platform center
      // Map physics (x, y, z) to Three.js (x, z, y)
      this.windmillGroup.position.set(centerWorldX, centerWorldZ + 0.5, centerWorldY);
      
      // The windmill group needs complex rotation:
      // 1. Tilt about the pivot axis (which is perpendicular to radial direction)
      // 2. Rotate around its own axis (windmill phase)
      // 3. Rotate with platform
      
      // Reset rotation and apply in order
      this.windmillGroup.rotation.set(0, 0, 0);
      
      // First: apply windmill rotation (around local Y-axis, which is normal to disc)
      // But since the disc is tilted, we need to handle this carefully
      
      // The tilt axis is perpendicular to the radial direction in the platform frame
      // In platform frame at angle 0, radial is along +X, so tilt axis is along +Y
      // After platform rotation, tilt axis rotates with platform
      
      // Apply platform rotation first
      this.windmillGroup.rotation.y = state.platformPhase + state.windmillPhase;
      
      // Apply tilt rotation about the pivot axis (perpendicular to radial direction)
      // The tilt angle is at T between line to primary center and line to secondary center
      // The inner edge (toward primary center) rises, pivot edge stays level
      // Pivot axis in world frame: perpendicular to radial direction
      this.windmillGroup.rotation.x = tiltAngle * Math.cos(state.platformPhase + Math.PI/2);
      this.windmillGroup.rotation.z = tiltAngle * Math.sin(state.platformPhase + Math.PI/2);
    }
    
    // Update or create cabin meshes
    while (this.cabinMeshes.length < state.cabins.length) {
      const cabinGeometry = new THREE.BoxGeometry(1.5, 1.5, 2);
      const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x00aaff });
      const cabinMesh = new THREE.Mesh(cabinGeometry, cabinMaterial);
      cabinMesh.castShadow = true;
      // Add cabins to scene directly (not to windmill group) for accurate positioning
      this.scene.add(cabinMesh);
      this.cabinMeshes.push(cabinMesh);
    }
    
    // Update cabin positions from physics (world coordinates)
    for (let i = 0; i < state.cabins.length; i++) {
      const cabin = state.cabins[i];
      const mesh = this.cabinMeshes[i];
      
      // Use physics-computed world position directly
      // Map physics (x, y, z) to Three.js (x, z, y)
      mesh.position.set(cabin.position.x, cabin.position.z + 1, cabin.position.y);
      
      // Rotate cabin to face outward (optional, based on position)
      const angle = Math.atan2(cabin.position.y, cabin.position.x);
      mesh.rotation.y = angle;
      
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
      // Map physics (x, y, z) to Three.js (x, z, y)
      const direction = new THREE.Vector3(
        cabin.acceleration.x,
        cabin.acceleration.z,
        cabin.acceleration.y
      ).normalize();
      
      const origin = new THREE.Vector3(
        cabin.position.x,
        cabin.position.z + 1,
        cabin.position.y
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
      // Map physics (x, y, z) to Three.js (x, z, y)
      this.camera.position.set(
        cabin.position.x + 5,
        cabin.position.z + 2,
        cabin.position.y
      );
      this.controls.target.set(cabin.position.x, cabin.position.z, cabin.position.y);
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

