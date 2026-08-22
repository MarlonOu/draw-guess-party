'use client';

/**
 * 遊戲事件音效。全部用 Web Audio API 的 OscillatorNode 即時合成短音，
 * 不依賴任何外部音檔——這個開發環境連不到音效素材站（`網頁開發參考素材網站`
 * 那份文件列的 lottiefiles、useanimations 等等都是圖示/動畫素材，沒有現成音效庫，
 * 而且下載外部音檔也有版權疑慮），改用合成音直接生成，簡短、無版權問題、不用等載入。
 *
 * 瀏覽器的自動播放限制要求 AudioContext 必須在使用者互動過後才能真正發聲，
 * 這裡延遲到第一次呼叫才建立 AudioContext（而不是模組載入就建立），並在每次
 * 呼叫時嘗試 resume()，符合大多數瀏覽器的政策。
 */

let audioContext: AudioContext | null = null;

const MUTE_STORAGE_KEY = 'draw-guess-party:sound-muted';

/**
 * 靜音狀態存在 localStorage，跨分頁重整、下次回訪都記得使用者的選擇。
 * 讀取只在第一次呼叫 isMuted() 時做一次，之後改用記憶體變數，避免每次播音效都
 * 讀一次 localStorage（同步 API，頻繁呼叫會有效能疑慮，雖然這裡音效頻率不高，
 * 但養成習慣比較好）。
 */
let mutedState: boolean | null = null;

function readMutedFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    // 無痕模式或瀏覽器限制存取 localStorage 時，安靜當作沒有靜音，不影響音效播放
    return false;
  }
}

export function isMuted(): boolean {
  if (mutedState === null) {
    mutedState = readMutedFromStorage();
  }
  return mutedState;
}

export function setMuted(value: boolean): void {
  mutedState = value;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // 存不進去就算了，至少這次 session 內的 mutedState 記憶體值還是正確的
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
  return audioContext;
}

interface Tone {
  /** 頻率（Hz） */
  freq: number;
  /** 相對於整段音效開始的延遲秒數 */
  startOffset: number;
  /** 音符長度（秒） */
  duration: number;
  type?: OscillatorType;
  /** 音量峰值，0~1，預設 0.15，刻意壓低避免太吵 */
  gain?: number;
}

function playTones(tones: Tone[]): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.value = tone.freq;

    const start = now + tone.startOffset;
    const end = start + tone.duration;
    const peakGain = tone.gain ?? 0.15;

    // 用線性升到峰值、指數降到接近 0，避免方波般的突然起訖產生喀噠聲（click 雜訊）
    gainNode.gain.setValueAtTime(0, start);
    gainNode.gain.linearRampToValueAtTime(peakGain, start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/** 有玩家加入房間：上揚兩音，輕快 */
export function playPlayerJoinSound(): void {
  playTones([
    { freq: 523.25, startOffset: 0, duration: 0.12 }, // C5
    { freq: 783.99, startOffset: 0.1, duration: 0.16 }, // G5
  ]);
}

/** 有玩家離開房間：下降兩音，跟加入音相反的走向 */
export function playPlayerLeaveSound(): void {
  playTones([
    { freq: 587.33, startOffset: 0, duration: 0.12 }, // D5
    { freq: 392.0, startOffset: 0.1, duration: 0.18 }, // G4
  ]);
}

/** 選完題目（不管是主動選、還是逾時自動保底選）：單一短促的「啵」聲 */
export function playWordChosenSound(): void {
  playTones([{ freq: 660, startOffset: 0, duration: 0.08, type: 'triangle', gain: 0.12 }]);
}

/** 有人猜對了（每次猜對都會響一次）：明亮的「叮」聲 */
export function playCorrectGuessSound(): void {
  playTones([
    { freq: 880, startOffset: 0, duration: 0.09 },
    { freq: 1174.66, startOffset: 0.07, duration: 0.14 },
  ]);
}

/** 這一輪所有猜題者都答對了：三音上升＋收尾高音，慶祝感 */
export function playAllCorrectSound(): void {
  playTones([
    { freq: 523.25, startOffset: 0, duration: 0.12 },
    { freq: 659.25, startOffset: 0.1, duration: 0.12 },
    { freq: 783.99, startOffset: 0.2, duration: 0.12 },
    { freq: 1046.5, startOffset: 0.3, duration: 0.22, gain: 0.18 },
  ]);
}

/** 時間到、有人猜對但沒有全部猜對：中性的兩音下滑，不算失敗也不算全勝 */
export function playPartialRoundEndSound(): void {
  playTones([
    { freq: 587.33, startOffset: 0, duration: 0.14, type: 'triangle' },
    { freq: 493.88, startOffset: 0.12, duration: 0.18, type: 'triangle' },
  ]);
}

/** 流局：時間到完全沒人猜對，用低沉的鋸齒波兩音下降，明確區別於「部分答對」 */
export function playForfeitSound(): void {
  playTones([
    { freq: 349.23, startOffset: 0, duration: 0.16, type: 'sawtooth', gain: 0.1 },
    { freq: 261.63, startOffset: 0.14, duration: 0.26, type: 'sawtooth', gain: 0.1 },
  ]);
}
