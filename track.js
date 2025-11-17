import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Track {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;

        this.trackWidth = 12;
        this.checkpoints = [];

        this.createTrack();
        this.createEnvironment();
    }

    createTrack() {
        // Define track path points (creating a challenging circuit)
        const trackPoints = [
            { x: 0, z: 0 },
            { x: 50, z: 0 },
            { x: 80, z: 20 },
            { x: 100, z: 50 },
            { x: 100, z: 80 },
            { x: 80, z: 110 },
            { x: 50, z: 120 },
            { x: 20, z: 115 },
            { x: 0, z: 100 },
            { x: -20, z: 85 },
            { x: -50, z: 80 },
            { x: -80, z: 70 },
            { x: -100, z: 50 },
            { x: -100, z: 20 },
            { x: -80, z: -10 },
            { x: -50, z: -15 },
            { x: -20, z: -10 },
            { x: 0, z: 0 }
        ];

        // Create smooth curve from points
        const curve = new THREE.CatmullRomCurve3(
            trackPoints.map(p => new THREE.Vector3(p.x, 0, p.z)),
            true // closed curve
        );

        // Create track surface
        this.createTrackSurface(curve);

        // Create track boundaries
        this.createTrackBoundaries(curve);

        // Create curbs
        this.createCurbs(curve);

        // Create start/finish line
        this.createStartFinishLine(trackPoints[0]);

        // Create grandstands
        this.createGrandstands();
    }

    createTrackSurface(curve) {
        // Get points along the curve
        const points = curve.getPoints(200);

        // Create track geometry
        const trackGeometry = new THREE.BufferGeometry();
        const vertices = [];
        const uvs = [];
        const indices = [];

        points.forEach((point, i) => {
            // Calculate perpendicular direction
            const tangent = curve.getTangent(i / points.length);
            const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x);

            // Create track width
            const leftPoint = point.clone().add(perpendicular.multiplyScalar(this.trackWidth / 2));
            const rightPoint = point.clone().add(perpendicular.multiplyScalar(-this.trackWidth / 2));

            vertices.push(leftPoint.x, 0.01, leftPoint.z);
            vertices.push(rightPoint.x, 0.01, rightPoint.z);

            uvs.push(0, i / points.length);
            uvs.push(1, i / points.length);

            if (i < points.length - 1) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        });

        trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        trackGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        trackGeometry.setIndex(indices);
        trackGeometry.computeVertexNormals();

        // Create asphalt texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Base asphalt color
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, 512, 512);

        // Add texture detail
        for (let i = 0; i < 5000; i++) {
            ctx.fillStyle = `rgba(${Math.random() * 50}, ${Math.random() * 50}, ${Math.random() * 50}, 0.3)`;
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
        }

        // Add white center line
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 512; i += 40) {
            ctx.fillRect(250, i, 12, 25);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 50);

        const trackMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.9,
            metalness: 0.1
        });

        const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
        trackMesh.receiveShadow = true;
        this.scene.add(trackMesh);

        // Create physics for track
        const trackShape = new CANNON.Plane();
        const trackBody = new CANNON.Body({
            mass: 0,
            shape: trackShape,
            material: new CANNON.Material({
                friction: 1.5,
                restitution: 0.1
            })
        });
        trackBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(trackBody);
    }

    createTrackBoundaries(curve) {
        const points = curve.getPoints(200);

        // Barrier material
        const barrierMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            roughness: 0.6,
            metalness: 0.2
        });

        const barrierGeometry = new THREE.BoxGeometry(1, 1, 1);

        points.forEach((point, i) => {
            const tangent = curve.getTangent(i / points.length);
            const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x);

            // Inner barrier
            const innerPos = point.clone().add(perpendicular.multiplyScalar(this.trackWidth / 2 + 1));
            const innerBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
            innerBarrier.position.set(innerPos.x, 0.5, innerPos.z);
            innerBarrier.castShadow = true;
            innerBarrier.receiveShadow = true;
            this.scene.add(innerBarrier);

            // Physics for inner barrier
            const innerShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
            const innerBody = new CANNON.Body({ mass: 0, shape: innerShape });
            innerBody.position.set(innerPos.x, 0.5, innerPos.z);
            this.world.addBody(innerBody);

            // Outer barrier
            const outerPos = point.clone().add(perpendicular.multiplyScalar(-this.trackWidth / 2 - 1));
            const outerBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
            outerBarrier.position.set(outerPos.x, 0.5, outerPos.z);
            outerBarrier.castShadow = true;
            outerBarrier.receiveShadow = true;
            this.scene.add(outerBarrier);

            // Physics for outer barrier
            const outerShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
            const outerBody = new CANNON.Body({ mass: 0, shape: outerShape });
            outerBody.position.set(outerPos.x, 0.5, outerPos.z);
            this.world.addBody(outerBody);
        });
    }

    createCurbs(curve) {
        const points = curve.getPoints(200);
        const curbMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.1
        });

        const curbGeometry = new THREE.BoxGeometry(0.5, 0.1, 1);

        points.forEach((point, i) => {
            if (i % 5 !== 0) return; // Only place curbs every 5 points

            const tangent = curve.getTangent(i / points.length);
            const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x);

            // Alternate red and white colors
            const color = i % 10 === 0 ? new THREE.Color(0xff0000) : new THREE.Color(0xffffff);
            const colors = [];
            for (let j = 0; j < 24; j++) {
                colors.push(color.r, color.g, color.b);
            }

            const coloredGeometry = curbGeometry.clone();
            coloredGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            // Inner curb
            const innerPos = point.clone().add(perpendicular.multiplyScalar(this.trackWidth / 2));
            const innerCurb = new THREE.Mesh(coloredGeometry, curbMaterial);
            innerCurb.position.set(innerPos.x, 0.05, innerPos.z);
            this.scene.add(innerCurb);

            // Outer curb
            const outerPos = point.clone().add(perpendicular.multiplyScalar(-this.trackWidth / 2));
            const outerCurb = new THREE.Mesh(coloredGeometry, curbMaterial);
            outerCurb.position.set(outerPos.x, 0.05, outerPos.z);
            this.scene.add(outerCurb);
        });
    }

    createStartFinishLine() {
        // Create checkered pattern for start/finish
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const checkSize = 32;
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#000000' : '#ffffff';
                ctx.fillRect(x * checkSize, y * checkSize, checkSize, checkSize);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        const lineMaterial = new THREE.MeshStandardMaterial({ map: texture });

        const lineGeometry = new THREE.PlaneGeometry(this.trackWidth, 3);
        const finishLine = new THREE.Mesh(lineGeometry, lineMaterial);
        finishLine.rotation.x = -Math.PI / 2;
        finishLine.position.set(0, 0.02, 0);
        this.scene.add(finishLine);

        // Add finish line gantry
        const gantryMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.8,
            roughness: 0.2
        });

        const pillarGeometry = new THREE.CylinderGeometry(0.3, 0.3, 6, 16);
        const pillar1 = new THREE.Mesh(pillarGeometry, gantryMaterial);
        pillar1.position.set(-this.trackWidth / 2 - 1, 3, 0);
        pillar1.castShadow = true;
        this.scene.add(pillar1);

        const pillar2 = new THREE.Mesh(pillarGeometry, gantryMaterial);
        pillar2.position.set(this.trackWidth / 2 + 1, 3, 0);
        pillar2.castShadow = true;
        this.scene.add(pillar2);

        const beamGeometry = new THREE.BoxGeometry(this.trackWidth + 3, 0.5, 0.5);
        const beam = new THREE.Mesh(beamGeometry, gantryMaterial);
        beam.position.set(0, 6, 0);
        beam.castShadow = true;
        this.scene.add(beam);

        // Add sponsor boards on gantry
        const boardGeometry = new THREE.PlaneGeometry(this.trackWidth, 1.5);
        const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x0066cc });
        const board = new THREE.Mesh(boardGeometry, boardMaterial);
        board.position.set(0, 6, 0.5);
        this.scene.add(board);
    }

    createGrandstands() {
        // Create simple grandstands
        const standGeometry = new THREE.BoxGeometry(40, 8, 10);
        const standMaterial = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.8,
            metalness: 0.2
        });

        // Main grandstand
        const mainStand = new THREE.Mesh(standGeometry, standMaterial);
        mainStand.position.set(-25, 4, -10);
        mainStand.castShadow = true;
        mainStand.receiveShadow = true;
        this.scene.add(mainStand);

        // Add seating rows
        const seatMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const seatGeometry = new THREE.BoxGeometry(38, 0.3, 1);

        for (let i = 0; i < 8; i++) {
            const seats = new THREE.Mesh(seatGeometry, seatMaterial);
            seats.position.set(-25, 0.5 + i * 1, -10 + i * 1);
            this.scene.add(seats);
        }

        // Secondary grandstand
        const stand2 = new THREE.Mesh(standGeometry.clone(), standMaterial);
        stand2.position.set(25, 4, -10);
        stand2.castShadow = true;
        stand2.receiveShadow = true;
        this.scene.add(stand2);

        for (let i = 0; i < 8; i++) {
            const seats = new THREE.Mesh(seatGeometry, seatMaterial);
            seats.position.set(25, 0.5 + i * 1, -10 + i * 1);
            this.scene.add(seats);
        }
    }

    createEnvironment() {
        // Add trees around the track
        this.createTrees();

        // Add pit lane
        this.createPitLane();

        // Add marshal posts
        this.createMarshalPosts();
    }

    createTrees() {
        const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a3728,
            roughness: 0.9
        });

        const foliageGeometry = new THREE.SphereGeometry(3, 8, 8);
        const foliageMaterial = new THREE.MeshStandardMaterial({
            color: 0x228b22,
            roughness: 0.8
        });

        for (let i = 0; i < 100; i++) {
            const tree = new THREE.Group();

            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.y = 2.5;
            trunk.castShadow = true;
            tree.add(trunk);

            const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage.position.y = 6;
            foliage.castShadow = true;
            tree.add(foliage);

            // Random position around track
            const angle = Math.random() * Math.PI * 2;
            const distance = 50 + Math.random() * 100;
            tree.position.set(
                Math.cos(angle) * distance,
                0,
                Math.sin(angle) * distance
            );

            this.scene.add(tree);
        }
    }

    createPitLane() {
        const pitGeometry = new THREE.PlaneGeometry(10, 50);
        const pitMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.9,
            metalness: 0.1
        });

        const pitLane = new THREE.Mesh(pitGeometry, pitMaterial);
        pitLane.rotation.x = -Math.PI / 2;
        pitLane.position.set(-20, 0.01, -25);
        pitLane.receiveShadow = true;
        this.scene.add(pitLane);

        // Pit boxes
        const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const boxGeometry = new THREE.BoxGeometry(8, 3, 6);

        for (let i = 0; i < 10; i++) {
            const box = new THREE.Mesh(boxGeometry, boxMaterial);
            box.position.set(-24, 1.5, -40 + i * 7);
            box.castShadow = true;
            this.scene.add(box);
        }
    }

    createMarshalPosts() {
        const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, 4, 8);
        const postMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            roughness: 0.5,
            metalness: 0.3
        });

        const positions = [
            { x: 60, z: 10 },
            { x: 90, z: 60 },
            { x: 60, z: 110 },
            { x: 0, z: 90 },
            { x: -70, z: 70 },
            { x: -90, z: 30 },
            { x: -60, z: -10 }
        ];

        positions.forEach(pos => {
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(pos.x, 2, pos.z);
            post.castShadow = true;
            this.scene.add(post);

            // Add flag
            const flagGeometry = new THREE.PlaneGeometry(2, 1.5);
            const flagMaterial = new THREE.MeshStandardMaterial({
                color: 0xffff00,
                side: THREE.DoubleSide
            });
            const flag = new THREE.Mesh(flagGeometry, flagMaterial);
            flag.position.set(pos.x + 1, 3.5, pos.z);
            this.scene.add(flag);
        });
    }
}
