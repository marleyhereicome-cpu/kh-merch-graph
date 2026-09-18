// 依存パッケージなしの簡易CSVパーサー。validate-data.mjs / build-data.mjs で共用する。
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ダブルクォートで囲まれたフィールド（中のカンマ・改行含む）に対応。
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM除去

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // 無視（\r\n の \n 側で改行処理する）
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function loadCsv(dataDir, filename) {
  const path = join(dataDir, filename);
  const text = readFileSync(path, "utf8");
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const records = rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
  return { header, records };
}
