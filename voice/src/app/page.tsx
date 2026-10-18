import { redirect } from 'next/navigation';
import Landing from '../components/landing';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mission?: string }>;
}) {
  const { mission } = await searchParams;
  if (typeof mission === 'string' && /^[a-f0-9-]{36}$/i.test(mission))
    redirect(`/app?mission=${encodeURIComponent(mission)}`);
  return <Landing />;
}
