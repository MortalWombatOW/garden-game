# Work Log

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
