import { System, SystemType, World, EntityID } from "../core/ECS";
import { ToolManager, ToolType, BuildingType } from "../ui/ToolManager";
import { Engine } from "../core/Engine";
import { TimeSystem } from "./TimeSystem";
import { PlayerState } from "../components/PlayerState";
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";

// Forward declaration types for overlay systems
type RenderSystemType = { setOverlayEnabled: (enabled: boolean) => void; setWaterOverlay: (enabled: boolean) => void };
type SoilSystemType = { setWaterOverlay: (enabled: boolean) => void };
type WaterGraphSystemType = { setVisible: (visible: boolean) => void };

interface ToolConfig {
    type: ToolType;
    label: string;
    icon: string;
}

const TOOLS: ToolConfig[] = [
    { type: "plant", label: "Plant", icon: "🌱" },
    { type: "inspect", label: "Inspect", icon: "🔍" },
    { type: "water", label: "Water", icon: "💧" },
    { type: "build", label: "Build", icon: "🔨" },
    { type: "compost", label: "Compost", icon: "🧪" },
    { type: "harvest", label: "Harvest", icon: "🌾" },
];

interface BuildingConfig {
    type: BuildingType;
    label: string;
    icon: string;
}

const BUILDINGS: BuildingConfig[] = [
    { type: "lightpost", label: "Light", icon: "💡" },
    { type: "hose", label: "Hose", icon: "🚿" },
];

export class DiegeticUISystem extends System {
    private manager: GUI.GUI3DManager;

    // Toolbar
    private toolbarPanel: GUI.StackPanel3D;
    private toolbarAnchor: BABYLON.TransformNode;
    private toolButtons: Map<ToolType, GUI.MeshButton3D> = new Map();
    private buttonADTs: Map<ToolType, GUI.AdvancedDynamicTexture> = new Map();
    private buttonBackgrounds: Map<ToolType, GUI.Rectangle> = new Map();

    // Status HUD
    private statusAnchor: BABYLON.TransformNode;
    private statusPlane: BABYLON.Mesh;
    private statusADT: GUI.AdvancedDynamicTexture;
    private clockText: GUI.TextBlock;
    private seedText: GUI.TextBlock;

    // 3D Inspect Tooltip
    private tooltipPlane: BABYLON.Mesh;
    private tooltipADT: GUI.AdvancedDynamicTexture;
    private tooltipBackground: GUI.Rectangle;
    private tooltipContent: GUI.StackPanel;

    // Build Submenu
    private buildSubmenuAnchor: BABYLON.TransformNode;
    private buildSubmenuPanel: GUI.StackPanel3D;
    private buildingButtons: Map<BuildingType, GUI.MeshButton3D> = new Map();
    private buildingButtonADTs: Map<BuildingType, GUI.AdvancedDynamicTexture> = new Map();
    private buildingButtonBackgrounds: Map<BuildingType, GUI.Rectangle> = new Map();

    // Dependencies
    private toolManager: ToolManager;
    private scene: BABYLON.Scene;
    private timeSystem: TimeSystem | null = null;
    private playerEntityId: EntityID;

    // Overlay Systems (set via setter)
    private renderSystem: RenderSystemType | null = null;
    private soilSystem: SoilSystemType | null = null;
    private waterGraphSystem: WaterGraphSystemType | null = null;

    // Overlay Toggle Panel
    private overlayAnchor: BABYLON.TransformNode;
    private overlayPanel: GUI.StackPanel3D;
    private plantOverlayEnabled: boolean = false;
    private waterOverlayEnabled: boolean = false;
    private plantOverlayBackground: GUI.Rectangle | null = null;
    private waterOverlayBackground: GUI.Rectangle | null = null;

