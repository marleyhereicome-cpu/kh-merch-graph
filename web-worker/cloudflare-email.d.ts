// Workers の組み込みモジュール cloudflare:email の型（使う分だけ）。
declare module "cloudflare:email" {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string);
  }
}
