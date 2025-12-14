
import { Component } from "../core/ECS";

export type PlantStage = "seed" | "sprout" | "vegetative" | "flowering";

// Stage thresholds removed in favor of PlantGenome.maxIterations logic

export class PlantState extends Component {
    public isDirty: boolean = true;
    public age: number = 0;
    public sunlitAge: number = 0;
    public health: number = 100;
    public speciesID: string = "generic_plant";

    // Continuous growth tracking
    // 0 = Seed, 1 = Iteration 1 complete, 2.5 = Halfway through Iteration 3, etc.
    public growthProgress: number = 0;

    // Derived integer iteration for L-System steps
    public currentIteration: number = 0;

    // Water competition penalty (0 = no penalty, 1 = full penalty/80% reduction)
    public waterCompetitionPenalty: number = 0;

    // Coma state
    public inComa: boolean = false;
    public comaTimeRemaining: number = 24;

    // Changes tracking
    public stageChanged: boolean = false;
    private previousIteration: number = 0;

    // Diegetic feedback
    public stressLevel: number = 0;
    public currentDroop: number = 0;
    public targetDroop: number = 0;
    public currentDesaturation: number = 0;
    public targetDesaturation: number = 0;

    /**
     * Backward compatibility getter for system logic relying on "stages".
     * Mapped roughly to iterations.
     */
    public get stage(): PlantStage {
        if (this.growthProgress < 1) return "sprout";
        if (this.growthProgress < 3) return "vegetative";
        return "flowering"; // 3+ iterations
    }

    /**
     * Update iteration based on growth progress
     */
    public updateGrowth(): void {
        this.previousIteration = this.currentIteration;
        this.currentIteration = Math.floor(this.growthProgress);

        if (this.currentIteration !== this.previousIteration) {
            this.isDirty = true;
            this.stageChanged = true;
        } else {
            this.stageChanged = false;
        }
    }
}
