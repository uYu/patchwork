import type { HistoryEntry } from './history.ts';

// A placement lands first, then the pawn visits every crossed time square.
export function actionAnimationFrame(entry: HistoryEntry, elapsed: number, reduced = false) {
  const from = entry.before.players[entry.actor].time;
  const to = entry.after.players[entry.actor].time;
  const landing = entry.action.type === 'advance' ? 0 : 700;
  const travel = to === from ? 0 : Math.min(2400, Math.max(500, (to - from) * 130));
  const end = reduced ? 700 : landing + travel + 1100;
  const progress = reduced || !travel ? 1 : Math.max(0, Math.min(1, (elapsed - landing) / travel));
  return {
    landed: reduced || elapsed >= landing,
    time: from + (to - from) * progress,
    arrived: progress === 1,
    leaving: elapsed >= end - 200,
    done: elapsed >= end,
  };
}
