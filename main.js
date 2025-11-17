import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Game State
const gameState = {
    running: false,
    currentLap: 1,
    totalLaps: 10,
    lapStartTime: 0,
    bestLapTime: null,
    lastLapTime: null,
    checkpoints: [],
    passedCheckpoint: false,
    fuel: 100,
    ers: 100,
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
    prevVelocity: new CANNON.Vec3(),
    smoothCameraPosition: new THREE.Vector3(),
    smoothCameraTarget: new THREE.Vector3()
};

// Controls with smooth interpolation
const controls = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    shiftUp: false,
    shiftDown: false,
    drs: false,
    ers: false,
    currentThrottle: 0,
    currentBrake: 0,
    currentSteering: 0
};

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 100, 1000);

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

// Enhanced Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.5);
scene.add(hemisphereLight);

// Physics World with better settings
const world = new CANNON.World();
world.gravity.set(0, -30, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.3;

// Allow sleeping for better performance
world.allowSleep = true;
world.solver.iterations = 15; // More iterations for stability
world.solver.tolerance = 0.001;

// Materials with realistic properties
const groundMaterial = new CANNON.Material('ground');
const wheelMaterial = new CANNON.Material('wheel');
const wheelGroundContact = new CANNON.ContactMaterial(wheelMaterial, groundMaterial, {
    friction: 1.8,
    restitution: 0.05,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e8
});
world.addContactMaterial(wheelGroundContact);

// Create Monaco-inspired Circuit
function createCircuit() {
    // Track surface
    const trackGeometry = new THREE.PlaneGeometry(600, 600);
    const trackMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.1
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.receiveShadow = true;
    scene.add(track);

    // Physics ground
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    // Track outline with barriers
    const points = [];
    const numPoints = 64;
    const trackRadius = 200;
    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const x = Math.cos(angle) * trackRadius;
        const z = Math.sin(angle) * trackRadius;
        points.push(new THREE.Vector3(x, 0, z));
    }

    // Inner barrier
    const innerCurve = new THREE.CatmullRomCurve3(points);
    const innerGeometry = new THREE.TubeGeometry(innerCurve, numPoints, 2, 8, true);
    const barrierMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.7,
        metalness: 0.3
    });
    const innerBarrier = new THREE.Mesh(innerGeometry, barrierMaterial);
    innerBarrier.castShadow = true;
    scene.add(innerBarrier);

    // Outer barrier
    const outerPoints = points.map(p => new THREE.Vector3(p.x * 1.3, 0, p.z * 1.3));
    const outerCurve = new THREE.CatmullRomCurve3(outerPoints);
    const outerGeometry = new THREE.TubeGeometry(outerCurve, numPoints, 2, 8, true);
    const outerBarrier = new THREE.Mesh(outerGeometry, barrierMaterial);
    outerBarrier.castShadow = true;
    scene.add(outerBarrier);

    // Grass around track
    const grassGeometry = new THREE.PlaneGeometry(800, 800);
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d5016,
        roughness: 0.9
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.1;
    grass.receiveShadow = true;
    scene.add(grass);

    // Start/Finish line
    const lineGeometry = new THREE.PlaneGeometry(30, 3);
    const lineMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.2
    });
    const startLine = new THREE.Mesh(lineGeometry, lineMaterial);
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(trackRadius * 1.15, 0.1, 0);
    scene.add(startLine);

    // Checkpoints for lap detection
    gameState.checkpoints = [
        { x: trackRadius * 1.15, z: 0, passed: false },
        { x: 0, z: trackRadius * 1.15, passed: false },
        { x: -trackRadius * 1.15, z: 0, passed: false },
        { x: 0, z: -trackRadius * 1.15, passed: false }
    ];
}

