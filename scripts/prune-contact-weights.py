#!/usr/bin/env python3
"""Drop hidden units with negligible output weights from the trained model."""

import argparse
import hashlib
import re
from pathlib import Path


def read_array(source: str, name: str) -> list[str]:
    match = re.search(
        rf"inline constexpr float {name}\[(\d+)\] = \{{(.*?)\}};",
        source,
        re.DOTALL,
    )
    if match is None:
        raise ValueError(f"missing {name} array")
    values = re.findall(r"[-+]?\d*\.?\d+(?:e[-+]?\d+)?f", match.group(2))
    if len(values) != int(match.group(1)):
        raise ValueError(f"invalid {name} array length")
    return values


def write_array(name: str, values: list[str]) -> str:
    lines = [f"inline constexpr float {name}[{len(values)}] = {{"]
    for offset in range(0, len(values), 8):
        lines.append("  " + ", ".join(values[offset : offset + 8]) + ",")
    return "\n".join(lines + ["};"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="unpruned ContactWeights.hpp")
    parser.add_argument("output", type=Path, help="pruned ContactWeights.hpp")
    args = parser.parse_args()

    raw = args.source.read_bytes()
    source = raw.decode("utf-8")
    arrays = {name: read_array(source, name) for name in ("cw", "cb", "w", "b", "v", "o")}
    width = len(arrays["v"])
    if width != 64 or len(arrays["b"]) != width or len(arrays["w"]) != 733 * width:
        raise ValueError("expected the original 733 × 64 model")
    retained = [index for index, value in enumerate(arrays["v"]) if abs(float(value[:-1])) >= 1e-30]
    if len(retained) != 36:
        raise ValueError(f"expected 36 retained units, got {len(retained)}")

    arrays["w"] = [arrays["w"][row * width + column] for row in range(733) for column in retained]
    arrays["b"] = [arrays["b"][column] for column in retained]
    arrays["v"] = [arrays["v"][column] for column in retained]
    digest = hashlib.sha256(raw).hexdigest()
    header = [
        "#pragma once",
        "// Connected-placement ranker, pruned from the 64-unit trained model.",
        f"// Original ContactWeights.hpp SHA256: {digest}",
        "// Hidden units with |output weight| < 1e-30 were removed.",
        "namespace contactwide { namespace weights {",
    ]
    body = [write_array(name, arrays[name]) for name in ("cw", "cb", "w", "b", "v", "o")]
    args.output.write_text("\n".join(header + body + ["}}", ""]), encoding="utf-8")
    print(f"retained {len(retained)}/{width} hidden units; SHA256 {digest}")


if __name__ == "__main__":
    main()
