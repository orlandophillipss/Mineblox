import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import { inCreativeTab, CREATIVE_TABS } from '../bridge/creative.js';
import { validateAction } from '../bridge/actions.js';
const registry = minecraftData('1.21.4');
test('creative categories separate foods, equipment, eggs and natural blocks using the negotiated registry', () => {
  for (const [name, tab] of [
    ['apple', 'food'],
    ['cooked_beef', 'food'],
    ['iron_pickaxe', 'tools'],
    ['bow', 'combat'],
    ['pig_spawn_egg', 'eggs'],
    ['azalea', 'natural'],
    ['red_wool', 'colored'],
    ['crafting_table', 'functional'],
    ['redstone', 'redstone'],
    ['stone_bricks', 'building'],
  ])
    assert.ok(
      inCreativeTab(registry.itemsByName[name], tab, registry),
      `${name} in ${tab}`,
    );
  assert.equal(
    inCreativeTab(registry.itemsByName.stone, 'food', registry),
    false,
  );
  assert.equal(
    inCreativeTab(registry.itemsByName.apple, 'building', registry),
    false,
  );
  for (const tab of CREATIVE_TABS)
    assert.doesNotThrow(() =>
      validateAction({
        kind: 'catalog',
        seq: 1,
        epoch: 1,
        query: '',
        offset: 0,
        tab,
      }),
    );
  assert.throws(() =>
    validateAction({
      kind: 'catalog',
      seq: 1,
      epoch: 1,
      query: '',
      tab: 'forged',
    }),
  );
});
