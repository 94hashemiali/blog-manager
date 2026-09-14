import MissionTaskGraph from './MissionTaskGraph';

/** Alias component for plan-only view. */
export default function MissionPlan({
  tasks,
  order,
  edges
}: {
  tasks: any[];
  order?: string[];
  edges?: any[];
}) {
  return <MissionTaskGraph tasks={tasks} order={order} edges={edges} />;
}
