/**
 * Rendering Module - Balerina Ride Simulator
 * 
 * This module handles all 3D visualization using Three.js.
 * 
 * CRITICAL: This module contains NO physics logic.
 * It only maps simulation state to visual representation.
 * 
 * Features:
 * - Detailed ride geometry (mast, arms, cabins, skirt)
 * - PBR materials with metalness/roughness
 * - Post-processing (bloom, SMAA)
 * - Procedural environment map for reflections
 * - Enhanced lighting (hemisphere, directional, point lights)
 * - Decorative ride lights
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SimulationState, CabinState } from '../types/index.js';

/**
 * Material presets for the ride
 */
interface MaterialSet {
  platform: THREE.MeshStandardMaterial;
  mast: THREE.MeshStandardMaterial;
  mastAccent: THREE.MeshStandardMaterial;
  arm: THREE.MeshStandardMaterial;
  cabinBody: THREE.MeshStandardMaterial;
  cabinAccent: THREE.MeshStandardMaterial;
  cabinSeat: THREE.MeshStandardMaterial;
  safetyBar: THREE.MeshStandardMaterial;
  skirtPanelA: THREE.MeshStandardMaterial;
  skirtPanelB: THREE.MeshStandardMaterial;
  pivot: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  // Ballerina doll materials
  dollDress: THREE.MeshStandardMaterial;
  dollSkin: THREE.MeshStandardMaterial;
  dollHair: THREE.MeshStandardMaterial;
}

/**
 * Rendering Engine Class
 * 
 * Manages the 3D visualization of the simulation.
 */
