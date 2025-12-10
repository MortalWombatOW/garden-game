
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
    public health: number = 100;
    public speciesID: string = "generic_plant";
    public stage: PlantStage = "sprout";

    // Track if stage changed this tick (for mesh swap)
    public stageChanged: boolean = false;
    private previousStage: PlantStage = "sprout";

    /**
     * Update stage based on age and return true if stage changed
     */
    public updateStage(): void {
        this.previousStage = this.stage;

        if (this.age >= STAGE_THRESHOLDS.flowering) {
            this.stage = "flowering";
        } else if (this.age >= STAGE_THRESHOLDS.vegetative) {
            this.stage = "vegetative";
        } else {
            this.stage = "sprout";
        }

        this.stageChanged = this.stage !== this.previousStage;
    }
}
