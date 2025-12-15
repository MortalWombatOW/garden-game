import { System, SystemType, World } from "../core/ECS";
import { ToolManager, ToolType } from "../ui/ToolManager";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";

interface ToolConfig {
    type: ToolType;
    label: string;
    icon: string; // Restoring icons since we have full control now
}

const TOOLS: ToolConfig[] = [
    { type: "plant", label: "Plant", icon: "🌱" },
    { type: "inspect", label: "Inspect", icon: "🔍" },
    { type: "water", label: "Water", icon: "💧" },
    { type: "build", label: "Build", icon: "🔨" },
    { type: "compost", label: "Compost", icon: "🧪" },
    { type: "harvest", label: "Harvest", icon: "🌾" },
];

export class DiegeticUISystem extends System {
    private manager: GUI.GUI3DManager;
    private panel: GUI.StackPanel3D;
    private anchor: BABYLON.TransformNode;
    // Map of ToolType -> The MeshButton3D wrapper
    private toolButtons: Map<ToolType, GUI.MeshButton3D> = new Map();
    // Map of ToolType -> The ADT used for that button (to update colors)
    private buttonADTs: Map<ToolType, GUI.AdvancedDynamicTexture> = new Map();
    // Map of ToolType -> The background Rectangle (to update color)
    private buttonBackgrounds: Map<ToolType, GUI.Rectangle> = new Map();

    private toolManager: ToolManager;
    private scene: BABYLON.Scene;

    constructor(world: World, toolManager: ToolManager) {
        super(world, SystemType.RENDER);

        this.toolManager = toolManager;
        const gameEngine = Engine.getInstance();
        this.scene = gameEngine.getScene();

        // 1. Create Manager
        this.manager = new GUI.GUI3DManager(this.scene);

        // 2. Create Anchor
        this.anchor = new BABYLON.TransformNode("ui_anchor", this.scene);
        this.updateAnchorPosition();

        // 3. Create Panel
        this.panel = new GUI.StackPanel3D();
        this.panel.isVertical = false;
        this.panel.margin = 0.02; // Small gap
        this.manager.addControl(this.panel);
        this.panel.linkToTransformNode(this.anchor);

        // 4. Create Buttons
        this.createToolButtons();

        // 5. Setup Listeners
        this.toolManager.onToolChange((tool: ToolType) => {
            this.updateButtonStates(tool);
        });

        // Initial update
        this.scene.onAfterRenderObservable.addOnce(() => {
            this.updateButtonStates(this.toolManager.getTool());
        });
    }

    private updateAnchorPosition(): void {
        const camera = this.scene.activeCamera;
        if (!camera) return;

        const cameraPosition = camera.position.clone();
        const cameraTarget = (camera as BABYLON.ArcRotateCamera).target ||
            cameraPosition.add(camera.getDirection(BABYLON.Axis.Z).scale(5));

        const forward = cameraTarget.subtract(cameraPosition).normalize();
        // Position: 2.5 units in front, slightly down
        const uiPosition = cameraPosition.add(forward.scale(2.5));
        uiPosition.y = Math.max(0.5, cameraPosition.y - 0.6);

        this.anchor.position = uiPosition;
        this.anchor.lookAt(cameraPosition);
    }

    private createToolButtons(): void {
        for (const toolConfig of TOOLS) {
            // A. Create the mesh for the button (a simple plane)
            // Width/Height logic: 0.5 world units wide
            const plane = BABYLON.MeshBuilder.CreatePlane(`mesh_${toolConfig.type}`, {
                width: 0.5,
                height: 0.5
            }, this.scene);

            // Text was appearing flipped, so rotate the plane to face the correct way
            plane.rotation.y = Math.PI;

            // Important: Utility Layer management
            // GUI3DManager normally puts things in utility layer, but since we are creating 
            // the mesh ourselves in the main scene, we probably want it there.
            // However, MeshButton3D expects to manage it.

            // B. Create ADT for the mesh
            // Higher resolution for crisp text (512x512)
            const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 512, 512);
            this.buttonADTs.set(toolConfig.type, adt);

            // C. Create GUI Content
            const background = new GUI.Rectangle();
            background.width = "100%";
            background.height = "100%";
            background.cornerRadius = 40;
            background.color = "white"; // Border color
            background.thickness = 4;
            background.background = "rgba(40, 40, 60, 0.8)"; // Default dark blue
            adt.addControl(background);
            this.buttonBackgrounds.set(toolConfig.type, background);

            const stack = new GUI.StackPanel();
            background.addControl(stack);

            const icon = new GUI.TextBlock();
            icon.text = toolConfig.icon;
            icon.fontSize = 200; // Big emoji
            icon.height = "300px";
            stack.addControl(icon);

            const label = new GUI.TextBlock();
            label.text = toolConfig.label;
            label.fontSize = 60;
            label.color = "white";
            label.height = "100px";
            stack.addControl(label);

            // D. Wrap in MeshButton3D
            const button3D = new GUI.MeshButton3D(plane, `btn3d_${toolConfig.type}`);
            this.panel.addControl(button3D);
            this.toolButtons.set(toolConfig.type, button3D);

            // E. Interaction
            button3D.onPointerClickObservable.add(() => {
                this.toolManager.setTool(toolConfig.type);
            });

            // F. Cleanup/Shadows
            plane.receiveShadows = false;
        }
    }

    private updateButtonStates(activeTool: ToolType): void {
        for (const toolConfig of TOOLS) {
            const type = toolConfig.type;
            const isActive = type === activeTool;

            const bg = this.buttonBackgrounds.get(type);
            const btn3D = this.toolButtons.get(type);

            if (bg && btn3D) {
                if (isActive) {
                    // Active: Greenish background
                    bg.background = "rgba(40, 180, 80, 0.9)";
                    bg.color = "#aaffaa"; // Brighter border
                    // Scale up slightly (handled by TransformNode of Button3D)
                    btn3D.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);
                    // Move forward (towards camera)
                    btn3D.position.z = 0.2;
                } else {
                    // Inactive: Dark Blue background
                    bg.background = "rgba(40, 40, 80, 0.8)";
                    bg.color = "white";
                    btn3D.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
                    btn3D.position.z = 0;
                }
            }
        }
    }

    public update(_deltaTime: number): void {
        this.updateAnchorPosition();
    }

    public dispose(): void {
        this.manager.dispose();
        this.anchor.dispose();
        // Dispose ADTs manually since we created them
        for (const adt of this.buttonADTs.values()) {
            adt.dispose();
        }
    }
}
