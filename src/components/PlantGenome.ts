
import { Component } from "../core/ECS";
import * as BABYLON from "@babylonjs/core";

export type PlantType = "sunflower";

/**
 * Simple plant definition - just type and visual properties.
 * No more L-System rules complexity.
 */
export class PlantGenome extends Component {
    public type: PlantType;
    public maxScale: number;      // Final scale when fully grown
    public stemColor: BABYLON.Color3;
    public flowerColor: BABYLON.Color3;

    constructor(
        type: PlantType = "sunflower",
        maxScale: number = 1.5,
        stemColor: BABYLON.Color3 = new BABYLON.Color3(0.2, 0.5, 0.1),
        flowerColor: BABYLON.Color3 = new BABYLON.Color3(1.0, 0.85, 0.0)
    ) {
        super();
        this.type = type;
        this.maxScale = maxScale;
        this.stemColor = stemColor;
        this.flowerColor = flowerColor;
    }
}
