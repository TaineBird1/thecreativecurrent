/**
 * Default pricing rules, mirrored from config/pricing.yaml so the Convex
 * bundler can import them (it has no filesystem). config/pricing.yaml is the
 * human-editable source; the Settings copy in the DB is what actually runs.
 *
 * GENERATED — regenerate with: pnpm pricing:sync
 */
export const PRICING_YAML = `
# The Creative Current — pricing rules
#
# The Proposal bot reads this. It may not improvise a figure that is not derived
# from these rules. Edit here, or in Settings (the Settings copy is what runs;
# this file is the default it was seeded from).

currency: ZAR
symbol: R

builds:
  floor: 9500
  ceiling: 14000
  tiers:
    - name: Starter site
      price: 9500
      pages: "up to 5"
      includes:
        - Mobile-first build
        - Contact form + click-to-call + WhatsApp button
        - Google Business Profile link and map
        - Basic on-page SEO
    - name: Trade site
      price: 11500
      pages: "up to 8"
      includes:
        - Everything in Starter
        - Filterable project gallery
        - Service pages per trade
        - Quote request form
    - name: Bilingual / systems site
      price: 14000
      pages: "8+"
      includes:
        - Everything in Trade
        - EN/AF language toggle
        - Calculator or booking flow
        - One AI agent integration point

care_plans:
  # Assigned by value-to-fee ratio. Ratio must be >= 2.0 or recommend the tier below.
  min_value_to_fee_ratio: 2.0
  tiers:
    - key: essential
      name: Essential
      monthly: 650
      includes:
        - Hosting and SSL
        - Weekly backups
        - Security and plugin updates
        - Uptime monitoring
        - 1 content change per month
    - key: growth
      name: Growth
      monthly: 1100
      includes:
        - Everything in Essential
        - 3 content changes per month
        - Monthly health report
        - Gallery and project updates
    - key: priority
      name: Priority
      monthly: 1750
      includes:
        - Everything in Growth
        - Unlimited small changes
        - Same-week turnaround
        - Quarterly strategy call
        - Priority support line

white_label:
  # For agencies reselling our build under their own brand.
  percent_of_agency_retail: [40, 60]
  hourly_rate: null   # deliberately null. We do not sell hours.
  note: "Fixed price only. Never quote an hourly rate to an agency or a client."

rules:
  - "Never discount to win work. If the price is wrong for them, recommend a smaller scope."
  - "Never quote a figure not derivable from this file."
  - "Every figure leaving the building goes to Approvals first, without exception."
  - "A care plan below the 2.0 value ratio churns. Recommend the cheaper tier."
`;
