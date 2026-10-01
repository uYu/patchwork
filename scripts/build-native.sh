#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p bin
${CXX:-c++} -std=c++17 ${AI_CXXFLAGS:--O3} cpp/server.cpp -o bin/patchwork-ai
