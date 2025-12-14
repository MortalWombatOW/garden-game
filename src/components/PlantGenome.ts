
import { Component } from "../core/ECS";
import * as BABYLON from "@babylonjs/core";

export class PlantGenome extends Component {
    public axiom: string;
    public rules: Map<string, string>;
    public angle: number; // in degrees
    public thickness: number;
    public length: number;
    public color: BABYLON.Color3;
    public maxIterations: number;

    constructor(
        axiom: string = "X",
        rules: Map<string, string> = new Map([
            ["X", "F+[[X]-X]-F[-FX]+X"],
            ["F", "FF"]
        ]),
        angle: number = 25,
        thickness: number = 0.1,
        length: number = 0.2,
        color: BABYLON.Color3 = new BABYLON.Color3(0.2, 0.6, 0.2),
        maxIterations: number = 5
    ) {
        super();
        this.axiom = axiom;
        this.rules = rules;
        this.angle = angle;
        this.thickness = thickness;
        this.length = length;
        this.color = color;
        this.maxIterations = maxIterations;
    }
}
