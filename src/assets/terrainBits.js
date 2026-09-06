// 地形过渡层的共用常量：一格的物理像素，以及八方向的位掩码。
// 单独成文件是因为「规则表 + 组装」和「像素烘焙」两边都要用，
// 而那两块拆开之后谁也不该 import 另一块（会绕成环）。
import { TILE } from './tiles.js';
import { ART } from '../core/draw.js';

export const PX = TILE * ART;      // 一格的物理像素（32）。锯齿、浪花这类细节按物理像素画才有 1px 的颗粒感。
export const N = 1, E = 2, S = 4, W = 8, NE = 16, SE = 32, SW = 64, NW = 128;
export const SIDES = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
export const CORNERS = [[NE, 1, -1, N | E], [SE, 1, 1, S | E], [SW, -1, 1, S | W], [NW, -1, -1, N | W]];
export const AROUND = [...SIDES, ...CORNERS];
