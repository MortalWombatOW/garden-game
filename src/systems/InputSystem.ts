
import { System, World } from "../core/ECS";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";

export class InputSystem extends System {
    private scene: BABYLON.Scene;

    constructor(world: World) {
        super(world);
        this.scene = Engine.getInstance().getScene();

        this.setupInput();
    }

    private setupInput(): void {
        this.scene.onPointerDown = (evt, pickResult) => {
            if (evt.button === 0) { // Left click
                console.log("Left click", pickResult);
            } else if (evt.button === 2) { // Right click
                console.log("Right click", pickResult);
            }
        };
    }

    public update(_deltaTime: number): void {
        // Handle continuous input if needed
    }
}
