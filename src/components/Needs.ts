
import { Component } from "../core/ECS";

export class Needs extends Component {
    public water: number = 50;
    public sunlight: number = 50;
    public nitrogen: number = 50;

    // Thresholds could be implicitly defined by the species ID in PlantState, 
    // but storing current status here is good.
}
