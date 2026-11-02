// ゼロ件誘導：単独グッズがまだ無いキャラ名で探されたとき、そのキャラが属するグループ名（例: XIII機関）での
// 再検索を提案するためのデータ。MCP の discover ツールがこれを使い、Web版（web/kingdomhearts/index.html）も
// 0件のときは discover を呼んでサーバーの提案をそのまま表示する（データはここ1か所だけ。ズレを防ぐ）。
// 新しいグループやキャラを足すときはここだけを直す。
//
// グループは作品（ip）ごと（2026-11-02、複数IP対応）。discover の ip と一致するグループだけを提案する
// （例: 「ナミ」で探しても、キングダム ハーツのカタログでは麦わらの一味を提案しない）。

export interface CharacterGroup {
  /** 作品の ip（catalog.csv の ip 列・discover の ip と同じ書き方） */
  ip: string;
  /** 再検索に使う語（discover の character にも Web版の検索欄にも使える） */
  suggestKeyword: string;
  /** 表示用のグループ名 */
  suggestLabel: string;
  /**
   * グループのグッズを探すときに、catalog の character / character_en 列と照らす語（日英）。
   * 省略時は suggestLabel だけ。どれかを含む商品を suggested_items に入れる。
   */
  matchLabels?: string[];
  /** メンバーの呼び名（日英・表記ゆれを含む）。小文字で比較する。 */
  members: string[];
}

export const CHARACTER_GROUPS: Record<string, CharacterGroup> = {
  organization_xiii: {
    ip: "kingdom-hearts",
    suggestKeyword: "organization xiii",
    suggestLabel: "Organization XIII",
    members: [
      "xemnas", "xigbar", "xaldin", "vexen", "lexaeus", "zexion", "saix", "saïx",
      "axel", "demyx", "luxord", "marluxia", "larxene", "roxas", "xion",
      "ゼムナス", "シグバール", "ザルディン", "ヴィクセン", "ベクセン", "レクセウス", "ゼクシオン",
      "サイクス", "アクセル", "デミックス", "ルクソード", "マールーシャ", "マールシア", "ラーゼンバーグ", "ラクシーヌ",
    ],
  },
  // 鬼滅の刃「柱」（9人）：冨岡義勇（水柱）・胡蝶しのぶ（蟲柱）・煉獄杏寿郎（炎柱）・宇髄天元（音柱）・時透無一郎（霧柱）・
  // 甘露寺蜜璃（恋柱）・不死川実弥（風柱）・伊黒小芭内（蛇柱）・悲鳴嶼行冥（岩柱）。
  // カタログでは、柱がそろって登場するグッズの character_en に "Hashira"（character に「柱」）を入れる想定。
  hashira: {
    ip: "kimetsu-no-yaiba",
    suggestKeyword: "hashira",
    suggestLabel: "Hashira",
    matchLabels: ["Hashira", "柱"],
    members: [
      "冨岡義勇", "冨岡", "富岡義勇", "義勇", "giyu", "tomioka",
      "胡蝶しのぶ", "しのぶ", "shinobu", "kocho",
      "煉獄杏寿郎", "煉獄", "杏寿郎", "rengoku", "kyojuro",
      "宇髄天元", "宇髄", "天元", "tengen", "uzui",
      "時透無一郎", "時透", "無一郎", "muichiro", "tokito",
      "甘露寺蜜璃", "甘露寺", "蜜璃", "mitsuri", "kanroji",
      "不死川実弥", "実弥", "sanemi", "shinazugawa",
      "伊黒小芭内", "伊黒", "小芭内", "obanai", "iguro",
      "悲鳴嶼行冥", "悲鳴嶼", "行冥", "gyomei", "himejima",
      "水柱", "蟲柱", "炎柱", "音柱", "霧柱", "恋柱", "風柱", "蛇柱", "岩柱",
    ],
  },
  // ONE PIECE「麦わらの一味」（10人）：ルフィ・ゾロ・ナミ・ウソップ・サンジ・チョッパー・ロビン・フランキー・ブルック・ジンベエ。
  // カタログでは、一味がそろって登場するグッズの character_en に "Straw Hat Pirates"（character に「麦わらの一味」）を入れる想定。
  straw_hat_pirates: {
    ip: "one-piece",
    suggestKeyword: "straw hat pirates",
    suggestLabel: "Straw Hat Pirates",
    matchLabels: ["Straw Hat Pirates", "Straw Hats", "麦わらの一味"],
    members: [
      "ルフィ", "luffy", "ゾロ", "zoro", "ナミ", "nami", "ウソップ", "usopp", "サンジ", "sanji",
      "チョッパー", "chopper", "ロビン", "robin", "フランキー", "franky", "ブルック", "brook",
      "ジンベエ", "ジンベイ", "jinbe", "jimbei",
    ],
  },
};

export interface CharacterGroupSuggestion {
  suggest_keyword: string;
  suggest_label: string;
}

/** 提案するグループ（ip が一致するものだけ）。見つからなければ null。 */
export function findCharacterGroup(character: string | undefined, ip: string): CharacterGroup | null {
  if (!character) return null;
  const lower = character.toLowerCase();
  for (const group of Object.values(CHARACTER_GROUPS)) {
    if (group.ip !== ip) continue;
    if (group.members.some((m) => lower.includes(m.toLowerCase()))) return group;
  }
  return null;
}

export function findCharacterGroupSuggestion(character: string | undefined, ip: string): CharacterGroupSuggestion | null {
  const group = findCharacterGroup(character, ip);
  return group ? { suggest_keyword: group.suggestKeyword, suggest_label: group.suggestLabel } : null;
}

/** グループのグッズを探すときに character 列と照らす語。 */
export function groupMatchLabels(group: CharacterGroup): string[] {
  return group.matchLabels && group.matchLabels.length > 0 ? group.matchLabels : [group.suggestLabel];
}
