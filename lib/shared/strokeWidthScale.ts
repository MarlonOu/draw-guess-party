/**
 * 筆刷寬度正規化：畫筆工具列的粗細滑桿（2~24）給的是一個「參考畫布寬度」下
 * 校準出來的絕對像素值，不是「不管畫布多大都用這個絕對像素數字畫」的意思。
 *
 * 問題是這樣來的：Stroke.width 這個欄位本身沒有跟著畫布尺寸做任何正規化，
 * 直接原封不動送進 `ctx.lineWidth`。DRAW_GUESS／DRAW_TELEPHONE 的畫布寬度
 * 上限是 900px，FRAGMENT_DRAW 的畫布寬度上限是 1100px，而作品列表（接龍的
 * 公布畫廊、FRAGMENT_DRAW 的公布結果）的預覽框只有兩三百 px 寬——同一個
 * width 數字，在畫的當下（大畫布）跟事後回放（小預覽框）呈現出來的「線條粗細
 * 相對於畫布大小的比例」完全不同：在小預覽框上，原本畫的時候看起來細緻的線條，
 * 相對比例會變得又粗又糊，精細的筆觸（例如五官、文字細節）會被線條本身的
 * 粗細吃掉，使用者形容成「解析度／精細度跟實際作畫有落差」。
 *
 * 解法：畫線的時候，把 Stroke.width 這個「參考寬度下的粗細值」乘上
 * 「目前實際畫布寬度 / 這個參考寬度」的比例，換算成當下畫布真正該用的
 * lineWidth。這樣不管是在哪個模式的哪種尺寸畫布上畫、或事後用哪種尺寸的
 * 預覽框回放，同一條筆畫呈現出來的「線條相對於畫布的粗細比例」永遠一致。
 *
 * DrawingCanvas.tsx（即時作畫／即時回放遠端筆畫）與 StrokeReplay.tsx（唯讀
 * 回放，用在作品列表／公布畫廊）都要引用這個同一個參考值，兩邊算出來的
 * 縮放比例才會一致，不會出現「即時作畫時看起來合理，回放時卻突然變粗或變細」
 * 的不一致情況。
 */
export const REFERENCE_CANVAS_WIDTH_PX = 700;

/** 把「參考寬度下校準出來的粗細值」換算成「目前畫布實際寬度下該用的 lineWidth」 */
export function scaleStrokeWidth(width: number, actualCanvasWidthPx: number): number {
  if (actualCanvasWidthPx <= 0) return width;
  return width * (actualCanvasWidthPx / REFERENCE_CANVAS_WIDTH_PX);
}
