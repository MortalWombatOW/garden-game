# Work Log

## 2025-12-15: Refine Background Boundaries

### Task
Add ground planes and horizon features to all background presets to make the world feel infinite and grounded.

### What Was Done
1.  **Updated `BackgroundSystem.ts`**:
    -   Added `createGround` method to generate a large static ground quad for each preset.
    -   **Forest**: Added dark green ground and a "Tree Wall" of giant trees at the horizon.
    -   **City**: Added concrete island, a surrounding ocean, and optimized building generation.
    -   **Desert**: Added sand ground and a ring of "Canyon Walls" (reddish cliffs) at the horizon.
    -   **Town**: Added grass ground and a ring of rolling green hills.
2.  **Performance**:
    -   Merged all horizon objects into single meshes.
    -   Applied `freezeWorldMatrix()` to all static background meshes to minimize CPU overhead.

### Files Modified
-   `src/systems/BackgroundSystem.ts`: Implemented ground and horizon logic.

### Lessons Learned
-   Using simple "walls" or "hills" at the horizon is a cheap and effective way to hide the void and create a sense of scale. Merging these meshes is critical for maintaining high frame rates.

## 2025-12-15: Adjustments
-   **Lighting**: Increased moon light intensity and night ambient light intensity to 0.5 for better night visibility.
-   **Boundaries**: Scaled up City and Town buildings/houses by 2-3x. Improved Town rolling hills with 5 layers of depth and adjusted height.

## 2025-12-15: Implement Stars at Night

### Task
Add a star field that appears at night to complement the procedural skybox.

### What Was Done
1.  **Implemented `PointsCloudSystem`**: Added a particle system in `LightingSystem.ts` to generate 2000 stars on a distant sphere.
2.  **Dynamic Visibility**: Added logic to fade the stars in as the sun goes below the horizon and fade them out at dawn.
3.  **Rotation**: Added a slow rotation to the star field to simulate the passage of time.
4.  **Brightness**: Boosted star brightness by 1.5x for better visibility.

### Files Modified
-   `src/systems/LightingSystem.ts`: Added star field logic.

### Lessons Learned
-   `PointsCloudSystem` is perfect for rendering thousands of simple dots efficiently. Casting materials to specific types (like `StandardMaterial`) is sometimes necessary to access properties like `disableLighting` when using TypeScript.

## 2025-12-15: Implement Procedural Skybox

### Task
Replace the static background color with a dynamic day/night skybox.

### What Was Done
1.  **Installed `@babylonjs/materials`**: Added dependency for `SkyMaterial`.
2.  **Updated `LightingSystem.ts`**:
    -   Replaced `sunMesh` and `moonMesh` spheres with `SkyMaterial`.
    -   Configured `SkyMaterial` to sync its `sunPosition` with the `TimeSystem`, handling atmospheric scattering automatically.
    -   Kept `DirectionalLight` logic for shadowing and terrain illumination, but removed manual sky color lerping.

### Files Modified
-   `src/systems/LightingSystem.ts`: Integrated `SkyMaterial`.
-   `package.json`: Added dependency.

### Lessons Learned
-   `SkyMaterial` handles the visual aspect of the sun (the disc in the sky) but not the actual lighting of the scene. You still need `DirectionalLight` for that, but you can sync them easily by position.

## 2025-12-14: Implement Backgrounds System

### Task
Add procedural background environments to fill the void beyond the garden fence.

### What Was Done
1.  **Created `BackgroundSystem`**:
    -   Implemented a system to generate instances of background scenery in a ring around the play area.
    -   Added 4 Presets: **Forest** (Trees), **City** (Skyscrapers), **Desert** (Cacti), **Town** (Houses).
    -   Each preset uses procedural placement logic (`getRandomPosition`) and merges meshes for performance.
2.  **Integrated into `main.ts`**:
    -   Added `BackgroundSystem` to the world.
    -   Added `B` key shortcut to cycle through background presets at runtime.

### Files Modified
-   `src/systems/BackgroundSystem.ts`: New file.
-   `src/main.ts`: Added system registration and key listener.

### Lessons Learned
-   Procedurally generating simple shapes (cubes, cylinders) allows for creating distinct visual identities without needing external assets. Merging meshes remains critical for performance when scattering 100+ objects.

## 2025-12-14: Implement Grandma's Yard Fence

### Task
Implement a world border that feels cozy and thematic, rather than an abstract void.

### What Was Done
1.  **Created `WorldBorderSystem`**:
    -   Procedurally generates a picket fence around the 50x50 map perimeter.
    -   Varies post and picket height based on the terrain using `Engine.getTerrainHeightAt`.
    -   Merges all fence meshes into a single `WorldBorderFence` mesh for performance.
2.  **Integrated into `main.ts`**:
    -   Added `WorldBorderSystem` to the ECS world.

### Files Modified
-   `src/systems/WorldBorderSystem.ts`: New file.
-   `src/main.ts`: Added system registration.

