import { ratio } from "./delta";

/**
 * The session → end-goal chain every GA4 breakdown carries, so any segment (visitor type,
 * source, age, state, city, device, entry page…) reads the same way:
 *   sessions → add to carts → checkouts → purchases
 * GA4 counts add_to_cart and begin_checkout as events, so a session that adds two items counts twice.
 */
export const GOAL_METRICS = ["sessions", "addToCarts", "checkouts", "transactions"] as const;


export interface GoalFields {
  sessions: number;
  addToCarts: number;
  checkouts: number;
  transactions: number;
  /** Add to carts per session. */
  cartRate: number | null;
  /** Purchases per add to cart. */
  cartToPurchase: number | null;
  /** Purchases per session (purchase conversion rate). */
  conversionRate: number | null;
}

export function goalFields(c: { readonly [k: string]: unknown } | null | undefined): GoalFields {
  const sessions = Number(c?.sessions ?? 0);
  const addToCarts = Number(c?.addToCarts ?? 0);
  const checkouts = Number(c?.checkouts ?? 0);
  const transactions = Number(c?.transactions ?? 0);
  return {
    sessions,
    addToCarts,
    checkouts,
    transactions,
    cartRate: ratio(addToCarts, sessions),
    cartToPurchase: ratio(transactions, addToCarts),
    conversionRate: ratio(transactions, sessions),
  };
}
