# AGENTS.md — Architectural Contract & Enforcement Rules

This file is the permanent architectural contract for all AI agents and human engineers working on the **PĀNI** repository.
All agents working on this repository must read, understand, and strictly comply with the rules below.

---

## 1. Project Identity

```text
Project: PĀNI
Repository: paani
Tagline: one drop. infinite journeys.
```

**PĀNI** is a high-fidelity cinematic procedural WebGL experience following a single water drop through the water cycle and natural environment. Built with real-time physics, custom PBR and fluid shaders, and choreographed cinematic camera movements, PĀNI blends procedural simulation with narrative art direction.

---

## 2. Technology Stack

* **Language**: TypeScript 5.7+ (strict mode, ES2020 target)
* **Build & Dev**: Vite 6.2+
* **UI Shell**: React 18 + React DOM
* **3D & Rendering**: Three.js 0.186+ (Custom GLSL shaders, procedural mesh generation, dynamic water surface, caustics, volumetric god rays, terrain, foliage, quality tier management)
* **Animation & Choreography**: GSAP 3.12+ (Timeline choreography, camera easing, story state transitions)
* **Verification & Testing**: Puppeteer-core 25+ (Automated headless Chromium/Chrome visual inspection and lifecycle assertion)

---

## 3. Repository Structure

```text
paani/
├── src/                  # Runtime application code
│   ├── animation/        # Camera controllers & motion curves
│   ├── audio/            # Audio manager
│   ├── components/       # React overlay UI (ChoiceUI, CycleUI, DebugUI, etc.)
│   ├── core/             # Engine core (Experience, Renderer, Clock, QualityManager)
│   ├── data/             # Story graph & lifecycle definitions
│   ├── drop/             # Hero droplet physics, mesh, and camera tracking
│   ├── environment/      # Environment manager & scene backgrounds
│   ├── shaders/          # GLSL shaders (ocean, atmosphere, foliage, terrain, etc.)
│   ├── story/            # Story director & narrative state machine
│   ├── styles/           # CSS styles
│   ├── types/            # TypeScript type definitions
│   ├── water/            # Fluid interaction systems (Splash, Ripple, Foam, Bubble)
│   ├── webgl/            # WebGL pipeline & media management
│   └── world/            # 3D world elements (Ocean, Sky, Rainforest, Underwater)
│
├── public/               # Static runtime assets (environmental video & textures)
│   └── environments/
│
├── tests/                # Automated testing & verification
│   ├── verification/     # Executable verification and diagnostic test runners
│   └── test-results/     # Categorized test results, benchmarks, and screenshots
│       ├── phase-0-rendering/
│       ├── phase-1-ocean-atmosphere/
│       ├── phase-2-hero-drop/
│       ├── phase-3-drop-physics-camera/
│       ├── phase-4-underwater/
│       ├── phase-5-water-interaction/
│       ├── phase-6-rainforest/
│       ├── phase-7-canopy/
│       ├── phase-8-leaf-interaction/
│       ├── phase-9-leaf-slide/
│       ├── phase-10-drip/
│       ├── phase-11-puddle-impact/
│       ├── cinematic/    # 11-stage cinematic verification captures
│       ├── diagnostics/  # Regression tests and telemetry captures
│       └── archive/      # Historical inspection captures
│
├── docs/                 # Human-readable architectural and development documentation
│   └── ARCHITECTURE.md
│
├── scratch/              # Disposable temporary experiments ONLY
│
├── AGENTS.md             # This mandatory architectural contract
├── README.md             # Developer overview & quick start
├── package.json          # npm configuration & verification scripts
├── package-lock.json     # Dependency lockfile
├── tsconfig.json         # Application TypeScript config
├── tsconfig.node.json    # Vite tooling TypeScript config
├── vite.config.ts        # Vite build & dev server config
├── index.html            # Vite HTML entry point
└── .gitignore            # Git exclusion rules
```

---

## 4. Root Directory Rules

> **THE REPOSITORY ROOT IS NOT A DUMPING GROUND.**

Only files that genuinely belong at the repository root are permitted:
* `package.json`, `package-lock.json`
* `tsconfig.json`, `tsconfig.node.json`
* `vite.config.ts`
* `index.html` (Vite entry point)
* `README.md`, `AGENTS.md`
* `.gitignore` and essential tool configurations

**Never** save screenshots, test results, logs, temporary scripts, diagnostic dumps, browser captures, or experimental files to the repository root. Any agent violating this rule is considered malformed.

