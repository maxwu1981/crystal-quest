#!/usr/bin/env python3
"""用 Gemini 生成全部游戏美术（角色 / NPC / 敌人 / 瓦片），处理成像素图写进 assets/art/。
零依赖：只用标准库（网络 urllib，PNG 用 tools/pixel.py）。

用法：
  export GEMINI_API_KEY=...        # 或把 key 写进项目根目录的 .gemini_key（已 gitignore）
  python3 tools/gen_art.py                 # 生成缺的（已有 raw 原图的只重新处理，不再花钱）
  python3 tools/gen_art.py --only goblin,warrior   # 只做这些 id
  python3 tools/gen_art.py --force         # 忽略缓存，全部重新请求 Gemini
  python3 tools/gen_art.py --reprocess     # 不联网，只用 assets/art/raw/ 里的原图重新处理
  python3 tools/gen_art.py --list          # 列出全部资产与提示词
  python3 tools/gen_art.py --model gemini-2.5-flash-image

流程：Gemini 出 1024² 图（洋红底）→ 抠底 → 裁剪 → 面积平均缩小 → 色阶量化 → 描边 → PNG。
原图缓存在 assets/art/raw/，处理结果在 assets/art/，清单 assets/art/manifest.json 由游戏启动时读取，
有 PNG 就用 PNG，没有就退回代码画的占位图，所以可以只生成一部分。"""
import argparse, base64, json, os, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ART = os.path.join(ROOT, 'assets', 'art'); RAW = os.path.join(ART, 'raw')
DEFAULT_MODEL = 'gemini-2.5-flash-image'

STYLE = ('16-bit SNES-era Japanese RPG pixel art, classic 1990s console JRPG style, crisp flat colors, '
         'thin dark outline, no anti-aliasing, no gradients, no lighting effects, no text, no watermark, no signature.')
MAGENTA = 'centered on a completely flat solid magenta (#FF00FF) background with absolutely nothing else in the image.'
VIEWS = {
    'down': 'facing the viewer (front view)',
    'up': 'seen directly from behind (back view, we see the back of the head and back of the clothes)',
    'left': 'side view in profile, facing to the LEFT of the image',
}

