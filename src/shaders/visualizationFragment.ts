// Visualization shader for CustomProceduralTexture
// Converts simulation state to visual colors

export const visualizationFragmentShader = `
#ifdef GL_ES
precision highp float;
#endif

// Varyings from vertex shader
varying vec2 vUV;
varying vec2 vPosition;

// Uniforms
uniform sampler2D uSimulation;      // Current simulation state (R=Moisture, G=Nitrogen)
uniform float uOverlayEnabled;      // 1.0 if overlay mode, 0.0 otherwise

// --- Noise Functions ---
float hash(vec2 p) {
    p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
    return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float f = 0.0;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    f += 0.5000 * noise(p); p = m * p;
    f += 0.2500 * noise(p); p = m * p;
    f += 0.1250 * noise(p); p = m * p;
    f += 0.0625 * noise(p); p = m * p;
    return f;
}

void main() {
    vec4 state = texture2D(uSimulation, vUV);
    float moisture = state.r;
    float nitrogen = state.g;

    if (uOverlayEnabled > 0.5) {
        // --- HEATMAP MODE (Water Overlay) ---
        float normalized = moisture / 100.0;
        
        float r = normalized * 0.2;
        float g = normalized;
        float b = 0.78 + normalized * 0.21;
        
        gl_FragColor = vec4(r, g, b, 1.0);
    } else {
        // --- LIVING EARTH MODE ---
        
        // 1. Base Soil Color (Nitrogen Mix)
        // Low Nitrogen: Pale, dusty, sandy (Tan/Grey)
        vec3 dryPale = vec3(0.75, 0.65, 0.5); 
        // High Nitrogen: Rich, loam (Dark Chocolate Brown)
        vec3 richDark = vec3(0.25, 0.15, 0.1);
        
        // Smooth transition based on nitrogen (0-50 range for full richness)
        vec3 baseColor = mix(dryPale, richDark, smoothstep(0.0, 50.0, nitrogen));

        // 2. Grain / Texture (fBM Noise)
        // High frequency noise for soil grain (based on 50x50 world size)
        float noiseScale = 300.0; 
        float grain = fbm(vUV * noiseScale); // Result roughly -1.0 to 1.0

        // 3. Moisture Effects
        // Clamp moisture 0-100
        float wetness = smoothstep(0.0, 100.0, moisture);

        // Effect A: Smoothing
        // Wet soil gets muddy and smooths out the grain.
        // We reduce the grain amplitude as wetness increases.
        float effectiveGrain = mix(grain, 0.0, wetness * 0.7); 

        // Apply grain to base color
        // Modulating the base color by the grain intensity
        vec3 grainyColor = baseColor + (effectiveGrain) * 0.15;

        // Effect B: Darkening
        // Wet soil uses physically based darkening (porous darkening).
        // Simple approximation: darker albedo when wet.
        vec3 finalColor = grainyColor * mix(1.0, 0.6, wetness);

        gl_FragColor = vec4(finalColor, 1.0);
    }
}
`;
