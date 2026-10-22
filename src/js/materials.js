/*
 * materials.js — the handful of shared materials the whole city is drawn with.
 *
 * The building material is the interesting one. Windows are not textures:
 * the fragment shader draws them from each facade's window-grid coordinates
 * (aGrid) and style (aFacade), so they stay crisp at any distance, cost no
 * texture memory, fade to their average colour far away instead of
 * shimmering, and can light up individually at night (uWindowGlow).
 *
 * Facade styles (aFacade.z):
 *   -1 roof (gravel)     0 blank wall     1 punched windows
 *    2 curtain wall      3 ribbon windows 4 storefront glass
 */
(function () {
  'use strict';

  const VH = window.VH;

  /** Uniforms shared by several materials and driven by environment.js. */
  function createSharedUniforms() {
    return {
      uTime: { value: 0 },
      uWindowGlow: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uSkyZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
      uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
      uWind: { value: 1.0 },
    };
  }

  // ------------------------------------------------------------ building
  const BUILDING_VERTEX_PARS = /* glsl */ `
    attribute vec2 aGrid;
    attribute vec4 aFacade;
    varying vec2 vGrid;
    // flat: the facade parameters must not be interpolated. Even a constant
    // interpolates with rounding error, and the per-window hash below would
    // amplify that into per-pixel noise.
    flat varying vec4 vFacade;
    varying vec3 vWPos;
  `;

  const BUILDING_VERTEX_MAIN = /* glsl */ `
    vGrid = aGrid;
    vFacade = aFacade;
    vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  `;

  const BUILDING_FRAGMENT_PARS = /* glsl */ `
    uniform sampler2D uGrime;
    uniform sampler2D uGravel;
    uniform float uWindowGlow;
    varying vec2 vGrid;
    flat varying vec4 vFacade;
    varying vec3 vWPos;

    float vhHash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vhBand(float x, float lo, float hi, float aa) {
      return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x));
    }
  `;

  // Runs right after the vertex colour has been applied to diffuseColor.
  const BUILDING_FRAGMENT_SURFACE = /* glsl */ `
    float vhGlass = 0.0;
    float vhMirror = 0.0;
    float vhShop = 0.0;
    float vhLit = 0.0;
    vec3 vhLitColor = vec3(0.0);
    {
      float ww = vFacade.x;
      float wh = vFacade.y;
      float style = vFacade.z;
      float seed = floor(vFacade.w * 16.0 + 0.5) / 16.0;

      // World-space weathering so neighbouring buildings never repeat exactly.
      float grime = texture2D(uGrime, vec2(vWPos.x + vWPos.z, vWPos.y) * 0.09 + seed * 0.37).r;
      // Contact shadow where walls meet the ground (a cheap ambient occlusion).
      float ao = mix(0.6, 1.0, smoothstep(0.15, 3.0, vWPos.y));

      if (style < -0.5) {
        vec3 gravel = texture2D(uGravel, vWPos.xz * 0.25).rgb;
        diffuseColor.rgb *= gravel * 1.6;
      } else {
        diffuseColor.rgb *= mix(1.0, grime, 0.85) * ao;
      }

      if (ww > 0.0 && style > 0.5) {
        vec2 cell = floor(vGrid + 1e-4);
        vec2 f = fract(vGrid);
        vec2 fw = fwidth(vGrid);
        vec2 aa = max(fw * 0.7, vec2(0.002));

        float bottom = style > 3.5 ? 0.04 : (1.0 - wh) * 0.58;
        float mx = ww > 0.985 ? 1.0 : vhBand(f.x, 0.5 - ww * 0.5, 0.5 + ww * 0.5, aa.x);
        float my = vhBand(f.y, bottom, bottom + wh, aa.y);
        float m = mx * my;

        // Mullions: a thin frame between panes of curtain walls and ribbons.
        if (style > 1.5 && style < 3.5) {
          // Curtain walls split each bay in two; ribbons are framed at bay edges.
          float d = style > 2.5 ? min(f.x, 1.0 - f.x) : abs(f.x - 0.5);
          float mullion = 1.0 - smoothstep(0.012, 0.012 + aa.x * 1.5, d);
          m *= 1.0 - mullion * 0.9;
        }
        // Storefronts get a door-height transom bar.
        if (style > 3.5) {
          m *= 1.0 - (1.0 - smoothstep(0.012, 0.012 + aa.y * 1.5, abs(f.y - 0.72))) * 0.9;
        }

        // Far away, a window is smaller than a pixel: use its average coverage.
        float lod = smoothstep(0.22, 0.55, max(fw.x, fw.y));
        m = mix(m, ww * wh * 0.9, lod);

        float h1 = vhHash(cell + seed * 13.7);
        float h2 = vhHash(cell.yx * 1.31 + seed * 5.1);
        vec3 tint = mix(vec3(0.62, 0.78, 0.92), vec3(0.78, 0.74, 0.62), fract(seed * 7.13));
        vec3 glass;
        if (style > 1.5 && style < 2.5) {
          // Reflective curtain wall: a tinted mirror.
          glass = tint * mix(0.42, 0.55, h2);
          vhMirror = m;
        } else if (style > 3.5) {
          glass = vec3(0.07, 0.062, 0.055) * (0.7 + h2 * 0.6);
        } else {
          glass = mix(vec3(0.018, 0.026, 0.034), vec3(0.05, 0.055, 0.06), h2);
          // Some rooms have their blinds down.
          glass = mix(glass, vec3(0.34, 0.31, 0.27), step(0.86, h2) * (1.0 - lod));
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, m);
        vhGlass = m;

        float chance = style > 3.5 ? 0.92 : (style > 1.5 && style < 2.5 ? 0.5 : 0.36);
        vhLit = step(h1, chance) * m;
        vhLitColor = mix(vec3(1.0, 0.70, 0.40), vec3(0.72, 0.86, 1.0), step(0.72, h2)) * (0.55 + h1 * 0.9);
        if (style > 3.5) {
          vhLitColor = vec3(1.0, 0.86, 0.66) * 0.9;
          // Shops are lit inside during the day too: brighter under the ceiling
          // lights, falling off towards the floor, with faint shelf lines.
          float ceiling = smoothstep(0.1, 0.78, f.y);
          float shelves = 0.72 + 0.28 * step(0.35, fract(f.y * 5.0 + h2));
          vhShop = vhLit * (0.25 + 0.75 * ceiling) * shelves * (0.7 + 0.6 * h2);
          vhMirror = -m;  // negative marks shop glass: glossy, but not a mirror
        }
      }
    }
  `;

  function createBuildingMaterial(textures, shared) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.0,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGrime = { value: textures.grime };
      shader.uniforms.uGravel = { value: textures.gravel };
      shader.uniforms.uWindowGlow = shared.uWindowGlow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + BUILDING_VERTEX_PARS)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + BUILDING_VERTEX_MAIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + BUILDING_FRAGMENT_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + BUILDING_FRAGMENT_SURFACE)
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, vhMirror < 0.0 ? 0.2 : mix(0.16, 0.06, vhMirror), vhGlass);'
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.92, max(vhMirror, 0.0));'
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vhLitColor * (vhLit * uWindowGlow * 1.5 + vhShop * 0.11);'
        );
    };
    mat.customProgramCacheKey = () => 'vh-building-v1';
    return mat;
  }

  // ------------------------------------------------------------- foliage
  // Trees sway with the wind. Height above the instance origin scales the
  // motion so trunks stay planted; each tree gets its own phase.
  const SWAY_PARS = /* glsl */ `
    uniform float uTime;
    uniform float uWind;
  `;
  const SWAY_MAIN = /* glsl */ `
    #ifdef USE_INSTANCING
      vec3 vhOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float vhPhase = dot(vhOrigin.xz, vec2(0.13, 0.17));
      float vhH = max(transformed.y, 0.0);
      float vhBend = vhH * vhH * 0.0016 * uWind;
      transformed.x += sin(uTime * 1.3 + vhPhase) * vhBend + sin(uTime * 3.7 + vhPhase * 2.0 + transformed.z) * vhBend * 0.25;
      transformed.z += cos(uTime * 1.1 + vhPhase) * vhBend * 0.7;
    #endif
  `;

  function addSway(mat, shared, key) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uWind = shared.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + SWAY_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY_MAIN);
    };
    mat.customProgramCacheKey = () => key;
  }

  function createFoliageMaterial(shared) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    addSway(mat, shared, 'vh-foliage-v1');
    // The shadow pass needs the same sway or shadows would stand still.
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    addSway(depth, shared, 'vh-foliage-depth-v1');
    return { material: mat, depth };
  }

  // ------------------------------------------------------ ground surfaces
  // Roads, pavements, lawns and runway concrete get a matching normal map
  // (so the sun rakes across aggregate, joints and tufts) and a world-space
  // mottling term that breaks up the visible tiling of huge areas such as the
  // airport apron. Chained onto any onBeforeCompile already on the material.
  const GROUND_VERTEX_PARS = /* glsl */ `
    varying vec3 vhGP;
  `;
  const GROUND_VERTEX_MAIN = /* glsl */ `
    vhGP = (modelMatrix * vec4(transformed, 1.0)).xyz;
  `;
  const GROUND_FRAGMENT_PARS = /* glsl */ `
    uniform sampler2D uMacro;
    uniform vec3 uMacroAmt; // x: strength, y: warm/green shift, z: unused
    varying vec3 vhGP;
  `;
  const GROUND_FRAGMENT_MAIN = /* glsl */ `
    {
      float vhM = texture2D(uMacro, vhGP.xz * 0.0105).r * 0.6 + texture2D(uMacro, vhGP.xz * 0.043 + 0.31).r * 0.4;
      float vhD = (vhM - 0.5) * 2.0 * uMacroAmt.x;
      diffuseColor.rgb *= vec3(1.0 + vhD * (1.0 + uMacroAmt.y), 1.0 + vhD, 1.0 + vhD * (1.0 - uMacroAmt.y));
    }
  `;

  function addGroundMacro(mat, macroTex, amount, shift, key) {
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = function (shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      shader.uniforms.uMacro = { value: macroTex };
      shader.uniforms.uMacroAmt = { value: new THREE.Vector3(amount, shift, 0) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + GROUND_VERTEX_PARS)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + GROUND_VERTEX_MAIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GROUND_FRAGMENT_PARS)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + GROUND_FRAGMENT_MAIN);
    };
    mat.customProgramCacheKey = function () {
      return (prevKey ? prevKey.call(this) : '') + key;
    };
  }

  function applyGroundDetail(list, t) {
    const set = (names, normal, scale, macro, amount, shift) => {
      for (const n of names) {
        const mat = list[n];
        if (!mat) continue;
        if (normal) {
          mat.normalMap = normal;
          mat.normalScale = new THREE.Vector2(scale, scale);
        }
        if (macro) addGroundMacro(mat, macro, amount, shift, '|vh-ground-' + amount + '-' + shift);
        mat.needsUpdate = true;
      }
    };
    set(['road', 'asphaltTop'], t.asphaltN, 0.9, t.macro, 0.22, 0.0);
    set(['sidewalk'], t.sidewalkN, 0.8, t.macro, 0.12, 0.05);
    set(['plaza', 'plazaTop'], t.plazaN, 0.8, t.macro, 0.1, 0.05);
    set(['concrete'], t.concreteN, 0.8, t.macro, 0.2, 0.04);
    set(['grass', 'grassTop'], t.grassN, 0.7, t.macro, 0.3, -0.35);
  }

  // ---------------------------------------------------------- vegetation
  // Trees and palms: one atlas-textured, alpha-tested, double-sided material.
  //   * Leaf cards, fronds and bark share the atlas. Vertices whose V >= 100
  //     are bark: V = 100 * (barkIndex + 1) + localV, and the shader tiles that
  //     bark cell inside its own rectangle (textureGrad keeps mips seamless).
  //   * aFlex (0 trunk .. 1 leaf tip) drives gentle wind flutter on top of the
  //     whole-tree sway; the shadow pass uses the same code so shadows move.
  //   * Leaves glow a little when seen against the sun (cheap translucency).
  function barkTable(atlasInfo) {
    const rows = atlasInfo.barks.map((name) => {
      const r = atlasInfo.rect(name, 0);
      return `vec4(${r.u0.toFixed(6)}, ${r.v0.toFixed(6)}, ${(r.u1 - r.u0).toFixed(6)}, ${(r.v1 - r.v0).toFixed(6)})`;
    });
    return `const vec4 VH_BARK[${rows.length}] = vec4[${rows.length}](${rows.join(', ')});`;
  }

  const VEG_VERTEX_PARS = /* glsl */ `
    attribute float aFlex;
    uniform float uTime;
    uniform float uWind;
    varying vec3 vhWP;
  `;
  const VEG_SWAY = /* glsl */ `
    #ifdef USE_INSTANCING
      vec3 vhOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float vhPhase = dot(vhOrigin.xz, vec2(0.13, 0.17));
      float vhH = max(transformed.y, 0.0);
      float vhBend = vhH * vhH * 0.0014 * uWind;
      transformed.x += sin(uTime * 1.3 + vhPhase) * vhBend + sin(uTime * 3.7 + vhPhase * 2.0 + transformed.z) * vhBend * 0.2;
      transformed.z += cos(uTime * 1.1 + vhPhase) * vhBend * 0.7;
      float vhF = aFlex * uWind;
      float vhQ = transformed.x * 1.7 + transformed.z * 2.3 + transformed.y * 1.3 + vhPhase * 3.0;
      transformed += vec3(sin(uTime * 2.9 + vhQ), sin(uTime * 2.3 + vhQ * 1.3) * 0.5, cos(uTime * 2.6 + vhQ * 0.8)) * vhF * 0.11;
    #endif
  `;
  const VEG_VERTEX_WORLD = /* glsl */ `
    {
      vec4 vhW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        vhW = instanceMatrix * vhW;
      #endif
      vhWP = (modelMatrix * vhW).xyz;
    }
  `;

  function vegSampler(barks) {
    return /* glsl */ `
      ${barks}
      #ifdef USE_MAP
        vec4 sampledDiffuseColor;
        {
          vec2 vhDx = dFdx(vMapUv);
          vec2 vhDy = dFdy(vMapUv);
          if (vMapUv.y > 50.0) {
            float vhKk = floor(vMapUv.y / 100.0);
            vec4 vhCr = VH_BARK[int(clamp(vhKk - 1.0, 0.0, float(VH_BARK.length() - 1)))];
            vec2 vhLoc = vec2(vMapUv.x, vMapUv.y - 100.0 * vhKk);
            vec2 vhAuv = vhCr.xy + (0.012 + 0.976 * fract(vhLoc)) * vhCr.zw;
            sampledDiffuseColor = textureGrad(map, vhAuv, vhDx * vhCr.zw, vhDy * vhCr.zw);
          } else {
            sampledDiffuseColor = textureGrad(map, vMapUv, vhDx, vhDy);
          }
        }
        diffuseColor *= sampledDiffuseColor;
      #endif
    `;
  }

  function createVegetationMaterial(shared, atlas) {
    const barks = barkTable(VH.Textures.ATLAS);
    const alphaTest = 0.4;
    const mat = new THREE.MeshStandardMaterial({
      map: atlas, vertexColors: true, alphaTest, side: THREE.DoubleSide, roughness: 0.8, metalness: 0,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uWind = shared.uWind;
      shader.uniforms.uSunDir = shared.uSunDir;
      shader.uniforms.uSunColor = shared.uSunColor;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VEG_VERTEX_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VEG_SWAY)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + VEG_VERTEX_WORLD);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vhWP;\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;')
        .replace('#include <map_fragment>', vegSampler(barks))
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 vhV = normalize(vhWP - cameraPosition);
            float vhT = pow(max(dot(vhV, uSunDir), 0.0), 3.0) * smoothstep(0.02, 0.3, uSunDir.y);
            float vhLeaf = vMapUv.y > 50.0 ? 0.0 : 1.0;
            totalEmissiveRadiance += diffuseColor.rgb * uSunColor * vhT * 0.3 * vhLeaf;
          }`
        );
    };
    mat.customProgramCacheKey = () => 'vh-vegetation-v1';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest, side: THREE.DoubleSide });
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uWind = shared.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VEG_VERTEX_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VEG_SWAY);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', vegSampler(barks));
    };
    depth.customProgramCacheKey = () => 'vh-vegetation-depth-v1';
    return { material: mat, depth };
  }

  // --------------------------------------------------------------- water
  const WATER_VERTEX = /* glsl */ `
    #include <common>
    #include <fog_pars_vertex>
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

  const WATER_FRAGMENT = /* glsl */ `
    #include <common>
    #include <fog_pars_fragment>
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyZenith;
    uniform vec3 uSkyHorizon;
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    varying vec3 vWorld;

    // Sum of directional waves; returns the height gradient (d/dx, d/dz).
    vec2 wave(vec2 p, vec2 dir, float len, float amp, float speed, float t) {
      float k = 6.2831853 / len;
      float ph = dot(dir, p) * k + t * speed * k;
      return dir * (amp * k * cos(ph));
    }

    void main() {
      float t = uTime;
      vec2 p = vWorld.xz;
      float dist = length(cameraPosition - vWorld);
      vec2 g = vec2(0.0);
      g += wave(p, normalize(vec2(1.0, 0.25)), 23.0, 0.20, 1.6, t);
      g += wave(p, normalize(vec2(0.7, -0.7)), 11.0, 0.08, 1.2, t);
      g += wave(p, normalize(vec2(-0.3, 1.0)), 5.3, 0.035, 0.9, t);
      float near = exp(-dist / 90.0);
      g += wave(p, normalize(vec2(0.9, 0.5)), 1.9, 0.012, 0.7, t) * near;
      g += wave(p, normalize(vec2(-0.6, 0.8)), 1.1, 0.006, 0.6, t) * near;
      g *= mix(0.25, 1.0, exp(-dist / 450.0));

      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      float ndv = max(dot(N, V), 0.0);
      float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
      vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));
      float sd = max(dot(R, uSunDir), 0.0);
      vec3 spec = uSunColor * (pow(sd, 900.0) * 9.0 + pow(sd, 90.0) * 0.35) * smoothstep(-0.05, 0.1, uSunDir.y);
      float light = 0.25 + 0.75 * clamp(uSunDir.y + 0.1, 0.0, 1.0);
      vec3 body = mix(uDeep, uShallow, clamp(0.35 + g.x * 1.5, 0.0, 1.0)) * light;
      vec3 col = mix(body, sky, fres) + spec;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `;

  function createWaterMaterial(shared) {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDeep: { value: new THREE.Color(0x05323f) },
      uShallow: { value: new THREE.Color(0x167a86) },
    }]);
    uniforms.uTime = shared.uTime;
    uniforms.uSunDir = shared.uSunDir;
    uniforms.uSunColor = shared.uSunColor;
    uniforms.uSkyZenith = shared.uSkyZenith;
    uniforms.uSkyHorizon = shared.uSkyHorizon;
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      fog: true,
    });
  }

  // ------------------------------------------------------------- factory
  const Materials = {
    shared: null,
    list: {},

    create(textures) {
      const shared = (this.shared = createSharedUniforms());
      const t = textures;
      const std = (opts) => new THREE.MeshStandardMaterial(opts);
      const foliage = createFoliageMaterial(shared);

      this.list = {
        building: createBuildingMaterial(t, shared),
        road: std({ map: t.asphalt, roughness: 0.94, metalness: 0 }),
        markings: std({
          vertexColors: true, roughness: 0.72, metalness: 0,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
        }),
        sidewalk: std({ map: t.sidewalk, vertexColors: true, roughness: 0.9, metalness: 0 }),
        plaza: std({ map: t.plaza, vertexColors: true, roughness: 0.85, metalness: 0 }),
        grass: std({ map: t.grass, vertexColors: true, roughness: 1.0, metalness: 0 }),
        concrete: std({ map: t.concrete, vertexColors: true, roughness: 0.92, metalness: 0 }),
        wood: std({ map: t.wood, vertexColors: true, roughness: 0.85, metalness: 0 }),
        // Painted details that sit on top of a surface (parking bays, pad markings).
        decal: std({
          vertexColors: true, roughness: 0.8, metalness: 0,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
        }),
        // Overlays lie exactly on another surface (a lawn on a pavement slab, a
        // car park, plaza paving). Polygon offset makes them win the depth test
        // at every distance, so they never flicker the way a small height gap would.
        grassTop: std({ map: t.grass, vertexColors: true, roughness: 1.0, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
        plazaTop: std({ map: t.plaza, vertexColors: true, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
        asphaltTop: std({ map: t.asphalt, vertexColors: true, roughness: 0.94, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
        prop: std({ vertexColors: true, roughness: 0.55, metalness: 0.25 }),
        propMatte: std({ vertexColors: true, roughness: 0.9, metalness: 0 }),
        foliage: foliage.material,
        foliageDepth: foliage.depth,
        // Street-lamp bulbs: dim by day, bright at night (environment.js sets the colour).
        lampGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.55, 0.45) }),
        // Traffic-signal lamps take their colour per instance (props.js).
        signalLamp: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        // Red aircraft-warning lights on masts.
        beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.02, 0.02) }),
        water: createWaterMaterial(shared),
        fountainWater: (() => {
          const m = createWaterMaterial(shared);
          m.polygonOffset = true;
          m.polygonOffsetFactor = -1;
          m.polygonOffsetUnits = -2;
          return m;
        })(),
        emissiveScreen: new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      };
      applyGroundDetail(this.list, t);
      if (t.vegAtlas) {
        const veg = createVegetationMaterial(shared, t.vegAtlas);
        this.list.vegetation = veg.material;
        this.list.vegetationDepth = veg.depth;
      }
      return this.list;
    },

    get(key) {
      return this.list[key];
    },
  };

  VH.Materials = Materials;
})();
