# Pricing rules

> This document describes how an order total is built. It is the canonical
> reference for the finance team.

## Order of operations

An order total is composed of three parts: the goods, the tax and the shipping.

1. **Subtotal** — the sum of every line (unit price × quantity).
2. **Tax** — VAT is calculated **on the order subtotal**, using the rate of the
   destination country (21% for Spain). Tax is computed first so the taxable
   base does not depend on promotions.
3. **Discounts** — loyalty and coupon discounts are then subtracted from the
   taxed amount to reach the amount the customer pays.

> In other words: **tax is applied to the gross subtotal, before any discount.**

## Loyalty discounts

| Tier | Discount |
|---|---|
| standard | 0% |
| silver | 5% |
| gold | 10% |

Coupons add their own percentage on top of the loyalty discount.

## Shipping

A flat per-country fee applies. **Orders over €50.00 ship for free.**

## Worked example

For a €100 order shipped to Spain with a gold customer:

- Subtotal: €100.00
- Tax (21% of €100.00): €21.00
- Discount (10% of €121.00): −€12.10
- Shipping: free (over €50)
- **Total: €108.90**
