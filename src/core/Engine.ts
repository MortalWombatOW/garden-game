
import * as BABYLON from "@babylonjs/core";

export class Engine {
    private static instance: Engine;
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private groundMaterial: BABYLON.StandardMaterial | null = null;

    private constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);

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

        // Lighting
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0.5, 1, 0.25), this.scene);
        light.intensity = 0.8;
        light.groundColor = new BABYLON.Color3(0.3, 0.25, 0.2);

        // Ground with dynamic material - add subdivisions for texture detail
        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: 50,
            height: 50,
            subdivisions: 50  // Match soil grid size for proper UV mapping
        }, this.scene);
        this.groundMaterial = new BABYLON.StandardMaterial("groundMat", this.scene);
        this.groundMaterial.diffuseColor = new BABYLON.Color3(0.45, 0.35, 0.25);
        this.groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        ground.material = this.groundMaterial;
    }
}
