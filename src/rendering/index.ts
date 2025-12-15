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
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SimulationState, CabinState } from '../types/index.js';
import { SmokeSystem } from './SmokeSystem.js';

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
  // Surrounding structure materials
  deckMetal: THREE.MeshStandardMaterial;
  flashPanelPink: THREE.MeshStandardMaterial;
  flashPanelGold: THREE.MeshStandardMaterial;
  flashPanelWhite: THREE.MeshStandardMaterial;
  controlCabin: THREE.MeshStandardMaterial;
  controlCabinGlass: THREE.MeshStandardMaterial;
  stairMetal: THREE.MeshStandardMaterial;
  stairRubber: THREE.MeshStandardMaterial;
  loudspeaker: THREE.MeshStandardMaterial;
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
  private underskirtLightBulbs: THREE.Mesh[] = [];  // Underskirt lights (always on, no animation)
  private underskirtLightsEnabled: boolean = true;
  private balerinaDollGroup: THREE.Group | null = null;  // Container for ballerina doll (loaded or fallback)
  private gltfLoader: GLTFLoader;
  private objLoader: OBJLoader;
  
  // Surrounding structure elements
  private surroundingGroup: THREE.Group | null = null;
  private flashPanelLights: THREE.Mesh[] = [];  // Light bulbs on flash panels
  private flashPanelPointLights: THREE.PointLight[] = [];  // Point lights for glow
  
  // Light show reflectors on poles
  private lightShowEnabled: boolean = true;
  private poleReflectors: { 
    mesh: THREE.Mesh; 
    light: THREE.SpotLight; 
    beam: THREE.Mesh;  // Visible light beam cone
    color: number;
  }[] = [];
  private poleReflectorColors: number[] = [
    0xff0066,  // Hot pink
    0x00ff66,  // Green
    0x6600ff,  // Purple
    0xff6600,  // Orange
    0x00ccff,  // Cyan
    0xffff00,  // Yellow
    0xff00ff,  // Magenta
    0x00ffff,  // Aqua
  ];
  
  // Strobe reflector on loudspeaker pole - EXTREMELY INTENSE
  private stroboReflector: {
    mesh: THREE.Mesh;
    light: THREE.SpotLight;
    lens: THREE.Mesh;
    beam: THREE.Mesh;
  } | null = null;
  private stroboActive: boolean = false;
  private stroboEndTime: number = 0;
  private stroboFlashInterval: number = 50; // milliseconds between flashes
  private stroboLastFlash: number = 0;
  private stroboFlashState: boolean = false;
  
  // Smoke system
  private smokeSystem: SmokeSystem | null = null;
  private lastUpdateTime: number = 0;
  
  // Legacy compatibility
  private platformMesh: THREE.Mesh | null = null;
  
  // Radius indicator bar
  private radiusBar: THREE.Mesh | null = null;
  
  // Fork arm connecting pivot to secondary platform center
  private forkArmGroup: THREE.Group | null = null;
  
  // Visualization options
  private forceArrows: THREE.ArrowHelper[] = [];
  private showForceVectors: boolean = false;
  private showGForceColors: boolean = false;
  private lightsEnabled: boolean = true;  // Decorative lights on/off
  
  // Day/Night mode
  private isNightMode: boolean = true;  // Start in night mode (matches current dark theme)
  private skyMesh: THREE.Mesh | null = null;
  private starField: THREE.Points | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  
  // Camera modes: 'external' (fixed observer) or 'cabin' (passenger view from pink seat)
  private cameraMode: 'external' | 'cabin' = 'external';
  private externalCameraPosition: THREE.Vector3 = new THREE.Vector3(-35, 12, 8);
  private externalCameraTarget: THREE.Vector3 = new THREE.Vector3(0, 4, 0);
  
  // UI elements
  private axisHelperCanvas: HTMLCanvasElement | null = null;
  private axisHelperContainer: HTMLElement | null = null;
  
  // Configuration
  private platformRadius: number;
  private windmillRadius: number;
  private materials: MaterialSet;
  
  // Deck and platform height configuration
  private readonly DECK_HEIGHT = 0.8;  // Height of the walkway deck
  private readonly PLATFORM_BASE_HEIGHT = 1.1;  // Height of rotating platform base (above deck)
  
  /**
   * Create a new rendering engine
   */
  constructor(container: HTMLElement, width: number, height: number, platformRadius: number, windmillRadius: number) {
    this.platformRadius = platformRadius;
    this.windmillRadius = windmillRadius;
    
    // Initialize 3D model loaders
    this.gltfLoader = new GLTFLoader();
    this.objLoader = new OBJLoader();
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a15);
    this.scene.fog = new THREE.Fog(0x0a0a15, 50, 150);
    
    // Camera setup - facing platform from stairs side (negative X direction)
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
    this.camera.position.set(-35, 12, 8);
    this.camera.lookAt(0, 4, 0);
    
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
    this.controls.target.set(0, 4, 0);
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
    
    // Initialize smoke system - dense dance floor fog effect
    this.smokeSystem = new SmokeSystem(this.scene);
    
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
        color: 0x0a0a0a,  // Very dark black for mirror-like reflections
        metalness: 1.0,   // Maximum metalness for perfect reflections
        roughness: 0.02,  // Near-perfect smoothness for sharp reflections
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
      // Surrounding structure materials
      deckMetal: new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,  // Dark gray metal
        metalness: 0.7,
        roughness: 0.75,  // Rough surface for grip
      }),
      flashPanelPink: new THREE.MeshStandardMaterial({
        color: 0xff69b4,  // Hot pink
        metalness: 1.0,   // Maximum metalness for mirror-like reflections
        roughness: 0.02,  // Near-perfect smoothness for sharp reflections
        emissive: 0xff69b4,
        emissiveIntensity: 0.1,
      }),
      flashPanelGold: new THREE.MeshStandardMaterial({
        color: 0xffcc00,  // Gold
        metalness: 1.0,   // Maximum metalness for golden shine
        roughness: 0.02,  // Near-perfect smoothness for reflections
        emissive: 0xffaa00,
        emissiveIntensity: 0.15,
      }),
      flashPanelWhite: new THREE.MeshStandardMaterial({
        color: 0xffffff,  // Pure white for maximum reflection
        metalness: 1.0,   // Maximum reflectivity
        roughness: 0.02,  // Near-perfect smoothness
        emissive: 0xffeedd,
        emissiveIntensity: 0.05,
      }),
      controlCabin: new THREE.MeshStandardMaterial({
        color: 0x445566,  // Blue-gray metal
        metalness: 0.7,
        roughness: 0.4,
      }),
      controlCabinGlass: new THREE.MeshStandardMaterial({
        color: 0x88ccff,  // Light blue glass
        metalness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: 0.6,
      }),
      stairMetal: new THREE.MeshStandardMaterial({
        color: 0x555555,  // Dark metal
        metalness: 0.8,
        roughness: 0.35,
      }),
      stairRubber: new THREE.MeshStandardMaterial({
        color: 0x222222,  // Black rubber grip
        metalness: 0.0,
        roughness: 0.95,
      }),
      loudspeaker: new THREE.MeshStandardMaterial({
        color: 0x333333,  // Dark gray
        metalness: 0.5,
        roughness: 0.6,
      }),
    };
  }
  
  /**
   * Create procedural environment map for reflections
   * Adapts to day/night mode
   */
  private createEnvironmentMap(): void {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Create a simple gradient sky environment
    const envScene = new THREE.Scene();
    
    // Sky gradient using a large sphere - colors based on day/night mode
    const skyGeometry = new THREE.SphereGeometry(50, 32, 32);
    const topColor = this.isNightMode ? new THREE.Color(0x0a0a20) : new THREE.Color(0x4a90d9);
    const bottomColor = this.isNightMode ? new THREE.Color(0x1a1a30) : new THREE.Color(0x87ceeb);
    
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: topColor },
        bottomColor: { value: bottomColor },
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
    const lightColor = this.isNightMode ? 0xffffaa : 0xffffff;
    const lightMat = new THREE.MeshBasicMaterial({ color: lightColor });
    
    if (this.isNightMode) {
      // Night: subtle lights
      for (let i = 0; i < 6; i++) {
        const light = new THREE.Mesh(lightGeom, lightMat);
        const angle = (i / 6) * Math.PI * 2;
        light.position.set(Math.cos(angle) * 30, 15 + Math.sin(angle * 2) * 5, Math.sin(angle) * 30);
        envScene.add(light);
      }
    } else {
      // Day: add a sun to the environment
      const sunGeom = new THREE.SphereGeometry(8, 16, 16);
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
      const sun = new THREE.Mesh(sunGeom, sunMat);
      sun.position.set(25, 35, 15);
      envScene.add(sun);
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
    this.hemiLight = new THREE.HemisphereLight(0x4466aa, 0x222222, 0.5);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);
    
    // Main directional light (sun/key light)
    this.sunLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    this.sunLight.position.set(20, 30, 15);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 100;
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 30;
    this.sunLight.shadow.camera.bottom = -30;
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    
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
    
    // Create sky and stars
    this.createSky();
    this.createStarField();
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
   * Create sky dome with gradient shader
   * Supports both day (sunny) and night (dark) modes
   */
  private createSky(): void {
    const skyGeometry = new THREE.SphereGeometry(200, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x0a0a20) },
        bottomColor: { value: new THREE.Color(0x1a1a30) },
        sunPosition: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
        sunIntensity: { value: 0.0 },  // 0 for night, 1 for day
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunPosition;
        uniform float sunIntensity;
        varying vec3 vWorldPosition;
        
        void main() {
          // Basic gradient from bottom to top
          float h = normalize(vWorldPosition).y;
          vec3 gradient = mix(bottomColor, topColor, max(h * 0.5 + 0.5, 0.0));
          
          // Sun glow for day mode
          vec3 sunDir = normalize(sunPosition);
          vec3 viewDir = normalize(vWorldPosition);
          float sunDot = max(dot(viewDir, sunDir), 0.0);
          
          // Sun disc
          float sunDisc = smoothstep(0.997, 0.999, sunDot);
          vec3 sunColor = vec3(1.0, 0.95, 0.8);
          
          // Sun glow (halo around sun)
          float sunGlow = pow(sunDot, 8.0) * 0.5;
          vec3 glowColor = vec3(1.0, 0.85, 0.6);
          
          // Combine
          vec3 finalColor = gradient;
          finalColor += sunColor * sunDisc * sunIntensity;
          finalColor += glowColor * sunGlow * sunIntensity;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    });
    
    this.skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(this.skyMesh);
  }
  
  /**
   * Create star field for night sky
   */
  private createStarField(): void {
    const starCount = 2000;
    const starGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
      // Distribute stars on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const radius = 180 + Math.random() * 10;
      
      // Only show stars in upper hemisphere
      const y = radius * Math.cos(phi);
      if (y < -10) {
        // Re-roll for stars below horizon
        const newPhi = Math.acos(Math.random() * 0.9);  // Bias toward upper hemisphere
        positions[i * 3] = radius * Math.sin(newPhi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.cos(newPhi);
        positions[i * 3 + 2] = radius * Math.sin(newPhi) * Math.sin(theta);
      } else {
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      }
      
      // Random star sizes
      sizes[i] = 0.5 + Math.random() * 2.5;
      
      // Star colors (mostly white, some slightly blue or yellow)
      const colorVariation = Math.random();
      if (colorVariation < 0.7) {
        // White stars
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
      } else if (colorVariation < 0.85) {
        // Blue-ish stars
        colors[i * 3] = 0.8;
        colors[i * 3 + 1] = 0.9;
        colors[i * 3 + 2] = 1.0;
      } else {
        // Yellow-ish stars
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.95;
        colors[i * 3 + 2] = 0.8;
      }
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        opacity: { value: 1.0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float opacity;
        varying vec3 vColor;
        void main() {
          // Circular star with soft edge
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
          
          // Twinkle effect can be added here if needed
          gl_FragColor = vec4(vColor, alpha * opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.starField = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starField);
  }
  
  /**
   * Set day or night mode
   * @param isNight - true for night mode, false for day mode
   */
  setDayNightMode(isNight: boolean): void {
    this.isNightMode = isNight;
    
    if (isNight) {
      // Night mode
      this.scene.background = new THREE.Color(0x0a0a15);
      this.scene.fog = new THREE.Fog(0x0a0a15, 50, 150);
      
      // Update sky shader
      if (this.skyMesh) {
        const material = this.skyMesh.material as THREE.ShaderMaterial;
        material.uniforms.topColor.value.setHex(0x0a0a20);
        material.uniforms.bottomColor.value.setHex(0x1a1a30);
        material.uniforms.sunIntensity.value = 0.0;
      }
      
      // Show stars
      if (this.starField) {
        this.starField.visible = true;
      }
      
      // Dim lighting for night
      if (this.sunLight) {
        this.sunLight.intensity = 0.3;
        this.sunLight.color.setHex(0x8888aa);  // Moonlight color
      }
      
      if (this.hemiLight) {
        this.hemiLight.intensity = 0.3;
        this.hemiLight.color.setHex(0x4466aa);
        this.hemiLight.groundColor.setHex(0x222222);
      }
      
      // Update ground material for night
      this.materials.ground.color.setHex(0x1a1a1a);
      
    } else {
      // Day mode
      this.scene.background = new THREE.Color(0x87ceeb);  // Sky blue
      this.scene.fog = new THREE.Fog(0x87ceeb, 80, 200);
      
      // Update sky shader for sunny day
      if (this.skyMesh) {
        const material = this.skyMesh.material as THREE.ShaderMaterial;
        material.uniforms.topColor.value.setHex(0x4a90d9);  // Deep sky blue
        material.uniforms.bottomColor.value.setHex(0x87ceeb);  // Light sky blue
        material.uniforms.sunIntensity.value = 1.0;
      }
      
      // Hide stars
      if (this.starField) {
        this.starField.visible = false;
      }
      
      // Bright sunlight for day
      if (this.sunLight) {
        this.sunLight.intensity = 1.5;
        this.sunLight.color.setHex(0xfff5e6);  // Warm sunlight
      }
      
      if (this.hemiLight) {
        this.hemiLight.intensity = 0.8;
        this.hemiLight.color.setHex(0x87ceeb);  // Sky blue ambient
        this.hemiLight.groundColor.setHex(0x8b7355);  // Warm ground bounce
      }
      
      // Update ground material for day
      this.materials.ground.color.setHex(0x3a3a3a);  // Slightly lighter ground
      
      // Turn off all decorative lights during day
      this.setLightsEnabled(false);
      this.setUnderskirtLightsEnabled(false);
      this.setLightShowEnabled(false);
    }
    
    // Recreate environment map for reflections
    this.createEnvironmentMap();
  }
  
  /**
   * Get current day/night mode
   * @returns true if night mode, false if day mode
   */
  getIsNightMode(): boolean {
    return this.isNightMode;
  }
  
  /**
   * Toggle between day and night mode
   */
  toggleDayNight(): void {
    this.setDayNightMode(!this.isNightMode);
  }
  
  /**
   * Initialize all ride geometry
   */
  private initializeGeometry(): void {
    this.createPlatform();
    // Mast removed - was too prominent/lighthouse-like
    // Pivot marker removed - bar end cap now serves as pivot indicator
    this.createWindmillGroup();
    
    // Create surrounding fairground structure
    this.createSurroundingStructure();
  }
  
  /**
   * Create the main rotating platform
   */
  private createPlatform(): void {
    this.platformGroup = new THREE.Group();
    
    // Position the entire platform group above the deck
    this.platformGroup.position.y = this.PLATFORM_BASE_HEIGHT;
    
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
    
    // Create the radius indicator bar
    this.createRadiusBar();
    
    // Create the fork arm that holds the secondary platform
    this.createForkArm();
    
    this.scene.add(this.platformGroup);
  }
  
  /**
   * Create a wide metal bar that lies on the platform plane
   * One end is fixed at the pivot point, extends through center to opposite edge
   * Positioned in world coordinates (not as child of platformGroup) to match pivot marker
   */
  private createRadiusBar(): void {
    // Bar dimensions
    const barWidth = 2.4;   // 3x wider
    const barHeight = 0.15; // Thickness of the bar
    
    // Initial bar length - full diameter
    const initialBarLength = this.platformRadius * 2;
    
    // Create bar geometry - box oriented along X axis
    const barGeom = new THREE.BoxGeometry(initialBarLength, barHeight, barWidth);
    
    // Create metallic material for the bar
    const barMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,    // Silver/steel color
      metalness: 0.9,
      roughness: 0.2,
    });
    
    this.radiusBar = new THREE.Mesh(barGeom, barMaterial);
    this.radiusBar.position.set(0, this.PLATFORM_BASE_HEIGHT + 0.38, 0);
    this.radiusBar.castShadow = true;
    this.radiusBar.receiveShadow = true;
    
    // Add to scene directly (NOT to platformGroup) - we'll position in world coords
    this.scene.add(this.radiusBar);
  }
  
  /**
   * Update the radius bar position in world coordinates
   * One end always at the pivot point, other end at opposite edge of platform
   * @param pivotRadius - Distance from platform center to pivot point
   * @param platformPhase - Current rotation angle of the platform
   */
  private updateRadiusBar(pivotRadius: number, platformPhase: number): void {
    if (!this.radiusBar) return;
    
    const barWidth = 2.4;
    const barHeight = 0.15;
    
    // Calculate pivot point position in world coordinates (same as pivot marker)
    const pivotWorldX = pivotRadius * Math.cos(platformPhase);
    const pivotWorldZ = pivotRadius * Math.sin(platformPhase);
    
    // Calculate opposite edge position in world coordinates
    // Opposite edge is at -platformRadius in the same direction from center
    const oppositeWorldX = -this.platformRadius * Math.cos(platformPhase);
    const oppositeWorldZ = -this.platformRadius * Math.sin(platformPhase);
    
    // Bar length from pivot to opposite edge
    const barLength = pivotRadius + this.platformRadius;
    
    // Bar center position
    const barCenterX = (pivotWorldX + oppositeWorldX) / 2;
    const barCenterZ = (pivotWorldZ + oppositeWorldZ) / 2;
    
    // Update bar geometry if length changed significantly
    const currentGeom = this.radiusBar.geometry as THREE.BoxGeometry;
    const currentLength = currentGeom.parameters.width;
    
    if (Math.abs(currentLength - barLength) > 0.01) {
      this.radiusBar.geometry.dispose();
      this.radiusBar.geometry = new THREE.BoxGeometry(barLength, barHeight, barWidth);
    }
    
    // Position and rotate the bar in world coordinates
    // Negate the angle because Three.js Y-rotation convention: +X rotates toward -Z
    this.radiusBar.position.set(barCenterX, this.PLATFORM_BASE_HEIGHT + 0.38, barCenterZ);
    this.radiusBar.rotation.y = -platformPhase;  // Align bar along the pivot-to-opposite direction
  }
  
  /**
   * Create a tapered arm geometry (wider at one end, narrower at other)
   * @param length - Length of the arm (along X axis)
   * @param bottomWidth - Width at bottom end (at X=0)
   * @param topWidth - Width at top end (at X=length)
   * @param bottomHeight - Height at bottom end
   * @param topHeight - Height at top end
   */
  private createTaperedArmGeometry(
    length: number,
    bottomWidth: number,
    topWidth: number,
    bottomHeight: number,
    topHeight: number
  ): THREE.BufferGeometry {
    // Create a tapered box (8 vertices, 12 triangles)
    // The arm goes along the X axis, with bottom at X=-length/2 and top at X=+length/2
    const hw0 = bottomWidth / 2;   // Half-width at bottom
    const hh0 = bottomHeight / 2;  // Half-height at bottom
    const hw1 = topWidth / 2;      // Half-width at top
    const hh1 = topHeight / 2;     // Half-height at top
    const hl = length / 2;         // Half-length
    
    const vertices = new Float32Array([
      // Bottom end (X = -hl) - wider
      -hl, -hh0, -hw0,  // 0: bottom-left-back
      -hl, -hh0,  hw0,  // 1: bottom-left-front
      -hl,  hh0,  hw0,  // 2: top-left-front
      -hl,  hh0, -hw0,  // 3: top-left-back
      // Top end (X = +hl) - narrower
       hl, -hh1, -hw1,  // 4: bottom-right-back
       hl, -hh1,  hw1,  // 5: bottom-right-front
       hl,  hh1,  hw1,  // 6: top-right-front
       hl,  hh1, -hw1,  // 7: top-right-back
    ]);
    
    // Indices for 12 triangles (6 faces)
    const indices = [
      // Left face (bottom end cap)
      0, 2, 1,  0, 3, 2,
      // Right face (top end cap)
      4, 5, 6,  4, 6, 7,
      // Bottom face
      0, 1, 5,  0, 5, 4,
      // Top face
      2, 3, 7,  2, 7, 6,
      // Front face
      1, 2, 6,  1, 6, 5,
      // Back face
      0, 4, 7,  0, 7, 3,
    ];
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create the fork arm that holds the secondary platform
   * The fork connects from the pivot point to the center of the secondary platform
   */
  private createForkArm(): void {
    this.forkArmGroup = new THREE.Group();
    
    // Fork arm material - sturdy metallic appearance
    const forkMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.85,
      roughness: 0.25,
    });
    
    // Main arm beam - tapered shape (wider at bottom/pivot, narrower at top/skirt)
    // Initial geometry - will be updated in updateForkArm
    const armGeom = this.createTaperedArmGeometry(1, 1.2, 0.6, 0.5, 0.3);
    const armMesh = new THREE.Mesh(armGeom, forkMaterial);
    armMesh.name = 'forkArmBeam';
    armMesh.castShadow = true;
    armMesh.receiveShadow = true;
    this.forkArmGroup.add(armMesh);
    
    // Secondary platform end cap - circular mounting plate (smaller for narrower top)
    const platCapGeom = new THREE.CylinderGeometry(0.45, 0.35, 0.3, 16);
    const platCap = new THREE.Mesh(platCapGeom, this.materials.chrome);
    platCap.name = 'platCap';
    platCap.rotation.x = Math.PI / 2;  // Will be oriented toward secondary platform
    platCap.castShadow = true;
    this.forkArmGroup.add(platCap);
    
    // Add structural reinforcement ribs along the arm (tapered sizes)
    const ribMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.8,
      roughness: 0.3,
    });
    
    for (let i = 0; i < 3; i++) {
      // Ribs get smaller toward the top
      const t = 0.25 + (i * 0.25);  // 0.25, 0.5, 0.75 along arm
      const ribWidth = 1.2 - (1.2 - 0.6) * t;  // Interpolate between bottom and top width
      const ribHeight = 0.5 - (0.5 - 0.3) * t;  // Interpolate height too
      const ribGeom = new THREE.BoxGeometry(0.08, ribHeight + 0.15, ribWidth + 0.1);
      const rib = new THREE.Mesh(ribGeom, ribMaterial);
      rib.name = `rib${i}`;
      rib.castShadow = true;
      this.forkArmGroup.add(rib);
    }
    
    this.scene.add(this.forkArmGroup);
  }
  
  /**
   * Update the fork arm position and orientation
   * Connects pivot point to secondary platform center
   */
  private updateForkArm(state: SimulationState): void {
    if (!this.forkArmGroup) return;
    
    const pivotRadius = state.tilt.pivotRadius;
    const platformPhase = state.platformPhase;
    const tiltAngle = state.tilt.tiltAngle;
    const offset = state.tilt.secondaryPlatformOffset;
    
    // Calculate pivot point in world coordinates
    const pivotWorldX = pivotRadius * Math.cos(platformPhase);
    const pivotWorldY = this.PLATFORM_BASE_HEIGHT + 0.38;  // Same height as radius bar
    const pivotWorldZ = pivotRadius * Math.sin(platformPhase);
    
    // Calculate secondary platform center (same logic as in update method)
    const centerOffsetX_plat = -offset * Math.cos(tiltAngle);
    const centerOffsetZ_plat = offset * Math.sin(tiltAngle);
    
    const centerX_plat = pivotRadius + centerOffsetX_plat;
    const centerY_plat = 0;
    const centerZ_plat = centerOffsetZ_plat;
    
    const platCenterWorldX = centerX_plat * Math.cos(platformPhase) - centerY_plat * Math.sin(platformPhase);
    const platCenterWorldY = centerZ_plat + this.PLATFORM_BASE_HEIGHT + 0.5;  // Y in world is Z in platform coords + base height
    const platCenterWorldZ = centerX_plat * Math.sin(platformPhase) + centerY_plat * Math.cos(platformPhase);
    
    // Skirt cone parameters (must match createSkirt)
    const skirtInnerHeight = 2.5;
    const skirtThickness = 0.4;
    const skirtBottomCenterLocalZ = skirtInnerHeight - skirtThickness;  // 2.1 in windmill local Z
    
    // Calculate the actual attachment point at the bottom of the conical skirt
    // The skirt bottom center is offset from the windmill center along the tilt direction
    const attachOffsetFromCenter = skirtBottomCenterLocalZ;
    
    // The disc normal direction
    const discNormalX = Math.sin(tiltAngle) * Math.cos(platformPhase);
    const discNormalY = Math.cos(tiltAngle);
    const discNormalZ = Math.sin(tiltAngle) * Math.sin(platformPhase);
    
    // Attachment point: windmill center + offset along disc normal toward the skirt bottom
    const skirtAttachX = platCenterWorldX + discNormalX * attachOffsetFromCenter;
    const skirtAttachY = platCenterWorldY + discNormalY * attachOffsetFromCenter;
    const skirtAttachZ = platCenterWorldZ + discNormalZ * attachOffsetFromCenter;
    
    // Vector from pivot to skirt attachment point
    const dx = skirtAttachX - pivotWorldX;
    const dy = skirtAttachY - pivotWorldY;
    const dz = skirtAttachZ - pivotWorldZ;
    const fullLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    // Direction vector (normalized)
    const dirX = dx / fullLength;
    const dirY = dy / fullLength;
    const dirZ = dz / fullLength;
    
    // Inset the fork arm start point away from the pivot edge to avoid clipping
    const pivotInset = 3.0;  // Distance to move inward from pivot point (increased to avoid clipping)
    const forkStartX = pivotWorldX + dirX * pivotInset;
    const forkStartY = pivotWorldY + dirY * pivotInset;
    const forkStartZ = pivotWorldZ + dirZ * pivotInset;
    
    // Adjusted arm length (shorter due to inset)
    const armLength = fullLength - pivotInset;
    
    // Midpoint of the arm (between inset start and skirt attachment point)
    const midX = (forkStartX + skirtAttachX) / 2;
    const midY = (forkStartY + skirtAttachY) / 2;
    const midZ = (forkStartZ + skirtAttachZ) / 2;
    
    // Tapered arm dimensions
    const bottomWidth = 1.2;   // Width at pivot (bottom) end
    const topWidth = 0.6;      // Width at skirt (top) end
    const bottomHeight = 0.5;  // Height at pivot end
    const topHeight = 0.3;     // Height at skirt end
    
    // Get the arm beam mesh and update it
    const armMesh = this.forkArmGroup.getObjectByName('forkArmBeam') as THREE.Mesh;
    if (armMesh) {
      // Always recreate tapered geometry when length changes
      // (BufferGeometry doesn't have parameters like BoxGeometry)
      armMesh.geometry.dispose();
      armMesh.geometry = this.createTaperedArmGeometry(
        armLength, bottomWidth, topWidth, bottomHeight, topHeight
      );
      
      // Position at midpoint
      armMesh.position.set(midX, midY, midZ);
      
      // Orient along the direction vector
      // Calculate rotation to align X-axis with direction vector
      const direction = new THREE.Vector3(dirX, dirY, dirZ);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
      armMesh.quaternion.copy(quaternion);
    }
    
    // Position platform cap at skirt attachment point
    // Account for the skirt's conical underside angle
    const platCap = this.forkArmGroup.getObjectByName('platCap') as THREE.Mesh;
    if (platCap) {
      // Position at the skirt attachment point
      platCap.position.set(skirtAttachX, skirtAttachY, skirtAttachZ);
      
      // Skirt cone parameters for angle calculation
      const skirtInnerRadius = 1.8;
      const skirtOuterHeight = 0.0;
      
      // Calculate cone slope angle (from horizontal)
      const coneRise = skirtInnerHeight - skirtOuterHeight;  // 2.5
      const coneRun = this.windmillRadius - skirtInnerRadius;  // e.g., 8 - 1.8 = 6.2
      const coneAngle = Math.atan2(coneRise, coneRun);  // Angle of cone surface from horizontal
      
      // The disc normal in world coords
      const discNormal = new THREE.Vector3(discNormalX, discNormalY, discNormalZ);
      
      // Create a quaternion that orients the cap along the disc normal
      const capQuat = new THREE.Quaternion();
      capQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), discNormal);
      
      // Apply additional rotation for cone angle around the radial direction
      // This tilts the cap to match the cone slope
      const radialDir = new THREE.Vector3(
        Math.cos(platformPhase),
        0,
        Math.sin(platformPhase)
      );
      const coneRotation = new THREE.Quaternion();
      coneRotation.setFromAxisAngle(radialDir, -coneAngle);  // Negative to tilt toward center
      
      platCap.quaternion.copy(coneRotation).multiply(capQuat);
    }
    
    // Position ribs along the arm (from inset start to skirt attachment point)
    for (let i = 0; i < 3; i++) {
      const rib = this.forkArmGroup.getObjectByName(`rib${i}`) as THREE.Mesh;
      if (rib) {
        const t = 0.25 + (i * 0.25);  // Position at 25%, 50%, 75% along arm
        const ribX = forkStartX + (skirtAttachX - forkStartX) * t;
        const ribY = forkStartY + (skirtAttachY - forkStartY) * t;
        const ribZ = forkStartZ + (skirtAttachZ - forkStartZ) * t;
        rib.position.set(ribX, ribY, ribZ);
        
        // Orient rib perpendicular to arm
        const direction = new THREE.Vector3(dirX, dirY, dirZ);
        const ribQuat = new THREE.Quaternion();
        ribQuat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
        rib.quaternion.copy(ribQuat);
      }
    }
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
    
    // Create underskirt lights (dim, always on, 2/3 radius)
    this.createUnderskirtLights();
    
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
    // Keep hem visible as the pink cap on top of skirt
    doll.add(hem);
    
    return doll;
  }
  
  /**
   * Load ballerina doll 3D model from OBJ file with PBR textures
   * Falls back to geometric primitives if model not found
   */
  private loadBalerinaDollModel(doll: THREE.Group, innerHeight: number, innerRadius: number): void {
    // Load the ballerina OBJ model from public/models/ballerina/
    const modelPath = '/models/ballerina/base.obj';
    const textureBasePath = '/models/ballerina/';
    
    // Load textures
    const textureLoader = new THREE.TextureLoader();
    
    // Load diffuse texture
    textureLoader.load(
      textureBasePath + 'texture_diffuse.png',
      (diffuseMap) => {
        diffuseMap.colorSpace = THREE.SRGBColorSpace;
        diffuseMap.flipY = true;  // OBJ typically needs flipY for textures
        
        // Create material with loaded texture
        const balerinaMaterial = new THREE.MeshStandardMaterial({
          map: diffuseMap,
          side: THREE.DoubleSide,
          metalness: 0.0,
          roughness: 0.5,
          emissive: new THREE.Color(0x222222),  // Slight glow for visibility
          emissiveIntensity: 0.3,
        });
        
        console.log('Ballerina texture loaded successfully');
        
        // Load the OBJ model
        this.objLoader.load(
          modelPath,
          (obj) => {
            try {
              console.log('Ballerina OBJ model loaded successfully');
              
              // Get bounding box before any transforms
              const box = new THREE.Box3().setFromObject(obj);
              const size = new THREE.Vector3();
              box.getSize(size);
              const center = new THREE.Vector3();
              box.getCenter(center);
              console.log('Ballerina model size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
              console.log('Ballerina model center:', center.x.toFixed(2), center.y.toFixed(2), center.z.toFixed(2));
              
              // Apply material to all meshes
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  // Use the loaded texture material
                  child.material = balerinaMaterial;
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
              
              console.log('Ballerina model mesh count:', obj.children.length);
              
              // The OBJ model is Y-up (standard Blender OBJ export)
              // Model height is on Y axis (1.38 units)
              // Target height: about 3.5 units to match the ride scale
              const targetHeight = 3.5;
              const modelHeight = size.y; // Y is up in the model
              const scale = targetHeight / modelHeight;
              obj.scale.set(scale, scale, scale);
              
              // Rotate to convert Y-up to Z-up (windmill local coords)
              // Rotate 90 degrees around X axis
              obj.rotation.x = Math.PI / 2;
              obj.rotation.y = 0;
              obj.rotation.z = 0;
              
              // After rotation: model's Y becomes Z, model's Z becomes -Y
              // Position so model's feet (bottom) are at innerHeight
              // Model center Y (0.69) becomes Z after rotation
              // Model bottom was at Y = center.y - size.y/2 = 0.69 - 0.69 = 0
              // After scale and rotation, model bottom is at Z = 0
              // We want feet at innerHeight (2.5)
              obj.position.set(
                0,  // Center X
                0,  // Center Y (was Z in model, now Y after rotation)
                innerHeight  // Bottom of model at skirt height
              );
              
              doll.add(obj);
              
              // Force update world matrix and log world position
              obj.updateWorldMatrix(true, true);
              const worldPos = new THREE.Vector3();
              obj.getWorldPosition(worldPos);
              console.log('Ballerina model added to scene at Z:', obj.position.z.toFixed(2));
              console.log('Ballerina world position:', worldPos.x.toFixed(2), worldPos.y.toFixed(2), worldPos.z.toFixed(2));
              console.log('Ballerina scale:', obj.scale.x.toFixed(2), obj.scale.y.toFixed(2), obj.scale.z.toFixed(2));
              console.log('Ballerina rotation (rad):', obj.rotation.x.toFixed(2), obj.rotation.y.toFixed(2), obj.rotation.z.toFixed(2));
            } catch (e) {
              console.warn('Error processing ballerina OBJ model, using fallback:', e);
              this.createFallbackBalerinaDoll(doll, innerHeight, innerRadius);
            }
          },
          (progress) => {
            if (progress.total > 0) {
              console.log(`Loading ballerina model: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
            }
          },
          (error) => {
            console.warn('Ballerina OBJ model not found, using fallback geometric doll:', error);
            this.createFallbackBalerinaDoll(doll, innerHeight, innerRadius);
          }
        );
      },
      undefined,
      (error) => {
        console.warn('Failed to load ballerina texture, using fallback material:', error);
        // Load model with fallback material
        this.objLoader.load(
          modelPath,
          (obj) => {
            obj.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.material = this.materials.dollDress;
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            
            // Scale and position
            const box = new THREE.Box3().setFromObject(obj);
            const size = new THREE.Vector3();
            box.getSize(size);
            const targetHeight = 3.5;
            const scale = targetHeight / size.z;
            obj.scale.set(scale, scale, scale);
            obj.position.set(0, 0, innerHeight + targetHeight / 2);
            
            doll.add(obj);
            console.log('Ballerina model added with fallback material');
          },
          undefined,
          () => this.createFallbackBalerinaDoll(doll, innerHeight, innerRadius)
        );
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
    
    // Hide the fallback doll for now (along with GLTF model)
    doll.traverse((child) => {
      child.visible = false;
    });
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
   * Create surrounding fairground structure
   * Includes: platform deck, back flash panels, stairs, loudspeakers
   */
  private createSurroundingStructure(): void {
    this.surroundingGroup = new THREE.Group();
    
    // Create the raised platform/deck where passengers walk
    this.createPlatformDeck();
    
    // Create decorative back flash panels (semicircle behind the ride)
    this.createBackFlashPanels();
    
    // Create access stairs
    this.createAccessStairs();
    
    // Create loudspeaker poles
    this.createLoudspeakers();
    
    // Create loudspeaker platforms on either side of the stairs
    this.createLoudspeakerPlatforms();
    
    this.scene.add(this.surroundingGroup);
  }
  
  /**
   * Create the raised platform deck where passengers walk
   * Extends slightly beyond the ride platform with wooden/metal decking
   */
  private createPlatformDeck(): void {
    // Deck must be large enough for windmill at max swing + walking space
    // Slightly smaller radius for tighter fit
    const deckRadius = this.platformRadius + this.windmillRadius + 1;  // Tighter deck area
    const deckHeight = this.DECK_HEIGHT;  // Raised platform
    const deckThickness = 0.15;
    
    // Main deck surface - larger octagonal/circular shape with rough metal
    const deckGeom = new THREE.CylinderGeometry(deckRadius, deckRadius + 0.2, deckThickness, 32);
    const deck = new THREE.Mesh(deckGeom, this.materials.deckMetal);
    deck.position.y = deckHeight;
    deck.receiveShadow = true;
    deck.castShadow = true;
    this.surroundingGroup!.add(deck);
    
    // Deck support structure (cylindrical base)
    const supportGeom = new THREE.CylinderGeometry(deckRadius + 0.2, deckRadius + 0.5, deckHeight, 32, 1, true);
    const support = new THREE.Mesh(supportGeom, this.materials.stairMetal);
    support.position.y = deckHeight / 2;
    support.receiveShadow = true;
    this.surroundingGroup!.add(support);
    
    // Decorative edge trim around deck
    const trimGeom = new THREE.TorusGeometry(deckRadius, 0.08, 8, 64);
    const trim = new THREE.Mesh(trimGeom, this.materials.chrome);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = deckHeight + deckThickness / 2;
    this.surroundingGroup!.add(trim);
    
    // Safety railing posts around the outer edge (except where stairs are)
    const railingHeight = 1.0;
    const postCount = 24;
    const stairAngle = Math.PI;  // Stairs at the back
    const stairWidth = Math.PI / 4;  // Width of stair opening
    
    for (let i = 0; i < postCount; i++) {
      const angle = (i / postCount) * Math.PI * 2;
      
      // Skip posts where stairs are
      if (Math.abs(angle - stairAngle) < stairWidth / 2 || 
          Math.abs(angle - stairAngle + Math.PI * 2) < stairWidth / 2) {
        continue;
      }
      
      const x = Math.cos(angle) * deckRadius;
      const z = Math.sin(angle) * deckRadius;
      
      // Railing post
      const postGeom = new THREE.CylinderGeometry(0.04, 0.04, railingHeight, 8);
      const post = new THREE.Mesh(postGeom, this.materials.chrome);
      post.position.set(x, deckHeight + railingHeight / 2, z);
      post.castShadow = true;
      this.surroundingGroup!.add(post);
      
      // Post top cap
      const capGeom = new THREE.SphereGeometry(0.06, 8, 8);
      const cap = new THREE.Mesh(capGeom, this.materials.chrome);
      cap.position.set(x, deckHeight + railingHeight, z);
      this.surroundingGroup!.add(cap);
    }
    
    // Horizontal railing bars
    const railBarRadius = deckRadius;
    for (let ring = 0; ring < 2; ring++) {
      const ringHeight = deckHeight + 0.4 + ring * 0.3;
      const railGeom = new THREE.TorusGeometry(railBarRadius, 0.025, 8, 64, Math.PI * 2 - stairWidth);
      const rail = new THREE.Mesh(railGeom, this.materials.chrome);
      rail.rotation.x = Math.PI / 2;
      rail.rotation.z = stairAngle + stairWidth / 2;  // Start after stair opening
      rail.position.y = ringHeight;
      this.surroundingGroup!.add(rail);
    }
  }
  
  /**
   * Create decorative back flash panels typical of fairground rides
   * Semicircular arrangement - fewer wider panels with no gaps
   * Panels extend directly from the platform edge
   */
  private createBackFlashPanels(): void {
    const panelGroup = new THREE.Group();
    
    const deckRadius = this.platformRadius + this.windmillRadius + 1;
    const baseRadius = deckRadius;  // Panels at the deck edge (no gap)
    const panelCount = 7;  // Fewer, wider panels
    const arcSpan = Math.PI * 0.85;  // Arc coverage
    const centerAngle = 0;  // Centered at front of ride
    
    // Calculate panel width to fill arc without gaps
    // Arc length = radius * angle, divided by panel count
    const arcLength = baseRadius * arcSpan;
    const panelWidth = (arcLength / panelCount) + 0.3;  // Slight overlap to ensure no gaps
    
    const panelHeight = 8.25;  // 50% taller (was 5.5)
    const panelDepth = 0.3;
    const deckHeight = this.DECK_HEIGHT;
    
    for (let i = 0; i < panelCount; i++) {
      const t = (i - (panelCount - 1) / 2) / ((panelCount - 1) / 2);  // -1 to 1
      const angle = centerAngle + t * (arcSpan / 2);
      
      const x = Math.cos(angle) * baseRadius;
      const z = Math.sin(angle) * baseRadius;
      
      // Main panel backing - alternating pink and white
      const panelGeom = new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth);
      const panelMaterial = i % 2 === 0 ? this.materials.flashPanelPink : this.materials.flashPanelWhite;
      const panel = new THREE.Mesh(panelGeom, panelMaterial);
      panel.position.set(x, deckHeight + panelHeight / 2, z);
      panel.rotation.y = -angle + Math.PI / 2;  // Face inward
      panel.castShadow = true;
      panel.receiveShadow = true;
      panelGroup.add(panel);
      
      // Ornate top piece (crown)
      const crownGeom = new THREE.BoxGeometry(panelWidth + 0.4, 0.8, panelDepth + 0.1);
      const crown = new THREE.Mesh(crownGeom, this.materials.flashPanelGold);
      crown.position.set(x, deckHeight + panelHeight + 0.3, z);
      crown.rotation.y = -angle + Math.PI / 2;
      panelGroup.add(crown);
      
      // Decorative spire on top
      const spireGeom = new THREE.ConeGeometry(0.25, 1.0, 8);
      const spire = new THREE.Mesh(spireGeom, this.materials.flashPanelGold);
      spire.position.set(x, deckHeight + panelHeight + 1.0, z);
      panelGroup.add(spire);
      
      // Side frames removed - panels touch each other in the arc, frames looked misaligned
    }
    
    // Center arch/banner at the top (no lights)
    const archRadius = baseRadius - 0.3;
    const archHeight = deckHeight + panelHeight + 1.5;
    
    // Banner text backing (simplified arch shape)
    const bannerGeom = new THREE.BoxGeometry(6, 1.2, 0.2);
    const banner = new THREE.Mesh(bannerGeom, this.materials.flashPanelGold);
    banner.position.set(archRadius, archHeight, 0);
    banner.rotation.y = Math.PI / 2;
    panelGroup.add(banner);
    
    this.surroundingGroup!.add(panelGroup);
  }
  
  /**
   * Create operator control cabin
   * Positioned at the side of the platform
   */
  private createControlCabin(): void {
    const cabinGroup = new THREE.Group();
    
    const cabinWidth = 2.5;
    const cabinDepth = 2.0;
    const cabinHeight = 2.5;
    const deckHeight = this.DECK_HEIGHT;
    const deckRadius = this.platformRadius + this.windmillRadius + 1;
    
    // Position cabin at side of platform, at the deck edge
    const cabinAngle = Math.PI * 0.6;  // Left side
    const cabinRadius = deckRadius - 2.0;  // Inside the deck edge
    const cabinX = Math.cos(cabinAngle) * cabinRadius;
    const cabinZ = Math.sin(cabinAngle) * cabinRadius;
    
    // Cabin base/floor
    const floorGeom = new THREE.BoxGeometry(cabinWidth, 0.15, cabinDepth);
    const floor = new THREE.Mesh(floorGeom, this.materials.stairMetal);
    floor.position.set(cabinX, deckHeight + 0.08, cabinZ);
    floor.rotation.y = -cabinAngle + Math.PI / 2;
    cabinGroup.add(floor);
    
    // Cabin walls (3 walls, front is open with window)
    const wallThickness = 0.1;
    
    // Back wall
    const backWallGeom = new THREE.BoxGeometry(cabinWidth, cabinHeight, wallThickness);
    const backWall = new THREE.Mesh(backWallGeom, this.materials.controlCabin);
    backWall.position.set(
      cabinX - Math.sin(cabinAngle) * (cabinDepth / 2 - wallThickness / 2),
      deckHeight + cabinHeight / 2,
      cabinZ + Math.cos(cabinAngle) * (cabinDepth / 2 - wallThickness / 2)
    );
    backWall.rotation.y = -cabinAngle + Math.PI / 2;
    backWall.castShadow = true;
    cabinGroup.add(backWall);
    
    // Left wall
    const sideWallGeom = new THREE.BoxGeometry(wallThickness, cabinHeight, cabinDepth);
    const leftWall = new THREE.Mesh(sideWallGeom, this.materials.controlCabin);
    leftWall.position.set(
      cabinX - Math.cos(cabinAngle) * (cabinWidth / 2 - wallThickness / 2),
      deckHeight + cabinHeight / 2,
      cabinZ - Math.sin(cabinAngle) * (cabinWidth / 2 - wallThickness / 2)
    );
    leftWall.rotation.y = -cabinAngle + Math.PI / 2;
    leftWall.castShadow = true;
    cabinGroup.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeom, this.materials.controlCabin);
    rightWall.position.set(
      cabinX + Math.cos(cabinAngle) * (cabinWidth / 2 - wallThickness / 2),
      deckHeight + cabinHeight / 2,
      cabinZ + Math.sin(cabinAngle) * (cabinWidth / 2 - wallThickness / 2)
    );
    rightWall.rotation.y = -cabinAngle + Math.PI / 2;
    rightWall.castShadow = true;
    cabinGroup.add(rightWall);
    
    // Front window frame (lower portion is solid counter)
    const counterHeight = 1.0;
    const counterGeom = new THREE.BoxGeometry(cabinWidth, counterHeight, wallThickness);
    const counter = new THREE.Mesh(counterGeom, this.materials.controlCabin);
    counter.position.set(
      cabinX + Math.sin(cabinAngle) * (cabinDepth / 2 - wallThickness / 2),
      deckHeight + counterHeight / 2,
      cabinZ - Math.cos(cabinAngle) * (cabinDepth / 2 - wallThickness / 2)
    );
    counter.rotation.y = -cabinAngle + Math.PI / 2;
    cabinGroup.add(counter);
    
    // Window glass
    const windowHeight = cabinHeight - counterHeight - 0.3;
    const windowGeom = new THREE.BoxGeometry(cabinWidth - 0.3, windowHeight, 0.05);
    const window = new THREE.Mesh(windowGeom, this.materials.controlCabinGlass);
    window.position.set(
      cabinX + Math.sin(cabinAngle) * (cabinDepth / 2 - wallThickness / 2),
      deckHeight + counterHeight + windowHeight / 2 + 0.1,
      cabinZ - Math.cos(cabinAngle) * (cabinDepth / 2 - wallThickness / 2)
    );
    window.rotation.y = -cabinAngle + Math.PI / 2;
    cabinGroup.add(window);
    
    // Roof
    const roofGeom = new THREE.BoxGeometry(cabinWidth + 0.4, 0.15, cabinDepth + 0.4);
    const roof = new THREE.Mesh(roofGeom, this.materials.controlCabin);
    roof.position.set(cabinX, deckHeight + cabinHeight + 0.08, cabinZ);
    roof.rotation.y = -cabinAngle + Math.PI / 2;
    roof.castShadow = true;
    cabinGroup.add(roof);
    
    // Roof overhang trim
    const roofTrimGeom = new THREE.BoxGeometry(cabinWidth + 0.6, 0.08, cabinDepth + 0.6);
    const roofTrim = new THREE.Mesh(roofTrimGeom, this.materials.flashPanelGold);
    roofTrim.position.set(cabinX, deckHeight + cabinHeight + 0.2, cabinZ);
    roofTrim.rotation.y = -cabinAngle + Math.PI / 2;
    cabinGroup.add(roofTrim);
    
    // Control panel (on counter)
    const panelGeom = new THREE.BoxGeometry(1.5, 0.3, 0.4);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.3,
      roughness: 0.6,
    });
    const controlPanel = new THREE.Mesh(panelGeom, panelMat);
    controlPanel.position.set(
      cabinX + Math.sin(cabinAngle) * (cabinDepth / 2 - 0.4),
      deckHeight + counterHeight + 0.15,
      cabinZ - Math.cos(cabinAngle) * (cabinDepth / 2 - 0.4)
    );
    controlPanel.rotation.y = -cabinAngle + Math.PI / 2;
    controlPanel.rotation.x = -0.3;  // Angled toward operator
    cabinGroup.add(controlPanel);
    
    // Indicator lights on panel
    const indicatorColors = [0x00ff00, 0xffff00, 0xff0000];
    for (let i = 0; i < 3; i++) {
      const indicatorGeom = new THREE.SphereGeometry(0.05, 8, 8);
      const indicatorMat = new THREE.MeshStandardMaterial({
        color: indicatorColors[i],
        emissive: indicatorColors[i],
        emissiveIntensity: 0.8,
      });
      const indicator = new THREE.Mesh(indicatorGeom, indicatorMat);
      const offsetX = (i - 1) * 0.2;
      indicator.position.set(
        cabinX + Math.sin(cabinAngle) * (cabinDepth / 2 - 0.3) + Math.cos(cabinAngle) * offsetX,
        deckHeight + counterHeight + 0.35,
        cabinZ - Math.cos(cabinAngle) * (cabinDepth / 2 - 0.3) + Math.sin(cabinAngle) * offsetX
      );
      cabinGroup.add(indicator);
    }
    
    this.surroundingGroup!.add(cabinGroup);
  }
  
  /**
   * Create access stairs leading up to the platform
   */
  private createAccessStairs(): void {
    const stairGroup = new THREE.Group();
    
    const deckHeight = this.DECK_HEIGHT;
    const deckRadius = this.platformRadius + this.windmillRadius + 1;
    const stairAngle = Math.PI;  // Stairs at the back
    
    const stepCount = 4;
    const stepWidth = 2.5;
    const stepDepth = 0.35;
    const stepHeight = deckHeight / stepCount;
    const stepThickness = 0.08;
    
    // Calculate stair direction
    const stairDirX = Math.cos(stairAngle);
    const stairDirZ = Math.sin(stairAngle);
    
    // Starting position (at deck edge)
    const startX = Math.cos(stairAngle) * deckRadius;
    const startZ = Math.sin(stairAngle) * deckRadius;
    
    for (let i = 0; i < stepCount; i++) {
      const stepY = deckHeight - (i + 1) * stepHeight;
      const stepX = startX + stairDirX * (i + 0.5) * stepDepth;
      const stepZ = startZ + stairDirZ * (i + 0.5) * stepDepth;
      
      // Step tread (top surface)
      const treadGeom = new THREE.BoxGeometry(stepWidth, stepThickness, stepDepth);
      const tread = new THREE.Mesh(treadGeom, this.materials.stairMetal);
      tread.position.set(stepX, stepY + stepHeight / 2, stepZ);
      tread.rotation.y = stairAngle + Math.PI / 2;
      tread.receiveShadow = true;
      tread.castShadow = true;
      stairGroup.add(tread);
      
      // Step riser (vertical face)
      const riserGeom = new THREE.BoxGeometry(stepWidth, stepHeight - stepThickness, stepThickness / 2);
      const riser = new THREE.Mesh(riserGeom, this.materials.stairMetal);
      riser.position.set(
        stepX - stairDirX * (stepDepth / 2 - stepThickness / 4),
        stepY + (stepHeight - stepThickness) / 2,
        stepZ - stairDirZ * (stepDepth / 2 - stepThickness / 4)
      );
      riser.rotation.y = stairAngle + Math.PI / 2;
      stairGroup.add(riser);
      
      // Anti-slip grip strip
      const gripGeom = new THREE.BoxGeometry(stepWidth - 0.2, 0.02, stepDepth - 0.1);
      const grip = new THREE.Mesh(gripGeom, this.materials.stairRubber);
      grip.position.set(stepX, stepY + stepHeight / 2 + stepThickness / 2 + 0.01, stepZ);
      grip.rotation.y = stairAngle + Math.PI / 2;
      stairGroup.add(grip);
    }
    
    // Stair handrails
    const railHeight = 0.9;
    const railWidth = stepWidth / 2 + 0.2;
    const railLength = stepCount * stepDepth + 0.5;
    const railAngle = Math.atan2(deckHeight, stepCount * stepDepth);  // Angle of stair slope
    
    for (const side of [-1, 1]) {
      // Handrail posts (bottom)
      const bottomPostGeom = new THREE.CylinderGeometry(0.04, 0.04, railHeight, 8);
      const bottomPost = new THREE.Mesh(bottomPostGeom, this.materials.chrome);
      bottomPost.position.set(
        startX + stairDirX * (stepCount * stepDepth) - stairDirZ * side * railWidth,
        railHeight / 2,
        startZ + stairDirZ * (stepCount * stepDepth) + stairDirX * side * railWidth
      );
      stairGroup.add(bottomPost);
      
      // Handrail posts (top)
      const topPostGeom = new THREE.CylinderGeometry(0.04, 0.04, railHeight, 8);
      const topPost = new THREE.Mesh(topPostGeom, this.materials.chrome);
      topPost.position.set(
        startX - stairDirZ * side * railWidth,
        deckHeight + railHeight / 2,
        startZ + stairDirX * side * railWidth
      );
      stairGroup.add(topPost);
      
      // Sloped handrail bar
      const railBarLength = Math.sqrt(railLength * railLength + deckHeight * deckHeight);
      const railBarGeom = new THREE.CylinderGeometry(0.035, 0.035, railBarLength, 8);
      const railBar = new THREE.Mesh(railBarGeom, this.materials.chrome);
      
      const railMidX = startX + stairDirX * (stepCount * stepDepth / 2) - stairDirZ * side * railWidth;
      const railMidZ = startZ + stairDirZ * (stepCount * stepDepth / 2) + stairDirX * side * railWidth;
      const railMidY = deckHeight / 2 + railHeight;
      
      railBar.position.set(railMidX, railMidY, railMidZ);
      railBar.rotation.z = railAngle;
      railBar.rotation.y = stairAngle + Math.PI / 2;
      stairGroup.add(railBar);
      
      // Post caps
      const capGeom = new THREE.SphereGeometry(0.06, 8, 8);
      const bottomCap = new THREE.Mesh(capGeom, this.materials.chrome);
      bottomCap.position.set(
        startX + stairDirX * (stepCount * stepDepth) - stairDirZ * side * railWidth,
        railHeight,
        startZ + stairDirZ * (stepCount * stepDepth) + stairDirX * side * railWidth
      );
      stairGroup.add(bottomCap);
      
      const topCap = new THREE.Mesh(capGeom, this.materials.chrome);
      topCap.position.set(
        startX - stairDirZ * side * railWidth,
        deckHeight + railHeight,
        startZ + stairDirX * side * railWidth
      );
      stairGroup.add(topCap);
    }
    
    // Landing platform at bottom of stairs
    const landingGeom = new THREE.BoxGeometry(stepWidth + 0.6, 0.1, 1.5);
    const landing = new THREE.Mesh(landingGeom, this.materials.stairMetal);
    landing.position.set(
      startX + stairDirX * (stepCount * stepDepth + 0.75),
      0.05,
      startZ + stairDirZ * (stepCount * stepDepth + 0.75)
    );
    landing.rotation.y = stairAngle + Math.PI / 2;
    landing.receiveShadow = true;
    stairGroup.add(landing);
    
    this.surroundingGroup!.add(stairGroup);
  }
  
  /**
   * Create loudspeaker poles around the ride
   */
  private createLoudspeakers(): void {
    const speakerGroup = new THREE.Group();
    
    const deckRadius = this.platformRadius + this.windmillRadius + 1;
    const deckHeight = this.DECK_HEIGHT;
    const poleHeight = 5.0;  // Pole height
    
    // Place 4 loudspeaker poles around the ride
    const speakerAngles = [
      Math.PI * 0.2,    // Front-right
      -Math.PI * 0.2,   // Front-left
      Math.PI * 0.7,    // Back-right
      -Math.PI * 0.7,   // Back-left
    ];
    
    for (const angle of speakerAngles) {
      const x = Math.cos(angle) * (deckRadius - 0.5);
      const z = Math.sin(angle) * (deckRadius - 0.5);
      
      // Pole
      const poleGeom = new THREE.CylinderGeometry(0.08, 0.1, poleHeight, 8);
      const pole = new THREE.Mesh(poleGeom, this.materials.chrome);
      pole.position.set(x, deckHeight + poleHeight / 2, z);
      pole.castShadow = true;
      speakerGroup.add(pole);
      
      // Pole base
      const baseGeom = new THREE.CylinderGeometry(0.15, 0.2, 0.15, 8);
      const base = new THREE.Mesh(baseGeom, this.materials.stairMetal);
      base.position.set(x, deckHeight + 0.08, z);
      speakerGroup.add(base);
      
      // Speaker horn (conical)
      const hornGeom = new THREE.ConeGeometry(0.35, 0.5, 8, 1, true);
      const horn = new THREE.Mesh(hornGeom, this.materials.loudspeaker);
      horn.position.set(x, deckHeight + poleHeight - 0.3, z);
      horn.rotation.x = Math.PI;  // Opening faces down-outward
      horn.rotation.z = -angle + Math.PI;  // Point outward
      speakerGroup.add(horn);
      
      // Speaker mounting bracket
      const bracketGeom = new THREE.BoxGeometry(0.15, 0.15, 0.3);
      const bracket = new THREE.Mesh(bracketGeom, this.materials.stairMetal);
      bracket.position.set(
        x + Math.cos(angle) * 0.15,
        deckHeight + poleHeight - 0.5,
        z + Math.sin(angle) * 0.15
      );
      bracket.rotation.y = -angle;
      speakerGroup.add(bracket);
      
      // Second horn (horn pair)
      const horn2 = new THREE.Mesh(hornGeom, this.materials.loudspeaker);
      horn2.position.set(
        x + Math.cos(angle) * 0.1,
        deckHeight + poleHeight - 0.7,
        z + Math.sin(angle) * 0.1
      );
      horn2.rotation.x = Math.PI + 0.3;  // Slight downward angle
      horn2.rotation.z = -angle + Math.PI;
      speakerGroup.add(horn2);
      
      // Decorative light on top of pole
      const topLightGeom = new THREE.SphereGeometry(0.12, 8, 8);
      const topLightMat = new THREE.MeshStandardMaterial({
        color: 0xffffcc,
        emissive: 0xffaa44,
        emissiveIntensity: 1.0,
      });
      const topLight = new THREE.Mesh(topLightGeom, topLightMat);
      topLight.position.set(x, deckHeight + poleHeight + 0.15, z);
      speakerGroup.add(topLight);
      this.flashPanelLights.push(topLight);
      
      // Add point light for glow
      const pointLight = new THREE.PointLight(0xffaa44, 0.4, 6, 2);
      pointLight.position.set(x, deckHeight + poleHeight + 0.2, z);
      speakerGroup.add(pointLight);
      this.flashPanelPointLights.push(pointLight);
      
      // Create two reflector lights per pole pointing at the platform
      const reflectorMountHeight = deckHeight + poleHeight * 0.6;
      const reflectorColors = [
        this.poleReflectorColors[speakerAngles.indexOf(angle) * 2],
        this.poleReflectorColors[speakerAngles.indexOf(angle) * 2 + 1]
      ];
      
      for (let r = 0; r < 2; r++) {
        const reflectorColor = reflectorColors[r];
        const reflectorOffsetAngle = (r === 0 ? 0.15 : -0.15);  // Slight angle offset for each reflector
        const reflectorY = reflectorMountHeight + (r === 0 ? 0.3 : -0.3);  // Vertical offset
        
        // Calculate position
        const reflectorX = x - Math.cos(angle) * 0.2;
        const reflectorZ = z - Math.sin(angle) * 0.2;
        
        // Reflector housing (cylindrical lamp housing)
        const housingGeom = new THREE.CylinderGeometry(0.15, 0.2, 0.35, 12);
        const housingMat = new THREE.MeshStandardMaterial({
          color: 0x111111,
          metalness: 0.9,
          roughness: 0.2
        });
        const housing = new THREE.Mesh(housingGeom, housingMat);
        housing.position.set(reflectorX, reflectorY, reflectorZ);
        // Point housing toward center
        housing.lookAt(0, 2, 0);
        housing.rotateX(Math.PI / 2);
        speakerGroup.add(housing);
        
        // Reflector lens (glowing part)
        const lensGeom = new THREE.CircleGeometry(0.1, 16);
        const lensMat = new THREE.MeshStandardMaterial({
          color: reflectorColor,
          emissive: reflectorColor,
          emissiveIntensity: 4.0,  // Bright glow
          side: THREE.DoubleSide
        });
        const lens = new THREE.Mesh(lensGeom, lensMat);
        const lensX = x - Math.cos(angle) * 0.05;
        const lensZ = z - Math.sin(angle) * 0.05;
        lens.position.set(lensX, reflectorY, lensZ);
        lens.lookAt(0, 2, 0);
        speakerGroup.add(lens);
        
        // Calculate beam length (distance to platform center)
        const distToCenter = Math.sqrt(lensX * lensX + lensZ * lensZ);
        const beamLength = distToCenter * 1.1;  // Long beam that reaches past center
        
        // Create visible light beam cone (narrow at source, wide at target)
        // Using CylinderGeometry: (radiusTop, radiusBottom, height)
        // After lookAt + rotateX, the "top" points toward target, so:
        // radiusTop = large (at platform/target), radiusBottom = small (at reflector)
        const beamGeom = new THREE.CylinderGeometry(1.8, 0.08, beamLength, 12, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
          color: reflectorColor,
          transparent: true,
          opacity: 0.04,  // Very subtle - much more transparent
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,  // Additive for glow effect
          depthWrite: false  // Prevent z-fighting
        });
        const beam = new THREE.Mesh(beamGeom, beamMat);
        
        // Calculate target position on the skirt/platform
        const targetPos = new THREE.Vector3(0, 2.5, 0);
        
        // Calculate beam direction vector
        const beamDir = new THREE.Vector3(
          targetPos.x - lensX,
          targetPos.y - reflectorY,
          targetPos.z - lensZ
        ).normalize();
        
        // Position beam so the narrow end starts at the lens
        // Cylinder is centered, so offset by half the beam length along beam direction
        beam.position.set(
          lensX + beamDir.x * (beamLength / 2),
          reflectorY + beamDir.y * (beamLength / 2),
          lensZ + beamDir.z * (beamLength / 2)
        );
        
        // Point beam toward platform center
        beam.lookAt(targetPos);
        beam.rotateX(Math.PI / 2);  // Align cylinder axis with beam direction
        
        speakerGroup.add(beam);
        
        // SpotLight for actual lighting effect - very high intensity
        const spotLight = new THREE.SpotLight(
          reflectorColor, 
          70,           // Very high intensity for dramatic lighting
          30,           // Good distance
          Math.PI / 10, // Narrower angle for focused beam
          0.4,          // Soft penumbra
          1.0           // Normal decay
        );
        spotLight.position.set(lensX, reflectorY, lensZ);
        spotLight.target.position.set(0, 2, 0);
        speakerGroup.add(spotLight);
        speakerGroup.add(spotLight.target);
        
        // Store reference for animation
        this.poleReflectors.push({
          mesh: lens,
          light: spotLight,
          beam: beam,
          color: reflectorColor
        });
      }
      
      // Add strobe reflector on the front-right pole only (first pole)
      if (speakerAngles.indexOf(angle) === 0) {
        this.createStroboReflectorOnPole(speakerGroup, x, z, deckHeight, poleHeight, angle);
      }
    }
    
    this.surroundingGroup!.add(speakerGroup);
  }
  
  /**
   * Create loudspeaker platforms on either side of the stairs
   * Each platform holds a 3D loudspeaker model loaded from GLTF
   */
  private createLoudspeakerPlatforms(): void {
    const deckRadius = this.platformRadius + this.windmillRadius + 1;
    const deckHeight = this.DECK_HEIGHT;
    const stairAngle = Math.PI;  // Stairs at the back
    
    // Platform dimensions
    const platformWidth = 2.0;
    const platformDepth = 2.0;
    const platformHeight = 0.2;
    const platformBaseHeight = 0.8;  // Height of the platform base from ground
    
    // Offset from stairs center (left and right)
    const stairOffset = 2.8;  // Distance from stair center to platform center
    const distanceFromDeck = 1.8;  // Distance outward from deck edge
    
    // Calculate positions for left and right platforms
    const platformPositions = [
      { side: 'left', offsetAngle: Math.PI / 2 },   // Left of stairs
      { side: 'right', offsetAngle: -Math.PI / 2 }, // Right of stairs
    ];
    
    for (const { side, offsetAngle } of platformPositions) {
      const platformGroup = new THREE.Group();
      
      // Calculate platform position (next to stairs, at ground level)
      const stairDirX = Math.cos(stairAngle);
      const stairDirZ = Math.sin(stairAngle);
      const sideOffsetX = Math.cos(stairAngle + offsetAngle) * stairOffset;
      const sideOffsetZ = Math.sin(stairAngle + offsetAngle) * stairOffset;
      
      // Position platform at ground level, beside the stairs
      const baseX = stairDirX * (deckRadius + distanceFromDeck) + sideOffsetX;
      const baseZ = stairDirZ * (deckRadius + distanceFromDeck) + sideOffsetZ;
      
      // Platform rotation (90 degrees around Y-axis)
      const platformRotation = Math.PI / 2;
      
      // Platform base (raised pedestal)
      const baseGeom = new THREE.BoxGeometry(platformWidth + 0.3, platformBaseHeight, platformDepth + 0.3);
      const base = new THREE.Mesh(baseGeom, this.materials.stairMetal);
      base.position.set(baseX, platformBaseHeight / 2, baseZ);
      base.rotation.y = platformRotation;
      base.castShadow = true;
      base.receiveShadow = true;
      platformGroup.add(base);
      
      // Platform top surface
      const topGeom = new THREE.BoxGeometry(platformWidth, platformHeight, platformDepth);
      const top = new THREE.Mesh(topGeom, this.materials.deckMetal);
      top.position.set(baseX, platformBaseHeight + platformHeight / 2, baseZ);
      top.rotation.y = platformRotation;
      top.castShadow = true;
      top.receiveShadow = true;
      platformGroup.add(top);
      
      // Decorative edge trim
      const trimGeom = new THREE.BoxGeometry(platformWidth + 0.1, 0.05, platformDepth + 0.1);
      const trim = new THREE.Mesh(trimGeom, this.materials.chrome);
      trim.position.set(baseX, platformBaseHeight + platformHeight + 0.025, baseZ);
      trim.rotation.y = platformRotation;
      platformGroup.add(trim);
      
      // Corner posts (rotated 90 degrees with platform)
      const postHeight = 1.2;
      const postRadius = 0.06;
      // After 90 degree rotation: dx becomes dz, dz becomes -dx
      const corners = [
        { dx: platformDepth / 2 - 0.1, dz: -(platformWidth / 2 - 0.1) },
        { dx: -(platformDepth / 2 - 0.1), dz: -(platformWidth / 2 - 0.1) },
        { dx: platformDepth / 2 - 0.1, dz: (platformWidth / 2 - 0.1) },
        { dx: -(platformDepth / 2 - 0.1), dz: (platformWidth / 2 - 0.1) },
      ];
      
      for (const corner of corners) {
        const postGeom = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);
        const post = new THREE.Mesh(postGeom, this.materials.chrome);
        post.position.set(
          baseX + corner.dx,
          platformBaseHeight + platformHeight + postHeight / 2,
          baseZ + corner.dz
        );
        post.castShadow = true;
        platformGroup.add(post);
        
        // Post cap
        const capGeom = new THREE.SphereGeometry(postRadius * 1.3, 8, 8);
        const cap = new THREE.Mesh(capGeom, this.materials.chrome);
        cap.position.set(
          baseX + corner.dx,
          platformBaseHeight + platformHeight + postHeight,
          baseZ + corner.dz
        );
        platformGroup.add(cap);
      }
      
      // Load two loudspeaker GLTF models per platform
      // Raise speakers above platform surface to prevent clipping
      const speakerY = platformBaseHeight + platformHeight + 0.5;
      
      // Calculate angle facing away from the ballerina (center of ride)
      // The ballerina is at the center (0, 0), so we face outward from center
      const faceAwayAngle = Math.atan2(baseZ, baseX);
      
      // Spacing between the two loudspeakers (side by side)
      const speakerSpacing = 0.7;  // Distance between speaker centers
      
      // Calculate offset for side-by-side placement aligned with rotated platform
      // Platform is rotated 90 degrees, so speakers are placed along the face-away direction
      const offsetX = Math.cos(faceAwayAngle) * speakerSpacing / 2;
      const offsetZ = Math.sin(faceAwayAngle) * speakerSpacing / 2;
      
      // Left speaker
      this.loadLoudspeakerModel(
        platformGroup, 
        baseX - offsetX, 
        speakerY, 
        baseZ - offsetZ, 
        faceAwayAngle
      );
      
      // Right speaker
      this.loadLoudspeakerModel(
        platformGroup, 
        baseX + offsetX, 
        speakerY, 
        baseZ + offsetZ, 
        faceAwayAngle
      );
      
      this.surroundingGroup!.add(platformGroup);
    }
  }
  
  /**
   * Create strobe reflector on the loudspeaker pole
   * Positioned above the other reflectors, pointing at the ballerina
   * EXTREMELY INTENSE when active - dominates the scene
   */
  private createStroboReflectorOnPole(
    parentGroup: THREE.Group,
    poleX: number,
    poleZ: number,
    deckHeight: number,
    poleHeight: number,
    poleAngle: number
  ): void {
    // Position strobe above the other reflectors on the pole
    const strobeY = deckHeight + poleHeight * 0.85;  // Higher than the colored reflectors
    
    // Offset slightly from pole center toward the ride
    const strobeX = poleX - Math.cos(poleAngle) * 0.25;
    const strobeZ = poleZ - Math.sin(poleAngle) * 0.25;
    
    // Reflector housing (larger, more prominent)
    const housingRadius = 0.2;
    const housingHeight = 0.15;
    const housingGeom = new THREE.CylinderGeometry(housingRadius, housingRadius * 1.2, housingHeight, 16);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.9,
      roughness: 0.2,
    });
    const housing = new THREE.Mesh(housingGeom, housingMat);
    housing.position.set(strobeX, strobeY, strobeZ);
    
    // Rotate housing to face the ballerina (center)
    housing.lookAt(0, strobeY, 0);
    housing.rotateX(Math.PI / 2);
    housing.castShadow = true;
    parentGroup.add(housing);
    
    // Large reflector lens - this will flash brilliantly
    const lensRadius = 0.18;
    const lensGeom = new THREE.CircleGeometry(lensRadius, 24);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0,  // Off by default
      side: THREE.DoubleSide,
    });
    const lens = new THREE.Mesh(lensGeom, lensMat);
    
    // Position lens on the face of the housing, pointing at ballerina
    const lensOffsetX = -Math.cos(poleAngle) * 0.08;
    const lensOffsetZ = -Math.sin(poleAngle) * 0.08;
    lens.position.set(strobeX + lensOffsetX, strobeY, strobeZ + lensOffsetZ);
    lens.lookAt(0, 3, 0);  // Point at ballerina height
    parentGroup.add(lens);
    
    // Mounting bracket to pole
    const bracketGeom = new THREE.BoxGeometry(0.08, 0.08, 0.3);
    const bracket = new THREE.Mesh(bracketGeom, this.materials.stairMetal);
    bracket.position.set(
      (poleX + strobeX) / 2,
      strobeY,
      (poleZ + strobeZ) / 2
    );
    bracket.lookAt(poleX, strobeY, poleZ);
    parentGroup.add(bracket);
    
    // Create massive visible light beam when active
    const beamLength = 25;  // Long beam to reach ballerina
    const beamGeom = new THREE.CylinderGeometry(4, 0.15, beamLength, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,  // Off by default
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeom, beamMat);
    beam.position.set(strobeX, strobeY, strobeZ);
    beam.lookAt(0, 3, 0);
    beam.rotateX(Math.PI / 2);
    beam.translateY(beamLength / 2);
    beam.visible = false;
    parentGroup.add(beam);
    
    // EXTREMELY powerful spotlight - will dominate the scene
    const strobeLight = new THREE.SpotLight(
      0xffffff,     // Pure white
      0,            // Off by default
      50,           // Long range
      Math.PI / 6,  // Focused cone
      0.3,          // Soft edge
      0.5           // Slow falloff
    );
    strobeLight.position.set(strobeX, strobeY, strobeZ);
    strobeLight.target.position.set(0, 3, 0);  // Target ballerina
    strobeLight.castShadow = true;
    strobeLight.shadow.mapSize.width = 1024;
    strobeLight.shadow.mapSize.height = 1024;
    parentGroup.add(strobeLight);
    parentGroup.add(strobeLight.target);
    
    // Store reference for animation (including beam)
    this.stroboReflector = {
      mesh: housing,
      light: strobeLight,
      lens: lens,
      beam: beam,
    };
  }
  
  /**
   * Load loudspeaker 3D model from GLTF file
   * Falls back to a simple geometric speaker if model not found
   */
  private loadLoudspeakerModel(
    parentGroup: THREE.Group,
    x: number,
    y: number,
    z: number,
    faceAngle: number
  ): void {
    const modelPath = '/models/loudspeaker/scene.gltf';
    
    this.gltfLoader.load(
      modelPath,
      (gltf) => {
        try {
          console.log('Loudspeaker model loaded successfully');
          const model = gltf.scene;
          
          // Scale and position the model
          // The Sketchfab loudspeaker model is quite small, so scale it up
          // to be prominent on the platforms (about 1.5m tall)
          model.scale.set(2.5, 2.5, 2.5);
          model.position.set(x, y, z);
          
          // Face the model away from the ballerina (outward from ride center)
          // faceAngle is already calculated to point away from center
          model.rotation.y = faceAngle;
          
          // Enable shadows on all meshes
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          
          parentGroup.add(model);
        } catch (e) {
          console.warn('Error processing loudspeaker model, using fallback:', e);
          this.createFallbackLoudspeaker(parentGroup, x, y, z, faceAngle);
        }
      },
      undefined,
      (error) => {
        console.warn('Could not load loudspeaker model, using fallback geometry:', error);
        this.createFallbackLoudspeaker(parentGroup, x, y, z, faceAngle);
      }
    );
  }
  
  /**
   * Create a fallback loudspeaker using simple geometry
   * Used when GLTF model fails to load
   */
  private createFallbackLoudspeaker(
    parentGroup: THREE.Group,
    x: number,
    y: number,
    z: number,
    faceAngle: number
  ): void {
    const speakerGroup = new THREE.Group();
    
    // Speaker cabinet (main box)
    const cabinetWidth = 0.6;
    const cabinetHeight = 1.0;
    const cabinetDepth = 0.5;
    
    const cabinetGeom = new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth);
    const cabinetMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.1,
      roughness: 0.8,
    });
    const cabinet = new THREE.Mesh(cabinetGeom, cabinetMat);
    cabinet.position.set(0, cabinetHeight / 2, 0);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    speakerGroup.add(cabinet);
    
    // Speaker cone (woofer)
    const wooferRadius = 0.2;
    const wooferGeom = new THREE.CylinderGeometry(wooferRadius * 0.3, wooferRadius, 0.08, 16);
    const wooferMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.2,
      roughness: 0.6,
    });
    const woofer = new THREE.Mesh(wooferGeom, wooferMat);
    woofer.rotation.x = Math.PI / 2;
    woofer.position.set(0, cabinetHeight * 0.35, cabinetDepth / 2 + 0.04);
    speakerGroup.add(woofer);
    
    // Tweeter (smaller cone)
    const tweeterRadius = 0.08;
    const tweeterGeom = new THREE.CylinderGeometry(tweeterRadius * 0.3, tweeterRadius, 0.04, 12);
    const tweeter = new THREE.Mesh(tweeterGeom, wooferMat);
    tweeter.rotation.x = Math.PI / 2;
    tweeter.position.set(0, cabinetHeight * 0.7, cabinetDepth / 2 + 0.02);
    speakerGroup.add(tweeter);
    
    // Woofer ring (chrome accent)
    const ringGeom = new THREE.TorusGeometry(wooferRadius, 0.015, 8, 24);
    const ring = new THREE.Mesh(ringGeom, this.materials.chrome);
    ring.position.set(0, cabinetHeight * 0.35, cabinetDepth / 2 + 0.01);
    speakerGroup.add(ring);
    
    // Speaker grill (mesh pattern - simplified as a plane)
    const grillGeom = new THREE.PlaneGeometry(cabinetWidth - 0.1, cabinetHeight - 0.15);
    const grillMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.3,
      roughness: 0.7,
      transparent: true,
      opacity: 0.8,
    });
    const grill = new THREE.Mesh(grillGeom, grillMat);
    grill.position.set(0, cabinetHeight / 2, cabinetDepth / 2 + 0.001);
    speakerGroup.add(grill);
    
    // Position and rotate the speaker group
    speakerGroup.position.set(x, y, z);
    speakerGroup.rotation.y = faceAngle;
    
    parentGroup.add(speakerGroup);
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
   * Create underskirt lights - similar to skirt lights but:
   * - Positioned on the underside of the skirt
   * - Only extend to 2/3 of skirt radius
   * - Very dim (low emissive intensity)
   * - Always lit (no animation)
   */
  private createUnderskirtLights(): void {
    const numColumns = 16;  // Match overskirt columns
    const bulbsPerColumn = 7;  // Fewer bulbs since only 2/3 radius
    const innerRadius = 1.8;
    const outerRadius = this.windmillRadius;
    const innerHeight = 2.5;  // Match skirt cone height
    const outerHeight = 0.0;
    const thickness = 0.4;  // Skirt thickness
    
    // Only extend to 2/3 of the skirt radius
    const maxRadiusFactor = 0.67;
    
    for (let col = 0; col < numColumns; col++) {
      const angle = (col / numColumns) * Math.PI * 2;
      
      for (let row = 0; row < bulbsPerColumn; row++) {
        // Interpolate position from inner to 2/3 of the way to outer
        const t = (row + 0.5) / bulbsPerColumn * maxRadiusFactor;
        const radius = innerRadius + (outerRadius - innerRadius) * t;
        const topHeight = innerHeight + (outerHeight - innerHeight) * t;
        // Position below the skirt (on the underside)
        const height = topHeight - thickness - 0.05;  // Slightly below bottom surface
        
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        // Create bulb with dim, warm glow
        const bulbMaterial = new THREE.MeshStandardMaterial({
          color: 0xffeedd,  // Warm white
          emissive: 0xffaa66,  // Warm orange glow
          emissiveIntensity: 0.15,  // Very dim
        });
        
        // Smaller bulbs for underskirt
        const bulbGeom = new THREE.SphereGeometry(0.08, 8, 8);
        const bulb = new THREE.Mesh(bulbGeom, bulbMaterial);
        bulb.position.set(x, y, height);
        
        this.windmillGroup!.add(bulb);
        this.underskirtLightBulbs.push(bulb);
      }
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
    
    // Update radius bar so one end stays at pivot point
    this.updateRadiusBar(state.tilt.pivotRadius, state.platformPhase);
    
    // Update fork arm connecting pivot to secondary platform center
    this.updateForkArm(state);
    
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
      this.windmillGroup.position.set(centerWorldX, centerWorldZ + this.PLATFORM_BASE_HEIGHT + 0.5, centerWorldY);
      
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
    
    // Animate light show reflectors - sequential on/off pattern with visible beams
    if (this.lightShowEnabled && this.poleReflectors.length > 0) {
      const time = state.time;
      const numReflectors = this.poleReflectors.length;
      const sequenceSpeed = 0.8;  // Speed of the sequence (moderate pace)
      const onDuration = 0.5;  // How long each light stays on (0-1 fraction of cycle)
      
      for (let i = 0; i < numReflectors; i++) {
        const reflector = this.poleReflectors[i];
        const lensMaterial = reflector.mesh.material as THREE.MeshStandardMaterial;
        const beamMaterial = reflector.beam.material as THREE.MeshBasicMaterial;
        
        // Calculate phase offset for each reflector (creates sequential pattern)
        const phaseOffset = i / numReflectors;
        
        // Calculate current phase in the cycle (0 to 1)
        const cyclePhase = ((time * sequenceSpeed + phaseOffset) % 1);
        
        // Smooth transition using sine wave for fade in/out
        let intensity: number;
        if (cyclePhase < onDuration) {
          // Calculate smooth fade in/out within the on duration
          const onPhase = cyclePhase / onDuration;  // 0 to 1 during on time
          intensity = Math.sin(onPhase * Math.PI);  // Smooth bell curve
        } else {
          intensity = 0;
        }
        
        // Subtle pulsing effect when on
        const flickerIntensity = intensity > 0.1 
          ? intensity * (0.9 + Math.sin(time * 10 + i * 2) * 0.1)
          : intensity;
        
        // Update lens glow - very bright
        lensMaterial.emissiveIntensity = 3.0 + flickerIntensity * 7.0;
        
        // Update spotlight intensity - very high for dramatic lighting on platform
        reflector.light.intensity = 10 + flickerIntensity * 90;
        reflector.light.visible = true;
        
        // Update beam visibility and opacity - keep subtle
        beamMaterial.opacity = 0.01 + flickerIntensity * 0.05;  // Very subtle beam
        reflector.beam.visible = true;
      }
    } else if (!this.lightShowEnabled) {
      // Light show disabled - turn off all reflectors and beams
      for (const reflector of this.poleReflectors) {
        const lensMaterial = reflector.mesh.material as THREE.MeshStandardMaterial;
        const beamMaterial = reflector.beam.material as THREE.MeshBasicMaterial;
        lensMaterial.emissiveIntensity = 0.3;  // Dim glow when off
        reflector.light.visible = false;
        reflector.light.intensity = 0;
        beamMaterial.opacity = 0;
        reflector.beam.visible = false;
      }
    }
    
    // Update strobe reflector animation
    this.updateStroboReflector(state.time);
    
    // Update camera position when in cabin mode (passenger view)
    if (this.cameraMode === 'cabin' && state.cabins.length > 0) {
      this.updateCabinCamera(state);
    }
    
    // Update smoke system with wind data from simulation
    if (this.smokeSystem) {
      // Calculate delta time
      const currentTime = state.time;
      const deltaTime = this.lastUpdateTime > 0 ? currentTime - this.lastUpdateTime : 0.016;
      this.lastUpdateTime = currentTime;
      
      // Get windmill center position in world space
      const windmillCenter = new THREE.Vector3();
      if (this.windmillGroup) {
        this.windmillGroup.getWorldPosition(windmillCenter);
      }
      
      // Update smoke system with current wind data
      this.smokeSystem.updateWindData(
        state.platform.angularVelocity,
        state.windmill.angularVelocity,
        windmillCenter,
        this.windmillRadius
      );
      
      // Update particle physics
      this.smokeSystem.update(deltaTime);
    }
  }
  
  /**
   * Update strobe reflector animation
   * Creates EXTREMELY INTENSE rapid flashing effect when strobe is active
   * Dominates the entire scene - blindingly bright
   */
  private updateStroboReflector(time: number): void {
    if (!this.stroboReflector) return;
    
    const lensMaterial = this.stroboReflector.lens.material as THREE.MeshStandardMaterial;
    const beamMaterial = this.stroboReflector.beam.material as THREE.MeshBasicMaterial;
    
    // Check if strobe should still be active
    const now = performance.now();
    if (this.stroboActive && now >= this.stroboEndTime) {
      this.stroboActive = false;
      console.log('[Strobe] Deactivated after 5 seconds');
    }
    
    if (this.stroboActive) {
      // Rapid flashing effect using time-based toggle
      if (now - this.stroboLastFlash >= this.stroboFlashInterval) {
        this.stroboFlashState = !this.stroboFlashState;
        this.stroboLastFlash = now;
      }
      
      if (this.stroboFlashState) {
        // Flash ON - BLINDINGLY BRIGHT - dominates the scene
        lensMaterial.emissiveIntensity = 50;  // Extremely bright lens
        lensMaterial.color.setHex(0xffffff);
        
        // Massive spotlight intensity - lights up entire ballerina
        this.stroboReflector.light.intensity = 800;
        this.stroboReflector.light.visible = true;
      } else {
        // Flash OFF - completely dark for maximum contrast
        lensMaterial.emissiveIntensity = 0;
        lensMaterial.color.setHex(0x444444);
        this.stroboReflector.light.intensity = 0;
        this.stroboReflector.light.visible = false;
      }
    } else {
      // Strobe inactive - dim idle state with subtle glow
      lensMaterial.emissiveIntensity = 0.2;
      lensMaterial.color.setHex(0xaaaaaa);
      this.stroboReflector.light.intensity = 0;
      this.stroboReflector.light.visible = false;
    }
    
    // Keep beam permanently hidden
    this.stroboReflector.beam.visible = false;
  }
  
  /**
   * Update camera to follow cabin 0 (pink seat) for passenger view
   * Camera moves with the seat but orbit controls remain enabled for looking around
   */
  private updateCabinCamera(state: SimulationState): void {
    // Get the first cabin (pink seat) world position from cabin group
    if (this.cabinGroups.length > 0 && this.cabinGroups[0]) {
      const cabinGroup = this.cabinGroups[0];
      
      // Get world position of the cabin
      const cabinWorldPos = new THREE.Vector3();
      cabinGroup.getWorldPosition(cabinWorldPos);
      
      // Get the cabin's world quaternion for proper orientation
      const cabinWorldQuat = new THREE.Quaternion();
      cabinGroup.getWorldQuaternion(cabinWorldQuat);
      
      // Position camera at passenger head height (above seat cushion)
      // The seat is a cushion, passenger sits on it, head is ~1m above seat surface
      const headOffset = new THREE.Vector3(0, 1.0, 0);
      const cameraPos = cabinWorldPos.clone().add(headOffset);
      
      // Calculate forward direction of travel (tangent to circular motion)
      // For the windmill rotation, forward is perpendicular to the radial direction
      const centerPos = new THREE.Vector3();
      if (this.windmillGroup) {
        this.windmillGroup.getWorldPosition(centerPos);
      }
      
      // Radial direction (from center to cabin)
      const radialDir = cabinWorldPos.clone().sub(centerPos);
      radialDir.y = 0; // Keep horizontal
      radialDir.normalize();
      
      // Forward direction is perpendicular to radial (tangent to circle)
      // Cross product with up vector gives tangent direction
      // For CCW rotation: tangent = up × radial
      const upDir = new THREE.Vector3(0, 1, 0);
      const forwardDir = new THREE.Vector3().crossVectors(upDir, radialDir).normalize();
      
      // If windmill direction is reversed, negate forward direction
      if (state.windmill.angularVelocity < 0) {
        forwardDir.negate();
      }
      
      // Create look target in the forward direction of travel
      const lookTarget = cameraPos.clone().add(forwardDir.multiplyScalar(10));
      
      // Smoothly update camera position to follow the seat
      this.camera.position.lerp(cameraPos, 0.2);
      
      // Update orbit controls target to follow the cabin
      // This allows the user to look around while riding
      this.controls.target.lerp(cameraPos.clone().add(forwardDir.multiplyScalar(2)), 0.2);
      
      // Keep orbit controls enabled so user can look around (turn head)
      this.controls.enabled = true;
      this.controls.update();
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
    
    // Flash panel lights
    for (const bulb of this.flashPanelLights) {
      const material = bulb.material as THREE.MeshStandardMaterial;
      if (enabled) {
        material.emissiveIntensity = 0.8;
      } else {
        material.emissiveIntensity = 0;
        material.color.setHex(0x666666);
      }
    }
    
    // Flash panel point lights
    for (const light of this.flashPanelPointLights) {
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
   * Set underskirt lights on/off
   * These lights are always lit (no animation) when enabled
   */
  setUnderskirtLightsEnabled(enabled: boolean): void {
    this.underskirtLightsEnabled = enabled;
    
    for (const bulb of this.underskirtLightBulbs) {
      const material = bulb.material as THREE.MeshStandardMaterial;
      if (enabled) {
        // Lights on: dim warm glow
        material.emissiveIntensity = 0.15;
        material.color.setHex(0xffeedd);
      } else {
        // Lights off: no glow, dull appearance
        material.emissiveIntensity = 0;
        material.color.setHex(0x666666);
      }
    }
  }
  
  /**
   * Get underskirt lights enabled state
   */
  getUnderskirtLightsEnabled(): boolean {
    return this.underskirtLightsEnabled;
  }
  
  /**
   * Set light show on/off
   * Controls the reflector lights on poles that point at the platform
   */
  setLightShowEnabled(enabled: boolean): void {
    this.lightShowEnabled = enabled;
    
    // Update reflector visibility immediately
    for (const reflector of this.poleReflectors) {
      const lensMaterial = reflector.mesh.material as THREE.MeshStandardMaterial;
      const beamMaterial = reflector.beam.material as THREE.MeshBasicMaterial;
      if (enabled) {
        lensMaterial.emissiveIntensity = 3.0;
        reflector.light.visible = true;
        reflector.beam.visible = true;
        beamMaterial.opacity = 0.03;
      } else {
        lensMaterial.emissiveIntensity = 0.3;
        reflector.light.visible = false;
        reflector.light.intensity = 0;
        reflector.beam.visible = false;
        beamMaterial.opacity = 0;
      }
    }
  }
  
  /**
   * Toggle light show on/off
   */
  toggleLightShow(): void {
    this.setLightShowEnabled(!this.lightShowEnabled);
  }
  
  /**
   * Get light show enabled state
   */
  getLightShowEnabled(): boolean {
    return this.lightShowEnabled;
  }
  
  /**
   * Trigger strobe effect for 5 seconds
   * Creates rapid flashing white light effect on the strobe reflector
   */
  triggerStrobe(): void {
    if (this.stroboActive) {
      console.log('[Strobe] Already active, ignoring trigger');
      return;
    }
    
    console.log('[Strobe] Activated for 5 seconds');
    this.stroboActive = true;
    this.stroboEndTime = performance.now() + 5000;  // 5 seconds
    this.stroboLastFlash = performance.now();
    this.stroboFlashState = false;
  }
  
  /**
   * Check if strobe is currently active
   */
  isStrobeActive(): boolean {
    return this.stroboActive;
  }
  
  /**
   * Start smoke emission from smoke machines
   * Call when smoke button is pressed
   */
  startSmoke(): void {
    if (this.smokeSystem) {
      this.smokeSystem.startEmission();
    }
  }
  
  /**
   * Stop smoke emission
   * Call when smoke button is released
   * Existing smoke will continue to dissipate naturally
   */
  stopSmoke(): void {
    if (this.smokeSystem) {
      this.smokeSystem.stopEmission();
    }
  }
  
  /**
   * Check if smoke is currently being emitted
   */
  isSmokeEmitting(): boolean {
    return this.smokeSystem?.isCurrentlyEmitting() ?? false;
  }
  
  /**
   * Set camera mode: 'external' for observer view, 'cabin' for passenger view
   */
  setCameraMode(mode: 'external' | 'cabin'): void {
    const previousMode = this.cameraMode;
    this.cameraMode = mode;
    
    if (mode === 'external' && previousMode === 'cabin') {
      // Restore external camera position
      this.camera.position.copy(this.externalCameraPosition);
      this.controls.target.copy(this.externalCameraTarget);
      this.controls.enabled = true;
      this.controls.update();
    } else if (mode === 'cabin') {
      // Store current external camera position before switching
      this.externalCameraPosition.copy(this.camera.position);
      this.externalCameraTarget.copy(this.controls.target);
    }
  }
  
  /**
   * Get current camera mode
   */
  getCameraMode(): 'external' | 'cabin' {
    return this.cameraMode;
  }
  
  /**
   * Toggle camera mode between external and cabin view
   */
  toggleCameraMode(): void {
    this.setCameraMode(this.cameraMode === 'external' ? 'cabin' : 'external');
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
    
    // Dispose smoke system
    if (this.smokeSystem) {
      this.smokeSystem.dispose();
      this.smokeSystem = null;
    }
    
    // Dispose materials
    Object.values(this.materials).forEach(mat => mat.dispose());
    
    // Dispose lights
    this.rideLights.forEach(light => {
      this.scene.remove(light);
      light.dispose();
    });
    
    // Dispose flash panel lights
    this.flashPanelPointLights.forEach(light => {
      this.scene.remove(light);
      light.dispose();
    });
    
    // Dispose fork arm
    if (this.forkArmGroup) {
      this.forkArmGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.forkArmGroup);
    }
    
    // Dispose surrounding structure
    if (this.surroundingGroup) {
      this.surroundingGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.surroundingGroup);
    }
    
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
