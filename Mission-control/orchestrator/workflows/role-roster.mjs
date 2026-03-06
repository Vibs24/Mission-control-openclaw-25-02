export const CANONICAL_ROLE_ROSTER = [
  {
    roleKey: "chief",
    name: "Chief",
    role: "Chief Agent / Orchestration Authority",
    specialty: "Owns intake triage, policy enforcement, escalation, and recovery control.",
    emoji: "👑",
    sessionKey: "agent:chief:main",
    displayOrder: 1,
  },
  {
    roleKey: "project_manager",
    name: "Project Manager",
    role: "Project Manager / Dependency Coordinator",
    specialty: "Builds dependency graphs and coordinates parallel specialist execution.",
    emoji: "📋",
    sessionKey: "agent:project-manager:main",
    displayOrder: 2,
  },
  {
    roleKey: "frontend",
    name: "Frontend",
    role: "Frontend Specialist",
    specialty: "Implements UI views, interaction logic, and responsive client behavior.",
    emoji: "🧩",
    sessionKey: "agent:frontend:main",
    displayOrder: 3,
  },
  {
    roleKey: "designer",
    name: "Designer",
    role: "Designer Specialist",
    specialty: "Owns UX quality, visual hierarchy, and design consistency.",
    emoji: "🎨",
    sessionKey: "agent:designer:main",
    displayOrder: 4,
  },
  {
    roleKey: "database",
    name: "Database",
    role: "Database Specialist",
    specialty: "Owns schema design, migrations, persistence correctness, and query performance.",
    emoji: "🗄️",
    sessionKey: "agent:database:main",
    displayOrder: 5,
  },
  {
    roleKey: "backend",
    name: "Backend",
    role: "Backend Specialist",
    specialty: "Implements service/API logic, integrations, and server-side reliability.",
    emoji: "🛠️",
    sessionKey: "agent:backend:main",
    displayOrder: 6,
  },
  {
    roleKey: "documentation",
    name: "Documentation",
    role: "Documentation Specialist",
    specialty: "Produces runbooks, guides, and implementation handoff documents.",
    emoji: "📝",
    sessionKey: "agent:documentation:main",
    displayOrder: 7,
  },
  {
    roleKey: "operations",
    name: "Operations",
    role: "Operations Specialist",
    specialty: "Owns deploy safety, rollback plans, incident mitigation, and stability checks.",
    emoji: "🛡️",
    sessionKey: "agent:operations:main",
    displayOrder: 8,
  },
  {
    roleKey: "reviewer",
    name: "Reviewer",
    role: "Reviewer / QA Gate",
    specialty: "Validates evidence completeness, correctness, and acceptance criteria before done.",
    emoji: "✅",
    sessionKey: "agent:reviewer:main",
    displayOrder: 9,
  },
];

export const CANONICAL_ROLE_NAMES = new Set(CANONICAL_ROLE_ROSTER.map((entry) => entry.name));
export const CANONICAL_ROLE_KEYS = new Set(CANONICAL_ROLE_ROSTER.map((entry) => entry.roleKey));

export const LEGACY_AGENT_NAMES = ["Jarvis", "Dev", "Bruce", "Natasha", "Peter", "Steve"];

export function canonicalRoleByName(name = "") {
  const key = String(name || "").trim().toLowerCase();
  return CANONICAL_ROLE_ROSTER.find((entry) => entry.name.toLowerCase() === key) || null;
}

export function canonicalRoleByKey(roleKey = "") {
  const key = String(roleKey || "").trim().toLowerCase();
  return CANONICAL_ROLE_ROSTER.find((entry) => entry.roleKey === key) || null;
}