# ---------- 资产清单：id → 描述。要加新角色/怪物/瓦片只改这里 ----------
CHARACTERS = {  # 玩家职业（对应 data/jobs.json）与 NPC（对应地图 npcs[].sprite）
    'warrior':   'A young human warrior with short blonde hair, red armor with dark red trim, brown boots, small sword at the hip.',
    'thief':     'A nimble young thief with orange hair and a teal hooded tunic, dark green sash, brown boots, dagger.',
    'whitemage': 'A white mage: white robe with red triangular trim pattern, hood covering the hair, wooden staff.',
    'blackmage': 'A black mage: big blue pointed wizard hat, dark blue robe, face hidden in shadow with two glowing yellow eyes.',
    'monk':      'A monk martial artist with brown hair tied back, orange sleeveless gi, wrapped fists, barefoot.',
    'redmage':   'A red mage: red wide-brimmed feathered hat, red coat with white trim, rapier, blonde hair.',
    'elder':     'An old village elder with white hair and a long white beard, brown robe, wooden walking cane.',
    'woman':     'A young village woman with brown hair in a bun, pink dress with white apron.',
    'man':       'A village man with black hair, blue shirt, brown trousers.',
    'kid':       'A small village child with messy yellow hair, green shirt, shorts.',
    'merchant':  'A merchant with a small cap, teal apron over a brown shirt, mustache.',
    'innkeeper': 'A friendly innkeeper with brown hair, white apron over a red shirt.',
    'guard':     'A town guard in simple gray chainmail and a steel helmet, holding a spear.',
    'knight':    'A menacing knight in full black plate armor with a horned helmet, glowing red eyes visible through the visor, dark cape.',
}
ENEMIES = {  # 对应 data/enemies.json 的 sprite（size = 战斗画面里的像素尺寸）
    'goblin':    ('A small green goblin with red eyes and pointed ears, wearing a loincloth, holding a wooden club.', 40),
    'wolf':      ('A gray wild wolf, snarling, bushy tail, four legs, amber eyes.', 44),
    'slime':     ('A round blue gelatinous slime with a cute face and a lighter blue highlight.', 36),
    'bat':       ('A purple cave bat with spread wings, yellow eyes, small fangs.', 40),
    'darkslime': ('A round black slime with a purple glow and menacing red eyes.', 36),
    'skeleton':  ('A skeleton warrior with a rusty sword and a round wooden shield, bones slightly yellowed.', 44),
    'knight':    ('A huge boss: a knight in full black plate armor with a horned helmet, glowing red eyes, huge dark greatsword, tattered dark cape.', 64),
    'bee':       ('A giant yellow-and-black poison bee with a large stinger and translucent wings.', 36),
    'mandrake':  ('A mandrake plant monster: a walking root with a wide screaming mouth, green leaves on its head.', 40),
    'ghost':     ('A translucent pale-blue ghost with hollow black eyes, wispy trailing bottom.', 40),
}
TILES = {  # 对应 src/assets/tiles.js 的名字
    'grass':         'bright green grass',
    'path':          'a sandy dirt path',
    'tree':          'a single round dark green tree with a brown trunk on grass',
    'water':         'blue water with small light ripples',
    'wall':          'a gray stone brick house wall',
    'roof':          'red clay roof tiles',
    'door':          'a wooden door in a gray stone brick wall',
    'floor':         'wooden plank floor',
    'counter':       'a wooden shop counter seen from above',
    'bed':           'a small bed with a blue blanket and white pillow seen from above',
    'cave_floor':    'dark gray rocky cave floor',
    'cave_wall':     'dark brown cave rock wall',
    'stairs_down':   'stone stairs going down into darkness',
    'stairs_up':     'stone stairs going up toward light',
    'chest':         'a closed brown wooden treasure chest with a gold lock on a cave floor',
    'chest_open':    'an open empty brown wooden treasure chest on a cave floor',
    'crystal':       'a glowing cyan crystal on a stone pedestal on a cave floor',
    'cave_entrance': 'a dark cave entrance in a rocky cliff, on grass',
    'mountain':      'a gray-brown rocky mountain peak with a snowy tip',
    'forest':        'dense dark green forest canopy',
    'sand':          'pale yellow sand',
    'town':          'a small village of red-roofed houses seen from far above, on grass',
    'bridge':        'a wooden plank bridge crossing blue water, seen from above',
}
ART = 2  # 与 src/core/draw.js 的 ART 保持一致：所有输出尺寸都是逻辑尺寸的 ART 倍
CHAR_SIZE = (16 * ART, 24 * ART)

def assets():
    for cid, desc in CHARACTERS.items():
        for view, vdesc in VIEWS.items():
            yield {'kind': 'char', 'id': cid, 'view': view, 'file': f'char_{cid}_{view}.png', 'size': CHAR_SIZE,
                   'prompt': f'{STYLE} A single chibi RPG character sprite, about 2 heads tall, full body, standing still, arms at the sides, {vdesc}, {MAGENTA} {desc}'}
    for eid, (desc, size) in ENEMIES.items():
        yield {'kind': 'enemy', 'id': eid, 'file': f'enemy_{eid}.png', 'size': (size * ART, size * ART),
               'prompt': f'{STYLE} A single monster sprite for a turn-based RPG battle screen, full body, facing slightly to the right toward the player, {MAGENTA} {desc}'}
    for tid, desc in TILES.items():
        yield {'kind': 'tile', 'id': tid, 'file': f'tile_{tid}.png', 'size': (16 * ART, 16 * ART),
               'prompt': f'{STYLE} A single top-down terrain tile for a 2D RPG overworld map: {desc}. Seamless, filling the whole square image edge to edge, no border, no frame, no margin, no background color showing.'}

