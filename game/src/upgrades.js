// The level-up choices: twelve upgrades, each with a name, a plain description,
// an icon key the renderer draws, a stack limit, and the change it makes to the
// player's modifiers. rollUpgrades deals three different ones the player can
// still take; Second Wind is rare, the rest are evenly dealt.

export const UPGRADES = [
  {
    id: 'swift-fins',
    name: 'Swift Fins',
    blurb: 'Swim 12% faster.',
    icon: 'fins',
    max: 5,
    apply(mods) {
      mods.speedMul *= 1.12;
    },
  },
  {
    id: 'rapid-glow',
    name: 'Rapid Glow',
    blurb: 'Shoot 18% faster.',
    icon: 'bolt',
    max: 5,
    apply(mods) {
      mods.fireMul *= 1.18;
    },
  },
  {
    id: 'bright-bolts',
    name: 'Bright Bolts',
    blurb: 'Bolts deal +1 damage.',
    icon: 'star',
    max: 5,
    apply(mods) {
      mods.damage += 1;
    },
  },
  {
    id: 'twin-lantern',
    name: 'Twin Lantern',
    blurb: 'Fire one extra bolt, fanned out.',
    icon: 'twin',
    max: 2,
    apply(mods) {
      mods.projectiles += 1;
    },
  },
  {
    id: 'long-reach',
    name: 'Long Reach',
    blurb: 'Bolts fly 30% faster and farther.',
    icon: 'reach',
    max: 3,
    apply(mods) {
      mods.bulletSpeedMul *= 1.3;
      mods.bulletLifeMul *= 1.3;
    },
  },
  {
    id: 'wide-net',
    name: 'Wide Net',
    blurb: 'Glimmers drift to you from 45% farther.',
    icon: 'net',
    max: 3,
    apply(mods) {
      mods.magnetMul *= 1.45;
    },
  },
  {
    id: 'sturdy-scales',
    name: 'Sturdy Scales',
    blurb: '+1 max heart, and heal 2 hearts.',
    icon: 'scales',
    max: 4,
    apply(mods, player) {
      player.maxHp += 1;
      player.hp = Math.min(player.maxHp, player.hp + 2);
    },
  },
  {
    id: 'quick-dash',
    name: 'Quick Dash',
    blurb: 'Dash recharges 25% faster.',
    icon: 'dash',
    max: 3,
    apply(mods) {
      mods.dashCooldownMul *= 0.75;
    },
  },
  {
    id: 'piercing-light',
    name: 'Piercing Light',
    blurb: 'Bolts pass through +1 foe.',
    icon: 'pierce',
    max: 3,
    apply(mods) {
      mods.pierce += 1;
    },
  },
  {
    id: 'glimmer-luck',
    name: 'Glimmer Luck',
    blurb: 'Bolts crit for double damage 15% of the time.',
    icon: 'luck',
    max: 3,
    apply(mods) {
      mods.critChance += 0.15;
    },
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    blurb: 'Revive once with 3 hearts when you fall.',
    icon: 'wind',
    max: 1,
    rare: true,
    apply(mods) {
      mods.revive = true;
    },
  },
  {
    id: 'reef-shield',
    name: 'Reef Shield',
    blurb: 'A shard orbits you and wounds foes it touches.',
    icon: 'shield',
    max: 2,
    apply(mods) {
      mods.shields += 1;
    },
  },
];

/** The player's starting modifiers; upgrades multiply or add to these. */
export function freshModifiers() {
  return {
    speedMul: 1,
    fireMul: 1,
    damage: 0,
    projectiles: 1,
    bulletSpeedMul: 1,
    bulletLifeMul: 1,
    magnetMul: 1,
    dashCooldownMul: 1,
    pierce: 0,
    critChance: 0,
    revive: false,
    shields: 0,
    stacks: {},
  };
}

/** Deal `count` different upgrades the player can still stack, shuffled. */
export function rollUpgrades(random, mods, count = 3) {
  const available = UPGRADES.filter((upgrade) => (mods.stacks[upgrade.id] ?? 0) < upgrade.max);
  const dealt = [];
  const pool = available.slice();
  while (dealt.length < count && pool.length > 0) {
    const index = Math.floor(random.next() * pool.length);
    const [upgrade] = pool.splice(index, 1);
    if (upgrade.rare && random.chance(0.5) && pool.length >= count - dealt.length) continue;
    dealt.push(upgrade);
  }
  return dealt;
}

/** Take an upgrade: count the stack and apply its effect. */
export function takeUpgrade(upgrade, mods, player) {
  mods.stacks[upgrade.id] = (mods.stacks[upgrade.id] ?? 0) + 1;
  upgrade.apply(mods, player);
}
