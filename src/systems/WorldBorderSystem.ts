
import * as BABYLON from "@babylonjs/core";
import { System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";

export class WorldBorderSystem extends System {
    private scene: BABYLON.Scene;
    private fenceMesh: BABYLON.Mesh | null = null;
    private groundMaterial: BABYLON.StandardMaterial;

    // Fence Config
    private readonly MAP_SIZE = 50; // Total width/height
    private readonly HALF_SIZE = 25;
    private readonly POST_INTERVAL = 2.5;
    private readonly POST_HEIGHT = 1.6;
    private readonly RAIL_HEIGHT_TOP = 1.3;
    private readonly RAIL_HEIGHT_BOTTOM = 0.5;

    constructor(world: World) {
        super(world, SystemType.RENDER); // Run once or on demand, but RENDER type is fine
        this.scene = Engine.getInstance().getScene();

        // Simple white wood material
        this.groundMaterial = new BABYLON.StandardMaterial("fenceMat", this.scene);
        this.groundMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.95);
        this.groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        this.createFence();
    }

    public update(_deltaTime: number): void {
        // Static mesh, no update needed
    }

    private createFence(): void {
        const engine = Engine.getInstance();
        const meshes: BABYLON.Mesh[] = [];

        // Perimeter walk
        // We'll go along 4 sides: Top, Right, Bottom, Left

        const sides = [
            { // Top (North)
                start: new BABYLON.Vector3(-this.HALF_SIZE, 0, this.HALF_SIZE),
                dir: new BABYLON.Vector3(1, 0, 0),
                length: this.MAP_SIZE
            },
            { // Right (East)
                start: new BABYLON.Vector3(this.HALF_SIZE, 0, this.HALF_SIZE),
                dir: new BABYLON.Vector3(0, 0, -1),
                length: this.MAP_SIZE
            },
            { // Bottom (South)
                start: new BABYLON.Vector3(this.HALF_SIZE, 0, -this.HALF_SIZE),
                dir: new BABYLON.Vector3(-1, 0, 0),
                length: this.MAP_SIZE
            },
            { // Left (West)
                start: new BABYLON.Vector3(-this.HALF_SIZE, 0, -this.HALF_SIZE),
                dir: new BABYLON.Vector3(0, 0, 1),
                length: this.MAP_SIZE
            }
        ];

        sides.forEach(side => {
            const numSegments = Math.ceil(side.length / this.POST_INTERVAL);

            for (let i = 0; i < numSegments; i++) {
                const distance = i * this.POST_INTERVAL;
                const pos = side.start.add(side.dir.scale(distance));

                // Get ground height
                const y = engine.getTerrainHeightAt(pos.x, pos.z);

                // Create Post
                const post = BABYLON.MeshBuilder.CreateBox("post", {
                    width: 0.2,
                    depth: 0.2,
                    height: this.POST_HEIGHT
                }, this.scene);
                post.position = new BABYLON.Vector3(pos.x, y + this.POST_HEIGHT / 2, pos.z);
                meshes.push(post);

                // Create Rails (connecting to next post)
                if (i < numSegments) {
                    const nextDistance = Math.min((i + 1) * this.POST_INTERVAL, side.length);
                    const nextPos = side.start.add(side.dir.scale(nextDistance));
                    const nextY = engine.getTerrainHeightAt(nextPos.x, nextPos.z);

                    const segmentLength = BABYLON.Vector3.Distance(
                        new BABYLON.Vector3(pos.x, 0, pos.z),
                        new BABYLON.Vector3(nextPos.x, 0, nextPos.z)
                    );

                    const midPos = pos.add(nextPos).scale(0.5);
                    const midY = (y + nextY) * 0.5; // Average height for rail center

                    // Angle
                    const angle = Math.atan2(side.dir.z, side.dir.x);

                    // Top Rail
                    const topRail = BABYLON.MeshBuilder.CreateBox("railTop", {
                        width: segmentLength,
                        height: 0.1,
                        depth: 0.05
                    }, this.scene);
                    topRail.position = new BABYLON.Vector3(midPos.x, midY + this.RAIL_HEIGHT_TOP, midPos.z);
                    topRail.rotation.y = -angle; // Rotate to match direction
                    meshes.push(topRail);

                    // Bottom Rail
                    const botRail = BABYLON.MeshBuilder.CreateBox("railBot", {
                        width: segmentLength,
                        height: 0.1,
                        depth: 0.05
                    }, this.scene);
                    botRail.position = new BABYLON.Vector3(midPos.x, midY + this.RAIL_HEIGHT_BOTTOM, midPos.z);
                    botRail.rotation.y = -angle;
                    meshes.push(botRail);

                    // Pickets
                    const picketsPerSegment = 5;
                    const picketGap = segmentLength / picketsPerSegment;

                    for (let p = 1; p < picketsPerSegment; p++) {
                        const picketDist = p * picketGap;
                        const picketPosLocal = side.dir.scale(picketDist);
                        // Start slightly offset from post
                        const picketWorldPos = pos.add(picketPosLocal);

                        const picketY = engine.getTerrainHeightAt(picketWorldPos.x, picketWorldPos.z);

                        const picket = BABYLON.MeshBuilder.CreateBox("picket", {
                            width: 0.1,
                            depth: 0.02,
                            height: 1.2
                        }, this.scene);

                        // Picket sits on ground + half height
                        picket.position = new BABYLON.Vector3(picketWorldPos.x, picketY + 0.6, picketWorldPos.z);
                        picket.rotation.y = -angle;
                        meshes.push(picket);
                    }
                }
            }
        });

        // Merge all fence meshes
        if (meshes.length > 0) {
            this.fenceMesh = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
            if (this.fenceMesh) {
                this.fenceMesh.name = "WorldBorderFence";
                this.fenceMesh.material = this.groundMaterial;
                this.fenceMesh.receiveShadows = true;

                // Ensure it stays when processing
                this.fenceMesh.freezeWorldMatrix();
            }
        }
    }
}
