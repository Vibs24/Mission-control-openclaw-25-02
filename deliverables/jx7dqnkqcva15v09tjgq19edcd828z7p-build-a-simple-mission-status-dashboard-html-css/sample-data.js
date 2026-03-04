const missionData = {
  kpis: [
    { label: 'Total Missions', value: '12' },
    { label: 'On Track', value: '8' },
    { label: 'At Risk', value: '3' },
    { label: 'Blocked', value: '1' },
    { label: 'Avg Progress', value: '74%' }
  ],
  rows: [
    { mission: 'Release Readiness', owner: 'Dev', priority: 'High', status: 'On Track', statusClass: 'green', progress: 82, eta: '2026-03-06' },
    { mission: 'Digest Reliability', owner: 'PM', priority: 'High', status: 'At Risk', statusClass: 'yellow', progress: 61, eta: '2026-03-07' },
    { mission: 'Reviewer SLA', owner: 'Reviewer', priority: 'Medium', status: 'On Track', statusClass: 'green', progress: 79, eta: '2026-03-08' },
    { mission: 'Bot Poller Stability', owner: 'Ops', priority: 'High', status: 'Blocked', statusClass: 'red', progress: 40, eta: '2026-03-10' },
    { mission: 'Parallel Workflow QA', owner: 'QA', priority: 'Medium', status: 'On Track', statusClass: 'green', progress: 88, eta: '2026-03-05' }
  ]
};
