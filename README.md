# PĀNI — one drop. infinite journeys.

> A real-time procedural WebGL journey following a single water drop through the water cycle and natural environment.

PĀNI is an art-directed 3D experience combining procedural fluid simulation, physical materials, raymarched atmospheric scattering, and choreographed camera cinematography. Users follow the intimate lifecycle of a water droplet — from hovering in the morning dawn mist over the open sea, plunging through the ocean surface into caustic depths, rising into canopy mists, sliding along the gutter of a rainforest leaf, to detach and splash into a forest floor puddle.

---

## 🌊 The Cinematic Journey

1. **Ocean Horizon Opening** — Endless procedural ocean swells at dawn with atmospheric fog and horizon lighting.
2. **Hero Drop Reveal** — Macro camera framing on a levitating water drop with internal caustic refraction.
3. **Hero Drop Descent** — Gravity acceleration and aerodynamic elongation as the droplet plunges earthward.
4. **Ocean Splash & Entry** — Surface meniscus deformation, crown splash lobes, and fluid merging.
5. **Underwater Submersion & Caustics** — Volumetric god rays, Snell's window, micro-bubbles, and optical scattering.
6. **Rainforest Shoreline Transition** — Journey from coastal ocean mist toward lush jungle terrain.
7. **High Canopy & Sunbeams** — Atmospheric sunbeams filtering through towering tree crowns.
8. **Hero Leaf Landing** — Elastic droplet impact, kinetic rebound, and surface tension adherence.
9. **Leaf Gutter Slide** — Viscous sliding motion down the curved central leaf spine.
10. **Drip Tip Detachment** — Droplet mass accumulation, elongation, pinch-off, and teardrop fall.
11. **Puddle Impact & Ripples** — Concentric capillary ripples, foam dispersal, and water cycle continuity.

---

## 🛠 Technology Stack

* **Rendering Engine**: [Three.js](https://threejs.org/) (r186) with custom GLSL shaders (PBR materials, volumetric godrays, Gerstner ocean waves, procedural terrain, caustics).
* **Application Framework**: [React 18](https://react.dev/) + [Vite 6](https://vitejs.dev/) with TypeScript 5.7.
* **Cinematics & Motion**: [GSAP 3](https://greensock.com/gsap/) for camera transitions and story choreography.
* **Automated Verification**: Headless Chromium / Chrome via [Puppeteer-Core](https://pptr.dev/) for deterministic visual regression and telemetry audits.

---

## 🚀 Getting Started

### Prerequisites

* Node.js 18+
* Google Chrome or Chromium (for running automated visual verification)

### Installation

```bash
git clone https://github.com/NyxLumen/paani.git
cd paani
npm install
```

### Development Mode

Start the Vite development server on port 3000:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

Type-check and bundle the application into `dist/`:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 🧪 Testing & Verification

PĀNI features an automated headless verification suite that exercises the real-time 3D simulation and captures deterministic screenshots:

```bash
# Run the complete 11-stage cinematic verification (Ultra tier, 1080p + 21:9 ultrawide)
npm run test:cinematic

# Run the detailed visual QA pass for rainforest environments
npm run test:qa

# Run the pre-start stability regression check (ensures zero premature phase leaps)
npm run test:prestart
```

All test outputs, captures, and performance benchmarks are saved under:
```text
tests/test-results/
├── cinematic/                  # 11-stage cinematic captures
├── phase-5-water-interaction/  # Splash, ripple, and foam captures
├── phase-6-rainforest/         # Canopy, leaf, and puddle captures
└── diagnostics/                # Pre-start stability & telemetry captures
```

---

## 📁 Repository Structure

```text
paani/
├── src/                  # Runtime application code
│   ├── animation/        # Camera controllers & motion curves
│   ├── audio/            # Spatial audio management
│   ├── components/       # React UI overlays
│   ├── core/             # Engine core (Experience, Renderer, QualityManager)
│   ├── data/             # Story graph & state definitions
│   ├── drop/             # WaterDrop physics & macro camera
│   ├── environment/      # Background environments & HDRI
│   ├── shaders/          # Custom GLSL vertex & fragment shaders
│   ├── story/            # Story director & narrative state machine
│   ├── water/            # Fluid interaction (Ripple, Splash, Foam, Bubble)
│   └── world/            # 3D environments (Ocean, Sky, Rainforest, Underwater)
├── public/               # Static runtime assets (textures & videos)
├── tests/
│   ├── verification/     # Executable verification test scripts
│   └── test-results/     # Categorized test results & screenshots
├── docs/                 # Architectural documentation
│   └── ARCHITECTURE.md
├── scratch/              # Temporary disposable experiments
├── AGENTS.md             # Architectural rules & contract for AI agents
└── README.md
```

---

## ⚙️ Quality Tiers

PĀNI dynamically adapts rendering fidelity via the `QualityManager` or debug controls:

* **LOW**: DPR 0.85, reduced water geometry subdivisions, simplified shaders, disabled caustics and foam.
* **MEDIUM**: DPR 1.0, balanced Gerstner wave complexity, standard shadow mapping.
* **HIGH**: DPR 1.25, full wave harmonics, active foam simulation, godrays, dynamic caustics.
* **ULTRA**: Native DPR, maximum wave detail, procedural terrain displacement, full water interaction lobes, 60+ FPS target.

Press <kbd>D</kbd> in development mode to toggle the live telemetry and quality control panel.

---

## 📜 Architectural Guidelines

For architectural rules, contributor guidelines, and directory enforcement policies, see [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
