// 地形过渡层的共用常量：一格的物理像素，以及八方向的位掩码。
// 单独成文件是因为「规则表 + 组装」和「像素烘焙」两边都要用，
// 而那两块拆开之后谁也不该 import 另一块（会绕成环）。
import { TILE } from './tiles.js';
import { ART } from '../core/draw.js';

export const PX = TILE * ART;      // 一格的物理像素（ART=2 时 32、ART=6 时 96）。
                                   // 锯齿、浪花这类细节按物理像素画才有 1px 的颗粒感。

// 烘焙里那些手调出来的几何常量（咬合深度、明暗斑半径、石头花草的尺寸）**全是物理像素**，
// 而且都是在 ART=2、PX=32 的时候调的。ART 提到 6 之后 PX 变成 96，
// 这些常量原地不动就等于相对尺寸缩到三分之一：
// 地形咬合从「咬掉六分之一格」变成「咬掉五十分之一格」，边界看着是硬的；
// 明暗斑从三分之一格大缩成十分之一格，直接看不见了。
// U 把它们换算回当初调的那个相对大小。新写的常量也该用 u() 包一下。
export const U = ART / 2;
export const u = v => Math.max(1, Math.round(v * U));
export const N = 1, E = 2, S = 4, W = 8, NE = 16, SE = 32, SW = 64, NW = 128;
export const SIDES = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
export const CORNERS = [[NE, 1, -1, N | E], [SE, 1, 1, S | E], [SW, -1, 1, S | W], [NW, -1, -1, N | W]];
export const AROUND = [...SIDES, ...CORNERS];
