// report_correction の保存先を差し替え可能にする（ローカル版=ファイル、公開版=KV）。
export interface CorrectionRecord {
  id: string;
  sku_id: string | null;
  field: string;
  proposed_value: string;
  source_url: string | null;
  note: string | null;
  received_at: string;
}

export interface CorrectionStore {
  append(record: CorrectionRecord): Promise<void> | void;
}
