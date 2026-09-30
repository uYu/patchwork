#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node --experimental-strip-types scripts/generate-data.ts
em++ cpp/bridge.cpp -std=c++17 -O3 -msimd128 -fexceptions -sMODULARIZE=1 -sEXPORT_ES6=1 -sSINGLE_FILE=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sEXPORTED_RUNTIME_METHODS=HEAP32 -sEXPORTED_FUNCTIONS='["_pw_model_score","_pw_input","_pw_output","_pw_search","_pw_legal","_pw_step"]' -o src/game/wasm/patchwork.mjs
