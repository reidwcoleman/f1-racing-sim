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

// Create Monaco-inspired Circuit with full scenery
function createCircuit() {
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

    // White barrier material with sponsor colors
    const whiteBarrierMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6,
        metalness: 0.2
    });

    // Red sponsor logo material
    const redLogoMaterial = new THREE.MeshStandardMaterial({
        color: 0xe10600,
        roughness: 0.5,
        metalness: 0.3
    });

    // Blue sponsor logo material
    const blueLogoMaterial = new THREE.MeshStandardMaterial({
        color: 0x0066cc,
        roughness: 0.5,
        metalness: 0.3
    });

    // Inner white barriers with logos
    const innerCurve = new THREE.CatmullRomCurve3(points);
    const innerGeometry = new THREE.TubeGeometry(innerCurve, numPoints, 3, 8, true);
    const innerBarrier = new THREE.Mesh(innerGeometry, whiteBarrierMaterial);
    innerBarrier.position.y = 1.5;
    innerBarrier.castShadow = true;
    scene.add(innerBarrier);

    // Add sponsor logo panels on inner barrier
    for (let i = 0; i < numPoints; i += 4) {
        const t = i / numPoints;
        const pos = innerCurve.getPoint(t);
        const tangent = innerCurve.getTangent(t);

        const logoGeometry = new THREE.BoxGeometry(8, 2, 0.2);
        const logoMaterial = i % 8 === 0 ? redLogoMaterial : blueLogoMaterial;
        const logo = new THREE.Mesh(logoGeometry, logoMaterial);

        logo.position.set(pos.x, 2, pos.z);
        logo.lookAt(new THREE.Vector3(0, 2, 0));
        scene.add(logo);
    }

    // Outer white barriers with logos
    const outerPoints = points.map(p => new THREE.Vector3(p.x * 1.3, 0, p.z * 1.3));
    const outerCurve = new THREE.CatmullRomCurve3(outerPoints);
    const outerGeometry = new THREE.TubeGeometry(outerCurve, numPoints, 3, 8, true);
    const outerBarrier = new THREE.Mesh(outerGeometry, whiteBarrierMaterial);
    outerBarrier.position.y = 1.5;
    outerBarrier.castShadow = true;
    scene.add(outerBarrier);

    // Add sponsor logo panels on outer barrier
    for (let i = 0; i < numPoints; i += 4) {
        const t = i / numPoints;
        const pos = outerCurve.getPoint(t);
        const tangent = outerCurve.getTangent(t);

        const logoGeometry = new THREE.BoxGeometry(8, 2, 0.2);
        const logoMaterial = i % 8 === 4 ? redLogoMaterial : blueLogoMaterial;
        const logo = new THREE.Mesh(logoGeometry, logoMaterial);

        logo.position.set(pos.x, 2, pos.z);
        logo.lookAt(new THREE.Vector3(0, 2, 0));
        scene.add(logo);
    }

    // Grandstands with crowds
    createGrandstands(outerCurve, numPoints);

    // Trees around the circuit
    createTrees(outerCurve, numPoints);

    // Background buildings (Monaco-style)
    createBuildings();

    // Mountains in background
    createMountains();

    // Grass around track
    const grassGeometry = new THREE.PlaneGeometry(1200, 1200);
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d5016,
        roughness: 0.95
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.1;
    grass.receiveShadow = true;
    scene.add(grass);

    // Pit building
    createPitBuilding();

    // Start/Finish line with checkered pattern
    createStartFinishLine(trackRadius);

    // Track curbs (red and white)
    createCurbs(innerCurve, outerCurve, numPoints);

    // Flags and banners
    createFlags(outerCurve, numPoints);

    // Checkpoints for lap detection
    gameState.checkpoints = [
        { x: trackRadius * 1.15, z: 0, passed: false },
        { x: 0, z: trackRadius * 1.15, passed: false },
        { x: -trackRadius * 1.15, z: 0, passed: false },
        { x: 0, z: -trackRadius * 1.15, passed: false }
    ];
}

