
import { Entity, System, SystemType, World } from "../core/ECS";
import { PlantState } from "../components/PlantState";
import { Needs } from "../components/Needs";
import { TransformComponent } from "../components/TransformComponent";
import { DeadPlantState } from "../components/DeadPlantState";
import { TimeSystem } from "./TimeSystem";
import { SoilSystem } from "./SoilSystem";
import { SpatialHashGrid } from "../core/SpatialHashGrid";
import type { LightingSystem } from "./LightingSystem";

// Root radius (in world units) by growth stage - exported for visualization
export const ROOT_RADIUS: Record<string, number> = {
    sprout: 0.5,
    vegetative: 1.5,
    flowering: 2.5
};

// Stage multipliers for dominance calculation (larger plants dominate)
const STAGE_MULTIPLIER: Record<string, number> = {
    sprout: 1,
    vegetative: 2,
    flowering: 3
};

export class GrowthSystem extends System {
    private timeSystem: TimeSystem;
    private soilSystem: SoilSystem;
    private spatialHash: SpatialHashGrid;
    private lightingSystem: LightingSystem | null = null;

    // Sunlight cache to avoid expensive raycasts every tick
    // Key: entity id, Value: cached sunlight intensity (0-1)
    private sunlightCache: Map<number, number> = new Map();
    // Track the last game-hour when we updated lighting
    private lastLightingUpdateHour: number = -1;

    // Growth modifiers
    private readonly SHADE_GROWTH_MULTIPLIER = 0.3; // Growth rate in shade (30% of full sun)
    private readonly MIN_LIGHT_FOR_GROWTH = 0.1; // Minimum sunlight to grow at all

    constructor(world: World, timeSystem: TimeSystem, soilSystem: SoilSystem, spatialHash: SpatialHashGrid) {
        super(world, SystemType.FIXED);
        this.timeSystem = timeSystem;
        this.soilSystem = soilSystem;
        this.spatialHash = spatialHash;
    }

    public setLightingSystem(lightingSystem: LightingSystem): void {
        this.lightingSystem = lightingSystem;
    }

    /**
     * Remove a specific entity from the sunlight cache (call when a plant is removed)
     */
    public removeFromCache(entityId: number): void {
        this.sunlightCache.delete(entityId);
    }

    /**
     * Clean up stale cache entries for entities that no longer exist
     */
    private cleanupStaleEntries(currentEntityIds: Set<number>): void {
        for (const cachedId of this.sunlightCache.keys()) {
            if (!currentEntityIds.has(cachedId)) {
                this.sunlightCache.delete(cachedId);
            }
        }
    }

