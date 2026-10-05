'use client';

interface RoomSettingsValue {
  roundDurationSec: number;
  categoryFilter: string[];
  difficultyFilter: string[];
  telephoneFlow?: 'combined' | 'alternating';
}

interface RoomSettingsPanelProps {
  settings: RoomSettingsValue;
  categories: string[];
  isHost: boolean;
  onUpdate: (patch: Partial<RoomSettingsValue>) => void;
  /** DRAW_TELEPHONE 模式沒有「每輪秒數」這個設定（用固定的猜測/作畫限時），隱藏那一區塊 */
  showRoundDuration?: boolean;
  /** 只有 DRAW_TELEPHONE 模式會傳 true，用來決定要不要顯示「接龍流程」切換 */
  showTelephoneFlow?: boolean;
}

const ROUND_DURATIONS = [30, 60, 90, 120];
const DIFFICULTIES: { value: string; label: string }[] = [
  { value: 'EASY', label: '易' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HARD', label: '難' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="dg-label rm-set-label">{children}</p>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  compact?: boolean;
  children: React.ReactNode;
}) {
  // 用 aria-pressed 表達開關狀態（不只靠顏色），尺寸沿用全站晶片的 44px 觸控高度
  return (
    <button type="button" onClick={onClick} className="dg-chip dg-chip-sm" aria-pressed={active}>
      {children}
    </button>
  );
}

/**
 * 房間設定區塊：只有房主看得到可以互動的版本，其他人看到的是唯讀摘要文字。
 * 每個 chip 點擊就立刻送出更新（伺服器那邊只有房主的請求會真的生效，這裡的
 * isHost 判斷只是不讓非房主的畫面顯示出可以點的按鈕，不是唯一的權限防線）。
 *
 * 版位：整體靠左對齊、每個區塊加小標題，避免一排按鈕擠在一起看不出分類；
 * 分類篩選那一排題庫分類可能有十幾二十個，單獨限制高度＋內部捲動，確保不會把
 * 整個設定區塊（乃至疊層本身）撐到超出畫布範圍——畫布本身高度有限，
 * 不能讓可互動的按鈕跑到畫布外面點不到。
 */
export function RoomSettingsPanel({
  settings,
  categories,
  isHost,
  onUpdate,
  showRoundDuration = true,
  showTelephoneFlow = false,
}: RoomSettingsPanelProps) {
  const telephoneFlowText = settings.telephoneFlow === 'alternating' ? '奇數畫偶數猜' : '每人先猜再畫';

  if (!isHost) {
    const categoryText = settings.categoryFilter.length === 0 ? '全部' : settings.categoryFilter.join('、');
    const difficultyText =
      settings.difficultyFilter.length === 0
        ? '全部'
        : settings.difficultyFilter
            .map((d) => DIFFICULTIES.find((x) => x.value === d)?.label ?? d)
            .join('、');
    return (
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', textAlign: 'left' }}>
        目前設定：
        {showRoundDuration && `${settings.roundDurationSec} 秒／`}
        分類 {categoryText}／難度 {difficultyText}
        {showTelephoneFlow && `／流程 ${telephoneFlowText}`}
      </p>
    );
  }

  const toggleCategory = (cat: string) => {
    const next = settings.categoryFilter.includes(cat)
      ? settings.categoryFilter.filter((c) => c !== cat)
      : [...settings.categoryFilter, cat];
    onUpdate({ categoryFilter: next });
  };

  const toggleDifficulty = (d: string) => {
    const next = settings.difficultyFilter.includes(d)
      ? settings.difficultyFilter.filter((x) => x !== d)
      : [...settings.difficultyFilter, d];
    onUpdate({ difficultyFilter: next });
  };

  return (
    <div
      className="dg-card rm-settings"
    >
      {showTelephoneFlow && (
        <div style={{ width: '100%' }}>
          <SectionLabel>接龍流程</SectionLabel>
          <div className="rm-set-chips">
            <Chip
              active={(settings.telephoneFlow ?? 'combined') === 'combined'}
              onClick={() => onUpdate({ telephoneFlow: 'combined' })}
              compact
            >
              每人先猜再畫
            </Chip>
            <Chip
              active={settings.telephoneFlow === 'alternating'}
              onClick={() => onUpdate({ telephoneFlow: 'alternating' })}
              compact
            >
              奇數畫偶數猜（人多推薦）
            </Chip>
          </div>
        </div>
      )}

      {showRoundDuration && (
        <div style={{ width: '100%' }}>
          <SectionLabel>每輪秒數</SectionLabel>
          <div className="rm-set-chips">
            {ROUND_DURATIONS.map((sec) => (
              <Chip key={sec} active={settings.roundDurationSec === sec} onClick={() => onUpdate({ roundDurationSec: sec })} compact>
                {sec}s
              </Chip>
            ))}
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div style={{ width: '100%' }}>
          <SectionLabel>分類篩選（不選代表全部）</SectionLabel>
          <div className="rm-set-chips rm-set-scroll">
            {categories.map((cat) => (
              <Chip key={cat} active={settings.categoryFilter.includes(cat)} onClick={() => toggleCategory(cat)} compact>
                {cat}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div style={{ width: '100%' }}>
        <SectionLabel>難度</SectionLabel>
        <div className="rm-set-chips">
          {DIFFICULTIES.map((d) => (
            <Chip key={d.value} active={settings.difficultyFilter.includes(d.value)} onClick={() => toggleDifficulty(d.value)} compact>
              {d.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
