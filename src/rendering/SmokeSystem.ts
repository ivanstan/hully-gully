/**
 * Smoke System - Balerina Ride Simulator
 * 
 * Particle-based smoke effect that interacts with the ride's rotation.
 * The spinning platform and skirt create wind that pushes smoke particles.
 * 
 * Physics:
 * - Particles have position, velocity, age, size
 * - Wind velocity = tangential velocity from rotation at particle position
 * - Particles rise slowly (buoyancy)
 * - Particles fade and grow as they age
 * - Turbulence adds realism
 */

import * as THREE from 'three';

/** Configuration for the smoke system */
export interface SmokeConfig {
  /** Maximum number of particles */
  maxParticles: number;
  /** Emission rate (particles per second) */
  emissionRate: number;
  /** Initial particle size (meters) */
  initialSize: number;
  /** Final particle size (meters) */
  finalSize: number;
  /** Particle lifetime (seconds) */
  lifetime: number;
  /** Initial upward velocity (m/s) */
  initialUpVelocity: number;
  /** Horizontal spread velocity (m/s) */
  spreadVelocity: number;
  /** Wind influence factor (how much rotation affects smoke) */
  windInfluence: number;
  /** Turbulence intensity */
  turbulence: number;
  /** Smoke color */
  color: THREE.Color;
  /** Smoke opacity at birth */
  initialOpacity: number;
}

/** Smoke emitter position */
export interface SmokeEmitter {
  /** Position in world space */
  position: THREE.Vector3;
  /** Emission direction (normalized) */
  direction: THREE.Vector3;
  /** Is this emitter active? */
  active: boolean;
}

/** Individual smoke particle */
interface SmokeParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  size: number;
  initialSize: number;
  finalSize: number;
  opacity: number;
  alive: boolean;
}

/**
 * Smoke System Class
 * 
 * Manages smoke particle emission, physics, and rendering.
 */
export class SmokeSystem {
  private particles: SmokeParticle[] = [];
  private config: SmokeConfig;
  private emitters: SmokeEmitter[] = [];
  
  // Three.js objects
  private particleGeometry: THREE.BufferGeometry;
  private particleMaterial: THREE.ShaderMaterial;
  private particleMesh: THREE.Points;
  
  // Buffers
  private positions: Float32Array;
  private sizes: Float32Array;
  private opacities: Float32Array;
  
  // State
  private isEmitting: boolean = false;
  private emissionAccumulator: number = 0;
  private time: number = 0;
  
  // Wind data from simulation
  private platformAngularVelocity: number = 0;
  private windmillAngularVelocity: number = 0;
  private windmillCenter: THREE.Vector3 = new THREE.Vector3();
  private windmillRadius: number = 9;
  
