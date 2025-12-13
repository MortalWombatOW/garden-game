
export type ToolType = "plant" | "inspect" | "water" | "build" | "compost" | "harvest" | null;
export type BuildingType = "lightpost" | "hose" | null;

export class ToolManager {
    private currentTool: ToolType = "plant";
    private activeBuildingType: BuildingType = "lightpost";
    private listeners: ((tool: ToolType) => void)[] = [];

    constructor() {
        this.setupToolbar();
        this.setupBuildingMenu();
        this.setupKeyboard();
    }

    private setupToolbar(): void {
        const buttons = document.querySelectorAll<HTMLButtonElement>(".tool-btn");
        buttons.forEach(btn => {
            btn.addEventListener("click", () => {
                const tool = btn.dataset.tool as ToolType;
                this.setTool(tool);
            });
        });
    }

    private setupBuildingMenu(): void {
        const buttons = document.querySelectorAll<HTMLButtonElement>(".building-btn");
        buttons.forEach(btn => {
            btn.addEventListener("click", () => {
                this.activeBuildingType = btn.dataset.building as BuildingType;
                this.updateUI();
                // Ensure we are in build mode
                if (this.currentTool !== "build") {
                    this.setTool("build");
                }
            });
        });
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
        this.updateUI();
        this.notifyListeners();
    }

    public getTool(): ToolType {
        return this.currentTool;
    }

    public getActiveBuilding(): BuildingType {
        return this.activeBuildingType;
    }

    public onToolChange(callback: (tool: ToolType) => void): void {
        this.listeners.push(callback);
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener(this.currentTool);
        }
    }

    private updateUI(): void {
        const buttons = document.querySelectorAll<HTMLButtonElement>(".tool-btn");
        buttons.forEach(btn => {
            const tool = btn.dataset.tool as ToolType;
            if (tool === this.currentTool) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // Update Building Menu visibility
        const buildingMenu = document.getElementById("building-menu");
        if (this.currentTool === "build") {
            buildingMenu?.classList.remove("hidden");
        } else {
            buildingMenu?.classList.add("hidden");
        }

        // Update Building Buttons
        const buildingButtons = document.querySelectorAll<HTMLButtonElement>(".building-btn");
        buildingButtons.forEach(btn => {
            const type = btn.dataset.building as BuildingType;
            if (type === this.activeBuildingType) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }
}
