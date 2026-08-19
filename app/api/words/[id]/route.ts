import { NextRequest, NextResponse } from 'next/server';
import { updateWord, deleteWord } from '../../../../lib/server/wordManager';
import type { WordDifficulty } from '../../../../lib/types/word';

const VALID_DIFFICULTIES: WordDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const patch: { text?: string; category?: string; difficulty?: WordDifficulty } = {};
  if (typeof body?.text === 'string') patch.text = body.text;
  if (typeof body?.category === 'string') patch.category = body.category;
  if (VALID_DIFFICULTIES.includes(body?.difficulty)) patch.difficulty = body.difficulty;

  const updated = updateWord(id, patch);
  if (!updated) {
    return NextResponse.json({ error: '找不到題目，或更新後內容不合法' }, { status: 400 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteWord(id);
  if (!deleted) {
    return NextResponse.json({ error: '找不到題目' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
