import test from 'node:test';
import assert from 'node:assert/strict';
import {encode,wasmModule,search} from '../src/game/ai-wasm.ts';
import {newGame,isLegal} from '../src/game/engine.ts';

test('Wasm exposes finite connected-model scores for both perspectives',async()=>{
 const m=await wasmModule();
 const s=newGame(55);
 m.HEAP32.set(encode(s),m._pw_input()/4);
 const before=m._pw_model_score(0);
 assert(Number.isFinite(before));
 assert(Number.isFinite(m._pw_model_score(1)));
 s.players[0].buttons+=20;
 m.HEAP32.set(encode(s),m._pw_input()/4);
 assert.notEqual(m._pw_model_score(0),before);
});
test('model ranks eight root placements per patch and leather, retaining advance',async()=>{
 const m=await wasmModule(),s=newGame(55);s.players[0].buttons=100;
 m.HEAP32.set(encode(s),m._pw_input()/4);assert.equal(m._pw_search(0,1,3),1);
 let d=m.HEAP32.slice(m._pw_output()/4,m._pw_output()/4+10);
 assert(d[7]>25);assert.equal(d[8],1);assert.equal(d[9],25);
 s.pending=1;m.HEAP32.set(encode(s),m._pw_input()/4);m._pw_search(0,1,3);
 d=m.HEAP32.slice(m._pw_output()/4,m._pw_output()/4+10);
 assert.equal(d[7],81);assert.equal(d[8],1);assert.equal(d[9],8);
});
test('timed hard search actually uses the model and returns legal actions',async()=>{
 const s=newGame(55);const result=await search(s,'hard',22);
 assert(result.modelUsed);assert((result.modelEvaluations??0)>0);assert(isLegal(s,result.action));
});
