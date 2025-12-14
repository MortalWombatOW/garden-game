
import { Component } from "../core/ECS";

export type PlantStage = "seed" | "sprout" | "vegetative" | "flowering";

/**
 * Current state of a growing plant.
 * Simplified - just tracks age, health, growth progress, and stress.
 */
export class PlantState extends Component {
    public age: number = 0;
    public sunlitAge: number = 0;
    public health: number = 100;
    public speciesID: string = "sunflower";

    // Growth progress: 0 = just planted, 5 = fully grown
    public growthProgress: number = 0;

    // Water competition penalty (0 = no penalty, 1 = full penalty)
    public waterCompetitionPenalty: number = 0;

    // Coma state
    public inComa: boolean = false;
    public comaTimeRemaining: number = 24;

    // Stress visualization
    public stressLevel: number = 0;
    public currentDroop: number = 0;
    public targetDroop: number = 0;
    public currentDesaturation: number = 0;
    public targetDesaturation: number = 0;

    /**
     * Get plant stage for compatibility with other systems.
     */
    public get stage(): PlantStage {
        if (this.growthProgress < 1) return "sprout";
        if (this.growthProgress < 3) return "vegetative";
        return "flowering";
    }

    // Legacy compatibility - currentIteration maps to floor of growthProgress
    public get currentIteration(): number {
        return Math.floor(this.growthProgress);
    }
}
