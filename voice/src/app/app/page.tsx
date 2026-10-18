import type { Metadata } from 'next';
import MissionControl from '../../components/mission-control';
export const metadata: Metadata = {
  title: 'Workspace · CHORUS',
  robots: { index: false, follow: false },
};
export default function Workspace() {
  return <MissionControl />;
}
