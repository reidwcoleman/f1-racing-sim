import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Career Mode State
const careerState = {
    currentSeason: 1,
    currentRaceIndex: 0,
    totalMoney: 0,
    totalStars: 0,
    level: 1,
    totalTrophies: 0, // 1st place wins
    totalRunnerUps: 0, // 2nd/3rd places
    totalRaces: 0,
    carUpgrades: {
        engine: 1,      // 1-10
        aerodynamics: 1, // 1-10
        tires: 1,       // 1-10
        brakes: 1,      // 1-10
        kers: 1         // 1-10
    },
    completedRaces: {}, // Track which races completed with stars
    unlockedCircuits: ['monaco'], // Start with one unlocked
    unlockedCars: ['red-bull'], // Start with one car
    currentCircuit: 'monaco',
    currentCar: 'red-bull'
};

// Game State
const gameState = {
    running: false,
    raceStarted: false,
    startLightSequence: 0, // 0 = waiting, 1-5 = red lights, 6 = green/GO!
    startLightTimer: 0,
    currentLap: 1,
    totalLaps: 10,
    lapStartTime: 0,
    bestLapTime: null,
    lastLapTime: null,
    checkpoints: [],
    passedCheckpoint: false,
    fuel: 100,
    ers: 100,
    kers: 100, // Lap-limited KERS (0-100, recharges on braking)
    kersUsedThisLap: 0, // Track KERS usage per lap
    maxKersPerLap: 100, // Maximum KERS available per lap
    drsAvailable: false,
    drsActive: false,
    speed: 0,
    rpm: 0,
    gear: 1,
    throttle: 0,
    brake: 0,
    steering: 0,
    tireTempFL: 85,
    tireTempFR: 85,
    tireTempRL: 85,
    tireTempRR: 85,
    gforce: 0,
    carSetup: {
        frontWing: 5,
        rearWing: 7,
        brakeBalance: 50,
        tirePressure: 23
    },
    // Arcade physics state
    velocity: 0,
    rotation: 0,
    position: new THREE.Vector3(230, 0.5, 3), // Starting position (P2)
    prevSpeed: 0,
    playerPosition: 2, // Starting in P2
    // Race results
    finishPosition: 0,
    moneyEarned: 0,
    starsEarned: 0,
    // Tire wear & damage
    tireWear: 100, // 100 = new tires, 0 = destroyed
    damage: 0, // 0 = no damage, 100 = totaled
    needsPitStop: false,
    // Pit stop system
    inPitLane: false,
    inPitStop: false,
    pitStopTimer: 0,
    pitStopDuration: 3.0, // 3 seconds for pit stop
    canEnterPits: false
};

// Starting light gantry meshes (will be created later)
let startLightGantry = null;

// AI Opponents
const aiCars = [];

// Controls with smooth interpolation
const controls = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    drs: false,
    ers: false,
    currentThrottle: 0,
    currentBrake: 0,
    currentSteering: 0
};

// Scene Setup
const scene = new THREE.Scene();

// Create stunning gradient sky
const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 400 },
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
    `,
    side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

scene.fog = new THREE.Fog(0x87ceeb, 200, 1200);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
let cameraMode = 'chase';

// Renderer with better quality
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Post-processing for stunning visual effects
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom effect for glowing lights, exhaust, and reflections
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,  // strength
    0.4,  // radius
    0.85  // threshold
);
composer.addPass(bloomPass);

// Vignette shader for cinematic focus
const vignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        offset: { value: 0.95 },
        darkness: { value: 1.2 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
            gl_FragColor = vec4(mix(texel.rgb, vec3(0.0), dot(uv, uv) * darkness), texel.a);
        }
    `
};
const vignettePass = new ShaderPass(vignetteShader);
composer.addPass(vignettePass);

// SMAA Anti-aliasing (better than FXAA)
const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
composer.addPass(smaaPass);

// Motion Blur Shader (speed-based)
const motionBlurShader = {
    uniforms: {
        tDiffuse: { value: null },
        velocityFactor: { value: 0.0 },
        direction: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float velocityFactor;
        uniform vec2 direction;
        varying vec2 vUv;

        void main() {
            vec4 color = vec4(0.0);
            float total = 0.0;
            vec2 blurDir = direction * velocityFactor * 0.02;

            for (float i = -4.0; i <= 4.0; i += 1.0) {
                vec2 offset = blurDir * i;
                float weight = 1.0 - abs(i) / 5.0;
                color += texture2D(tDiffuse, vUv + offset) * weight;
                total += weight;
            }

            gl_FragColor = color / total;
        }
    `
};
const motionBlurPass = new ShaderPass(motionBlurShader);
composer.addPass(motionBlurPass);

// Film Grain for cinematic look
const filmGrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        intensity: { value: 0.08 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;

        float random(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float grain = random(vUv + time) * intensity;
            color.rgb += grain - intensity * 0.5;
            gl_FragColor = color;
        }
    `
};
const filmGrainPass = new ShaderPass(filmGrainShader);
composer.addPass(filmGrainPass);

// Chromatic Aberration for lens effect
const chromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.003 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        varying vec2 vUv;

        void main() {
            vec2 dir = vUv - vec2(0.5);
            float dist = length(dir);
            vec2 offset = dir * dist * amount;

            float r = texture2D(tDiffuse, vUv + offset).r;
            float g = texture2D(tDiffuse, vUv).g;
            float b = texture2D(tDiffuse, vUv - offset).b;

            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `
};
const chromaticPass = new ShaderPass(chromaticAberrationShader);
composer.addPass(chromaticPass);

// HDR Environment Map for realistic reflections
let envMap = null;
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

// Create procedural HDR environment (no external file needed)
function createProceduralEnvMap() {
    const envScene = new THREE.Scene();

    // Create gradient sky for environment
    const envSkyGeo = new THREE.SphereGeometry(500, 32, 32);
    const envSkyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0077ff) },
            bottomColor: { value: new THREE.Color(0xffffff) },
            sunColor: { value: new THREE.Color(0xffffee) },
            sunPosition: { value: new THREE.Vector3(100, 200, 100).normalize() }
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
            uniform vec3 sunColor;
            uniform vec3 sunPosition;
            varying vec3 vWorldPosition;

            void main() {
                vec3 dir = normalize(vWorldPosition);
                float h = dir.y * 0.5 + 0.5;
                vec3 skyColor = mix(bottomColor, topColor, pow(h, 0.6));

                // Add sun glow
                float sunDot = max(dot(dir, sunPosition), 0.0);
                vec3 sunGlow = sunColor * pow(sunDot, 64.0) * 2.0;
                sunGlow += sunColor * pow(sunDot, 8.0) * 0.5;

                gl_FragColor = vec4(skyColor + sunGlow, 1.0);
            }
        `,
        side: THREE.BackSide
    });
    const envSky = new THREE.Mesh(envSkyGeo, envSkyMat);
    envScene.add(envSky);

    // Add ground reflection
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -50;
    envScene.add(ground);

    // Generate environment map
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512, {
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter
    });

    const cubeCamera = new THREE.CubeCamera(1, 1000, cubeRenderTarget);
    cubeCamera.update(renderer, envScene);

    envMap = cubeRenderTarget.texture;
    scene.environment = envMap;

    return envMap;
}

// Bright Daytime Racing Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Bright daylight ambient
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 3.0); // Strong afternoon sun
sunLight.position.set(100, 200, 100);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -200;
sunLight.shadow.camera.right = 200;
sunLight.shadow.camera.top = 200;
sunLight.shadow.camera.bottom = -200;
sunLight.shadow.camera.far = 500;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 1.2); // Bright blue sky, warm ground
scene.add(hemisphereLight);

// Additional fill light for car visibility
const fillLight = new THREE.DirectionalLight(0xffffee, 0.6);
fillLight.position.set(-100, 100, -100);
scene.add(fillLight);

// Particle systems for visual effects
const particleSystems = {
    tireSmoke: [],
    sparks: [],
    dust: [],
    rubber: [],
    exhaust: []
};

// Create realistic tire smoke with gradient
function createSmokeParticle(position, intensity = 1.0) {
    // Volumetric smoke using multiple overlapping spheres
    const numLayers = 3;
    for (let layer = 0; layer < numLayers; layer++) {
        const size = 0.3 + layer * 0.15;
        const smokeGeometry = new THREE.SphereGeometry(size, 8, 8);
        const smokeMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(0, 0, 0.5 + Math.random() * 0.2),
            transparent: true,
            opacity: 0.4 * intensity,
            depthWrite: false
        });
        const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
        smoke.position.copy(position);
        smoke.position.y = 0.2 + layer * 0.1;
        smoke.position.x += (Math.random() - 0.5) * 0.3;
        smoke.position.z += (Math.random() - 0.5) * 0.3;
        smoke.life = 1.5 + Math.random() * 0.5;
        smoke.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            1.5 + Math.random() * 2,
            (Math.random() - 0.5) * 3
        );
        smoke.initialScale = size;
        scene.add(smoke);
        particleSystems.tireSmoke.push(smoke);
    }
}

// Create rubber particle (tire debris)
function createRubberParticle(position) {
    const rubberGeometry = new THREE.BoxGeometry(0.05, 0.02, 0.08);
    const rubberMaterial = new THREE.MeshBasicMaterial({
        color: 0x1a1a1a,
        transparent: true,
        opacity: 0.9
    });
    const rubber = new THREE.Mesh(rubberGeometry, rubberMaterial);
    rubber.position.copy(position);
    rubber.position.y = 0.1;
    rubber.life = 2.0;
    rubber.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 3,
        (Math.random() - 0.5) * 8
    );
    rubber.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
    );
    rubber.angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
    );
    scene.add(rubber);
    particleSystems.rubber.push(rubber);
}

// Create exhaust flame particle
function createExhaustParticle(position, velocity) {
    const exhaustGeometry = new THREE.SphereGeometry(0.08, 6, 6);
    const exhaustMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.08 + Math.random() * 0.05, 1, 0.6),
        transparent: true,
        opacity: 0.8
    });
    const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    exhaust.position.copy(position);
    exhaust.life = 0.15;
    exhaust.velocity = velocity.clone().multiplyScalar(-0.5);
    exhaust.velocity.y += Math.random() * 0.5;
    scene.add(exhaust);
    particleSystems.exhaust.push(exhaust);
}

// Create spark particle
function createSparkParticle(position) {
    const sparkGeometry = new THREE.SphereGeometry(0.1, 4, 4);
    const sparkMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 1.0
    });
    const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
    spark.position.copy(position);
    spark.life = 0.3; // lifetime in seconds
    spark.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 6,
        (Math.random() - 0.5) * 8
    );
    scene.add(spark);
    particleSystems.sparks.push(spark);
}

// Update particles - Enhanced with all particle types
function updateParticles(deltaTime) {
    // Update tire smoke with volumetric expansion
    for (let i = particleSystems.tireSmoke.length - 1; i >= 0; i--) {
        const smoke = particleSystems.tireSmoke[i];
        smoke.life -= deltaTime;
        smoke.position.add(smoke.velocity.clone().multiplyScalar(deltaTime));
        smoke.velocity.y *= 0.98; // Slow down rise
        smoke.velocity.x *= 0.95; // Air resistance
        smoke.velocity.z *= 0.95;

        // Expand and fade
        const lifeRatio = smoke.life / 2.0;
        const scale = smoke.initialScale * (1 + (1 - lifeRatio) * 4);
        smoke.scale.setScalar(scale);
        smoke.material.opacity = lifeRatio * 0.4;

        if (smoke.life <= 0) {
            scene.remove(smoke);
            smoke.geometry.dispose();
            smoke.material.dispose();
            particleSystems.tireSmoke.splice(i, 1);
        }
    }

    // Update sparks with gravity and bounce
    for (let i = particleSystems.sparks.length - 1; i >= 0; i--) {
        const spark = particleSystems.sparks[i];
        spark.life -= deltaTime;
        spark.position.add(spark.velocity.clone().multiplyScalar(deltaTime));
        spark.velocity.y -= 15 * deltaTime; // gravity

        // Bounce off ground
        if (spark.position.y < 0.05 && spark.velocity.y < 0) {
            spark.position.y = 0.05;
            spark.velocity.y *= -0.3;
            spark.velocity.x *= 0.7;
            spark.velocity.z *= 0.7;
        }

        // Flicker effect
        spark.material.opacity = (spark.life / 0.3) * (0.5 + Math.random() * 0.5);
        spark.material.color.setHSL(0.08 + Math.random() * 0.03, 1, 0.5 + Math.random() * 0.3);

        if (spark.life <= 0) {
            scene.remove(spark);
            spark.geometry.dispose();
            spark.material.dispose();
            particleSystems.sparks.splice(i, 1);
        }
    }

    // Update rubber particles
    for (let i = particleSystems.rubber.length - 1; i >= 0; i--) {
        const rubber = particleSystems.rubber[i];
        rubber.life -= deltaTime;
        rubber.position.add(rubber.velocity.clone().multiplyScalar(deltaTime));
        rubber.velocity.y -= 9.8 * deltaTime;

        // Tumble
        rubber.rotation.x += rubber.angularVelocity.x * deltaTime;
        rubber.rotation.y += rubber.angularVelocity.y * deltaTime;
        rubber.rotation.z += rubber.angularVelocity.z * deltaTime;

        // Bounce and settle
        if (rubber.position.y < 0.02) {
            rubber.position.y = 0.02;
            rubber.velocity.y *= -0.2;
            rubber.velocity.x *= 0.8;
            rubber.velocity.z *= 0.8;
            rubber.angularVelocity.multiplyScalar(0.8);
        }

        rubber.material.opacity = Math.min(rubber.life / 2.0, 0.9);

        if (rubber.life <= 0) {
            scene.remove(rubber);
            rubber.geometry.dispose();
            rubber.material.dispose();
            particleSystems.rubber.splice(i, 1);
        }
    }

    // Update exhaust flames
    for (let i = particleSystems.exhaust.length - 1; i >= 0; i--) {
        const exhaust = particleSystems.exhaust[i];
        exhaust.life -= deltaTime;
        exhaust.position.add(exhaust.velocity.clone().multiplyScalar(deltaTime));

        // Scale down as it fades
        const scale = exhaust.life / 0.15;
        exhaust.scale.setScalar(scale);
        exhaust.material.opacity = scale;

        // Color shift from yellow to red
        exhaust.material.color.setHSL(0.05 + (1 - scale) * 0.05, 1, 0.5 + scale * 0.3);

        if (exhaust.life <= 0) {
            scene.remove(exhaust);
            exhaust.geometry.dispose();
            exhaust.material.dispose();
            particleSystems.exhaust.splice(i, 1);
        }
    }
}

