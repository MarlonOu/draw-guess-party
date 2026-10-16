import { NextRequest, NextResponse } from 'next/server';
import { bulkImportWords, type WordInput } from '../../../../lib/server/wordManager';
import type { WordDifficulty } from '../../../../lib/types/word';

const VALID_DIFFICULTIES: WordDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/**
 * CSV 批次匯入。格式：每行 `題目,分類,難度`，難度欄位可省略（預設 MEDIUM）。
 * 不使用逗號跳脫/引號解析（題目/分類內容預期不含逗號），保持實作單純。
 */
function parseCsv(raw: string): WordInput[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [text = '', category = '', difficultyRaw = ''] = line.split(',').map((s) => s.trim());
      const difficulty: WordDifficulty = VALID_DIFFICULTIES.includes(
        difficultyRaw.toUpperCase() as WordDifficulty
      )
        ? (difficultyRaw.toUpperCase() as WordDifficulty)
        : 'MEDIUM';
      return { text, category, difficulty };
    });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const csvText = typeof body?.csv === 'string' ? body.csv : '';
  if (!csvText.trim()) {
    return NextResponse.json({ error: '請貼上要匯入的內容' }, { status: 400 });
  }

  const entries = parseCsv(csvText);
  const result = bulkImportWords(entries);
  return NextResponse.json(result);
}
