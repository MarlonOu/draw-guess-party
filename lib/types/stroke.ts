export interface StrokePoint {
  /** 0~1，相對畫布寬度的比例（不是像素） */
  x: number;
  /** 0~1，相對畫布高度的比例 */
  y: number;
  /** 相對於這一筆畫開始的毫秒數，供之後回放動畫使用 */
  t: number;
}

export interface Stroke {
  id: string;
  playerId: string;
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  points: StrokePoint[];
}
