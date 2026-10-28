"""Rasterize a simplified HAUL icon to PNG (180/192/512) with no dependencies.
Mirrors site/icon.svg (512-unit design space). Usage: python3 -I tools/make_icons.py site
"""
import struct, sys, zlib, os

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def in_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]; xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

def in_rrect(x, y, x0, y0, w, h, r):
    if x < x0 or y < y0 or x > x0 + w or y > y0 + h: return False
    cx = min(max(x, x0 + r), x0 + w - r); cy = min(max(y, y0 + r), y0 + h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

SKY_T, SKY_B = hexc('#16325e'), hexc('#070b13')
PEAK_T, PEAK_B = hexc('#8ab4ff'), hexc('#2b4a80')
WHITE, BLUE, ROAD, AMBER, GLASS, DARK = hexc('#f2f5f9'), hexc('#4f8dff'), hexc('#0a0f18'), hexc('#fbbf24'), hexc('#bcd4ff'), hexc('#070b13')
MOUNT = [(28, 352), (170, 150), (234, 238), (286, 172), (484, 352)]
SNOW1 = [(170, 150), (136, 198), (156, 192), (170, 212), (186, 190), (206, 200)]
SNOW2 = [(286, 172), (260, 205), (276, 201), (288, 215), (302, 199), (316, 205)]
TRUCK = [(306, 320), (376, 320), (410, 360), (468, 360), (468, 400), (306, 400)]
GLASSP = [(376, 330), (384, 330), (420, 364), (376, 364)]
WHEELS = [(112, 402), (174, 402), (346, 402), (430, 402)]

def color_at(x, y, maskable):
    # Maskable icons need full-bleed background; others get rounded corners.
    if not maskable and not in_rrect(x, y, 0, 0, 512, 512, 112):
        return None
    c = lerp(SKY_T, SKY_B, y / 512)
    if in_poly(x, y, MOUNT): c = lerp(PEAK_T, PEAK_B, max(0, (y - 150) / 202))
    if in_poly(x, y, SNOW1) or in_poly(x, y, SNOW2): c = hexc('#eaf2ff')
    if y >= 398: c = ROAD
    if 446 <= y <= 456 and any(x0 <= x <= x0 + 70 for x0 in (40, 160, 280, 400)): c = AMBER
    if in_rrect(x, y, 44, 282, 226, 112, 12): c = WHITE
    if in_rrect(x, y, 58, 298, 198, 10, 5): c = BLUE
    if 270 <= x <= 310 and 367 <= y <= 377: c = WHITE
    if in_poly(x, y, TRUCK): c = BLUE
    if in_poly(x, y, GLASSP): c = GLASS
    for cx, cy in WHEELS:
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** .5
        if d <= 30.5: c = WHITE if d > 21.5 else DARK
    return c

def render(size, maskable):
    ss = 3
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + .5) / ss) * 512 / size
                    y = (py + (sy + .5) / ss) * 512 / size
                    if maskable:  # keep the art inside the 80% safe zone
                        x = (x - 256) / .82 + 256; y = (y - 256) / .82 + 256
                    c = color_at(x, y, maskable) if (0 <= x <= 512 and 0 <= y <= 512) else (lerp(SKY_T, SKY_B, min(1, max(0, y / 512))) if maskable else None)
                    if c is not None:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = ss * ss
            a = acc[3] // n
            if a:
                k = 255 * n / acc[3]
                row += bytes([int(acc[0] / n * k), int(acc[1] / n * k), int(acc[2] / n * k), a])
            else:
                row += b'\0\0\0\0'
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

if __name__ == '__main__':
    out = sys.argv[1]
    # Apple touch icon: full-bleed (iOS rounds corners itself).
    for size, name, mask in ((180, 'icon-180.png', True), (192, 'icon-192.png', True), (512, 'icon-512.png', True)):
        with open(os.path.join(out, name), 'wb') as f:
            f.write(render(size, mask))
        print('wrote', name)
