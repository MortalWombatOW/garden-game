# Work Log

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
