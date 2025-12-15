import { Entity, System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";
import { SpatialHashGrid } from "../core/SpatialHashGrid";
import { TransformComponent } from "../components/TransformComponent";
import { PlantState } from "../components/PlantState";
import { PlantGenome } from "../components/PlantGenome";
import { BuildingState } from "../components/BuildingState";
import { Needs } from "../components/Needs";
import { PlayerState } from "../components/PlayerState";
import { ToolManager } from "../ui/ToolManager";
import { SoilSystem } from "./SoilSystem";
import { DiegeticUISystem } from "./DiegeticUISystem";
import { ROOT_RADIUS } from "./GrowthSystem";
import * as BABYLON from "@babylonjs/core";

export class InputSystem extends System {
    private scene: BABYLON.Scene;
    private spatialHash: SpatialHashGrid;
    private toolManager: ToolManager;
    private cursorMesh: BABYLON.Mesh;
    private rootZoneMesh: BABYLON.Mesh;
    private waterSprayMesh: BABYLON.Mesh | null = null;
    private cursorPosition: BABYLON.Vector3 = BABYLON.Vector3.Zero();
    private isValidPlacement: boolean = false;
    private isWaterSpraying: boolean = false;
    private isCompostApplying: boolean = false;
    private readonly PLANT_RADIUS = 1.0;
    private readonly BUILDING_RADIUS = 0.8;
    private readonly SPRAY_RATE = 150; // Moisture per second when spraying
    private readonly SPRAY_RADIUS = 1.5; // Spray cone radius

    private tooltipEl: HTMLElement | null;
    private soilSystem: SoilSystem;
    private playerEntity: Entity | null = null;
    private diegeticUI: DiegeticUISystem | null = null;

    constructor(world: World, spatialHash: SpatialHashGrid, toolManager: ToolManager, soilSystem: SoilSystem, playerEntity: Entity) {
        super(world, SystemType.RENDER);
        this.scene = Engine.getInstance().getScene();
        this.spatialHash = spatialHash;
        this.toolManager = toolManager;
        this.soilSystem = soilSystem;
        this.playerEntity = playerEntity;
        this.tooltipEl = document.getElementById("tooltip");

        // Create cursor mesh
        this.cursorMesh = BABYLON.MeshBuilder.CreateSphere("cursor", { diameter: 1 }, this.scene);
        const cursorMaterial = new BABYLON.StandardMaterial("cursorMat", this.scene);
        cursorMaterial.diffuseColor = new BABYLON.Color3(0, 1, 0);
        cursorMaterial.alpha = 0.5;
        this.cursorMesh.material = cursorMaterial;
        this.cursorMesh.isPickable = false;

        // Create root zone visualization mesh (flat disc)
        this.rootZoneMesh = BABYLON.MeshBuilder.CreateDisc("rootZone", { radius: 1, tessellation: 64 }, this.scene);
        this.rootZoneMesh.rotation.x = Math.PI / 2; // Lay flat on ground
        const rootZoneMaterial = new BABYLON.StandardMaterial("rootZoneMat", this.scene);
        rootZoneMaterial.diffuseColor = new BABYLON.Color3(0.4, 0.6, 0.3); // Earthy green-brown
        rootZoneMaterial.emissiveColor = new BABYLON.Color3(0.2, 0.3, 0.15);
        rootZoneMaterial.alpha = 0.35;
        rootZoneMaterial.backFaceCulling = false;
        this.rootZoneMesh.material = rootZoneMaterial;
        this.rootZoneMesh.isPickable = false;
        this.rootZoneMesh.isVisible = false;

        // Create spray visualization mesh (cone)
        this.waterSprayMesh = BABYLON.MeshBuilder.CreateCylinder("waterSpray", {
            diameterTop: 0.1,
            diameterBottom: 3, // SPRAY_RADIUS * 2
            height: 2,
            tessellation: 16
        }, this.scene);
        const sprayMaterial = new BABYLON.StandardMaterial("sprayMat", this.scene);
        sprayMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1.0); // Water blue
        sprayMaterial.alpha = 0.3;
        sprayMaterial.backFaceCulling = false;
        this.waterSprayMesh.material = sprayMaterial;
        this.waterSprayMesh.isPickable = false;
        this.waterSprayMesh.isVisible = false;
        this.waterSprayMesh.position.y = 1000; // Move out of way initially

        this.setupInput();

        // Manage camera controls based on tool
        this.toolManager.onToolChange((tool) => this.handleToolChange(tool));
        // Initialize with current tool
        this.handleToolChange(this.toolManager.getTool());
    }

    public setDiegeticUI(diegeticUI: DiegeticUISystem): void {
        this.diegeticUI = diegeticUI;
    }

    private setupInput(): void {
        this.scene.onPointerDown = (evt, pickResult) => {
            const tool = this.toolManager.getTool();

            if (tool === "plant" && evt.button === 0 && this.isValidPlacement) {
                this.plantAt(this.cursorPosition.x, this.cursorPosition.z);
            } else if (tool === "build" && evt.button === 0 && this.isValidPlacement) {
                this.buildAt(this.cursorPosition.x, this.cursorPosition.z);
            } else if (tool === "water" && evt.button === 0) {
                // Start spraying water
                this.isWaterSpraying = true;
            } else if (tool === "compost" && evt.button === 0) {
                // Start applying compost
                this.isCompostApplying = true;
            } else if (tool === "harvest" && evt.button === 0 && pickResult?.pickedMesh) {
                this.harvestAt(pickResult.pickedMesh);
            }
        };

        this.scene.onPointerUp = (evt) => {
            if (evt.button === 0) {
                this.isWaterSpraying = false;
                this.isCompostApplying = false;
                if (this.waterSprayMesh) this.waterSprayMesh.isVisible = false;
            }
        };
    }

    private getPlayerState(): PlayerState | undefined {
        return this.playerEntity?.getComponent(PlayerState);
    }

    private handleToolChange(tool: string | null): void {
        const camera = this.scene.activeCamera as BABYLON.FreeCamera;
        if (!camera || !camera.inputs || !camera.inputs.attached["mouse"]) return;

        const mouseInput = camera.inputs.attached["mouse"] as BABYLON.FreeCameraMouseInput;
        const canvas = this.scene.getEngine().getRenderingCanvas();

        // Tools that need left-click free for interaction (water, compost, inspect, harvest)
        // Switch camera rotation to Right Mouse Button (2) to free up Left Mouse Button (0)
        if (tool === "water" || tool === "compost" || tool === "inspect" || tool === "harvest") {
            mouseInput.buttons = [2];

            // Prevent context menu when using right click for camera
            if (canvas) {
                canvas.oncontextmenu = (e) => {
                    e.preventDefault();
                    return false;
                };
            }
        } else {
            // Revert camera rotation to Left Mouse Button (0)
            mouseInput.buttons = [0];

            // Restore context menu (or at least remove our blocker)
            if (canvas) {
                canvas.oncontextmenu = null;
            }
        }
    }

    private plantAt(x: number, z: number): void {
        const playerState = this.getPlayerState();
        if (!playerState || playerState.seeds <= 0) {
            console.log("No seeds available!");
            return;
        }

        // Consume a seed
        playerState.seeds--;
        this.updateSeedDisplay();

        const entity = this.world.createEntity();
        entity.addComponent(new TransformComponent(x, 0.5, z));

        const plantState = new PlantState();
        // plantState.stage is now a getter, implicit start at iteration 0 (sprout)
        entity.addComponent(plantState);

        // Add Genome for L-System growth
        const genome = new PlantGenome();
        // Default genome is adequate, or we could customize here based on species
        entity.addComponent(genome);

        const needs = new Needs();
        needs.water = 100;
        entity.addComponent(needs);

        this.spatialHash.add(entity.id, x, z);

        console.log(`Planted entity ${entity.id} at (${x.toFixed(2)}, ${z.toFixed(2)}). Seeds remaining: ${playerState.seeds}`);
    }

    private harvestAt(mesh: BABYLON.AbstractMesh): void {
        if (!mesh.name.startsWith("plant_") || mesh.metadata?.entityId === undefined) {
            return;
        }

        const entity = this.world.getEntity(mesh.metadata.entityId);
        if (!entity) return;

        const plantState = entity.getComponent(PlantState);
        const transform = entity.getComponent(TransformComponent);
        if (!plantState || !transform) return;

        // Can't harvest dead plants
        if (plantState.health <= 0) {
            console.log("Cannot harvest dead plant!");
            return;
        }

        // Determine seed reward based on stage
        let seedReward = 0;
        if (plantState.stage === "flowering") {
            seedReward = 2; // Mature plants give 2 seeds
        } else if (plantState.stage === "vegetative" || plantState.stage === "sprout") {
            seedReward = 1; // Early stages give 1 seed
        }

        // Add seeds to player
        const playerState = this.getPlayerState();
        if (playerState) {
            playerState.seeds += seedReward;
            this.updateSeedDisplay();
        }

        // Remove plant from spatial hash
        this.spatialHash.remove(entity.id);

        // Remove entity from world
        this.world.removeEntity(entity.id);

        console.log(`Harvested plant #${entity.id} (stage: ${plantState.stage}), got ${seedReward} seeds. Total: ${playerState?.seeds}`);
    }

    private updateSeedDisplay(): void {
        const seedDisplay = document.getElementById("seed-display");
        const playerState = this.getPlayerState();
        if (seedDisplay && playerState) {
            seedDisplay.textContent = `🌱 ${playerState.seeds}`;
        }
    }

    public update(deltaTime: number): void {
        const tool = this.toolManager.getTool();

        // Cursor logic
        if (tool === "plant") {
            // Handled in handlePlantMode
        } else if (tool === "build") {
            // Handled in handleBuildMode
        } else {
            this.cursorMesh.isVisible = false;
        }

        // Raycast - exclude 3D UI meshes (toolbar buttons, status panel, labels)
        const pickResult = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => {
            // Exclude 3D UI elements from picking
            if (mesh.name.startsWith("mesh_") || mesh.name.startsWith("btn3d_") ||
                mesh.name === "status_plane" || mesh.name.startsWith("label_") ||
                mesh.name.startsWith("inspect_")) {
                return false;
            }
            // Allow ground, plants, buildings by name, or any mesh with entityId metadata (for plant picking)
            return mesh.name === "ground" ||
                mesh.name.startsWith("plant_") ||
                mesh.name.startsWith("building_") ||
                mesh.metadata?.entityId !== undefined;
        });

        if (!pickResult?.hit || !pickResult.pickedPoint) {
            this.cursorMesh.isVisible = false;
            this.rootZoneMesh.isVisible = false;
            this.isValidPlacement = false;
            this.hideTooltip();
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            return;
        }

        // Handle tools
        if (tool === "plant") {
            this.rootZoneMesh.isVisible = false;
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            this.handlePlantMode(pickResult);
        } else if (tool === "build") {
            this.rootZoneMesh.isVisible = false;
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            this.handleBuildMode(pickResult);
        } else if (tool === "water") {
            this.rootZoneMesh.isVisible = false;
            this.handleWaterMode(pickResult, deltaTime);
        } else if (tool === "inspect") {
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            this.handleInspectMode(pickResult);
        } else if (tool === "compost") {
            this.rootZoneMesh.isVisible = false;
            this.handleCompostMode(pickResult);
        } else if (tool === "harvest") {
            this.rootZoneMesh.isVisible = false;
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
            this.handleHarvestMode(pickResult);
        } else {
            this.rootZoneMesh.isVisible = false;
            this.hideTooltip();
            if (this.soilSystem) this.soilSystem.showHighlight(0, 0, false);
        }
    }

    private handlePlantMode(pickResult: BABYLON.PickingInfo): void {
        if (!pickResult.pickedPoint) return;

        this.cursorPosition = pickResult.pickedPoint.clone();
        this.cursorMesh.position = this.cursorPosition.clone();
        this.cursorMesh.position.y += 0.5; // Offset above terrain
        this.cursorMesh.isVisible = true;

        const playerState = this.getPlayerState();
        const hasSeeds = !!(playerState && playerState.seeds > 0);

        this.isValidPlacement = hasSeeds && !this.spatialHash.hasNearby(
            this.cursorPosition.x,
            this.cursorPosition.z,
            this.PLANT_RADIUS
        );

        const mat = this.cursorMesh.material as BABYLON.StandardMaterial;
        if (!hasSeeds) {
            mat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Gray when no seeds
        } else {
            mat.diffuseColor = this.isValidPlacement
                ? new BABYLON.Color3(0, 1, 0)
                : new BABYLON.Color3(1, 0, 0);
        }

        // Show seed count in tooltip when hovering
        if (!hasSeeds) {
            this.showTooltip(
                `<div class="tooltip-title">🌱 No Seeds</div>
                <div class="tooltip-row"><span class="tooltip-value">Harvest plants to get more seeds!</span></div>`,
                this.scene.pointerX,
                this.scene.pointerY
            );
        } else {
            this.hideTooltip();
        }
    }

    private handleHarvestMode(pickResult: BABYLON.PickingInfo): void {
        const mesh = pickResult.pickedMesh;

        if (mesh?.name.startsWith("plant_") && mesh.metadata?.entityId !== undefined) {
            const entity = this.world.getEntity(mesh.metadata.entityId);
            if (entity) {
                const state = entity.getComponent(PlantState);
                if (state) {
                    // Determine seed reward based on stage
                    let harvestable = true;

                    if (state.health <= 0) {
                        harvestable = false;
                    }

                    // Show cursor mesh over the plant
                    this.cursorMesh.position = mesh.position.clone();
                    this.cursorMesh.position.y += 1;
                    this.cursorMesh.scaling = new BABYLON.Vector3(1, 1, 1);
                    this.cursorMesh.isVisible = true;

                    const mat = this.cursorMesh.material as BABYLON.StandardMaterial;
                    mat.diffuseColor = harvestable
                        ? new BABYLON.Color3(1, 0.8, 0) // Gold for harvestable
                        : new BABYLON.Color3(0.5, 0.5, 0.5); // Gray for dead

                    const statusText = !harvestable
                        ? "Dead - cannot harvest"
                        : state.stage === "flowering"
                            ? "Mature - 2 seeds"
                            : `${state.stage} - 1 seed`;

                    this.showTooltip(
                        `<div class="tooltip-title">🌾 Harvest</div>
                        <div class="tooltip-row"><span class="tooltip-label">Stage:</span><span class="tooltip-value">${state.stage}</span></div>
                        <div class="tooltip-row"><span class="tooltip-label">Yield:</span><span class="tooltip-value">${statusText}</span></div>`,
                        this.scene.pointerX,
                        this.scene.pointerY
                    );
                    return;
                }
            }
        }

        this.cursorMesh.isVisible = false;
        this.hideTooltip();
    }

    private handleWaterMode(pickResult: BABYLON.PickingInfo, deltaTime: number): void {
        const pos = pickResult.pickedPoint;
        if (!pos || !this.soilSystem || !this.waterSprayMesh) return;

        // Position spray visualization
        this.waterSprayMesh.position.x = pos.x;
        this.waterSprayMesh.position.y = pos.y + 0.05; // Slightly above ground
        this.waterSprayMesh.position.z = pos.z;

        // Show/hide spray mesh based on spraying state
        this.waterSprayMesh.isVisible = this.isWaterSpraying;

        // Pulse the spray mesh alpha for visual feedback when spraying
        if (this.isWaterSpraying) {
            const sprayMat = this.waterSprayMesh.material as BABYLON.StandardMaterial;
            sprayMat.alpha = 0.3 + 0.2 * Math.sin(Date.now() * 0.01);

            // Apply water to all cells within the spray cone radius
            // We want to add moisture proportional to the amount the square is covered

            // Grid cell size from SoilSystem (should ideally be public or constant there, assuming 1.0 for now if not accessible)
            const CELL_SIZE = 1.0;

            // Determine range of cells to check
            const startX = Math.floor((pos.x - this.SPRAY_RADIUS) / CELL_SIZE);
            const endX = Math.floor((pos.x + this.SPRAY_RADIUS) / CELL_SIZE);
            const startZ = Math.floor((pos.z - this.SPRAY_RADIUS) / CELL_SIZE);
            const endZ = Math.floor((pos.z + this.SPRAY_RADIUS) / CELL_SIZE);

            // Previous code: moisturePerSpot = (this.SPRAY_RATE * deltaTime) / this.SPRAY_PARTICLES;
            // It applied `moisturePerSpot` to 5 random spots.
            // So Total Moisture added per frame = SPRAY_RATE * deltaTime.

            // Let's assume SPRAY_RATE is the peak intensity at the center.
            // Or better, let's try to match the previous "Total Volume" but spread it out smoothly.
            // But user said "triple the rate" then "5x it", implying they want it POTENT.
            // If we spread 150 units over a 1.5 radius circle (Area ~7), the intensity might be low?
            // Let's assume SPRAY_RATE is the max amount added to a fully covered cell per second.

            for (let cx = startX; cx <= endX; cx++) {
                for (let cz = startZ; cz <= endZ; cz++) {
                    const cellCenterWorldX = cx * CELL_SIZE + CELL_SIZE / 2;
                    const cellCenterWorldZ = cz * CELL_SIZE + CELL_SIZE / 2;

                    // Distance from spray center to cell center
                    const dist = Math.sqrt(Math.pow(cellCenterWorldX - pos.x, 2) + Math.pow(cellCenterWorldZ - pos.z, 2));

                    if (dist < this.SPRAY_RADIUS + CELL_SIZE) { // simple check first
                        // Calculate coverage factor (0 to 1)
                        // A simple linear falloff or hard cut?
                        // "Proportional to amount square is covered"
                        // Exact square-circle intersection is expensive.
                        // Let's approximate:
                        // If center is inside R, it's mostly covered.
                        // Let's use a smooth falloff: 1.0 at center, 0 at Radius.
                        // But users usually mean "Everything inside gets water".
                        // Let's use a "Clamped linear falloff" where inner 50% is 1.0, then drops to 0 at edge?
                        // Or just "Intersection Area Approximation".

                        // Simple circle vs point-in-radius check for now, weighted by distance to simulate coverage at edges
                        const range = this.SPRAY_RADIUS;
                        if (dist < range) {
                            // Inside. Percentage?
                            // Let's imply that "amount covered" relates to how close it is.
                            // Actually, let's treat the spray as having a uniform intensity within the cone.
                            // The "coverage" aspect means edge cells get less.
                            // Approximate intersection of square and circle:
                            // If dist + cellRadius <= range -> 100% covered.
                            // If dist - cellRadius >= range -> 0% covered.
                            // Linear interp in between.

                            let factor = 0;
                            if (dist <= range - CELL_SIZE / 2) {
                                factor = 1.0;
                            } else if (dist >= range + CELL_SIZE / 2) {
                                factor = 0.0;
                            } else {
                                // Edge case
                                factor = 1.0 - (dist - (range - CELL_SIZE / 2)) / CELL_SIZE;
                            }

                            // Clamp factor
                            factor = Math.max(0, Math.min(1, factor));

                            if (factor > 0) {
                                const moistureToAdd = this.SPRAY_RATE * deltaTime * factor;
                                // We use modifyMoistureAt which takes world coords, but we have cell indices.
                                // SoilSystem needs world coords or we can access via integer.
                                // But modifyMoistureAt converts input world coords to integer.
                                // So passing cell center is fine.
                                this.soilSystem.modifyMoistureAt(cellCenterWorldX, cellCenterWorldZ, moistureToAdd);
                            }
                        }
                    }
                }
            }
        }

        // Show highlight under cursor
        this.soilSystem.showHighlight(pos.x, pos.z, true);

        // Show tooltip with spray info
        const moisture = this.soilSystem.getMoistureAt(pos.x, pos.z);
        const actionText = this.isWaterSpraying ? "Spraying..." : "Hold to spray";

        this.showTooltip(
            `<div class="tooltip-title">💧 Water Spray</div>
            <div class="tooltip-row"><span class="tooltip-label">Moisture:</span><span class="tooltip-value">${moisture.toFixed(0)}%</span></div>
            <div class="tooltip-row"><span class="tooltip-label">Action:</span><span class="tooltip-value">${actionText}</span></div>`,
            this.scene.pointerX,
            this.scene.pointerY
        );
    }

    private handleCompostMode(pickResult: BABYLON.PickingInfo): void {
        const pos = pickResult.pickedPoint;
        if (!pos || !this.soilSystem) return;

        // Show highlight under cursor
        this.soilSystem.showHighlight(pos.x, pos.z, true);

        // Apply nitrogen when holding mouse button
        if (this.isCompostApplying) {
            this.soilSystem.modifyNitrogenAt(pos.x, pos.z, 0.5); // Slower rate than water
        }

        // Show tooltip with nitrogen info
        const nitrogen = this.soilSystem.getNitrogenAt(pos.x, pos.z);
        const moisture = this.soilSystem.getMoistureAt(pos.x, pos.z);
        const actionText = this.isCompostApplying ? "Applying..." : "Hold to apply";

        this.showTooltip(
            `<div class="tooltip-title">🧪 Compost</div>
            <div class="tooltip-row"><span class="tooltip-label">Nitrogen:</span><span class="tooltip-value">${nitrogen.toFixed(0)}%</span></div>
            <div class="tooltip-row"><span class="tooltip-label">Moisture:</span><span class="tooltip-value">${moisture.toFixed(0)}%</span></div>
            <div class="tooltip-row"><span class="tooltip-label">Action:</span><span class="tooltip-value">${actionText}</span></div>`,
            this.scene.pointerX,
            this.scene.pointerY
        );
    }

    private handleInspectMode(pickResult: BABYLON.PickingInfo): void {
        const mesh = pickResult.pickedMesh;

        // Check for entityId metadata (works for parent and child meshes)
        if (mesh?.metadata?.entityId !== undefined) {
            const entity = this.world.getEntity(mesh.metadata.entityId);
            if (entity) {
                const state = entity.getComponent(PlantState);
                const needs = entity.getComponent(Needs);
                const transform = entity.getComponent(TransformComponent);

                if (state && needs && transform) {
                    // Show root zone visualization
                    const rootRadius = ROOT_RADIUS[state.stage] || 1.0;
                    this.rootZoneMesh.position.set(transform.x, 0.02, transform.z); // Just above ground
                    this.rootZoneMesh.scaling.set(rootRadius, rootRadius, rootRadius);
                    this.rootZoneMesh.isVisible = true;

                    // Color based on competition (green = no competition, orange/red = high competition)
                    const rootMat = this.rootZoneMesh.material as BABYLON.StandardMaterial;
                    if (state.waterCompetitionPenalty > 0.01) {
                        const t = Math.min(1, state.waterCompetitionPenalty / 0.8);
                        rootMat.diffuseColor = new BABYLON.Color3(0.8, 0.5 * (1 - t), 0.2 * (1 - t));
                        rootMat.emissiveColor = new BABYLON.Color3(0.4, 0.2 * (1 - t), 0.1 * (1 - t));
                    } else {
                        rootMat.diffuseColor = new BABYLON.Color3(0.4, 0.6, 0.3);
                        rootMat.emissiveColor = new BABYLON.Color3(0.2, 0.3, 0.15);
                    }

                    const ageDisplay = state.age < 1
                        ? `${(state.age * 60).toFixed(0)} min`
                        : `${state.age.toFixed(1)} hrs`;

                    // Build tooltip rows
                    const rows: Array<{ label: string; value: string; color?: string }> = [
                        { label: "Stage:", value: state.stage },
                        { label: "Age:", value: ageDisplay },
                        { label: "Health:", value: state.health > 0 ? "Alive" : "Dead", color: state.health > 0 ? "#88ff88" : "#ff8888" },
                        { label: "Water:", value: `${needs.water.toFixed(0)}%` },
                        { label: "🌱 Root Zone:", value: `${rootRadius.toFixed(1)}m` },
                    ];

                    // Add competition info if applicable
                    if (state.waterCompetitionPenalty > 0.01) {
                        rows.push({
                            label: "⚔️ Competition:",
                            value: `${(state.waterCompetitionPenalty * 100).toFixed(0)}% penalty`,
                            color: "#ff8866"
                        });
                    }

                    // Show 3D tooltip
                    if (this.diegeticUI) {
                        const worldPos = new BABYLON.Vector3(transform.x, 0, transform.z);
                        this.diegeticUI.showInspectTooltip(worldPos, `🌿 Plant #${entity.id}`, rows);
                    }
                    this.hideTooltip(); // Hide HTML tooltip
                    return;
                }
            }
        } else if (mesh?.name === "ground") {
            // Hide root zone when inspecting ground
            this.rootZoneMesh.isVisible = false;

            // Soil inspection
            const pos = pickResult.pickedPoint;
            if (pos && this.soilSystem) {
                const moisture = this.soilSystem.getMoistureAt(pos.x, pos.z);
                const nitrogen = this.soilSystem.getNitrogenAt(pos.x, pos.z);

                const rows: Array<{ label: string; value: string; color?: string }> = [
                    { label: "Position:", value: `(${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})` },
                    { label: "Moisture:", value: `${moisture.toFixed(0)}%`, color: moisture > 60 ? "#66aaff" : moisture < 30 ? "#ffaa66" : undefined },
                    { label: "Nitrogen:", value: `${nitrogen.toFixed(0)}%`, color: nitrogen > 50 ? "#88ff88" : nitrogen < 20 ? "#ffaa66" : undefined },
                ];

                // Show 3D tooltip at ground position
                if (this.diegeticUI) {
                    this.diegeticUI.showInspectTooltip(pos.clone(), "🟫 Soil", rows);
                }
                this.hideTooltip(); // Hide HTML tooltip
                return;
            }
        }

        // Hide tooltips when not inspecting anything useful
        this.rootZoneMesh.isVisible = false;
        if (this.diegeticUI) {
            this.diegeticUI.hideInspectTooltip();
        }
        this.hideTooltip();
    }

    private handleBuildMode(pickResult: BABYLON.PickingInfo): void {
        if (!pickResult.pickedPoint) return;

        this.cursorPosition = pickResult.pickedPoint.clone();
        const terrainY = this.cursorPosition.y;
        this.cursorMesh.position = this.cursorPosition.clone();

        const buildingType = this.toolManager.getActiveBuilding();
        // Update ghost mesh appearance based on active building
        // For now, simple scaling differentiation
        if (buildingType === "lightpost") {
            this.cursorMesh.scaling = new BABYLON.Vector3(0.5, 2, 0.5); // Tall thin
            this.cursorMesh.position.y = terrainY + 1;
        } else {
            this.cursorMesh.scaling = new BABYLON.Vector3(1, 0.2, 1); // Flat
            this.cursorMesh.position.y = terrainY + 0.1;
        }
        this.cursorMesh.isVisible = true;

        this.isValidPlacement = !this.spatialHash.hasNearby(
            this.cursorPosition.x,
            this.cursorPosition.z,
            this.BUILDING_RADIUS
        );

        const mat = this.cursorMesh.material as BABYLON.StandardMaterial;
        mat.diffuseColor = this.isValidPlacement
            ? new BABYLON.Color3(0.2, 0.8, 1) // Cyan for build
            : new BABYLON.Color3(1, 0, 0);

        this.hideTooltip();
    }

    private buildAt(x: number, z: number): void {
        const type = this.toolManager.getActiveBuilding();
        if (!type) return;

        const entity = this.world.createEntity();
        entity.addComponent(new TransformComponent(x, 0, z));
        entity.addComponent(new BuildingState(type));

        this.spatialHash.add(entity.id, x, z);
        console.log(`Built ${type} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
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
