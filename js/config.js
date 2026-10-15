// @ts-check
// All game constants live here.

export const GAME_W = 1133;   // logical game size (iPad mini landscape CSS px)
export const GAME_H = 744;
export const TRAY_H = 110;
export const BOARD_W = GAME_W;
export const BOARD_H = GAME_H - TRAY_H;   // 634 — playfield canvas height

export const GRID = 64;
export const COLS = 17;
export const ROWS = 9;
export const GRID_X = Math.floor((BOARD_W - COLS * GRID) / 2); // 22
export const GRID_Y = BOARD_H - ROWS * GRID;                   // 58

export const MARBLE_R = 11;
export const MAX_MARBLES = 20;
// Matter measures velocity in px per 16.7 ms (its base frame), not per
// physics step: 18 is 9 px per 8.3 ms step, under a track's thickness.
export const SPEED_CLAMP = 18;
export const PHYS_DT = 1000 / 120;      // fixed physics sub-step, ms
export const MAX_SUBSTEPS = 4;
// Inside collision events a body's velocity is px per physics step, half
// the units of body.speed; these three are in those.
export const HIT_MIN_SPEED = 1.0;       // speed into a surface below which a knock is silent
export const BOUNCE_MIN_SPEED = 2.2;    // a bumper or bouncer sounds above this relative speed
export const CHIME_MIN_SPEED = 0.9;     // music pieces sound for slower marbles
export const FLOOR_Y = BOARD_H - 6;     // top of the physics floor

// Audio voice budgets
export const ROLL_VOICES = 8;
export const IMPACT_VOICES = 10;
export const CHIME_VOICES = 6;

// Rendering: canvas backing-store pixels per board pixel. The scale follows
// the screen (layout scale × devicePixelRatio) so the board maps 1:1 onto
// device pixels, capped to bound canvas memory on big displays. A device
// that can't hold 60 fps steps down toward RS_FLOOR.
export const RS_MAX = 2.5;
export const RS_FLOOR = 1.5;
