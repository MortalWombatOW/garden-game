
import { System, SystemType, World, EntityID } from "../core/ECS";
import { PlantState, PlantStage } from "../components/PlantState";
import { Needs } from "../components/Needs";
import { TransformComponent } from "../components/TransformComponent";
import { Engine } from "../core/Engine";
import * as BABYLON from "@babylonjs/core";
import { LightingSystem } from "./LightingSystem";

// Mesh configurations per stage
const STAGE_MESHES: Record<PlantStage, { height: number; diameter: number }> = {
    seed: { height: 0.2, diameter: 0.3 },
    sprout: { height: 0.5, diameter: 0.3 },
    vegetative: { height: 1.0, diameter: 0.5 },
    flowering: { height: 1.5, diameter: 0.7 },
};

type PlantStatus = "happy" | "thirsty" | "wilting" | "dead" | "growing";

export class RenderSystem extends System {
    private scene: BABYLON.Scene;
    private engine: BABYLON.Engine;
    private entityMeshes: Map<EntityID, BABYLON.Mesh> = new Map();
    private statusLabelsContainer: HTMLElement | null;
    private statusLabels: Map<EntityID, HTMLElement> = new Map();
    private lightingSystem: LightingSystem | null = null;

    constructor(world: World) {
        super(world, SystemType.RENDER);
        const engineInstance = Engine.getInstance();
        this.scene = engineInstance.getScene();
        this.engine = engineInstance.getEngine();
        this.statusLabelsContainer = document.getElementById("status-labels");
    }


    public setLightingSystem(lightingSystem: LightingSystem): void {
        this.lightingSystem = lightingSystem;
    }

    public update(_deltaTime: number): void {
        const entities = this.world.getEntitiesWithComponent(PlantState);
        const activeEntityIds = new Set<EntityID>();

        for (const entity of entities) {
            const state = entity.getComponent(PlantState);
            const transform = entity.getComponent(TransformComponent);
            const needs = entity.getComponent(Needs);

            if (!state || !transform) continue;
            activeEntityIds.add(entity.id);

            let mesh = this.entityMeshes.get(entity.id);

            // Create mesh if it doesn't exist or stage changed
            if (!mesh || state.stageChanged) {
                if (mesh) mesh.dispose();
                mesh = this.createPlantMesh(entity.id, state.stage, transform);
                this.entityMeshes.set(entity.id, mesh);
                state.stageChanged = false;
            }

            // Update color based on health and needs
            this.updatePlantAppearance(mesh, state, needs);

            // Update status label
            this.updateStatusLabel(entity.id, mesh, state, needs);
        }

        // Cleanup removed entities
        this.cleanupRemovedEntities(activeEntityIds);
    }

    private createPlantMesh(entityId: EntityID, stage: PlantStage, transform: TransformComponent): BABYLON.Mesh {
        const config = STAGE_MESHES[stage];

        const mesh = BABYLON.MeshBuilder.CreateCylinder(`plant_${entityId}`, {
            height: config.height,
            diameter: config.diameter,
            tessellation: 8,
        }, this.scene);

        mesh.position = new BABYLON.Vector3(transform.x, config.height / 2, transform.z);
        mesh.receiveShadows = true;

        if (this.lightingSystem) {
            this.lightingSystem.addShadowCaster(mesh);
        }

        const mat = new BABYLON.StandardMaterial(`plantMat_${entityId}`, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);
        mesh.material = mat;
        mesh.metadata = { entityId };

        return mesh;
    }

    private updatePlantAppearance(mesh: BABYLON.Mesh, state: PlantState, needs: Needs | undefined): void {
        const mat = mesh.material as BABYLON.StandardMaterial;
        if (!mat) return;

        if (state.health <= 0) {
            mat.diffuseColor = new BABYLON.Color3(0.4, 0.25, 0.1);
        } else if (needs && needs.water < 30) {
            mat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.2);
        } else {
            const greenIntensity = state.stage === "flowering" ? 0.4 :
                state.stage === "vegetative" ? 0.55 : 0.6;
            mat.diffuseColor = new BABYLON.Color3(0.2, greenIntensity, 0.2);
        }

        const config = STAGE_MESHES[state.stage];
        mesh.position.y = config.height / 2;
    }

    private getPlantStatus(state: PlantState, needs: Needs | undefined): PlantStatus {
        if (state.health <= 0) return "dead";
        if (!needs) return "happy";
        if (needs.water < 15) return "wilting";
        if (needs.water < 40) return "thirsty";
        if (state.stageChanged) return "growing";
        return "happy";
    }

    private getStatusText(status: PlantStatus): string {
        switch (status) {
            case "happy": return "😊 Happy";
            case "thirsty": return "💧 Thirsty";
            case "wilting": return "🥀 Wilting";
            case "dead": return "💀 Dead";
            case "growing": return "🌱 Growing";
        }
    }

    private updateStatusLabel(entityId: EntityID, mesh: BABYLON.Mesh, state: PlantState, needs: Needs | undefined): void {
        if (!this.statusLabelsContainer) return;

        const status = this.getPlantStatus(state, needs);
        let label = this.statusLabels.get(entityId);

        if (!label) {
            label = document.createElement("div");
            label.className = `status-label ${status}`;
            this.statusLabelsContainer.appendChild(label);
            this.statusLabels.set(entityId, label);
        }

        label.textContent = this.getStatusText(status);
        label.className = `status-label ${status}`;

        // Project 3D position to 2D screen
        const config = STAGE_MESHES[state.stage];
        const worldPos = mesh.position.clone();
        worldPos.y += config.height / 2 + 0.3; // Above the plant

        const screenPos = BABYLON.Vector3.Project(
            worldPos,
            BABYLON.Matrix.Identity(),
            this.scene.getTransformMatrix(),
            this.scene.activeCamera!.viewport.toGlobal(
                this.engine.getRenderWidth(),
                this.engine.getRenderHeight()
            )
        );

        // Check if behind camera
        if (screenPos.z > 1) {
            label.style.display = "none";
        } else {
            label.style.display = "block";
            label.style.left = `${screenPos.x}px`;
            label.style.top = `${screenPos.y}px`;
        }
    }

    private cleanupRemovedEntities(activeIds: Set<EntityID>): void {
        for (const [id, mesh] of this.entityMeshes) {
            if (!activeIds.has(id)) {
                mesh.dispose();
                this.entityMeshes.delete(id);
            }
        }
        for (const [id, label] of this.statusLabels) {
            if (!activeIds.has(id)) {
                label.remove();
                this.statusLabels.delete(id);
            }
        }
    }
}
