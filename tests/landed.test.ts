import { describe, it, expect } from "vitest";
import { estimateLandedCost } from "../src/lib/landed.js";
import { proxyRates } from "../src/lib/store.js";

describe("estimateLandedCost", () => {
  it("proxyの手数料行と、proxyが'any'の日本郵便共通送料行を組み合わせて経路を作る", () => {
    const result = estimateLandedCost(
      { priceJpy: 3000, weightG: 400, destCountry: "US", proxy: "buyee" },
      proxyRates
    );

    // buyeeは手数料行(per_order 500)のみで送料行を持たないため、"any"の送料行と組み合わされる。
    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.routes.every((r) => r.proxy === "buyee")).toBe(true);

    const cheapest = result.cheapest;
    expect(cheapest).not.toBeNull();
    expect(cheapest?.shipping_method).toBe("surface");
    expect(cheapest?.fee_jpy).toBe(500); // per_order
    expect(cheapest?.shipping_jpy).toBe(800); // surface, US, 0-500g
    expect(cheapest?.total_jpy).toBe(3000 + 500 + 800);
  });
});
