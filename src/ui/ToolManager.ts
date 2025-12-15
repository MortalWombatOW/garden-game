
export type ToolType = "plant" | "inspect" | "water" | "build" | "compost" | "harvest" | null;
export type BuildingType = "lightpost" | "hose" | null;

export class ToolManager {
    private currentTool: ToolType = "plant";
    private activeBuildingType: BuildingType = "lightpost";
    private listeners: ((tool: ToolType) => void)[] = [];

    constructor() {
        this.setupKeyboard();
    }

    private setupKeyboard(): void {
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.setTool(null);
            } else if (e.key === "1") {
                this.setTool("plant");
            } else if (e.key === "2") {
                this.setTool("inspect");
            } else if (e.key === "3") {
                this.setTool("water");
            } else if (e.key === "4") {
                this.setTool("build");
            } else if (e.key === "5") {
                this.setTool("compost");
            } else if (e.key === "6") {
                this.setTool("harvest");
            }
        });
    }

    public setTool(tool: ToolType): void {
        this.currentTool = tool;
        this.notifyListeners();
    }

    public getTool(): ToolType {
        return this.currentTool;
    }

    public getActiveBuilding(): BuildingType {
        return this.activeBuildingType;
    }

    public setActiveBuilding(type: BuildingType): void {
        this.activeBuildingType = type;
        // Ensure we are in build mode
        if (this.currentTool !== "build") {
            this.setTool("build");
        }
    }

    public onToolChange(callback: (tool: ToolType) => void): void {
        this.listeners.push(callback);
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener(this.currentTool);
        }
    }
}
