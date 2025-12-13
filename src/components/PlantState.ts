
import { Component } from "../core/ECS";

export type PlantStage = "seed" | "sprout" | "vegetative" | "flowering";

// Stage thresholds in game-hours
export const STAGE_THRESHOLDS = {
    sprout: 0,        // Immediately becomes sprout when planted
    vegetative: 4,    // After 4 game-hours
    flowering: 12,    // After 12 game-hours
};

export class PlantState extends Component {
    public age: number = 0;
    public sunlitAge: number = 0;
    public health: number = 100;
    public speciesID: string = "generic_plant";
    public stage: PlantStage = "sprout";

    // Water competition penalty (0 = no penalty, 1 = full penalty/80% reduction)
    public waterCompetitionPenalty: number = 0;

    // Coma state - plant is critically dehydrated but can be revived
    public inComa: boolean = false;
    public comaTimeRemaining: number = 24; // 24 game-hours to revive (~1 in-game day)

    // Track if stage changed this tick (for mesh swap)
    public stageChanged: boolean = false;
    private previousStage: PlantStage = "sprout";

    // Diegetic feedback - stress level (0-3)
    // 0 = healthy, 1 = mild (droop), 2 = moderate (droop + desaturate), 3 = critical (+ icon)
    public stressLevel: number = 0;

    // Smooth droop animation state (0 = upright, 1 = fully drooped)
    public currentDroop: number = 0;
    public targetDroop: number = 0;

    // Smooth desaturation state (0 = full color, 1 = fully desaturated)
    public currentDesaturation: number = 0;
    public targetDesaturation: number = 0;

    /**
     * Update stage based on age and return true if stage changed
     */
    public updateStage(): void {
        this.previousStage = this.stage;

        if (this.sunlitAge >= STAGE_THRESHOLDS.flowering) {
            this.stage = "flowering";
        } else if (this.sunlitAge >= STAGE_THRESHOLDS.vegetative) {
            this.stage = "vegetative";
        } else {
            this.stage = "sprout";
        }

        this.stageChanged = this.stage !== this.previousStage;
    }
}
