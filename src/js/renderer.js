/*
 * renderer.js — owns the WebGL2 context, the three.js renderer and the
 * main camera, and keeps the drawing buffer matched to the window and the
 * quality settings (render scale, pixel ratio cap, shadows).
 */
(function () {
  'use strict';

  const VH = window.VH;

  class Renderer {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.settings = settings;
      this.contextLost = false;
      this.renderer = null;
      this.camera = null;
      this.width = 1;
      this.height = 1;
    }

    /** Creates the WebGL2 renderer. Throws an Error with .code on failure. */
    init() {
      if (!VH.features.webgl2) {
        const err = new Error('WebGL2 is not available in this browser.');
        err.code = 'NO_WEBGL2';
        throw err;
      }
      const g = this.settings.data.graphics;
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          // With post-processing on, anti-aliasing happens in the HDR target instead.
          antialias: !!g.antialias && g.effects === 'low',
          powerPreference: 'high-performance',
          stencil: false,
          alpha: false,
          preserveDrawingBuffer: false,
        });
      } catch (err) {
        const e = new Error('The graphics context could not be created: ' + (err && err.message ? err.message : err));
        e.code = 'NO_WEBGL2';
        throw e;
      }
      this.antialiasAtStart = !!g.antialias;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.enabled = this.settings.shadowTier().enabled;
      // Reset by hand once per frame, so the counters cover the scene, its
      // shadows and every post-processing pass rather than just the last one.
      renderer.info.autoReset = false;
      this.renderer = renderer;
      this.maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      this.camera = new THREE.PerspectiveCamera(g.fov, 1, 0.1, g.drawDistance + 200);
      this.post = new VH.PostFX(this, this.settings);

      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.contextLost = true;
        VH.events.emit('renderer:contextlost', {});
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        VH.events.emit('renderer:contextrestored', {});
      });

      window.addEventListener('resize', () => this.resize());
      VH.events.on('settings:changed', (e) => {
        if (e.path === 'graphics' || e.path.startsWith('graphics.') || e.path === '*') {
          this.applySettings();
        }
      });
      this.resize();
    }

    applySettings() {
      const g = this.settings.data.graphics;
      this.renderer.shadowMap.enabled = this.settings.shadowTier().enabled;
      this.renderer.shadowMap.needsUpdate = true;
      this.camera.far = g.drawDistance + 200;
      this.camera.updateProjectionMatrix();
      this.resize();
    }

    pixelRatio() {
      const g = this.settings.data.graphics;
      const dpr = Math.min(window.devicePixelRatio || 1, g.maxPixelRatio || 1);
      return Math.max(0.35, dpr * (g.renderScale || 1));
    }

    resize() {
      if (!this.renderer) return;
      this.width = Math.max(1, window.innerWidth);
      this.height = Math.max(1, window.innerHeight);
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(this.width, this.height, false);
      if (this.post) {
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        this.post.setSize(size.x, size.y);
      }
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      VH.events.emit('renderer:resize', { width: this.width, height: this.height });
    }

    render(scene, dt) {
      if (this.contextLost) return;
      this.renderer.info.reset();
      if (this.post && this.post.enabled) this.post.render(scene, this.camera, dt);
      else this.renderer.render(scene, this.camera);
    }

    get postEnabled() {
      return !!(this.post && this.post.enabled);
    }

    /** Compile every shader in the scene up front so the first frames don't hitch. */
    async precompile(scene) {
      try {
        if (this.renderer.compileAsync) await this.renderer.compileAsync(scene, this.camera);
        else this.renderer.compile(scene, this.camera);
      } catch (err) {
        console.warn('[renderer] shader precompile failed, shaders will compile on first use', err);
      }
    }

    stats() {
      const info = this.renderer.info;
      const size = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(size);
      return {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs ? info.programs.length : 0,
        bufferWidth: size.x,
        bufferHeight: size.y,
        pixelRatio: this.renderer.getPixelRatio(),
      };
    }
  }

  VH.Renderer = Renderer;
})();
