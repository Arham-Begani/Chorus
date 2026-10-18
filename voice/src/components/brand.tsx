import { AudioLines } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`chorus-brand ${compact ? 'compact' : ''}`} href="/" aria-label="CHORUS home">
      <span className="brand-symbol">
        <AudioLines size={22} strokeWidth={1.5} />
      </span>
      <span>CHORUS</span>
    </a>
  );
}
