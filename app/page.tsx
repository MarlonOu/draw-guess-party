import Link from 'next/link';
import { Reveal } from '../components/home/Reveal';
import { HeroStage } from '../components/home/HeroStage';
import { QuickJoin } from '../components/home/QuickJoin';
import { ModeCta } from '../components/home/ModeCta';
import { MusicToggle } from '../components/home/MusicToggle';
import {
  LogoMark,
  Star,
  Sparkle,
  Squiggle,
  ScribbleUnderline,
  ScribbleCircle,
  ArtDrawGuess,
  ArtTelephone,
  ArtFragment,
  IcoTicket,
  IcoPeople,
  IcoLaugh,
} from '../components/art/Doodles';

/** 跑馬燈用字：直接取自題庫，讓首頁看到的就是遊戲裡真的會出現的題目 */
const MARQUEE_WORDS = [
  '甜甜圈', '盲人摸象', '流星', '纜車', '章魚', '棉花糖', '破釜沉舟', '刺蝟',
  '冰淇淋', '開瓶器', '薩克斯風', '跨年倒數', '烏龜', '楓葉', '魔術師', '駱駝',
];

const MODES = [
  {
    key: 'DRAW_GUESS',
    name: '你畫我猜',
    pitch: '一人畫、其他人搶答。越早猜中分數越高，畫的人也跟著加分。',
    meta: ['2 人起', '計分', '最經典'],
    art: <ArtDrawGuess />,
    bg: 'var(--amber-soft)',
    tilt: '-1.4deg',
  },
  {
    key: 'DRAW_TELEPHONE',
    name: '畫圖接龍',
    pitch: '題目一棒傳一棒：看圖猜、再畫下自己的猜測。最後公布整條鏈走歪了多遠。',
    meta: ['3 人起', '不計分', '笑點最高'],
    art: <ArtTelephone />,
    bg: 'var(--pink-soft)',
    tilt: '1deg',
  },
  {
    key: 'FRAGMENT_DRAW',
    name: '拼圖接畫',
    pitch: '兩人一組。你先自由畫，系統隨機只留一半，隊友得靠默契補完另一半。',
    meta: ['4 人起（偶數）', '組隊', '最考驗默契'],
    art: <ArtFragment />,
    bg: 'var(--green-soft)',
    tilt: '-0.8deg',
  },
] as const;

const STEPS = [
  { n: '1', title: '開一個房間', body: '輸入暱稱、挑一種玩法，馬上拿到 6 碼房間代碼。', ico: <IcoTicket className="hm-step-ico" />, tilt: '-6deg' },
  { n: '2', title: '叫朋友加入', body: '貼連結、報代碼，或讓他們直接掃 QR code。手機和電腦都能一起玩。', ico: <IcoPeople className="hm-step-ico" />, tilt: '5deg' },
  { n: '3', title: '畫！猜！爆笑！', body: '每個人各畫各的、各猜各的，最後一次公布所有作品。', ico: <IcoLaugh className="hm-step-ico" />, tilt: '-4deg' },
];

