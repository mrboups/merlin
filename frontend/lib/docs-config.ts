export interface DocSection {
  title: string;
  slug: string;
}

export const DOC_SECTIONS: DocSection[] = [
  { title: "Getting Started", slug: "getting-started" },
  { title: "Trading", slug: "trading" },
  { title: "Portfolio", slug: "portfolio" },
  { title: "Personas", slug: "personas" },
  { title: "Privacy", slug: "privacy" },
  { title: "Settings", slug: "settings" },
  { title: "FAQ", slug: "faq" },
];

export const DEV_SECTIONS: DocSection[] = [
  { title: "Architecture", slug: "architecture" },
  { title: "Auth Flow", slug: "auth-flow" },
  { title: "Chat Pipeline", slug: "chat-pipeline" },
  { title: "Trading Pipeline", slug: "trading-pipeline" },
  { title: "Privacy System", slug: "privacy-system" },
  { title: "Frontend Guide", slug: "frontend-guide" },
  { title: "Backend Guide", slug: "backend-guide" },
  { title: "API Reference", slug: "api-reference" },
  { title: "Deployment", slug: "deployment" },
];

export const SPEC_SECTIONS: DocSection[] = [
  { title: "Passkey Auth", slug: "auth-passkey" },
  { title: "AI Chat Pipeline", slug: "ai-chat-pipeline" },
  { title: "Trading Engine", slug: "trading-engine" },
  { title: "xStock Resolver", slug: "xstock-resolver" },
  { title: "Privacy (Railgun)", slug: "privacy-railgun" },
  { title: "Persona Engine", slug: "persona-engine" },
  { title: "Social Intelligence", slug: "social-intelligence" },
  { title: "EIP-7702 Gasless", slug: "eip7702-gasless" },
  { title: "Portfolio Balances", slug: "portfolio-balances" },
  { title: "Deployment Infra", slug: "deployment-infra" },
];
