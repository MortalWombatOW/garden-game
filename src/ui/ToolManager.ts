
export type ToolType = "plant" | "inspect" | "water" | null;

export class ToolManager {
    private currentTool: ToolType = "plant";
    private listeners: ((tool: ToolType) => void)[] = [];

    constructor() {
        this.setupToolbar();
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
    }
}
