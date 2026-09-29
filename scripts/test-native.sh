#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p .build
${CXX:-clang++} -std=c++17 -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer tests/native.cpp -o .build/test-native
.build/test-native
