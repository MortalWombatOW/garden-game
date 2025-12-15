
import { Component } from "../core/ECS";

export class Needs extends Component {
    public water: number = 50;
    public sunlight: number = 50;
    public nitrogen: number = 50;

    // Last tick's water absorption amount (for visualization)
    public lastAbsorption: number = 0;
    public lastNitrogenAbsorption: number = 0;

    // Thresholds could be implicitly defined by the species ID in PlantState, 
    // but storing current status here is good.
}
