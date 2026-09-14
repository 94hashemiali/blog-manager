async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

const base = (siteId: string) => `/api/missions/${encodeURIComponent(siteId)}`;

export async function listMissions(siteId: string) {
  return parse(await fetch(base(siteId)));
}

export async function createMission(
  siteId: string,
  body: { title: string; description?: string; goal?: string; targetDate?: string }
) {
  return parse(
    await fetch(base(siteId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
}

export async function getMission(siteId: string, missionId: string) {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}`));
}

export async function planMission(siteId: string, missionId: string) {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/plan`, { method: 'POST' })
  );
}

export async function getMissionPlan(siteId: string, missionId: string) {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/plan`));
}

export async function startMission(siteId: string, missionId: string) {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/start`, { method: 'POST' })
  );
}

export async function pauseMission(siteId: string, missionId: string) {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/pause`, { method: 'POST' })
  );
}

export async function cancelMission(siteId: string, missionId: string) {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/cancel`, { method: 'POST' })
  );
}

export async function replanMission(siteId: string, missionId: string, reason?: string) {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/replan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    })
  );
}

export async function getMissionTasks(siteId: string, missionId: string) {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/tasks`));
}

export async function getNextMissionTask(siteId: string, missionId: string) {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/next-task`));
}

export async function getMissionEvaluation(siteId: string, missionId: string) {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/evaluation`));
}

export async function getMissionDiff(siteId: string, missionId: string) {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/diff`));
}

export async function advanceMission(siteId: string, missionId: string) {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/advance`, { method: 'POST' })
  );
}

export async function executeMissionTask(siteId: string, missionId: string, taskId: string) {
  return parse(
    await fetch(
      `${base(siteId)}/${encodeURIComponent(missionId)}/tasks/${encodeURIComponent(taskId)}/execute`,
      { method: 'POST' }
    )
  );
}

export async function approveMissionTask(siteId: string, missionId: string, taskId: string) {
  return parse(
    await fetch(
      `${base(siteId)}/${encodeURIComponent(missionId)}/tasks/${encodeURIComponent(taskId)}/approve`,
      { method: 'POST' }
    )
  );
}