// Add volumetric clouds
function createClouds() {
    const cloudGroup = new THREE.Group();
    const cloudMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        roughness: 1,
        metalness: 0
    });

    // Create cloud clusters around the scene
    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 400 + Math.random() * 300;
        const height = 80 + Math.random() * 100;

        // Each cloud is made of multiple spheres
        for (let j = 0; j < 5; j++) {
            const cloudGeometry = new THREE.SphereGeometry(20 + Math.random() * 30, 8, 8);
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);

            cloud.position.set(
                Math.cos(angle) * distance + (Math.random() - 0.5) * 50,
                height + (Math.random() - 0.5) * 20,
                Math.sin(angle) * distance + (Math.random() - 0.5) * 50
            );

            cloud.scale.set(1, 0.6, 1);
            cloudGroup.add(cloud);
        }
    }

    scene.add(cloudGroup);
}

createClouds();

// ========== TRACK LAYOUT DEFINITIONS ==========
const trackLayouts = {
    monaco: {
        name: 'Monaco Grand Prix',
        type: 'circular',
        radius: 200,
        color: 0x2a2a2a,
        checkpoints: [
            { x: 230, z: 0 },
            { x: 0, z: 230 },
            { x: -230, z: 0 },
            { x: 0, z: -230 }
        ]
    },
    arcport: {
        name: 'Arcport Circuit',
        type: 'oval',
        width: 300,
        height: 180,
        color: 0x2a2a2a,
        checkpoints: [
            { x: 300, z: 0 },
            { x: 0, z: 180 },
            { x: -300, z: 0 },
            { x: 0, z: -180 }
        ]
    },
    yafield: {
        name: 'Yafield Park',
        type: 'rounded-square',
        size: 200,
        color: 0x2a2a2a,
        checkpoints: [
            { x: 200, z: 200 },
            { x: -200, z: 200 },
            { x: -200, z: -200 },
            { x: 200, z: -200 }
        ]
    },
    riverside: {
        name: 'Riverside Circuit',
        type: 'figure-eight',
        radius: 150,
        color: 0x2a2a2a,
        checkpoints: [
            { x: 150, z: 150 },
            { x: -150, z: 150 },
            { x: -150, z: -150 },
            { x: 150, z: -150 }
        ]
    },
    silverstone: {
        name: 'Silverstone Circuit',
        type: 'complex',
        color: 0x2a2a2a,
        checkpoints: [
            { x: 250, z: 0 },
            { x: 100, z: 200 },
            { x: -200, z: 100 },
            { x: -100, z: -200 }
        ]
    }
};

// Current track points (global for mini-map)
let currentTrackPoints = [];

// Generate track points based on layout type
function generateTrackPoints(layout) {
    const points = [];
    const numPoints = 64;

    switch (layout.type) {
        case 'circular':
            for (let i = 0; i <= numPoints; i++) {
                const angle = (i / numPoints) * Math.PI * 2;
                points.push(new THREE.Vector3(
                    Math.cos(angle) * layout.radius,
                    0,
                    Math.sin(angle) * layout.radius
                ));
            }
            break;

        case 'oval':
            for (let i = 0; i <= numPoints; i++) {
                const angle = (i / numPoints) * Math.PI * 2;
                points.push(new THREE.Vector3(
                    Math.cos(angle) * layout.width,
                    0,
                    Math.sin(angle) * layout.height
                ));
            }
            break;

        case 'rounded-square':
            const cornerRadius = layout.size * 0.3;
            const straightLength = layout.size - cornerRadius;

            for (let i = 0; i <= numPoints; i++) {
                const t = i / numPoints;
                let x, z;

                if (t < 0.25) {
                    // Top straight with right corner
                    const localT = t / 0.25;
                    if (localT < 0.5) {
                        x = straightLength * (1 - localT * 2);
                        z = straightLength;
                    } else {
                        const angle = (localT - 0.5) * 2 * Math.PI / 2;
                        x = -straightLength + Math.cos(Math.PI / 2 - angle) * cornerRadius;
                        z = straightLength - cornerRadius + Math.sin(Math.PI / 2 - angle) * cornerRadius;
                    }
                } else if (t < 0.5) {
                    // Left straight with left corner
                    const localT = (t - 0.25) / 0.25;
                    if (localT < 0.5) {
                        x = -straightLength;
                        z = straightLength * (1 - localT * 2);
                    } else {
                        const angle = (localT - 0.5) * 2 * Math.PI / 2;
                        x = -straightLength + cornerRadius - Math.cos(angle) * cornerRadius;
                        z = -straightLength + Math.sin(angle) * cornerRadius;
                    }
                } else if (t < 0.75) {
                    // Bottom straight with left corner
                    const localT = (t - 0.5) / 0.25;
                    if (localT < 0.5) {
                        x = -straightLength + straightLength * localT * 2;
                        z = -straightLength;
                    } else {
                        const angle = (localT - 0.5) * 2 * Math.PI / 2;
                        x = straightLength - cornerRadius + Math.cos(angle) * cornerRadius;
                        z = -straightLength + cornerRadius - Math.sin(angle) * cornerRadius;
                    }
                } else {
                    // Right straight with right corner
                    const localT = (t - 0.75) / 0.25;
                    if (localT < 0.5) {
                        x = straightLength;
                        z = -straightLength + straightLength * localT * 2;
                    } else {
                        const angle = (localT - 0.5) * 2 * Math.PI / 2;
                        x = straightLength - Math.cos(Math.PI / 2 - angle) * cornerRadius;
                        z = straightLength - cornerRadius + Math.sin(Math.PI / 2 - angle) * cornerRadius;
                    }
                }

                points.push(new THREE.Vector3(x, 0, z));
            }
            break;

        case 'figure-eight':
        case 'complex':
            // Use circular as fallback for complex tracks
            for (let i = 0; i <= numPoints; i++) {
                const angle = (i / numPoints) * Math.PI * 2;
                const radius = layout.radius || 200;
                points.push(new THREE.Vector3(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius
                ));
            }
            break;
    }

    return points;
}

// Create Monaco-inspired Circuit with full scenery
function createCircuit() {
    // Get current track layout
    const layoutId = careerState.currentCircuit || 'monaco';
    const layout = trackLayouts[layoutId];
    currentTrackPoints = generateTrackPoints(layout);

    console.log(`Creating track: ${layout.name} (${layout.type})`);

    // Track surface with better texture
    const trackGeometry = new THREE.PlaneGeometry(600, 600);
    const trackMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.95,
        metalness: 0.05
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.receiveShadow = true;
    scene.add(track);

    // Use generated track points
    const points = currentTrackPoints;
    const numPoints = points.length - 1;

    // F1-style materials
    const redMaterial = new THREE.MeshStandardMaterial({
        color: 0xdd0000,
        roughness: 0.6,
        metalness: 0.1
    });

    const whiteMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6,
        metalness: 0.1
    });

    // WIDER TRACK - Inner and outer track edges (F1 standard width ~15m)
    const innerTrackPoints = points.map(p => new THREE.Vector3(p.x * 0.8, 0, p.z * 0.8));
    const outerTrackPoints = points.map(p => new THREE.Vector3(p.x * 1.5, 0, p.z * 1.5));
    const innerCurve = new THREE.CatmullRomCurve3(innerTrackPoints);
    const outerCurve = new THREE.CatmullRomCurve3(outerTrackPoints);

    // WHITE TRACK LIMIT LINES - Inner edge
    for (let i = 0; i < numPoints; i += 1) {
        const t = i / numPoints;
        const pos = innerCurve.getPoint(t);
        const tangent = innerCurve.getTangent(t);
        const angle = Math.atan2(tangent.z, tangent.x);

        const lineGeometry = new THREE.PlaneGeometry(3, 0.3);
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.rotation.x = -Math.PI / 2;
        line.rotation.z = angle;
        line.position.set(pos.x, 0.02, pos.z);
        scene.add(line);
    }

    // WHITE TRACK LIMIT LINES - Outer edge
    for (let i = 0; i < numPoints; i += 1) {
        const t = i / numPoints;
        const pos = outerCurve.getPoint(t);
        const tangent = outerCurve.getTangent(t);
        const angle = Math.atan2(tangent.z, tangent.x);

        const lineGeometry = new THREE.PlaneGeometry(3, 0.3);
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.rotation.x = -Math.PI / 2;
        line.rotation.z = angle;
        line.position.set(pos.x, 0.02, pos.z);
        scene.add(line);
    }

    // RED & WHITE STRIPED KERBS - Inner edge (low kerbs just beyond white line)
    const kerbInnerPoints = points.map(p => new THREE.Vector3(p.x * 0.75, 0, p.z * 0.75));
    const kerbInnerCurve = new THREE.CatmullRomCurve3(kerbInnerPoints);

    for (let i = 0; i < numPoints; i++) {
        const t = i / numPoints;
        const pos = kerbInnerCurve.getPoint(t);
        const tangent = kerbInnerCurve.getTangent(t);
        const angle = Math.atan2(tangent.z, tangent.x);
        const isRed = i % 2 === 0;

        const kerbGeometry = new THREE.BoxGeometry(2, 0.08, 0.6);
        const kerb = new THREE.Mesh(kerbGeometry, isRed ? redMaterial : whiteMaterial);
        kerb.position.set(pos.x, 0.04, pos.z);
        kerb.rotation.y = angle;
        kerb.castShadow = true;
        scene.add(kerb);
    }

    // RED & WHITE STRIPED KERBS - Outer edge
    const kerbOuterPoints = points.map(p => new THREE.Vector3(p.x * 1.55, 0, p.z * 1.55));
    const kerbOuterCurve = new THREE.CatmullRomCurve3(kerbOuterPoints);

    for (let i = 0; i < numPoints; i++) {
        const t = i / numPoints;
        const pos = kerbOuterCurve.getPoint(t);
        const tangent = kerbOuterCurve.getTangent(t);
        const angle = Math.atan2(tangent.z, tangent.x);
        const isRed = i % 2 === 1;

        const kerbGeometry = new THREE.BoxGeometry(2, 0.08, 0.6);
        const kerb = new THREE.Mesh(kerbGeometry, isRed ? redMaterial : whiteMaterial);
        kerb.position.set(pos.x, 0.04, pos.z);
        kerb.rotation.y = angle;
        kerb.castShadow = true;
        scene.add(kerb);
    }

    // GRASS STRIPS - Just beyond kerbs on both sides
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d5016,
        roughness: 0.95
    });

    // Inner grass
    const grassInnerPoints = points.map(p => new THREE.Vector3(p.x * 0.68, 0, p.z * 0.68));
    const grassInnerCurve = new THREE.CatmullRomCurve3(grassInnerPoints);

    for (let i = 0; i < numPoints; i += 1) {
        const t = i / numPoints;
        const pos = grassInnerCurve.getPoint(t);
        const tangent = grassInnerCurve.getTangent(t);
        const angle = Math.atan2(tangent.z, tangent.x);

        const grassGeometry = new THREE.PlaneGeometry(3, 3);
        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        grass.rotation.x = -Math.PI / 2;
        grass.rotation.z = angle;
        grass.position.set(pos.x, -0.05, pos.z);
        grass.receiveShadow = true;
        scene.add(grass);
    }

    // Outer grass
    const grassOuterPoints = points.map(p => new THREE.Vector3(p.x * 1.65, 0, p.z * 1.65));
    const grassOuterCurve = new THREE.CatmullRomCurve3(grassOuterPoints);

    for (let i = 0; i < numPoints; i += 1) {
        const t = i / numPoints;
        const pos = grassOuterCurve.getPoint(t);
        const tangent = grassOuterCurve.getTangent(t);
        const angle = Math.atan2(tangent.z, tangent.x);

        const grassGeometry = new THREE.PlaneGeometry(3, 3);
        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        grass.rotation.x = -Math.PI / 2;
        grass.rotation.z = angle;
        grass.position.set(pos.x, -0.05, pos.z);
        grass.receiveShadow = true;
        scene.add(grass);
    }

    // Grandstands with crowds
    createGrandstands(outerCurve, numPoints);

    // Trees around the circuit
    createTrees(outerCurve, numPoints);

    // Background buildings (Monaco-style)
    createBuildings();

    // Mountains in background
    createMountains();

    // Grass around track (reuse material from above)
    const largeGrassGeometry = new THREE.PlaneGeometry(1200, 1200);
    const grass = new THREE.Mesh(largeGrassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.1;
    grass.receiveShadow = true;
    scene.add(grass);

    // Pit building
    createPitBuilding();

    // Calculate trackRadius from layout
    const trackRadius = layout.radius || 200;

    // Start/Finish line with checkered pattern
    createStartFinishLine(trackRadius);

    // Track curbs (red and white)
    createCurbs(innerCurve, outerCurve, numPoints);

    // Flags and banners
    createFlags(outerCurve, numPoints);

    // Track-side light poles (decorative only in daytime)
    createTrackLights(innerCurve, outerCurve, numPoints);

    // Checkpoints for lap detection (use layout-specific checkpoints)
    gameState.checkpoints = layout.checkpoints.map(cp => ({ ...cp, passed: false }));
}

