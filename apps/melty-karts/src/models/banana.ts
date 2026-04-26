import * as THREE from 'three';

export interface BananaParams {
    peelCount: number;
    coreHeight: number;
    coreRadius: number;
    peelLength: number;
    color: number;
    insideColor: number;
}

export function createBanana() {
    let group = new THREE.Group();
    let r = createProceduralBanana();
    r.scale.set(0.05, 0.05, 0.05);
    r.translateY(0.0125);
    r.rotateX(Math.PI); // Flip the entire model
    group.add(r);
    return group;
}

function createProceduralBanana(params?: Partial<BananaParams>): THREE.Group {
    // 1. Setup Default Parameters
    const config: BananaParams = {
        peelCount: 4,
        coreHeight: 1.5,   // Taller core for the "half unpeeled" look
        coreRadius: 0.4,   // Thickness of the banana
        peelLength: 2.5,   // How far the peels spread on the floor
        color: 0xffcc00,   // Classic cartoon yellow
        insideColor: 0xfffff0, // Pale inside
        ...params
    };

    const bananaGroup = new THREE.Group();

    // Materials
    const skinMaterial = new THREE.MeshStandardMaterial({ 
        color: config.color, 
        side: THREE.DoubleSide,
        roughness: 0.4
    });
    
    // 2. Build the Core (The unpeeled half)
    // We use a cylinder that is open at the top to look like a hollow husk
    const coreGeometry = new THREE.CylinderGeometry(
        config.coreRadius, 
        config.coreRadius * 0.8, // Slight taper towards the stem at the bottom
        config.coreHeight, 
        16, 
        1, 
        true // Open ended so the top looks empty
    );
    const coreMesh = new THREE.Mesh(coreGeometry, skinMaterial);
    
    // Lift the core so its open end rests exactly on the floor (Y = 0), with the core extending downwards
    coreMesh.position.y = -config.coreHeight / 2;
    bananaGroup.add(coreMesh);

    // 3. Build the Peels procedurally
    for (let i = 0; i < config.peelCount; i++) {
        const angle = (i / config.peelCount) * Math.PI * 2;
        
        // Calculate the starting point on the rim of the core (now at Y=0)
        const startX = Math.cos(angle) * config.coreRadius;
        const startZ = Math.sin(angle) * config.coreRadius;
        const startPos = new THREE.Vector3(startX, 0, startZ); // Start at Y=0

        // Direction vectors for pushing the curve outwards
        const outDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
        
        // Define the Bezier curve points for the draping peel
        // P1: Arcs slightly up and outward from the rim
        const p1 = startPos.clone().add(outDir.clone().multiplyScalar(0.5)).setY(0.5); // Arc upwards
        // P2: Curves back down toward the floor
        const p2 = startPos.clone().add(outDir.clone().multiplyScalar(config.peelLength * 0.6)).setY(0.1); // Curve back down
        // P3: Rests flat on the floor, slightly curled tip
        const endPos = startPos.clone().add(outDir.clone().multiplyScalar(config.peelLength)).setY(0.05); // Rest on floor

        const curve = new THREE.CubicBezierCurve3(startPos, p1, p2, endPos);
        
        // 4. Generate custom geometry to taper the peel
        const segments = 20;
        const peelGeometry = new THREE.BufferGeometry();
        const vertices = new Float32Array((segments + 1) * 2 * 3); // 2 vertices wide, 3 coords (x,y,z) per segment
        const indices: number[] = [];
        const uvs: number[] = [];

        for (let j = 0; j <= segments; j++) {
            const t = j / segments;
            const point = curve.getPoint(t);
            const tangent = curve.getTangent(t);
            
            // Calculate a normal vector pointing "sideways" from the curve to give the peel width
            const up = new THREE.Vector3(0, 1, 0);
            const sideNormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            // Taper the width: full width at the core, 0 at the tip
            const currentWidth = (config.coreRadius * Math.PI * 2) / config.peelCount; // Base width
            const widthAtT = currentWidth * 0.5 * (1 - Math.pow(t, 1.5)); // Pinching effect

            // Left vertex
            const leftVert = point.clone().add(sideNormal.clone().multiplyScalar(widthAtT));
            vertices[(j * 2 * 3)] = leftVert.x;
            vertices[(j * 2 * 3) + 1] = leftVert.y;
            vertices[(j * 2 * 3) + 2] = leftVert.z;

            // Right vertex
            const rightVert = point.clone().add(sideNormal.clone().multiplyScalar(-widthAtT));
            vertices[((j * 2 + 1) * 3)] = rightVert.x;
            vertices[((j * 2 + 1) * 3) + 1] = rightVert.y;
            vertices[((j * 2 + 1) * 3) + 2] = rightVert.z;

            // UVs
            uvs.push(0, t, 1, t);

            // Triangulate
            if (j < segments) {
                const a = j * 2;
                const b = j * 2 + 1;
                const c = (j + 1) * 2;
                const d = (j + 1) * 2 + 1;

                indices.push(a, b, d);
                indices.push(a, d, c);
            }
        }

        peelGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        peelGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        peelGeometry.setIndex(indices);
        peelGeometry.computeVertexNormals();

        const peelMesh = new THREE.Mesh(peelGeometry, skinMaterial);
        bananaGroup.add(peelMesh);
    }

    // (Optional) Add a dark cap at the bottom stem
    const stemGeo = new THREE.CylinderGeometry(config.coreRadius * 0.8, config.coreRadius * 0.7, 0.2, 16);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
    const stemMesh = new THREE.Mesh(stemGeo, stemMat);
    stemMesh.position.y = -(config.coreHeight + 0.1); // Position at the new bottom of the core
    bananaGroup.add(stemMesh);

    return bananaGroup;
}
