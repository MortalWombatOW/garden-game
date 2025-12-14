
import * as BABYLON from "@babylonjs/core";
import { PlantGenome } from "../components/PlantGenome";

/**
 * Factory for creating static plant meshes.
 * Each plant type has a single merged mesh that gets scaled during growth.
 */
export class PlantMeshFactory {

    /**
     * Create a mesh for the given plant type.
     * Returns a single merged mesh for reliable picking.
     */
    public static createMesh(
        genome: PlantGenome,
        scene: BABYLON.Scene
    ): BABYLON.Mesh {
        switch (genome.type) {
            case "sunflower":
                return this.createSunflower(genome, scene);
            default:
                return this.createSunflower(genome, scene);
        }
    }

    /**
     * Create a sunflower: tall stem with large yellow flower head
     */
    private static createSunflower(genome: PlantGenome, scene: BABYLON.Scene): BABYLON.Mesh {
        const meshes: BABYLON.Mesh[] = [];

        // Create materials
        const stemMat = new BABYLON.StandardMaterial("stemMat", scene);
        stemMat.diffuseColor = genome.stemColor;

        const flowerMat = new BABYLON.StandardMaterial("flowerMat", scene);
        flowerMat.diffuseColor = genome.flowerColor;

        const centerMat = new BABYLON.StandardMaterial("centerMat", scene);
        centerMat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);

        const leafMat = new BABYLON.StandardMaterial("leafMat", scene);
        leafMat.diffuseColor = new BABYLON.Color3(0.15, 0.45, 0.1);
        leafMat.backFaceCulling = false;

        // Stem - tall green cylinder
        const stem = BABYLON.MeshBuilder.CreateCylinder("stem", {
            height: 1.5,
            diameterTop: 0.05,
            diameterBottom: 0.08,
            tessellation: 8
        }, scene);
        stem.position.y = 0.75;
        stem.material = stemMat;
        meshes.push(stem);

        // Flower head
        const head = BABYLON.MeshBuilder.CreateCylinder("head", {
            height: 0.15,
            diameter: 0.5,
            tessellation: 16
        }, scene);
        head.position.y = 1.55;
        head.material = flowerMat;
        meshes.push(head);

        // Center of flower (brown)
        const center = BABYLON.MeshBuilder.CreateCylinder("center", {
            height: 0.08,
            diameter: 0.25,
            tessellation: 16
        }, scene);
        center.position.y = 1.6;
        center.material = centerMat;
        meshes.push(center);

        // Leaves on stem
        const leaf1 = BABYLON.MeshBuilder.CreateDisc("leaf1", { radius: 0.15, tessellation: 6 }, scene);
        leaf1.scaling.x = 0.5;
        leaf1.position.set(0.15, 0.5, 0);
        leaf1.rotation.z = -Math.PI / 6;
        leaf1.material = leafMat;
        meshes.push(leaf1);

        const leaf2 = BABYLON.MeshBuilder.CreateDisc("leaf2", { radius: 0.15, tessellation: 6 }, scene);
        leaf2.scaling.x = 0.5;
        leaf2.position.set(-0.12, 0.8, 0.1);
        leaf2.rotation.z = Math.PI / 5;
        leaf2.rotation.y = Math.PI / 3;
        leaf2.material = leafMat;
        meshes.push(leaf2);

        // Merge with multiMaterial = true to preserve individual materials
        const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
        if (!merged) {
            const fallback = BABYLON.MeshBuilder.CreateCylinder("sunflower_fallback", { height: 1.5, diameter: 0.1 }, scene);
            fallback.position.y = 0.75;
            fallback.material = stemMat;
            return fallback;
        }

        merged.name = "sunflower";
        merged.isPickable = true;

        return merged;
    }
}