  constructor(scene: THREE.Scene, config?: Partial<SmokeConfig>) {
    // Default configuration - Dense dance floor fog style
    this.config = {
      maxParticles: 15000,
      emissionRate: 1200,
      initialSize: 2.5,
      finalSize: 12.0,
      lifetime: 8.0,
      initialUpVelocity: 0.15,
      spreadVelocity: 4.5,
      windInfluence: 0.5,
      turbulence: 0.4,
      color: new THREE.Color(0xeeeeee),
      initialOpacity: 0.75,
      ...config
    };
    
    // Initialize particle pool
    for (let i = 0; i < this.config.maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        lifetime: this.config.lifetime,
        size: this.config.initialSize,
        initialSize: this.config.initialSize,
        finalSize: this.config.finalSize,
        opacity: 0,
        alive: false
      });
    }
    
    // Create buffers
    this.positions = new Float32Array(this.config.maxParticles * 3);
    this.sizes = new Float32Array(this.config.maxParticles);
    this.opacities = new Float32Array(this.config.maxParticles);
    
    // Create geometry
    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.particleGeometry.setAttribute('opacity', new THREE.BufferAttribute(this.opacities, 1));
    
    // Create shader material for smoke
    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: this.config.color },
        pointTexture: { value: this.createSmokeTexture() }
      },
      vertexShader: `
        attribute float size;
        attribute float opacity;
        varying float vOpacity;
        
        void main() {
          vOpacity = opacity;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform sampler2D pointTexture;
        varying float vOpacity;
        
        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          float alpha = texColor.a * vOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    
    // Create points mesh
    this.particleMesh = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.particleMesh.frustumCulled = false;
    scene.add(this.particleMesh);
    
    // Create default emitters (positioned around the platform deck)
    this.createDefaultEmitters();
  }
  
  /**
   * Create a soft circular smoke texture - dense fog style
   */
  private createSmokeTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Create radial gradient for dense, soft smoke cloud
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );
    // Denser core that fades more gradually
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  
  /**
   * Create default smoke emitters around the platform
   * Creates a dense grid of emitters for dance floor fog effect
   */
  private createDefaultEmitters(): void {
    const deckHeight = 0.9; // Height above ground
    
    // Inner ring of emitters (close to platform)
    const innerRadius = 8;
    const innerEmitters = 8;
    for (let i = 0; i < innerEmitters; i++) {
      const angle = (i / innerEmitters) * Math.PI * 2;
      const x = Math.cos(angle) * innerRadius;
      const z = Math.sin(angle) * innerRadius;
      this.emitters.push({
        position: new THREE.Vector3(x, deckHeight, z),
        direction: new THREE.Vector3(0, 0.3, 0).normalize(),
        active: true
      });
    }
    
    // Outer ring of emitters (edge of deck)
    const outerRadius = 12;
    const outerEmitters = 12;
    for (let i = 0; i < outerEmitters; i++) {
      const angle = (i / outerEmitters) * Math.PI * 2 + Math.PI / 12;
      const x = Math.cos(angle) * outerRadius;
      const z = Math.sin(angle) * outerRadius;
      this.emitters.push({
        position: new THREE.Vector3(x, deckHeight, z),
        direction: new THREE.Vector3(0, 0.2, 0).normalize(),
        active: true
      });
    }
    
    // Far outer ring for even wider coverage
    const farRadius = 15;
    const farEmitters = 16;
    for (let i = 0; i < farEmitters; i++) {
      const angle = (i / farEmitters) * Math.PI * 2;
      const x = Math.cos(angle) * farRadius;
      const z = Math.sin(angle) * farRadius;
      this.emitters.push({
        position: new THREE.Vector3(x, deckHeight - 0.3, z),
        direction: new THREE.Vector3(0, 0.1, 0).normalize(),
        active: true
      });
    }
    
    // Ground level emitters scattered around
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const radius = 10 + Math.random() * 4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.emitters.push({
        position: new THREE.Vector3(x, 0.2, z),
        direction: new THREE.Vector3(0, 0.5, 0).normalize(),
        active: true
      });
    }
  }
  
  /**
   * Start emitting smoke
   */
  startEmission(): void {
    this.isEmitting = true;
  }
  
  /**
   * Stop emitting smoke
   */
  stopEmission(): void {
    this.isEmitting = false;
  }
  
  /**
   * Check if currently emitting
   */
  isCurrentlyEmitting(): boolean {
    return this.isEmitting;
  }
  
  /**
   * Update wind data from simulation state
   */
  updateWindData(
    platformAngularVelocity: number,
    windmillAngularVelocity: number,
    windmillCenter: THREE.Vector3,
    windmillRadius: number
  ): void {
    this.platformAngularVelocity = platformAngularVelocity;
    this.windmillAngularVelocity = windmillAngularVelocity;
    this.windmillCenter.copy(windmillCenter);
    this.windmillRadius = windmillRadius;
  }
  
  /**
   * Calculate wind velocity at a given position
   * Wind is created by the rotating platform and skirt
   */
  private calculateWindAtPosition(position: THREE.Vector3): THREE.Vector3 {
    const wind = new THREE.Vector3();
    
    // Platform wind (rotates around Y axis at origin)
    // Tangential velocity = ω × r (perpendicular to radius)
    const platformRadiusVec = new THREE.Vector3(position.x, 0, position.z);
    const platformRadius = platformRadiusVec.length();
    
    if (platformRadius > 0.1) {
      // Tangential velocity magnitude = ω * r
      const tangentialSpeed = Math.abs(this.platformAngularVelocity) * platformRadius;
      
      // Direction is perpendicular to radius (cross product with Y axis)
      const tangentDir = new THREE.Vector3(-position.z, 0, position.x).normalize();
      if (this.platformAngularVelocity < 0) tangentDir.negate();
      
      // Wind effect decreases with height (ground effect)
      const heightFactor = Math.max(0, 1 - position.y / 10);
      
      wind.add(tangentDir.multiplyScalar(tangentialSpeed * heightFactor * 0.5));
    }
    
    // Skirt wind (creates stronger turbulence due to tilted disc)
    const toWindmill = new THREE.Vector3().subVectors(position, this.windmillCenter);
    const distToSkirt = toWindmill.length();
    
    if (distToSkirt < this.windmillRadius * 2) {
      // Skirt creates outward radial wind when spinning
      const skirtSpeed = Math.abs(this.windmillAngularVelocity) * this.windmillRadius * 0.5;
      
      // Radial outward component
      if (distToSkirt > 0.1) {
        const radialDir = toWindmill.clone().normalize();
        const radialFactor = Math.max(0, 1 - distToSkirt / (this.windmillRadius * 2));
        wind.add(radialDir.multiplyScalar(skirtSpeed * radialFactor));
      }
      
      // Tangential component from skirt rotation
      const skirtTangent = new THREE.Vector3(-toWindmill.z, 0, toWindmill.x).normalize();
      if (this.windmillAngularVelocity < 0) skirtTangent.negate();
      
      const tangentialFactor = Math.max(0, 1 - distToSkirt / this.windmillRadius);
      wind.add(skirtTangent.multiplyScalar(skirtSpeed * tangentialFactor * 0.3));
    }
    
    return wind.multiplyScalar(this.config.windInfluence);
  }
  
  /**
   * Find an inactive particle for spawning
   */
  private getInactiveParticle(): SmokeParticle | null {
    for (const p of this.particles) {
      if (!p.alive) return p;
    }
    return null;
  }
  
  /**
   * Spawn a new particle from an emitter
   */
  private spawnParticle(emitter: SmokeEmitter): void {
    const particle = this.getInactiveParticle();
    if (!particle) return;
    
    // Initialize particle
    particle.alive = true;
    particle.age = 0;
    particle.lifetime = this.config.lifetime * (0.7 + Math.random() * 0.6);
    particle.initialSize = this.config.initialSize * (0.6 + Math.random() * 0.8);
    particle.finalSize = this.config.finalSize * (0.7 + Math.random() * 0.6);
    particle.size = particle.initialSize;
    particle.opacity = this.config.initialOpacity;
    
    // Position with wide randomness for dance floor effect
    particle.position.copy(emitter.position);
    particle.position.x += (Math.random() - 0.5) * 3.0;
    particle.position.z += (Math.random() - 0.5) * 3.0;
    particle.position.y += Math.random() * 0.5;
    
    // Initial velocity - mostly horizontal spread with minimal upward
    particle.velocity.copy(emitter.direction).multiplyScalar(this.config.initialUpVelocity);
    particle.velocity.x += (Math.random() - 0.5) * this.config.spreadVelocity;
    particle.velocity.z += (Math.random() - 0.5) * this.config.spreadVelocity;
    particle.velocity.y *= 0.3; // Reduce upward velocity for low-lying fog
  }
  
  /**
   * Update particle physics
   */
  update(deltaTime: number): void {
    this.time += deltaTime;
    
    // Emit new particles if emitting
    if (this.isEmitting) {
      this.emissionAccumulator += deltaTime * this.config.emissionRate;
      
      while (this.emissionAccumulator >= 1) {
        // Emit from random active emitter
        const activeEmitters = this.emitters.filter(e => e.active);
        if (activeEmitters.length > 0) {
          const emitter = activeEmitters[Math.floor(Math.random() * activeEmitters.length)];
          this.spawnParticle(emitter);
        }
        this.emissionAccumulator -= 1;
      }
    }
    
    // Update particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      
      if (!p.alive) {
        // Set inactive particles far away
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = -1000;
        this.positions[i * 3 + 2] = 0;
        this.sizes[i] = 0;
        this.opacities[i] = 0;
        continue;
      }
      
      // Age particle
      p.age += deltaTime;
      
      // Kill old particles
      if (p.age >= p.lifetime) {
        p.alive = false;
        continue;
      }
      
      // Life progress (0 to 1)
      const lifeProgress = p.age / p.lifetime;
      
      // Calculate wind at current position
      const wind = this.calculateWindAtPosition(p.position);
      
      // Add turbulence
      const turbulence = new THREE.Vector3(
        Math.sin(this.time * 2 + i * 0.1) * this.config.turbulence,
        Math.sin(this.time * 1.5 + i * 0.15) * this.config.turbulence * 0.5,
        Math.cos(this.time * 2.5 + i * 0.12) * this.config.turbulence
      );
      
      // Apply forces to velocity
      // Very weak buoyancy for low-lying fog effect
      p.velocity.y += 0.08 * deltaTime;
      
      // Keep smoke close to ground - push down if too high
      if (p.position.y > 4.0) {
        p.velocity.y -= 0.3 * deltaTime;
      }
      
      // Air resistance (more drag for denser fog)
      p.velocity.multiplyScalar(0.96);
      
      // Wind force
      p.velocity.add(wind.multiplyScalar(deltaTime * 2.5));
      
      // Turbulence
      p.velocity.add(turbulence.multiplyScalar(deltaTime * 1.5));
      
      // Update position
      p.position.add(p.velocity.clone().multiplyScalar(deltaTime));
      
      // Keep particles above ground
      if (p.position.y < 0.1) {
        p.position.y = 0.1;
        p.velocity.y = Math.abs(p.velocity.y) * 0.2;
      }
      
      // Update size (grows over time)
      p.size = THREE.MathUtils.lerp(p.initialSize, p.finalSize, lifeProgress);
      
      // Update opacity - quick fade in, stay visible longer, gradual fade out
      if (lifeProgress < 0.15) {
        p.opacity = this.config.initialOpacity * (lifeProgress / 0.15);
      } else if (lifeProgress > 0.7) {
        p.opacity = this.config.initialOpacity * (1 - (lifeProgress - 0.7) / 0.3);
      } else {
        p.opacity = this.config.initialOpacity;
      }
      
      // Update buffers
      this.positions[i * 3] = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;
      this.sizes[i] = p.size;
      this.opacities[i] = p.opacity;
    }
    
    // Mark buffers as needing update
    this.particleGeometry.attributes.position.needsUpdate = true;
    this.particleGeometry.attributes.size.needsUpdate = true;
    this.particleGeometry.attributes.opacity.needsUpdate = true;
  }
  
  /**
   * Set smoke color
   */
  setColor(color: THREE.Color): void {
    this.config.color = color;
    this.particleMaterial.uniforms.color.value = color;
  }
  
  /**
   * Get the smoke mesh for adding to scene
   */
  getMesh(): THREE.Points {
    return this.particleMesh;
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    if (this.particleMaterial.uniforms.pointTexture.value) {
      this.particleMaterial.uniforms.pointTexture.value.dispose();
    }
  }
}

