// data/*.csv → src/data/*.json の各行に対応する型。
// CSVは全列が文字列なので、ここでは文字列のまま扱う（数値変換は使う側で行う）。

export interface ProductLine {
  line_id: string;
  ip: string;
  name_ja: string;
  name_en: string;
  aliases: string;
  maker: string;
  line_type: string;
  // 商品ラインの既定の入手経路。catalog.csv 側で行ごとに上書きされていない場合の目安。
  acquisition_type: string;
  release_date: string;
  source_url: string;
  notes: string;
}

export interface CatalogSku {
  sku_id: string;
  line_id: string;
  ip: string;
  character: string;
  character_en: string;
  name_ja: string;
  name_en: string;
  aliases: string;
  variant: string;
  design_variants: string;
  msrp_jpy: string;
  price_basis: string;
  // 入手経路: retail/kuji/prize/capsule/blind/bonus/furoku/event/novelty/set/western_license
  acquisition_type: string;
  currency: string;
  // ブラインド・ガチャ等で中身が選べない場合の全種類数（不明・非該当なら空欄）
  design_count: string;
  // セット商品の内訳（`|` 区切り、非該当なら空欄）
  set_components: string;
  // 特典・封入特典の場合、本体となる商品の sku_id または line_id（非該当なら空欄）
  bonus_of: string;
  // jp_retail_new/jp_secondhand_only/western_official/event_only/unknown
  availability_hint: string;
  // 主な入手チャネル（`|` 区切り、data/channels.csv の channel_name と対応）
  typical_channels: string;
  width_mm: string;
  height_mm: string;
  depth_mm: string;
  weight_g: string;
  jan: string;
  official: string;
  rerelease_dates: string;
  source_url: string;
  verified: string;
  notes: string;
}

export interface Channel {
  channel_name: string;
  channel_type: string;
  country: string;
  search_url_template: string;
  proxy_required: string;
  source_url: string;
}

export interface ConditionTerm {
  term_ja: string;
  variants: string;
  term_en: string;
  meaning_en: string;
  price_effect: string;
  risk_flag: string;
}

export interface BootlegPattern {
  line_id: string;
  pattern: string;
  message_en: string;
  source_url: string;
}

export interface ProxyRate {
  proxy: string;
  fee_type: string;
  fee_value: string;
  shipping_method: string;
  dest_country: string;
  weight_from_g: string;
  weight_to_g: string;
  shipping_jpy: string;
  duty_note: string;
  updated: string;
  source_url: string;
}

export interface OtherIpKeyword {
  keyword: string;
  notes: string;
}

export interface KhEvent {
  date: string;
  ip: string;
  event_type: string;
  title_en: string;
  affected_lines: string;
  source_url: string;
}

// `|` 区切りのCSV列を配列に分解する（空文字は空配列）。
export function splitPipe(value: string): string[] {
  if (!value) return [];
  return value
    .split("|")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}