// Create grandstands with crowd
function createGrandstands(curve, numPoints) {
    const standMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        roughness: 0.7,
        metalness: 0.3
    });

    const seatMaterial = new THREE.MeshStandardMaterial({
        color: 0xe10600,
        roughness: 0.6
    });

    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.5,
        metalness: 0.6
    });

    // Create 16 MASSIVE grandstand sections (full F1 stadium environment)
    for (let i = 0; i < 16; i++) {
        const t = (i / 16) + 0.03;
        const pos = curve.getPoint(t);

        // MASSIVE main stand structure (3x bigger)
        const standGeometry = new THREE.BoxGeometry(50, 25, 12);
        const stand = new THREE.Mesh(standGeometry, standMaterial);
        stand.position.set(pos.x * 1.18, 12.5, pos.z * 1.18);
        stand.lookAt(new THREE.Vector3(0, 12.5, 0));
        stand.castShadow = true;
        stand.receiveShadow = true;
        scene.add(stand);

        // Stadium roof
        const roofGeometry = new THREE.BoxGeometry(52, 0.5, 15);
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(pos.x * 1.18, 26, pos.z * 1.18);
        roof.lookAt(new THREE.Vector3(0, 26, 0));
        roof.castShadow = true;
        scene.add(roof);

        // Support columns
        for (let col = 0; col < 4; col++) {
            const columnGeometry = new THREE.CylinderGeometry(0.6, 0.8, 25, 8);
            const column = new THREE.Mesh(columnGeometry, standMaterial);
            const angle = Math.atan2(pos.z, pos.x);
            const colOffset = (col - 1.5) * 12;
            column.position.set(
                pos.x * 1.19 + Math.cos(angle + Math.PI/2) * colOffset,
                12.5,
                pos.z * 1.19 + Math.sin(angle + Math.PI/2) * colOffset
            );
            column.castShadow = true;
            scene.add(column);
        }

        // 8 seating tiers (much taller grandstands)
        for (let tier = 0; tier < 8; tier++) {
            const seatGeometry = new THREE.BoxGeometry(48, 0.6, 2);
            const seats = new THREE.Mesh(seatGeometry, seatMaterial);
            seats.position.set(pos.x * 1.19, 2 + tier * 2.8, pos.z * 1.19);
            seats.lookAt(new THREE.Vector3(0, 2 + tier * 2.8, 0));
            scene.add(seats);

            // MASSIVE crowds (80 people per tier)
            for (let j = 0; j < 80; j++) {
                const crowdGeometry = new THREE.BoxGeometry(0.5, 1.1, 0.5);
                const crowdColors = [
                    0xff6600, 0x0066cc, 0xffff00, 0x00ff00, 0xff00ff,
                    0xff0000, 0x00ffff, 0xffffff, 0x000000, 0xff1493
                ];
                const crowdMaterial = new THREE.MeshStandardMaterial({
                    color: crowdColors[Math.floor(Math.random() * crowdColors.length)],
                    roughness: 0.85
                });
                const person = new THREE.Mesh(crowdGeometry, crowdMaterial);

                const angle = Math.atan2(pos.z, pos.x);
                const offset = (j - 40) * 0.6;
                person.position.set(
                    pos.x * 1.20 + Math.cos(angle + Math.PI/2) * offset,
                    2.8 + tier * 2.8,
                    pos.z * 1.20 + Math.sin(angle + Math.PI/2) * offset
                );
                person.castShadow = true;
                scene.add(person);
            }
        }

        // Stadium floodlight structures (disabled for daytime racing)
        if (i % 2 === 0) {
            for (let light = 0; light < 2; light++) {
                // Light pole
                const poleGeometry = new THREE.CylinderGeometry(0.4, 0.6, 35, 8);
                const poleMaterial = new THREE.MeshStandardMaterial({
                    color: 0x555555,
                    roughness: 0.4,
                    metalness: 0.7
                });
                const pole = new THREE.Mesh(poleGeometry, poleMaterial);
                const angle = Math.atan2(pos.z, pos.x);
                const lightOffset = (light - 0.5) * 20;
                pole.position.set(
                    pos.x * 1.22 + Math.cos(angle + Math.PI/2) * lightOffset,
                    17.5,
                    pos.z * 1.22 + Math.sin(angle + Math.PI/2) * lightOffset
                );
                pole.castShadow = true;
                scene.add(pole);

                // Floodlight fixture (not glowing in daytime)
                const fixtureGeometry = new THREE.BoxGeometry(3, 1.5, 1.5);
                const fixtureMaterial = new THREE.MeshStandardMaterial({
                    color: 0x222222,
                    emissive: 0x000000,
                    emissiveIntensity: 0,
                    roughness: 0.3,
                    metalness: 0.8
                });
                const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
                fixture.position.set(
                    pos.x * 1.22 + Math.cos(angle + Math.PI/2) * lightOffset,
                    35,
                    pos.z * 1.22 + Math.sin(angle + Math.PI/2) * lightOffset
                );
                fixture.lookAt(new THREE.Vector3(0, 0, 0));
                scene.add(fixture);

                // Floodlights disabled for daytime racing (intensity set to 0)
                const spotlight = new THREE.SpotLight(0xffffdd, 0, 500, Math.PI / 4, 0.3, 1);
                spotlight.position.set(
                    pos.x * 1.22 + Math.cos(angle + Math.PI/2) * lightOffset,
                    35,
                    pos.z * 1.22 + Math.sin(angle + Math.PI/2) * lightOffset
                );
                spotlight.target.position.set(pos.x * 0.5, 0, pos.z * 0.5);
                spotlight.castShadow = false;
                scene.add(spotlight);
                scene.add(spotlight.target);
            }
        }
    }
}

// Create trees around circuit
function createTrees(curve, numPoints) {
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3020,
        roughness: 0.9
    });

    const foliageMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a6b0a,
        roughness: 0.85
    });

    // Plant trees in clusters
    for (let i = 0; i < numPoints; i += 3) {
        const t = i / numPoints;
        const pos = curve.getPoint(t);

        // Create tree cluster (3-5 trees)
        const numTrees = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < numTrees; j++) {
            const offsetX = pos.x * 1.4 + (Math.random() - 0.5) * 20;
            const offsetZ = pos.z * 1.4 + (Math.random() - 0.5) * 20;

            // Tree trunk
            const trunkGeometry = new THREE.CylinderGeometry(0.8, 1, 8, 8);
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(offsetX, 4, offsetZ);
            trunk.castShadow = true;
            scene.add(trunk);

            // Tree foliage (3 spheres for fuller look)
            const foliageGeometry = new THREE.SphereGeometry(4, 8, 8);
            const foliage1 = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage1.position.set(offsetX, 8, offsetZ);
            foliage1.castShadow = true;
            scene.add(foliage1);

            const foliage2 = new THREE.Mesh(new THREE.SphereGeometry(3.5, 8, 8), foliageMaterial);
            foliage2.position.set(offsetX + 1.5, 9, offsetZ + 1);
            scene.add(foliage2);

            const foliage3 = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), foliageMaterial);
            foliage3.position.set(offsetX - 1, 8.5, offsetZ - 1);
            scene.add(foliage3);
        }
    }
}

// Create Monaco-style buildings in background
function createBuildings() {
    const buildingColors = [0xcccccc, 0xe8d4a0, 0xffffff, 0xb8a080];

    for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const distance = 400 + Math.random() * 200;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;

        const width = 20 + Math.random() * 30;
        const height = 40 + Math.random() * 80;
        const depth = 20 + Math.random() * 30;

        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
            roughness: 0.7,
            metalness: 0.2
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, height / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);

        // Windows
        const windowGeometry = new THREE.PlaneGeometry(width * 0.8, height * 0.9);
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0x4488ff,
            emissive: 0x2244aa,
            emissiveIntensity: 0.3,
            roughness: 0.1,
            metalness: 0.9
        });
        const windows = new THREE.Mesh(windowGeometry, windowMaterial);
        windows.position.set(x, height / 2, z + depth / 2 + 0.1);
        scene.add(windows);
    }
}

// Create mountains in far background
function createMountains() {
    const mountainMaterial = new THREE.MeshStandardMaterial({
        color: 0x6b7a5a,
        roughness: 0.95,
        metalness: 0
    });

    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const distance = 700;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;

        const height = 100 + Math.random() * 150;
        const width = 80 + Math.random() * 100;

        const mountainGeometry = new THREE.ConeGeometry(width, height, 6);
        const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
        mountain.position.set(x, height / 2, z);
        mountain.rotation.y = Math.random() * Math.PI;
        scene.add(mountain);
    }
}

// Create pit building
function createPitBuilding() {
    const pitMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7,
        metalness: 0.3
    });

    const pitGeometry = new THREE.BoxGeometry(60, 12, 20);
    const pitBuilding = new THREE.Mesh(pitGeometry, pitMaterial);
    pitBuilding.position.set(230, 6, -30);
    pitBuilding.castShadow = true;
    pitBuilding.receiveShadow = true;
    scene.add(pitBuilding);

    // Pit roof
    const roofGeometry = new THREE.BoxGeometry(62, 0.5, 22);
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0xe10600,
        roughness: 0.6
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(230, 12.5, -30);
    scene.add(roof);

    // Pit garages
    for (let i = 0; i < 10; i++) {
        const garageDoor = new THREE.Mesh(
            new THREE.PlaneGeometry(5, 8),
            new THREE.MeshStandardMaterial({ color: 0x666666 })
        );
        garageDoor.position.set(205 + i * 6, 4, -20);
        garageDoor.rotation.y = Math.PI / 2;
        scene.add(garageDoor);
    }
}

// Create start/finish line with starting lights gantry
function createStartFinishLine(trackRadius) {
    // Checkered pattern
    const checkerSize = 3;
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 2; j++) {
            const isWhite = (i + j) % 2 === 0;
            const checkerGeometry = new THREE.PlaneGeometry(checkerSize, checkerSize);
            const checkerMaterial = new THREE.MeshStandardMaterial({
                color: isWhite ? 0xffffff : 0x000000,
                emissive: isWhite ? 0xffffff : 0x000000,
                emissiveIntensity: isWhite ? 0.3 : 0
            });
            const checker = new THREE.Mesh(checkerGeometry, checkerMaterial);
            checker.rotation.x = -Math.PI / 2;
            checker.position.set(
                trackRadius * 1.15,
                0.11,
                -15 + i * checkerSize + j * checkerSize
            );
            scene.add(checker);
        }
    }

    // Create F1-style starting light gantry
    startLightGantry = new THREE.Group();

    // Gantry structure
    const gantryMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.8,
        roughness: 0.3
    });

    // Position gantry to the side of the track, not in center
    const gantryOffset = trackRadius * 0.85; // Position to the right side of track

    // Main horizontal beam
    const beamGeometry = new THREE.BoxGeometry(0.4, 0.4, 12);
    const beam = new THREE.Mesh(beamGeometry, gantryMaterial);
    beam.position.set(gantryOffset, 8, 0);
    beam.castShadow = true;
    startLightGantry.add(beam);

    // Support poles
    const poleGeometry = new THREE.CylinderGeometry(0.25, 0.25, 8, 16);
    const poleL = new THREE.Mesh(poleGeometry, gantryMaterial);
    poleL.position.set(gantryOffset, 4, -6);
    poleL.castShadow = true;
    startLightGantry.add(poleL);

    const poleR = new THREE.Mesh(poleGeometry, gantryMaterial);
    poleR.position.set(gantryOffset, 4, 6);
    poleR.castShadow = true;
    startLightGantry.add(poleR);

    // Create 5 sets of red lights (F1 style)
    startLightGantry.lights = [];
    for (let i = 0; i < 5; i++) {
        const lightSet = new THREE.Group();

        // Light panel background
        const panelGeometry = new THREE.BoxGeometry(1.5, 1.8, 0.3);
        const panelMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            metalness: 0.7,
            roughness: 0.4
        });
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        lightSet.add(panel);

        // Red lights (3 circles vertically arranged)
        const lightPositions = [-0.5, 0, 0.5];
        const redLights = [];

        lightPositions.forEach(yOffset => {
            // Light housing (dark when off)
            const lightGeometry = new THREE.CircleGeometry(0.35, 32);
            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0x2a0000,
                emissive: 0x000000,
                emissiveIntensity: 0,
                metalness: 0.3,
                roughness: 0.7
            });
            const light = new THREE.Mesh(lightGeometry, lightMaterial);
            light.position.set(0, yOffset, 0.16);
            lightSet.add(light);
            redLights.push(light);

            // Point light for glow effect
            const pointLight = new THREE.PointLight(0xff0000, 0, 20);
            pointLight.position.set(0, yOffset, 0.5);
            lightSet.add(pointLight);
        });

        lightSet.position.set(gantryOffset, 8, -4 + i * 2);
        lightSet.rotation.y = Math.PI / 2; // Face toward the track
        startLightGantry.add(lightSet);

        startLightGantry.lights.push({
            meshes: redLights,
            pointLights: lightSet.children.filter(c => c instanceof THREE.PointLight)
        });
    }

    // Green light set (centered above)
    const greenLightSet = new THREE.Group();
    const greenPanelGeometry = new THREE.BoxGeometry(2.5, 1.5, 0.3);
    const greenPanel = new THREE.Mesh(greenPanelGeometry, new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        metalness: 0.7,
        roughness: 0.4
    }));
    greenLightSet.add(greenPanel);

    // Green lights (3 circles horizontally arranged)
    const greenLightPositions = [-0.7, 0, 0.7];
    const greenLights = [];
    const greenPointLights = [];

    greenLightPositions.forEach(xOffset => {
        const greenLightGeometry = new THREE.CircleGeometry(0.4, 32);
        const greenLightMaterial = new THREE.MeshStandardMaterial({
            color: 0x002a00,
            emissive: 0x000000,
            emissiveIntensity: 0,
            metalness: 0.3,
            roughness: 0.7
        });
        const greenLight = new THREE.Mesh(greenLightGeometry, greenLightMaterial);
        greenLight.position.set(xOffset, 0, 0.16);
        greenLightSet.add(greenLight);
        greenLights.push(greenLight);

        const greenPointLight = new THREE.PointLight(0x00ff00, 0, 30);
        greenPointLight.position.set(xOffset, 0, 0.5);
        greenLightSet.add(greenPointLight);
        greenPointLights.push(greenPointLight);
    });

    greenLightSet.position.set(gantryOffset, 10, 0);
    greenLightSet.rotation.y = Math.PI / 2; // Face toward the track
    startLightGantry.add(greenLightSet);

    startLightGantry.greenLights = {
        meshes: greenLights,
        pointLights: greenPointLights
    };

    scene.add(startLightGantry);
}

// Create track curbs (red and white stripes)
function createCurbs(innerCurve, outerCurve, numPoints) {
    const redMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

    for (let i = 0; i < numPoints; i += 2) {
        const t = i / numPoints;
        const isRed = (i / 2) % 2 === 0;

        // Inner curb
        const innerPos = innerCurve.getPoint(t);
        const innerCurbGeometry = new THREE.BoxGeometry(6, 0.3, 1);
        const innerCurb = new THREE.Mesh(innerCurbGeometry, isRed ? redMaterial : whiteMaterial);
        innerCurb.position.set(innerPos.x * 0.95, 0.15, innerPos.z * 0.95);
        innerCurb.lookAt(new THREE.Vector3(0, 0.15, 0));
        scene.add(innerCurb);

        // Outer curb
        const outerPos = outerCurve.getPoint(t);
        const outerCurbGeometry = new THREE.BoxGeometry(6, 0.3, 1);
        const outerCurb = new THREE.Mesh(outerCurbGeometry, isRed ? redMaterial : whiteMaterial);
        outerCurb.position.set(outerPos.x * 1.05, 0.15, outerPos.z * 1.05);
        outerCurb.lookAt(new THREE.Vector3(0, 0.15, 0));
        scene.add(outerCurb);
    }
}

// Create flags and banners
function createFlags(curve, numPoints) {
    const flagMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.8,
        side: THREE.DoubleSide
    });

    for (let i = 0; i < 16; i++) {
        const t = i / 16;
        const pos = curve.getPoint(t);

        // Flag pole
        const poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 15, 8);
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.set(pos.x * 1.35, 7.5, pos.z * 1.35);
        scene.add(pole);

        // Flag
        const flagGeometry = new THREE.PlaneGeometry(4, 2.5);
        const flag = new THREE.Mesh(flagGeometry, flagMaterial);
        flag.position.set(pos.x * 1.35, 13, pos.z * 1.35);
        flag.rotation.y = Math.atan2(pos.z, pos.x) + Math.PI / 2;
        scene.add(flag);
    }
}