    constructor(world: World, toolManager: ToolManager, playerEntityId: EntityID) {
        super(world, SystemType.RENDER);

        this.toolManager = toolManager;
        this.playerEntityId = playerEntityId;
        const gameEngine = Engine.getInstance();
        this.scene = gameEngine.getScene();

        // Create Manager
        this.manager = new GUI.GUI3DManager(this.scene);

        // === TOOLBAR ===
        this.toolbarAnchor = new BABYLON.TransformNode("toolbar_anchor", this.scene);
        this.updateToolbarAnchorPosition();

        this.toolbarPanel = new GUI.StackPanel3D();
        this.toolbarPanel.isVertical = false;
        this.toolbarPanel.margin = 0.02;
        this.manager.addControl(this.toolbarPanel);
        this.toolbarPanel.linkToTransformNode(this.toolbarAnchor);

        this.createToolButtons();

        // === STATUS HUD ===
        this.statusAnchor = new BABYLON.TransformNode("status_anchor", this.scene);
        this.updateStatusAnchorPosition();

        // Create a wide plane for the status panel
        this.statusPlane = BABYLON.MeshBuilder.CreatePlane("status_plane", {
            width: 0.6,
            height: 0.15
        }, this.scene);
        this.statusPlane.rotation.y = Math.PI;
        this.statusPlane.parent = this.statusAnchor;
        this.statusPlane.receiveShadows = false;

        this.statusADT = GUI.AdvancedDynamicTexture.CreateForMesh(this.statusPlane, 600, 150);

        // Background
        const statusBg = new GUI.Rectangle();
        statusBg.width = "100%";
        statusBg.height = "100%";
        statusBg.cornerRadius = 20;
        statusBg.color = "white";
        statusBg.thickness = 2;
        statusBg.background = "rgba(20, 20, 40, 0.85)";
        this.statusADT.addControl(statusBg);

        // Horizontal layout
        const statusStack = new GUI.StackPanel();
        statusStack.isVertical = false;
        statusBg.addControl(statusStack);

        // Clock section
        this.clockText = new GUI.TextBlock();
        this.clockText.text = "☀️ 12:00";
        this.clockText.fontSize = 50;
        this.clockText.color = "white";
        this.clockText.width = "200px";
        this.clockText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        statusStack.addControl(this.clockText);

        // Divider
        const divider1 = new GUI.Rectangle();
        divider1.width = "2px";
        divider1.height = "80%";
        divider1.background = "rgba(255,255,255,0.3)";
        divider1.thickness = 0;
        statusStack.addControl(divider1);

        // Seed section
        this.seedText = new GUI.TextBlock();
        this.seedText.text = "🌱 x5";
        this.seedText.fontSize = 50;
        this.seedText.color = "white";
        this.seedText.width = "150px";
        this.seedText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        statusStack.addControl(this.seedText);

        // Divider
        const divider2 = new GUI.Rectangle();
        divider2.width = "2px";
        divider2.height = "80%";
        divider2.background = "rgba(255,255,255,0.3)";
        divider2.thickness = 0;
        statusStack.addControl(divider2);

        // Day indicator
        const dayText = new GUI.TextBlock();
        dayText.text = "Day 1"; // Will be updated dynamically
        dayText.fontSize = 40;
        dayText.color = "#aaaaff";
        dayText.width = "150px";
        dayText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        statusStack.addControl(dayText);

        // Store day text for updates
        (this as any)._dayText = dayText;

        // === INSPECT TOOLTIP ===
        this.tooltipPlane = BABYLON.MeshBuilder.CreatePlane("inspect_tooltip", {
            width: 5.6,   // 0.8 * 7
            height: 3.5,  // 0.5 * 7
            sideOrientation: BABYLON.Mesh.DOUBLESIDE // Ensure visible from both sides
        }, this.scene);
        this.tooltipPlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        this.tooltipPlane.isPickable = false;
        this.tooltipPlane.renderingGroupId = 1; // Render on top of world (default 0)
        this.tooltipPlane.setEnabled(false); // Hidden by default

        this.tooltipADT = GUI.AdvancedDynamicTexture.CreateForMesh(this.tooltipPlane, 400, 250);

        this.tooltipBackground = new GUI.Rectangle();
        this.tooltipBackground.width = "100%";
        this.tooltipBackground.height = "100%";
        this.tooltipBackground.cornerRadius = 15;
        this.tooltipBackground.color = "white";
        this.tooltipBackground.thickness = 2;
        this.tooltipBackground.background = "rgba(20, 20, 40, 0.92)";
        this.tooltipADT.addControl(this.tooltipBackground);

        this.tooltipContent = new GUI.StackPanel();
        this.tooltipContent.paddingTop = "10px";
        this.tooltipContent.paddingBottom = "10px";
        this.tooltipContent.paddingLeft = "15px";
        this.tooltipContent.paddingRight = "15px";
        this.tooltipBackground.addControl(this.tooltipContent);

        // === BUILD SUBMENU ===
        this.buildSubmenuAnchor = new BABYLON.TransformNode("build_submenu_anchor", this.scene);

        this.buildSubmenuPanel = new GUI.StackPanel3D();
        this.buildSubmenuPanel.isVertical = false;
        this.buildSubmenuPanel.margin = 0.015;
        this.manager.addControl(this.buildSubmenuPanel);
        this.buildSubmenuPanel.linkToTransformNode(this.buildSubmenuAnchor);

        this.createBuildingButtons();
        this.hideBuildSubmenu(); // Start hidden

        // === OVERLAY TOGGLE PANEL ===
        this.overlayAnchor = new BABYLON.TransformNode("overlay_anchor", this.scene);
        this.updateOverlayAnchorPosition();

        this.overlayPanel = new GUI.StackPanel3D();
        this.overlayPanel.isVertical = true;
        this.overlayPanel.margin = 0.01;
        this.manager.addControl(this.overlayPanel);
        this.overlayPanel.linkToTransformNode(this.overlayAnchor);

        this.createOverlayButtons();

        // === LISTENERS ===
        this.toolManager.onToolChange((tool: ToolType) => {
            this.updateButtonStates(tool);
            // Hide tooltip when switching away from inspect
            if (tool !== "inspect") {
                this.hideInspectTooltip();
            }
            // Show/hide build submenu
            if (tool === "build") {
                this.showBuildSubmenu();
            } else {
                this.hideBuildSubmenu();
            }
        });

        this.scene.onAfterRenderObservable.addOnce(() => {
            this.updateButtonStates(this.toolManager.getTool());
        });
    }

