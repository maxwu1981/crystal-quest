#!/usr/bin/env python3
"""开发用静态服务器：等于 python3 -m http.server，但禁用浏览器缓存，改完代码刷新即生效。

用法：python3 tools/serve.py [端口，默认 8123] [--lan]
      --lan  绑到 0.0.0.0，同一个 Wi-Fi 下的手机也能连（默认只绑 127.0.0.1，只有本机能连）

手机怎么玩、怎么装到主屏幕，见 docs/手机上玩.md。
"""
import sys, os, socket
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    # .webmanifest 必须是 application/manifest+json，否则部分浏览器直接忽略这个清单，
    # 表现是「加到主屏幕」变成普通书签、没有全屏也没有图标
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript',
                      '.woff2': 'font/woff2', '.json': 'application/json',
                      '.webmanifest': 'application/manifest+json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, fmt, *args):
        if '404' in str(args): super().log_message(fmt, *args)


def lan_ip():
    """本机在局域网里的 IP。开一个 UDP socket 假装往外连（不会真发包），
    问内核挑了哪个网卡——比遍历网卡靠谱，Mac 上常同时有 Wi-Fi、以太网和一堆 VPN 虚拟网卡。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.0.2.1', 9))          # TEST-NET-1，保证是个不存在的地址
        return s.getsockname()[0]
    except OSError:
        return None                          # 没连网
    finally:
        s.close()


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    lan = '--lan' in sys.argv
    port = int(args[0]) if args else 8123
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

    host = '0.0.0.0' if lan else '127.0.0.1'
    print(f'http://localhost:{port}/  (调试 ?debug)  测试 /tests/')
    if lan:
        ip = lan_ip()
        if ip:
            print(f'\n手机上打开（要和电脑连同一个 Wi-Fi）：\n\n    http://{ip}:{port}/\n')
        else:
            print('\n没找到局域网 IP：电脑好像没连网。连上 Wi-Fi 再试。\n')
        print('注意：这条 http://192.168.x.x 的地址只能「在浏览器里玩」，不能装到手机主屏幕。')
        print('     离线缓存（service worker）只在 https 或 localhost 下允许注册，')
        print('     局域网的 http 会被浏览器拒绝——这是浏览器的安全规则，不是游戏坏了。')
        print('     想装到主屏幕离线玩，要把游戏传到 https 的静态托管上，见 docs/手机上玩.md。')
    else:
        print(f'手机要连的话加 --lan：python3 tools/serve.py {port} --lan')
    print('\n提示：如果在 localhost 上装过一次离线缓存，改了代码刷新却没变化，')
    print('     那是 service worker 在吃缓存（它不理会本服务器的 no-store）。')
    print('     开发者工具 → Application → Service Workers → Unregister，再硬刷新。\n')

    ThreadingHTTPServer((host, port), NoCacheHandler).serve_forever()
