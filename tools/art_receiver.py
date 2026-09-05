#!/usr/bin/env python3
"""美术接收器：只监听 127.0.0.1，接收浏览器里处理好的像素 PNG，写进 assets/art/ 并更新 manifest.json。

配合 Gemini 网页版使用（不需要 API key）：在 gemini.google.com 页面里生成图片后，
用注入的 JS 把图处理成最终尺寸的 PNG，再 POST 到这里。数据不经过文件下载，也不经过对话。

用法：python3 tools/art_receiver.py [端口，默认 8124]
接口：
  POST /upload   {"kind":"char"|"enemy"|"tile", "id":"warrior", "view":"down", "file":"char_warrior_down.png", "b64":"..."}
  GET  /status   已收到的文件清单
"""
import base64, json, os, re, sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART = os.path.join(ROOT, 'assets', 'art')
MANIFEST = os.path.join(ART, 'manifest.json')
SAFE = re.compile(r'^[A-Za-z0-9_]+\.png$')  # 只允许简单文件名，杜绝路径穿越


def load_manifest():
    if os.path.exists(MANIFEST):
        try: return json.load(open(MANIFEST))
        except ValueError: pass
    return {'characters': {}, 'enemies': {}, 'tiles': {}}


def register(m, kind, cid, view, fname):
    if kind == 'char': m['characters'].setdefault(cid, {})[view] = fname
    elif kind == 'enemy': m['enemies'][cid] = fname
    else: m['tiles'][cid] = fname


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        # Chrome 的 Private Network Access：公网页面访问本机服务需要这个头，否则预检就被拦掉
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.cors()
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_GET(self):
        files = sorted(f for f in os.listdir(ART) if f.endswith('.png')) if os.path.isdir(ART) else []
        self.reply(200, {'count': len(files), 'files': files, 'manifest': load_manifest()})

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n > 8 * 1024 * 1024: return self.reply(413, {'error': 'too large'})
            req = json.loads(self.rfile.read(n))
            fname, kind, cid = req['file'], req.get('kind', 'tile'), req.get('id', '')
            if not SAFE.match(fname): return self.reply(400, {'error': f'bad filename {fname}'})
            if kind not in ('char', 'enemy', 'tile'): return self.reply(400, {'error': f'bad kind {kind}'})
            data = base64.b64decode(req['b64'])
            if data[:8] != b'\x89PNG\r\n\x1a\n': return self.reply(400, {'error': 'not a PNG'})
            os.makedirs(ART, exist_ok=True)
            open(os.path.join(ART, fname), 'wb').write(data)
            m = load_manifest(); register(m, kind, cid, req.get('view', 'down'), fname)
            json.dump(m, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
            print(f'  ← {fname}  {len(data)} bytes')
            self.reply(200, {'ok': True, 'file': fname, 'bytes': len(data)})
        except Exception as e:
            self.reply(500, {'error': str(e)})

    def log_message(self, *a): pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    os.makedirs(ART, exist_ok=True)
    print(f'美术接收器已启动 http://127.0.0.1:{port}/  →  {ART}')
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