// Create track-side lighting poles (disabled for daytime racing)
function createTrackLights(innerCurve, outerCurve, numPoints) {
    // Create light poles every 8 points around the track (decorative only in daytime)
    for (let i = 0; i < numPoints; i += 8) {
        const t = i / numPoints;

        // Inner track lights
        const innerPos = innerCurve.getPoint(t);
        createLightPole(innerPos.x * 0.9, innerPos.z * 0.9);

        // Outer track lights
        const outerPos = outerCurve.getPoint(t);
        createLightPole(outerPos.x * 1.1, outerPos.z * 1.1);
    }
}

// Helper function to create a single light pole (lights off for daytime)
function createLightPole(x, z) {
    // Pole
    const poleGeometry = new THREE.CylinderGeometry(0.15, 0.2, 12, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.5,
        metalness: 0.7
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, 6, z);
    pole.castShadow = true;
    scene.add(pole);

    // Light fixture (not glowing in daytime)
    const fixtureGeometry = new THREE.BoxGeometry(0.8, 0.4, 0.8);
    const fixtureMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.3,
        metalness: 0.8
    });
    const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
    fixture.position.set(x, 12, z);
    scene.add(fixture);

    // Point light disabled for daytime racing (intensity set to 0)
    const pointLight = new THREE.PointLight(0xffffdd, 0, 50);
    pointLight.position.set(x, 12, z);
    pointLight.castShadow = false;
    scene.add(pointLight);
}

// Create starting grid with position markers
function createStartingGrid(trackRadius) {
    // Starting grid positions (F1 style - staggered 2x2)
    const gridPositions = [
        { x: trackRadius * 1.15, z: -3, pos: 1 },    // P1 (pole position)
        { x: trackRadius * 1.15, z: 3, pos: 2 },     // P2
        { x: trackRadius * 1.15, z: -9, pos: 3 },    // P3
        { x: trackRadius * 1.15, z: -3, pos: 4 },    // P4
        { x: trackRadius * 1.15, z: -15, pos: 5 },   // P5
        { x: trackRadius * 1.15, z: -9, pos: 6 }     // P6
    ];

    gridPositions.forEach(pos => {
        // Starting box lines
        const boxGeometry = new THREE.PlaneGeometry(4, 8);
        const boxMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        box.rotation.x = -Math.PI / 2;
        box.position.set(pos.x, 0.05, pos.z);
        scene.add(box);

        // Position number
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 80px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pos.pos.toString(), 64, 64);

        const numberTexture = new THREE.CanvasTexture(canvas);
        const numberMaterial = new THREE.MeshBasicMaterial({
            map: numberTexture,
            transparent: true
        });
        const numberPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            numberMaterial
        );
        numberPlane.rotation.x = -Math.PI / 2;
        numberPlane.position.set(pos.x, 0.06, pos.z);
        scene.add(numberPlane);
    });
}

// Create Pit Lane Markers
function createPitLaneMarkers() {
    // Pit lane entry zone (offset from track, near start/finish)
    const pitEntryZone = {
        x: 210,
        z: -5,
        width: 50,
        depth: 30
    };

    // Pit lane entry box (yellow/white striped)
    const entryGeometry = new THREE.PlaneGeometry(pitEntryZone.width, pitEntryZone.depth);
    const entryMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    const entryBox = new THREE.Mesh(entryGeometry, entryMaterial);
    entryBox.rotation.x = -Math.PI / 2;
    entryBox.position.set(pitEntryZone.x, 0.05, pitEntryZone.z);
    scene.add(entryBox);

    // Pit lane entry arrow
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0);
    arrowShape.lineTo(5, 10);
    arrowShape.lineTo(2.5, 10);
    arrowShape.lineTo(2.5, 20);
    arrowShape.lineTo(-2.5, 20);
    arrowShape.lineTo(-2.5, 10);
    arrowShape.lineTo(-5, 10);
    arrowShape.closePath();

    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(pitEntryZone.x, 0.06, pitEntryZone.z);
    scene.add(arrow);

    // "PIT" text marker
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PIT LANE', 128, 64);

    const textTexture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({
        map: textTexture,
        transparent: true
    });
    const textPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 10),
        textMaterial
    );
    textPlane.rotation.x = -Math.PI / 2;
    textPlane.position.set(pitEntryZone.x, 0.07, pitEntryZone.z - 15);
    scene.add(textPlane);

    // Pit lane speed limit sign
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 128;
    signCanvas.height = 128;
    const signCtx = signCanvas.getContext('2d');

    // Red circle
    signCtx.strokeStyle = '#ff0000';
    signCtx.lineWidth = 8;
    signCtx.beginPath();
    signCtx.arc(64, 64, 55, 0, Math.PI * 2);
    signCtx.stroke();

    // Speed limit text
    signCtx.fillStyle = '#000000';
    signCtx.font = 'bold 50px Arial';
    signCtx.textAlign = 'center';
    signCtx.textBaseline = 'middle';
    signCtx.fillText('60', 64, 64);

    const signTexture = new THREE.CanvasTexture(signCanvas);
    const signMaterial = new THREE.MeshBasicMaterial({
        map: signTexture,
        transparent: true
    });
    const signPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 4),
        signMaterial
    );
    signPlane.position.set(pitEntryZone.x + 20, 3, pitEntryZone.z);
    signPlane.lookAt(new THREE.Vector3(0, 3, 0));
    scene.add(signPlane);
}

// Create Ultra-Realistic Slender F1 Car with Driver
function createF1Car(color = 0xe10600, startPosition = null) {
    const car = new THREE.Group();

    // ULTRA-REALISTIC MATERIALS with MeshPhysicalMaterial for clearcoat
    // Carbon fiber with realistic weave look
    const carbonMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x0a0a0a,
        metalness: 0.1,
        roughness: 0.3,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        reflectivity: 0.9,
        envMapIntensity: 2.0
    });

    // Glossy car paint with clearcoat (like real F1 cars)
    const liveryMaterial = new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0.4,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        reflectivity: 1.0,
        envMapIntensity: 2.5,
        emissive: color,
        emissiveIntensity: 0.02,
        sheen: 0.5,
        sheenRoughness: 0.2,
        sheenColor: new THREE.Color(0xffffff)
    });

    // White sponsor areas
    const whiteMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.2,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.5
    });

    // Black wing elements (matte carbon)
    const wingMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x050505,
        metalness: 0.0,
        roughness: 0.4,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1.5
    });

    // Mirror chrome finish
    const chromeMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 1.0,
        roughness: 0.0,
        clearcoat: 0.0,
        reflectivity: 1.0,
        envMapIntensity: 3.0,
        ior: 2.5
    });

    // SLENDER MONOCOQUE (narrow F1 chassis - 0.8m wide, 4.5m long)
    const monocoqueGeometry = new THREE.BoxGeometry(0.8, 0.3, 4.5);
    const monocoque = new THREE.Mesh(monocoqueGeometry, carbonMaterial);
    monocoque.position.set(0, 0.15, 0);
    monocoque.castShadow = true;
    car.add(monocoque);

    // ULTRA-THIN NOSE CONE (pencil-thin modern F1 nose)
    const noseShape = new THREE.Shape();
    noseShape.moveTo(0, 0);
    noseShape.lineTo(0.15, 0);
    noseShape.lineTo(0.05, 1.8);
    noseShape.lineTo(-0.05, 1.8);
    noseShape.lineTo(-0.15, 0);
    const noseExtrudeSettings = { depth: 0.15, bevelEnabled: false };
    const noseGeometry = new THREE.ExtrudeGeometry(noseShape, noseExtrudeSettings);
    const nose = new THREE.Mesh(noseGeometry, carbonMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.z = Math.PI / 2;
    nose.position.set(0, 0.08, 2.25);
    nose.castShadow = true;
    car.add(nose);

    // SLENDER SIDEPODS (realistic narrow aerodynamic pods)
    const sidepodGeometry = new THREE.BoxGeometry(0.25, 0.25, 2.2);
    const sidepodL = new THREE.Mesh(sidepodGeometry, liveryMaterial);
    sidepodL.position.set(-0.55, 0.05, 0.3);
    sidepodL.castShadow = true;
    car.add(sidepodL);

    const sidepodR = new THREE.Mesh(sidepodGeometry, liveryMaterial);
    sidepodR.position.set(0.55, 0.05, 0.3);
    sidepodR.castShadow = true;
    car.add(sidepodR);

    // Sidepod air intakes
    const intakeGeometry = new THREE.BoxGeometry(0.22, 0.18, 0.5);
    const intakeL = new THREE.Mesh(intakeGeometry, carbonMaterial);
    intakeL.position.set(-0.55, 0.05, 1.2);
    car.add(intakeL);
    const intakeR = new THREE.Mesh(intakeGeometry, carbonMaterial);
    intakeR.position.set(0.55, 0.05, 1.2);
    car.add(intakeR);

    // SLEEK ENGINE COVER (tapered, aerodynamic)
    const engineCoverGeometry = new THREE.BoxGeometry(0.7, 0.35, 2.8);
    const engineCover = new THREE.Mesh(engineCoverGeometry, liveryMaterial);
    engineCover.position.set(0, 0.25, -1.2);
    engineCover.scale.set(1, 1, 1.1);
    engineCover.castShadow = true;
    car.add(engineCover);

    // Shark fin
    const sharkFinGeometry = new THREE.BoxGeometry(0.05, 0.6, 1.2);
    const sharkFin = new THREE.Mesh(sharkFinGeometry, liveryMaterial);
    sharkFin.position.set(0, 0.55, -1.8);
    sharkFin.castShadow = true;
    car.add(sharkFin);

    // COCKPIT with visible driver
    const cockpitGeometry = new THREE.BoxGeometry(0.65, 0.3, 1.2);
    const cockpitMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.95,
        roughness: 0.05,
        transparent: true,
        opacity: 0.3
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(0, 0.4, 0.5);
    cockpit.castShadow = true;
    car.add(cockpit);

    // DRIVER HELMET (visible inside cockpit)
    const helmetGeometry = new THREE.SphereGeometry(0.18, 16, 16);
    const helmetMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        metalness: 0.9,
        roughness: 0.1
    });
    const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    helmet.position.set(0, 0.45, 0.5);
    helmet.scale.set(1, 1.1, 1.15);
    car.add(helmet);

    // Helmet visor
    const visorGeometry = new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const visorMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 1,
        roughness: 0,
        transparent: true,
        opacity: 0.8
    });
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 0.48, 0.63);
    visor.rotation.x = -Math.PI / 6;
    car.add(visor);

    // Driver body (torso visible in cockpit)
    const torsoGeometry = new THREE.BoxGeometry(0.35, 0.4, 0.5);
    const suitMaterial = new THREE.MeshStandardMaterial({
        color: 0x0066cc,
        roughness: 0.8
    });
    const torso = new THREE.Mesh(torsoGeometry, suitMaterial);
    torso.position.set(0, 0.25, 0.35);
    car.add(torso);

    // Steering wheel
    const steeringWheelGeometry = new THREE.TorusGeometry(0.15, 0.02, 8, 16);
    const steeringMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.8,
        roughness: 0.3
    });
    const steeringWheel = new THREE.Mesh(steeringWheelGeometry, steeringMaterial);
    steeringWheel.position.set(0, 0.32, 0.75);
    steeringWheel.rotation.x = Math.PI / 3;
    car.add(steeringWheel);

    // HALO (titanium safety device)
    const haloGeometry = new THREE.TorusGeometry(0.4, 0.04, 12, 24, Math.PI);
    const haloMaterial = new THREE.MeshStandardMaterial({
        color: 0x9a9a9a,
        metalness: 0.95,
        roughness: 0.05
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.set(0, 0.5, 0.5);
    halo.rotation.x = Math.PI / 2;
    halo.castShadow = true;
    car.add(halo);

    // Halo center support
    const haloSupportGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 12);
    const haloSupport = new THREE.Mesh(haloSupportGeometry, haloMaterial);
    haloSupport.position.set(0, 0.5, 0.6);
    car.add(haloSupport);

    // FRONT WING (multi-element, wide)
    const frontWingMainGeometry = new THREE.BoxGeometry(2.0, 0.05, 0.4);
    const frontWingMain = new THREE.Mesh(frontWingMainGeometry, wingMaterial);
    frontWingMain.position.set(0, -0.12, 2.5);
    frontWingMain.castShadow = true;
    car.add(frontWingMain);

    // Secondary front wing element
    const frontWing2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.35), wingMaterial);
    frontWing2.position.set(0, -0.05, 2.6);
    car.add(frontWing2);

    // Third front wing element
    const frontWing3 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.3), wingMaterial);
    frontWing3.position.set(0, 0.02, 2.7);
    car.add(frontWing3);

    // Front wing endplates
    const endplateGeometry = new THREE.BoxGeometry(0.08, 0.4, 0.6);
    const endplateL = new THREE.Mesh(endplateGeometry, liveryMaterial);
    endplateL.position.set(-1.0, -0.05, 2.55);
    car.add(endplateL);
    const endplateR = new THREE.Mesh(endplateGeometry, liveryMaterial);
    endplateR.position.set(1.0, -0.05, 2.55);
    car.add(endplateR);

    // REAR WING (tall, wide, multi-element)
    const rearWingSupportL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 12), carbonMaterial);
    rearWingSupportL.position.set(-0.5, 0.5, -2.7);
    car.add(rearWingSupportL);
    const rearWingSupportR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 12), carbonMaterial);
    rearWingSupportR.position.set(0.5, 0.5, -2.7);
    car.add(rearWingSupportR);

    // Main rear wing
    const rearWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.6), wingMaterial);
    rearWingMain.position.set(0, 0.92, -2.7);
    rearWingMain.castShadow = true;
    car.add(rearWingMain);

    // Upper rear wing element (DRS flap)
    const rearWingUpper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.5), wingMaterial);
    rearWingUpper.position.set(0, 1.1, -2.7);
    car.add(rearWingUpper);

    // Rear wing endplates
    const rearEndplateL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.8), liveryMaterial);
    rearEndplateL.position.set(-0.9, 1.0, -2.7);
    car.add(rearEndplateL);
    const rearEndplateR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.8), liveryMaterial);
    rearEndplateR.position.set(0.9, 1.0, -2.7);
    car.add(rearEndplateR);

    // REALISTIC F1 WHEELS (wide, low profile)
    const wheelPositions = [
        { x: -0.95, z: 2.0, name: 'FL', front: true },
        { x: 0.95, z: 2.0, name: 'FR', front: true },
        { x: -0.95, z: -1.8, name: 'RL', front: false },
        { x: 0.95, z: -1.8, name: 'RR', front: false }
    ];

    car.wheels = [];
    wheelPositions.forEach(pos => {
        const wheelGroup = new THREE.Group();

        // Tire (wide, low profile F1 tire)
        const tireWidth = pos.front ? 0.3 : 0.38; // Rear tires wider
        const tireRadius = 0.36;
        const tireGeometry = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 32);
        const tireMaterial = new THREE.MeshStandardMaterial({
            color: 0x0f0f0f,
            metalness: 0.1,
            roughness: 0.95
        });
        const tire = new THREE.Mesh(tireGeometry, tireMaterial);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        wheelGroup.add(tire);

        // Tire sidewall markings (Pirelli style)
        const sidewallGeometry = new THREE.CylinderGeometry(tireRadius - 0.02, tireRadius - 0.02, tireWidth * 0.8, 32);
        const sidewallMaterial = new THREE.MeshStandardMaterial({
            color: 0xdddddd,
            metalness: 0,
            roughness: 0.9
        });
        const sidewall = new THREE.Mesh(sidewallGeometry, sidewallMaterial);
        sidewall.rotation.z = Math.PI / 2;
        wheelGroup.add(sidewall);

        // Rim (lightweight magnesium) - Enhanced chrome finish
        const rimRadius = 0.28;
        const rimGeometry = new THREE.CylinderGeometry(rimRadius, rimRadius, tireWidth * 0.85, 32);
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            metalness: 1.0,
            roughness: 0.02,
            envMapIntensity: 2.5
        });
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.rotation.z = Math.PI / 2;
        rim.castShadow = true;
        wheelGroup.add(rim);

        // Wheel spokes (5-spoke design)
        for (let i = 0; i < 5; i++) {
            const spokeGeometry = new THREE.BoxGeometry(0.04, 0.25, tireWidth * 0.7);
            const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
            const angle = (i / 5) * Math.PI * 2;
            spoke.position.set(Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, 0);
            spoke.rotation.z = angle;
            wheelGroup.add(spoke);
        }

        // Carbon brake disc (larger)
        const brakeRadius = 0.22;
        const brakeGeometry = new THREE.CylinderGeometry(brakeRadius, brakeRadius, 0.04, 32);
        const brakeMaterial = new THREE.MeshStandardMaterial({
            color: 0x332211,
            metalness: 0.9,
            roughness: 0.2,
            emissive: 0xff4400,
            emissiveIntensity: 0.4
        });
        const brake = new THREE.Mesh(brakeGeometry, brakeMaterial);
        brake.rotation.z = Math.PI / 2;
        brake.position.x = pos.x > 0 ? 0.13 : -0.13;
        wheelGroup.add(brake);

        // Brake caliper
        const caliperGeometry = new THREE.BoxGeometry(0.08, 0.12, 0.06);
        const caliperMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            metalness: 0.7,
            roughness: 0.3
        });
        const caliper = new THREE.Mesh(caliperGeometry, caliperMaterial);
        caliper.position.set(pos.x > 0 ? 0.15 : -0.15, 0.18, 0);
        wheelGroup.add(caliper);

        wheelGroup.position.set(pos.x, -0.25, pos.z);
        car.add(wheelGroup);
        car.wheels.push(tire);
    });

    // Exhaust pipe - Enhanced with heat glow effect
    const exhaustGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.25, 16);
    const exhaustMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 1.0,
        roughness: 0.15,
        emissive: 0xff4400,
        emissiveIntensity: 0.8
    });
    const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0, 0.2, -2.9);
    car.add(exhaust);

    // Exhaust glow light
    const exhaustLight = new THREE.PointLight(0xff4400, 0.5, 3);
    exhaustLight.position.set(0, 0.2, -3.0);
    car.add(exhaustLight);
    car.exhaustLight = exhaustLight;

    // Number plate on nose
    const numberPlate = new THREE.Mesh(
        new THREE.CircleGeometry(0.15, 16),
        new THREE.MeshStandardMaterial({ color: 0xffff00, metalness: 0.2, roughness: 0.7 })
    );
    numberPlate.position.set(0, 0.15, 2.8);
    numberPlate.rotation.x = -Math.PI / 2;
    car.add(numberPlate);

    // Sponsor decals - Racing stripes on engine cover
    const stripeGeometry = new THREE.BoxGeometry(0.12, 0.01, 2.6);
    const stripeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.4,
        roughness: 0.3,
        emissive: 0xffffff,
        emissiveIntensity: 0.1
    });
    const stripe1 = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe1.position.set(-0.15, 0.44, -1.1);
    car.add(stripe1);
    const stripe2 = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe2.position.set(0.15, 0.44, -1.1);
    car.add(stripe2);

    // Chrome accents on sidepods
    const accentGeometry = new THREE.BoxGeometry(0.26, 0.05, 0.8);
    const accent1 = new THREE.Mesh(accentGeometry, chromeMaterial);
    accent1.position.set(-0.55, 0.18, 0.5);
    car.add(accent1);
    const accent2 = new THREE.Mesh(accentGeometry, chromeMaterial);
    accent2.position.set(0.55, 0.18, 0.5);
    car.add(accent2);

    scene.add(car);

    // Set initial position
    if (startPosition) {
        car.position.copy(startPosition);
    } else {
        car.position.copy(gameState.position);
    }

    return { mesh: car, wheels: car.wheels };
}

