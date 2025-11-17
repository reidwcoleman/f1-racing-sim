import * as THREE from 'three';

export class EffectsManager {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;

        this.particles = [];
        this.tireMarks = [];
        this.maxTireMarks = 200;

        this.initializeParticleSystem();
        this.initializeTireMarkSystem();
    }

    initializeParticleSystem() {
        // Create particle geometry for smoke/dust
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = 1000;
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        const lifetimes = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            velocities.push(new THREE.Vector3());
            lifetimes.push(0);
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const particleMaterial = new THREE.PointsMaterial({
            color: 0x888888,
            size: 0.5,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particleSystem = new THREE.Points(particleGeometry, particleMaterial);
        this.particleVelocities = velocities;
        this.particleLifetimes = lifetimes;
        this.particleIndex = 0;

        this.scene.add(this.particleSystem);
    }

    initializeTireMarkSystem() {
        // Tire marks will be stored as individual meshes
        this.tireMarkMaterial = new THREE.MeshBasicMaterial({
            color: 0x111111,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
    }

    emitParticles(position, velocity, count = 5) {
        const positions = this.particleSystem.geometry.attributes.position.array;

        for (let i = 0; i < count; i++) {
            const index = this.particleIndex;

            positions[index * 3] = position.x + (Math.random() - 0.5) * 2;
            positions[index * 3 + 1] = position.y + Math.random() * 0.5;
            positions[index * 3 + 2] = position.z + (Math.random() - 0.5) * 2;

            this.particleVelocities[index].set(
                (Math.random() - 0.5) * 2 + velocity.x * 0.1,
                Math.random() * 2 + 1,
                (Math.random() - 0.5) * 2 + velocity.z * 0.1
            );

            this.particleLifetimes[index] = 1.0;

            this.particleIndex = (this.particleIndex + 1) % this.particleVelocities.length;
        }

        this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    updateParticles(deltaTime) {
        const positions = this.particleSystem.geometry.attributes.position.array;

        for (let i = 0; i < this.particleVelocities.length; i++) {
            if (this.particleLifetimes[i] > 0) {
                // Update position
                positions[i * 3] += this.particleVelocities[i].x * deltaTime;
                positions[i * 3 + 1] += this.particleVelocities[i].y * deltaTime;
                positions[i * 3 + 2] += this.particleVelocities[i].z * deltaTime;

                // Apply gravity
                this.particleVelocities[i].y -= 9.8 * deltaTime;

                // Decay lifetime
                this.particleLifetimes[i] -= deltaTime;

                // Ground collision
                if (positions[i * 3 + 1] < 0.1) {
                    positions[i * 3 + 1] = 0.1;
                    this.particleVelocities[i].y = 0;
                    this.particleVelocities[i].multiplyScalar(0.8);
                }
            } else {
                // Hide dead particles
                positions[i * 3 + 1] = -1000;
            }
        }

        this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    addTireMark(position, rotation, width = 0.3, length = 0.5) {
        if (this.tireMarks.length >= this.maxTireMarks) {
            // Remove oldest tire mark
            const oldMark = this.tireMarks.shift();
            this.scene.remove(oldMark);
            oldMark.geometry.dispose();
        }

        const geometry = new THREE.PlaneGeometry(width, length);
        const mark = new THREE.Mesh(geometry, this.tireMarkMaterial);

        mark.position.copy(position);
        mark.position.y = 0.01; // Slightly above ground to prevent z-fighting
        mark.rotation.x = -Math.PI / 2;
        mark.rotation.z = rotation;

        this.scene.add(mark);
        this.tireMarks.push(mark);
    }

    createSpeedLines(speed) {
        // Motion blur effect using speed lines
        // This would be implemented with a custom shader or post-processing
        // For now, we'll keep it simple
    }

    update(car) {
        if (!car) return;

        const deltaTime = 1 / 60; // Approximate
        const speed = car.getSpeed();
        const position = car.getPosition();
        const velocity = car.body ? car.body.velocity : new THREE.Vector3();

        // Update particles
        this.updateParticles(deltaTime);

        // Emit particles when braking or accelerating hard
        if (speed > 50 && Math.random() < 0.3) {
            this.emitParticles(position, velocity, 2);
        }

        // Add tire marks when drifting or braking hard
        if (speed > 30 && Math.random() < 0.1) {
            const rotation = car.getRotation().y;
            this.addTireMark(
                new THREE.Vector3(position.x, 0, position.z),
                rotation
            );
        }
    }

    handleResize() {
        // Handle any resize-dependent effects
    }

    createSkidEffect(position, intensity) {
        // Create skid marks with smoke particles
        this.emitParticles(position, new THREE.Vector3(), intensity * 10);
    }

    createCollisionEffect(position) {
        // Burst of particles on collision
        this.emitParticles(position, new THREE.Vector3(), 30);
    }
}
