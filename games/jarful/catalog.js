// JARFUL catalog: what can fall in, and what it falls into. Pure data (no three.js) so the physics bench can use it.
// Item sizes must match the collision bodies in sim.js shapeFor(); `vol` is the item's own volume (world units^3),
// used only to keep a jar from being asked to hold more than it can (the count itself always comes from the sim).

export const ITEMS = {
  gumball:  { name: 'gumballs',        one: 'gumball',        vol: 0.31,  rough: 0.32, metal: 0,    colors: ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#fb8c00', '#ec407a', '#f5f5f5', '#8e24aa'] },
  marble:   { name: 'marbles',         one: 'marble',         vol: 0.113, rough: 0.08, metal: 0.05, colors: ['#4fc3f7', '#81c784', '#e57373', '#ffb74d', '#ba68c8', '#4db6ac', '#fff176', '#90a4ae'] },
  pingpong: { name: 'ping-pong balls', one: 'ping-pong ball', vol: 0.59,  rough: 0.65, metal: 0,    colors: ['#f6f4ee', '#f6f4ee', '#f6f4ee', '#ff8a1e'], light: true },
  egg:      { name: 'chocolate eggs',  one: 'chocolate egg',  vol: 0.26,  rough: 0.28, metal: 0.45, colors: ['#e2b93b', '#c9ccd6', '#d83a3a', '#2f6fd6', '#8a3fc2', '#2e9e4f'] },
  bean:     { name: 'jelly beans',     one: 'jelly bean',     vol: 0.077, rough: 0.22, metal: 0,    colors: ['#d32f2f', '#ff9800', '#ffeb3b', '#8bc34a', '#2e9e4f', '#e91e63', '#9c27b0', '#8d5a3b', '#f5f5f5', '#2b2b2b'] },
  corn:     { name: 'candy corn',      one: 'candy corn',     vol: 0.13,  rough: 0.5,  metal: 0,    colors: ['#ffffff'], light: true },
  token:    { name: 'arcade tokens',   one: 'arcade token',   vol: 0.084, rough: 0.32, metal: 0.4,  colors: ['#e3b23c', '#e3b23c', '#cfd3da', '#c07a4a'] },
  die:      { name: 'dice',            one: 'die',            vol: 0.216, rough: 0.35, metal: 0,    colors: ['#f7f4ec', '#f7f4ec', '#d93030', '#2f6fe0', '#2e9e4f'], light: true },
  brick:    { name: 'toy bricks',      one: 'toy brick',      vol: 0.2,   rough: 0.3,  metal: 0,    colors: ['#d01b12', '#1a5fd0', '#f2cd37', '#237841', '#f4f4f4', '#fe8a18', '#2a3540'] },
  duck:     { name: 'rubber ducks',    one: 'rubber duck',    vol: 0.3,   rough: 0.38, metal: 0,    colors: ['#ffd21f', '#ffd21f', '#ffd21f', '#ffd21f', '#ffd21f', '#ff9ccf', '#8fd8ff'] },
  sweet:    { name: 'wrapped sweets',  one: 'wrapped sweet',  vol: 0.1,   rough: 0.15, metal: 0.15, colors: ['#e53935', '#8e24aa', '#1e88e5', '#43a047', '#fdd835', '#fb8c00', '#ec407a'] },
};
export const KINDS = Object.keys(ITEMS);

// R = bottom radius, top = rim radius (round); Rx/Rz = half width/depth (rect). H = rim height.
export const JARS = {
  cylinder: { name: 'jar',       R: 3,   top: 3,    H: 6 },
  box:      { name: 'glass cube', rect: true, Rx: 2.6, Rz: 2.6, H: 5.2 },
  beaker:   { name: 'beaker',    R: 2.7, top: 3.19, H: 6.6 },
  vase:     { name: 'tall vase', R: 2.0, top: 2.45, H: 8.2 },
  bowl:     { name: 'bowl',      R: 2.2, top: 4.4,  H: 3.4 },
  tank:     { name: 'fish tank', rect: true, Rx: 3.6, Rz: 1.9, H: 4.6 },
  mug:      { name: 'glass mug', R: 2.5, top: 2.5,  H: 4.6, handle: true },
};
export const JAR_TYPES = Object.keys(JARS);

export function jarVolume(j) { return j.rect ? 4 * j.Rx * j.Rz * j.H : Math.PI * j.H / 3 * (j.R * j.R + j.R * j.top + j.top * j.top); }
// roughly how many fit below the rim (random loose packing ~0.5 of the space)
export function capacity(jar, kind) { return Math.floor(jarVolume(JARS[jar]) * 0.5 / ITEMS[kind].vol); }
export const MAX_BODIES = 300;