const playerCar = createF1Car();

// Create AI opponent cars
function createAICars() {
    const carColors = [
        { color: 0x0066cc, name: 'Blue Racing' },     // P1 - Blue
        { color: 0x00cc00, name: 'Green Team' },      // P3 - Green
        { color: 0xffaa00, name: 'Orange Squad' },    // P4 - Orange
        { color: 0x9900cc, name: 'Purple Power' },    // P5 - Purple
        { color: 0x00cccc, name: 'Cyan Speed' }       // P6 - Cyan
    ];

    const trackRadius = 200;
    const startPositions = [
        new THREE.Vector3(trackRadius * 1.15, 0.5, -3),   // P1
        new THREE.Vector3(trackRadius * 1.15, 0.5, -9),   // P3
        new THREE.Vector3(trackRadius * 1.15, 0.5, -3),   // P4
        new THREE.Vector3(trackRadius * 1.15, 0.5, -15),  // P5
        new THREE.Vector3(trackRadius * 1.15, 0.5, -9)    // P6
    ];

    carColors.forEach((carData, index) => {
        const aiCar = createF1Car(carData.color, startPositions[index]);
        const aiState = {
            mesh: aiCar.mesh,
            wheels: aiCar.wheels,
            name: carData.name,
            velocity: 0,
            rotation: 0,
            position: startPositions[index].clone(),
            targetSpeed: 280 + Math.random() * 40, // AI top speed varies
            aggression: 0.7 + Math.random() * 0.3,   // How aggressive the AI is
            skill: 0.8 + Math.random() * 0.2,        // Skill level affects consistency
            currentLap: 1,
            checkpoints: [
                { passed: false },
                { passed: false },
                { passed: false },
                { passed: false }
            ]
        };
        aiCars.push(aiState);
    });
}

// Input handling
document.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') controls.throttle = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') controls.brake = true;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') controls.left = true;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') controls.right = true;
    if (e.key === ' ') { controls.drs = true; e.preventDefault(); }
    if (e.key === 'e' || e.key === 'E') controls.ers = true;
    if (e.key === 'c' || e.key === 'C') {
        // Cycle through: chase -> bird's eye -> cockpit -> chase
        if (cameraMode === 'chase') cameraMode = 'birds-eye';
        else if (cameraMode === 'birds-eye') cameraMode = 'cockpit';
        else cameraMode = 'chase';
    }
    if (e.key === 'r' || e.key === 'R') {
        gameState.position.set(230, 0.5, 0);
        gameState.velocity = 0;
        gameState.rotation = 0;
        playerCar.mesh.position.copy(gameState.position);
        playerCar.mesh.rotation.y = 0;
    }
    if (e.key === 'p' || e.key === 'P') {
        // Enter pit stop if in pit lane
        if (gameState.canEnterPits && !gameState.inPitStop && gameState.raceStarted) {
            enterPitStop();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') controls.throttle = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') controls.brake = false;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') controls.left = false;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') controls.right = false;
    if (e.key === ' ') controls.drs = false;
    if (e.key === 'e' || e.key === 'E') controls.ers = false;
});

// Update HUD
function updateHUD() {
    const speed = Math.abs(gameState.velocity);
    gameState.speed = speed;

    // Calculate G-force from acceleration
    const deltaSpeed = speed - gameState.prevSpeed;
    const instantGforce = Math.abs(deltaSpeed) / 9.81;
    gameState.gforce = gameState.gforce * 0.9 + instantGforce * 0.1;
    gameState.prevSpeed = speed;

    // Calculate RPM based on speed (very low for stability)
    const maxRPM = 3000; // Much lower to prevent instability
    gameState.rpm = Math.min(maxRPM, (speed / 330) * maxRPM);

    // Update telemetry
    document.getElementById('tel-speed').textContent = Math.round(speed) + ' km/h';
    document.getElementById('tel-rpm').textContent = Math.round(gameState.rpm);
    document.getElementById('tel-gear').textContent = 'AUTO';
    document.getElementById('tel-throttle').textContent = Math.round(controls.currentThrottle * 100) + '%';
    document.getElementById('tel-brake').textContent = Math.round(controls.currentBrake * 100) + '%';
    document.getElementById('tel-gforce').textContent = gameState.gforce.toFixed(2) + 'G';
    document.getElementById('tel-fuel').textContent = Math.round(gameState.fuel) + 'kg';
    document.getElementById('tel-lap').textContent = gameState.currentLap + ' / ' + gameState.totalLaps;

    // Speedometer
    document.getElementById('speed').textContent = Math.round(speed);
    document.getElementById('gear').textContent = 'AUTO';

    // Speed vignette effect - intensifies at high speeds
    const speedVignette = document.getElementById('speed-vignette');
    if (speedVignette) {
        if (speed > 200) {
            speedVignette.classList.add('active');
            const intensity = Math.min((speed - 200) / 150, 1);
            speedVignette.style.opacity = intensity * 0.5;
        } else {
            speedVignette.classList.remove('active');
        }
    }

    // Realistic tire temps based on speed and cornering
    const baseTempIncrease = speed * 0.04;
    const corneringLoad = Math.abs(controls.currentSteering) * 10;
    gameState.tireTempFL = Math.min(120, 85 + baseTempIncrease + corneringLoad + Math.random() * 3);
    gameState.tireTempFR = Math.min(120, 85 + baseTempIncrease + corneringLoad + Math.random() * 3);
    gameState.tireTempRL = Math.min(120, 85 + baseTempIncrease + corneringLoad * 0.8 + Math.random() * 3);
    gameState.tireTempRR = Math.min(120, 85 + baseTempIncrease + corneringLoad * 0.8 + Math.random() * 3);

    updateTireDisplay('fl', gameState.tireTempFL);
    updateTireDisplay('fr', gameState.tireTempFR);
    updateTireDisplay('rl', gameState.tireTempRL);
    updateTireDisplay('rr', gameState.tireTempRR);

    // Lap times
    if (gameState.running) {
        const currentTime = (Date.now() - gameState.lapStartTime) / 1000;
        document.getElementById('current-time').textContent = formatTime(currentTime);

        if (gameState.bestLapTime) {
            const delta = currentTime - gameState.bestLapTime;
            document.getElementById('delta-time').textContent = (delta >= 0 ? '+' : '') + delta.toFixed(3);
        }
    }

    // Calculate race position
    const allCars = [
        { lap: gameState.currentLap, position: gameState.position.clone(), isPlayer: true },
        ...aiCars.map(ai => ({ lap: ai.currentLap, position: ai.position.clone(), isPlayer: false }))
    ];

    // Sort by lap then by progress around track
    allCars.sort((a, b) => {
        if (b.lap !== a.lap) return b.lap - a.lap;

        // Calculate progress (angle around track)
        const angleA = Math.atan2(a.position.z, a.position.x);
        const angleB = Math.atan2(b.position.z, b.position.x);
        return angleB - angleA;
    });

    // Find player position
    const playerRacePosition = allCars.findIndex(car => car.isPlayer) + 1;
    const positionSuffix = playerRacePosition === 1 ? 'st' :
                           playerRacePosition === 2 ? 'nd' :
                           playerRacePosition === 3 ? 'rd' : 'th';
    document.getElementById('position').textContent = `${playerRacePosition}${positionSuffix} / ${allCars.length}`;

    // Update large position indicator (Super Star Car style)
    const positionLargeEl = document.getElementById('position-large');
    const positionSuffixEl = document.getElementById('position-suffix');
    if (positionLargeEl) positionLargeEl.textContent = playerRacePosition;
    if (positionSuffixEl) positionSuffixEl.textContent = positionSuffix;

    // DRS/ERS
    document.getElementById('drs-status').textContent = gameState.drsActive ? 'ACTIVE' :
        (gameState.drsAvailable ? 'AVAILABLE' : 'DISABLED');
    document.getElementById('drs-indicator').className = gameState.drsActive ? 'system-indicator active' :
        (gameState.drsAvailable ? 'system-indicator available' : 'system-indicator');

    document.getElementById('ers-level').textContent = Math.round(gameState.ers) + '%';
    document.getElementById('ers-indicator').className = controls.ers && gameState.ers > 0 ?
        'system-indicator active' : 'system-indicator';
}

