'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 首頁右側的「塗鴉畫板」：不是裝飾圖，是真的可以畫。
 * 畫完（停筆約 1 秒）會跳出幾則假玩家的猜測氣泡——直接在首頁示範這個遊戲「一人畫、
 * 大家猜」的核心樂趣，比放一張截圖更有說服力。
 *
 * 設計取捨：
 *  - 只有畫板區域吃指標事件（touch-action: none），不是整個首頁，避免跟連結、輸入框、
 *    頁面捲動互相打架。
 *  - 畫線用相鄰點中點的二次曲線，筆觸圓滑，不會有折線感。
 *  - 筆畫粗細跟畫板寬度成比例（跟遊戲內畫布同一套「相對比例」概念）。
 *  - 氣泡數量上限 4、3.4 秒自動消失，畫面永遠不會被塞滿。
 *  - 這個畫板純屬展示，輸出不會送到任何地方；aria 上標成圖片並附說明，操作鈕可鍵盤使用。
 */

const WORDS = ['太陽', '流星', '甜甜圈', '火箭', '章魚', '彩虹', '冰淇淋', '貓咪'];
const INKS = [
  { name: '墨黑', value: '#1b1a2e' },
  { name: '珊瑚橘', value: '#ff6b4a' },
  { name: '電光藍', value: '#4c6fff' },
  { name: '薄荷綠', value: '#1fcb8f' },
  { name: '蜜糖黃', value: '#ffc93c' },
  { name: '蜜桃粉', value: '#ff8db5' },
];
const GUESSES = [
  '是貓嗎？',
  '我猜…章魚？',
  '太抽象了吧',
  '等等這是什麼',
  '我看到一個太陽',
  '畫得好好笑',
  '甜甜圈！？',
  '我知道！我知道！',
  '是火箭啦',
  '藝術家出沒',
];
const BUBBLE_COLORS = ['var(--blue-soft)', 'var(--green-soft)', 'var(--pink-soft)', 'var(--amber-soft)'];

interface Bubble {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  tilt: number;
  who: string;
}

const WHO = ['小美', '阿翔', '凱凱', '小安', 'Momo', '大雄'];

