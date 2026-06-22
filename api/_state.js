/**
 * Shared in-memory state module.
 * When Vercel reuses the same warm Node.js instance, require() returns
 * the same singleton — so state set by /api/dedicate is readable in /api/nowplaying.
 */
module.exports = {
  /** @type {{nickname:string, recipient:string, message:string, songTitle:string}|null} */
  currentDedication: null,
  /** Epoch ms when dedication was last set */
  dedicationSetAt: 0,
};
