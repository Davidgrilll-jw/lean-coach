"""Generate the PNG app icons (same artwork as icons/icon.svg) with the standard library only.

Usage:  python tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (0x14, 0x53, 0x2D)
LINE = (0xFF, 0xFF, 0xFF)
DOT = (0x86, 0xEF, 0xAC)
POINTS = [(120, 176), (216, 256), (296, 224), (392, 336)]  # on a 512 grid
STROKE = 18  # half of the stroke width
DOT_R = 34
SS = 3  # supersampling factor per axis


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def sample(x, y):
    ex, ey = POINTS[-1]
    if (x - ex) ** 2 + (y - ey) ** 2 <= DOT_R**2:
        return DOT
    for (ax, ay), (bx, by) in zip(POINTS, POINTS[1:]):
        if dist_to_segment(x, y, ax, ay, bx, by) <= STROKE:
            return LINE
    return BG


def render(size):
    scale = 512 / size
    rows = bytearray()
    for py in range(size):
        rows.append(0)  # PNG filter type: none
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    c = sample((px + (sx + 0.5) / SS) * scale, (py + (sy + 0.5) / SS) * scale)
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
            rows.extend(v // (SS * SS) for v in acc)
    return bytes(rows)


def chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def write_png(path, size):
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(render(size), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)
    print(f"wrote {path} ({len(png)} bytes)")


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for s in (180, 192, 512):
        write_png(out / f"icon-{s}.png", s)
