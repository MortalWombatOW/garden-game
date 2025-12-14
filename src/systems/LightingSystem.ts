
import * as BABYLON from "@babylonjs/core";
import { System, SystemType, World } from "../core/ECS";
import { Engine } from "../core/Engine";
import { TimeSystem } from "./TimeSystem";

/**
 * LightingSystem manages the sun, skybox, and shadow casting.
 * The sun orbits the world based on the TimeSystem's time of day.
 */
export class LightingSystem extends System {
    private scene: BABYLON.Scene;
    private timeSystem: TimeSystem;

    // Sun components
    private sunLight: BABYLON.DirectionalLight;
    private sunMesh: BABYLON.Mesh;
    private shadowGenerator: BABYLON.ShadowGenerator;

    // Moon components
    private moonLight: BABYLON.DirectionalLight;
    private moonMesh: BABYLON.Mesh;

    // Skybox
    private skybox: BABYLON.Mesh;
    private skyboxMaterial: BABYLON.StandardMaterial;

    // Ambient light
    private ambientLight: BABYLON.HemisphericLight;

    // Orbit settings
    private readonly SUN_DISTANCE = 80; // Distance from world center
    private readonly SUN_HEIGHT_OFFSET = 20; // Minimum height above horizon

    constructor(world: World, timeSystem: TimeSystem) {
        super(world, SystemType.RENDER); // Update every frame for smooth sun movement
        this.timeSystem = timeSystem;
        this.scene = Engine.getInstance().getScene();

        // Initialize sun light (directional for shadows)
        this.sunLight = new BABYLON.DirectionalLight(
            "sunLight",
            new BABYLON.Vector3(-1, -1, 0),
            this.scene
        );
        this.sunLight.intensity = 1.0;
        this.sunLight.diffuse = new BABYLON.Color3(1, 0.95, 0.8);
        this.sunLight.specular = new BABYLON.Color3(1, 1, 0.9);

        // Initialize moon light
        this.moonLight = new BABYLON.DirectionalLight(
            "moonLight",
            new BABYLON.Vector3(1, -1, 0),
            this.scene
        );
        this.moonLight.intensity = 0.5;
        this.moonLight.diffuse = new BABYLON.Color3(0.8, 0.9, 1.0); // Cool white
        this.moonLight.specular = new BABYLON.Color3(0.8, 0.9, 1.0);

        // Create sun mesh (visual representation)
        this.sunMesh = BABYLON.MeshBuilder.CreateSphere("sunMesh", { diameter: 8 }, this.scene);
        const sunMaterial = new BABYLON.StandardMaterial("sunMat", this.scene);
        sunMaterial.emissiveColor = new BABYLON.Color3(1, 0.9, 0.5);
        sunMaterial.disableLighting = true;
        this.sunMesh.material = sunMaterial;

        // Create moon mesh
        this.moonMesh = BABYLON.MeshBuilder.CreateSphere("moonMesh", { diameter: 6 }, this.scene);
        const moonMaterial = new BABYLON.StandardMaterial("moonMat", this.scene);
        moonMaterial.emissiveColor = new BABYLON.Color3(0.9, 0.95, 1);
        moonMaterial.disableLighting = true;
        this.moonMesh.material = moonMaterial;

        // Enable shadows (Sun only for now to save performance)
        this.shadowGenerator = new BABYLON.ShadowGenerator(1024, this.sunLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;

        // Create skybox
        this.skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 500 }, this.scene);
        this.skyboxMaterial = new BABYLON.StandardMaterial("skyBoxMat", this.scene);
        this.skyboxMaterial.backFaceCulling = false;
        this.skyboxMaterial.disableLighting = true;
        this.skybox.material = this.skyboxMaterial;
        this.skybox.infiniteDistance = true;

        // Add ambient light for when sun is down
        this.ambientLight = new BABYLON.HemisphericLight(
            "ambientLight",
            new BABYLON.Vector3(0, 1, 0),
            this.scene
        );
        this.ambientLight.intensity = 0.5;
        this.ambientLight.groundColor = new BABYLON.Color3(0.1, 0.1, 0.15);

