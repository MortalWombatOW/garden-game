
import { Component } from "../core/ECS";

export class PlantState extends Component {
    public age: number = 0;
    public health: number = 100;
    public speciesID: string = "generic_plant";
    public stage: "seed" | "sprout" | "vegetative" | "flowering" = "seed";
}
