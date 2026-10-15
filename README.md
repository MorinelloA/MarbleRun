# Marble Run Builder

Build marble runs on an iPad: drag tracks, loops, lifts, cannons, bells and bars onto the board, then drop marbles and watch them roll. It plays offline once installed to the Home Screen.

It is plain HTML, CSS and JavaScript modules with no build step. Physics is [Matter.js](https://brm.io/matter-js/) 0.20 (vendored in `vendor/`), sound is synthesized with Web Audio, and builds are saved in the browser's `localStorage`.

## Run it

Any static file server works. The one in `tools/` sends no-cache headers, so edits show up on reload:

```bash
python tools/devserver.py 8321
```

Then open <http://localhost:8321/>. To play on an iPad on the same network, add `--lan`; the server prints the address to open:

```bash
python tools/devserver.py 8321 --lan
```

Address flags:

| Flag | What it does |
|---|---|
| `?debug` | shows the frame-time HUD (the D key toggles it too) |
| `?test` | no animation loop and no start screen; `__mr.tick(n)` steps the game, for screenshots and checks |
| `?sw` | registers the offline service worker on localhost, where it is otherwise off |
| `#b=…` | a shared board (see Sharing) |

Keys: P pauses, R restarts the run.

## Test it

Node 22 or later; nothing to install.

```bash
node --test "tests/**/*.test.mjs"
```

```bash
node tests/sim/run.mjs --check --check-hash
```

The first runs the unit tests. The second runs every preset headlessly and checks two things: the preset's `expect` block (in `js/presets.js`), meaning what a run must do, such as reach every piece, never stall or leak, or fill both goal cups; and its golden trace, a hash of where every marble was, recorded in `tests/golden/`. The golden traces freeze the physics. If a change moves a marble by a hundredth of a pixel in any preset, the hash changes. Visual work must never touch the physics. A deliberate physics change needs its presets re-checked by eye and its goldens re-recorded:

```bash
node tests/sim/run.mjs --only fairshare --write-golden
```

`node tests/sim/scenario.mjs <preset> --svg out.svg` traces one run as an SVG, and `--layout file.json` runs a candidate layout instead of a preset.

Type checks run in editors through `jsconfig.json`. To run them on the command line, point any TypeScript 5.x or 6.x at it:

```bash
npx -p typescript tsc -p jsconfig.json
```

`lib` is capped at ES2021, so APIs newer than Safari 15 (such as `.at()` and `Object.hasOwn`) show up as errors.

## Deploy it

1. Restamp the service worker. It keeps every file for offline play under a version made from their contents, so any change gets installed fresh:

   ```bash
   node tools/stamp-sw.mjs
   ```

   `node tools/stamp-sw.mjs --check` fails if you forgot, and the unit tests fail if a file the game loads is missing from the list.

2. Copy the repository's files, except `tests/`, `tools/` and `.git`, to any static host. It works under a subpath, but link to it with a trailing slash (`/marblerun/`), because every path inside is relative.

3. Serve it over HTTPS. iPadOS needs HTTPS to install it to the Home Screen and to run the service worker.

The minimum is iPadOS 15 (Safari 15). The stage is a fixed 1133 by 744 points, iPad mini landscape, scaled to fit any screen inside its safe area.

## How it fits together

| Path | What's there |
|---|---|
| `js/pieces/catalog.js` | every piece type as data: its cells, its parts, and what each part does |
| `js/pieces/piece.js` | a placed piece: turns and mirrors the catalog's parts and builds their bodies |
| `js/behaviors.js` | what pieces do to marbles beyond bouncing: belts, cannons, loops, gates, flip-flops, goals |
| `js/world.js` | the Matter.js engine, marbles, and the collision events everything else listens to |
| `js/art/` | the toybox look: shapes, per-piece art, and drawing for the board, tray icons and previews |
| `js/render.js` | the board canvas: a cached layer of what doesn't move, and everything else each frame |
| `js/fx.js` | reactions (a bell rocking, a bar dipping) and pieces easing into place |
| `js/viewport.js` | fits the stage to the screen and picks the canvas resolution |
| `js/input.js` | touch and mouse: drag pieces, tap to turn or tune, hold to mirror, fling marbles |
| `js/save.js`, `js/share.js` | saved runs, autosave, backups and share links, all validated by `parseDoc` |
| `js/ui/` | toolbar, tray, start screen (and its toy), the runs dialog, toast and first-run tips |
| `js/audio/` | the synthesized sound |
| `tools/catalog-sheet.html` | every piece in every orientation, art with its physics outlines on top |
| `tools/icons.html` | draws the app icons |

Colours live in `js/theme.js`, mirrored by `css/style.css`. Tests hold them together and enforce no pink anywhere.

## Sharing

The runs dialog's "Share this board" makes a link that carries the whole board, five characters a piece, in the address's hash. Opening it loads the board, after backing up any unsaved build. Each piece type's letter in `js/share.js` is fixed for good, so old links keep working. A new piece takes a new letter.

## Notes for tonyt908.com

The site records this game with its own tools (`tools/record_walkthroughs.py` and `capture_screens.py` in that repository). They rely on:

- `window.__mr.loadPieces`;
- `#btn-marble`, `#btn-home` and `#btn-save`;
- `.splash-card` elements carrying each preset's name, and "Start Your Own";
- `#tray-items .tray-item` elements whose text is exactly the piece's name;
- `.slot-card.new-slot`;
- a tap on the sky at (50, 20) dropping a marble;
- cell centres at `22 + 64c + 32`, `58 + 64r + 32`.

Keep these working.

## Licences

Mona Sans is under the SIL Open Font License (`fonts/OFL.txt`); Matter.js is MIT.