    public update(deltaTime: number): void {
        const entities = this.world.getEntitiesWithComponent(PlantState);

        // Convert real delta to in-game hours
        const gameHoursDelta = this.timeSystem.toGameTime(deltaTime);

        // Calculate current game-hour (0-23, integer)
        const currentGameHour = Math.floor(this.timeSystem.getTimeOfDayFraction() * 24);

        // Check if we need to refresh sunlight cache (once per game-hour)
        const needsLightingRefresh = currentGameHour !== this.lastLightingUpdateHour;
        if (needsLightingRefresh) {
            this.lastLightingUpdateHour = currentGameHour;
            // Clean up stale cache entries for removed plants
            const currentEntityIds = new Set(entities.map(e => e.id));
            this.cleanupStaleEntries(currentEntityIds);
        }

        for (const entity of entities) {
            const state = entity.getComponent(PlantState);
            const needs = entity.getComponent(Needs);
            const transform = entity.getComponent(TransformComponent);

            if (!state || !needs || !transform) continue;

            // Skip dead plants (but NOT coma plants - they need water processing for revival)
            if (state.health <= 0 && !state.inComa) continue;

            // Get sunlight intensity using lazy cache update
            let sunIntensity = 1.0;
            if (this.lightingSystem) {
                // Only recalculate if it's a new game-hour OR we don't have a cached value
                if (needsLightingRefresh || !this.sunlightCache.has(entity.id)) {
                    sunIntensity = this.lightingSystem.getSunlightIntensity(transform.x, transform.z);
                    this.sunlightCache.set(entity.id, sunIntensity);
                } else {
                    sunIntensity = this.sunlightCache.get(entity.id) ?? 1.0;
                }
            }

            // Plants in coma don't grow - they just wait to be revived or die
            if (!state.inComa) {
                // Calculate effective growth rate based on sunlight
                // Plants need minimum light to grow, otherwise they just survive
                const growthMultiplier = sunIntensity >= this.MIN_LIGHT_FOR_GROWTH
                    ? this.SHADE_GROWTH_MULTIPLIER + (1 - this.SHADE_GROWTH_MULTIPLIER) * sunIntensity
                    : 0;

                // Age the plant in game-hours (absolute time)
                state.age += gameHoursDelta;

                // Grow based on sunlight (effective age)
                state.sunlitAge += gameHoursDelta * growthMultiplier;

                // Update growth stage
                state.updateStage();
            }

            // --- Water Consumption from Soil with Competition ---
            // Determine root radius based on growth stage
            const rootRadius = ROOT_RADIUS[state.stage] || 1.0;

            // Calculate this plant's dominance score
            const myDominance = state.age * (STAGE_MULTIPLIER[state.stage] || 1);

            // Check for overlapping root zones and calculate competition penalty
            // Check for overlapping root zones using spatial hash for O(N) performance
            // We search for neighbors within the max possible dual radius (my radius + max possible neighbor radius)
            // Max plant radius is ~2.5 (flowering), so we query with a safe margin
            const queryRadius = rootRadius + 2.5;
            const neighborIds = this.spatialHash.query(transform.x, transform.z, queryRadius);

            let competitionPenalty = 0;

            for (const neighborId of neighborIds) {
                if (neighborId === entity.id) continue;

                const otherEntity = this.world.getEntity(neighborId);
                if (!otherEntity) continue;

                const otherState = otherEntity.getComponent(PlantState);
                const otherTransform = otherEntity.getComponent(TransformComponent);

                // Only compete with living plants
                if (!otherState || !otherTransform || otherState.health <= 0) continue;

                const otherRadius = ROOT_RADIUS[otherState.stage] || 1.0;
                const dx = transform.x - otherTransform.x;
                const dz = transform.z - otherTransform.z;
                const distanceSq = dx * dx + dz * dz;
                const radiusSum = rootRadius + otherRadius;

                // Check if root zones overlap (squared distance check is faster)
                if (distanceSq < radiusSum * radiusSum) {
                    const distance = Math.sqrt(distanceSq);
                    const otherDominance = otherState.age * (STAGE_MULTIPLIER[otherState.stage] || 1);

                    // If the other plant is more dominant, this plant gets penalized
                    if (otherDominance > myDominance) {
                        // Penalty is proportional to how much more dominant the other plant is
                        // and how much the zones overlap
                        const overlap = 1 - (distance / radiusSum);
                        const dominanceRatio = Math.min(2, otherDominance / Math.max(0.1, myDominance));
                        competitionPenalty += overlap * 0.4 * dominanceRatio;
                    }
                }
            }

            // Cap penalty at 80%
            competitionPenalty = Math.min(0.8, competitionPenalty);
            state.waterCompetitionPenalty = competitionPenalty;

            // How much water does this plant want per game-hour?
            // Bigger plants need more water.
            const waterNeedPerHour = state.stage === "flowering" ? 5 : state.stage === "vegetative" ? 3 : 1;
            const waterWanted = waterNeedPerHour * gameHoursDelta;

            // Apply competition penalty to water absorption
            const effectiveWaterWanted = waterWanted * (1 - competitionPenalty);

            // Try to absorb water from soil
            const absorbed = this.soilSystem.absorbWater(
                transform.x,
                transform.z,
                rootRadius,
                effectiveWaterWanted
            );

            // Refill internal water buffer
            needs.water = Math.min(100, needs.water + absorbed);
            needs.lastAbsorption = absorbed; // Store for visualization


            // Natural water usage/transpiration (modified by sunlight - less transpiration in shade)
            const transpirationMultiplier = this.SHADE_GROWTH_MULTIPLIER + (1 - this.SHADE_GROWTH_MULTIPLIER) * sunIntensity;
            const transpiration = gameHoursDelta * 1.5 * transpirationMultiplier; // Lose 1.5% per game-hour at full sun
            needs.water = Math.max(0, needs.water - transpiration);

            // Death logic - only kill if not in sprout stage and critically dehydrated
            if (needs.water < 5 && state.stage !== "sprout") {
                // Convert to dead plant instead of just setting health = 0
                this.convertToDeadPlant(entity, state);
            }
        }
    }

    /**
     * Convert a living plant entity into a dead plant entity
     */
    private convertToDeadPlant(entity: Entity, state: PlantState): void {
        // Remove living plant components
        entity.removeComponent(PlantState);
        entity.removeComponent(Needs);

        // Add dead plant component
        const deadPlantState = new DeadPlantState(state.stage);
        entity.addComponent(deadPlantState);

        // Clean up cache and spatial hash
        this.removeFromCache(entity.id);
        this.spatialHash.remove(entity.id);

        console.log(`Plant ${entity.id} died and is now decomposing`);
    }
}