    /**
     * Set overlay systems for toggle functionality.
     */
    public setOverlaySystems(
        renderSystem: RenderSystemType,
        soilSystem: SoilSystemType,
        waterGraphSystem: WaterGraphSystemType
    ): void {
        this.renderSystem = renderSystem;
        this.soilSystem = soilSystem;
        this.waterGraphSystem = waterGraphSystem;
    }

    private updateToolbarAnchorPosition(): void {
        const camera = this.scene.activeCamera;
        if (!camera) return;

        const cameraPosition = camera.position.clone();
        const forward = camera.getDirection(BABYLON.Axis.Z).normalize();
        const up = camera.getDirection(BABYLON.Axis.Y).normalize();

        // Position: 2.5 units in front, slightly down in camera space
        const uiPosition = cameraPosition.add(forward.scale(2.2));
        uiPosition.addInPlace(up.scale(-0.57)); // Move down relative to camera view

        this.toolbarAnchor.position = uiPosition;
        this.toolbarAnchor.lookAt(cameraPosition);
    }

    private updateStatusAnchorPosition(): void {
        const camera = this.scene.activeCamera;
        if (!camera) return;

        const cameraPosition = camera.position.clone();
        const forward = camera.getDirection(BABYLON.Axis.Z).normalize();
        const right = camera.getDirection(BABYLON.Axis.X).normalize();
        const up = camera.getDirection(BABYLON.Axis.Y).normalize();

        // Position: upper-left of camera view
        const uiPosition = cameraPosition.add(forward.scale(2.2));
        uiPosition.addInPlace(right.scale(-1.1)); // Move left
        uiPosition.addInPlace(up.scale(0.78)); // Move up

        this.statusAnchor.position = uiPosition;

        // Keep panel level (horizontal text) by only rotating around Y-axis
        // Calculate angle to camera on XZ plane
        const dirToCamera = cameraPosition.subtract(uiPosition);
        const angleY = Math.atan2(dirToCamera.x, dirToCamera.z);
        this.statusAnchor.rotation = new BABYLON.Vector3(0, angleY, 0);
    }