function Arrow() {
  return (
    <svg className="dg-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function Home() {
  const marquee = MARQUEE_WORDS.map((w) => (
    <span key={w} className="hm-marquee-item">
      {w}
      <Star size={22} fill="var(--accent)" />
    </span>
  ));

  return (
    <>
      <header className="hm-wrap hm-nav dg-in">
        <Link href="/" className="hm-logo" aria-label="畫圖猜謎派對 首頁">
          <LogoMark size={40} />
          <span>畫圖猜謎派對</span>
        </Link>
        <nav className="hm-navlinks" aria-label="主要導覽">
          <a href="#modes">玩法</a>
          <a href="#how">怎麼玩</a>
          <Link href="/online" className="dg-btn dg-btn-sm dg-btn-ink">
            開始遊戲
          </Link>
        </nav>
      </header>

      <main id="main" className="hm-main">
        {/* ------------------------------------------------------------ Hero */}
        <section className="hm-wrap hm-hero" aria-labelledby="hero-title">
          <div className="hm-hero-copy">
            <p className="dg-eyebrow dg-in" style={{ ['--i' as string]: 1 }}>
              <Sparkle size={20} />
              朋友聚會・線上同樂
            </p>

            <h1 id="hero-title" className="hm-title dg-in" style={{ ['--i' as string]: 2 }}>
              <span className="hm-line">
                <span className="hm-w">
                  畫圖
                  <ScribbleUnderline className="hm-under" />
                </span>
                <span className="hm-w">
                  猜謎
                  <ScribbleCircle className="hm-ring" />
                </span>
              </span>
              <span className="hm-line">
                <span className="hm-hl">派對</span>
                <span className="hm-bang" aria-hidden="true">
                  !
                </span>
              </span>
            </h1>

            <p className="dg-lead hm-lead dg-in" style={{ ['--i' as string]: 4 }}>
              一人畫、大家猜。<span className="nw">免註冊</span>、<span className="nw">手機就能玩</span>，
              <span className="nw">分享房間代碼</span>或 <span className="nw">QR code</span>，
              <span className="nw">三十秒開一桌</span>。
            </p>

            <div className="hm-ctas dg-in" style={{ ['--i' as string]: 5 }}>
              <Link href="/online" className="dg-btn dg-btn-primary dg-btn-lg">
                開始遊戲
                <Arrow />
              </Link>
              <QuickJoin />
            </div>

            <ul className="hm-proof dg-in" style={{ ['--i' as string]: 6 }} aria-label="特色">
              <li className="dg-sticker" style={{ ['--tilt' as string]: '-2.5deg' }}>免註冊</li>
              <li className="dg-sticker" style={{ ['--tilt' as string]: '2deg', background: 'var(--green)' }}>手機也能玩</li>
              <li className="dg-sticker" style={{ ['--tilt' as string]: '-1deg', background: 'var(--pink)' }}>2 人就能開玩</li>
            </ul>
          </div>

          <div className="hm-hero-stage dg-in" style={{ ['--i' as string]: 3 }}>
            <HeroStage />
            <Star size={44} className="hm-deco hm-deco-star" />
            <Squiggle width={96} className="hm-deco hm-deco-squig" />
          </div>
        </section>

        {/* -------------------------------------------------------- Marquee */}
        <div className="hm-marquee-clip">
          <div className="hm-marquee" aria-hidden="true">
            <div className="hm-marquee-track">
              <div className="hm-marquee-group">{marquee}</div>
              <div className="hm-marquee-group">{marquee}</div>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------- Modes */}
        <section id="modes" className="hm-wrap hm-section" aria-labelledby="modes-title">
          <Reveal className="hm-head">
            <p className="dg-eyebrow">三種玩法</p>
            <h2 id="modes-title" className="hm-h2">
              同一桌，三種混亂
            </h2>
            <p className="dg-lead">用同一個房間代碼，挑今天最想玩的那一種。</p>
          </Reveal>

          <ul className="hm-modes">
            {MODES.map((m, i) => (
              <Reveal as="li" key={m.key} delay={i + 1} className="hm-mode-li">
                <article
                  className="dg-card dg-taped hm-mode"
                  style={{ ['--tilt' as string]: m.tilt, ['--tape-tilt' as string]: `${i % 2 ? 4 : -3}deg` }}
                >
                  <div className="hm-mode-art" style={{ background: m.bg }}>
                    {m.art}
                  </div>
                  <h3>{m.name}</h3>
                  <p className="hm-mode-pitch">{m.pitch}</p>
                  <ul className="hm-meta" aria-label={`${m.name} 特色`}>
                    {m.meta.map((t) => (
                      <li key={t} className="dg-tag">
                        {t}
                      </li>
                    ))}
                  </ul>
                  <ModeCta
                    href={`/online?mode=${m.key}`}
                    label={`選擇「${m.name}」並建立房間`}
                  >
                    選這個玩法
                    <Arrow />
                  </ModeCta>
                </article>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------ How */}
        <section id="how" className="hm-wrap hm-section" aria-labelledby="how-title">
          <Reveal className="hm-head">
            <p className="dg-eyebrow">三步開玩</p>
            <h2 id="how-title" className="hm-h2">
              比揪團吃飯還簡單
            </h2>
          </Reveal>
          <ol className="hm-steps">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i + 1} className="hm-step dg-card">
                <span className="hm-step-n" aria-hidden="true">
                  {s.n}
                </span>
                <span style={{ ['--ico-tilt' as string]: s.tilt }}>{s.ico}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------------------ CTA */}
        <section className="hm-cta" aria-labelledby="cta-title">
          <Sparkle size={34} className="hm-cta-deco hm-cta-d1" />
          <Star size={40} fill="var(--paper)" className="hm-cta-deco hm-cta-d2" />
          <Sparkle size={26} className="hm-cta-deco hm-cta-d3" />
          <Reveal className="hm-cta-inner">
            <h2 id="cta-title">今晚，開一桌？</h2>
            <p>不用下載、不用註冊，打開網頁就能畫。</p>
            <Link href="/online" className="dg-btn dg-btn-ink dg-btn-lg">
              開始遊戲
              <Arrow />
            </Link>
          </Reveal>
        </section>
      </main>

      <MusicToggle />

      <footer className="hm-wrap hm-foot">
        <span>畫圖猜謎派對 · 手機與電腦皆可遊玩</span>
        {/* prefetch={false}：/admin 受 Basic Auth 保護（見 proxy.ts）。Next.js 預設會在連結進入
            視窗時自動預取目標頁，預取請求沒帶帳密會收到 401，瀏覽器因此在使用者滑到頁尾時
            突然彈出登入視窗。只有使用者真的點擊才應該請求這個頁面。 */}
        <Link href="/admin" prefetch={false}>
          題庫管理
        </Link>
      </footer>
    </>
  );
}