// Create Advanced F1 Car
function createF1Car() {
    const car = new THREE.Group();

    // Main chassis with better detail
    const chassisGeometry = new THREE.BoxGeometry(2, 0.8, 4.5);
    const chassisMaterial = new THREE.MeshStandardMaterial({
        color: 0xe10600,
        metalness: 0.6,
        roughness: 0.3
    });
    const chassis = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassis.castShadow = true;
    car.add(chassis);

    // Cockpit
    const cockpitGeometry = new THREE.BoxGeometry(1.5, 0.5, 2);
    const cockpitMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.8,
        roughness: 0.2
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.y = 0.6;
    cockpit.position.z = -0.3;
    cockpit.castShadow = true;
    car.add(cockpit);

    // Front wing
    const frontWingGeometry = new THREE.BoxGeometry(3, 0.1, 0.5);
    const wingMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.7,
        roughness: 0.3
    });
    const frontWing = new THREE.Mesh(frontWingGeometry, wingMaterial);
    frontWing.position.z = 2;
    frontWing.position.y = -0.2;
    frontWing.castShadow = true;
    car.add(frontWing);

    // Rear wing
    const rearWingGeometry = new THREE.BoxGeometry(2.5, 0.8, 0.2);
    const rearWing = new THREE.Mesh(rearWingGeometry, wingMaterial);
    rearWing.position.z = -2.5;
    rearWing.position.y = 0.8;
    rearWing.castShadow = true;
    car.add(rearWing);

    // Wheels with better detail
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32);
    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.5,
        roughness: 0.7
    });

    const wheelPositions = [
        { x: -1, z: 1.5 },
        { x: 1, z: 1.5 },
        { x: -1, z: -1.5 },
        { x: 1, z: -1.5 }
    ];

    car.wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, -0.3, pos.z);
        wheel.castShadow = true;
        car.add(wheel);
        car.wheels.push(wheel);
    });

    // Halo
    const haloGeometry = new THREE.TorusGeometry(0.6, 0.05, 16, 32, Math.PI);
    const haloMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.8,
        roughness: 0.2
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.y = 0.8;
    halo.position.z = 0;
    halo.rotation.x = Math.PI / 2;
    car.add(halo);

    scene.add(car);

    // Advanced Physics body
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.4, 2.25));
    const chassisBody = new CANNON.Body({
        mass: 740,
        material: new CANNON.Material()
    });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(230, 2, 0);
    chassisBody.linearDamping = 0.1; // Less damping for more realistic physics
    chassisBody.angularDamping = 0.3;
    world.addBody(chassisBody);

    // Advanced vehicle with better suspension
    const vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2
    });

    // Advanced suspension settings
    const wheelOptions = {
        radius: 0.4,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 50, // Stiffer F1 suspension
        suspensionRestLength: 0.2,
        frictionSlip: 8, // Better grip
        dampingRelaxation: 3,
        dampingCompression: 5,
        maxSuspensionForce: 150000, // Higher for F1
        rollInfluence: 0.005, // Minimal roll
        axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 1),
        maxSuspensionTravel: 0.15, // Limited travel like F1
        customSlidingRotationalSpeed: -50,
        useCustomSlidingRotationalSpeed: true
    };

    // Add wheels
    wheelOptions.chassisConnectionPointLocal.set(-1, 0, 1.5);
    vehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(1, 0, 1.5);
    vehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(-1, 0, -1.5);
    vehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(1, 0, -1.5);
    vehicle.addWheel(wheelOptions);

    vehicle.addToWorld(world);

    return { mesh: car, body: chassisBody, vehicle: vehicle };
}

const playerCar = createF1Car();

// Input handling
document.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') controls.throttle = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') controls.brake = true;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') controls.left = true;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') controls.right = true;
    if (e.key === 'Shift') controls.shiftUp = true;
    if (e.key === 'Control') controls.shiftDown = true;
    if (e.key === ' ') { controls.drs = true; e.preventDefault(); }
    if (e.key === 'e' || e.key === 'E') controls.ers = true;
    if (e.key === 'c' || e.key === 'C') {
        cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
    }
    if (e.key === 'r' || e.key === 'R') {
        playerCar.body.position.set(230, 2, 0);
        playerCar.body.velocity.set(0, 0, 0);
        playerCar.body.angularVelocity.set(0, 0, 0);
        playerCar.body.quaternion.setFromEuler(0, 0, 0);
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') controls.throttle = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') controls.brake = false;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') controls.left = false;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') controls.right = false;
    if (e.key === 'Shift') controls.shiftUp = false;
    if (e.key === 'Control') controls.shiftDown = false;
    if (e.key === ' ') controls.drs = false;
    if (e.key === 'e' || e.key === 'E') controls.ers = false;
});