# ---------- Gemini ----------
def api_key():
    k = os.environ.get('GEMINI_API_KEY')
    if not k:
        p = os.path.join(ROOT, '.gemini_key')
        if os.path.exists(p): k = open(p).read().strip()
    if not k: sys.exit('没有 API key：export GEMINI_API_KEY=... 或写到项目根目录 .gemini_key')
    return k

def gemini_image(prompt, model, key, ref_png=None, tries=4):
    parts = [{'text': prompt}]
    if ref_png: parts.append({'inlineData': {'mimeType': 'image/png', 'data': base64.b64encode(ref_png).decode()}})
    body = json.dumps({'contents': [{'parts': parts}], 'generationConfig': {'responseModalities': ['IMAGE']}}).encode()
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    for attempt in range(tries):
        req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
        try:
            with urllib.request.urlopen(req, timeout=180) as r: res = json.load(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:300]
            if e.code in (429, 500, 503) and attempt < tries - 1: wait = 10 * (attempt + 1); print(f'    HTTP {e.code}，{wait}s 后重试… {msg}'); time.sleep(wait); continue
            raise SystemExit(f'Gemini 请求失败 HTTP {e.code}: {msg}')
        for part in res.get('candidates', [{}])[0].get('content', {}).get('parts', []):
            d = part.get('inlineData')
            if d and d.get('mimeType', '').startswith('image/'):
                if d['mimeType'] != 'image/png': raise SystemExit(f'Gemini 返回了 {d["mimeType"]}，目前只处理 PNG')
                return base64.b64decode(d['data'])
        print('    没有拿到图片，重试…', json.dumps(res)[:200]); time.sleep(3)
    raise SystemExit('多次尝试后仍没有图片')

# ---------- 主流程 ----------
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only'); ap.add_argument('--force', action='store_true')
    ap.add_argument('--reprocess', action='store_true'); ap.add_argument('--list', action='store_true'); ap.add_argument('--model', default=DEFAULT_MODEL)
    a = ap.parse_args()
    only = set(a.only.split(',')) if a.only else None
    todo = [x for x in assets() if not only or x['id'] in only]
    if a.list:
        for x in todo: print(f"{x['file']:32s} {x['size']}  {x['prompt']}\n")
        return
    os.makedirs(RAW, exist_ok=True)
    key = None if a.reprocess else api_key()
    manifest = load_manifest(); refs = {}
    for i, x in enumerate(todo, 1):
        raw_path = os.path.join(RAW, x['file']); out_path = os.path.join(ART, x['file'])
        print(f"[{i}/{len(todo)}] {x['file']}")
        if os.path.exists(raw_path) and not a.force: raw = open(raw_path, 'rb').read()
        elif a.reprocess: print('    没有原图，跳过'); continue
        else:
            ref = refs.get(x['id']) if x['kind'] == 'char' and x.get('view') != 'down' else None
            if ref: x['prompt'] = 'Use the attached reference image: draw the SAME character with identical colors, outfit and proportions. ' + x['prompt']
            raw = gemini_image(x['prompt'], a.model, key, ref); open(raw_path, 'wb').write(raw)
        if x['kind'] == 'char' and x.get('view') == 'down': refs[x['id']] = raw
        w, h, px = pixel.decode_png(raw); tw, th = x['size']
        out = pixel.process_sprite(w, h, px, tw, th, anchor='bottom' if x['kind'] == 'char' else 'center', key=x['kind'] != 'tile')
        open(out_path, 'wb').write(pixel.encode_png(tw, th, out))
        register(manifest, x)
        save_manifest(manifest)
    print(f'完成。清单：{os.path.join(ART, "manifest.json")}')

def load_manifest():
    p = os.path.join(ART, 'manifest.json')
    return json.load(open(p)) if os.path.exists(p) else {'characters': {}, 'enemies': {}, 'tiles': {}}
def save_manifest(m): json.dump(m, open(os.path.join(ART, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
def register(m, x):
    if x['kind'] == 'char': m['characters'].setdefault(x['id'], {})[x['view']] = x['file']
    elif x['kind'] == 'enemy': m['enemies'][x['id']] = x['file']
    else: m['tiles'][x['id']] = x['file']

if __name__ == '__main__': main()
