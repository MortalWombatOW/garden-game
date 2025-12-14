
import * as BABYLON from "@babylonjs/core";
import { PlantGenome } from "../components/PlantGenome";
import { PlantState } from "../components/PlantState";

interface TurtleState {
    position: BABYLON.Vector3;
    direction: BABYLON.Vector3; // Forward vector
    rotation: BABYLON.Quaternion;
    thickness: number;
}

export class LSystemGenerator {
    // Cache expanded strings: Key = "Axiom|Rule1Hash|Rule2Hash...|Iterations"
    private static stringCache: Map<string, string> = new Map();

    /**
     * Evolve the genome's axiom + rules into a final string string for the given iterations.
     */
    public static evolve(genome: PlantGenome, iterations: number): string {
        if (iterations <= 0) return genome.axiom;

        // Simple cache key (could be improved)
        const rulesKey = Array.from(genome.rules.entries())
            .map(([k, v]) => `${k}:${v}`)
            .join(";");
        const cacheKey = `${genome.axiom}|${rulesKey}|${iterations}`;

        if (this.stringCache.has(cacheKey)) {
            return this.stringCache.get(cacheKey)!;
        }

        let currentString = genome.axiom;
        for (let i = 0; i < iterations; i++) {
            let nextString = "";
            for (const char of currentString) {
                const rule = genome.rules.get(char);
                nextString += rule || char;
            }
            currentString = nextString;
        }

        this.stringCache.set(cacheKey, currentString);
        return currentString;
    }

