import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { F1Car } from './f1car.js';
import { Track } from './track.js';
import { GameController } from './controller.js';
import { HUD } from './hud.js';
import { EffectsManager } from './effects.js';
import { AudioManager } from './audio.js';

class F1RacingGame {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        this.car = null;
        this.track = null;
        this.controller = null;
        this.hud = null;
        this.effects = null;
        this.audio = null;

        this.cameraMode = 0; // 0: chase, 1: cockpit, 2: cinematic
        this.isRacing = false;
        this.gameTime = 0;
        this.lastTime = Date.now();

        this.init();
    }

    init() {
        this.setupScene();
        this.setupPhysics();
        this.setupLighting();
        this.setupCamera();
        this.setupRenderer();
        this.setupEnvironment();
        this.loadAssets();
        this.setupEventListeners();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 100, 2000);
    }

    setupPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 10;
        this.world.defaultContactMaterial.friction = 0.5;
    }

    setupLighting() {
        // Ambient light for overall scene brightness
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // Directional light (sun) with shadows
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(100, 200, 100);
        directionalLight.castShadow = true;

        // Configure shadow properties for high quality
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -200;
        directionalLight.shadow.camera.right = 200;
        directionalLight.shadow.camera.top = 200;
        directionalLight.shadow.camera.bottom = -200;
        directionalLight.shadow.bias = -0.0001;

        this.scene.add(directionalLight);

        // Hemisphere light for natural sky/ground lighting
        const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.6);
        this.scene.add(hemisphereLight);

        // Additional fill lights for realistic lighting
        const fillLight1 = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight1.position.set(-50, 50, -50);
        this.scene.add(fillLight1);

        const fillLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
        fillLight2.position.set(50, 30, -100);
        this.scene.add(fillLight2);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            3000
        );
        this.camera.position.set(0, 5, -15);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('game-canvas'),
            antialias: true,
            powerPreference: 'high-performance'
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    setupEnvironment() {
        // Skybox with gradient
        const skyGradient = this.createSkyGradient();
        this.scene.background = skyGradient;

        // Add clouds
        this.addClouds();

        // Ground plane (temporary until track is loaded)
        const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5016,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Physics ground
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);
    }

    createSkyGradient() {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 256;
        const context = canvas.getContext('2d');

        const gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#87ceeb');
        gradient.addColorStop(0.5, '#b0d4f1');
        gradient.addColorStop(1, '#e6f2ff');

        context.fillStyle = gradient;
        context.fillRect(0, 0, 2, 256);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    addClouds() {
        const cloudGeometry = new THREE.SphereGeometry(30, 8, 8);
        const cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            roughness: 1
        });

        for (let i = 0; i < 30; i++) {
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(
                Math.random() * 1000 - 500,
                100 + Math.random() * 100,
                Math.random() * 1000 - 500
            );
            cloud.scale.set(
                1 + Math.random() * 2,
                0.5 + Math.random() * 0.5,
                1 + Math.random() * 2
            );
            this.scene.add(cloud);
        }
    }

    async loadAssets() {
        const loadingScreen = document.getElementById('loading-screen');
        const loadingProgress = document.getElementById('loading-progress');
        const loadingText = document.getElementById('loading-text');

        let progress = 0;
        const updateProgress = (text, percent) => {
            progress = percent;
            loadingProgress.style.width = `${percent}%`;
            loadingText.textContent = text;
        };

        try {
            updateProgress('Creating racing track...', 20);
            this.track = new Track(this.scene, this.world);

            updateProgress('Building F1 car...', 40);
            this.car = new F1Car(this.scene, this.world);

            updateProgress('Initializing controls...', 60);
            this.controller = new GameController(this.car);

            updateProgress('Setting up HUD...', 80);
            this.hud = new HUD();

            updateProgress('Applying visual effects...', 90);
            this.effects = new EffectsManager(this.scene, this.renderer, this.camera);

            updateProgress('Initializing audio system...', 95);
            this.audio = new AudioManager();

            updateProgress('Ready to race!', 100);

            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                this.showStartMenu();
            }, 500);

        } catch (error) {
            console.error('Error loading assets:', error);
            loadingText.textContent = 'Error loading game assets';
        }
    }

    showStartMenu() {
        const startMenu = document.getElementById('start-menu');
        const startButton = document.getElementById('start-race');

        startButton.addEventListener('click', () => {
            startMenu.classList.add('hidden');
            this.startRace();
        });
    }

    startRace() {
        this.isRacing = true;
        this.hud.startRace();
        this.animate();
    }

    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.effects?.handleResize();
        });

        // Camera switch
        document.addEventListener('keydown', (e) => {
            if (e.key === 'c' || e.key === 'C') {
                this.switchCamera();
            }
            if (e.key === 'r' || e.key === 'R') {
                this.resetCar();
            }
        });
    }

    switchCamera() {
        this.cameraMode = (this.cameraMode + 1) % 3;
    }

    resetCar() {
        if (this.car) {
            this.car.reset();
        }
    }

    updateCamera() {
        if (!this.car) return;

        const carPosition = this.car.getPosition();
        const carRotation = this.car.getRotation();

        switch (this.cameraMode) {
            case 0: // Chase camera
                const chaseDistance = 15;
                const chaseHeight = 5;
                const chaseDamping = 0.1;

                const targetX = carPosition.x - Math.sin(carRotation.y) * chaseDistance;
                const targetY = carPosition.y + chaseHeight;
                const targetZ = carPosition.z - Math.cos(carRotation.y) * chaseDistance;

                this.camera.position.x += (targetX - this.camera.position.x) * chaseDamping;
                this.camera.position.y += (targetY - this.camera.position.y) * chaseDamping;
                this.camera.position.z += (targetZ - this.camera.position.z) * chaseDamping;

                this.camera.lookAt(carPosition.x, carPosition.y + 1, carPosition.z);
                break;

            case 1: // Cockpit camera
                this.camera.position.x = carPosition.x + Math.sin(carRotation.y) * 0.5;
                this.camera.position.y = carPosition.y + 1.2;
                this.camera.position.z = carPosition.z + Math.cos(carRotation.y) * 0.5;

                this.camera.rotation.x = 0;
                this.camera.rotation.y = carRotation.y;
                this.camera.rotation.z = 0;
                break;

            case 2: // Cinematic camera
                const cinematicDistance = 25;
                const cinematicHeight = 10;
                const cinematicAngle = Date.now() * 0.0001;

                this.camera.position.x = carPosition.x + Math.sin(cinematicAngle) * cinematicDistance;
                this.camera.position.y = carPosition.y + cinematicHeight;
                this.camera.position.z = carPosition.z + Math.cos(cinematicAngle) * cinematicDistance;

                this.camera.lookAt(carPosition.x, carPosition.y, carPosition.z);
                break;
        }
    }

    animate() {
        if (!this.isRacing) return;

        requestAnimationFrame(() => this.animate());

        const currentTime = Date.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Update physics
        this.world.step(1 / 60, deltaTime, 3);

        // Update car
        if (this.car) {
            this.car.update(deltaTime);
        }

        // Update camera
        this.updateCamera();

        // Update HUD
        if (this.hud && this.car) {
            this.hud.update(this.car);
        }

        // Update effects
        if (this.effects) {
            this.effects.update(this.car);
        }

        // Update audio
        if (this.audio && this.car) {
            this.audio.updateEngineSound(this.car.getRPM(), this.car.getSpeed());
        }

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    new F1RacingGame();
});
