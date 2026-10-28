// ゼロ件誘導：単独グッズがまだ無いキャラ名で探されたとき、そのキャラが属するグループ名（例: XIII機関）での
// 再検索を提案するためのデータ。MCP の discover ツールがこれを使い、Web版（web/kingdomhearts/index.html）も
// 0件のときは discover を呼んでサーバーの提案をそのまま表示する（データはここ1か所だけ。ズレを防ぐ）。
// 新しいグループやキャラを足すときはここだけを直す。

export interface CharacterGroup {
  /** 再検索に使う語（discover の character にも Web版の検索欄にも使える） */
  suggestKeyword: string;
  /** 表示用のグループ名 */
  suggestLabel: string;
  /** メンバーの呼び名（日英・表記ゆれを含む）。小文字で比較する。 */
  members: string[];
}

export const CHARACTER_GROUPS: Record<string, CharacterGroup> = {
  organization_xiii: {
    suggestKeyword: "organization xiii",
    suggestLabel: "Organization XIII",
    members: [
      "xemnas", "xigbar", "xaldin", "vexen", "lexaeus", "zexion", "saix", "saïx",
      "axel", "demyx", "luxord", "marluxia", "larxene", "roxas", "xion",
      "ゼムナス", "シグバール", "ザルディン", "ヴィクセン", "ベクセン", "レクセウス", "ゼクシオン",
      "サイクス", "アクセル", "デミックス", "ルクソード", "マールーシャ", "マールシア", "ラーゼンバーグ", "ラクシーヌ",
    ],
  },
};

export interface CharacterGroupSuggestion {
  suggest_keyword: string;
  suggest_label: string;
}

export function findCharacterGroupSuggestion(character?: string): CharacterGroupSuggestion | null {
  if (!character) return null;
  const lower = character.toLowerCase();
  for (const group of Object.values(CHARACTER_GROUPS)) {
    if (group.members.some((m) => lower.includes(m.toLowerCase()))) {
      return { suggest_keyword: group.suggestKeyword, suggest_label: group.suggestLabel };
    }
  }
  return null;
}
