
import { System, World } from "../core/ECS";
import { PlantState } from "../components/PlantState";
import { Needs } from "../components/Needs";

export class GrowthSystem extends System {
    constructor(world: World) {
        super(world);
    }

    public update(deltaTime: number): void {
        const entities = this.world.getEntitiesWithComponent(PlantState);

        for (const entity of entities) {
            const state = entity.getComponent(PlantState);
            const needs = entity.getComponent(Needs);

            if (state && needs) {
                // Growth logic placeholder
                state.age += deltaTime;
                // console.log(`Plant ${entity.id} growing. Age: ${state.age}`);
            }
        }
    }
}
