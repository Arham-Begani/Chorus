import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'CHORUS · Mission control',
  description: 'One goal. Coordinated conversations. Evidence before action.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
