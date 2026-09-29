import test from 'node:test';
import assert from 'node:assert/strict';
import { actionAnimationFrame } from '../src/game/animation.ts';
import { describeStep } from '../src/game/history.ts';
import { applyAction, legalActions, newGame } from '../src/game/engine.ts';

test('cloth lands before pawn movement; every frame stays within the actual move', () => {
  const before = newGame(1);
  const action = legalActions(before).find(a => a.type === 'buy')!;
  assert(action);
  const after = applyAction(before, action), entry = describeStep(before, action, after);
  const original = JSON.stringify(entry);
  assert.equal(actionAnimationFrame(entry, 699).landed, false);
  assert.equal(actionAnimationFrame(entry, 699).time, before.players[entry.actor].time);
  assert.equal(actionAnimationFrame(entry, 700).landed, true);
  let previous = before.players[entry.actor].time;
  for (let ms = 0; ms <= 5000; ms += 20) {
    const f = actionAnimationFrame(entry, ms);
    assert(f.time >= previous && f.time <= after.players[entry.actor].time);
    if (f.done) assert(f.arrived && f.landed);
    previous = f.time;
  }
  assert.equal(previous, after.players[entry.actor].time);
  assert.equal(JSON.stringify(entry), original);
});

test('long advance stops at 53 and leather never moves the pawn', () => {
  const before = newGame(2);
  before.players[1].time = 53;
  const action = {type:'advance'} as const;
  const entry = describeStep(before, action, applyAction(before, action));
  assert.equal(actionAnimationFrame(entry, 1200).time, 26.5);
  assert.equal(actionAnimationFrame(entry, 5000).time, 53);
  const leatherState = newGame(2); leatherState.pending = 1;
  leatherState.players[0].time = 20;
  const leather = {type:'leather', x:0, y:0} as const;
  const step = describeStep(leatherState, leather, applyAction(leatherState, leather));
  for (const ms of [0, 699, 700, 900, 5000]) assert.equal(actionAnimationFrame(step, ms).time, 20);
});

test('reduced motion presents the result briefly without delaying completion', () => {
  const before = newGame(3), action = {type:'advance'} as const;
  const entry = describeStep(before, action, applyAction(before, action));
  const initial = actionAnimationFrame(entry, 0, true);
  assert(initial.landed && initial.arrived && !initial.done);
  assert(actionAnimationFrame(entry, 700, true).done);
});