    private updateOverlayAnchorPosition(): void {
        const camera = this.scene.activeCamera;
        if (!camera) return;

        const cameraPosition = camera.position.clone();
        const forward = camera.getDirection(BABYLON.Axis.Z).normalize();
        const right = camera.getDirection(BABYLON.Axis.X).normalize();
        const up = camera.getDirection(BABYLON.Axis.Y).normalize();

        // Position: upper-right of camera view
        const uiPosition = cameraPosition.add(forward.scale(2.2));
        uiPosition.addInPlace(right.scale(1.1)); // Move right
        uiPosition.addInPlace(up.scale(0.65)); // Move up

        this.overlayAnchor.position = uiPosition;
        this.overlayAnchor.lookAt(cameraPosition);
    }

    private createOverlayButtons(): void {
        // Plant Needs Overlay Toggle
        const plantPlane = BABYLON.MeshBuilder.CreatePlane("overlay_plant", {
            width: 0.18,
            height: 0.18
        }, this.scene);
        plantPlane.rotation.y = Math.PI;

        const plantADT = GUI.AdvancedDynamicTexture.CreateForMesh(plantPlane, 512, 512);

        const plantBg = new GUI.Rectangle();
        plantBg.width = "100%";
        plantBg.height = "100%";
        plantBg.cornerRadius = 25;
        plantBg.color = "white";
        plantBg.thickness = 3;
        plantBg.background = "rgba(50, 80, 50, 0.85)";
        plantADT.addControl(plantBg);
        this.plantOverlayBackground = plantBg;

        const plantStack = new GUI.StackPanel();
        plantBg.addControl(plantStack);

        const plantIcon = new GUI.TextBlock();
        plantIcon.text = "🌿";
        plantIcon.fontSize = 160;
        plantIcon.height = "250px";
        plantStack.addControl(plantIcon);

        const plantLabel = new GUI.TextBlock();
        plantLabel.text = "Needs";
        plantLabel.fontSize = 45;
        plantLabel.color = "white";
        plantLabel.height = "70px";
        plantStack.addControl(plantLabel);

        const plantBtn = new GUI.MeshButton3D(plantPlane, "btn_overlay_plant");
        this.overlayPanel.addControl(plantBtn);
        plantPlane.receiveShadows = false;

        plantBtn.onPointerClickObservable.add(() => {
            this.togglePlantOverlay();
        });

        // Water Overlay Toggle
        const waterPlane = BABYLON.MeshBuilder.CreatePlane("overlay_water", {
            width: 0.18,
            height: 0.18
        }, this.scene);
        waterPlane.rotation.y = Math.PI;

        const waterADT = GUI.AdvancedDynamicTexture.CreateForMesh(waterPlane, 512, 512);

        const waterBg = new GUI.Rectangle();
        waterBg.width = "100%";
        waterBg.height = "100%";
        waterBg.cornerRadius = 25;
        waterBg.color = "white";
        waterBg.thickness = 3;
        waterBg.background = "rgba(40, 60, 100, 0.85)";
        waterADT.addControl(waterBg);
        this.waterOverlayBackground = waterBg;

        const waterStack = new GUI.StackPanel();
        waterBg.addControl(waterStack);

        const waterIcon = new GUI.TextBlock();
        waterIcon.text = "💧";
        waterIcon.fontSize = 160;
        waterIcon.height = "250px";
        waterStack.addControl(waterIcon);

        const waterLabel = new GUI.TextBlock();
        waterLabel.text = "Water";
        waterLabel.fontSize = 45;
        waterLabel.color = "white";
        waterLabel.height = "70px";
        waterStack.addControl(waterLabel);

        const waterBtn = new GUI.MeshButton3D(waterPlane, "btn_overlay_water");
        this.overlayPanel.addControl(waterBtn);
        waterPlane.receiveShadows = false;

        waterBtn.onPointerClickObservable.add(() => {
            this.toggleWaterOverlay();
        });
    }

