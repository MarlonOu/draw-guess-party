export interface DrawGuessRoundData {
  mode: 'DRAW_GUESS';
  wordId: string;
  word: string;
  drawerPlayerId: string;
  guessedCorrectlyBy: string[];
}

export interface FragmentDrawRoundData {
  mode: 'FRAGMENT_DRAW';
  prompt: string;
  gridSize: number;
  /** playerId -> 該玩家負責的格子索引（0 起算） */
  cellAssignments: Record<string, number>;
}

export interface DrawTelephoneRoundData {
  mode: 'DRAW_TELEPHONE';
  chainId: string;
  stepIndex: number;
  /** 上一棒玩家 id，鏈的第一棒沒有上一棒 */
  previousPlayerId?: string;
}

export type RoundData = DrawGuessRoundData | FragmentDrawRoundData | DrawTelephoneRoundData;

export interface GuessMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  /** 是否被判定為正確答案（僅 DRAW_GUESS 使用） */
  isCorrectGuess: boolean;
  createdAt: string;
}
