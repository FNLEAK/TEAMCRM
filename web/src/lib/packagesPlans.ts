import type { ServicePlan } from "@/components/ui/pricing";

/** One-time project packages (web builds). */
export const ONE_TIME_PACKAGES: ServicePlan[] = [
  {
    name: "Bronze Package",
    info: "Small businesses or simple online presence",
    priceLabel: "$500 – $800",
    bestFor: "Best for: small businesses, personal sites, or a simple online presence.",
    features: [
      { text: "Simple storefront or informational website" },
      { text: "Single-page or small multi-page site (1–3 pages)" },
      { text: "Basic layout and styling" },
      { text: "Written content placement (copy)" },
      { text: "Contact form or booking link (e.g. Calendly)" },
      {
        text: "No custom backend (forms may use a form service)",
        tooltip: "Third-party form handlers (e.g. Formspree, Basin) keep scope and cost down.",
      },
      { text: "Optional launch / promo deal (as agreed)" },
      { text: "Typical use cases: personal sites, local business pages, landing pages" },
    ],
    btn: { text: "Auto-send to customer" },
  },
  {
    name: "Gold Package",
    info: "Businesses selling products online",
    priceLabel: "$800 – $1,200",
    bestFor: "Best for: selling products online with cart and checkout.",
    highlighted: true,
    features: [
      { text: "Shop-style website (online storefront)" },
      { text: "Product pages and catalog structure" },
      { text: "Shopping cart and checkout (e.g. Stripe)" },
      { text: "Basic CMS or product management" },
      { text: "Mobile-responsive design and clear branding" },
      { text: "Typical use cases: small stores, merch, limited SKU catalogs" },
    ],
    btn: { text: "Auto-send to customer" },
  },
  {
    name: "Full Web Build",
    info: "Full custom web applications",
    priceLabel: "$1,400 – $3,200",
    bestFor: "Best for: SaaS, dashboards, and apps that need backend + auth.",
    features: [
      { text: "Custom design and full-stack development" },
      { text: "Frontend + backend (e.g. Next.js + database)" },
      { text: "User authentication (login / signup)" },
      { text: "Dashboard or admin panel" },
      { text: "Database and API integration as needed" },
      { text: "Reusable tech stack and documentation handoff" },
      { text: "Short-term support after launch (as scoped)" },
      { text: "Typical use cases: SaaS, internal tools, complex business platforms" },
    ],
    btn: { text: "Auto-send to customer" },
  },
];

/** Monthly care / hosting tiers. */
export const MONTHLY_PACKAGES: ServicePlan[] = [
  {
    name: "Standard care",
    info: "Hosting + maintenance for live sites",
    priceLabel: "$100 – $125/mo",
    bestFor: "Ongoing hosting, security, and light content updates.",
    features: [
      { text: "Hosting + SSL certificate" },
      { text: "Backups and security monitoring" },
      { text: "Up to 3 small updates per month (copy, images, minor tweaks)" },
      { text: "Monthly analytics reports" },
    ],
    btn: { text: "Auto-send to customer" },
  },
  {
    name: "Premium care",
    info: "Priority support + deeper optimization",
    priceLabel: "$150 – $200/mo",
    bestFor: "Teams that want faster turnaround and strategic input.",
    highlighted: true,
    features: [
      { text: "Hosting + SSL" },
      { text: "Backups and security" },
      {
        text: "Unlimited minor edits (major features / full redesigns quoted separately)",
        tooltip: "Minor edits = text, images, small layout tweaks. New pages or large UI changes are scoped apart.",
      },
      { text: "Analytics review + recommendations" },
      { text: "Priority support" },
    ],
    btn: { text: "Auto-send to customer" },
  },
];
