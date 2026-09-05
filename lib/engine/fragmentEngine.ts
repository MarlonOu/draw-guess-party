import type { Stroke } from '../types/stroke';
import type { FragmentHalf, FragmentSplitOrientation } from '../types/room';
import type { WordBankEntry } from '../types/word';

/**
 * 把目前連線中的玩家隨機兩兩配對成組，同時決定組內順序（[0] 是起手、[1] 是補全）。
 * 輸入：玩家 id 列表，長度必須是偶數（呼叫端要先確認人數符合條件，這裡不重複檢查）
 * 輸出：配對後的陣列，每個元素是一組的 [起手, 補全]
 * 實作：先把所有玩家 id 整個洗牌（Fisher-Yates），洗牌後每兩個相鄰的人自動成一組——
 * 這樣「誰跟誰同組」「組內誰是起手」兩件事一次到位，不需要分開處理。
 */
export function pairIntoTeams(playerIds: string[]): [string, string][] {
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const teams: [string, string][] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    teams.push([shuffled[i], shuffled[i + 1]]);
  }
  return teams;
}

/**
 * 幫每一組各自抽一個題目，盡量讓每組拿到不同的題目（用 usedWordIds 累積已經抽過的，
 * 下一組抽的時候排除掉）——不是嚴格禁止重複（題庫太小、組數太多時可能抽到沒有剩下
 * 沒抽過的題目，這種情況允許重複，不會直接失敗讓遊戲開不了場），只是盡量避免。
 * 輸入：題庫（依房間設定的分類/難度篩選過的）、需要幾組的題目
 * 輸出：長度等於 teamCount 的題目文字陣列，或 null（題庫是空的，一題都抽不出來）
 */
export function pickWordsForTeams(
  wordBank: { id: string; text: string }[],
  teamCount: number
): string[] | null {
  if (wordBank.length === 0) return null;
  const words: string[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < teamCount; i++) {
    const candidates = wordBank.filter((w) => !usedIds.has(w.id));
    const pool = candidates.length > 0 ? candidates : wordBank;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    words.push(chosen.text);
    usedIds.add(chosen.id);
  }
  return words;
}

/** 隨機決定切割後保留哪一半（'a' 或 'b'，各 50% 機率） */
export function pickRandomHalf(): FragmentHalf {
  return Math.random() < 0.5 ? 'a' : 'b';
}

/**
 * 判斷單一筆畫屬於切割線的哪一半。畫布座標是 0~1 的正規化比例（見
 * lib/types/stroke.ts 的 StrokePoint 說明），0.5 剛好就是切割線的位置：
 *  - 'vertical'（左右切）：看 x 座標，x < 0.5 算左半（'a'），x >= 0.5 算右半（'b'）
 *  - 'horizontal'（上下切）：看 y 座標，y < 0.5 算上半（'a'），y >= 0.5 算下半（'b'）
 * 一筆畫通常有很多個點，不會每個點都精準落在同一半（尤其是跨越切割線附近畫的筆畫）——
 * 這裡採取「這一筆畫的所有點，平均座標落在哪一半，這筆畫就算哪一半」的簡化規則，
 * 不做逐點沿切割線裁切（那樣需要處理線段跟切割線相交的幾何運算，換來的視覺效果
 * 提升有限，不值得這個複雜度）。空筆畫（沒有任何點）視為屬於 'a' 半，不會出現在
 * 任何一組的篩選結果裡造成困擾（反正沒有點也沒東西好畫）。
 */
/**
 * 「隨機保留某一半」機制的核心：起手自由畫滿整個畫布之後，只保留落在指定那
 * 一半的內容，另一半的內容要真正消失，讓補全者確實只看得到一半、需要自己
 * 推敲補完——這裡改成逐點裁切，不是「整筆畫依平均座標歸類到某一半」（那個
 * 做法在真實使用情境下有個實質缺陷：如果使用者畫的是橫跨整個畫布的連續長線條
 * ——這在真實畫圖裡非常常見，很多人習慣一筆連到底不斷續——整條線只要平均值
 * 落在保留那一半，就會整筆被保留下來、包含視覺上明明跨到另一半的那些部分，
 * 對使用者來說看起來就像「完全沒有被裁切」）。
 *
 * 逐點裁切的做法：沿著每一筆畫的點走一遍，只保留連續落在指定那一半的「連續
 * 區段」，一旦跨到另一半就整段捨棄、從下一個回到指定半邊的點開始算一段新的
 * 筆畫（給一個新的 id，同一筆畫因此可能被拆成好幾段獨立的筆畫）。不做「精準
 * 算出跟切割線交點座標」這種幾何運算（那需要處理線段對切割線的相交計算），
 * 直接以「點本身落在哪一半」為準，裁切點會落在切割線附近但不會剛好精準對齊，
 * 這個誤差在畫面上幾乎看不出來，換來的簡單度是值得的。單點（長度為1）的
 * 區段不保留——StrokeReplay 是靠相鄰兩點連線畫出線段，只有一個點畫不出
 * 看得見的內容，留著也沒有意義。
 *
 * 輸入：起手畫的所有筆畫、切割方向、要保留哪一半
 * 輸出：裁切後的筆畫陣列（可能比原本的筆畫數量更多，因為一筆畫可能被拆成
 * 好幾段），只包含真正落在保留那一半的內容
 */
export function filterStrokesByHalf(
  strokes: Stroke[],
  orientation: FragmentSplitOrientation,
  keepHalf: FragmentHalf
): Stroke[] {
  const axis = orientation === 'vertical' ? 'x' : 'y';
  const result: Stroke[] = [];

  for (const stroke of strokes) {
    let currentRun: typeof stroke.points = [];
    let segmentIndex = 0;

    const flushRun = () => {
      if (currentRun.length > 1) {
        result.push({ ...stroke, id: `${stroke.id}-seg${segmentIndex++}`, points: currentRun });
      }
      currentRun = [];
    };

    for (const point of stroke.points) {
      const half: FragmentHalf = point[axis] < 0.5 ? 'a' : 'b';
      if (half === keepHalf) {
        currentRun.push(point);
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  return result;
}

/**
 * 補全者只能在「空的那一半」畫，這個函式判斷補全者送出的某一筆畫是不是真的畫在
 * 允許的範圍內——伺服器端要做這層驗證，不能只靠前端畫布限制指標事件（前端的
 * 限制只是體驗上的引導，惡意或有 bug 的客戶端還是有可能送出範圍外的座標，伺服器
 * 不驗證就直接收下的話，補全者理論上可以畫到起手保留下來那一半、蓋掉對方的內容）。
 * 輸入：一個畫布座標點、切割方向、起手保留下來的是哪一半（補全者能畫的就是「另一半」）
 * 輸出：這個點是不是落在補全者被允許畫的範圍內
 */
export function isPointInAllowedHalf(
  point: { x: number; y: number },
  orientation: FragmentSplitOrientation,
  keptHalf: FragmentHalf
): boolean {
  const allowedHalf: FragmentHalf = keptHalf === 'a' ? 'b' : 'a';
  const axis = orientation === 'vertical' ? 'x' : 'y';
  const half: FragmentHalf = point[axis] < 0.5 ? 'a' : 'b';
  return half === allowedHalf;
}

/** WordBankEntry 型別在這個檔案沒有直接用到欄位，只是讓呼叫端可以直接把
 *  wordRepository 回傳的完整物件陣列傳進 pickWordsForTeams，不用自己先轉型 */
export type { WordBankEntry };
