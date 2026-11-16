// The draft: every 5 levels the game pauses and offers 3 upgrades from a
// pool of 18, with one free reroll per draft and paid rerolls after that.
// Each upgrade mutates the player's derived stats; stacks are capped.
export const UPGRADE_POOL = [
  { id: 'bit', name: 'Sharper Bit', desc: '+40% drill damage', max: 3, icon: 'drill', apply: (s) => { s.drillDamage *= 1.4; } },
  { id: 'turbo', name: 'Turbo Drill', desc: '+25% drill speed', max: 3, icon: 'bolt', apply: (s) => { s.drillSpeed *= 1.25; } },
  { id: 'hull', name: 'Reinforced Hull', desc: '+30 max hull, heal 30', max: 3, icon: 'shield', apply: (s) => { s.maxHull += 30; s.heal = (s.heal ?? 0) + 30; } },
  { id: 'sinks', name: 'Heat Sinks', desc: '+40 max heat', max: 3, icon: 'snow', apply: (s) => { s.maxHeat += 40; } },
  { id: 'coolant', name: 'Coolant Loop', desc: '+60% heat dissipation', max: 3, icon: 'drop', apply: (s) => { s.heatCool *= 1.6; } },
  { id: 'magnet', name: 'Ore Magnet', desc: '+60% pickup radius', max: 3, icon: 'magnet', apply: (s) => { s.magnet *= 1.6; } },
  { id: 'boots', name: 'Swift Boots', desc: '+15% move speed', max: 3, icon: 'boot', apply: (s) => { s.moveSpeed *= 1.15; } },
  { id: 'satchel', name: 'Bomb Satchel', desc: '+3 max bombs, +3 bombs now', max: 3, icon: 'bomb', apply: (s) => { s.maxBombs += 3; s.bombs += 3; } },
  { id: 'bigbombs', name: 'Big Bombs', desc: '+50% bomb blast', max: 3, icon: 'blast', apply: (s) => { s.bombPower *= 1.5; } },
  { id: 'gemsense', name: 'Gem Sense', desc: '+50% gem drops', max: 3, icon: 'gem', apply: (s) => { s.gemLuck *= 1.5; } },
  { id: 'skin', name: 'Thick Skin', desc: '-20% damage taken', max: 3, icon: 'plate', apply: (s) => { s.armor *= 0.8; } },
  { id: 'secondwind', name: 'Second Wind', desc: 'Revive once at 50% hull', max: 1, icon: 'heart', apply: (s) => { s.revive = true; } },
  { id: 'reach', name: 'Long Reach', desc: 'Drill bites 2 tiles deep', max: 2, icon: 'reach', apply: (s) => { s.drillReach += 1; } },
  { id: 'plating', name: 'Lava Plating', desc: '-50% lava and heat damage', max: 2, icon: 'flame', apply: (s) => { s.lavaArmor *= 0.5; } },
  { id: 'adrenaline', name: 'Adrenaline', desc: '+20% speed and drill below 30% hull', max: 2, icon: 'pulse', apply: (s) => { s.adrenaline += 1; } },
  { id: 'lucky', name: 'Lucky Charm', desc: '+25% score', max: 3, icon: 'clover', apply: (s) => { s.scoreMult *= 1.25; } },
  { id: 'powerdrill', name: 'Power Drill', desc: '+100% drill damage to enemies', max: 2, icon: 'fist', apply: (s) => { s.enemyDrill *= 2; } },
  { id: 'frame', name: 'Sturdy Frame', desc: '-60% crush damage', max: 2, icon: 'anvil', apply: (s) => { s.crushArmor *= 0.4; } },
];

export function baseStats(difficulty) {
  return {
    drillDamage: 1,
    drillSpeed: 1,
    maxHull: difficulty.startHull,
    heal: 0,
    maxHeat: 100,
    heatCool: 1,
    magnet: 70,
    moveSpeed: 1,
    maxBombs: 5,
    bombs: 3,
    bombPower: 1,
    gemLuck: 1,
    armor: 1,
    revive: false,
    drillReach: 1,
    lavaArmor: 1,
    adrenaline: 0,
    scoreMult: difficulty.scoreMult,
    enemyDrill: 1,
    crushArmor: 1,
  };
}

/** Roll `count` distinct draft options, skipping upgrades at their cap. */
export function rollDraft(rand, owned, count) {
  const available = UPGRADE_POOL.filter((u) => (owned[u.id] ?? 0) < u.max);
  const options = [];
  const bag = available.slice();
  while (options.length < count && bag.length > 0) {
    const index = Math.floor(rand.next() * bag.length);
    options.push(bag.splice(index, 1)[0]);
  }
  return options;
}

export function applyUpgrade(stats, owned, upgrade) {
  owned[upgrade.id] = (owned[upgrade.id] ?? 0) + 1;
  upgrade.apply(stats);
  return stats;
}