function updateTireDisplay(tire, temp) {
    const tempElement = document.getElementById('temp-' + tire);
    const tireElement = document.getElementById('tire-' + tire);

    if (!tempElement || !tireElement) return; // Skip if elements don't exist

    tempElement.textContent = Math.round(temp) + '°C';

    if (temp > 105) {
        tireElement.className = 'tire hot';
    } else if (temp >= 95 && temp <= 105) {
        tireElement.className = 'tire optimal';
    } else {
        tireElement.className = 'tire';
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

// Pit stop system
function checkPitLaneEntry() {
    const carPos = gameState.position;

    // Pit lane entry zone is near start/finish line, offset to the side
    const pitEntryZone = {
        x: 210,
        z: -5,
        width: 50,
        depth: 30
    };

    // Check if car is in pit entry zone
    const inPitZone =
        carPos.x > pitEntryZone.x - pitEntryZone.width/2 &&
        carPos.x < pitEntryZone.x + pitEntryZone.width/2 &&
        carPos.z > pitEntryZone.z - pitEntryZone.depth/2 &&
        carPos.z < pitEntryZone.z + pitEntryZone.depth/2;

    // Only allow pits after lap 1 and if tire wear or damage is significant
    gameState.canEnterPits = inPitZone &&
                             gameState.currentLap > 1 &&
                             gameState.raceStarted &&
                             (gameState.tireWear < 50 || gameState.damage > 20);

    // Update HUD indicator
    const pitStatus = document.getElementById('pit-status');
    if (pitStatus) {
        if (gameState.inPitStop) {
            pitStatus.textContent = 'IN PROGRESS';
            pitStatus.style.color = '#ffd700';
        } else if (gameState.canEnterPits) {
            pitStatus.textContent = 'AVAILABLE (Press P)';
            pitStatus.style.color = '#00ff00';
        } else if (gameState.tireWear < 50 || gameState.damage > 20) {
            pitStatus.textContent = 'NEEDED (Go to pit lane)';
            pitStatus.style.color = '#ff8800';
        } else {
            pitStatus.textContent = 'NOT NEEDED';
            pitStatus.style.color = '#888';
        }
    }
}

function enterPitStop() {
    gameState.inPitStop = true;
    gameState.pitStopTimer = gameState.pitStopDuration;
    gameState.velocity = 0; // Stop the car

    // Show pit stop overlay
    const overlay = document.getElementById('pit-stop-overlay');
    if (overlay) overlay.style.display = 'block';
}

function updatePitStop(dt) {
    if (gameState.inPitStop) {
        gameState.pitStopTimer -= dt;

        // Update timer display
        const timerDisplay = document.getElementById('pit-timer');
        if (timerDisplay) {
            timerDisplay.textContent = Math.max(0, gameState.pitStopTimer).toFixed(1);
        }

        // Complete pit stop when timer reaches 0
        if (gameState.pitStopTimer <= 0) {
            completePitStop();
        }
    }
}

function completePitStop() {
    // Reset tire wear and damage
    gameState.tireWear = 100;
    gameState.damage = 0;

    // Exit pit stop
    gameState.inPitStop = false;
    gameState.canEnterPits = false;

    // Hide overlay
    const overlay = document.getElementById('pit-stop-overlay');
    if (overlay) overlay.style.display = 'none';

    // Update displays
    const tireWearBar = document.getElementById('tire-wear-bar');
    if (tireWearBar) tireWearBar.style.width = '100%';

    const damageBar = document.getElementById('damage-bar');
    if (damageBar) damageBar.style.width = '0%';
}

// Track boundary collision system
function checkTrackBoundaries() {
    const carPos = gameState.position;
    const layoutId = careerState.currentCircuit || 'monaco';
    const layout = trackLayouts[layoutId];

    let innerRadius, outerRadius;

    // Calculate track boundaries based on layout type (WIDER TRACK)
    if (layout.type === 'circular') {
        innerRadius = layout.radius * 0.8;   // Inner boundary (wider track)
        outerRadius = layout.radius * 1.5;   // Outer boundary (wider track)
    } else if (layout.type === 'oval') {
        innerRadius = Math.min(layout.width, layout.height) * 0.4;
        outerRadius = Math.max(layout.width, layout.height) * 0.75;
    } else {
        // For complex tracks, use rough estimates (wider)
        innerRadius = 160;
        outerRadius = 300;
    }

    const distanceFromCenter = Math.sqrt(carPos.x * carPos.x + carPos.z * carPos.z);

    // Check if car hit outer barrier
    if (distanceFromCenter > outerRadius) {
        handleBarrierCollision(carPos, outerRadius, false);
        return true;
    }

    // Check if car hit inner barrier
    if (distanceFromCenter < innerRadius) {
        handleBarrierCollision(carPos, innerRadius, true);
        return true;
    }

    return false;
}

function handleBarrierCollision(carPos, radius, isInner) {
    // Calculate angle from center
    const angle = Math.atan2(carPos.z, carPos.x);

    // Push car back to track boundary
    if (isInner) {
        carPos.x = Math.cos(angle) * (radius + 2);
        carPos.z = Math.sin(angle) * (radius + 2);
    } else {
        carPos.x = Math.cos(angle) * (radius - 2);
        carPos.z = Math.sin(angle) * (radius - 2);
    }

    // Reduce speed significantly on impact
    gameState.velocity *= 0.3;

    // Add damage based on impact speed
    const impactDamage = Math.min(15, gameState.speed / 20);
    gameState.damage = Math.min(100, gameState.damage + impactDamage);

    // Update damage bar
    const damageBar = document.getElementById('damage-bar');
    if (damageBar) {
        damageBar.style.width = gameState.damage + '%';
    }

    // Visual feedback - flash screen red briefly
    const canvas = document.querySelector('canvas');
    if (canvas && gameState.speed > 50) {
        canvas.style.filter = 'brightness(1.3) saturate(1.5)';
        setTimeout(() => {
            canvas.style.filter = '';
        }, 100);
    }
}

// Check lap completion
function checkLapCompletion() {
    const carPos = gameState.position;

    gameState.checkpoints.forEach((checkpoint, index) => {
        const dist = Math.sqrt(
            Math.pow(carPos.x - checkpoint.x, 2) +
            Math.pow(carPos.z - checkpoint.z, 2)
        );

        if (dist < 20 && !checkpoint.passed) {
            checkpoint.passed = true;

            if (gameState.checkpoints.every(cp => cp.passed)) {
                completeLap();
            }
        }
    });

    gameState.drsAvailable = Math.abs(carPos.x - 230) < 50 && Math.abs(carPos.z) < 30;
}

function completeLap() {
    const lapTime = (Date.now() - gameState.lapStartTime) / 1000;
    gameState.lastLapTime = lapTime;

    if (!gameState.bestLapTime || lapTime < gameState.bestLapTime) {
        gameState.bestLapTime = lapTime;
        document.getElementById('best-time').textContent = formatTime(lapTime);
    }

    gameState.currentLap++;
    gameState.lapStartTime = Date.now();
    gameState.checkpoints.forEach(cp => cp.passed = false);

    if (gameState.currentLap > gameState.totalLaps) {
        // Race finished!
        gameState.running = false;

        // Calculate final position
        const allCars = [
            { lap: gameState.currentLap - 1, position: gameState.position.clone(), isPlayer: true },
            ...aiCars.map(ai => ({ lap: ai.currentLap, position: ai.position.clone(), isPlayer: false }))
        ];

        allCars.sort((a, b) => {
            if (b.lap !== a.lap) return b.lap - a.lap;
            const angleA = Math.atan2(a.position.z, a.position.x);
            const angleB = Math.atan2(b.position.z, b.position.x);
            return angleB - angleA;
        });

        const playerRacePosition = allCars.findIndex(car => car.isPlayer) + 1;
        gameState.finishPosition = playerRacePosition;

        // Show results screen
        setTimeout(() => {
            showRaceResults();
        }, 2000);
    }
}

// Fixed timestep animation loop
const fixedTimeStep = 1 / 60;
let lastTime = 0;
let accumulator = 0;

function animate(currentTime) {
    requestAnimationFrame(animate);

    if (!lastTime) lastTime = currentTime;
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    accumulator += deltaTime;

    if (gameState.running) {
        // Update starting lights sequence
        updateStartingLights(deltaTime);

        // Fixed timestep physics (prevents glitching)
        while (accumulator >= fixedTimeStep) {
            updatePhysics(fixedTimeStep);
            accumulator -= fixedTimeStep;
        }

        // Update particles
        updateParticles(deltaTime);

        // Smooth control interpolation
        const lerpFactor = 0.15;
        controls.currentThrottle += (Number(controls.throttle) - controls.currentThrottle) * lerpFactor;
        controls.currentBrake += (Number(controls.brake) - controls.currentBrake) * lerpFactor;

        let targetSteering = 0;
        if (controls.left) targetSteering = 1;
        if (controls.right) targetSteering = -1;
        controls.currentSteering += (targetSteering - controls.currentSteering) * lerpFactor;

        // Update arcade physics
        updateArcadePhysics(deltaTime);

        // Update AI cars
        updateAICars(deltaTime);

        // Update wheel rotation visuals
        const wheelRotationSpeed = gameState.velocity * 0.1;
        playerCar.wheels.forEach((wheel, index) => {
            wheel.rotation.x += wheelRotationSpeed * deltaTime;
        });

        // Smooth camera movement
        updateCamera();
        checkLapCompletion();

        // Update new Super Star Car systems
        updateTireWear(deltaTime);
        checkCollisions();
        updateKERS(deltaTime);
        drawMiniMap();
        checkTrackBoundaries();
        checkPitLaneEntry();
        updatePitStop(deltaTime);

        updateHUD();

        // Update motion blur based on speed
        const speedNormalized = Math.min(gameState.velocity / 350, 1.0);
        motionBlurPass.uniforms.velocityFactor.value = speedNormalized * 0.8;

        // Calculate direction based on car rotation
        const blurAngle = gameState.rotation + Math.PI / 2;
        motionBlurPass.uniforms.direction.value.set(
            Math.cos(blurAngle),
            Math.sin(blurAngle) * 0.3
        );

        // Update film grain time
        filmGrainPass.uniforms.time.value = currentTime * 0.001;

        // Increase chromatic aberration at high speeds
        chromaticPass.uniforms.amount.value = 0.001 + speedNormalized * 0.003;
    }

    // Render with post-processing effects
    composer.render();
}

function updatePhysics(dt) {
    // Legacy function - now uses arcade physics
}

// Update starting lights sequence
function updateStartingLights(dt) {
    if (!gameState.raceStarted && gameState.running) {
        // Show starting lights HUD
        const hudElement = document.getElementById('start-lights-hud');
        if (hudElement) {
            hudElement.style.display = 'flex';
        }

        gameState.startLightTimer += dt;

        // Starting sequence timing (1 second per light, then random delay for green)
        if (gameState.startLightSequence === 0 && gameState.startLightTimer >= 1.0) {
            gameState.startLightSequence = 1;
            gameState.startLightTimer = 0;
        } else if (gameState.startLightSequence >= 1 && gameState.startLightSequence < 5 && gameState.startLightTimer >= 1.0) {
            gameState.startLightSequence++;
            gameState.startLightTimer = 0;
        } else if (gameState.startLightSequence === 5 && gameState.startLightTimer >= (2 + Math.random() * 2)) {
            // Random delay between 2-4 seconds before green (realistic F1)
            gameState.startLightSequence = 6; // GREEN / GO!
            gameState.raceStarted = true;
            gameState.lapStartTime = Date.now();
        }

        // Update HUD lights
        for (let i = 1; i <= 5; i++) {
            const lightElement = document.getElementById(`light-${i}`);
            if (lightElement) {
                if (i <= gameState.startLightSequence && gameState.startLightSequence < 6) {
                    lightElement.classList.add('red');
                    lightElement.classList.remove('green');
                } else if (gameState.startLightSequence === 6) {
                    lightElement.classList.remove('red');
                    lightElement.classList.add('green');
                } else {
                    lightElement.classList.remove('red', 'green');
                }
            }
        }

        // Show GO message
        const messageElement = document.getElementById('start-message');
        if (messageElement && gameState.startLightSequence === 6) {
            messageElement.style.display = 'block';
        }

        // Hide HUD after race starts
        if (gameState.raceStarted && gameState.startLightTimer >= 2.0) {
            if (hudElement) {
                hudElement.style.display = 'none';
            }
        }

        // Update physical lights based on sequence
        if (startLightGantry && startLightGantry.lights) {
            // Red lights - turn on progressively
            for (let i = 0; i < 5; i++) {
                const isOn = i < gameState.startLightSequence && gameState.startLightSequence < 6;
                const intensity = isOn ? 1.0 : 0;

                startLightGantry.lights[i].meshes.forEach(mesh => {
                    mesh.material.color.setHex(isOn ? 0xff0000 : 0x2a0000);
                    mesh.material.emissive.setHex(isOn ? 0xff0000 : 0x000000);
                    mesh.material.emissiveIntensity = isOn ? 0.8 : 0;
                });

                startLightGantry.lights[i].pointLights.forEach(light => {
                    light.intensity = isOn ? 8 : 0;
                });
            }

            // Green lights - turn on when sequence reaches 6
            const greenOn = gameState.startLightSequence === 6;
            startLightGantry.greenLights.meshes.forEach(mesh => {
                mesh.material.color.setHex(greenOn ? 0x00ff00 : 0x002a00);
                mesh.material.emissive.setHex(greenOn ? 0x00ff00 : 0x000000);
                mesh.material.emissiveIntensity = greenOn ? 1.0 : 0;
            });

            startLightGantry.greenLights.pointLights.forEach(light => {
                light.intensity = greenOn ? 15 : 0;
            });

            // Turn off green after 2 seconds
            if (gameState.startLightSequence === 6 && gameState.startLightTimer >= 2.0) {
                startLightGantry.greenLights.meshes.forEach(mesh => {
                    mesh.material.emissiveIntensity = 0;
                });
                startLightGantry.greenLights.pointLights.forEach(light => {
                    light.intensity = 0;
                });
            }
        }
    }
}

// AI Racing Logic
function updateAICars(dt) {
    if (!gameState.raceStarted) {
        aiCars.forEach(ai => {
            ai.velocity = 0;
        });
        return;
    }

    const trackRadius = 200;
    const centerX = 0;
    const centerZ = 0;

    aiCars.forEach((ai, index) => {
        // Calculate distance to track center
        const dx = ai.position.x - centerX;
        const dz = ai.position.z - centerZ;
        const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);

        // Each AI car has a slightly different racing line for variety (WIDER TRACK)
        const lineVariation = (index % 3) * 0.05; // Different racing lines
        const targetRadius = trackRadius * (1.1 + lineVariation); // Racing line on wider track
        const currentAngle = Math.atan2(dz, dx);

        // AI tries to stay on racing line (within track boundaries)
        const targetX = Math.cos(currentAngle) * targetRadius;
        const targetZ = Math.sin(currentAngle) * targetRadius;

        // Calculate desired rotation to follow track
        const nextAngle = currentAngle + (ai.velocity / 3600) * dt; // Speed determines angle change
        const nextX = Math.cos(nextAngle) * targetRadius;
        const nextZ = Math.sin(nextAngle) * targetRadius;

        const targetRotation = Math.atan2(nextZ - ai.position.z, nextX - ai.position.x) - Math.PI / 2;

        // Smooth rotation toward target
        let rotationDiff = targetRotation - ai.rotation;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        ai.rotation += rotationDiff * ai.skill * 0.1;

        // AGGRESSIVE RACING - Calculate position relative to player
        const playerAngle = Math.atan2(gameState.position.z, gameState.position.x);
        const aiAngle = Math.atan2(ai.position.z, ai.position.x);
        let angleDiff = playerAngle - aiAngle;

        // Normalize angle difference to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Calculate if AI is ahead or behind (positive = player ahead, negative = AI ahead)
        const lapDiff = gameState.currentLap - ai.currentLap;
        const positionDiff = lapDiff + (angleDiff / (Math.PI * 2));

        // Distance to player
        const distToPlayer = Math.sqrt(
            Math.pow(gameState.position.x - ai.position.x, 2) +
            Math.pow(gameState.position.z - ai.position.z, 2)
        );

        // RUBBER-BANDING: AI gets faster when behind, slower when ahead
        let speedBoost = 1.0;
        if (positionDiff > 0.05) {
            // Player is ahead - AI speeds up to catch up (AGGRESSIVE)
            speedBoost = 1.2 + Math.min(positionDiff * 0.3, 0.4);
        } else if (positionDiff < -0.05) {
            // AI is ahead - slows down slightly to keep race competitive
            speedBoost = 0.95 - Math.min(Math.abs(positionDiff) * 0.1, 0.15);
        }

        // Extra boost when close to player (battle mode)
        if (distToPlayer < 30 && Math.abs(positionDiff) < 0.1) {
            speedBoost *= 1.15; // 15% extra speed when racing wheel-to-wheel
        }

        const adjustedTargetSpeed = ai.targetSpeed * speedBoost;

        // AI acceleration and speed control
        const speedDiff = adjustedTargetSpeed - ai.velocity;

        if (speedDiff > 0) {
            // Accelerate - MORE AGGRESSIVE when chasing player
            let accelRate = 25 * ai.aggression * (positionDiff > 0 ? 1.3 : 1.0);
            if (ai.velocity < 80) accelRate = 35 * ai.aggression * (positionDiff > 0 ? 1.3 : 1.0);
            else if (ai.velocity < 140) accelRate = 25 * ai.aggression * (positionDiff > 0 ? 1.3 : 1.0);
            else if (ai.velocity < 200) accelRate = 18 * ai.aggression * (positionDiff > 0 ? 1.3 : 1.0);
            else accelRate = 10 * ai.aggression * (positionDiff > 0 ? 1.3 : 1.0);

            ai.velocity += accelRate * dt;
        } else {
            // Brake if too fast
            ai.velocity -= 8 * dt;
        }

        // Air drag
        const speedRatio = ai.velocity / 350;
        const dragForce = speedRatio * speedRatio * 12;
        ai.velocity -= dragForce * dt;

        // Clamp velocity with adjusted target
        ai.velocity = Math.max(0, Math.min(adjustedTargetSpeed, ai.velocity));

        // Move AI car
        const forward = new THREE.Vector3(
            Math.sin(ai.rotation),
            0,
            Math.cos(ai.rotation)
        );

        const velocityMS = ai.velocity / 3.6;
        ai.position.x += forward.x * velocityMS * dt;
        ai.position.z += forward.z * velocityMS * dt;

        // AI boundary collision check (WIDER TRACK)
        const aiDistFromCenter = Math.sqrt(ai.position.x * ai.position.x + ai.position.z * ai.position.z);
        const innerBound = trackRadius * 0.8;
        const outerBound = trackRadius * 1.5;

        if (aiDistFromCenter > outerBound) {
            const aiAngle = Math.atan2(ai.position.z, ai.position.x);
            ai.position.x = Math.cos(aiAngle) * (outerBound - 2);
            ai.position.z = Math.sin(aiAngle) * (outerBound - 2);
            ai.velocity *= 0.4; // Slow down AI on collision
        } else if (aiDistFromCenter < innerBound) {
            const aiAngle = Math.atan2(ai.position.z, ai.position.x);
            ai.position.x = Math.cos(aiAngle) * (innerBound + 2);
            ai.position.z = Math.sin(aiAngle) * (innerBound + 2);
            ai.velocity *= 0.4; // Slow down AI on collision
        }

        // Update mesh
        ai.mesh.position.copy(ai.position);
        ai.mesh.rotation.y = ai.rotation;

        // Rotate wheels
        const wheelRotationSpeed = ai.velocity * 0.1;
        ai.wheels.forEach(wheel => {
            wheel.rotation.x += wheelRotationSpeed * dt;
        });

        // Check AI lap completion
        checkAILapCompletion(ai, trackRadius);
    });
}

// Check if AI car completed a lap
function checkAILapCompletion(ai, trackRadius) {
    const checkpoints = [
        { x: trackRadius * 1.15, z: 0 },
        { x: 0, z: trackRadius * 1.15 },
        { x: -trackRadius * 1.15, z: 0 },
        { x: 0, z: -trackRadius * 1.15 }
    ];

    checkpoints.forEach((checkpoint, index) => {
        const dist = Math.sqrt(
            Math.pow(ai.position.x - checkpoint.x, 2) +
            Math.pow(ai.position.z - checkpoint.z, 2)
        );

        if (dist < 20 && !ai.checkpoints[index].passed) {
            ai.checkpoints[index].passed = true;

            if (ai.checkpoints.every(cp => cp.passed)) {
                ai.currentLap++;
                ai.checkpoints.forEach(cp => cp.passed = false);
            }
        }
    });
}

function updateArcadePhysics(dt) {
    // Don't allow movement until race has started
    if (!gameState.raceStarted) {
        gameState.velocity = 0;
        return;
    }

    // Apply car upgrades to performance
    const engineBoost = 1 + (careerState.carUpgrades.engine - 1) * 0.08; // +8% per level
    const aeroBoost = 1 + (careerState.carUpgrades.aerodynamics - 1) * 0.05; // +5% per level
    const tireBoost = 1 + (careerState.carUpgrades.tires - 1) * 0.06; // +6% per level
    const brakeBoost = 1 + (careerState.carUpgrades.brakes - 1) * 0.07; // +7% per level

    const maxSpeed = 350 * engineBoost; // km/h - F1 top speed with engine upgrades
    const braking = 250 * brakeBoost; // km/h per second - powerful F1 brakes with brake upgrades
    const drag = 12 / aeroBoost; // air resistance reduced by aero upgrades
    const turnSpeed = 1.8 * tireBoost; // radians per second improved by tire upgrades

    // Realistic F1 acceleration with progressive gear changes
    // Each gear has different acceleration - lower gears faster, higher gears slower
    // Simulates the time it takes to shift through 8 gears
    let baseAcceleration;

    if (gameState.velocity < 80) {
        // 1st-2nd gear: Fastest acceleration (40 km/h/s)
        baseAcceleration = 40;
    } else if (gameState.velocity < 140) {
        // 3rd-4th gear: Good acceleration (28 km/h/s)
        baseAcceleration = 28;
    } else if (gameState.velocity < 200) {
        // 5th gear: Moderate acceleration (20 km/h/s)
        baseAcceleration = 20;
    } else if (gameState.velocity < 260) {
        // 6th-7th gear: Slower acceleration (14 km/h/s)
        baseAcceleration = 14;
    } else {
        // 8th gear: Very slow top speed run (9 km/h/s)
        baseAcceleration = 9;
    }

    // Apply damage and tire wear performance penalties
    const damageMultiplier = 1 - (gameState.damage / 100) * 0.5; // Up to 50% slower with full damage
    const tireWearMultiplier = 0.7 + (gameState.tireWear / 100) * 0.3; // Down to 70% grip with worn tires

    // Throttle - progressive acceleration like real F1
    if (controls.currentThrottle > 0.05) {
        let accel = baseAcceleration * controls.currentThrottle * damageMultiplier;

        // KERS boost (lap-limited, recharges on braking)
        if (controls.ers && gameState.kers > 10) {
            accel *= 1.3;
            gameState.kers -= 0.8; // Drains faster than old ERS
        }

        // DRS boost (drag reduction - helps most at high speed)
        if (controls.drs && gameState.drsAvailable) {
            gameState.drsActive = true;
            accel *= 1.15;
        } else {
            gameState.drsActive = false;
        }

        gameState.velocity += accel * dt;
        gameState.fuel -= 0.005 * controls.currentThrottle;
    } else {
        gameState.drsActive = false;
    }

    // Braking - powerful F1 brakes with tire smoke effect
    if (controls.currentBrake > 0.05) {
        gameState.velocity -= braking * controls.currentBrake * dt;

        // Generate tire smoke when braking hard and moving fast
        if (controls.currentBrake > 0.3 && gameState.velocity > 80 && Math.random() > 0.7) {
            // Create smoke from rear wheels
            const rearLeft = new THREE.Vector3(-0.95, -0.25, -1.8);
            const rearRight = new THREE.Vector3(0.95, -0.25, -1.8);

            rearLeft.applyQuaternion(playerCar.mesh.quaternion);
            rearRight.applyQuaternion(playerCar.mesh.quaternion);
            rearLeft.add(playerCar.mesh.position);
            rearRight.add(playerCar.mesh.position);

            createSmokeParticle(rearLeft);
            createSmokeParticle(rearRight);
        }
    }

    // Air resistance (increases with speed squared - realistic)
    const speedRatio = gameState.velocity / maxSpeed;
    const dragForce = speedRatio * speedRatio * drag;
    gameState.velocity -= dragForce * dt;

    // Clamp velocity (no negative speed, max speed limit)
    gameState.velocity = Math.max(0, Math.min(maxSpeed, gameState.velocity));

    // Steering - harder to turn at high speeds (realistic), affected by tire wear
    const speedFactor = Math.max(0.2, 1 - (gameState.velocity / maxSpeed) * 0.8);
    gameState.rotation += controls.currentSteering * turnSpeed * speedFactor * tireWearMultiplier * dt;

    // Move car forward in the direction it's facing
    const forward = new THREE.Vector3(
        Math.sin(gameState.rotation),
        0,
        Math.cos(gameState.rotation)
    );

    // Convert km/h to m/s (divide by 3.6)
    const velocityMS = gameState.velocity / 3.6;
    gameState.position.x += forward.x * velocityMS * dt;
    gameState.position.z += forward.z * velocityMS * dt;

    // Update car mesh position and rotation
    playerCar.mesh.position.copy(gameState.position);
    playerCar.mesh.rotation.y = gameState.rotation;

    // Update speed for HUD
    gameState.speed = gameState.velocity;

    // Fixed gear - F1 automatic
    gameState.gear = 8;

    // ERS recharge when not using
    if (!controls.ers && gameState.ers < 100) {
        gameState.ers += 0.1;
    }
}

function updateCamera() {
    // Dynamic lerp factor - faster when car is accelerating/moving fast
    const speedRatio = gameState.velocity / 350;
    const baseLerpFactor = 0.25; // Much faster base tracking
    const lerpFactor = baseLerpFactor + (speedRatio * 0.15); // Even faster at high speed

    if (cameraMode === 'chase') {
        // Further back camera for better track visibility
        const cameraOffset = new THREE.Vector3(0, 6, -18);
        cameraOffset.applyQuaternion(playerCar.mesh.quaternion);
        const targetPosition = new THREE.Vector3().copy(playerCar.mesh.position).add(cameraOffset);

        camera.position.lerp(targetPosition, lerpFactor);

        const lookTarget = new THREE.Vector3().copy(playerCar.mesh.position);
        lookTarget.y += 1;
        camera.lookAt(lookTarget);
    } else if (cameraMode === 'birds-eye') {
        // Bird's eye view - top-down perspective
        const targetPosition = new THREE.Vector3(
            playerCar.mesh.position.x,
            playerCar.mesh.position.y + 40, // High above the car
            playerCar.mesh.position.z
        );

        camera.position.lerp(targetPosition, lerpFactor);
        camera.lookAt(playerCar.mesh.position);
    } else {
        // Cockpit view - Enhanced F1 driver's perspective
        const cockpitOffset = new THREE.Vector3(0, 0.9, 0.2); // Lower, more realistic position
        cockpitOffset.applyQuaternion(playerCar.mesh.quaternion);
        const targetPosition = new THREE.Vector3().copy(playerCar.mesh.position).add(cockpitOffset);

        camera.position.lerp(targetPosition, lerpFactor * 2.0); // Smoother tracking
        camera.fov = 85; // Wider FOV for cockpit view

        const lookTarget = new THREE.Vector3(0, 0.2, 20); // Look slightly down at track
        lookTarget.applyQuaternion(playerCar.mesh.quaternion);
        lookTarget.add(playerCar.mesh.position);
        camera.lookAt(lookTarget);
    }

    // Reset FOV for other camera modes
    if (cameraMode !== 'cockpit' && camera.fov !== 75) {
        camera.fov = 75;
        camera.updateProjectionMatrix();
    } else if (cameraMode === 'cockpit' && camera.fov !== 85) {
        camera.updateProjectionMatrix();
    }
}

// Setup menu functions
window.openSetup = function() {
    document.getElementById('setup-menu').style.display = 'block';
};

window.closeSetup = function() {
    document.getElementById('setup-menu').style.display = 'none';
};

window.resetSetup = function() {
    document.getElementById('front-wing').value = 5;
    document.getElementById('rear-wing').value = 7;
    document.getElementById('brake-balance').value = 50;
    document.getElementById('tire-pressure').value = 23;
    updateSetupValues();
};

function updateSetupValues() {
    gameState.carSetup.frontWing = parseInt(document.getElementById('front-wing').value);
    gameState.carSetup.rearWing = parseInt(document.getElementById('rear-wing').value);
    gameState.carSetup.brakeBalance = parseInt(document.getElementById('brake-balance').value);
    gameState.carSetup.tirePressure = parseFloat(document.getElementById('tire-pressure').value);

    document.getElementById('fw-value').textContent = gameState.carSetup.frontWing;
    document.getElementById('rw-value').textContent = gameState.carSetup.rearWing;
    document.getElementById('bb-value').textContent = gameState.carSetup.brakeBalance + '%';
    document.getElementById('tp-value').textContent = gameState.carSetup.tirePressure + ' PSI';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#setup-menu input[type="range"]').forEach(input => {
        input.addEventListener('input', updateSetupValues);
    });

    // Load saved career progress
    loadCareerProgress();
    updateAllMenus();
});

