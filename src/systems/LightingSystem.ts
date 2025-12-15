
import * as BABYLON from "@babylonjs/core";
import { SkyMaterial } from "@babylonjs/materials";
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
    private shadowGenerator: BABYLON.ShadowGenerator;

    // Moon components
    private moonLight: BABYLON.DirectionalLight;

    // Stars
    private stars: BABYLON.PointsCloudSystem;
    private starMesh: BABYLON.Mesh | null = null;
    private readonly STAR_COUNT = 2000;
    private readonly STAR_RADIUS = 400;

    // Skybox
    private skybox: BABYLON.Mesh;
    private skyMaterial: SkyMaterial;

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

        // Enable shadows (Sun only for now to save performance)
        this.shadowGenerator = new BABYLON.ShadowGenerator(1024, this.sunLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;

        // Create Skybox using SkyMaterial
        this.skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 1000 }, this.scene);
        this.skyMaterial = new SkyMaterial("skyMaterial", this.scene);
        this.skyMaterial.backFaceCulling = false;

        // Sky Config
        this.skyMaterial.turbidity = 5; // Haze amount
        this.skyMaterial.luminance = 1; // Brightness
        this.skyMaterial.inclination = 0; // The sun's path (0 = overhead)
        this.skyMaterial.azimuth = 0.25; // Direction of sun 

        this.skybox.material = this.skyMaterial;
        this.skybox.infiniteDistance = true;

        // Create Stars
        this.stars = new BABYLON.PointsCloudSystem("stars", 1, this.scene);
        this.stars.addPoints(this.STAR_COUNT, (particle: BABYLON.CloudPoint) => {
            // Random position on sphere surface
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);

            particle.position = new BABYLON.Vector3(
                this.STAR_RADIUS * Math.cos(theta) * Math.sin(phi),
                this.STAR_RADIUS * Math.sin(theta) * Math.sin(phi),
                this.STAR_RADIUS * Math.cos(phi)
            );

            // Random color (mostly white/blueish) - boosted 1.5x
            const c = (0.8 + Math.random() * 0.2) * 1.5;
            particle.color = new BABYLON.Color4(c, c, (c + 0.1) * 1.5, 1);
        });

        this.stars.buildMeshAsync().then((mesh) => {
            this.starMesh = mesh;
            if (this.starMesh.material) {
                // Cast to standard material (or PBR) to access emissive and disableLighting
                const mat = this.starMesh.material as BABYLON.StandardMaterial;
                mat.emissiveColor = new BABYLON.Color3(1.5, 1.5, 1.5);
                mat.disableLighting = true;
            }
            this.starMesh.infiniteDistance = true;
            this.starMesh.renderingGroupId = 0; // Background
        });

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
    }

    public update(_deltaTime: number): void {
        this.updateCelestialPositions();

        // Rotate stars slowly
        if (this.starMesh) {
            this.starMesh.rotation.y += 0.0001;
        }
    }

    private updateCelestialPositions(): void {
        const timeOfDay = this.timeSystem.getTimeOfDayFraction();

        // Convert time to angle: 0.5 (noon) = sun at highest point
        // 0.0 or 1.0 (midnight) = sun below horizon
        // Shift so sunrise (0.25) is at 0
        const angle = (timeOfDay - 0.25) * 2 * Math.PI;

        // Calculate sun position (X-Y plane for now, standard orbit)
        const x = Math.cos(angle) * this.SUN_DISTANCE;
        const y = Math.sin(angle) * this.SUN_DISTANCE + this.SUN_HEIGHT_OFFSET;
        const z = 0;

        const sunPosition = new BABYLON.Vector3(x, y, z);

        // Update SkyMaterial Sun Position
        this.skyMaterial.useSunPosition = true;
        this.skyMaterial.sunPosition = sunPosition;

        // Determine Sun/Moon State
        const isDay = y > 0;

        // --- Sun Logic ---
        this.sunLight.direction = sunPosition.negate().normalize();

        const sunHeightRatio = Math.max(0, Math.min(1, y / this.SUN_DISTANCE));

        // Intensity fades out as sun sets
        this.sunLight.intensity = sunHeightRatio * 1.5; // Brighter sun
        this.sunLight.setEnabled(isDay || sunHeightRatio > 0.1);

        // Adjust Sun Color (warm at horizon)
        if (sunHeightRatio < 0.3) {
            const t = sunHeightRatio / 0.3;
            this.sunLight.diffuse = BABYLON.Color3.Lerp(
                new BABYLON.Color3(1, 0.4, 0.1), // Orange/Red
                new BABYLON.Color3(1, 0.95, 0.8), // Yellow-white
                t
            );
        }

        // --- Star Logic ---
        if (this.starMesh) {
            // Fade stars in when sun is below horizon (y < 0)
            // Full visibility at midnight (y lowest)
            // Start fading in at y < 10 (dusk)

            const starVisibility = 1.0 - Math.min(1, Math.max(0, (y + 10) / 30));
            this.starMesh.visibility = starVisibility;
        }

        // --- Moon Logic ---
        // Moon is opposite to sun
        const moonAngle = angle + Math.PI;
        const moonX = Math.cos(moonAngle) * this.SUN_DISTANCE;
        const moonY = Math.sin(moonAngle) * this.SUN_DISTANCE + this.SUN_HEIGHT_OFFSET;

        const moonPosition = new BABYLON.Vector3(moonX, moonY, z);
        this.moonLight.direction = moonPosition.negate().normalize();

        // Moon only active at night
        this.moonLight.setEnabled(!isDay);

        const moonHeightRatio = Math.max(0, Math.min(1, moonY / this.SUN_DISTANCE));
        this.moonLight.intensity = moonHeightRatio * 0.5; // Brighter moonlight

        // --- Ambient Logic ---
        // Adjust ambient based on time
        if (isDay) {
            this.ambientLight.intensity = 0.5 + sunHeightRatio * 0.2;
            this.ambientLight.diffuse = new BABYLON.Color3(0.6, 0.7, 0.8);
        } else {
            this.ambientLight.intensity = 0.5; // Brighter night ambient
            this.ambientLight.diffuse = new BABYLON.Color3(0.1, 0.1, 0.3); // Night blue
        }
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
     * Remove a mesh from casting shadows
     */
    public removeShadowCaster(mesh: BABYLON.AbstractMesh): void {
        this.shadowGenerator.removeShadowCaster(mesh);
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
            // Ignore skybox and ground
            return mesh.name !== "skyBox" &&
                mesh.name !== "ground" &&
                mesh.isVisible;
        });

        if (pickInfo && pickInfo.hit) {
            return 0; // In shadow
        }

        // Calculate intensity based on sun height
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
