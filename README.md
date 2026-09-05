# 水晶传说 Crystal Quest

FF1/3/5 风格的 2D 回合制 JRPG。纯 JavaScript + Canvas，无依赖、无构建。

## 运行
ES Module 不能用 `file://` 直接打开，需要任意静态 HTTP 服务器：

```bash
python3 tools/serve.py
```
然后打开 <http://localhost:8123>（调试模式：<http://localhost:8123/?debug>）。
没有 python3 也可以用 `ruby -run -e httpd . -p 8123`，或 VS Code 的 Live Server 插件。

## 测试
<http://localhost:8123/tests/>

## 操作
| 键 | 作用 |
|---|---|
| 方向键 / WASD | 移动、选菜单 |
| Z / Enter / Space | 确认（战斗中按住可加速） |
| X / Esc | 取消 |
| B（调试） | 强制遇敌 |
| H（调试） | 全员回满 |