// ========== MENU NAVIGATION ==========
window.showMainMenu = function() {
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('career-screen').style.display = 'none';
    document.getElementById('profile-screen').style.display = 'none';
    document.getElementById('garage-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('results-screen').style.display = 'none';
    updateAllMenus();
};

window.showCareerMode = function() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('career-screen').style.display = 'block';
    populateRaceCalendar();
    updateCareerHeader();
};

window.showQuickRace = function() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
};

window.showProfile = function() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('profile-screen').style.display = 'block';
    updateProfileScreen();
};

window.showGarage = function() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('garage-screen').style.display = 'block';
    populateUpgradeList();
    updateGarageHeader();
};

// ========== CAREER MODE FUNCTIONS ==========
const circuits = [
    { id: 'monaco', name: 'Monaco Grand Prix', difficulty: 'Hard', prize: 15000, laps: 10 },
    { id: 'arcport', name: 'Arcport Circuit', difficulty: 'Medium', prize: 12000, laps: 12 },
    { id: 'yafield', name: 'Yafield Park', difficulty: 'Easy', prize: 10000, laps: 15 },
    { id: 'riverside', name: 'Riverside Circuit', difficulty: 'Medium', prize: 13000, laps: 14 },
    { id: 'silverstone', name: 'Silverstone Circuit', difficulty: 'Hard', prize: 16000, laps: 10 }
];

