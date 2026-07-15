# ODM Gear — a first-person grappling prototype

A browser prototype inspired by Attack on Titan's omni-directional mobility
gear: swing through a walled, half-timbered district on pendulum-physics
cables, manage your gas, and take down titans with a blade strike to the
nape. Built with Three.js — every texture and model is generated procedurally
in code (canvas-painted facades, faces, cobblestones). An original homage; no
assets or reproductions.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5174`) and click to deploy.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look |
| WASD | Move (walk) |
| Shift | Sprint |
| Space | Jump — while hooked near a rooftop it **vaults you onto the roof**, otherwise gas boost |
| Right mouse (hold) | Fire/hold **right hook** at the reticle |
| Q (hold) | Fire/hold **left hook** |
| W / S (while hooked) | Reel in hard / pay out rope |
| Left mouse | Blade slash |

## How to play

- The circular reticle marks a valid anchor (building, wall, or a titan's
  glowing nape) within range. Fire a hook and the cable becomes a fixed-length
  line — **gravity** does the swinging, so you start slow near the top of the
  arc, accelerate through the bottom, and coast up the far side, tracing a
  real curved pendulum path. Momentum carries between grapples: release
  mid-arc and you fly off on the tangent.
- **Hold W to reel in** — this is how you launch off the ground (reel up
  toward the anchor) and how you tighten an arc to gain speed. **S** pays out
  slack. Use both hooks for a stable V-shaped swing between rooftops.
- Everything costs **gas**: firing, holding, reeling, boosting. Run dry and
  the cables drop you. Blades dull after 6 swings.
- Stand in the green beacon ring in the plaza to refill gas, blades, health.
- Titans wander until they spot you, **stare for ~3 seconds**, then lumber in
  at walking pace. Getting grabbed hurts and flings you; at 0 HP you respawn
  at the supply point. They can only grab you near the ground — rooftops and
  cables are safe.
- **The signature kill:** hook a titan **anywhere on its body** (the reticle
  turns red on titan flesh). A cabled titan staggers and *cannot turn to face
  you*. Reel in with W, fly past, and slash — while attached, any hit near
  the nape at speed kills it. Without a cable you must strike the glowing
  nape from behind/beside. Clear all four to win.
- **Reaching rooftops:** hook a roof edge and either hold **W** to reel all
  the way up (you vault over the lip automatically) or press **Space** to
  vault onto the roof from up to ~24m out. Same-height roofs are one
  sprint-jump apart; taller tiers are one hook-vault away.

## Tuning

The feel lives in three constant blocks: `TUNE` in `src/player.js`
(gravity, ground/air movement), `OTUNE` in `src/odm.js` (winch, spring pull,
boost, gas costs), and `TTUNE` in `src/titans.js` (AI ranges, grab damage,
kill-speed gate).
