
import { System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";
import { SpatialHashGrid } from "../core/SpatialHashGrid";
import { TransformComponent } from "../components/TransformComponent";
import { PlantState } from "../components/PlantState";
import { Needs } from "../components/Needs";
import { ToolManager } from "../ui/ToolManager";
import { SoilSystem } from "./SoilSystem";
import * as BABYLON from "@babylonjs/core";

export class InputSystem extends System {
    private scene: BABYLON.Scene;
    private spatialHash: SpatialHashGrid;
    private toolManager: ToolManager;
    private cursorMesh: BABYLON.Mesh;
    private cursorPosition: BABYLON.Vector3 = BABYLON.Vector3.Zero();
    private isValidPlacement: boolean = false;
    private readonly PLANT_RADIUS = 1.0;
    private tooltipEl: HTMLElement | null;
    private soilSystem: SoilSystem | null = null;

    constructor(world: World, spatialHash: SpatialHashGrid, toolManager: ToolManager) {
        super(world, SystemType.RENDER);
        this.scene = Engine.getInstance().getScene();
        this.spatialHash = spatialHash;
        this.toolManager = toolManager;
        this.tooltipEl = document.getElementById("tooltip");

        // Create cursor mesh
        this.cursorMesh = BABYLON.MeshBuilder.CreateSphere("cursor", { diameter: 1 }, this.scene);
        const cursorMaterial = new BABYLON.StandardMaterial("cursorMat", this.scene);
        cursorMaterial.diffuseColor = new BABYLON.Color3(0, 1, 0);
        cursorMaterial.alpha = 0.5;
        this.cursorMesh.material = cursorMaterial;
        this.cursorMesh.isPickable = false;

        this.setupInput();
    }

    private setupInput(): void {
        this.scene.onPointerDown = (evt, pickResult) => {
            const tool = this.toolManager.getTool();

            // Get SoilSystem reference if missing
            if (!this.soilSystem) {
                // Find SoilSystem in world systems
                // Note: We don't have a direct getSystem method in World yet, 
                // but we can find it if we iterate or just assume it's there.
                // For now, we'll try to get it from the world if possible, or pass it differently.
                // A better approach is to pass it in constructor, but let's try to query it.
                // To keep it simple, we'll cast world systems if accessible or rely on constructor update
                // ACTUALLY: Let's fix this properly by updating Main to pass SoilSystem.
                // But for now, we'll add a helper to World or just update constructor in next step.
            }

            if (tool === "plant" && evt.button === 0 && this.isValidPlacement) {
                this.plantAt(this.cursorPosition.x, this.cursorPosition.z);
            } else if (tool === "water" && evt.button === 0 && pickResult?.pickedPoint) {
                if (this.soilSystem) {
                    this.soilSystem.modifyMoistureAt(pickResult.pickedPoint.x, pickResult.pickedPoint.z, 20);
                }
            }
        };
    }

    // Need to set SoilSystem externally or via constructor
    public setSoilSystem(soilSystem: SoilSystem): void {
        this.soilSystem = soilSystem;
    }

    private plantAt(x: number, z: number): void {
        const entity = this.world.createEntity();
        entity.addComponent(new TransformComponent(x, 0.5, z));

        const plantState = new PlantState();
        plantState.stage = "sprout";
        entity.addComponent(plantState);

        const needs = new Needs();
        needs.water = 100;
        entity.addComponent(needs);

        this.spatialHash.add(entity.id, x, z);

        // Initial mesh creation handled by RenderSystem now
        // But we need to ensure immediate feedback or let RenderSystem handle it
        // The original code created a mesh here, but RenderSystem recreates it.
        // It's safer to let RenderSystem handle it to avoid duplicates.
        // However, we need to mark it dirty or just let the loop handle it.
        console.log(`Planted entity ${entity.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }

    public update(_deltaTime: number): void {
        const tool = this.toolManager.getTool();

        // Cursor logic
        if (tool === "plant") {
            // Handled in handlePlantMode
        } else {
            this.cursorMesh.isVisible = false;
        }

        // Raycast
        const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
            return mesh.name === "ground" || mesh.name.startsWith("plant_");
        });

        if (!pickResult?.hit || !pickResult.pickedPoint) {
            this.cursorMesh.isVisible = false;
            this.isValidPlacement = false;
            this.hideTooltip();
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            return;
        }

        // Handle tools
        if (tool === "plant") {
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            this.handlePlantMode(pickResult);
        } else if (tool === "water") {
            this.handleWaterMode(pickResult);
        } else if (tool === "inspect") {
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            this.handleInspectMode(pickResult);
        } else {
            this.hideTooltip();
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
        }
    }

    private handlePlantMode(pickResult: BABYLON.PickingInfo): void {
        if (!pickResult.pickedPoint) return;

        this.cursorPosition = pickResult.pickedPoint.clone();
        this.cursorMesh.position = this.cursorPosition.clone();
        this.cursorMesh.position.y = 0.5;
        this.cursorMesh.isVisible = true;

        this.isValidPlacement = !this.spatialHash.hasNearby(
            this.cursorPosition.x,
            this.cursorPosition.z,
            this.PLANT_RADIUS
        );

        const mat = this.cursorMesh.material as BABYLON.StandardMaterial;
        mat.diffuseColor = this.isValidPlacement
            ? new BABYLON.Color3(0, 1, 0)
            : new BABYLON.Color3(1, 0, 0);

        this.hideTooltip();
    }

    private handleWaterMode(pickResult: BABYLON.PickingInfo): void {
        const pos = pickResult.pickedPoint;
        if (pos && this.soilSystem) {
            this.soilSystem.showHighlight(pos.x, pos.z, true);
            const moisture = this.soilSystem.getMoistureAt(pos.x, pos.z);

            this.showTooltip(
                `<div class="tooltip-title">💧 Water</div>
                <div class="tooltip-row"><span class="tooltip-label">Moisture:</span><span class="tooltip-value">${moisture.toFixed(0)}%</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Action:</span><span class="tooltip-value">+20%</span></div>`,
                this.scene.pointerX,
                this.scene.pointerY
            );
        }
    }

    private handleInspectMode(pickResult: BABYLON.PickingInfo): void {
        const mesh = pickResult.pickedMesh;

        if (mesh?.name.startsWith("plant_") && mesh.metadata?.entityId !== undefined) {
            const entity = this.world.getEntity(mesh.metadata.entityId);
            if (entity) {
                const state = entity.getComponent(PlantState);
                const needs = entity.getComponent(Needs);

                if (state && needs) {
                    const ageDisplay = state.age < 1
                        ? `${(state.age * 60).toFixed(0)} min`
                        : `${state.age.toFixed(1)} hrs`;
                    this.showTooltip(
                        `<div class="tooltip-title">🌿 Plant #${entity.id}</div>
                        <div class="tooltip-row"><span class="tooltip-label">Stage:</span><span class="tooltip-value">${state.stage}</span></div>
                        <div class="tooltip-row"><span class="tooltip-label">Age:</span><span class="tooltip-value">${ageDisplay}</span></div>
                        <div class="tooltip-row"><span class="tooltip-label">Health:</span><span class="tooltip-value">${state.health > 0 ? "Alive" : "Dead"}</span></div>
                        <div class="tooltip-row"><span class="tooltip-label">Water:</span><span class="tooltip-value">${needs.water.toFixed(0)}%</span></div>`,
                        this.scene.pointerX,
                        this.scene.pointerY
                    );
                    return;
                }
            }
        } else if (mesh?.name === "ground") {
            // Soil inspection
            const pos = pickResult.pickedPoint;
            if (pos && this.soilSystem) {
                const moisture = this.soilSystem.getMoistureAt(pos.x, pos.z);
                this.showTooltip(
                    `<div class="tooltip-title">🟫 Soil</div>
                    <div class="tooltip-row"><span class="tooltip-label">Position:</span><span class="tooltip-value">(${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})</span></div>
                    <div class="tooltip-row"><span class="tooltip-label">Moisture:</span><span class="tooltip-value">${moisture.toFixed(0)}%</span></div>`,
                    this.scene.pointerX,
                    this.scene.pointerY
                );
                return;
            }
        }

        this.hideTooltip();
    }

    private showTooltip(html: string, x: number, y: number): void {
        if (!this.tooltipEl) return;
        this.tooltipEl.innerHTML = html;
        this.tooltipEl.style.left = `${x + 15}px`;
        this.tooltipEl.style.top = `${y + 15}px`;
        this.tooltipEl.classList.remove("hidden");
    }

    private hideTooltip(): void {
        if (!this.tooltipEl) return;
        this.tooltipEl.classList.add("hidden");
    }
}
