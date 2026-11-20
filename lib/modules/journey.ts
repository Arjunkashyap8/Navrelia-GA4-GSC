import "server-only";
import { Notices, type ViewContext } from "@/lib/data/context";
import { eventUsers, eventUsersBy, presentEvents } from "@/lib/data/events";
import { ratio } from "@/lib/metrics/delta";
import { safe } from "@/lib/safe";

/**
 * Ecommerce Journey & Source — event level → end goal:
 *   store funnel (view → cart → checkout → payment → purchase) with change vs comparison
 *   the same funnel by device, channel and new vs returning (all filters apply, so a filtered
 *   channel shows just that channel, matching the panel's 'every figure is narrowed')
 *   Razorpay Magic Checkout steps and friction events, by traffic source
 */

export const STORE_FUNNEL = [
  { event: "view_item", label: "Viewed a product" },
  { event: "add_to_cart", label: "Added to cart" },
  { event: "begin_checkout", label: "Started checkout" },
  { event: "add_payment_info", label: "Added payment details" },
  { event: "purchase", label: "Purchased" },
];

export const RAZORPAY_STEPS = [
  { event: "magic_checkout_requested", label: "Opened Razorpay checkout" },
  { event: "login_success", label: "Logged in (OTP)" },
  { event: "saved_address_selected", label: "Picked a saved address" },
  { event: "pay_now_clicked", label: "Clicked Pay now" },
  { event: "payment_method_selected", label: "Chose a payment method" },
  { event: "payment_successful", label: "Payment successful" },
];

export const RAZORPAY_FRICTION = [
  { event: "login_failed", label: "Login failed" },
  { event: "coupons_applied_failed", label: "Coupon failed" },
  { event: "payment_failed", label: "Payment failed" },
  { event: "remove_from_cart", label: "Removed from cart" },
  { event: "coupon_manually_entered", label: "Typed a coupon code" },
  { event: "with_coupons_continue_clicked", label: "Continued with coupon" },
  { event: "without_coupons_continue_clicked", label: "Continued without coupon" },
];

function segmentRows(by: Map<string, Map<string, number>>, label: (s: string) => string) {
  return [...by.entries()]
    .map(([seg, m]) => {
      const viewed = m.get("view_item") ?? 0;
      const purchased = m.get("purchase") ?? 0;
      return {
        segment: label(seg),
        viewed,
        added: m.get("add_to_cart") ?? 0,
        checkout: m.get("begin_checkout") ?? 0,
        purchased,
        viewToBuy: ratio(purchased, viewed),
      };
    })
    .filter((r) => r.viewed + r.purchased > 0)
    .sort((a, b) => b.viewed - a.viewed);
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export async function getJourney(ctx: ViewContext) {
  const notices = new Notices();
  const present = await presentEvents(ctx, notices);
  const funnelSteps = STORE_FUNNEL.filter((s) => present.has(s.event));
  const rzpSteps = RAZORPAY_STEPS.filter((s) => present.has(s.event));
  const rzpFriction = RAZORPAY_FRICTION.filter((s) => present.has(s.event));
  const fEvents = funnelSteps.map((s) => s.event);
  const rzpEvents = [...rzpSteps, ...rzpFriction].map((s) => s.event);

  const [stages, byDevice, byChannel, byCustomer, rzp, rzpBySource] = await Promise.all([
    eventUsers(ctx, fEvents, notices),
    safe(() => eventUsersBy(ctx, fEvents, "deviceCategory", {}, notices)),
    safe(() => eventUsersBy(ctx, fEvents, "sessionDefaultChannelGroup", {}, notices)),
    safe(() => eventUsersBy(ctx, fEvents, "newVsReturning", {}, notices)),
    rzpEvents.length ? safe(() => eventUsers(ctx, [...rzpEvents, "begin_checkout", "purchase"], notices)) : Promise.resolve(null),
    rzpEvents.length ? safe(() => eventUsersBy(ctx, [...rzpEvents, "begin_checkout", "purchase"], "sessionDefaultChannelGroup", {}, notices)) : Promise.resolve(null),
  ]);

  const funnel = stages.map((s, i) => ({ ...s, label: funnelSteps[i]!.label }));
  const overall = ratio(funnel.at(-1)?.value, funnel[0]?.value);

  const rzpMap = new Map((rzp && rzp.ok ? rzp.data : []).map((r) => [r.event, r]));
  const rzpFunnel = [{ event: "begin_checkout", label: "Started checkout" }, ...rzpSteps]
    .filter((s) => rzpMap.has(s.event))
    .map((s) => ({ ...s, value: rzpMap.get(s.event)!.value, previous: rzpMap.get(s.event)!.previous }));
  const frictionRows = rzpFriction.map((f) => ({ label: f.label, event: f.event, users: rzpMap.get(f.event)?.value ?? 0, previous: rzpMap.get(f.event)?.previous ?? null }));
  const sourceRows =
    rzpBySource && rzpBySource.ok
      ? [...rzpBySource.data.entries()]
          .map(([ch, m]) => ({
            source: ch,
            checkout: m.get("begin_checkout") ?? 0,
            rzpOpened: m.get("magic_checkout_requested") ?? 0,
            payNow: m.get("pay_now_clicked") ?? 0,
            paid: m.get("payment_successful") ?? 0,
            failed: m.get("payment_failed") ?? 0,
            purchased: m.get("purchase") ?? 0,
            checkoutToPurchase: ratio(m.get("purchase") ?? 0, m.get("begin_checkout") ?? 0),
          }))
          .filter((r) => r.checkout + r.purchased > 0)
          .sort((a, b) => b.checkout - a.checkout)
      : [];

  return {
    funnel,
    overall,
    devices: byDevice.ok ? segmentRows(byDevice.data, cap) : [],
    channels: byChannel.ok ? segmentRows(byChannel.data, (s) => s) : [],
    customers: byCustomer.ok ? segmentRows(byCustomer.data, cap).filter((r) => r.segment !== "(not set)") : [],
    rzpFunnel,
    frictionRows,
    sourceRows,
    hasRazorpay: rzpSteps.length > 0,
    notices: notices.list(),
  };
}
