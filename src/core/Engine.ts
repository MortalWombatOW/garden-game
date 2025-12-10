
import * as BABYLON from "@babylonjs/core";

export class Engine {
    private static instance: Engine;
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;

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

    public resize(): void {
        this.engine.resize();
    }

    private setupScene(): void {
        // Basic setup
        const camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 10, -20), this.scene);
        camera.setTarget(BABYLON.Vector3.Zero());
        camera.attachControl(this.canvas, true);

        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 0.7;

        // Simple ground for reference
        BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, this.scene);
    }
}
