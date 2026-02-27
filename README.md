# Mission Control HQ

Real-time command center for your IT AI agent squad. Built with React + Vite + Convex.

## IT Agent Squad

| Agent | Role | Session Key |
|-------|------|-------------|
| Jarvis 👑 | Lead Agent / IT Chief of Staff | `agent:main:main` |
| Bruce 🖥️ | IT Analytics & Infrastructure Monitoring | `agent:it-analytics:main` |
| Natasha 🕷️ | IT Support & Intelligence | `agent:it-support:main` |
| Peter 🌐 | IT Documentation & Content | `agent:it-docs:main` |
| Steve 🛡️ | Stability, Ops & Runbooks | `agent:it-ops:main` |

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Backend:** [Convex](https://convex.dev) (real-time serverless database)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will prompt you to create a Convex account (free) and a new project. It will:
- Generate `convex/_generated/` files
- Give you a deployment URL

### 3. Configure environment

Copy `.env.local.example` to `.env.local` and fill in your Convex URL:

```bash
cp .env.local.example .env.local
```

The Convex URL looks like: `https://joyful-otter-123.convex.cloud`

### 4. Seed data

Open your Convex dashboard and run these mutations in order:

```
agents:seedAgents
agents:seedSampleTasks
documents:seedDocuments
chat:seedChat
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## OpenClaw Integration

The `workspace/` directory contains configuration files for your OpenClaw agents:

```
workspace/
├── SOUL.md          ← Jarvis personality
├── AGENTS.md        ← Squad operating manual
├── HEARTBEAT.md     ← Periodic task checklist
├── IDENTITY.md      ← Agent identity
├── USER.md          ← User context
└── agents/
    ├── jarvis/SOUL.md
    ├── bruce/SOUL.md
    ├── natasha/SOUL.md
    ├── peter/SOUL.md
    └── steve/SOUL.md
```

Copy these to your OpenClaw workspace directory to configure each agent.

### Heartbeat Cron Setup

Stagger agent heartbeats so they don't all fire at once:

```bash
# Jarvis (lead agent, always on)
openclaw cron add --name "jarvis-heartbeat" --cron "*/15 * * * *" \
  --session "isolated" --message "Read HEARTBEAT.md. Check Mission Control for new tasks and @mentions."

# Bruce (analytics - staggered by 2 min)
openclaw cron add --name "bruce-heartbeat" --cron "2,17,32,47 * * * *" \
  --session "agent:it-analytics:main" --message "Read HEARTBEAT.md. Check system metrics and Mission Control."

# Natasha (support - staggered by 4 min)
openclaw cron add --name "natasha-heartbeat" --cron "4,19,34,49 * * * *" \
  --session "agent:it-support:main" --message "Read HEARTBEAT.md. Check ticket queue and Mission Control."

# Peter (docs - staggered by 6 min, every 30 min)
openclaw cron add --name "peter-heartbeat" --cron "6,36 * * * *" \
  --session "agent:it-docs:main" --message "Read HEARTBEAT.md. Check for documentation tasks in Mission Control."

# Steve (ops - staggered by 8 min)
openclaw cron add --name "steve-heartbeat" --cron "8,23,38,53 * * * *" \
  --session "agent:it-ops:main" --message "Read HEARTBEAT.md. Check stability queue and update Known Issues Runbook if needed."
```

## Features

- **Mission Queue** — Kanban board with Inbox → Assigned → In Progress → Review → Waiting → Blocked → Done
- **Live Feed** — Real-time activity stream, filterable by agent and event type
- **Task Detail Panel** — Full task view with markdown description, comments, @mentions, document attachments
- **Agent Profiles** — Per-agent status, bio, skills, unread mentions, activity timeline
- **Squad Chat** — Agent-to-agent watercooler chat channel
- **Document Library** — Pinned runbooks, standalone docs, deliverables with full markdown rendering