// Update HUD with G-force
function updateHUD() {
    const velocity = playerCar.body.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) * 3.6;
    gameState.speed = speed;

    // Calculate G-force
    const deltaV = new CANNON.Vec3();
    deltaV.copy(velocity).vsub(gameState.prevVelocity);
    const gforce = deltaV.length() / (1/60) / 9.81; // Convert to G's
    gameState.gforce = gforce;
    gameState.prevVelocity.copy(velocity);

    // Calculate RPM based on speed and gear
    const maxRPM = 15000;
    const gearRatios = [0, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85, 0.95, 1.0];
    const gearRatio = gearRatios[gameState.gear] || 0.25;
    gameState.rpm = Math.min(maxRPM, (speed / 350) * maxRPM / gearRatio);

    // Update telemetry
    document.getElementById('tel-speed').textContent = Math.round(speed) + ' km/h';
    document.getElementById('tel-rpm').textContent = Math.round(gameState.rpm);
    document.getElementById('tel-gear').textContent = gameState.gear;
    document.getElementById('tel-throttle').textContent = Math.round(controls.currentThrottle * 100) + '%';
    document.getElementById('tel-brake').textContent = Math.round(controls.currentBrake * 100) + '%';
    document.getElementById('tel-gforce').textContent = gforce.toFixed(2) + 'G';
    document.getElementById('tel-fuel').textContent = Math.round(gameState.fuel) + 'kg';
    document.getElementById('tel-lap').textContent = gameState.currentLap + ' / ' + gameState.totalLaps;

    // Speedometer
    document.getElementById('speed').textContent = Math.round(speed);
    document.getElementById('gear').textContent = gameState.gear;

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
    document.getElementById('temp-' + tire).textContent = Math.round(temp) + '°C';
    const tireElement = document.getElementById('tire-' + tire);
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

// Check lap completion
function checkLapCompletion() {
    const carPos = playerCar.body.position;

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
        alert('Race Complete! Best Lap: ' + formatTime(gameState.bestLapTime));
        gameState.running = false;
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
        // Fixed timestep physics (prevents glitching)
        while (accumulator >= fixedTimeStep) {
            updatePhysics(fixedTimeStep);
            accumulator -= fixedTimeStep;
        }

        // Smooth control interpolation
        const lerpFactor = 0.15;
        controls.currentThrottle += (Number(controls.throttle) - controls.currentThrottle) * lerpFactor;
        controls.currentBrake += (Number(controls.brake) - controls.currentBrake) * lerpFactor;

        let targetSteering = 0;
        if (controls.left) targetSteering = 1;
        if (controls.right) targetSteering = -1;
        controls.currentSteering += (targetSteering - controls.currentSteering) * lerpFactor;

        // Sync mesh with physics
        playerCar.mesh.position.copy(playerCar.body.position);
        playerCar.mesh.quaternion.copy(playerCar.body.quaternion);

        // Update wheel visuals
        playerCar.vehicle.wheelInfos.forEach((wheel, index) => {
            playerCar.vehicle.updateWheelTransform(index);
            const t = wheel.worldTransform;
            playerCar.mesh.wheels[index].position.copy(t.position);
            playerCar.mesh.wheels[index].quaternion.copy(t.quaternion);
        });

        // Smooth camera movement
        updateCamera();
        checkLapCompletion();
        updateHUD();
    }

    renderer.render(scene, camera);
}

