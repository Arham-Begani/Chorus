import type { Metadata } from 'next';
import './globals.css';
import './landing.css';
import './workspace.css';
export const metadata: Metadata = {
  title: 'CHORUS · Let the details talk to each other',
  description: 'One goal. Coordinated conversations. Evidence before action.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