export function HeroStage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const lengthRef = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleId = useRef(0);

  const [ink, setInk] = useState(INKS[1].value);
  const [wordIdx, setWordIdx] = useState(0);
  const [touched, setTouched] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  /* 依容器尺寸設定畫布解析度（跟遊戲內畫布同一套 DPR 處理） */
  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    // 外層卡片帶有 rotate()，getBoundingClientRect() 會回傳旋轉後「放大的外接矩形」，
    // 用它算畫布尺寸與座標會整個錯位（筆畫畫在可視範圍外）。offsetWidth/Height 是
    // 未經 transform 的版面尺寸，座標則用事件的 offsetX/offsetY（已換算到目標元素本身座標系）。
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    sizeRef.current = { w, h, dpr };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  const pointFrom = (e: React.PointerEvent) => ({
    x: e.nativeEvent.offsetX,
    y: e.nativeEvent.offsetY,
  });

  const spawnBubbles = useCallback(() => {
    const count = 1 + Math.floor(Math.random() * 3);
    // 文字不重複；位置落在畫板上緣與下緣的帶狀區域，避免蓋住使用者剛畫的圖（通常在中間）
    const texts = [...GUESSES].sort(() => Math.random() - 0.5).slice(0, count);
    const next: Bubble[] = texts.map((text, i) => ({
      id: ++bubbleId.current,
      text,
      who: WHO[Math.floor(Math.random() * WHO.length)],
      x: 4 + Math.random() * 46,
      y: i % 2 === 0 ? 4 + Math.random() * 8 : 74 + Math.random() * 8,
      color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)],
      tilt: Math.round((Math.random() * 8 - 4) * 10) / 10,
    }));
    setBubbles((prev) => [...prev, ...next].slice(-4));
    next.forEach((b) =>
      setTimeout(() => setBubbles((prev) => prev.filter((p) => p.id !== b.id)), 3400)
    );
  }, []);

  const onDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setTouched(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    const p = pointFrom(e);
    lastRef.current = p;
    // 點一下也要有一個圓點（不然只點不拖什麼都看不到）
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(p.x, p.y, brush() / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const brush = () => Math.max(4, Math.min(9, sizeRef.current.w / 52));

  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const last = lastRef.current;
    if (!ctx || !last) return;
    const p = pointFrom(e);
    const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    ctx.strokeStyle = ink;
    ctx.lineWidth = brush();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lengthRef.current += Math.hypot(p.x - last.x, p.y - last.y);
    lastRef.current = p;
  };

  const onUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // 畫夠長（不是隨手點一下）、停筆 1 秒後，「大家」開始猜
    if (lengthRef.current > 90) {
      settleTimer.current = setTimeout(() => {
        lengthRef.current = 0;
        spawnBubbles();
      }, 1000);
    }
  };

  const clear = () => {
    const { w, h } = sizeRef.current;
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, w, h);
    lengthRef.current = 0;
    setBubbles([]);
  };

  const nextWord = () => {
    setWordIdx((i) => (i + 1) % WORDS.length);
    clear();
  };

  return (
    <div className="hm-stage dg-taped" style={{ ['--tape-tilt' as string]: '-4deg' }}>
      <div className="hm-stage-top">
        <p className="hm-prompt">
          <span className="dg-hand">題目</span>
          <strong key={wordIdx} className="hm-prompt-word">
            {WORDS[wordIdx]}
          </strong>
        </p>
        <div className="hm-stage-actions">
          <button type="button" className="dg-btn dg-btn-sm" onClick={nextWord} aria-label="換一個題目（會清空畫板）">
            換一題
          </button>
          <button type="button" className="dg-btn dg-btn-sm" onClick={clear}>
            清除
          </button>
        </div>
      </div>

      <div className="hm-pad" ref={wrapRef}>
        {/* 還沒動筆前，示範一幅會自己畫出來的小太陽 */}
        <svg
          className={`hm-ghost art art-on${touched ? ' is-gone' : ''}`}
          viewBox="0 0 200 160"
          aria-hidden="true"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle className="d" pathLength={1} style={{ ['--k' as string]: 2 }} cx="100" cy="82" r="30" stroke="var(--accent)" strokeWidth="6" />
          <path
            className="d"
            pathLength={1}
            style={{ ['--k' as string]: 4 }}
            stroke="var(--amber)"
            strokeWidth="6"
            d="M100 26v-10M100 148v-10M44 82H34M166 82h-10M60 42l-8-8M148 130l-8-8M140 42l8-8M52 130l8-8"
          />
          <path className="d" pathLength={1} style={{ ['--k' as string]: 6 }} strokeWidth="3.5" d="M88 76v.5M112 76v.5M86 92c8 9 20 9 28 0" />
        </svg>
        <p className={`hm-hint dg-hand${touched ? ' is-gone' : ''}`}>
          在這裡塗鴉看看
        </p>

        <canvas
          ref={canvasRef}
          className="hm-canvas"
          role="img"
          aria-label="塗鴉畫板：用滑鼠或手指隨意畫畫，畫完會有假玩家來猜。純屬展示，不會儲存。"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />

        {bubbles.map((b) => (
          <div
            key={b.id}
            className="hm-bubble"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              background: b.color,
              ['--pop-tilt' as string]: `${b.tilt}deg`,
            }}
            role="status"
          >
            <span className="hm-bubble-who">{b.who}</span>
            {b.text}
          </div>
        ))}
      </div>

      <div className="hm-stage-bottom" role="group" aria-label="筆色">
        <div className="hm-inks">
          {INKS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="hm-ink"
              aria-label={c.name}
              aria-pressed={ink === c.value}
              onClick={() => setInk(c.value)}
            >
              <span style={{ background: c.value }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