---

## 5. Testing Rules

1. **Test code placement**: All test runners, verification scripts, and diagnostic tools must live in `tests/verification/`.
2. **Test output placement**: All test output (screenshots, JSON metrics, performance logs) must be written under `tests/test-results/<phase-or-category>/`.
3. **Repository-relative paths**: Never use machine-specific absolute paths (e.g. `/home/...` or `C:\...`). Always derive paths using `path.resolve(process.cwd(), 'tests/test-results/...')`.
4. **Browser resolution**: Verification scripts must use `resolveBrowserExecutable()` from `tests/verification/browser_helper.mjs`. Never hardcode a single machine's browser path.
5. **No root output**: Verification scripts must never write to `./`, `./screenshots/`, `./test_results/`, or `./diag_results/`.

---

## 6. Screenshot & Test Result Rules

1. Never save screenshots to the repository root.
2. Never create arbitrary screenshot directories.
3. Screenshots must be routed into their corresponding phase directory:
   * 11-stage full lifecycle captures -> `tests/test-results/cinematic/`
   * Phase-specific captures -> `tests/test-results/phase-<N>-<name>/`
   * Pre-start & bug regression captures -> `tests/test-results/diagnostics/`
   * Historical / retired captures -> `tests/test-results/archive/`
4. Use deterministic, descriptive naming (e.g., `01_ocean_opening.png`, `qa_05_leaf_landing_1080p.png`).
5. Do not leave intermediate temporary files (e.g. `temp_*.png`) behind. Always capture directly to the destination.

---

## 7. Scratch Rules

* `scratch/` is reserved for temporary, disposable experiments only.
* Never build permanent infrastructure or production code inside `scratch/`.
* Remove obsolete experiment files after testing.
* Never treat `scratch/` as an unorganized dumping ground.

---

## 8. File Placement Mapping

When creating any new file, follow this exact classification:

| File Type | Allowed Destination | Forbidden Locations |
| :--- | :--- | :--- |
| Runtime TypeScript / React / Shaders | `src/<submodule>/` | Root, `tests/`, `scratch/` |
| Static assets (textures, videos, audio) | `public/` | Root, `src/`, `tests/` |
| Automated verification / test scripts | `tests/verification/` | Root, `scratch/`, `src/` |
| Generated test output / screenshots | `tests/test-results/<phase>/` | Root, `tests/`, `src/` |
| Project documentation | `docs/` | Root (except README & AGENTS) |
| Temporary one-off experiments | `scratch/` | Root, `src/`, `tests/` |
| Configuration / Manifest | Repository root | Subdirectories |

---

## 9. Modification Rules for Future Agents

1. **Inspect Before Acting**: Thoroughly audit existing architecture before creating or moving files.
2. **Prefer Existing Systems**: Do not create parallel systems, duplicate utilities, or redundant scripts. Modify and extend existing modules.
3. **No Root Pollution**: Never create new files in the repository root unless explicitly required for project-level tool configuration.
4. **Preserve Runtime Safety**: Do not modify rendering, shaders, physics, camera choreography, or story state during organizational or hygiene passes.
5. **Clean Up Temporary Artifacts**: Delete intermediate scratch files, logs, or debugging images before completing a task.
6. **No Machine-Specific Paths**: Absolute paths tied to a specific developer's machine (e.g., `/home/username`) are strictly banned.
7. **Document Architectural Changes**: Keep `docs/ARCHITECTURE.md` and `README.md` synchronized whenever interfaces or directory layouts change.
8. **Always Validate**: After making changes, run `npm run build` and `npm run test:cinematic` to prove functionality remains intact.

---

## 10. PĀNI Visual & Engineering Principles

PĀNI is an art-directed real-time experience. When writing or modifying runtime code:
* **Physical Plausibility**: Simulate fluid behavior (surface tension, menisci, viscous sliding, pinch-off, capillary ripples) with physical inspiration, even when stylized.
* **Cinematic Composition**: Keep camera framing intentional, respecting rule of thirds, depth of field, and aspect ratio adaptation (16:9 and 21:9 ultrawide).
* **Performance Budget**: Target stable 60 FPS on the ULTRA quality tier. Leverage GPU instancing, efficient uniforms, and lean geometry.
* **Deterministic Lifecycle**: Ensure state transitions (`OPENING` -> `REVEAL` -> `DESCENT` -> `IMPACT` -> `UNDERWATER` -> `RAINFOREST`) are rock-solid, reproducible, and immune to timing race conditions.
