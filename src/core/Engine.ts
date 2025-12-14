
import * as BABYLON from "@babylonjs/core";
import { PerlinNoise } from "./PerlinNoise";

export class Engine {
    private static instance: Engine;
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private groundMaterial: BABYLON.StandardMaterial | null = null;
    private ground: BABYLON.Mesh | null = null;
    private perlinNoise: PerlinNoise;

    // Terrain configuration
    private readonly TERRAIN_HEIGHT = 10;     // Maximum terrain height
    private readonly TERRAIN_SCALE = 0.02;   // Noise frequency (lower = smoother hills)
    private readonly TERRAIN_OCTAVES = 4;    // Detail levels
    private readonly TERRAIN_SEED = 42;      // Random seed for reproducibility

    private constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.perlinNoise = new PerlinNoise(this.TERRAIN_SEED);

        this.setupScene();
    }

    public static getInstance(canvas?: HTMLCanvasElement): Engine {
        if (!Engine.instance) {
            if (!canvas) {
                throw new Error("Engine not initialized. Pass canvas to getInstance first.");
            }
            Engine.instance = new Engine(canvas);
        }
        return Engine.instance;
    }

    public getScene(): BABYLON.Scene {
        return this.scene;
    }

    public getEngine(): BABYLON.Engine {
        return this.engine;
    }

    public getGroundMaterial(): BABYLON.StandardMaterial | null {
        return this.groundMaterial;
    }

    public resize(): void {
        this.engine.resize();
    }

    private setupScene(): void {
        // Camera setup
        const camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 15, -25), this.scene);
        camera.setTarget(BABYLON.Vector3.Zero());
        camera.attachControl(this.canvas, true);

        // Note: Lighting is now handled by LightingSystem

        // Ground with dynamic material - higher subdivisions for smooth terrain
        this.ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: 50,
            height: 50,
            subdivisions: 100,  // Higher subdivisions for smoother terrain
            updatable: true     // Allow vertex modification
        }, this.scene);

        // Apply Perlin noise displacement to terrain vertices
        this.applyTerrainDisplacement();

        this.groundMaterial = new BABYLON.StandardMaterial("groundMat", this.scene);
        this.groundMaterial.diffuseColor = new BABYLON.Color3(0.45, 0.35, 0.25);
        this.groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        this.ground.material = this.groundMaterial;
        this.ground.receiveShadows = true;
    }

    private applyTerrainDisplacement(): void {
        if (!this.ground) return;

        const positions = this.ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        if (!positions) return;

        // Modify Y values based on Perlin noise
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];

            // Use fBm for natural-looking terrain
            const height = this.perlinNoise.fbm01(
                x * this.TERRAIN_SCALE,
                z * this.TERRAIN_SCALE,
                this.TERRAIN_OCTAVES,
                2.0,  // lacunarity
                0.5   // persistence
            );

            positions[i + 1] = height * this.TERRAIN_HEIGHT;
        }

        // Update mesh with new vertex positions
        this.ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);

        // Recalculate normals for proper lighting on the terrain
        const normals: number[] = [];
        BABYLON.VertexData.ComputeNormals(positions, this.ground.getIndices(), normals);
        this.ground.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
    }

    /**
     * Get terrain height at a given world position using Perlin noise.
     */
    public getTerrainHeightAt(x: number, z: number): number {
        const height = this.perlinNoise.fbm01(
            x * this.TERRAIN_SCALE,
            z * this.TERRAIN_SCALE,
            this.TERRAIN_OCTAVES,
            2.0,
            0.5
        );
        return height * this.TERRAIN_HEIGHT;
    }

    public toggleInspector(): void {
        if (this.scene.debugLayer.isVisible()) {
            this.scene.debugLayer.hide();
        } else {
            import("@babylonjs/inspector").then(() => {
                this.scene.debugLayer.show();
            });
        }
    }
}
