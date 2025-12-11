# 🌿 Verdant: A Cozy Garden Simulator

> **A scientifically-grounded gardening sandbox built with Babylon.js.**

  

## 📖 Vision & Design Philosophy

**Verdant** balances the relaxing atmosphere of a cozy game with the depth of a biological simulation. Players restore a barren plot of land into a thriving ecosystem by understanding the interplay between soil, sunlight, and hydration.

### The "Cozy-Complex" Balance

We draw inspiration from systems-heavy games (like *Rimworld*) but present data through a "fuzzy logic" lens to maintain immersion.

  * **Realistic Consequence:** Plants **will die** if their needs are ignored. There is a fail state.
  * **Qualitative Feedback:** We do not show spreadsheets.
      * *Avoid:* "Nitrogen Level: 14.5%."
      * *Adopt:* The leaves turn yellow, and the Inspector Tool reads "Soil is Nutrient Deficient."

### The Core Loop (Discovery & Restoration)

1.  **Analyze:** Use tools to inspect the environment (Shadow maps, Soil composition).
2.  **Plant & Amend:** Free-form placement of seeds. Modify soil (Compost, Mulch) to suit the species.
3.  **Simulate:** Watch the sun move and rain fall. Plants interact with the simulation buffers.
4.  **Observe & Catalog:** Plants may mutate based on conditions. Successful growth attracts procedural wildlife (bees, birds), restoring the ecosystem score.

-----

## 🛠 Technical Architecture

This project uses a custom Entity-Component-System (ECS) architecture to separate simulation logic from rendering.

### Tech Stack

  * **Engine:** [Babylon.js 7.0+](https://www.babylonjs.com/) (Targeting WebGPU with WebGL fallback)
  * **Language:** TypeScript
  * **Build Tool:** Vite
  * **State Management:** Custom ECS

### Systems Overview

#### 1\. The World Grid (Data Layer)

While the visuals are free-form, the simulation relies on a high-resolution 2D data texture (e.g., $1024 \times 1024$).

  * **SoilMesh:** A continuous mesh displaced by a height map.
  * **Simulation Texture:** A non-renderable texture where channels store data:
      * `R`: Moisture
      * `G`: Nitrogen
      * `B`: pH Level
      * `A`: Soil Density

#### 2\. The Plant Entity (ECS)

Plants are not standard GameObjects. They are data entities managed by a `ThinInstance` renderer for performance (1000+ plants).

  * **`TransformComponent`**: Float32 position $(x, y, z)$.
  * **`GeneticsComponent`**: Defines optimal ranges for Light/Water and mutation probability.
  * **`MetabolismComponent`**: Stores current accumulated energy and stress.
      * *Logic:* If `Stress > Threshold` for $N$ ticks $\rightarrow$ `State = DEAD`.

#### 3\. Environmental Systems

  * **SunlightSystem:** Calculates solar azimuth/elevation based on GameTime. Raycasts against the terrain to determine if a plant is in shadow.
  * **HydrationSystem:** Reduces soil moisture over time based on temperature. Increases moisture during `RainEvent`.

-----

## 📂 Project Structure

```text
src/
├── core/
│   ├── Engine.ts          # Babylon engine initialization
│   ├── GameLoop.ts        # Managing the Tick (Sim) vs Frame (Render)
│   ├── ECS.ts             # Base Entity, Component, System classes
│   └── SpatialHashGrid.ts # Spatial partitioning for placement queries
├── systems/
│   ├── GrowthSystem.ts    # Handles biological aging and death
│   ├── InputSystem.ts     # Raycasting, Tooltip, and Plant placement
│   ├── RenderSystem.ts    # Syncs ECS data to Babylon meshes
│   └── TimeSystem.ts      # Day/Night cycle and game-time logic
├── components/
│   ├── PlantState.ts      # Data: Age, Health, SpeciesID
│   ├── Needs.ts           # Data: Water, Sun, NPK buffers
│   └── TransformComponent.ts # Data: Position (x, y, z)
├── assets/
│   ├── meshes/            # glTF/GLB models (Seed, Sprout, Flower)
│   └── textures/          # Soil maps, UI icons
└── ui/
    └── ToolManager.ts     # Manages toolbar state and input modes
```

-----

## 🚀 Getting Started

### Prerequisites

  * Node.js (v18+)

### Installation

```bash
# Clone the repo
git clone [repo-url]

# Install dependencies
npm install

# Start the dev server
npm run dev
```

### Controls (Debug)

  * **1**: Select Plant Tool (🌱)
  * **2**: Select Inspect Tool (🔍)
  * **O**: Toggle Plant Satisfaction Overlay (🌿)
  * **Escape**: Deselect Tool
  * **Left Click**: Use Tool (Plant seed or Inspection placeholder)
  * **Hover**: Inspect plants/soil (in Inspect mode)
  * **Mouse Drag**: Pan Camera (Default FreeCamera)
  * **Scroll Wheel**: Zoom

-----

## 📅 MVP Roadmap

### Phase 1: The Potting Bench (Completed ✅)

  - [x] **Spatial Hash Grid**: Implement efficient querying for "free placement" to prevent overlapping plants.
  - [x] **The "Tick"**: Separate Render Loop (60fps) from Simulation Loop (10 ticks/sec).
  - [x] **Basic Death**: Implement logic where `Moisture < 0.1` results in the mesh changing color to brown.
  - [x] **Visual Feedback**: Implement a "Cursor Tool" that changes color based on valid/invalid planting spots.
  - [x] **UI & Tools**: Toolbar for planting/inspecting with tooltip feedback.

### Phase 2: Simulation Depth (Completed ✅)

  - [x] **Soil Texture Mapping**: Visual representation of wet vs. dry soil.
  - [x] **Growth Stages**: Swapping meshes from Sprout → Vegetative → Flowering.
  - [x] **UI Overlay**: "Qualitative" status labels (e.g., "Thirsty", "Happy", "Wilting") with toggle control.

-----

## 🎨 Asset Guidelines

  * **Style:** Low-poly but high-fidelity lighting (PBR).
  * **Palette:** Natural, earthy tones. High contrast for critical gameplay elements (e.g., Wilted plants should look distinctly different from healthy ones).
  * **Optimization:** All plant stages must share materials where possible to allow for `ThinInstance` batching.


  ## TODOs:
  - [] sun goes 360 degrees per day, casts shadows
  - [] add debug tooling with the babylon inspector
  - [] separate plant age into 2 parts: age and sunlit age
  - [] water view showing flow of water from soil to plants/evaporation
  - [] procedural generation of plants using L-systems and simplified genetics
  - [] streams + ponds (always 100% moisture), stone paths (always 0% moisture)
  - [] rain events
  - [] weather events (wind, snow, hail, etc.)
  - [] 3d terrain generation
  - [] procedural generation of soil
  - [] procedural generation of wildlife
  