    /**
     * Generate a single merged mesh from the genome and current state.
     */
    public static generateMesh(
        genome: PlantGenome,
        state: PlantState,
        scene: BABYLON.Scene
    ): BABYLON.Mesh {
        const iteration = state.currentIteration;
        const sentence = this.evolve(genome, iteration);

        const meshes: BABYLON.Mesh[] = [];
        const stack: TurtleState[] = [];

        // Initial State
        // Start pointing UP (0, 1, 0)
        let currentState: TurtleState = {
            position: BABYLON.Vector3.Zero(),
            direction: new BABYLON.Vector3(0, 1, 0),
            rotation: BABYLON.Quaternion.Identity(),
            thickness: genome.thickness
        };

        const segmentLength = genome.length;
        const angleRad = (genome.angle * Math.PI) / 180;

        // Stress factor: 0 to 1 scaling for droop
        // If stressLevel is 0, droop is 0. If 3, droop is noticeable.
        // We'll map stressLevel (0,1,2,3) to a rotation modifier.
        const stressDroop = Math.min(1.5, state.stressLevel * 0.2);

        for (const char of sentence) {
            switch (char) {
                case "F": // Move Forward and Draw
                case "G": // Move Forward and Draw (sometimes used alternatively)
                    // Create Cylinder Segment
                    const nextPos = currentState.position.add(currentState.direction.scale(segmentLength));

                    // We need a transformation matrix for the cylinder
                    // Align cylinder Y-axis with currentState.direction

                    // Simple approach: Create cylinder at origin, rotate, translate.
                    // But we want to merge them later.

                    const cylinder = BABYLON.MeshBuilder.CreateCylinder("branch", {
                        height: segmentLength,
                        diameterTop: currentState.thickness * 0.8, // Taper slightly
                        diameterBottom: currentState.thickness,
                        tessellation: 6
                    }, scene);

                    // Align alignment: default cylinder is along Y. 
                    // We need to rotate it to match 'direction'.
                    // Position is midpoint between current and next.
                    const midPoint = currentState.position.add(currentState.direction.scale(segmentLength / 2));

                    cylinder.position = midPoint;

                    // Rotation calculation
                    const up = new BABYLON.Vector3(0, 1, 0);
                    const axis = BABYLON.Vector3.Cross(up, currentState.direction);
                    const dot = BABYLON.Vector3.Dot(up, currentState.direction);
                    // Handle parallel case
                    if (axis.lengthSquared() < 0.0001) {
                        if (dot < 0) {
                            cylinder.rotation.x = Math.PI;
                        }
                    } else {
                        const angle = Math.acos(dot);
                        cylinder.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis.normalize(), angle);
                    }

                    meshes.push(cylinder);

                    // Advance Turtle
                    currentState.position = nextPos;
                    // Apply stress droop to direction for NEXT segments? 
                    // Or modify direction here? 
                    // Let's modify direction slightly downwards if stressed.
                    if (stressDroop > 0) {
                        // Rotate direction slightly around X/Z to simulate gravity pull?
                        // Simple hack: Rotate current direction slightly towards (0, -1, 0)
                        // Or just simplistic Pitch Down
                        const droopAxis = new BABYLON.Vector3(1, 0, 0); // Local X? Global X?
                        // Ideally we want to droop in World Space downwards.
                        // But for now, let's just use the instruction logic or a global bend.
                        // Actually, standard L-systems use symbols. 
                        // We can inject a "Pitch Down" based on stress here.
                        // Let's just linearly interpolate 'direction' towards 'down'.
                        const down = new BABYLON.Vector3(0, -1, 0);
                        currentState.direction = BABYLON.Vector3.Lerp(currentState.direction, down, stressDroop * 0.05).normalize();
                    }

                    break;

                case "+": // Yaw +
                    // Rotate around Local Y? Or Up vector?
                    // Standard L-system: + / - is usually turn left/right (Yaw)
                    // & / ^ is Pitch
                    // \ / / is Roll
                    // For 2D/3D simplified:
                    // Let's treat + as Rotate +Angle around Z axis (Roll/Turn)
                    // And - as Rotate -Angle around Z
                    // Wait, usually plants are 3D.
                    // Let's implement standard 3D turtle rotations roughly.
                    // We'll assume a local coordinate frame is needed if we want full 3D.
                    // For now, let's rotate around random horizontal axis to simulate 3D branching
                    // or stick to specific axes.

                    // In many simple 3D L-systems:
                    // + : Turn left (around U - Up)
                    // - : Turn right (around U)
                    // & : Pitch down (around L - Left)
                    // ^ : Pitch up (around L)
                    // / : Roll right (around H - Heading)
                    // * : Roll left (around H)

                    // Since our genome only specifies "angle", we'll scramble rotation axes slightly for variety
                    // or just rotate around Z and X.

                    // Let's assume +/- is Pitch/Yaw mix to create 3D spread.
                    // Construct a rotation matrix from axis and angle.

                    // To keep it robust without full Local Frame tracking (H, L, U):
                    // We will rotate direction vector around a localized axis.

                    const rotAxis1 = new BABYLON.Vector3(0, 0, 1); // Z axis
                    // Rotate direction
                    currentState.direction = this.rotateVector(currentState.direction, rotAxis1, angleRad);

                    break;

                case "-": // Yaw -
                    const rotAxis2 = new BABYLON.Vector3(0, 0, -1);
                    currentState.direction = this.rotateVector(currentState.direction, rotAxis2, angleRad);
                    break;

                case "&": // Pitch Down (if used in rules)
                    const rotAxis3 = new BABYLON.Vector3(1, 0, 0);
                    currentState.direction = this.rotateVector(currentState.direction, rotAxis3, angleRad);
                    break;

                case "^": // Pitch Up
                    const rotAxis4 = new BABYLON.Vector3(-1, 0, 0);
                    currentState.direction = this.rotateVector(currentState.direction, rotAxis4, angleRad);
                    break;

                // Common extension: / and * for Roll, but we might just use [ ] logic.
                // If the user's default rules uses standard symbols:
                // F -> F[+F]F[-F]F
                // We map + and - to 3D rotations suitable for plants (often combined pitch/yaw).

                // Let's randomize + and - slightly or use a predefined axis logic if only one Angle is provided.
                // To generate 3D structure from simple symbols, we often rotate around different axes.
                // Let's use a "Turn" axis that is orthogonal to Up and Direction.

                case "[": // Push
                    stack.push({
                        position: currentState.position.clone(),
                        direction: currentState.direction.clone(),
                        rotation: currentState.rotation.clone(),
                        thickness: currentState.thickness * 0.9 // Taper on branch
                    });
                    break;

                case "]": // Pop
                    if (stack.length > 0) {
                        currentState = stack.pop()!;
                    }
                    break;
            }
        }

        if (meshes.length === 0) {
            return new BABYLON.Mesh("empty", scene);
        }

        const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
        if (!merged) {
            return new BABYLON.Mesh("failed_merge", scene);
        }

        merged.name = "plant_mesh";

        // Apply Color
        const mat = new BABYLON.StandardMaterial("plantMat", scene);
        mat.diffuseColor = genome.color;
        mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        merged.material = mat;

        return merged;
    }

    private static rotateVector(vec: BABYLON.Vector3, axis: BABYLON.Vector3, angle: number): BABYLON.Vector3 {
        const matrix = BABYLON.Matrix.RotationAxis(axis, angle);
        return BABYLON.Vector3.TransformCoordinates(vec, matrix).normalize();
    }
}
