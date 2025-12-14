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
  private platformMesh: THREE.Mesh | null = null;
  private eccentricMesh: THREE.Mesh | null = null;
  private cabinMeshes: THREE.Mesh[] = [];
  private forceArrows: THREE.ArrowHelper[] = [];
  private showForceVectors: boolean = false;
  private showGForceColors: boolean = false;
  
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
    
    // Axes helper
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);
    
    // Initialize geometry
    this.initializeGeometry();
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
    this.camera.lookAt(0, 0, 0);
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
      this.camera.lookAt(cabin.position.x, cabin.position.y, cabin.position.z);
    }
  }
  
  /**
   * Render the scene
   */
  render(): void {
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
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.renderer.dispose();
    // Additional cleanup would go here
  }
}

