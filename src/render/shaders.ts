/**
 * GLSL ES 3.0 shaders for chunk meshes. One shader handles flat colors and
 * textures, layer clipping and highlighting, block-type highlighting, the
 * ghost (semi-transparent) style and optional block grid lines.
 */

export const chunkVertexShader = /* glsl */ `
precision highp float;
precision highp int;

in uvec3 aData;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 uWorldToLocal;

out vec3 vLocal;
out vec2 vUv;
out float vShade;
flat out uint vApp;
flat out uint vPal;
flat out uint vNormal;

const float FACE_SHADE[7] = float[7](0.5, 1.0, 0.8, 0.8, 0.62, 0.62, 0.9);
const float AO_LEVEL[4] = float[4](0.45, 0.65, 0.82, 1.0);

void main() {
  uint w0 = aData.x;
  uint w1 = aData.y;
  vec3 p = vec3(float(w0 & 1023u), float((w0 >> 10u) & 1023u), float((w0 >> 20u) & 1023u)) / 16.0;
  uint ao = w0 >> 30u;
  uint n = w1 & 7u;
  uint explicitUv = (w1 >> 3u) & 1u;
  uint rot = (w1 >> 4u) & 3u;
  uint uvp = (w1 >> 6u) & 1023u;
  vApp = w1 >> 16u;
  vPal = aData.z & 65535u;
  vNormal = n;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vLocal = (uWorldToLocal * world).xyz;

  vec2 uv;
  if (explicitUv == 1u) {
    uv = vec2(float(uvp & 31u), float(uvp >> 5u)) / 16.0;
  } else {
    // Automatic UVs projected from the position (in blocks), matching the
    // standard resource pack orientation; repeats across merged faces.
    if (n == 0u) uv = vec2(p.x, -p.z);
    else if (n == 1u) uv = vec2(p.x, p.z);
    else if (n == 2u) uv = vec2(-p.x, -p.y);
    else if (n == 3u) uv = vec2(p.x, -p.y);
    else if (n == 4u) uv = vec2(p.z, -p.y);
    else uv = vec2(-p.z, -p.y);
  }
  for (uint i = 0u; i < rot; i++) uv = vec2(-uv.y, uv.x);
  vUv = uv;
  vShade = FACE_SHADE[n] * AO_LEVEL[ao];
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const chunkFragmentShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;

in vec3 vLocal;
in vec2 vUv;
in float vShade;
flat in uint vApp;
flat in uint vPal;
flat in uint vNormal;

uniform sampler2D uApp;          // 2 texels per appearance: color, flags
uniform sampler2DArray uTex;     // one layer per appearance
uniform sampler2D uHighlight;    // 1 texel per palette id
uniform bool uTextured;
uniform bool uHighlightOn;
uniform int uAxis;
uniform float uMin;
uniform float uMax;
uniform float uCur;
uniform float uNext;
uniform bool uDimBelow;
uniform bool uHiCur;
uniform bool uHiNext;
uniform float uAlpha;
uniform bool uGrid;
uniform float uTranslucentPass;

out vec4 outColor;

const vec3 NORMALS[7] = vec3[7](
  vec3(0.0, -1.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, -1.0), vec3(0.0, 0.0, 1.0),
  vec3(-1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), vec3(0.0)
);

void main() {
  vec3 nrm = NORMALS[vNormal];
  vec3 bp = floor(vLocal - nrm * 0.01);
  float lc = uAxis == 0 ? bp.x : (uAxis == 1 ? bp.y : bp.z);
  if (lc < uMin - 0.5 || lc > uMax + 0.5) discard;

  ivec2 ac = ivec2(int(vApp % 256u) * 2, int(vApp / 256u));
  vec4 c = texelFetch(uApp, ac, 0);
  bool hasTex = texelFetch(uApp, ac + ivec2(1, 0), 0).r > 0.5;
  bool translucent = uTranslucentPass > 0.5;
  if (uTextured && hasTex) {
    c = texture(uTex, vec3(vUv, float(vApp)));
    // Low threshold: cut-out holes are fully transparent, while semi-transparent
    // textures drawn as solid (slime, honey) must keep all their pixels.
    if (!translucent && c.a < 0.1) discard;
    if (!translucent) c.a = 1.0;
  } else if (!translucent) {
    // Flat colors: keep the silhouette of cut-out textures (plants, rails, panes).
    if (hasTex && texture(uTex, vec3(vUv, float(vApp))).a < 0.1) discard;
    c.a = 1.0;
  }
  if (translucent && c.a < 0.02) discard;
  c.rgb *= vShade;

  if (uDimBelow && lc < uCur - 0.5) c.rgb = mix(c.rgb, vec3(0.08, 0.09, 0.11), 0.62);
  if (uHiCur && abs(lc - uCur) < 0.5) c.rgb = mix(c.rgb, vec3(1.0), 0.08);
  if (uHiNext && abs(lc - uNext) < 0.5) c.rgb = mix(c.rgb, vec3(0.25, 0.75, 1.0), 0.45);

  if (uHighlightOn) {
    float h = texelFetch(uHighlight, ivec2(int(vPal % 256u), int(vPal / 256u)), 0).r;
    if (h > 0.5) c.rgb = mix(c.rgb, vec3(1.0, 0.82, 0.2), 0.55);
    else c.rgb *= 0.35;
  }

  if (uGrid) {
    vec3 f = fract(vLocal);
    vec2 g = vNormal < 2u ? f.xz : (vNormal < 4u ? f.xy : f.zy);
    vec2 d = min(g, 1.0 - g);
    vec2 w = vec2(0.035);
    if (vNormal < 6u && (d.x < w.x || d.y < w.y)) c.rgb *= 0.5;
  }

  c.a *= uAlpha;
  outColor = c;
}
`;