// Create grandstands with crowd
function createGrandstands(curve, numPoints) {
    const standMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.8
    });

    const seatMaterial = new THREE.MeshStandardMaterial({
        color: 0xe10600,
        roughness: 0.7
    });

    // Create 8 grandstand sections around the track
    for (let i = 0; i < 8; i++) {
        const t = (i / 8) + 0.05;
        const pos = curve.getPoint(t);
        const nextPos = curve.getPoint(t + 0.01);

        // Main stand structure
        const standGeometry = new THREE.BoxGeometry(30, 15, 8);
        const stand = new THREE.Mesh(standGeometry, standMaterial);
        stand.position.set(pos.x * 1.15, 7.5, pos.z * 1.15);
        stand.lookAt(new THREE.Vector3(0, 7.5, 0));
        stand.castShadow = true;
        stand.receiveShadow = true;
        scene.add(stand);

        // Seating tiers
        for (let tier = 0; tier < 5; tier++) {
            const seatGeometry = new THREE.BoxGeometry(28, 0.5, 1.5);
            const seats = new THREE.Mesh(seatGeometry, seatMaterial);
            seats.position.set(pos.x * 1.16, 2 + tier * 2.5, pos.z * 1.16);
            seats.lookAt(new THREE.Vector3(0, 2 + tier * 2.5, 0));
            scene.add(seats);

            // Crowd representation (small boxes)
            for (let j = 0; j < 40; j++) {
                const crowdGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.6);
                const crowdColors = [0xff6600, 0x0066cc, 0xffff00, 0x00ff00, 0xff00ff];
                const crowdMaterial = new THREE.MeshStandardMaterial({
                    color: crowdColors[Math.floor(Math.random() * crowdColors.length)],
                    roughness: 0.9
                });
                const person = new THREE.Mesh(crowdGeometry, crowdMaterial);

                const angle = Math.atan2(pos.z, pos.x);
                const offset = (j - 20) * 0.7;
                person.position.set(
                    pos.x * 1.165 + Math.cos(angle + Math.PI/2) * offset,
                    2.8 + tier * 2.5,
                    pos.z * 1.165 + Math.sin(angle + Math.PI/2) * offset
                );
                scene.add(person);
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

// Create start/finish line
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

// Create Ultra-Realistic Slender F1 Car with Driver
function createF1Car() {
    const car = new THREE.Group();

    // Materials
    const carbonMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        metalness: 0.9,
        roughness: 0.15
    });

    const liveryMaterial = new THREE.MeshStandardMaterial({
        color: 0xe10600,
        metalness: 0.8,
        roughness: 0.15
    });

    const whiteMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.3,
        roughness: 0.5
    });

    const wingMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.8,
        roughness: 0.2
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

        // Rim (lightweight magnesium)
        const rimRadius = 0.28;
        const rimGeometry = new THREE.CylinderGeometry(rimRadius, rimRadius, tireWidth * 0.85, 32);
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0x555555,
            metalness: 0.95,
            roughness: 0.05
        });
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.rotation.z = Math.PI / 2;
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

    // Exhaust pipe
    const exhaustGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.25, 16);
    const exhaustMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0xff3300,
        emissiveIntensity: 0.3
    });
    const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0, 0.2, -2.9);
    car.add(exhaust);

    // Number plate on nose
    const numberPlate = new THREE.Mesh(
        new THREE.CircleGeometry(0.15, 16),
        new THREE.MeshStandardMaterial({ color: 0xffff00, metalness: 0.2, roughness: 0.7 })
    );
    numberPlate.position.set(0, 0.15, 2.8);
    numberPlate.rotation.x = -Math.PI / 2;
    car.add(numberPlate);

    scene.add(car);

    // Advanced Physics body
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.4, 2.25));
    const chassisBody = new CANNON.Body({
        mass: 740,
        material: new CANNON.Material()
    });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(230, 2, 0);
    chassisBody.linearDamping = 0.05; // Slight damping for stability
    chassisBody.angularDamping = 0.8; // High angular damping to prevent wobbling
    world.addBody(chassisBody);

    // Advanced vehicle with better suspension
    const vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2
    });

    // Advanced suspension settings for stability
    const wheelOptions = {
        radius: 0.4,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 100, // Much stiffer for stability
        suspensionRestLength: 0.3,
        frictionSlip: 100, // Extremely high grip to prevent sliding
        dampingRelaxation: 5, // Higher damping for stability
        dampingCompression: 8, // Higher compression damping
        maxSuspensionForce: 1000000, // Massive force to keep wheels planted
        rollInfluence: 0.001, // Almost no roll
        axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 1),
        maxSuspensionTravel: 0.1, // Very limited travel for stability
        customSlidingRotationalSpeed: -15,
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
    if (e.key === ' ') controls.drs = false;
    if (e.key === 'e' || e.key === 'E') controls.ers = false;
});

// Update HUD with G-force
function updateHUD() {
    const velocity = playerCar.body.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) * 3.6;
    gameState.speed = speed;

    // Calculate G-force (smoothed for more realistic display)
    const deltaV = new CANNON.Vec3();
    deltaV.copy(velocity).vsub(gameState.prevVelocity);
    const instantGforce = deltaV.length() / (1/60) / 9.81; // Convert to G's
    gameState.gforce = gameState.gforce * 0.7 + instantGforce * 0.3; // Smooth it out
    gameState.prevVelocity.copy(velocity);

    // Calculate RPM based on speed (reduced max RPM for smoother feel)
    const maxRPM = 10000;
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

    // Direct drive engine with traction control
    const maxForce = 500000; // Smoother, more realistic power

    // Progressive power delivery based on speed (traction control)
    const speedRatio = Math.min(1, gameState.speed / 80); // Ramp up power from 0-80 kph
    const tractionMultiplier = 0.4 + (speedRatio * 0.6); // 40% power at low speed, 100% at 80+ kph

    let engineForce = controls.currentThrottle * maxForce * tractionMultiplier;

    // ERS boost
    if (controls.ers && gameState.ers > 0) {
        engineForce *= 1.25;
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
    const brakeForce = controls.currentBrake * 500;
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

    // Fixed gear - always in top gear for direct drive
    gameState.gear = 8;

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
