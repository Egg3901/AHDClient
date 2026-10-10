import struct, sys, zlib
# Centre of the tallest run of rows that are mostly Discord blue,
# from a screencap PNG (8-bit RGB/RGBA, non-interlaced). Prints "x y" or nothing.
def rows(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat = 8, b''
    while pos < len(data):
        n, kind = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b'IHDR':
            w, h, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif kind == b'IDAT':
            idat += body
        pos += 12 + n
    if depth != 8 or interlace or color not in (2, 6):
        return w, []
    bpp = 4 if color == 6 else 3
    raw, stride, prev, out = zlib.decompress(idat), w * bpp, bytearray(w * bpp), []
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b, c = prev[i], prev[i - bpp] if i >= bpp else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out.append(line); prev = line
    return w, [(l, bpp) for l in out]
w, img = rows(sys.argv[1])
x = w // 2
best, start = (0, 0), None
for y, (line, bpp) in enumerate(img + [(None, 0)]):
    # A third of the row is blue: the label text covers part of it.
    blue = line is not None and sum(
        1 for i in range(0, w * bpp, bpp)
        if line[i + 2] > 170 and line[i] < 90 and 50 < line[i + 1] < 130) > w // 3
    if blue and start is None: start = y
    if not blue and start is not None:
        if y - start > best[1] - best[0]: best = (start, y)
        start = None
if best[1] - best[0] >= 12:
    print(x, (best[0] + best[1]) // 2)
