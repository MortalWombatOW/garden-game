
import { Component } from "../core/ECS";
import { BuildingType } from "../ui/ToolManager";

export class BuildingState extends Component {
    public type: BuildingType = "lightpost";

    constructor(type: BuildingType = "lightpost") {
        super();
        this.type = type;
    }
}