        // Set initial position
        this.updateCelestialPositions();
        this.updateSkyColors();
    }

    public update(_deltaTime: number): void {
        this.updateCelestialPositions();
        this.updateSkyColors();
    }

    private updateCelestialPositions(): void {
        const timeOfDay = this.timeSystem.getTimeOfDayFraction();

        // Convert time to angle: 0.5 (noon) = sun at highest point
        // 0.0 or 1.0 (midnight) = sun below horizon
        const angle = (timeOfDay - 0.25) * 2 * Math.PI; // Shift so sunrise is at 0.25 (6am)

        // Calculate sun position on a circular orbit
        const x = Math.cos(angle) * this.SUN_DISTANCE;
        const y = Math.sin(angle) * this.SUN_DISTANCE + this.SUN_HEIGHT_OFFSET;
        const z = 0; // Sun moves in the X-Y plane

        this.sunMesh.position.set(x, y, z);

        // Sun logic
        this.sunLight.direction = this.sunMesh.position.negate().normalize();

        const sunHeight = Math.max(0, y);
        const sunHeightRatio = Math.min(1, sunHeight / this.SUN_DISTANCE);
        this.sunLight.intensity = sunHeightRatio * 0.8 + 0.1; // Range 0.1 to 0.9

        // Adjust sun color based on height (warmer at horizon)
        if (sunHeightRatio < 0.3) {
            const t = sunHeightRatio / 0.3;
            this.sunLight.diffuse = BABYLON.Color3.Lerp(
                new BABYLON.Color3(1, 0.5, 0.2), // Orange at horizon
                new BABYLON.Color3(1, 0.95, 0.8), // Yellow-white at noon
                t
            );
        }

        // Moon logic (Opposite to sun)
        // We can just negate the sun position relative to center, but we want to maintain the offset logic if needed.
        // Simplest is to just use angle + PI
        const moonAngle = angle + Math.PI;
        const moonX = Math.cos(moonAngle) * this.SUN_DISTANCE;
        const moonY = Math.sin(moonAngle) * this.SUN_DISTANCE + this.SUN_HEIGHT_OFFSET;

        this.moonMesh.position.set(moonX, moonY, z);
        this.moonLight.direction = this.moonMesh.position.negate().normalize();

        const moonHeight = Math.max(0, moonY);
        const moonHeightRatio = Math.min(1, moonHeight / this.SUN_DISTANCE);

        // Moon intensity: 0.7 relative strength (requested)
        // Only active when above horizon
        this.moonLight.intensity = moonHeightRatio * 0.7;
    }

    private updateSkyColors(): void {
        const timeOfDay = this.timeSystem.getTimeOfDayFraction();

        let skyColor: BABYLON.Color3;
        let groundColor: BABYLON.Color3;
        let ambientColor: BABYLON.Color3;

        if (timeOfDay < 0.25) {
            // Night to dawn (0:00 - 6:00)
            const t = timeOfDay / 0.25;
            skyColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.02, 0.02, 0.08), // Dark night
                new BABYLON.Color3(0.4, 0.3, 0.5), // Dawn purple
                t
            );
            groundColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.01, 0.01, 0.03),
                new BABYLON.Color3(0.2, 0.15, 0.1),
                t
            );
            ambientColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.25, 0.25, 0.45), // Bright Night Blue
                new BABYLON.Color3(0.4, 0.3, 0.4), // Dawn
                t
            );
        } else if (timeOfDay < 0.5) {
            // Dawn to noon (6:00 - 12:00)
            const t = (timeOfDay - 0.25) / 0.25;
            skyColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.4, 0.3, 0.5), // Dawn purple
                new BABYLON.Color3(0.4, 0.6, 0.9), // Bright day blue
                t
            );
            groundColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.2, 0.15, 0.1),
                new BABYLON.Color3(0.3, 0.35, 0.4),
                t
            );
            ambientColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.4, 0.3, 0.4), // Dawn
                new BABYLON.Color3(0.7, 0.7, 0.7), // Noon White
                t
            );
        } else if (timeOfDay < 0.75) {
            // Noon to dusk (12:00 - 18:00)
            const t = (timeOfDay - 0.5) / 0.25;
            skyColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.4, 0.6, 0.9), // Bright day blue
                new BABYLON.Color3(0.8, 0.4, 0.3), // Sunset orange
                t
            );
            groundColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.3, 0.35, 0.4),
                new BABYLON.Color3(0.3, 0.15, 0.1),
                t
            );
            ambientColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.7, 0.7, 0.7), // Noon White
                new BABYLON.Color3(0.6, 0.5, 0.5), // Dusk
                t
            );
        } else {
            // Dusk to night (18:00 - 24:00)
            const t = (timeOfDay - 0.75) / 0.25;
            skyColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.8, 0.4, 0.3), // Sunset orange
                new BABYLON.Color3(0.02, 0.02, 0.08), // Dark night
                t
            );
            groundColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.3, 0.15, 0.1),
                new BABYLON.Color3(0.01, 0.01, 0.03),
                t
            );
            ambientColor = BABYLON.Color3.Lerp(
                new BABYLON.Color3(0.6, 0.5, 0.5), // Dusk
                new BABYLON.Color3(0.25, 0.25, 0.45), // Bright Night Blue
                t
            );
        }

        // Update scene clear color (sky background)
        this.scene.clearColor = new BABYLON.Color4(skyColor.r, skyColor.g, skyColor.b, 1);
        this.skyboxMaterial.emissiveColor = skyColor;
        this.ambientLight.groundColor = groundColor;
        this.ambientLight.diffuse = ambientColor!;
    }

    /**
     * Get the shadow generator to add shadow casters
     */
    public getShadowGenerator(): BABYLON.ShadowGenerator {
        return this.shadowGenerator;
    }

    /**
     * Add a mesh to cast shadows
     */
    public addShadowCaster(mesh: BABYLON.AbstractMesh): void {
        this.shadowGenerator.addShadowCaster(mesh);
    }

    /**
     * Check if a world position is in direct sunlight using raycasting.
     * Returns a value between 0 (full shadow) and 1 (full sun).
     */
    public getSunlightIntensity(worldX: number, worldZ: number): number {
        const timeOfDay = this.timeSystem.getTimeOfDayFraction();

        // Night time - no sunlight at all
        if (timeOfDay < 0.25 || timeOfDay > 0.85) {
            return 0;
        }

        // Get sun direction
        const sunDirection = this.sunLight.direction.clone();
        const rayOrigin = new BABYLON.Vector3(worldX, 0.1, worldZ);

        // Cast ray towards sun (opposite of light direction)
        const rayDirection = sunDirection.negate();
        const ray = new BABYLON.Ray(rayOrigin, rayDirection, this.SUN_DISTANCE * 2);

        // Check for intersection with any mesh
        const pickInfo = this.scene.pickWithRay(ray, (mesh) => {
            // Ignore sun mesh, skybox, and ground
            return mesh.name !== "sunMesh" &&
                mesh.name !== "skyBox" &&
                mesh.name !== "ground" &&
                mesh.isVisible;
        });

        if (pickInfo && pickInfo.hit) {
            return 0; // In shadow
        }

        // Calculate intensity based on sun height (dimmer at dawn/dusk)
        const angle = (timeOfDay - 0.25) * 2 * Math.PI;
        const sunY = Math.sin(angle) * this.SUN_DISTANCE + this.SUN_HEIGHT_OFFSET;
        const heightRatio = Math.max(0, Math.min(1, sunY / this.SUN_DISTANCE));

        return heightRatio;
    }

    /**
     * Simple boolean check for sunlight (for simpler systems)
     */
    public isInSunlight(worldX: number, worldZ: number): boolean {
        return this.getSunlightIntensity(worldX, worldZ) > 0.1;
    }
}
