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
