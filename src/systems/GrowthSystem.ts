
import { System, SystemType, World } from "../core/ECS";
import { PlantState } from "../components/PlantState";
import { Needs } from "../components/Needs";
import { TransformComponent } from "../components/TransformComponent";
import { TimeSystem } from "./TimeSystem";
import { SoilSystem } from "./SoilSystem";
import type { LightingSystem } from "./LightingSystem";

// Root radius (in world units) by growth stage
const ROOT_RADIUS: Record<string, number> = {
    sprout: 0.5,
    vegetative: 1.5,
    flowering: 2.5
};

export class GrowthSystem extends System {
    private timeSystem: TimeSystem;
    private soilSystem: SoilSystem;
    private lightingSystem: LightingSystem | null = null;

    // Growth modifiers
    private readonly SHADE_GROWTH_MULTIPLIER = 0.3; // Growth rate in shade (30% of full sun)
    private readonly MIN_LIGHT_FOR_GROWTH = 0.1; // Minimum sunlight to grow at all

    constructor(world: World, timeSystem: TimeSystem, soilSystem: SoilSystem) {
        super(world, SystemType.FIXED);
        this.timeSystem = timeSystem;
        this.soilSystem = soilSystem;
    }

    public setLightingSystem(lightingSystem: LightingSystem): void {
        this.lightingSystem = lightingSystem;
    }

    public update(deltaTime: number): void {
        const entities = this.world.getEntitiesWithComponent(PlantState);

        // Convert real delta to in-game hours
        const gameHoursDelta = this.timeSystem.toGameTime(deltaTime);

        for (const entity of entities) {
            const state = entity.getComponent(PlantState);
            const needs = entity.getComponent(Needs);
            const transform = entity.getComponent(TransformComponent);

            if (!state || !needs || !transform) continue;

            // Skip dead plants
            if (state.health <= 0) continue;

            // Check sunlight intensity for this plant
            let sunIntensity = 1.0;
            if (this.lightingSystem) {
                sunIntensity = this.lightingSystem.getSunlightIntensity(transform.x, transform.z);
            }

            // Calculate effective growth rate based on sunlight
            // Plants need minimum light to grow, otherwise they just survive
            const growthMultiplier = sunIntensity >= this.MIN_LIGHT_FOR_GROWTH
                ? this.SHADE_GROWTH_MULTIPLIER + (1 - this.SHADE_GROWTH_MULTIPLIER) * sunIntensity
                : 0;

            // Age the plant in game-hours (modified by sunlight)
            state.age += gameHoursDelta * growthMultiplier;

            // Update growth stage
            state.updateStage();

            // --- Water Consumption from Soil ---
            // Determine root radius based on growth stage
            const rootRadius = ROOT_RADIUS[state.stage] || 1.0;

            // How much water does this plant want per game-hour?
            // Bigger plants need more water.
            const waterNeedPerHour = state.stage === "flowering" ? 5 : state.stage === "vegetative" ? 3 : 1;
            const waterWanted = waterNeedPerHour * gameHoursDelta;

            // Try to absorb water from soil
            const absorbed = this.soilSystem.absorbWater(
                transform.x,
                transform.z,
                rootRadius,
                waterWanted
            );

            // Refill internal water buffer
            needs.water = Math.min(100, needs.water + absorbed);

            // Natural water usage/transpiration (modified by sunlight - less transpiration in shade)
            const transpirationMultiplier = this.SHADE_GROWTH_MULTIPLIER + (1 - this.SHADE_GROWTH_MULTIPLIER) * sunIntensity;
            const transpiration = gameHoursDelta * 1.5 * transpirationMultiplier; // Lose 1.5% per game-hour at full sun
            needs.water = Math.max(0, needs.water - transpiration);

            // Death logic - only kill if not in sprout stage and critically dehydrated
            if (needs.water < 5 && state.stage !== "sprout") {
                state.health = 0;
            }
        }
    }
}
