export interface Module { _pw_model_score(perspective:number):number; HEAP32: Int32Array; _pw_input(): number; _pw_output(): number; _pw_search(ms: number,limit: number,seed: number): number; _pw_legal(): number; _pw_step(type: number,piece: number,orientation: number,x: number,y: number): number }
export default function createModule(): Promise<Module>;
