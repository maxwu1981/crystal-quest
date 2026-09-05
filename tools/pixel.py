#!/usr/bin/env python3
"""零依赖的 PNG 读写 + 像素处理（给 gen_art.py 用；不需要 Pillow）。
支持 8-bit 灰度/RGB/RGBA/调色板、非隔行 PNG。图像统一表示为 (w, h, bytearray RGBA)。"""
import struct, zlib

# ---------- PNG 解码 ----------
def decode_png(data):
    if data[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('不是 PNG')
    pos, idat, plte, trns = 8, [], None, None
    while pos < len(data):
        ln, ctype = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + ln]; pos += 12 + ln
        if ctype == b'IHDR': w, h, depth, ctype_i, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif ctype == b'PLTE': plte = body
        elif ctype == b'tRNS': trns = body
        elif ctype == b'IDAT': idat.append(body)
        elif ctype == b'IEND': break
    if depth != 8: raise ValueError(f'只支持 8-bit PNG（这张是 {depth}-bit）')
    if interlace: raise ValueError('不支持隔行 PNG')
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype_i]
    raw = zlib.decompress(b''.join(idat)); stride = w * ch
    out = bytearray(w * h * 4); prev = bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]; line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        _unfilter(f, line, prev, ch)
        o = y * w * 4
        if ctype_i == 6: out[o:o + w * 4] = line
        elif ctype_i == 2:
            for x in range(w): out[o + x * 4:o + x * 4 + 3] = line[x * 3:x * 3 + 3]; out[o + x * 4 + 3] = 255
        elif ctype_i == 0:
            for x in range(w): v = line[x]; out[o + x * 4:o + x * 4 + 4] = bytes((v, v, v, 255))
        elif ctype_i == 4:
            for x in range(w): v = line[x * 2]; out[o + x * 4:o + x * 4 + 4] = bytes((v, v, v, line[x * 2 + 1]))
        else:
            for x in range(w):
                i = line[x]; a = trns[i] if trns and i < len(trns) else 255
                out[o + x * 4:o + x * 4 + 4] = bytes((plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], a))
        prev = line
    return w, h, out

def _unfilter(f, line, prev, bpp):
    n = len(line)
    if f == 0: return
    if f == 1:
        for i in range(bpp, n): line[i] = (line[i] + line[i - bpp]) & 255
    elif f == 2:
        for i in range(n): line[i] = (line[i] + prev[i]) & 255
    elif f == 3:
        for i in range(n): line[i] = (line[i] + ((line[i - bpp] if i >= bpp else 0) + prev[i]) // 2) & 255
    elif f == 4:
        for i in range(n):
            a = line[i - bpp] if i >= bpp else 0; b = prev[i]; c = prev[i - bpp] if i >= bpp else 0
            p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    else: raise ValueError(f'未知滤波类型 {f}')

# ---------- PNG 编码 ----------
def encode_png(w, h, rgba):
    def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

# ---------- 处理 ----------
def chroma_key(w, h, px, key=(255, 0, 255), tol=90):
    """把接近 key 色（默认洋红）的像素变透明。"""
    kr, kg, kb = key
    for i in range(0, w * h * 4, 4):
        r, g, b = px[i], px[i + 1], px[i + 2]
        if abs(r - kr) < tol and abs(g - kg) < tol and abs(b - kb) < tol: px[i + 3] = 0
    return px

def alpha_bbox(w, h, px):
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[(y * w + x) * 4 + 3] > 0:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    return (x0, y0, x1 + 1, y1 + 1) if x1 >= 0 else (0, 0, w, h)

def fit_box(bbox, aspect, margin=0.04, anchor='bottom'):
    """把包围盒扩成指定宽高比（w/h）的框；anchor='bottom' 让脚贴底，'center' 居中。返回浮点 (x0,y0,x1,y1)。"""
    x0, y0, x1, y1 = bbox; bw, bh = x1 - x0, y1 - y0
    bw *= 1 + margin * 2; bh *= 1 + margin * 2
    if bw / bh < aspect: bw = bh * aspect
    else: bh = bw / aspect
    cx = (x0 + x1) / 2
    if anchor == 'bottom': by1 = y1 + (y1 - y0) * margin; by0 = by1 - bh
    else: cy = (y0 + y1) / 2; by0, by1 = cy - bh / 2, cy + bh / 2
    return cx - bw / 2, by0, cx + bw / 2, by1

def downscale(w, h, px, box, tw, th):
    """把源图 box=(x0,y0,x1,y1)（浮点）区域按面积平均缩到 tw×th，alpha 预乘避免洋红毛边。"""
    x0, y0, x1, y1 = box; out = bytearray(tw * th * 4)
    for ty in range(th):
        sy0 = max(0, int(y0 + (y1 - y0) * ty / th)); sy1 = min(h, max(sy0 + 1, int(y0 + (y1 - y0) * (ty + 1) / th)))
        for tx in range(tw):
            sx0 = max(0, int(x0 + (x1 - x0) * tx / tw)); sx1 = min(w, max(sx0 + 1, int(x0 + (x1 - x0) * (tx + 1) / tw)))
            r = g = b = a = n = 0
            for sy in range(sy0, sy1):
                base = sy * w * 4
                for sx in range(sx0, sx1):
                    i = base + sx * 4; pa = px[i + 3]
                    r += px[i] * pa; g += px[i + 1] * pa; b += px[i + 2] * pa; a += pa; n += 1
            o = (ty * tw + tx) * 4
            if a: out[o] = r // a; out[o + 1] = g // a; out[o + 2] = b // a
            out[o + 3] = a // n if n else 0
    return out

def posterize(px, levels=8):
    step = 255 / (levels - 1)
    lut = bytes(int(round(round(v / step) * step)) for v in range(256))
    for i in range(0, len(px), 4):
        px[i] = lut[px[i]]; px[i + 1] = lut[px[i + 1]]; px[i + 2] = lut[px[i + 2]]
    return px

def threshold_alpha(px, cut=128):
    for i in range(3, len(px), 4): px[i] = 255 if px[i] >= cut else 0
    return px

def outline(w, h, px, color=(27, 27, 47)):
    """给不透明区域外描一圈 1px 深色轮廓（像素画的关键特征）。"""
    src = bytes(px); r, g, b = color
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            if src[i + 3]: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[(ny * w + nx) * 4 + 3]:
                    px[i:i + 4] = bytes((r, g, b, 255)); break
    return px

def process_sprite(w, h, px, tw, th, anchor='bottom', key=True, add_outline=True):
    if key: chroma_key(w, h, px)
    box = fit_box(alpha_bbox(w, h, px), tw / th, anchor=anchor) if key else (0, 0, w, h)
    out = downscale(w, h, px, box, tw, th)
    posterize(out); threshold_alpha(out)
    if key and add_outline: outline(tw, th, out)
    return out