### Lessons Learned
-   Procedural placement of static objects (like fences) needs to respect the terrain height map to look grounded. merging meshes is crucial to keep draw calls low when generating hundreds of pickets.

## 2025-12-14: Implement Nitrogen Absorption and Inspect UI

### Task
Add water and nitrogen intake measures to the plant inspect overlay.

### What Was Done
1.  **Implemented Nitrogen Absorption Logic**:
    -   Updated `SoilSystem` with `absorbNitrogen()` method, mirroring the diffusion-based water absorption logic.
    -   Updated `GrowthSystem` to make plants consume nitrogen over time and absorb it from the soil.
    -   Added `lastNitrogenAbsorption` to `Needs` component to track intake rates.

2.  **Updated Inspect Tool**:
    -   Modified `InputSystem` to display "Water In" and "Nitro In" rates in the 3D inspect tooltip.
    -   This gives players immediate feedback on whether their plants are getting enough resources.

### Files Modified
-   `src/systems/SoilSystem.ts`: Added `absorbNitrogen`.
-   `src/systems/GrowthSystem.ts`: Added nitrogen consumption and absorption calls.
-   `src/components/Needs.ts`: Added `lastNitrogenAbsorption` field.
-   `src/systems/InputSystem.ts`: Added lines to the inspect tooltip.

### Lessons Learned
-   Reusing the `absorbWater` pattern for nitrogen made implementation quick and consistent.
-   Visualizing invisible simulation data (like absorption rates) significantly improves the feeling of a living ecosystem.
## 2025-12-14: Complete 3D Diegetic UI Migration

### Task
Fix the inspect tool and migrate remaining UI elements to 3D diegetic UI.

### What Was Done

1. **Fixed Inspect Tool**
   - Added missing `#tooltip` element to `index.html`
   - Replaced HTML tooltip with 3D floating tooltip panel in `DiegeticUISystem`
   - Updated `InputSystem` to use 3D tooltip for plant and soil inspection
   - Added nitrogen display to soil inspection tooltip

2. **Implemented Build Submenu**
   - Added 3D submenu that appears above the toolbar when Build tool is selected
   - Contains buttons for Lightpost 💡 and Hose 🚿 building types
   - Submenu properly shows/hides when switching tools
   - Fixed visibility by controlling individual mesh `.setEnabled()` instead of panel `isVisible`

3. **Added Overlay Toggle Buttons**
   - Created 3D toggle buttons in upper-right corner for:
     - 🌿 **Needs** - Plant satisfaction overlay
     - 💧 **Water** - Water/moisture overlay + graph
   - Buttons change color when active (green for needs, blue for water)
   - Keyboard shortcuts (O and P) still work alongside 3D buttons

4. **Fixed Toolbar Clicking**
   - Reverted `isPickable = false` on toolbar button meshes (GUI3DManager needs them pickable)
   - Updated `InputSystem` scene picking predicate to exclude 3D UI meshes from raycasting

### Files Modified
- `src/systems/DiegeticUISystem.ts` - Major additions for tooltips, submenus, overlay toggles
- `src/systems/InputSystem.ts` - 3D tooltip integration, picking predicate fix
- `src/main.ts` - Wiring for new systems
- `index.html` - Added tooltip element
- `src/style.css` - Tooltip styling (for fallback)

### Lessons Learned
- `StackPanel3D.isVisible` doesn't fully hide child mesh buttons - must control individual mesh visibility with `.setEnabled()`
- GUI3DManager requires meshes to be pickable to detect clicks, but scene raycasting can be filtered via predicate
- 3D tooltips work well with billboard mode for always-facing-camera text

## 2025-12-14: Fix Plant Inspection Tool

### Task
Fix the Inspect tool which was failing to detect plants and display information.

### What Was Done
1. **Fixed Picking**: Plants were difficult to click due to thin geometry. Added invisible hitbox cylinders to all plants in `RenderSystem` that are larger than the visual mesh, making them much easier to target.
2. **Fixed Filtering**: Updated `InputSystem` picking predicate to include meshes with `metadata.entityId`, ensuring the new hitboxes (and child meshes) are valid targets.
3. **Fixed Tooltip Visibility**: The 3D inspect tooltip was invisible due to back-face culling/orientation issues.
   - Enabled `sideOrientation: DOUBLESIDE` on the tooltip plane.
   - Set `renderingGroupId = 1` to ensure the tooltip always renders on top of world geometry.

### Files Modified
- `src/systems/InputSystem.ts`: Picking logic update.
- `src/systems/RenderSystem.ts`: Added plant hitboxes.
- `src/systems/DiegeticUISystem.ts`: Tooltip rendering fixes.

### Lessons Learned
- When using `BILLBOARDMODE_ALL` on a plane, orientation matters. `DOUBLESIDE` is safer to ensure visibility.
- For 3D UI elements that must not clip into the world, using `renderingGroupId` is a robust solution to force draw order.
