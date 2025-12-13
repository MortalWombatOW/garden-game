
import { Component } from "../core/ECS";

/**
 * Component for dead plants that are decaying and releasing nitrogen.
 */
export class DeadPlantState extends Component {
    /** Decay progress 0-100% (100 = fully decayed, entity removed) */
    public decayProgress: number = 0;

    /** Total nitrogen to release during decay */
    public nitrogenTotal: number = 50;

    /** Nitrogen already released */
    public nitrogenReleased: number = 0;

    /** Original plant stage for mesh sizing */
    public originalStage: string = "sprout";

    constructor(originalStage: string = "sprout") {
        super();
        this.originalStage = originalStage;

        // Bigger plants release more nitrogen
        switch (originalStage) {
            case "flowering":
                this.nitrogenTotal = 80;
                break;
            case "vegetative":
                this.nitrogenTotal = 50;
                break;
            default:
                this.nitrogenTotal = 20;
        }
    }
}
