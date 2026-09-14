import MissionTaskGraph from './MissionTaskGraph';
import type { MissionEdge, MissionTask } from '../../api/missions';

/** Alias for plan-only view. */
export default function MissionPlan({
  tasks,
  order,
  edges
}: {
  tasks: MissionTask[];
  order?: string[];
  edges?: MissionEdge[];
}) {
  return <MissionTaskGraph tasks={tasks} order={order} edges={edges} />;
}
