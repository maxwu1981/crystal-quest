// 战斗画面的共用坐标：下方两块面板的位置，以及敌我双方的站位。
// 单独成文件是因为「写景」（backdrop.js）、「面板与状态栏」（hud.js）、
// 「精灵与整屏绘制」（render.js）、「流程」（BattleScene.js）四边都要用，
// 而那四块拆开之后谁也不该 import 另一块（会绕成环）。
export const PANEL_Y = 152, PANEL_H = 72, LEFT_W = 112;
export const ENEMY_CENTERS = [[48, 62], [100, 82], [48, 114], [100, 132]];
export const PARTY_X = 204, PARTY_Y0 = 44, PARTY_DY = 26;
