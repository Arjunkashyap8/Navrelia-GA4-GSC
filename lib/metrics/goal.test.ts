import { describe, expect, it } from "vitest";
import { goalFields } from "./goal";

describe("goalFields", () => {
  it("builds the session → purchase chain with rates", () => {
    const g = goalFields({ sessions: 200, addToCarts: 20, checkouts: 8, transactions: 4, name: "Organic Search" });
    expect(g).toMatchObject({ sessions: 200, addToCarts: 20, checkouts: 8, transactions: 4 });
    expect(g.cartRate).toBeCloseTo(0.1);
    expect(g.cartToPurchase).toBeCloseTo(0.2);
    expect(g.conversionRate).toBeCloseTo(0.02);
  });

  it("treats missing metrics as zero and avoids dividing by zero", () => {
    const g = goalFields({ sessions: "0" });
    expect(g.sessions).toBe(0);
    expect(g.cartRate).toBeNull();
    expect(g.conversionRate).toBeNull();
    expect(goalFields(null).transactions).toBe(0);
  });
});
