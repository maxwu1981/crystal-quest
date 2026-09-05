#!/usr/bin/env python3
"""开发用静态服务器：等于 python3 -m http.server，但禁用浏览器缓存，改完代码刷新即生效。
用法：python3 tools/serve.py [端口，默认 8123]"""
import sys, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, fmt, *args):
        if '404' in str(args): super().log_message(fmt, *args)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    print(f'http://localhost:{port}/  (调试 ?debug)  测试 /tests/')
    ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
