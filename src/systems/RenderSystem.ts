
import { System, World } from "../core/ECS";
// import { PlantState } from "../components/PlantState";

export class RenderSystem extends System {
    constructor(world: World) {
        super(world);
    }

    public update(_deltaTime: number): void {
        // Sync ECS data to meshes
        // For thin instances, update buffers here 
    }
}