function updatePhysics(dt) {
    // Step physics
    world.step(dt);

    // Advanced engine simulation
    const maxForce = 15000;
    const gearRatios = [0, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85, 0.95, 1.0];
    const currentGearRatio = gearRatios[gameState.gear] || 0.25;

    // Base RPM for idle/low speed to ensure car can move from standstill
    const baseRPM = Math.max(gameState.rpm, 5000);
    const rpmFactor = Math.min(1.0, baseRPM / 10000);

    let engineForce = controls.currentThrottle * maxForce * rpmFactor * currentGearRatio;

    // ERS boost
    if (controls.ers && gameState.ers > 0) {
        engineForce *= 1.35;
        gameState.ers -= 0.3;
    }

    // DRS (reduces drag)
    if (controls.drs && gameState.drsAvailable) {
        gameState.drsActive = true;
        engineForce *= 1.15;
    } else {
        gameState.drsActive = false;
    }

    // Apply engine force
    playerCar.vehicle.applyEngineForce(-engineForce, 2);
    playerCar.vehicle.applyEngineForce(-engineForce, 3);

    // Advanced braking with brake balance
    const brakeForce = controls.currentBrake * 100;
    const brakeBalance = gameState.carSetup.brakeBalance / 100;
    playerCar.vehicle.setBrake(brakeForce * brakeBalance, 0);
    playerCar.vehicle.setBrake(brakeForce * brakeBalance, 1);
    playerCar.vehicle.setBrake(brakeForce * (1 - brakeBalance), 2);
    playerCar.vehicle.setBrake(brakeForce * (1 - brakeBalance), 3);

    // Advanced steering with speed sensitivity
    const speedFactor = Math.max(0.3, 1 - gameState.speed / 300);
    const maxSteerVal = 0.6 * speedFactor;
    const steerValue = controls.currentSteering * maxSteerVal;
    playerCar.vehicle.setSteeringValue(steerValue, 0);
    playerCar.vehicle.setSteeringValue(steerValue, 1);

    // Aerodynamic downforce (increases with speed and wing settings)
    const downforceCoeff = (gameState.carSetup.frontWing + gameState.carSetup.rearWing) / 20;
    const speedSquared = gameState.speed * gameState.speed;
    const downforce = downforceCoeff * speedSquared * 0.05;
    playerCar.body.applyForce(new CANNON.Vec3(0, -downforce, 0), playerCar.body.position);

    // Auto gear shifting
    if (gameState.rpm > 13500 && gameState.gear < 8) {
        gameState.gear++;
    } else if (gameState.rpm < 8000 && gameState.gear > 1) {
        gameState.gear--;
    }

    // Fuel consumption
    if (controls.currentThrottle > 0.1) {
        gameState.fuel -= 0.003 * controls.currentThrottle;
    }

    // ERS recharge
    if (!controls.ers && gameState.ers < 100) {
        gameState.ers += 0.08;
    }
}

function updateCamera() {
    const lerpFactor = 0.1;

    if (cameraMode === 'chase') {
        const cameraOffset = new THREE.Vector3(0, 4, -12);
        cameraOffset.applyQuaternion(playerCar.mesh.quaternion);
        const targetPosition = new THREE.Vector3().copy(playerCar.mesh.position).add(cameraOffset);

        camera.position.lerp(targetPosition, lerpFactor);

        const lookTarget = new THREE.Vector3().copy(playerCar.mesh.position);
        lookTarget.y += 1;
        camera.lookAt(lookTarget);
    } else {
        const cockpitOffset = new THREE.Vector3(0, 1.3, 0.5);
        cockpitOffset.applyQuaternion(playerCar.mesh.quaternion);
        const targetPosition = new THREE.Vector3().copy(playerCar.mesh.position).add(cockpitOffset);

        camera.position.lerp(targetPosition, lerpFactor * 1.5);

        const lookTarget = new THREE.Vector3(0, 0, 15);
        lookTarget.applyQuaternion(playerCar.mesh.quaternion);
        lookTarget.add(playerCar.mesh.position);
        camera.lookAt(lookTarget);
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

document.querySelectorAll('#setup-menu input[type="range"]').forEach(input => {
    input.addEventListener('input', updateSetupValues);
});

// Start simulation
window.startSimulation = function() {
    document.getElementById('start-screen').style.display = 'none';
    gameState.running = true;
    gameState.lapStartTime = Date.now();
    createCircuit();
    animate(0);
};

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
