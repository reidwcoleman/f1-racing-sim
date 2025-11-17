import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class F1Car {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;

        // Car properties
        this.speed = 0;
        this.maxSpeed = 350; // km/h
        this.acceleration = 30;
        this.braking = 50;
        this.steering = 0;
        this.maxSteering = 0.5;
        this.steeringSpeed = 2;
        this.rpm = 1000;
        this.gear = 0;
        this.gearRatios = [0, 2.5, 1.8, 1.4, 1.1, 0.9, 0.75, 0.65];

        // Input state
        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };

        // Visual and physics components
        this.mesh = null;
        this.body = null;
        this.wheels = [];
        this.wheelMeshes = [];

        this.createCar();
        this.createPhysics();
    }

    createCar() {
        // Main car group
        const carGroup = new THREE.Group();

        // Car body (monocoque)
        const bodyGeometry = new THREE.BoxGeometry(2, 0.5, 4.5);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            metalness: 0.8,
            roughness: 0.2,
            envMapIntensity: 1.0
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.3;
        body.castShadow = true;
        body.receiveShadow = true;
        carGroup.add(body);

        // Cockpit/airbox
        const cockpitGeometry = new THREE.BoxGeometry(1.2, 0.4, 1.5);
        const cockpitMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.5,
            roughness: 0.5
        });
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.position.set(0, 0.7, 0.3);
        cockpit.castShadow = true;
        carGroup.add(cockpit);

        // Front wing
        const frontWingGeometry = new THREE.BoxGeometry(2.5, 0.05, 0.8);
        const wingMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.9,
            roughness: 0.1
        });
        const frontWing = new THREE.Mesh(frontWingGeometry, wingMaterial);
        frontWing.position.set(0, 0.1, 2.2);
        frontWing.castShadow = true;
        carGroup.add(frontWing);

        // Front wing endplates
        const endplateGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.6);
        const endplate1 = new THREE.Mesh(endplateGeometry, bodyMaterial);
        endplate1.position.set(-1.2, 0.25, 2.2);
        endplate1.castShadow = true;
        carGroup.add(endplate1);

        const endplate2 = new THREE.Mesh(endplateGeometry, bodyMaterial);
        endplate2.position.set(1.2, 0.25, 2.2);
        endplate2.castShadow = true;
        carGroup.add(endplate2);

        // Rear wing
        const rearWingGeometry = new THREE.BoxGeometry(2, 0.05, 1);
        const rearWing = new THREE.Mesh(rearWingGeometry, wingMaterial);
        rearWing.position.set(0, 1.2, -2);
        rearWing.castShadow = true;
        carGroup.add(rearWing);

        // Rear wing supports
        const supportGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const supportMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.9,
            roughness: 0.1
        });

        const support1 = new THREE.Mesh(supportGeometry, supportMaterial);
        support1.position.set(-0.8, 0.7, -2);
        carGroup.add(support1);

        const support2 = new THREE.Mesh(supportGeometry, supportMaterial);
        support2.position.set(0.8, 0.7, -2);
        carGroup.add(support2);

        // Engine cover
        const engineGeometry = new THREE.BoxGeometry(1, 0.6, 2);
        const engineCover = new THREE.Mesh(engineGeometry, bodyMaterial);
        engineCover.position.set(0, 0.6, -0.8);
        engineCover.castShadow = true;
        carGroup.add(engineCover);

        // Sidepods
        const sidepodGeometry = new THREE.BoxGeometry(0.6, 0.4, 2.5);
        const sidepodMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.7,
            roughness: 0.3
        });

        const sidepod1 = new THREE.Mesh(sidepodGeometry, sidepodMaterial);
        sidepod1.position.set(-1, 0.3, 0);
        sidepod1.castShadow = true;
        carGroup.add(sidepod1);

        const sidepod2 = new THREE.Mesh(sidepodGeometry, sidepodMaterial);
        sidepod2.position.set(1, 0.3, 0);
        sidepod2.castShadow = true;
        carGroup.add(sidepod2);

        // Nose cone
        const noseGeometry = new THREE.ConeGeometry(0.3, 1, 8);
        const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0.2, 2.8);
        nose.castShadow = true;
        carGroup.add(nose);

        // Wheels
        this.createWheels(carGroup);

        // Add racing number
        this.addRacingNumber(carGroup);

        // Add sponsor logos (simplified as colored rectangles)
        this.addSponsors(carGroup);

        this.mesh = carGroup;
        this.mesh.position.set(0, 1, 0);
        this.scene.add(this.mesh);
    }

    createWheels(carGroup) {
        const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.1,
            roughness: 0.9
        });

        const rimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.35, 8);
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.9,
            roughness: 0.1
        });

        const wheelPositions = [
            { x: -0.9, z: 1.5 },  // Front left
            { x: 0.9, z: 1.5 },   // Front right
            { x: -0.9, z: -1.5 }, // Rear left
            { x: 0.9, z: -1.5 }   // Rear right
        ];

        wheelPositions.forEach((pos, index) => {
            const wheelGroup = new THREE.Group();

            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.castShadow = true;
            wheel.receiveShadow = true;

            const rim = new THREE.Mesh(rimGeometry, rimMaterial);
            rim.rotation.z = Math.PI / 2;
            rim.position.x = index % 2 === 0 ? -0.05 : 0.05;

            wheelGroup.add(wheel);
            wheelGroup.add(rim);
            wheelGroup.position.set(pos.x, 0, pos.z);

            carGroup.add(wheelGroup);
            this.wheelMeshes.push(wheelGroup);
        });
    }

    addRacingNumber(carGroup) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 256, 256);
        context.fillStyle = '#000000';
        context.font = 'bold 180px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('1', 128, 128);

        const texture = new THREE.CanvasTexture(canvas);
        const numberMaterial = new THREE.MeshBasicMaterial({ map: texture });
        const numberGeometry = new THREE.PlaneGeometry(0.6, 0.6);

        const number1 = new THREE.Mesh(numberGeometry, numberMaterial);
        number1.position.set(-0.6, 0.7, 0.3);
        number1.rotation.y = Math.PI / 2;
        carGroup.add(number1);

        const number2 = new THREE.Mesh(numberGeometry, numberMaterial);
        number2.position.set(0.6, 0.7, 0.3);
        number2.rotation.y = -Math.PI / 2;
        carGroup.add(number2);
    }

    addSponsors(carGroup) {
        // Add simplified sponsor logos as colored rectangles
        const logoGeometry = new THREE.PlaneGeometry(0.5, 0.2);
        const logoMaterial1 = new THREE.MeshBasicMaterial({ color: 0x0066cc });
        const logoMaterial2 = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

        // Side sponsors
        const sponsor1 = new THREE.Mesh(logoGeometry, logoMaterial1);
        sponsor1.position.set(-1.05, 0.4, 0.5);
        sponsor1.rotation.y = Math.PI / 2;
        carGroup.add(sponsor1);

        const sponsor2 = new THREE.Mesh(logoGeometry, logoMaterial2);
        sponsor2.position.set(-1.05, 0.4, -0.5);
        sponsor2.rotation.y = Math.PI / 2;
        carGroup.add(sponsor2);

        const sponsor3 = new THREE.Mesh(logoGeometry, logoMaterial1);
        sponsor3.position.set(1.05, 0.4, 0.5);
        sponsor3.rotation.y = -Math.PI / 2;
        carGroup.add(sponsor3);

        const sponsor4 = new THREE.Mesh(logoGeometry, logoMaterial2);
        sponsor4.position.set(1.05, 0.4, -0.5);
        sponsor4.rotation.y = -Math.PI / 2;
        carGroup.add(sponsor4);
    }

    createPhysics() {
        // Create car body physics
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.3, 2.25));
        this.body = new CANNON.Body({
            mass: 740, // F1 car minimum weight
            position: new CANNON.Vec3(0, 1, 0),
            shape: chassisShape,
            material: new CANNON.Material({
                friction: 0.1,
                restitution: 0.3
            })
        });

        // Add downforce simulation
        this.body.linearDamping = 0.3;
        this.body.angularDamping = 0.5;

        this.world.addBody(this.body);

        // Create wheel physics
        const wheelShape = new CANNON.Sphere(0.4);
        const wheelMaterial = new CANNON.Material({
            friction: 1.5,
            restitution: 0.1
        });

        const wheelPositions = [
            new CANNON.Vec3(-0.9, 0.4, 1.5),  // Front left
            new CANNON.Vec3(0.9, 0.4, 1.5),   // Front right
            new CANNON.Vec3(-0.9, 0.4, -1.5), // Rear left
            new CANNON.Vec3(0.9, 0.4, -1.5)   // Rear right
        ];

        wheelPositions.forEach(pos => {
            const wheelBody = new CANNON.Body({
                mass: 20,
                shape: wheelShape,
                material: wheelMaterial
            });
            wheelBody.position.copy(pos);
            this.wheels.push(wheelBody);
            this.world.addBody(wheelBody);

            // Create constraint to attach wheel to chassis
            const constraint = new CANNON.PointToPointConstraint(
                this.body,
                pos,
                wheelBody,
                new CANNON.Vec3(0, 0, 0)
            );
            this.world.addConstraint(constraint);
        });
    }

    handleInput(input) {
        this.input = input;
    }

    update(deltaTime) {
        // Update steering
        if (this.input.left) {
            this.steering = Math.min(this.steering + this.steeringSpeed * deltaTime, this.maxSteering);
        } else if (this.input.right) {
            this.steering = Math.max(this.steering - this.steeringSpeed * deltaTime, -this.maxSteering);
        } else {
            // Return to center
            this.steering *= 0.9;
        }

        // Calculate speed from velocity
        const velocity = this.body.velocity;
        this.speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2) * 3.6; // Convert to km/h

        // Apply acceleration/braking
        const forward = new CANNON.Vec3(
            Math.sin(this.body.quaternion.toEuler().y),
            0,
            Math.cos(this.body.quaternion.toEuler().y)
        );

        if (this.input.forward && this.speed < this.maxSpeed) {
            const force = forward.scale(this.acceleration * 100);
            this.body.applyForce(force, this.body.position);
        }

        if (this.input.backward) {
            if (this.speed > 5) {
                // Brake
                const brake = velocity.scale(-this.braking * 10);
                this.body.applyForce(brake, this.body.position);
            } else {
                // Reverse
                const force = forward.scale(-this.acceleration * 30);
                this.body.applyForce(force, this.body.position);
            }
        }

        // Apply steering torque
        if (Math.abs(this.steering) > 0.01 && this.speed > 1) {
            const torque = new CANNON.Vec3(0, -this.steering * this.speed * 2, 0);
            this.body.applyTorque(torque);
        }

        // Apply downforce (increases with speed)
        const downforce = Math.min(this.speed / this.maxSpeed, 1) * 3000;
        this.body.applyForce(new CANNON.Vec3(0, -downforce, 0), this.body.position);

        // Update visual mesh from physics
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        // Rotate wheels based on speed
        const wheelRotation = (this.speed / 100) * deltaTime * 100;
        this.wheelMeshes.forEach((wheel, index) => {
            // Rotate wheels
            wheel.children[0].rotation.x += wheelRotation;
            wheel.children[1].rotation.x += wheelRotation;

            // Steer front wheels
            if (index < 2) {
                wheel.rotation.y = this.steering;
            }
        });

        // Update RPM and gear
        this.updateEngineParameters();
    }

    updateEngineParameters() {
        // Simple gear calculation
        const speedRatio = this.speed / this.maxSpeed;

        if (speedRatio < 0.15) this.gear = 1;
        else if (speedRatio < 0.25) this.gear = 2;
        else if (speedRatio < 0.4) this.gear = 3;
        else if (speedRatio < 0.55) this.gear = 4;
        else if (speedRatio < 0.7) this.gear = 5;
        else if (speedRatio < 0.85) this.gear = 6;
        else this.gear = 7;

        // Calculate RPM based on speed and gear
        if (this.gear > 0) {
            const gearRatio = this.gearRatios[this.gear];
            this.rpm = 1000 + (speedRatio / gearRatio) * 14000;
            this.rpm = Math.min(this.rpm, 15000);
        } else {
            this.rpm = 1000;
        }
    }

    getPosition() {
        return this.mesh.position;
    }

    getRotation() {
        return this.mesh.rotation;
    }

    getSpeed() {
        return this.speed;
    }

    getRPM() {
        return this.rpm;
    }

    getGear() {
        if (this.gear === 0) return 'N';
        if (this.speed < -5) return 'R';
        return this.gear;
    }

    reset() {
        // Reset position and velocity
        this.body.position.set(0, 1, 0);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.quaternion.setFromEuler(0, 0, 0);

        this.speed = 0;
        this.steering = 0;
        this.rpm = 1000;
        this.gear = 0;
    }
}
