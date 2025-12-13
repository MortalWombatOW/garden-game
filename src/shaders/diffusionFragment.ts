// Diffusion shader for CustomProceduralTexture
// This shader runs the soil simulation step

export const diffusionFragmentShader = `
#ifdef GL_ES
precision highp float;
#endif

// Varyings from vertex shader
varying vec2 vUV;
varying vec2 vPosition;

// Uniforms
uniform sampler2D uPreviousState;   // Previous simulation state (R=Moisture, G=Nitrogen)
uniform sampler2D uInteraction;     // Interaction from CPU (R=Moisture Delta, G=Nitrogen Delta)
uniform float uDt;                  // Delta time
uniform float uDiffusionRate;       // Diffusion rate
uniform float uEvaporationRate;     // Evaporation rate
uniform float uRain;                // Rain intensity
uniform float uSunIntensity;        // Sun intensity for evaporation
uniform float uGridSize;            // Grid size (50.0)

// Constants
const float SATURATION = 100.0;
const float MAX_NITROGEN = 100.0;

void main() {
    vec2 uv = vUV;
    float pixelSize = 1.0 / uGridSize;

    // Read current state
    vec4 center = texture2D(uPreviousState, uv);
    float moisture = center.r;
    float nitrogen = center.g;

    // --- Diffusion (Laplacian) ---
    // Sample neighbors with clamped UVs
    vec2 uvN = uv + vec2(0.0, pixelSize);
    vec2 uvS = uv - vec2(0.0, pixelSize);
    vec2 uvE = uv + vec2(pixelSize, 0.0);
    vec2 uvW = uv - vec2(pixelSize, 0.0);

    vec4 n1 = texture2D(uPreviousState, clamp(uvE, 0.0, 1.0));
    vec4 n2 = texture2D(uPreviousState, clamp(uvW, 0.0, 1.0));
    vec4 n3 = texture2D(uPreviousState, clamp(uvN, 0.0, 1.0));
    vec4 n4 = texture2D(uPreviousState, clamp(uvS, 0.0, 1.0));

    // Laplacian diffusion
    float mDiff = (n1.r + n2.r + n3.r + n4.r) - 4.0 * moisture;
    float nDiff = (n1.g + n2.g + n3.g + n4.g) - 4.0 * nitrogen;

    moisture += mDiff * uDiffusionRate * uDt;
    nitrogen += nDiff * uDiffusionRate * uDt;

    // --- Interaction (CPU Inputs) ---
    vec4 interaction = texture2D(uInteraction, uv);
    moisture += interaction.r;
    nitrogen += interaction.g;

    // --- Rain ---
    if (uRain > 0.0) {
        moisture += uRain * 1.5 * uDt;
    }

    // --- Evaporation ---
    if (moisture > 0.0) {
        float evap = uEvaporationRate * uDt * uSunIntensity;
        moisture -= evap;
    }

    // --- Clamping ---
    moisture = clamp(moisture, 0.0, SATURATION);
    nitrogen = clamp(nitrogen, 0.0, MAX_NITROGEN);

    gl_FragColor = vec4(moisture, nitrogen, 0.0, 1.0);
}
`;