    private togglePlantOverlay(): void {
        this.plantOverlayEnabled = !this.plantOverlayEnabled;

        if (this.renderSystem) {
            this.renderSystem.setOverlayEnabled(this.plantOverlayEnabled);
        }

        // Update button appearance
        if (this.plantOverlayBackground) {
            this.plantOverlayBackground.background = this.plantOverlayEnabled
                ? "rgba(80, 180, 80, 0.95)"
                : "rgba(50, 80, 50, 0.85)";
        }
    }

    private toggleWaterOverlay(): void {
        this.waterOverlayEnabled = !this.waterOverlayEnabled;

        if (this.renderSystem) {
            this.renderSystem.setWaterOverlay(this.waterOverlayEnabled);
        }
        if (this.soilSystem) {
            this.soilSystem.setWaterOverlay(this.waterOverlayEnabled);
        }
        if (this.waterGraphSystem) {
            this.waterGraphSystem.setVisible(this.waterOverlayEnabled);
        }

        // Update button appearance
        if (this.waterOverlayBackground) {
            this.waterOverlayBackground.background = this.waterOverlayEnabled
                ? "rgba(60, 140, 220, 0.95)"
                : "rgba(40, 60, 100, 0.85)";
        }
    }

    private createToolButtons(): void {
        for (const toolConfig of TOOLS) {
            const plane = BABYLON.MeshBuilder.CreatePlane(`mesh_${toolConfig.type}`, {
                width: 0.25,
                height: 0.25
            }, this.scene);
            plane.rotation.y = Math.PI;

            const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 512, 512);
            this.buttonADTs.set(toolConfig.type, adt);

            const background = new GUI.Rectangle();
            background.width = "100%";
            background.height = "100%";
            background.cornerRadius = 40;
            background.color = "white";
            background.thickness = 4;
            background.background = "rgba(40, 40, 60, 0.8)";
            adt.addControl(background);
            this.buttonBackgrounds.set(toolConfig.type, background);

            const stack = new GUI.StackPanel();
            background.addControl(stack);

            const icon = new GUI.TextBlock();
            icon.text = toolConfig.icon;
            icon.fontSize = 200;
            icon.height = "300px";
            stack.addControl(icon);

            const label = new GUI.TextBlock();
            label.text = toolConfig.label;
            label.fontSize = 60;
            label.color = "white";
            label.height = "100px";
            stack.addControl(label);

            const button3D = new GUI.MeshButton3D(plane, `btn3d_${toolConfig.type}`);
            this.toolbarPanel.addControl(button3D);
            this.toolButtons.set(toolConfig.type, button3D);

            button3D.onPointerClickObservable.add(() => {
                this.toolManager.setTool(toolConfig.type);
            });

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
                    bg.background = "rgba(40, 180, 80, 0.9)";
                    bg.color = "#aaffaa";
                    btn3D.scaling = new BABYLON.Vector3(1.2, 1.2, 1.2);
                    btn3D.position.z = 0.1;
                } else {
                    bg.background = "rgba(40, 40, 80, 0.8)";
                    bg.color = "white";
                    btn3D.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
                    btn3D.position.z = 0;
                }
            }
        }
    }

    private createBuildingButtons(): void {
        for (const buildingConfig of BUILDINGS) {
            const plane = BABYLON.MeshBuilder.CreatePlane(`mesh_building_${buildingConfig.type}`, {
                width: 0.2,
                height: 0.2
            }, this.scene);
            plane.rotation.y = Math.PI;

            const adt = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 512, 512);
            this.buildingButtonADTs.set(buildingConfig.type, adt);

            const background = new GUI.Rectangle();
            background.width = "100%";
            background.height = "100%";
            background.cornerRadius = 30;
            background.color = "white";
            background.thickness = 3;
            background.background = "rgba(60, 60, 100, 0.85)";
            adt.addControl(background);
            this.buildingButtonBackgrounds.set(buildingConfig.type, background);

            const stack = new GUI.StackPanel();
            background.addControl(stack);

            const icon = new GUI.TextBlock();
            icon.text = buildingConfig.icon;
            icon.fontSize = 180;
            icon.height = "280px";
            stack.addControl(icon);

            const label = new GUI.TextBlock();
            label.text = buildingConfig.label;
            label.fontSize = 50;
            label.color = "white";
            label.height = "80px";
            stack.addControl(label);

            const button3D = new GUI.MeshButton3D(plane, `btn3d_building_${buildingConfig.type}`);
            this.buildSubmenuPanel.addControl(button3D);
            this.buildingButtons.set(buildingConfig.type, button3D);

            button3D.onPointerClickObservable.add(() => {
                this.toolManager.setActiveBuilding(buildingConfig.type);
                this.updateBuildingButtonStates();
            });

            plane.receiveShadows = false;
        }
    }

    private updateBuildingButtonStates(): void {
        const activeBuilding = this.toolManager.getActiveBuilding();

        for (const buildingConfig of BUILDINGS) {
            const type = buildingConfig.type;
            const isActive = type === activeBuilding;

            const bg = this.buildingButtonBackgrounds.get(type);
            const btn3D = this.buildingButtons.get(type);

            if (bg && btn3D) {
                if (isActive) {
                    bg.background = "rgba(80, 160, 220, 0.9)";
                    bg.color = "#aaddff";
                    btn3D.scaling = new BABYLON.Vector3(1.15, 1.15, 1.15);
                } else {
                    bg.background = "rgba(60, 60, 100, 0.85)";
                    bg.color = "white";
                    btn3D.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
                }
            }
        }
    }

    private updateBuildSubmenuPosition(): void {
        const camera = this.scene.activeCamera;
        if (!camera) return;

        const cameraPosition = camera.position.clone();
        const forward = camera.getDirection(BABYLON.Axis.Z).normalize();
        const up = camera.getDirection(BABYLON.Axis.Y).normalize();

        // Position above the toolbar
        const uiPosition = cameraPosition.add(forward.scale(2.2));
        uiPosition.addInPlace(up.scale(-0.30)); // Above toolbar (toolbar is at -0.57)

        this.buildSubmenuAnchor.position = uiPosition;
        this.buildSubmenuAnchor.lookAt(cameraPosition);
    }

    private showBuildSubmenu(): void {
        this.updateBuildSubmenuPosition();
        this.updateBuildingButtonStates();
        // Show each building button mesh
        for (const btn of this.buildingButtons.values()) {
            if (btn.mesh) {
                btn.mesh.setEnabled(true);
            }
        }
    }

    private hideBuildSubmenu(): void {
        // Hide each building button mesh
        for (const btn of this.buildingButtons.values()) {
            if (btn.mesh) {
                btn.mesh.setEnabled(false);
            }
        }
    }

    private updateStatusHUD(): void {
        // Lazily resolve TimeSystem
        if (!this.timeSystem) {
            this.timeSystem = this.world.getSystem(TimeSystem) as TimeSystem | null;
        }

        // Update Clock
        if (this.timeSystem) {
            const icon = this.timeSystem.getSunIcon();
            const time = this.timeSystem.getFormattedTime();
            this.clockText.text = `${icon} ${time}`;

            // Update Day
            const dayText = (this as any)._dayText as GUI.TextBlock | undefined;
            if (dayText) {
                dayText.text = `Day ${this.timeSystem.getCurrentDay() + 1}`;
            }
        }

        // Update Seeds
        const playerEntity = this.world.getEntity(this.playerEntityId);
        if (playerEntity) {
            const playerState = playerEntity.getComponent(PlayerState);
            if (playerState) {
                this.seedText.text = `🌱 x${playerState.seeds}`;
            }
        }
    }

    public update(_deltaTime: number): void {
        this.updateToolbarAnchorPosition();
        this.updateStatusAnchorPosition();
        this.updateOverlayAnchorPosition();
        this.updateStatusHUD();

        // Update build submenu position if Build tool is active
        if (this.toolManager.getTool() === "build") {
            this.updateBuildSubmenuPosition();
        }
    }

    /**
     * Show 3D inspect tooltip at a world position with the given content lines.
     * @param worldPos Position in world space to show tooltip near
     * @param title Title line (e.g. "🌿 Plant #5")
     * @param rows Array of [label, value] pairs
     */
    public showInspectTooltip(
        worldPos: BABYLON.Vector3,
        title: string,
        rows: Array<{ label: string; value: string; color?: string }>
    ): void {
        // Clear previous content
        this.tooltipContent.children.slice().forEach(c => this.tooltipContent.removeControl(c));

        // Title
        const titleBlock = new GUI.TextBlock();
        titleBlock.text = title;
        titleBlock.fontSize = 28;
        titleBlock.color = "white";
        titleBlock.fontWeight = "bold";
        titleBlock.height = "40px";
        titleBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.tooltipContent.addControl(titleBlock);

        // Divider
        const divider = new GUI.Rectangle();
        divider.width = "100%";
        divider.height = "2px";
        divider.background = "rgba(255, 255, 255, 0.3)";
        divider.thickness = 0;
        this.tooltipContent.addControl(divider);

        // Data rows
        for (const row of rows) {
            const rowPanel = new GUI.StackPanel();
            rowPanel.isVertical = false;
            rowPanel.height = "28px";
            rowPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;

            const labelBlock = new GUI.TextBlock();
            labelBlock.text = row.label;
            labelBlock.fontSize = 20;
            labelBlock.color = "#aaaaaa";
            labelBlock.width = "140px";
            labelBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            rowPanel.addControl(labelBlock);

            const valueBlock = new GUI.TextBlock();
            valueBlock.text = row.value;
            valueBlock.fontSize = 20;
            valueBlock.color = row.color || "white";
            valueBlock.width = "200px";
            valueBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            rowPanel.addControl(valueBlock);

            this.tooltipContent.addControl(rowPanel);
        }

        // Resize plane based on content
        const rowCount = rows.length + 2; // title + divider + rows
        const height = Math.max(2.45, 0.56 * rowCount); // 7x scale: 0.35 → 2.45, 0.08 → 0.56
        this.tooltipPlane.scaling.y = height / 3.5; // Adjust from base 3.5 height

        // Position tooltip near the object but offset up and to the side
        this.tooltipPlane.position = worldPos.add(new BABYLON.Vector3(0.5, 1.5, 0));
        this.tooltipPlane.setEnabled(true);
    }

    /**
     * Hide the 3D inspect tooltip.
     */
    public hideInspectTooltip(): void {
        this.tooltipPlane.setEnabled(false);
    }

    public dispose(): void {
        this.manager.dispose();
        this.toolbarAnchor.dispose();
        this.statusAnchor.dispose();
        this.statusPlane.dispose();
        this.statusADT.dispose();
        this.tooltipPlane.dispose();
        this.tooltipADT.dispose();
        for (const adt of this.buttonADTs.values()) {
            adt.dispose();
        }
    }
}
