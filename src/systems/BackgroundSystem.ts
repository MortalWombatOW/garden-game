
import * as BABYLON from "@babylonjs/core";
import { System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";

export enum BackgroundPreset {
    FOREST = "Forest",
    CITY = "City",
    DESERT = "Desert",
    TOWN = "Town"
}

export class BackgroundSystem extends System {
    private scene: BABYLON.Scene;
    private backgroundMeshes: BABYLON.Mesh[] = [];
    private currentPreset: BackgroundPreset = BackgroundPreset.FOREST;

    // Config
    private readonly INNER_RADIUS = 35; // Outside fence
    private readonly OUTER_RADIUS = 80;

    constructor(world: World) {
        super(world, SystemType.RENDER);
        this.scene = Engine.getInstance().getScene();

        // Initial generation
        this.generatePreset(this.currentPreset);
    }

    public update(_deltaTime: number): void {
        // Static meshes
    }

    public cyclePreset(): void {
        const presets = Object.values(BackgroundPreset);
        const currentIndex = presets.indexOf(this.currentPreset);
        const nextIndex = (currentIndex + 1) % presets.length;
        this.setPreset(presets[nextIndex]);
    }

    public setPreset(preset: BackgroundPreset): void {
        if (this.currentPreset === preset) return;
        this.currentPreset = preset;

        // Clear old
        this.clearBackground();

        // Generate new
        this.generatePreset(preset);

        console.log(`Switched background to ${preset}`);
    }

    private clearBackground(): void {
        this.backgroundMeshes.forEach(mesh => {
            mesh.dispose();
        });
        this.backgroundMeshes = [];
    }

    private generatePreset(preset: BackgroundPreset): void {
        switch (preset) {
            case BackgroundPreset.FOREST:
                this.generateForest();
                break;
            case BackgroundPreset.CITY:
                this.generateCity();
                break;
            case BackgroundPreset.DESERT:
                this.generateDesert();
                break;
            case BackgroundPreset.TOWN:
                this.generateTown();
                break;
        }
    }

    private getRandomPosition(minRadius: number, maxRadius: number): BABYLON.Vector3 {
        const angle = Math.random() * Math.PI * 2;
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Get simple terrain height (approximate, since we are outside the main map)
        // We'll flatten it out a bit at distance
        const y = 0 - Math.random() * 2;

        return new BABYLON.Vector3(x, y, z);
    }

    private createGround(material: BABYLON.Material, radius: number): void {
        const ground = BABYLON.MeshBuilder.CreateGround("bg_ground", { width: radius * 2, height: radius * 2 }, this.scene);
        ground.position.y = -0.1; // Slightly below zero to avoid z-fighting with potential terrain
        ground.material = material;
        ground.freezeWorldMatrix(); // Optimization due to static nature
        this.backgroundMeshes.push(ground);
    }

    private generateForest(): void {
        const meshes: BABYLON.Mesh[] = [];
        const treeCount = 400;

        // Materials
        const trunkMat = new BABYLON.StandardMaterial("bgTrunkMat", this.scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.3, 0.2, 0.1);
        trunkMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const leafMat = new BABYLON.StandardMaterial("bgLeafMat", this.scene);
        leafMat.diffuseColor = new BABYLON.Color3(0.1, 0.3, 0.1); // Darker forest green
        leafMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const groundMat = new BABYLON.StandardMaterial("bgForestGround", this.scene);
        groundMat.diffuseColor = new BABYLON.Color3(0.05, 0.2, 0.05); // Very dark green ground
        groundMat.specularColor = new BABYLON.Color3(0, 0, 0);

        // 1. Ground
        this.createGround(groundMat, 400);

        // 2. Trees (Inner Ring)
        for (let i = 0; i < treeCount; i++) {
            const pos = this.getRandomPosition(this.INNER_RADIUS, this.OUTER_RADIUS);
            const scale = 0.8 + Math.random() * 1.5;

            // Trunk
            const trunk = BABYLON.MeshBuilder.CreateCylinder(`tree_trunk_${i}`, {
                height: 3 * scale,
                diameter: 0.8 * scale,
            }, this.scene);
            trunk.position = pos.clone();
            trunk.position.y += (3 * scale) / 2;
            trunk.material = trunkMat;
            meshes.push(trunk);

            // Leaves (Cone)
            const leaves = BABYLON.MeshBuilder.CreateCylinder(`tree_leaves_${i}`, {
                height: 5 * scale,
                diameterTop: 0,
                diameterBottom: 4 * scale,
            }, this.scene);
            leaves.position = pos.clone();
            leaves.position.y += (3 * scale) + (5 * scale) / 2 - 0.5;
            leaves.material = leafMat;
            meshes.push(leaves);
        }

        // 3. Tree Wall (Horizon)
        const wallCount = 200;
        const wallRadius = this.OUTER_RADIUS + 10;
        for (let i = 0; i < wallCount; i++) {
            const angle = (i / wallCount) * Math.PI * 2;
            const r = wallRadius + Math.random() * 20;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            const scale = 4 + Math.random() * 2; // Huge trees

            // Simple combined shape for distant trees
            const tree = BABYLON.MeshBuilder.CreateCylinder(`wall_tree_${i}`, {
                height: 10 * scale,
                diameterBottom: 3 * scale,
                diameterTop: 0
            }, this.scene);
            tree.position = new BABYLON.Vector3(x, 5 * scale, z);
            tree.material = leafMat;
            meshes.push(tree);
        }

        // Merge for performance
        if (meshes.length > 0) {
            const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
            if (merged) {
                merged.name = "Background_Forest";
                merged.freezeWorldMatrix();
                this.backgroundMeshes.push(merged);
            }
        }
    }

    private generateCity(): void {
        const meshes: BABYLON.Mesh[] = [];
        const buildingCount = 100;

        const buildingMat = new BABYLON.StandardMaterial("bgCityMat", this.scene);
        buildingMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.3);
        buildingMat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.2); // Mild glow

        const concreteMat = new BABYLON.StandardMaterial("bgCityConcrete", this.scene);
        concreteMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15); // Dark grey
        concreteMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const oceanMat = new BABYLON.StandardMaterial("bgOcean", this.scene);
        oceanMat.diffuseColor = new BABYLON.Color3(0.0, 0.1, 0.3); // Deep blue
        oceanMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Reflective
        oceanMat.alpha = 0.9;

        // 1. Island Ground
        const islandRadius = this.OUTER_RADIUS + 20;
        const ground = BABYLON.MeshBuilder.CreateGround("city_island", { width: islandRadius * 2, height: islandRadius * 2 }, this.scene);
        ground.position.y = -0.1;
        ground.material = concreteMat;
        ground.freezeWorldMatrix();
        this.backgroundMeshes.push(ground);

        // 2. Ocean
        const ocean = BABYLON.MeshBuilder.CreateGround("city_ocean", { width: 1000, height: 1000 }, this.scene);
        ocean.position.y = -2; // Below island
        ocean.material = oceanMat;
        ocean.freezeWorldMatrix();
        this.backgroundMeshes.push(ocean);

        // 3. Buildings - SCALED UP
        for (let i = 0; i < buildingCount; i++) {
            const pos = this.getRandomPosition(this.INNER_RADIUS, this.OUTER_RADIUS);

            // 2.5x - 3x larger than before
            const height = 30 + Math.random() * 100;
            const width = 15 + Math.random() * 15;

            const building = BABYLON.MeshBuilder.CreateBox(`building_${i}`, {
                width: width,
                depth: width,
                height: height
            }, this.scene);

            building.position = pos.clone();
            building.position.y += height / 2;
            building.material = buildingMat;
            meshes.push(building);
        }

        if (meshes.length > 0) {
            const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
            if (merged) {
                merged.name = "Background_City";
                merged.freezeWorldMatrix();
                this.backgroundMeshes.push(merged);
            }
        }
    }

    private generateDesert(): void {
        const meshes: BABYLON.Mesh[] = [];
        const cactiCount = 200;

        const cactusMat = new BABYLON.StandardMaterial("bgCactusMat", this.scene);
        cactusMat.diffuseColor = new BABYLON.Color3(0.4, 0.6, 0.2);
        cactusMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const sandMat = new BABYLON.StandardMaterial("bgSandMat", this.scene);
        sandMat.diffuseColor = new BABYLON.Color3(0.8, 0.7, 0.5); // Sand
        sandMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const cliffMat = new BABYLON.StandardMaterial("bgCliffMat", this.scene);
        cliffMat.diffuseColor = new BABYLON.Color3(0.7, 0.5, 0.4); // Reddish rock
        cliffMat.specularColor = new BABYLON.Color3(0, 0, 0);

        // 1. Ground
        this.createGround(sandMat, 400);

        // 2. Cacti
        for (let i = 0; i < cactiCount; i++) {
            const pos = this.getRandomPosition(this.INNER_RADIUS, this.OUTER_RADIUS);
            const scale = 1 + Math.random();

            // Main body
            const body = BABYLON.MeshBuilder.CreateCylinder(`cactus_${i}`, {
                height: 4 * scale,
                diameter: 0.8 * scale
            }, this.scene);
            body.position = pos.clone();
            body.position.y += (4 * scale) / 2;
            body.material = cactusMat;
            meshes.push(body);

            // Arm
            if (Math.random() > 0.5) {
                const armHeight = 1.5 * scale;
                const arm = BABYLON.MeshBuilder.CreateCylinder(`cactus_arm_${i}`, {
                    height: armHeight,
                    diameter: 0.6 * scale
                }, this.scene);
                arm.position = pos.clone();
                arm.position.y += (2 * scale);
                arm.position.x += 0.6 * scale;
                arm.rotation.z = -Math.PI / 4;
                arm.material = cactusMat;
                meshes.push(arm);
            }
        }

        // 3. Canyon Walls (Horizon)
        const cliffCount = 100;
        const cliffRadius = this.OUTER_RADIUS + 30;
        for (let i = 0; i < cliffCount; i++) {
            const angle = (i / cliffCount) * Math.PI * 2;
            const r = cliffRadius + (Math.random() * 10 - 5);
            const width = 20 + Math.random() * 10;
            const height = 40 + Math.random() * 20;

            const cliff = BABYLON.MeshBuilder.CreateBox(`cliff_${i}`, {
                width: width,
                height: height,
                depth: 10
            }, this.scene);

            cliff.position = new BABYLON.Vector3(
                Math.cos(angle) * r,
                height / 2 - 5, // Sunk slightly
                Math.sin(angle) * r
            );
            cliff.rotation.y = -angle; // Face inwards
            cliff.material = cliffMat;
            meshes.push(cliff);
        }

        if (meshes.length > 0) {
            const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
            if (merged) {
                merged.name = "Background_Desert";
                merged.freezeWorldMatrix();
                this.backgroundMeshes.push(merged);
            }
        }
    }

    private generateTown(): void {
        const meshes: BABYLON.Mesh[] = [];
        const houseCount = 150;

        const wallMat = new BABYLON.StandardMaterial("bgHouseWall", this.scene);
        wallMat.diffuseColor = new BABYLON.Color3(0.8, 0.7, 0.6);
        wallMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const roofMat = new BABYLON.StandardMaterial("bgHouseRoof", this.scene);
        roofMat.diffuseColor = new BABYLON.Color3(0.6, 0.2, 0.2);
        roofMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const grassMat = new BABYLON.StandardMaterial("bgGrass", this.scene);
        grassMat.diffuseColor = new BABYLON.Color3(0.3, 0.6, 0.3); // Grass
        grassMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const hillMat = new BABYLON.StandardMaterial("bgHill", this.scene);
        hillMat.diffuseColor = new BABYLON.Color3(0.25, 0.5, 0.25); // Darker grass hills
        hillMat.specularColor = new BABYLON.Color3(0, 0, 0);

        // 1. Ground
        this.createGround(grassMat, 400);

        // 2. Houses - SCALED UP
        for (let i = 0; i < houseCount; i++) {
            const pos = this.getRandomPosition(this.INNER_RADIUS, this.OUTER_RADIUS);

            // 2.5x larger
            const scale = (1 + Math.random() * 0.5) * 2.5;

            // House Base
            const base = BABYLON.MeshBuilder.CreateBox(`house_${i}`, {
                width: 4 * scale,
                depth: 4 * scale,
                height: 3 * scale
            }, this.scene);
            base.position = pos.clone();
            base.position.y += (3 * scale) / 2;
            base.material = wallMat;
            meshes.push(base);

            // Roof (Pyramid/Prism)
            const roof = BABYLON.MeshBuilder.CreateCylinder(`roof_${i}`, {
                diameter: 6 * scale,
                height: 2 * scale,
                tessellation: 4
            }, this.scene);
            roof.position = pos.clone();
            roof.position.y += (3 * scale) + (2 * scale) / 2;
            roof.rotation.y = Math.PI / 4; // Align square
            roof.material = roofMat;
            meshes.push(roof);
        }

        // 3. Rolling Hills (Horizon) - 5 Layers of Depth
        const startRadius = this.OUTER_RADIUS + 15;
        const radiusStep = 25;
        const baseSize = 40;

        for (let layer = 0; layer < 5; layer++) {
            const count = 40 + layer * 5; // More hills in back to fill gaps
            const currentRadius = startRadius + (layer * radiusStep);

            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.2);
                const r = currentRadius + (Math.random() * 10 - 5);
                const size = baseSize + (layer * 15) + (Math.random() * 20);

                const hill = BABYLON.MeshBuilder.CreateSphere(`hill_l${layer}_${i}`, {
                    diameter: size,
                    segments: 8
                }, this.scene);

                hill.position = new BABYLON.Vector3(
                    Math.cos(angle) * r,
                    -size * 0.25, // Raised up slightly (was 0.45)
                    Math.sin(angle) * r
                );

                // Flatten them more
                hill.scaling.y = 0.3 + (layer * 0.05);
                hill.material = hillMat;
                meshes.push(hill);
            }
        }

        if (meshes.length > 0) {
            const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
            if (merged) {
                merged.name = "Background_Town";
                merged.freezeWorldMatrix();
                this.backgroundMeshes.push(merged);
            }
        }
    }
}