export class RenderingEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private controls: OrbitControls;
  
  // Main structures
  private platformGroup: THREE.Group | null = null;
  private mastGroup: THREE.Group | null = null;
  private windmillGroup: THREE.Group | null = null;
  private skirtGroup: THREE.Group | null = null;
  private cabinGroups: THREE.Group[] = [];
  private armMeshes: THREE.Mesh[] = [];
  
  // Decorative elements
  private rideLights: THREE.PointLight[] = [];
  private lightBulbs: THREE.Mesh[] = [];
  private lightColumns: THREE.Mesh[][] = [];  // 2D array: [column][bulb from top to bottom]
  private balerinaDollGroup: THREE.Group | null = null;  // Container for ballerina doll (loaded or fallback)
  private gltfLoader: GLTFLoader;
  
  // Legacy compatibility
  private platformMesh: THREE.Mesh | null = null;
  private eccentricMesh: THREE.Mesh | null = null;
  
  // Visualization options
  private forceArrows: THREE.ArrowHelper[] = [];
  private showForceVectors: boolean = false;
  private showGForceColors: boolean = false;
  private lightsEnabled: boolean = true;  // Decorative lights on/off
  
  // UI elements
  private axisHelperCanvas: HTMLCanvasElement | null = null;
  private axisHelperContainer: HTMLElement | null = null;
  
  // Configuration
  private platformRadius: number;
  private windmillRadius: number;
  private materials: MaterialSet;
  
  /**
   * Create a new rendering engine
   */
  constructor(container: HTMLElement, width: number, height: number, platformRadius: number, windmillRadius: number) {
    this.platformRadius = platformRadius;
    this.windmillRadius = windmillRadius;
    
    // Initialize GLTF loader for 3D models
    this.gltfLoader = new GLTFLoader();
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a15);
    this.scene.fog = new THREE.Fog(0x0a0a15, 50, 150);
    
    // Camera setup
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
    this.camera.position.set(25, 18, 25);
    this.camera.lookAt(0, 3, 0);
    
    // Renderer setup with enhanced settings
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);
    
    // Create materials first (needs environment map)
    this.materials = this.createMaterials();
    
    // Create procedural environment map
    this.createEnvironmentMap();
    
    // Setup post-processing
    this.composer = this.setupPostProcessing(width, height);
    
    // Orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 3, 0);
    this.controls.minDistance = 10;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.3;
    this.controls.update();
    
    // Setup lighting
    this.setupLighting();
    
    // Create ground
    this.createGround();
    
    // Create axis helper overlay
    this.createBlenderStyleAxisHelper(container);
    
    // Initialize ride geometry
    this.initializeGeometry();
    
    // Handle resize
    window.addEventListener('resize', () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      this.resize(w, h);
    });
  }
  
  /**
   * Create PBR materials for all ride components
   */
  private createMaterials(): MaterialSet {
    return {
      platform: new THREE.MeshStandardMaterial({
        color: 0x444444,
        metalness: 0.7,
        roughness: 0.4,
      }),
      mast: new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.8,
        roughness: 0.3,
      }),
      mastAccent: new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        metalness: 0.3,
        roughness: 0.5,
        emissive: 0xffcc00,
        emissiveIntensity: 0.1,
      }),
      arm: new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.9,
        roughness: 0.2,
      }),
      cabinBody: new THREE.MeshStandardMaterial({
        color: 0x2266cc,
        metalness: 0.2,
        roughness: 0.6,
      }),
      cabinAccent: new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        metalness: 0.4,
        roughness: 0.4,
      }),
      cabinSeat: new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.0,
        roughness: 0.9,
      }),
      safetyBar: new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 1.0,
        roughness: 0.1,
      }),
      skirtPanelA: new THREE.MeshStandardMaterial({
        color: 0xff69b4,  // Hot pink
        metalness: 0.2,
        roughness: 0.5,
        side: THREE.DoubleSide,
      }),
      skirtPanelB: new THREE.MeshStandardMaterial({
        color: 0xff1493,  // Deep pink
        metalness: 0.2,
        roughness: 0.5,
        side: THREE.DoubleSide,
      }),
      pivot: new THREE.MeshStandardMaterial({
        color: 0xff4400,
        metalness: 0.6,
        roughness: 0.3,
        emissive: 0xff4400,
        emissiveIntensity: 0.2,
      }),
      ground: new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.0,
        roughness: 0.95,
      }),
      chrome: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1.0,
        roughness: 0.05,
      }),
      // Ballerina doll materials
      dollDress: new THREE.MeshStandardMaterial({
        color: 0xff69b4,  // Hot pink dress
        metalness: 0.1,
        roughness: 0.6,
      }),
      dollSkin: new THREE.MeshStandardMaterial({
        color: 0xffd5b4,  // Skin tone
        metalness: 0.0,
        roughness: 0.8,
      }),
      dollHair: new THREE.MeshStandardMaterial({
        color: 0x2a1a0a,  // Dark brown hair
        metalness: 0.1,
        roughness: 0.7,
      }),
    };
  }
  
  /**
   * Create procedural environment map for reflections
   */
  private createEnvironmentMap(): void {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Create a simple gradient sky environment
    const envScene = new THREE.Scene();
    
    // Sky gradient using a large sphere
    const skyGeometry = new THREE.SphereGeometry(50, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x0a0a20) },
        bottomColor: { value: new THREE.Color(0x1a1a30) },
        offset: { value: 10 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    envScene.add(sky);
    
    // Add some fake lights to the environment
    const lightGeom = new THREE.SphereGeometry(2, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    for (let i = 0; i < 6; i++) {
      const light = new THREE.Mesh(lightGeom, lightMat);
      const angle = (i / 6) * Math.PI * 2;
      light.position.set(Math.cos(angle) * 30, 15 + Math.sin(angle * 2) * 5, Math.sin(angle) * 30);
      envScene.add(light);
    }
    
    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    this.scene.environment = envMap;
    
    pmremGenerator.dispose();
  }
  
  /**
   * Setup post-processing pipeline
   */
  private setupPostProcessing(width: number, height: number): EffectComposer {
    const composer = new EffectComposer(this.renderer);
    
    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);
    
    // Bloom pass for lights
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.4,    // strength
      0.3,    // radius
      0.9     // threshold
    );
    composer.addPass(bloomPass);
    
    // SMAA anti-aliasing
    const smaaPass = new SMAAPass(width, height);
    composer.addPass(smaaPass);
    
    // Output pass for correct color space
    const outputPass = new OutputPass();
    composer.addPass(outputPass);
    
    return composer;
  }
  
  /**
   * Setup scene lighting
   */
  private setupLighting(): void {
    // Hemisphere light for natural ambient (sky/ground)
    const hemiLight = new THREE.HemisphereLight(0x4466aa, 0x222222, 0.5);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);
    
    // Main directional light (sun/key light)
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    keyLight.position.set(20, 30, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 100;
    keyLight.shadow.camera.left = -30;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);
    
    // Fill light (cooler, opposite side)
    const fillLight = new THREE.DirectionalLight(0x6688cc, 0.4);
    fillLight.position.set(-15, 20, -10);
    this.scene.add(fillLight);
    
    // Rim light (back light for edge definition)
    const rimLight = new THREE.DirectionalLight(0xffffcc, 0.3);
    rimLight.position.set(-5, 10, -20);
    this.scene.add(rimLight);
    
    // Ground bounce light
    const bounceLight = new THREE.DirectionalLight(0x443322, 0.2);
    bounceLight.position.set(0, -10, 0);
    this.scene.add(bounceLight);
  }
  
  /**
   * Create ground plane with grid pattern
   */
  private createGround(): void {
    // Main ground plane
    const groundGeom = new THREE.PlaneGeometry(200, 200);
    const ground = new THREE.Mesh(groundGeom, this.materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    // Circular pad under the ride
    const padGeom = new THREE.CylinderGeometry(this.platformRadius + 3, this.platformRadius + 3, 0.1, 64);
    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.3,
      roughness: 0.7,
    });
    const pad = new THREE.Mesh(padGeom, padMaterial);
    pad.position.y = 0;
    pad.receiveShadow = true;
    this.scene.add(pad);
    
    // Grid helper (subtle)
    const gridHelper = new THREE.GridHelper(100, 50, 0x222233, 0x111122);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }
  
  /**
   * Initialize all ride geometry
   */
  private initializeGeometry(): void {
    this.createPlatform();
    // Mast removed - was too prominent/lighthouse-like
    this.createPivotMarker();
    this.createWindmillGroup();
  }
  
  /**
   * Create the main rotating platform
   */
  private createPlatform(): void {
    this.platformGroup = new THREE.Group();
    
    // Main platform disc
    const platformGeom = new THREE.CylinderGeometry(
      this.platformRadius, 
      this.platformRadius + 0.3, 
      0.6, 
      64
    );
    this.platformMesh = new THREE.Mesh(platformGeom, this.materials.platform);
    this.platformMesh.castShadow = true;
    this.platformMesh.receiveShadow = true;
    this.platformGroup.add(this.platformMesh);
    
    // Platform edge trim
    const trimGeom = new THREE.TorusGeometry(this.platformRadius, 0.15, 8, 64);
    const trim = new THREE.Mesh(trimGeom, this.materials.chrome);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.3;
    this.platformGroup.add(trim);
    
    // Decorative floor pattern (concentric rings)
    for (let r = 1; r < this.platformRadius; r += 2) {
      const ringGeom = new THREE.TorusGeometry(r, 0.03, 4, 64);
      const ring = new THREE.Mesh(ringGeom, this.materials.mastAccent);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.31;
      this.platformGroup.add(ring);
    }
    
    this.scene.add(this.platformGroup);
  }
  
  /**
   * Create the central mast/column structure
   */
  private createMast(): void {
    this.mastGroup = new THREE.Group();
    
    // Main mast cylinder
    const mastHeight = 6;
    const mastGeom = new THREE.CylinderGeometry(0.8, 1.2, mastHeight, 16);
    const mast = new THREE.Mesh(mastGeom, this.materials.mast);
    mast.position.y = mastHeight / 2;
    mast.castShadow = true;
    this.mastGroup.add(mast);
    
    // Mast base (flared)
    const baseGeom = new THREE.CylinderGeometry(1.2, 1.8, 1, 16);
    const base = new THREE.Mesh(baseGeom, this.materials.mast);
    base.position.y = 0.5;
    base.castShadow = true;
    this.mastGroup.add(base);
    
    // Decorative rings on mast
    for (let y = 1; y <= 5; y++) {
      const ringGeom = new THREE.TorusGeometry(0.85 + (1.2 - 0.8) * (1 - y / mastHeight) * 0.5, 0.08, 8, 32);
      const ring = new THREE.Mesh(ringGeom, this.materials.mastAccent);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.mastGroup.add(ring);
    }
    
    // Top cap
    const capGeom = new THREE.SphereGeometry(0.6, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const cap = new THREE.Mesh(capGeom, this.materials.chrome);
    cap.position.y = mastHeight;
    this.mastGroup.add(cap);
    
    this.scene.add(this.mastGroup);
  }
  
  /**
   * Create pivot point marker
   */
  private createPivotMarker(): void {
    const pivotGroup = new THREE.Group();
    
    // Pivot base
    const pivotGeom = new THREE.CylinderGeometry(0.5, 0.7, 0.8, 16);
    this.eccentricMesh = new THREE.Mesh(pivotGeom, this.materials.pivot);
    this.eccentricMesh.castShadow = true;
    pivotGroup.add(this.eccentricMesh);
    
    // Pivot axle (vertical)
    const axleGeom = new THREE.CylinderGeometry(0.2, 0.2, 2, 8);
    const axle = new THREE.Mesh(axleGeom, this.materials.chrome);
    axle.position.y = 1;
    pivotGroup.add(axle);
    
    this.scene.add(pivotGroup);
  }
  
  /**
   * Create the windmill group (skirt + cabins + arms + ballerina doll)
   */
  private createWindmillGroup(): void {
    this.windmillGroup = new THREE.Group();
    
    // Create ballerina doll at the center (above the skirt)
    const balerinaDoll = this.createBalerinaDoll();
    this.windmillGroup.add(balerinaDoll);
    
    // Create decorative skirt
    this.skirtGroup = this.createSkirt();
    this.windmillGroup.add(this.skirtGroup);
    
    // Create decorative lights on the skirt
    this.createRideLights();
    
    // Create seats around the rim (part of windmill group so they rotate together)
    this.createSeatsOnRim();
    
    this.scene.add(this.windmillGroup);
  }
  
  /**
   * Create the ballerina doll figure in the center of the ride
   * Attempts to load a GLTF model, falls back to geometric primitives if not found
   */
  private createBalerinaDoll(): THREE.Group {
    const doll = new THREE.Group();
    this.balerinaDollGroup = doll;
    
    // Skirt parameters (matching the skirt geometry)
    const innerHeight = 2.5;  // Height at inner edge of skirt
    const innerRadius = 1.8;
    
    // Try to load a GLTF model
    this.loadBalerinaDollModel(doll, innerHeight, innerRadius);
    
    // Add the dress hem transition (always geometric, connects doll to skirt)
    // This disc should lie flat in the Z-X plane (circular face pointing up along Z)
    const hemGeom = new THREE.CylinderGeometry(
      0.72,          // top (matches expected doll waist)
      innerRadius,   // bottom (matches skirt inner radius)
      0.5,           // height
      24
    );
    const hem = new THREE.Mesh(hemGeom, this.materials.dollDress);
    hem.rotation.x = Math.PI / 2;  // Rotate so cylinder axis points along Z (disc in Z-X plane)
    hem.position.z = innerHeight + 0.1;
    hem.castShadow = true;
    doll.add(hem);
    
    return doll;
  }
  
  /**
   * Load ballerina doll 3D model from GLTF file
   * Falls back to geometric primitives if model not found
   */
  private loadBalerinaDollModel(doll: THREE.Group, innerHeight: number, innerRadius: number): void {
    // Load the Sketchfab model (scene.gltf + scene.bin + textures)
    const modelPath = '/models/scene.gltf';
    
    this.gltfLoader.load(
      modelPath,
      (gltf) => {
        try {
          console.log('Ballerina model loaded successfully');
          const model = gltf.scene;
          
          // Scale and position the model
          // Adjust these values based on the actual model dimensions
          // The model's Y-axis becomes Z in the windmill's local coords
          model.scale.set(3.5, 3.5, 3.5);  // Scaled up for better proportion with skirt
          model.position.z = innerHeight - 3.0;  // Lowered so waist is at skirt level
          model.position.y = 0;
          
          // Rotate to stand upright
          // GLTF models are Y-up, windmill group is Z-up
          // Rotate +90 degrees around X to make the model's Y-up become Z-up
          model.rotation.x = Math.PI / 2;  // Stand up (head points to +Z)
          model.rotation.y = 0;
          model.rotation.z = 0;
          
          // Apply fallback materials if textures failed to load
          // and enable shadows on all meshes
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Check if material has missing textures and apply fallback
              if (child.material) {
                const mat = child.material as THREE.MeshStandardMaterial;
                // If material has no valid map or looks broken, apply a nice skin/dress material
                if (mat.map === null || mat.map === undefined) {
                  // Determine material type based on mesh name or position
                  const meshName = child.name.toLowerCase();
                  if (meshName.includes('hair') || meshName.includes('head')) {
                    child.material = this.materials.dollHair.clone();
                  } else if (meshName.includes('dress') || meshName.includes('cloth') || meshName.includes('body')) {
                    child.material = this.materials.dollDress.clone();
                  } else {
                    // Default to skin material
                    child.material = this.materials.dollSkin.clone();
                  }
                }
              }
            }
          });
          
          doll.add(model);
        } catch (e) {
          console.warn('Error processing ballerina model, using fallback:', e);
          this.createFallbackBalerinaDoll(doll, innerHeight, innerRadius);
        }
      },
      (progress) => {
        // Loading progress
        if (progress.total > 0) {
          console.log(`Loading ballerina model: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
        }
      },
      (error) => {
        console.warn('Ballerina model not found, using fallback geometric doll:', error);
        this.createFallbackBalerinaDoll(doll, innerHeight, innerRadius);
      }
    );
  }
  
  /**
   * Create fallback geometric ballerina doll when GLTF model is not available
   */
  private createFallbackBalerinaDoll(doll: THREE.Group, innerHeight: number, innerRadius: number): void {
    const dollScale = 1.2;
    
    // ===== TORSO / BODICE =====
    const bodiceGeom = new THREE.CylinderGeometry(
      0.4 * dollScale,   // top radius (shoulders)
      0.6 * dollScale,   // bottom radius (waist)
      1.5 * dollScale,   // height
      16
    );
    const bodice = new THREE.Mesh(bodiceGeom, this.materials.dollDress);
    bodice.position.z = innerHeight + 0.75 * dollScale;
    bodice.castShadow = true;
    doll.add(bodice);
    
    // Dress collar
    const collarGeom = new THREE.TorusGeometry(0.35 * dollScale, 0.08 * dollScale, 8, 16);
    const collar = new THREE.Mesh(collarGeom, this.materials.dollDress);
    collar.position.z = innerHeight + 1.4 * dollScale;
    doll.add(collar);
    
    // ===== PUFFED SLEEVES =====
    const sleeveGeom = new THREE.SphereGeometry(0.35 * dollScale, 12, 12);
    const leftSleeve = new THREE.Mesh(sleeveGeom, this.materials.dollDress);
    leftSleeve.position.set(-0.55 * dollScale, 0, innerHeight + 1.2 * dollScale);
    leftSleeve.scale.set(1, 0.7, 0.9);
    leftSleeve.castShadow = true;
    doll.add(leftSleeve);
    
    const rightSleeve = new THREE.Mesh(sleeveGeom, this.materials.dollDress);
    rightSleeve.position.set(0.55 * dollScale, 0, innerHeight + 1.2 * dollScale);
    rightSleeve.scale.set(1, 0.7, 0.9);
    rightSleeve.castShadow = true;
    doll.add(rightSleeve);
    
    // ===== ARMS (raised at sides) =====
    const armGeom = new THREE.CylinderGeometry(0.08 * dollScale, 0.1 * dollScale, 1.2 * dollScale, 8);
    
    // Left arm - raised outward and slightly up
    const leftArm = new THREE.Mesh(armGeom, this.materials.dollSkin);
    leftArm.position.set(-1.1 * dollScale, 0, innerHeight + 1.2 * dollScale);
    leftArm.rotation.y = Math.PI / 2;
    leftArm.rotation.x = -Math.PI / 8;  // Raised slightly
    leftArm.castShadow = true;
    doll.add(leftArm);
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeom, this.materials.dollSkin);
    rightArm.position.set(1.1 * dollScale, 0, innerHeight + 1.2 * dollScale);
    rightArm.rotation.y = -Math.PI / 2;
    rightArm.rotation.x = -Math.PI / 8;
    rightArm.castShadow = true;
    doll.add(rightArm);
    
    // Hands
    const handGeom = new THREE.SphereGeometry(0.1 * dollScale, 8, 8);
    const leftHand = new THREE.Mesh(handGeom, this.materials.dollSkin);
    leftHand.position.set(-1.7 * dollScale, 0.2 * dollScale, innerHeight + 1.3 * dollScale);
    doll.add(leftHand);
    
    const rightHand = new THREE.Mesh(handGeom, this.materials.dollSkin);
    rightHand.position.set(1.7 * dollScale, 0.2 * dollScale, innerHeight + 1.3 * dollScale);
    doll.add(rightHand);
    
    // ===== NECK =====
    const neckGeom = new THREE.CylinderGeometry(0.15 * dollScale, 0.2 * dollScale, 0.3 * dollScale, 12);
    const neck = new THREE.Mesh(neckGeom, this.materials.dollSkin);
    neck.position.z = innerHeight + 1.6 * dollScale;
    doll.add(neck);
    
    // ===== HEAD =====
    const headGeom = new THREE.SphereGeometry(0.4 * dollScale, 16, 16);
    const head = new THREE.Mesh(headGeom, this.materials.dollSkin);
    head.position.z = innerHeight + 2.1 * dollScale;
    head.castShadow = true;
    doll.add(head);
    
    // ===== SHORT BLACK HAIR =====
    // Short hair cap style (as requested)
    const hairGeom = new THREE.SphereGeometry(0.43 * dollScale, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hairMat = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a0a,  // Black hair
      metalness: 0.3, 
      roughness: 0.6 
    });
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.position.z = innerHeight + 2.2 * dollScale;
    hair.rotation.x = Math.PI;
    doll.add(hair);
    
    // Side hair pieces for short bob look
    const sideHairGeom = new THREE.SphereGeometry(0.15 * dollScale, 8, 8);
    const leftSideHair = new THREE.Mesh(sideHairGeom, hairMat);
    leftSideHair.position.set(-0.35 * dollScale, 0.1 * dollScale, innerHeight + 2.0 * dollScale);
    leftSideHair.scale.set(0.6, 1, 1.2);
    doll.add(leftSideHair);
    
    const rightSideHair = new THREE.Mesh(sideHairGeom, hairMat);
    rightSideHair.position.set(0.35 * dollScale, 0.1 * dollScale, innerHeight + 2.0 * dollScale);
    rightSideHair.scale.set(0.6, 1, 1.2);
    doll.add(rightSideHair);
    
    // ===== FACE FEATURES =====
    const eyeGeom = new THREE.SphereGeometry(0.06 * dollScale, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.14 * dollScale, 0.36 * dollScale, innerHeight + 2.15 * dollScale);
    doll.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.14 * dollScale, 0.36 * dollScale, innerHeight + 2.15 * dollScale);
    doll.add(rightEye);
    
    // Eyebrows
    const browGeom = new THREE.BoxGeometry(0.12 * dollScale, 0.02 * dollScale, 0.02 * dollScale);
    const browMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
    
    const leftBrow = new THREE.Mesh(browGeom, browMat);
    leftBrow.position.set(-0.14 * dollScale, 0.38 * dollScale, innerHeight + 2.25 * dollScale);
    doll.add(leftBrow);
    
    const rightBrow = new THREE.Mesh(browGeom, browMat);
    rightBrow.position.set(0.14 * dollScale, 0.38 * dollScale, innerHeight + 2.25 * dollScale);
    doll.add(rightBrow);
    
    // Lips
    const lipGeom = new THREE.SphereGeometry(0.06 * dollScale, 8, 8);
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xcc4444 });
    const lips = new THREE.Mesh(lipGeom, lipMat);
    lips.position.set(0, 0.37 * dollScale, innerHeight + 1.95 * dollScale);
    lips.scale.set(1.5, 0.5, 0.5);
    doll.add(lips);
    
    // Nose (subtle)
    const noseGeom = new THREE.ConeGeometry(0.04 * dollScale, 0.1 * dollScale, 6);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xeec5a8 });
    const nose = new THREE.Mesh(noseGeom, noseMat);
    nose.position.set(0, 0.4 * dollScale, innerHeight + 2.05 * dollScale);
    nose.rotation.x = -Math.PI / 2;
    doll.add(nose);
  }
  
  /**
   * Create seats positioned around the rim of the skirt
   * Seats are children of windmillGroup so they rotate with the skirt
   */
  private createSeatsOnRim(): void {
    const numSeats = 16;  // 2 per slice (8 slices * 2, or match numCabins)
    const outerRadius = this.windmillRadius;
    const seatRadius = outerRadius - 0.8;  // Slightly inward from outer edge
    
    // Seats positioned at outer edge height (cone bottom)
    const seatHeight = 0.2;  // Just above the outer rim
    
    for (let i = 0; i < numSeats; i++) {
      const angle = (i / numSeats) * Math.PI * 2;
      
      const seat = this.createSeat(i);
      
      // Position in local windmill coordinates (X-Y plane, Z is up)
      seat.position.set(
        Math.cos(angle) * seatRadius,
        Math.sin(angle) * seatRadius,
        seatHeight
      );
      
      // Rotate seat to face forward (tangent to rotation direction)
      // For CCW rotation, forward is 90° ahead of radial direction
      seat.rotation.z = angle;
      
      this.windmillGroup!.add(seat);
      this.cabinGroups.push(seat);
    }
  }
  
  /**
   * Create a single seat for the rim
   */
  private createSeat(index: number): THREE.Group {
    const seat = new THREE.Group();
    
    // Seat colors: seat 0 is pink (reference), all others white
    const seatColor = index === 0 ? 0xff69b4 : 0xffffff;  // Pink for seat 1, white for rest
    
    const seatMaterial = new THREE.MeshStandardMaterial({
      color: seatColor,
      metalness: 0.1,
      roughness: 0.7,
    });
    
    // Two-seater bench - wider seat
    const seatWidth = 1.4;  // Wide enough for two people
    
    // Seat cushion
    const cushionGeom = new THREE.BoxGeometry(seatWidth, 0.5, 0.15);
    const cushion = new THREE.Mesh(cushionGeom, seatMaterial);
    cushion.position.set(0, 0, 0.1);
    cushion.castShadow = true;
    seat.add(cushion);
    
    // Seat back
    const backGeom = new THREE.BoxGeometry(seatWidth, 0.1, 0.7);
    const back = new THREE.Mesh(backGeom, seatMaterial);
    back.position.set(0, -0.25, 0.45);
    back.castShadow = true;
    seat.add(back);
    
    // Safety bar (wider for two-seater)
    const barGeom = new THREE.CylinderGeometry(0.03, 0.03, seatWidth, 8);
    const bar = new THREE.Mesh(barGeom, this.materials.safetyBar);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, 0.25, 0.35);
    seat.add(bar);
    
    // Bar supports (at each end of the bench)
    const supportGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8);
    const supportL = new THREE.Mesh(supportGeom, this.materials.chrome);
    supportL.position.set(-seatWidth / 2 + 0.1, 0.2, 0.2);
    seat.add(supportL);
    
    const supportR = new THREE.Mesh(supportGeom, this.materials.chrome);
    supportR.position.set(seatWidth / 2 - 0.1, 0.2, 0.2);
    seat.add(supportR);
    
    // Center divider armrest
    const dividerGeom = new THREE.BoxGeometry(0.08, 0.3, 0.15);
    const divider = new THREE.Mesh(dividerGeom, this.materials.chrome);
    divider.position.set(0, 0, 0.2);
    seat.add(divider);
    
    return seat;
  }
  
  /**
   * Create decorative skirt with alternating colored panels
   * Conical shape: higher at center, lower at edges
   * Has thickness (not just a flat surface)
   */
  private createSkirt(): THREE.Group {
    const skirt = new THREE.Group();
    const segments = 16;
    const innerRadius = 1.8;
    const outerRadius = this.windmillRadius;
    
    // Conical parameters
    const thickness = 0.4;           // Thickness of the skirt
    const innerHeight = 2.5;         // Height at inner edge (higher) - more conical
    const outerHeight = 0.0;         // Height at outer edge (lower, creates cone)
    
    for (let i = 0; i < segments; i++) {
      const angle1 = (i / segments) * Math.PI * 2;
      const angle2 = ((i + 1) / segments) * Math.PI * 2;
      
      // Create 3D wedge panel using BufferGeometry
      // Each panel has 8 vertices (4 on top surface, 4 on bottom surface)
      const vertices = new Float32Array([
        // Top surface (conical - inner is higher)
        // Inner edge, angle1
        Math.cos(angle1) * innerRadius, Math.sin(angle1) * innerRadius, innerHeight,
        // Outer edge, angle1
        Math.cos(angle1) * outerRadius, Math.sin(angle1) * outerRadius, outerHeight,
        // Outer edge, angle2
        Math.cos(angle2) * outerRadius, Math.sin(angle2) * outerRadius, outerHeight,
        // Inner edge, angle2
        Math.cos(angle2) * innerRadius, Math.sin(angle2) * innerRadius, innerHeight,
        
        // Bottom surface (flat, below top)
        // Inner edge, angle1
        Math.cos(angle1) * innerRadius, Math.sin(angle1) * innerRadius, innerHeight - thickness,
        // Outer edge, angle1
        Math.cos(angle1) * outerRadius, Math.sin(angle1) * outerRadius, outerHeight - thickness,
        // Outer edge, angle2
        Math.cos(angle2) * outerRadius, Math.sin(angle2) * outerRadius, outerHeight - thickness,
        // Inner edge, angle2
        Math.cos(angle2) * innerRadius, Math.sin(angle2) * innerRadius, innerHeight - thickness,
      ]);
      
      // Indices for triangles (6 faces: top, bottom, 4 sides)
      const indices = [
        // Top face
        0, 1, 2,  0, 2, 3,
        // Bottom face (reversed winding)
        4, 6, 5,  4, 7, 6,
        // Outer edge (side)
        1, 5, 6,  1, 6, 2,
        // Inner edge (side)
        0, 3, 7,  0, 7, 4,
        // Side 1 (angle1)
        0, 4, 5,  0, 5, 1,
        // Side 2 (angle2)
        3, 2, 6,  3, 6, 7,
      ];
      
      const panelGeom = new THREE.BufferGeometry();
      panelGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      panelGeom.setIndex(indices);
      panelGeom.computeVertexNormals();
      
      const material = i % 2 === 0 ? this.materials.skirtPanelA : this.materials.skirtPanelB;
      const panel = new THREE.Mesh(panelGeom, material);
      panel.castShadow = true;
      panel.receiveShadow = true;
      skirt.add(panel);
    }
    
    // Outer trim ring (at the lower edge)
    const outerTrimGeom = new THREE.TorusGeometry(outerRadius, 0.12, 8, 64);
    const outerTrim = new THREE.Mesh(outerTrimGeom, this.materials.chrome);
    outerTrim.position.z = outerHeight - thickness / 2;
    skirt.add(outerTrim);
    
    // Inner trim ring (at the higher edge)
    const innerTrimGeom = new THREE.TorusGeometry(innerRadius, 0.1, 8, 32);
    const innerTrim = new THREE.Mesh(innerTrimGeom, this.materials.chrome);
    innerTrim.position.z = innerHeight - thickness / 2;
    skirt.add(innerTrim);
    
    // Top edge highlight ring (at inner edge, on top surface)
    const topRingGeom = new THREE.TorusGeometry(innerRadius + 0.05, 0.05, 6, 32);
    const topRing = new THREE.Mesh(topRingGeom, this.materials.chrome);
    topRing.position.z = innerHeight + 0.02;
    skirt.add(topRing);
    
    return skirt;
  }
  
  /**
   * Create decorative light columns along the radial dividers
   * Each column has multiple bulbs that animate sequentially
   */
  private createRideLights(): void {
    const numColumns = 16;  // One column per divider
    const bulbsPerColumn = 10;  // More bulbs, tighter spacing
    const innerRadius = 1.8;
    const outerRadius = this.windmillRadius;
    const innerHeight = 2.5;  // Match skirt cone height
    const outerHeight = 0.0;
    
    // Stop lights at seat level (seats are at outerRadius - 0.8)
    const seatRadius = outerRadius - 0.8;
    const maxRadiusFactor = (seatRadius - innerRadius) / (outerRadius - innerRadius);  // ~0.9
    
    // Store bulbs in 2D array for animation [column][bulb from top to bottom]
    this.lightColumns = [];
    
    for (let col = 0; col < numColumns; col++) {
      const angle = (col / numColumns) * Math.PI * 2;
      const columnBulbs: THREE.Mesh[] = [];
      
      for (let row = 0; row < bulbsPerColumn; row++) {
        // Interpolate position from inner (top) to seat level (not all the way to outer)
        const t = (row + 0.5) / bulbsPerColumn * maxRadiusFactor;  // Stop before outer edge
        const radius = innerRadius + (outerRadius - innerRadius) * t;
        const height = innerHeight + (outerHeight - innerHeight) * t;
        
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        // Create bulb with its own material (for individual control)
        const bulbMaterial = new THREE.MeshStandardMaterial({
          color: 0xffeeaa,
          emissive: 0xffaa44,
          emissiveIntensity: 0.3,  // Start dim
        });
        
        // Smaller bulbs for tighter appearance
        const bulbGeom = new THREE.SphereGeometry(0.1, 8, 8);
        const bulb = new THREE.Mesh(bulbGeom, bulbMaterial);
        bulb.position.set(x, y, height + 0.12);
        
        this.windmillGroup!.add(bulb);
        this.lightBulbs.push(bulb);
        columnBulbs.push(bulb);
      }
      
      this.lightColumns.push(columnBulbs);
      
      // Add one point light per column (at middle of column)
      const midT = 0.4 * maxRadiusFactor;
      const midRadius = innerRadius + (outerRadius - innerRadius) * midT;
      const midHeight = innerHeight + (outerHeight - innerHeight) * midT;
      const light = new THREE.PointLight(0xffaa44, 0.4, 10, 2);
      light.position.set(
        Math.cos(angle) * midRadius,
        Math.sin(angle) * midRadius,
        midHeight + 0.3
      );
      this.windmillGroup!.add(light);
      this.rideLights.push(light);
    }
  }
  
  /**
   * Create a rim-mounted seat (simpler than full cabin)
   * Seats are positioned along the outer edge of the skirt
   */
  private createCabin(index: number): THREE.Group {
    const seat = new THREE.Group();
    
    // Seat colors - alternate or use index
    const seatColors = [
      0xff3333, // Red (seat 0 - tracker)
      0x3366ff, // Blue
      0x33cc33, // Green
      0xffcc00, // Yellow
      0xff66cc, // Pink
      0x00cccc, // Cyan
      0xff6600, // Orange
      0x9933ff, // Purple
    ];
    
    const seatMaterial = new THREE.MeshStandardMaterial({
      color: seatColors[index % seatColors.length],
      metalness: 0.1,
      roughness: 0.7,
    });
    
    // Seat base (the actual seat cushion)
    const seatCushionGeom = new THREE.BoxGeometry(0.6, 0.15, 0.5);
    const seatCushion = new THREE.Mesh(seatCushionGeom, seatMaterial);
    seatCushion.position.set(0, 0.1, 0);
    seatCushion.castShadow = true;
    seat.add(seatCushion);
    
    // Seat back
    const backGeom = new THREE.BoxGeometry(0.6, 0.7, 0.1);
    const back = new THREE.Mesh(backGeom, seatMaterial);
    back.position.set(0, 0.45, -0.2);
    back.castShadow = true;
    seat.add(back);
    
    // Safety bar (simple lap bar)
    const barGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const bar = new THREE.Mesh(barGeom, this.materials.safetyBar);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.35, 0.2);
    seat.add(bar);
    
    // Bar supports (left and right)
    const supportGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8);
    const supportL = new THREE.Mesh(supportGeom, this.materials.chrome);
    supportL.position.set(-0.25, 0.25, 0.2);
    seat.add(supportL);
    
    const supportR = new THREE.Mesh(supportGeom, this.materials.chrome);
    supportR.position.set(0.25, 0.25, 0.2);
    seat.add(supportR);
    
    // Mounting bracket (connects seat to skirt)
    const bracketGeom = new THREE.BoxGeometry(0.5, 0.08, 0.3);
    const bracket = new THREE.Mesh(bracketGeom, this.materials.chrome);
    bracket.position.set(0, 0, -0.1);
    seat.add(bracket);
    
    return seat;
  }
  
  /**
   * Create structural arm/spoke connecting seat to center hub
   */
  private createArm(length: number): THREE.Mesh {
    // Thinner spoke for rim-mounted seats
    const armGeom = new THREE.CylinderGeometry(0.06, 0.06, length, 6);
    const arm = new THREE.Mesh(armGeom, this.materials.arm);
    arm.castShadow = true;
    return arm;
  }
  
  /**
   * Create Blender-style axis helper overlay
   */
  private createBlenderStyleAxisHelper(container: HTMLElement): void {
    const helperContainer = document.createElement('div');
    helperContainer.style.position = 'absolute';
    helperContainer.style.bottom = '20px';
    helperContainer.style.right = '20px';
    helperContainer.style.width = '120px';
    helperContainer.style.height = '120px';
    helperContainer.style.backgroundColor = 'rgba(10, 10, 21, 0.8)';
    helperContainer.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    helperContainer.style.borderRadius = '8px';
    helperContainer.style.padding = '10px';
    helperContainer.style.pointerEvents = 'none';
    helperContainer.style.zIndex = '1000';
    
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
   * Update Blender-style axis helper
   */
  private updateBlenderStyleAxisHelper(): void {
    if (!this.axisHelperCanvas) return;
    
    const ctx = this.axisHelperCanvas.getContext('2d')!;
    const size = 100;
    const center = size / 2;
    const axisLength = 35;
    
    ctx.clearRect(0, 0, size, size);
    
    const right = new THREE.Vector3();
    right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3();
    up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    
    const worldX = new THREE.Vector3(1, 0, 0);
    const xScreenX = worldX.dot(right) * axisLength;
    const xScreenY = -worldX.dot(up) * axisLength;
    
    const worldY = new THREE.Vector3(0, 1, 0);
    const yScreenX = worldY.dot(right) * axisLength;
    const yScreenY = -worldY.dot(up) * axisLength;
    
    const worldZ = new THREE.Vector3(0, 0, 1);
    const zScreenX = worldZ.dot(right) * axisLength;
    const zScreenY = -worldZ.dot(up) * axisLength;
    
    const xColor = '#ff6b6b';
    const yColor = '#51cf66';
    const zColor = '#4dabf7';
    
    // Draw axes
    ctx.lineWidth = 3;
    
    ctx.strokeStyle = xColor;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + xScreenX, center + xScreenY);
    ctx.stroke();
    this.drawArrowHead(ctx, center, center, center + xScreenX, center + xScreenY, xColor);
    ctx.fillStyle = xColor;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('X', center + xScreenX * 1.3, center + xScreenY * 1.3);
    
    ctx.strokeStyle = yColor;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + yScreenX, center + yScreenY);
    ctx.stroke();
    this.drawArrowHead(ctx, center, center, center + yScreenX, center + yScreenY, yColor);
    ctx.fillStyle = yColor;
    ctx.fillText('Y', center + yScreenX * 1.3, center + yScreenY * 1.3);
    
    ctx.strokeStyle = zColor;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + zScreenX, center + zScreenY);
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawArrowHead(ctx, center, center, center + zScreenX, center + zScreenY, zColor);
    ctx.fillStyle = zColor;
    ctx.fillText('Z', center + zScreenX * 1.3, center + zScreenY * 1.3);
  }
  
  /**
   * Draw arrow head
   */
  private drawArrowHead(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
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
   * Update visualization from simulation state
   */
  update(state: SimulationState): void {
    // Update platform rotation
    if (this.platformGroup) {
      this.platformGroup.rotation.y = state.platformPhase;
    }
    
    // Calculate pivot point in world coordinates
    const pivotX_physics = state.tilt.pivotRadius;
    const pivotWorldX = pivotX_physics * Math.cos(state.platformPhase);
    const pivotWorldY = pivotX_physics * Math.sin(state.platformPhase);
    
    // Update pivot marker
    if (this.eccentricMesh) {
      this.eccentricMesh.parent!.position.set(pivotWorldX, 0.4, pivotWorldY);
      this.eccentricMesh.parent!.rotation.y = state.platformPhase;
    }
    
    // Calculate secondary platform center
    const tiltAngle = state.tilt.tiltAngle;
    const offset = state.tilt.secondaryPlatformOffset;
    
    const centerOffsetX_plat = -offset * Math.cos(tiltAngle);
    const centerOffsetZ_plat = offset * Math.sin(tiltAngle);
    
    const centerX_plat = state.tilt.pivotRadius + centerOffsetX_plat;
    const centerY_plat = 0;
    const centerZ_plat = centerOffsetZ_plat;
    
    const centerWorldX = centerX_plat * Math.cos(state.platformPhase) - centerY_plat * Math.sin(state.platformPhase);
    const centerWorldY = centerX_plat * Math.sin(state.platformPhase) + centerY_plat * Math.cos(state.platformPhase);
    const centerWorldZ = centerZ_plat;
    
    // Update windmill group
    if (this.windmillGroup) {
      this.windmillGroup.position.set(centerWorldX, centerWorldZ + 0.5, centerWorldY);
      
      const discNormal = new THREE.Vector3(
        Math.sin(tiltAngle) * Math.cos(state.platformPhase),
        Math.cos(tiltAngle),
        Math.sin(tiltAngle) * Math.sin(state.platformPhase)
      ).normalize();
      
      const layFlatQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2
      );
      
      const orientQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        discNormal
      );
      
      const windmillQuaternion = new THREE.Quaternion().setFromAxisAngle(
        discNormal,
        state.windmillPhase + state.platformPhase
      );
      
      this.windmillGroup.quaternion.copy(windmillQuaternion)
        .multiply(orientQuaternion)
        .multiply(layFlatQuaternion);
    }
    
    // Seats are now part of windmillGroup and rotate automatically with it
    // Only update G-force coloring if enabled
    if (this.showGForceColors && state.cabins.length > 0) {
      for (let i = 0; i < Math.min(this.cabinGroups.length, state.cabins.length); i++) {
        const cabin = state.cabins[i];
        const cabinGroup = this.cabinGroups[i];
        
        // Skip seat 0 to keep it as tracker (red)
        if (i !== 0) {
          const cushion = cabinGroup.children[0] as THREE.Mesh;
          if (cushion && cushion.material) {
            const material = cushion.material as THREE.MeshStandardMaterial;
            const gForce = cabin.gForce;
            const hue = Math.max(0, Math.min(120 - gForce * 30, 120)) / 360;
            material.color.setHSL(hue, 0.8, 0.5);
          }
        }
      }
    }
    
    // Update force vectors if enabled
    if (this.showForceVectors) {
      this.updateForceVectors(state.cabins);
    } else {
      this.clearForceVectors();
    }
    
    // Animate light columns - only when lights are enabled
    if (this.lightsEnabled) {
      const time = state.time;
      const animSpeed = 1.2;  // Slower animation speed
      const cycleDuration = 2.5;  // Longer cycle duration (seconds)
      
      for (let col = 0; col < this.lightColumns.length; col++) {
        const column = this.lightColumns[col];
        const numBulbs = column.length;
        
        // Calculate which bulb should be lit based on time
        // Creates a cascading effect from top (0) to bottom (numBulbs-1)
        const cycleProgress = ((time * animSpeed) % cycleDuration) / cycleDuration;  // 0 to 1
        const activeBulbFloat = cycleProgress * (numBulbs + 1);  // Which bulb is currently "active"
        
        for (let row = 0; row < numBulbs; row++) {
          const bulb = column[row];
          const material = bulb.material as THREE.MeshStandardMaterial;
          
          // Calculate distance from the "active" position
          const distance = Math.abs(row - activeBulbFloat);
          
          // Bulbs close to active position are bright, others are dim
          // Creates a traveling "pulse" effect
          const brightness = Math.max(0, 1 - distance * 0.5);
          const intensity = 0.3 + brightness * 2.5;  // Range from 0.3 (dim) to 2.8 (bright)
          
          material.emissiveIntensity = intensity;
          
          // Also adjust color slightly - brighter bulbs are more yellow/white
          if (brightness > 0.5) {
            material.emissive.setHex(0xffdd66);  // Bright yellow-white
          } else {
            material.emissive.setHex(0xffaa44);  // Warm orange
          }
        }
      }
    }
  }
  
  /**
   * Update force vector visualization
   */
  private updateForceVectors(cabins: CabinState[]): void {
    this.clearForceVectors();
    
    for (const cabin of cabins) {
      const direction = new THREE.Vector3(
        cabin.acceleration.x,
        cabin.acceleration.z,
        cabin.acceleration.y
      ).normalize();
      
      const origin = new THREE.Vector3(
        cabin.position.x,
        cabin.position.z + 1.5,
        cabin.position.y
      );
      
      const length = cabin.totalAcceleration * 0.1;
      const color = new THREE.Color().setHSL(
        Math.max(0, 0.33 - cabin.gForce * 0.1),
        1,
        0.5
      );
      
      const arrow = new THREE.ArrowHelper(direction, origin, length, color.getHex(), 0.3, 0.15);
      this.scene.add(arrow);
      this.forceArrows.push(arrow);
    }
  }
  
  /**
   * Clear force vector arrows
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
   * Toggle decorative lights on/off
   */
  toggleLights(): void {
    this.setLightsEnabled(!this.lightsEnabled);
  }
  
  /**
   * Set lights on/off directly
   * When off: bulbs remain visible but don't glow, point lights are disabled
   */
  setLightsEnabled(enabled: boolean): void {
    this.lightsEnabled = enabled;
    
    // Bulbs stay visible but change appearance
    for (const bulb of this.lightBulbs) {
      const material = bulb.material as THREE.MeshStandardMaterial;
      if (enabled) {
        // Lights on: restore glowing appearance
        material.emissiveIntensity = 0.3;  // Will be animated
        material.color.setHex(0xffeeaa);
      } else {
        // Lights off: dim appearance, no glow
        material.emissiveIntensity = 0;
        material.color.setHex(0x888888);  // Dull gray
      }
    }
    
    // Point lights are hidden when off
    for (const light of this.rideLights) {
      light.visible = enabled;
    }
  }
  
  /**
   * Get lights enabled state
   */
  getLightsEnabled(): boolean {
    return this.lightsEnabled;
  }
  
  /**
   * Set external observer camera view
   */
  setExternalView(): void {
    this.camera.position.set(25, 18, 25);
    this.controls.target.set(0, 3, 0);
    this.controls.update();
  }
  
  /**
   * Set camera to follow a cabin
   */
  setCabinView(cabinIndex: number, state: SimulationState): void {
    if (cabinIndex >= 0 && cabinIndex < state.cabins.length) {
      const cabin = state.cabins[cabinIndex];
      this.camera.position.set(
        cabin.position.x + 5,
        cabin.position.z + 3,
        cabin.position.y
      );
      this.controls.target.set(cabin.position.x, cabin.position.z + 1, cabin.position.y);
      this.controls.update();
    }
  }
  
  /**
   * Render the scene with post-processing
   */
  render(): void {
    this.controls.update();
    this.updateBlenderStyleAxisHelper();
    
    // Use composer for post-processing
    this.composer.render();
  }
  
  /**
   * Handle window resize
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.controls.update();
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.axisHelperContainer && this.axisHelperContainer.parentElement) {
      this.axisHelperContainer.parentElement.removeChild(this.axisHelperContainer);
    }
    
    // Dispose materials
    Object.values(this.materials).forEach(mat => mat.dispose());
    
    // Dispose lights
    this.rideLights.forEach(light => {
      this.scene.remove(light);
      light.dispose();
    });
    
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
