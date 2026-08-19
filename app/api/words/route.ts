import { NextRequest, NextResponse } from 'next/server';
import { getAllWords, createWord } from '../../../lib/server/wordManager';
import type { WordDifficulty } from '../../../lib/types/word';

const VALID_DIFFICULTIES: WordDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

export async function GET() {
  return NextResponse.json({ words: getAllWords() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const text = typeof body?.text === 'string' ? body.text : '';
  const category = typeof body?.category === 'string' ? body.category : '';
  const difficulty: WordDifficulty = VALID_DIFFICULTIES.includes(body?.difficulty)
    ? body.difficulty
    : 'MEDIUM';

  const created = createWord({ text, category, difficulty });
  if (!created) {
    return NextResponse.json({ error: '題目與分類不可為空白' }, { status: 400 });
  }

  return NextResponse.json(created, { status: 201 });
}
