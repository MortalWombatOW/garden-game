
import { System, SystemType, World } from "../core/ECS";
import { DeadPlantState } from "../components/DeadPlantState";
import { TransformComponent } from "../components/TransformComponent";
import { TimeSystem } from "./TimeSystem";
import { SoilSystem } from "./SoilSystem";

/**
 * DecaySystem handles dead plant decomposition and nitrogen release.
 */
export class DecaySystem extends System {
    private timeSystem: TimeSystem;
    private soilSystem: SoilSystem;

    // Decay rate in % per game-hour
    private readonly DECAY_RATE = 5;

    constructor(world: World, timeSystem: TimeSystem, soilSystem: SoilSystem) {
        super(world, SystemType.FIXED);
        this.timeSystem = timeSystem;
        this.soilSystem = soilSystem;
    }

    public update(deltaTime: number): void {
        const gameHoursDelta = this.timeSystem.toGameTime(deltaTime);
        const entities = this.world.getEntitiesWithComponent(DeadPlantState);

        for (const entity of entities) {
            const state = entity.getComponent(DeadPlantState);
            const transform = entity.getComponent(TransformComponent);

            if (!state || !transform) continue;

            // Calculate decay increment
            const decayIncrement = this.DECAY_RATE * gameHoursDelta;
            state.decayProgress = Math.min(100, state.decayProgress + decayIncrement);

            // Release nitrogen proportionally
            const nitrogenToRelease = (state.nitrogenTotal - state.nitrogenReleased) * (decayIncrement / (100 - state.decayProgress + decayIncrement));
            if (nitrogenToRelease > 0) {
                this.soilSystem.modifyNitrogenAt(transform.x, transform.z, nitrogenToRelease);
                state.nitrogenReleased += nitrogenToRelease;
            }

            // Remove fully decayed plants
            if (state.decayProgress >= 100) {
                this.world.removeEntity(entity.id);
            }
        }
    }
}
