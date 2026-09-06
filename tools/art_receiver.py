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
MASTER = os.path.join(ART, 'master')
CAP = os.path.join(ROOT, 'tools', '_cap')   # 画面截图落脚处（不进版本库）
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
    # 图片是以 base64 塞在 URL 里传进来的（见 /px），而 http.server 把请求行长度
    # 死写成 65536——512×512 的怪物母版编码出来有 100KB，直接被判 414。
    # 标准库没留调节的口子，只能把 handle_one_request 抄一份、把读取上限放大。
    # 这里只改这一个数字，其余行为与基类完全一致。
    MAX_REQUEST_LINE = 8 << 20   # 8MB，够 1024×1024 的母版

    def handle_one_request(self):
        try:
            self.raw_requestline = self.rfile.readline(self.MAX_REQUEST_LINE + 1)
            if len(self.raw_requestline) > self.MAX_REQUEST_LINE:
                self.requestline = ''; self.request_version = ''; self.command = ''
                self.send_error(414); return
            if not self.raw_requestline:
                self.close_connection = True; return
            if not self.parse_request(): return
            mname = 'do_' + self.command
            if not hasattr(self, mname):
                self.send_error(501, 'Unsupported method (%r)' % self.command); return
            getattr(self, mname)()
            self.wfile.flush()
        except TimeoutError as e:
            self.log_error('Request timed out: %r', e)
            self.close_connection = True

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
        # /px?f=<文件名>&d=<base64 PNG>：给浏览器用 <img> 发数据用的（img 请求不受 CORS 限制，
        # 而 fetch 会被 Chrome 的 Private Network Access 挡掉）。收到就写盘，回一张 1x1 GIF。
        # /cap?f=<名字>&d=<base64 PNG>：把游戏画面的截图落到 tools/_cap/。
        # 和 /px 走同一条通道，但写到临时目录、不进 assets——它是给「肉眼复核」用的：
        # 改完 UI 在浏览器里截一块画布传过来看一眼，比反复描述靠谱。
        if self.path.startswith('/cap?'):
            from urllib.parse import urlparse, parse_qs, unquote
            q = parse_qs(urlparse(self.path).query)
            fname = unquote(q.get('f', [''])[0]); data = unquote(q.get('d', [''])[0])
            try:
                if not SAFE.match(fname): raise ValueError('bad name ' + fname)
                raw = base64.b64decode(data.split(',')[-1])
                os.makedirs(CAP, exist_ok=True)
                open(os.path.join(CAP, fname), 'wb').write(raw)
                print(f'  <- _cap/{fname}  {len(raw)} bytes')
            except Exception as e:
                print('  !! cap', e)
            self.send_response(200); self.cors()
            self.send_header('Content-Type', 'image/gif'); self.end_headers()
            self.wfile.write(base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'))
            return
        if self.path.startswith('/px?'):
            from urllib.parse import urlparse, parse_qs, unquote
            q = parse_qs(urlparse(self.path).query)
            fname = unquote(q.get('f', [''])[0]); data = unquote(q.get('d', [''])[0])
            try:
                if not SAFE.match(fname): raise ValueError('bad name ' + fname)
                raw = base64.b64decode(data + '=' * (-len(data) % 4))
                if raw[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('not png')
                # m=1 表示这是高精度母版：存进 assets/art/master/，游戏用的那份由
                # tools/set_art.py 从母版缩下来。这样以后改 ART 不用重新出图。
                # （当初管线直接把 1024px 原图处理成 32×48 就落盘，没留中间产物，
                #   结果 78 张资源里 56 张想提精度只能一张一张重新生成。）
                sub = MASTER if q.get('m', [''])[0] == '1' else ART
                os.makedirs(sub, exist_ok=True)
                open(os.path.join(sub, fname), 'wb').write(raw)
                print(f'  <- {"master/" if sub is MASTER else ""}{fname}  {len(raw)} bytes')
            except Exception as e:
                print(f'  !! {fname}: {e}')
            gif = base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
            self.send_response(200); self.cors()
            self.send_header('Content-Type', 'image/gif'); self.send_header('Content-Length', str(len(gif)))
            self.end_headers(); self.wfile.write(gif); return
        files = sorted(f for f in os.listdir(ART) if f.endswith('.png')) if os.path.isdir(ART) else []
        self.reply(200, {'count': len(files), 'files': files, 'manifest': load_manifest()})

    def do_POST(self):
        # 表单提交（application/x-www-form-urlencoded）：浏览器把它当导航，不受 CORS / PNA 限制
        ctype = self.headers.get('Content-Type', '')
        if 'x-www-form-urlencoded' in ctype:
            from urllib.parse import parse_qs
            n = int(self.headers.get('Content-Length') or 0)
            q = parse_qs(self.rfile.read(n).decode('utf-8', 'replace'))
            # 支持一次传多张：字段 f0/d0, f1/d1, ...（或单张的 f/d）
            pairs = []
            if q.get('f'): pairs.append(((q.get('f') or [''])[0], (q.get('d') or [''])[0]))
            i = 0
            while ('f%d' % i) in q:
                pairs.append((q['f%d' % i][0], q.get('d%d' % i, [''])[0])); i += 1
            lines = []
            for fname, data in pairs:
                try:
                    if not SAFE.match(fname): raise ValueError('bad name ' + fname)
                    raw = base64.b64decode(data + '=' * (-len(data) % 4))
                    if raw[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('not a PNG')
                    os.makedirs(ART, exist_ok=True)
                    open(os.path.join(ART, fname), 'wb').write(raw)
                    print(f'  <= {fname}  {len(raw)} bytes', flush=True); lines.append('OK ' + fname)
                except Exception as e:
                    print(f'  !! {fname}: {e}', flush=True); lines.append('FAIL %s (%s)' % (fname, e))
            body = ('<pre id="r">' + '\n'.join(lines) + '</pre>').encode()
            self.send_response(200); self.cors()
            self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body); return
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