function populateRaceCalendar() {
    const calendar = document.getElementById('race-calendar');
    calendar.innerHTML = '';

    circuits.forEach((circuit, index) => {
        const isUnlocked = careerState.unlockedCircuits.includes(circuit.id) || index === 0;
        const isCompleted = careerState.completedRaces[circuit.id];
        const stars = isCompleted ? isCompleted.stars : 0;

        const raceCard = document.createElement('div');
        raceCard.style.cssText = `
            background: rgba(255,255,255,0.05);
            padding: 20px;
            border-radius: 10px;
            border: 2px solid ${isUnlocked ? '#e10600' : '#555'};
            display: flex;
            justify-content: space-between;
            align-items: center;
            opacity: ${isUnlocked ? '1' : '0.5'};
            cursor: ${isUnlocked ? 'pointer' : 'not-allowed'};
        `;

        if (isUnlocked) {
            raceCard.onclick = () => startCareerRace(circuit);
        }

        raceCard.innerHTML = `
            <div>
                <h3 style="color: #ffd700; margin-bottom: 10px;">${circuit.name}</h3>
                <div style="color: #aaa;">
                    <span>Difficulty: ${circuit.difficulty}</span> |
                    <span>Laps: ${circuit.laps}</span> |
                    <span>Prize: $${circuit.prize}</span>
                </div>
                <div style="margin-top: 10px;">
                    ${isUnlocked ? (isCompleted ? `⭐ ${stars} stars earned` : '🔓 Available') : '🔒 Locked'}
                </div>
            </div>
            <div style="font-size: 48px;">
                ${isUnlocked ? '▶️' : '🔒'}
            </div>
        `;

        calendar.appendChild(raceCard);
    });
}

function startCareerRace(circuit) {
    careerState.currentCircuit = circuit.id;
    gameState.totalLaps = circuit.laps;

    // Hide career screen, start race
    document.getElementById('career-screen').style.display = 'none';
    console.log('Starting career race:', circuit.name);
    startSimulation();
}

function updateCareerHeader() {
    document.getElementById('current-season').textContent = careerState.currentSeason;
    document.getElementById('career-money').textContent = careerState.totalMoney.toLocaleString();
    document.getElementById('career-stars').textContent = careerState.totalStars;
    document.getElementById('career-level').textContent = careerState.level;
}

// ========== PROFILE FUNCTIONS ==========
function updateProfileScreen() {
    document.getElementById('profile-level').textContent = careerState.level;
    document.getElementById('profile-money').textContent = careerState.totalMoney.toLocaleString();
    document.getElementById('profile-stars').textContent = careerState.totalStars;
    document.getElementById('profile-races').textContent = careerState.totalRaces;
    document.getElementById('profile-trophies').textContent = careerState.totalTrophies;
    document.getElementById('profile-runnerups').textContent = careerState.totalRunnerUps;
}

// ========== GARAGE / UPGRADE FUNCTIONS ==========
const upgradeData = {
    engine: { name: 'Engine', icon: '🔧', baseCost: 5000, costMultiplier: 2, description: 'Increases top speed and acceleration' },
    aerodynamics: { name: 'Aerodynamics', icon: '💨', baseCost: 3000, costMultiplier: 1.8, description: 'Reduces drag, improves stability' },
    tires: { name: 'Tires', icon: '🏁', baseCost: 2000, costMultiplier: 1.5, description: 'Better grip in corners' },
    brakes: { name: 'Brakes', icon: '🛑', baseCost: 2000, costMultiplier: 1.5, description: 'Shorter braking distance' },
    kers: { name: 'KERS System', icon: '⚡', baseCost: 10000, costMultiplier: 2.5, description: 'Longer boost duration' }
};

function populateUpgradeList() {
    const upgradeList = document.getElementById('upgrade-list');
    upgradeList.innerHTML = '';

    Object.keys(upgradeData).forEach(key => {
        const upgrade = upgradeData[key];
        const currentLevel = careerState.carUpgrades[key];
        const cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.costMultiplier, currentLevel - 1));
        const canAfford = careerState.totalMoney >= cost;
        const isMaxLevel = currentLevel >= 10;

        const upgradeCard = document.createElement('div');
        upgradeCard.style.cssText = `
            background: rgba(255,255,255,0.05);
            padding: 20px;
            border-radius: 10px;
            border: 2px solid #00cc00;
        `;

        upgradeCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="color: #ffd700; margin-bottom: 10px;">${upgrade.icon} ${upgrade.name}</h3>
                    <p style="color: #aaa; margin-bottom: 15px;">${upgrade.description}</p>
                    <div style="background: #222; height: 20px; width: 300px; border-radius: 10px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #00cc00, #00ff00); height: 100%; width: ${currentLevel * 10}%;"></div>
                    </div>
                    <p style="margin-top: 10px;">Level: ${currentLevel} / 10</p>
                </div>
                <div style="text-align: center;">
                    ${!isMaxLevel ? `
                        <button class="btn"
                            style="background: ${canAfford ? '#00cc00' : '#666'}; font-size: 18px; padding: 15px 30px;"
                            onclick="${canAfford ? `buyUpgrade('${key}')` : ''}"
                            ${!canAfford ? 'disabled' : ''}>
                            ${canAfford ? `UPGRADE<br>$${cost.toLocaleString()}` : `NEED $${cost.toLocaleString()}`}
                        </button>
                    ` : '<div style="color: #ffd700; font-size: 20px;">✅ MAX LEVEL</div>'}
                </div>
            </div>
        `;

        upgradeList.appendChild(upgradeCard);
    });
}

window.buyUpgrade = function(upgradeKey) {
    const upgrade = upgradeData[upgradeKey];
    const currentLevel = careerState.carUpgrades[upgradeKey];
    const cost = Math.floor(upgrade.baseCost * Math.pow(upgrade.costMultiplier, currentLevel - 1));

    if (careerState.totalMoney >= cost && currentLevel < 10) {
        careerState.totalMoney -= cost;
        careerState.carUpgrades[upgradeKey]++;

        saveCareerProgress();
        populateUpgradeList();
        updateGarageHeader();

        console.log(`Upgraded ${upgrade.name} to level ${careerState.carUpgrades[upgradeKey]}`);
    }
};

function updateGarageHeader() {
    document.getElementById('garage-money').textContent = careerState.totalMoney.toLocaleString();
}

// ========== RACE RESULTS ==========
window.showRaceResults = function() {
    document.getElementById('results-screen').style.display = 'flex';

    // Calculate position, money, stars based on finish
    const position = gameState.finishPosition;
    let money = 0;
    let stars = 0;

    if (position === 1) {
        money = 10000;
        stars = 3;
        careerState.totalTrophies++;
    } else if (position === 2) {
        money = 6000;
        stars = 2;
        careerState.totalRunnerUps++;
    } else if (position === 3) {
        money = 3000;
        stars = 1;
        careerState.totalRunnerUps++;
    } else if (position <= 6) {
        money = 1000;
        stars = 0;
    }

    // Update career stats
    careerState.totalMoney += money;
    careerState.totalStars += stars;
    careerState.totalRaces++;
    careerState.level = Math.floor(careerState.totalRaces / 5) + 1;

    // Save race completion
    const currentCircuit = circuits.find(c => c.id === careerState.currentCircuit);
    if (currentCircuit) {
        if (!careerState.completedRaces[currentCircuit.id] || careerState.completedRaces[currentCircuit.id].stars < stars) {
            careerState.completedRaces[currentCircuit.id] = { stars, position };
        }
    }

    // Update results display
    const positionText = position === 1 ? '1st' : position === 2 ? '2nd' : position === 3 ? '3rd' : `${position}th`;
    document.getElementById('result-position').textContent = positionText;
    document.getElementById('result-money').textContent = money.toLocaleString();
    document.getElementById('result-stars').textContent = stars;
    document.getElementById('result-best-time').textContent = gameState.bestLapTime ? formatTime(gameState.bestLapTime) : '0:00.000';

    saveCareerProgress();
};

window.returnToCareer = function() {
    document.getElementById('results-screen').style.display = 'none';
    showCareerMode();
};

window.restartRace = function() {
    document.getElementById('results-screen').style.display = 'none';
    const currentCircuit = circuits.find(c => c.id === careerState.currentCircuit);
    if (currentCircuit) {
        startCareerRace(currentCircuit);
    }
};

// ========== SAVE / LOAD SYSTEM ==========
function saveCareerProgress() {
    try {
        localStorage.setItem('superStarCarSave', JSON.stringify(careerState));
        console.log('Career progress saved');
    } catch (e) {
        console.error('Failed to save:', e);
    }
}

function loadCareerProgress() {
    try {
        const saved = localStorage.getItem('superStarCarSave');
        if (saved) {
            const loadedData = JSON.parse(saved);
            Object.assign(careerState, loadedData);
            console.log('Career progress loaded');
        }
    } catch (e) {
        console.error('Failed to load:', e);
    }
}

function updateAllMenus() {
    updateCareerHeader();
    updateProfileScreen();
    updateGarageHeader();
}

// ========== MINI-MAP SYSTEM ==========
function drawMiniMap() {
    const canvas = document.getElementById('mini-map');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const trackRadius = 70; // Radius on mini-map

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw track using current track points
    if (currentTrackPoints.length > 0) {
        // Calculate scale to fit track on mini-map
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        currentTrackPoints.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });

        const trackWidth = maxX - minX;
        const trackHeight = maxZ - minZ;
        const scale = Math.min(140 / trackWidth, 140 / trackHeight);

        // Draw track outline
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 15;
        ctx.beginPath();
        currentTrackPoints.forEach((p, i) => {
            const x = centerX + p.x * scale;
            const y = centerY + p.z * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();

        // Draw track center line
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        currentTrackPoints.forEach((p, i) => {
            const x = centerX + p.x * scale;
            const y = centerY + p.z * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw start/finish line (at first point)
        const startX = centerX + currentTrackPoints[0].x * scale;
        const startY = centerY + currentTrackPoints[0].z * scale;
        ctx.fillStyle = '#fff';
        ctx.fillRect(startX - 2, startY - 8, 4, 16);
    }

    // Calculate scale for car positions (same as track)
    if (currentTrackPoints.length > 0) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        currentTrackPoints.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });

        const trackWidth = maxX - minX;
        const trackHeight = maxZ - minZ;
        const scale = Math.min(140 / trackWidth, 140 / trackHeight);

        // Draw AI cars
        aiCars.forEach((ai, index) => {
            const x = centerX + ai.position.x * scale;
            const y = centerY + ai.position.z * scale;

            ctx.fillStyle = ['#0066cc', '#00cc00', '#ffaa00', '#9900cc', '#00cccc'][index];
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw player car (larger, red)
        const playerX = centerX + gameState.position.x * scale;
        const playerY = centerY + gameState.position.z * scale;

        ctx.fillStyle = '#e10600';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(playerX, playerY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

// ========== TIRE WEAR SYSTEM ==========
function updateTireWear(dt) {
    if (!gameState.raceStarted) return;

    // Tire wear rate depends on:
    // - Speed (faster = more wear)
    // - Cornering (sharper = more wear)
    // - Tire upgrade level (better tires = less wear)

    const speedWear = (gameState.velocity / 350) * 0.15 * dt; // Base wear from speed
    const cornerWear = Math.abs(controls.currentSteering) * 0.3 * dt; // Cornering wear
    const tireUpgradeBonus = 1 - (careerState.carUpgrades.tires - 1) * 0.05; // Better tires wear slower

    const totalWear = (speedWear + cornerWear) * tireUpgradeBonus;
    gameState.tireWear = Math.max(0, gameState.tireWear - totalWear);

    // Update UI
    const wearPercent = Math.round(gameState.tireWear);
    document.getElementById('tire-wear-percent').textContent = wearPercent;
    document.getElementById('tire-wear-bar').style.width = wearPercent + '%';

    // Worn tires affect grip
    if (gameState.tireWear < 30) {
        gameState.needsPitStop = true;
    }
}

// ========== DAMAGE SYSTEM ==========
function checkCollisions() {
    if (!gameState.raceStarted) return;

    const trackRadius = 200;
    const distanceFromCenter = Math.sqrt(
        gameState.position.x * gameState.position.x +
        gameState.position.z * gameState.position.z
    );

    // Check if car hit barriers (too close to center or too far)
    const innerLimit = trackRadius * 0.92;
    const outerLimit = trackRadius * 1.32;

    if (distanceFromCenter < innerLimit || distanceFromCenter > outerLimit) {
        // Hit barrier! Apply damage based on speed
        const damageAmount = (gameState.velocity / 350) * 0.5; // Faster = more damage
        gameState.damage = Math.min(100, gameState.damage + damageAmount);

        // Slow down from collision
        gameState.velocity *= 0.95;

        // Update UI
        const damagePercent = Math.round(gameState.damage);
        document.getElementById('damage-percent').textContent = damagePercent;
        document.getElementById('damage-bar').style.width = (100 - damagePercent) + '%';

        if (gameState.damage < 30) {
            document.getElementById('damage-bar').style.background = '#00ff00';
        } else if (gameState.damage < 70) {
            document.getElementById('damage-bar').style.background = '#ffff00';
        } else {
            document.getElementById('damage-bar').style.background = '#ff0000';
        }
    }
}

// ========== LAP-LIMITED KERS SYSTEM ==========
function updateKERS(dt) {
    // KERS recharges when braking (kinetic energy recovery)
    if (controls.currentBrake > 0.1 && gameState.velocity > 50) {
        const recoveryRate = controls.currentBrake * gameState.velocity * 0.01;
        gameState.kers = Math.min(100, gameState.kers + recoveryRate * dt);
    }

    // Upgrade KERS affects max capacity
    const kersUpgradeBonus = 1 + (careerState.carUpgrades.kers - 1) * 0.1;
    gameState.maxKersPerLap = 100 * kersUpgradeBonus;

    // Update HUD
    document.getElementById('ers-level').textContent = Math.round(gameState.kers) + '%';

    // KERS availability indicator
    if (gameState.kers > 10) {
        document.getElementById('ers-indicator').className = 'system-indicator available';
    } else {
        document.getElementById('ers-indicator').className = 'system-indicator';
    }
}

// Start simulation
window.startSimulation = function() {
    console.log('Starting simulation...');
    document.getElementById('start-screen').style.display = 'none';

    // Reset race state
    gameState.running = true;
    gameState.raceStarted = false;
    gameState.startLightSequence = 0;
    gameState.startLightTimer = 0;
    gameState.currentLap = 1;
    gameState.lapStartTime = Date.now();
    gameState.bestLapTime = null;

    // Reset tire wear, damage, KERS
    gameState.tireWear = 100;
    gameState.damage = 0;
    gameState.kers = 100;
    gameState.needsPitStop = false;

    // Reset car position
    gameState.velocity = 0;
    gameState.position.set(230, 0.5, 3);
    gameState.rotation = 0;

    // Create HDR environment map for realistic reflections
    createProceduralEnvMap();

    createCircuit();

    // Get track radius from current layout
    const layoutId = careerState.currentCircuit || 'monaco';
    const layout = trackLayouts[layoutId];
    const trackRadius = layout.radius || 200;

    createStartingGrid(trackRadius); // Create starting grid positions
    createPitLaneMarkers(); // Create pit lane visual markers
    createAICars(); // Create AI opponent cars
    animate(0);
};

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
