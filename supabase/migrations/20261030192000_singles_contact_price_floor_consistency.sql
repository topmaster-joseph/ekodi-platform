-- EKODI 동행: displayed contact-request minimum must agree with its maximum discount.
-- The existing formula caps a 100,000 KRW base fee at 50% discount,
-- therefore the effective minimum is 50,000 KRW regardless of the legacy 10,000 floor.
-- Financial Human Gate: deploy only through orchestrated migration checks.
-- Preserve any independently customized price rule; do not change the
-- charged amount produced by singles_price_quote for the default 50% rule.
update public.singles_price_rules
   set floor_krw=50000
 where kind='contact'
   and standard_krw=100000
   and floor_krw=10000
   and max_discount_pct=50;
