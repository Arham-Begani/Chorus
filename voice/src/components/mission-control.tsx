'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, Handle, Position, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  Box,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Headphones,
  MapPin,
  Mic,
  Network,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Truck,
  Users,
  Utensils,
  X,
  Download,
  WifiOff,
  Search,
} from 'lucide-react';
import type { BolnaWebCall } from '@bolna/web-call';
import type { Mission, Offer, TaskKind, Terms } from '../core/types';
import ConductorPanel from './conductor-panel';
import CallReadiness from './call-readiness';
import QuoteLedger from './quote-ledger';
import PlanChecks from './plan-checks';
import EvidenceContent, { type EvidenceFilter } from './evidence-content';
import { Brand } from './brand';
import { ApiError, requestJSON as api } from '../client/api';
import {
  callOutcome,
  exportBrief,
  missionGuidance,
  currentOffer as current,
  formatMoney as money,
} from '../core/presentation';
type Ready = {
  realEnabled: boolean;
  missing: string[];
  outboundConcurrency: number;
  authMode: string;
  hasAllowlist: boolean;
};
const icons = {
  venue: MapPin,
  caterer: Utensils,
  transport: Truck,
  equipment: Box,
  delivery: Truck,
};
function FlowNode({ data }: NodeProps) {
  const kind = data.kind as TaskKind | undefined;
  const Icon = kind ? icons[kind] : AudioLines;
  return (
    <div className={`flow-node ${data.conductor ? 'conductor' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flow-node-top">
        <span className="node-icon">
          <Icon size={18} />
        </span>
        <span className={`state ${data.state === 'in-progress' ? 'active' : ''}`}>
          {String(data.state)}
        </span>
      </div>
      <strong>{String(data.label)}</strong>
      <span>{String(data.detail)}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { mission: FlowNode };
function MissionGraph({ m }: { m: Mission }) {
  const reduced = useReducedMotion();
  const nodes = [
    {
      id: 'conductor',
      type: 'mission',
      position: { x: 270, y: 0 },
      data: {
        label: 'Conductor',
        state: `REV ${m.revision}`,
        detail: 'One shared mission brief',
        conductor: true,
      },
    },
    ...m.tasks.map((t, i) => {
      const a = [...m.attempts].reverse().find((a) => a.taskId === t.id);
      const o = current(m, t.id);
      return {
        id: t.id,
        type: 'mission',
        position: { x: i * 270 + (m.tasks.length === 2 ? 135 : 0), y: 170 },
        data: {
          kind: t.kind,
          label: m.contacts.find((c) => c.id === t.contactId)?.name || t.title,
          state: a ? callOutcome(a) : 'awaiting approval',
          detail: o
            ? `${money(o.priceMinor)} · ${o.confirmation}`
            : t.kind.charAt(0).toUpperCase() + t.kind.slice(1),
        },
      };
    }),
  ];
  const edges = [
    ...m.tasks.map((t) => ({
      id: `c-${t.id}`,
      source: 'conductor',
      target: t.id,
      animated: !reduced && m.attempts.some((a) => a.taskId === t.id && a.status === 'in-progress'),
      style: { stroke: 'var(--accent)', strokeWidth: 1 },
    })),
    ...m.tasks.flatMap((t) =>
      t.dependsOn.map((from) => ({
        id: `${from}-${t.id}`,
        source: from,
        target: t.id,
        animated: false,
        style: { stroke: 'var(--coordination)', strokeWidth: 1, strokeDasharray: '4 4' },
      })),
    ),
  ];
  return (
    <div className="graph" aria-label="Mission dependency graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesFocusable={false}
        autoPanOnNodeFocus={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        nodesConnectable={false}
        edgesFocusable={false}
        minZoom={0.2}
        maxZoom={1.2}
        colorMode="dark"
        proOptions={{ hideAttribution: false }}
      >
        <Background color="#27313a" gap={24} size={1} />
      </ReactFlow>
    </div>
  );
}
export default function MissionControl() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [ready, setReady] = useState<Ready | null>(null),
    [password, setPassword] = useState(''),
    [email, setEmail] = useState(''),
    [missions, setMissions] = useState<Mission[]>([]),
    [m, setM] = useState<Mission | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [drawer, setDrawer] = useState(false),
    [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('all'),
    [modal, setModal] = useState<
      'new' | 'constraints' | 'responses' | 'contacts' | 'conductor' | 'readiness' | null
    >(null),
    [scenario, setScenario] = useState<'relocation' | 'equipment'>('relocation'),
    [mode, setMode] = useState<'simulation' | 'real'>('simulation'),
    [goal, setGoal] = useState(''),
    [voiceState, setVoiceState] = useState('idle'),
    [volume, setVolume] = useState(0),
    [responseKind, setResponseKind] = useState<TaskKind>('venue'),
    [responseText, setResponseText] = useState(''),
    [callBudget, setCallBudget] = useState('300');
  const [initializing, setInitializing] = useState(true),
    [bootstrapError, setBootstrapError] = useState(''),
    [syncError, setSyncError] = useState(''),
    [lastSync, setLastSync] = useState<number | null>(null),
    [missionSearch, setMissionSearch] = useState('');
  const call = useRef<BolnaWebCall | null>(null),
    selected = useRef<string | null>(null),
    loadEpoch = useRef(0),
    startApplied = useRef(false),
    busyNow = useRef(busy),
    editRevision = useRef<number | undefined>(undefined);
  busyNow.current = busy;
  const openEvidence = (filter: EvidenceFilter = 'all') => {
    setEvidenceFilter(filter);
    setDrawer(true);
  };
  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    const items = await api<Mission[]>('missions');
    if (epoch !== loadEpoch.current) return;
    const requested =
      selected.current || new URLSearchParams(location.search).get('mission') || items[0]?.id;
    let id =
      requested && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requested)
        ? requested
        : items[0]?.id;
    let next: Mission | null = null;
    if (id) {
      try {
        next = await api<Mission>(`missions/${id}`);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
        id = items[0]?.id;
        next = id ? await api<Mission>(`missions/${id}`) : null;
      }
    }
    if (epoch !== loadEpoch.current) return;
    selected.current = id || null;
    if (requested && requested !== id)
      history.replaceState(null, '', id ? `?mission=${id}` : '/app');
    if (next && !items.some((item) => item.id === next.id)) items.unshift(next);
    setMissions(items);
    setM(next);
    setSyncError('');
    setLastSync(Date.now());
    setInitializing(false);
  }, []);
  const connect = useCallback(async () => {
    setBootstrapError('');
    try {
      const session = await api<{ readiness: Ready }>('session');
      setReady(session.readiness);
      setAuthenticated(true);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAuthenticated(false);
        setInitializing(false);
      } else setBootstrapError((e as Error).message);
    }
  }, [load]);
  useEffect(() => {
    void connect();
    const expired = () => {
      setAuthenticated(false);
      setInitializing(false);
      setModal(null);
      setError('Your session ended. Sign in again to continue.');
      void call.current?.stop();
    };
    window.addEventListener('chorus:session-expired', expired);
    return () => {
      void call.current?.stop();
      window.removeEventListener('chorus:session-expired', expired);
    };
  }, [connect]);
  useEffect(() => {
    if (!authenticated || initializing || startApplied.current) return;
    startApplied.current = true;
    const params = new URLSearchParams(location.search),
      start = params.get('start');
    if (start) {
      params.delete('start');
      history.replaceState(null, '', `/app${params.size ? '?' + params.toString() : ''}`);
      if (start === 'conductor') setModal('conductor');
      if (start === 'relocation' || start === 'equipment') {
        setScenario(start);
        setModal('new');
      }
    }
  }, [authenticated, initializing]);
  useEffect(() => {
    if (!authenticated) return;
    let running = false,
      stopped = false,
      failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (running || stopped) return;
      if (document.hidden) {
        timer = setTimeout(refresh, 5000);
        return;
      }
      if (!navigator.onLine) {
        setSyncError('You appear to be offline. Reconnect to receive new updates.');
        timer = setTimeout(refresh, 5000);
        return;
      }
      running = true;
      try {
        await load();
        failures = 0;
      } catch (e) {
        failures++;
        setSyncError((e as Error).message);
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(refresh, Math.min(1500 * 2 ** failures, 15000));
      }
    };
    const wake = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        failures = 0;
        void refresh();
      }
    };
    timer = setTimeout(refresh, 1500);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      ++loadEpoch.current;
    };
  }, [authenticated, load]);
  useEffect(() => {
    if (!modal && !drawer) return;
    if (modal === 'constraints') editRevision.current = m?.revision;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const selector =
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary';
    dialog?.querySelector<HTMLElement>(selector)?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (busyNow.current && modal === 'conductor') return;
        setModal(null);
        setDrawer(false);
      }
      if (e.key === 'Tab' && dialog) {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
          (x) => x.offsetParent !== null,
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [modal, drawer]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'n' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !modal &&
        !drawer &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      )
        setModal('new');
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [modal, drawer]);
  async function run(fn: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const action = (name: string, data: unknown = {}) =>
    run(async () => {
      ++loadEpoch.current;
      const next = await api<Mission>(`missions/${selected.current}/${name}`, data);
      setM(next);
      await load().catch((e) => setSyncError((e as Error).message));
    });
  function choose(id: string) {
    void call.current?.stop();
    setVoiceState('idle');
    selected.current = id;
    ++loadEpoch.current;
    history.replaceState(null, '', `?mission=${id}`);
    void run(load);
  }
  async function logout() {
    await run(async () => {
      await api('logout', {});
      setM(null);
      setMissions([]);
      selected.current = null;
      setModal(null);
      void call.current?.stop();
      setAuthenticated(false);
    });
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('auth', { email, password });
      setPassword('');
      const session = await api<{ readiness: Ready }>('session');
      setReady(session.readiness);
      setInitializing(true);
      setAuthenticated(true);
      await load().catch((e) => {
        setBootstrapError((e as Error).message);
        throw e;
      });
    });
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const next = await api<Mission>('missions', { scenario, mode, goal: goal || undefined });
      selected.current = next.id;
      history.replaceState(null, '', `?mission=${next.id}`);
      setM(next);
      setModal(null);
      setGoal('');
      await load().catch((e) => setSyncError((e as Error).message));
    });
  }
  function downloadBrief() {
    if (!m) return;
    const blob = new Blob([exportBrief(m)], { type: 'text/markdown;charset=utf-8' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `chorus-${m.id.slice(0, 8)}-revision-${m.revision}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Your brief was exported with the current terms and source references.');
  }
  function reviewDecisions() {
    setModal(null);
    setTimeout(() => {
      const section = document.getElementById('decisions');
      section?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
      section?.focus({ preventScroll: true });
    }, 0);
  }
  async function voice() {
    await run(async () => {
      if (call.current && voiceState !== 'idle' && voiceState !== 'ended') {
        await call.current.stop();
        return;
      }
      if (!m) return;
      const { BolnaWebCall } = await import('@bolna/web-call');
      const instance = new BolnaWebCall({
        getSession: () => api(`missions/${m.id}/voice`),
        debug: false,
      });
      call.current = instance;
      instance.on('state-change', (state) => setVoiceState(state));
      instance.on('volume-level', (v) => setVolume(v));
      instance.on('error', (e) => {
        setError(e.message);
        setVoiceState('ended');
      });
      instance.on('call-end', () => {
        setVoiceState('ended');
        setVolume(0);
      });
      setVoiceState('connecting');
      try {
        await instance.start();
      } catch (e) {
        setVoiceState('ended');
        throw e;
      }
    });
  }
  const time = (iso: string) =>
    m
      ? new Intl.DateTimeFormat('en-IN', {
          timeZone: m.constraints.timezone,
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(iso))
      : iso;
  const active =
    m?.attempts.filter((a) =>
      [
        'dispatching',
        'uncertain',
        'queued',
        'initiated',
        'ringing',
        'in-progress',
        'call-disconnected',
      ].includes(a.status),
    ).length || 0;
  const pending =
    m?.approvals.filter((a) => a.status === 'requested' && a.revision === m.revision) || [];
  const meaningful = m?.conflicts.filter((c) => c.kind !== 'missing') || [];
  const guidance = m ? missionGuidance(m) : null;
  const filteredMissions = missions.filter((item) =>
    (item.title + ' ' + item.goal + ' ' + item.scenario)
      .toLowerCase()
      .includes(missionSearch.toLowerCase()),
  );
  if (bootstrapError)
    return (
      <main className="connection-screen">
        <Brand />
        <div>
          <WifiOff size={28} />
          <h1>Let’s reconnect your workspace.</h1>
          <p>{bootstrapError}</p>
          <button className="primary" onClick={() => void connect()}>
            <RefreshCw size={16} />
            Try again
          </button>
          <a href="/" className="text-button">
            Back to CHORUS
          </a>
        </div>
      </main>
    );
  if (authenticated === null || (authenticated && initializing))
    return (
      <main className="workspace-loading" aria-busy="true" aria-label="Loading mission control">
        <Brand />
        <div className="loading-skeleton">
          <span />
          <span />
          <div />
          <div />
        </div>
        <p role="status">Opening your workspace…</p>
      </main>
    );
  if (!authenticated)
    return (
      <main className="login-shell">
        <div className="login-brand">
          <Brand />
        </div>
        <form onSubmit={login} className="login-panel">
          <span className="eyebrow">MISSION CONTROL</span>
          <h1>Welcome to your workspace.</h1>
          <p>Bring the moving parts together. Pick up where you left off.</p>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            Open mission control <ArrowUpRight size={16} />
          </button>
          <p className="caption">Sign in with your CHORUS account.</p>
        </form>
        <span className="login-footer">Evidence before action. Always.</span>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="avatar">Y</span>
          <div>
            Your workspace<small>Personal mission control</small>
          </div>
        </div>
        <button className="new-mission" onClick={() => setModal('new')}>
          <Plus size={16} /> New mission <kbd>N</kbd>
        </button>
        <span className="nav-label">WORKSPACE</span>
        <a className="nav-item selected" href="#mission">
          <Network size={16} /> Mission control
        </a>
        <button className="nav-item" onClick={() => openEvidence()}>
          <FileText size={16} /> Evidence log <span>{m?.events.length || 0}</span>
        </button>
        <div className="side-section">
          <span className="nav-label">YOUR MISSIONS</span>
          {missions.length > 3 && (
            <label className="mission-search">
              <Search size={14} />
              <input
                aria-label="Search missions"
                value={missionSearch}
                onChange={(e) => setMissionSearch(e.target.value)}
                placeholder="Search missions…"
              />
            </label>
          )}
          {missions.length === 0 ? (
            <p className="caption">Your first mission starts here.</p>
          ) : (
            filteredMissions.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                onClick={() => choose(item.id)}
                className={`mission-link ${m?.id === item.id ? 'chosen' : ''}`}
              >
                <span className={`tiny-dot ${item.status}`} />
                <span>
                  <strong>
                    {item.scenario === 'relocation' ? 'Event relocation' : 'Equipment & delivery'}
                  </strong>
                  <small>
                    {item.id.slice(0, 6)} · Rev {item.revision} · {item.status}
                  </small>
                </span>
                <ChevronRight size={12} />
              </button>
            ))
          )}
          {missions.length > 0 && filteredMissions.length === 0 && (
            <p className="caption">
              No missions match.{' '}
              <button className="text-button" onClick={() => setMissionSearch('')}>
                Clear search
              </button>
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className={`tiny-dot ${syncError ? 'blocked' : 'ready'}`} />{' '}
            {syncError ? 'Reconnecting…' : 'Workspace connected'}
          </div>
          <small>{ready?.authMode}</small>
          <button className="nav-item" onClick={logout}>
            Sign out <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <a className="mobile-brand" href="/" aria-label="CHORUS home">
            <AudioLines size={18} />
            CHORUS
          </a>
          <div>
            <Network size={15} />
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>Mission control</strong>
          </div>
          <button
            className="mobile-new icon-button"
            aria-label="Create mission"
            onClick={() => setModal('new')}
          >
            <Plus size={18} />
          </button>
          <span className={`mode-badge ${m?.mode === 'real' ? 'real' : ''}`}>
            <span className="tiny-dot" />
            {m?.mode === 'real' ? 'REAL CALLS' : 'SIMULATION'}
            <span className="badge-detail">
              {m?.mode === 'real' ? 'Authorized participants only' : 'No phone calls are placed'}
            </span>
          </span>
          <button
            className="icon-button"
            aria-label="Call readiness"
            title="Call readiness"
            onClick={() => setModal('readiness')}
          >
            <Phone size={17} />
          </button>
        </header>
        <main id="mission" className="main-content">
          {missions.length > 0 && (
            <div className="mobile-mission-switch">
              <label htmlFor="mission-switch">Your missions</label>
              <select
                id="mission-switch"
                value={m?.id || ''}
                disabled={busy}
                onChange={(e) => choose(e.target.value)}
              >
                {missions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.scenario === 'relocation' ? 'Event relocation' : 'Equipment & delivery'} ·{' '}
                    {item.id.slice(0, 6)} · Rev {item.revision}
                  </option>
                ))}
              </select>
              <details className="workspace-menu">
                <summary aria-label="Workspace menu">
                  <Users size={18} />
                </summary>
                <div>
                  <a href="/">
                    CHORUS home <ArrowUpRight size={14} />
                  </a>
                  <button onClick={logout} disabled={busy}>
                    Sign out <ArrowUpRight size={14} />
                  </button>
                </div>
              </details>
            </div>
          )}
          {syncError && (
            <div className="sync-banner" role="status">
              <WifiOff size={16} />
              <div>
                <strong>Showing your last saved view.</strong>
                <span>
                  {syncError}
                  {lastSync
                    ? ` Last synced ${new Date(lastSync).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`
                    : ''}
                </span>
              </div>
              <button
                className="secondary"
                onClick={() => void load().catch((e) => setSyncError((e as Error).message))}
              >
                <RefreshCw size={14} />
                Reconnect
              </button>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert">
              {notice}
            </div>
          )}
          {!m ? (
            <section className="empty-state">
              <span className="eyebrow">YOUR CONDUCTOR IS READY</span>
              <h1>
                Bring the moving parts
                <br />
                into one conversation.
              </h1>
              <p>
                Set a goal. Review the contacts. Let coordinated conversations find a plan you can
                trust.
              </p>
              <button className="primary" onClick={() => setModal('conductor')}>
                <Mic size={16} /> Talk to conductor
              </button>{' '}
              <button className="secondary" onClick={() => setModal('new')}>
                <Plus size={16} /> Create your first mission
              </button>
              <div className="empty-scenarios">
                <span>
                  <MapPin /> Event relocation
                </span>
                <span>
                  <Box /> Equipment & delivery
                </span>
              </div>
            </section>
          ) : (
            <>
              <section className="mission-heading">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-dot" /> MISSION {m.id.slice(0, 8).toUpperCase()}{' '}
                    <span className="revision-label">REVISION {m.revision}</span>
                  </div>
                  <h1>{m.title}</h1>
                  <p>{m.goal}</p>
                  <div className="mission-meta">
                    <span>
                      <Users size={14} />
                      {m.constraints.quantity} {m.scenario === 'relocation' ? 'guests' : 'capacity'}
                    </span>
                    <span>
                      <Clock size={14} />
                      {time(m.constraints.eventStart)} · {m.constraints.timezone}
                    </span>
                    <span>
                      <ShieldCheck size={14} />
                      Research & planning only
                    </span>
                  </div>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={downloadBrief}>
                    <Download size={14} />
                    Export brief
                  </button>
                  <span className={`status-pill ${m.status}`}>
                    <span className="tiny-dot" />
                    {
                      {
                        draft: 'Awaiting authorization',
                        running: 'Coordinating',
                        paused: 'Paused',
                        blocked: 'Needs attention',
                        ready: 'Plan ready',
                        approved: 'Plan approved',
                      }[m.status]
                    }
                  </span>
                  {m.status !== 'draft' && (
                    <button
                      disabled={busy}
                      className="secondary"
                      onClick={() => action(m.status === 'paused' ? 'resume' : 'pause')}
                    >
                      {m.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}{' '}
                      {m.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  )}
                </div>
              </section>
              {guidance && (
                <section className={`next-step ${m.status}`} aria-label="Your next step">
                  <span className="next-step-icon">
                    <ShieldCheck size={20} />
                  </span>
                  <div>
                    <span className="eyebrow">
                      {m.status === 'ready' ? 'READY FOR REVIEW' : 'YOUR NEXT STEP'}
                    </span>
                    <h2>{guidance.title}</h2>
                    <p>{guidance.detail}</p>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (guidance.kind === 'resume') void action('resume');
                      else if (guidance.kind === 'decisions') reviewDecisions();
                      else if (guidance.kind === 'export') downloadBrief();
                      else if (guidance.kind === 'conductor') setModal('conductor');
                      else
                        document.getElementById('conversations')?.scrollIntoView({
                          block: 'start',
                          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? 'instant'
                            : 'smooth',
                        });
                    }}
                  >
                    {guidance.action}
                    <ArrowUpRight size={14} />
                  </button>
                </section>
              )}
              <div className="mission-summary" aria-label="Mission summary">
                <div>
                  <span>Current terms</span>
                  <strong>
                    {m.tasks.filter((t) => !!current(m, t.id)).length}
                    <small> / {m.tasks.length} received</small>
                  </strong>
                </div>
                <div>
                  <span>Quoted total</span>
                  <strong>
                    {money(m.plan.totalMinor)}
                    <small> of {money(m.constraints.budgetMinor)}</small>
                  </strong>
                </div>
                <div>
                  <span>Open checks</span>
                  <strong>
                    {m.conflicts.length}
                    <small>{m.plan.feasible ? ' all checks pass' : ' to resolve'}</small>
                  </strong>
                </div>
              </div>
              <section className="conductor-bar">
                <div
                  className={`conductor-orb ${voiceState === 'active' ? 'speaking' : ''}`}
                  style={{ transform: `scale(${1 + volume * 0.1})` }}
                >
                  <AudioLines size={26} />
                </div>
                <div className="conductor-copy">
                  <strong>
                    {voiceState === 'active'
                      ? 'Your conductor is listening'
                      : voiceState === 'connecting'
                        ? 'Connecting to Bolna…'
                        : 'Your goal. One shared understanding.'}
                  </strong>
                  <span>
                    {m.mode === 'simulation'
                      ? 'Speak or type goals and revisions. Coordinated simulations need no phone number.'
                      : ready?.realEnabled
                        ? 'Talk to revise constraints. Phone agents receive changes on their next brief refresh.'
                        : 'Complete live configuration to connect the conductor.'}
                  </span>
                </div>
                <button
                  className="voice-button"
                  disabled={busy}
                  onClick={() => setModal('conductor')}
                >
                  <Mic size={16} />
                  Talk to conductor
                </button>
                {m.mode === 'real' && ready?.realEnabled && (
                  <button className="secondary" disabled={busy} onClick={voice}>
                    {['active', 'ringing', 'connecting'].includes(voiceState)
                      ? 'End Bolna conversation'
                      : 'Connect Bolna voice'}
                  </button>
                )}
                <button className="text-button" onClick={() => setModal('constraints')}>
                  Revise goal <ArrowUpRight size={14} />
                </button>
              </section>
              <nav className="workspace-sections" aria-label="Mission sections">
                <a href="#quotes">
                  <FileText size={14} /> Quotes & readiness
                </a>
                <a href="#plan-checks">
                  <Check size={14} /> Plan checks
                </a>
                <a href="#mission-overview">
                  <Network size={14} /> Coordination
                </a>
                <a href="#conversations">
                  <Phone size={14} /> Conversations
                </a>
                <a href="#decisions">
                  <ShieldCheck size={14} /> Your decision
                </a>
              </nav>
              <QuoteLedger mission={m} onEvidence={() => openEvidence('quotes')} />
              <PlanChecks mission={m} onEvidence={() => openEvidence('quotes')} />
              <div className="dashboard-grid">
                <div className="main-column">
                  <section className="panel graph-panel" id="mission-overview">
                    <div className="panel-header">
                      <div>
                        <span className="eyebrow">SHARED INTELLIGENCE</span>
                        <h2>One mission. {m.tasks.length} conversations.</h2>
                      </div>
                      <span className="subtle-badge">
                        <Activity size={12} />
                        {active} active {m.mode === 'simulation' ? 'simulations' : 'calls'}
                      </span>
                    </div>
                    <MissionGraph m={m} />
                    <div className="graph-legend">
                      <span>
                        <i className="legend-line" /> Conductor brief
                      </span>
                      <span>
                        <i className="legend-line violet" /> Cross-call dependency
                      </span>
                      <span className="push-right">Updates from persisted events</span>
                    </div>
                  </section>
                  {meaningful.length > 0 && (
                    <section className="conflict-box" aria-label="Coordination conflicts">
                      <div className="conflict-icon">!</div>
                      <div>
                        <strong>
                          {meaningful.length === 1
                            ? 'A detail needs resolving'
                            : `${meaningful.length} details need resolving`}
                        </strong>
                        {meaningful.map((c) => (
                          <div key={c.id}>
                            <p>{c.message}</p>
                            {c.kind === 'clarification' && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const form = new FormData(e.currentTarget);
                                  void action('clarify', {
                                    conflictId: c.id,
                                    answer: form.get('answer'),
                                  });
                                }}
                              >
                                <input
                                  required
                                  name="answer"
                                  aria-label="Clarification answer"
                                  placeholder="Give the agent an answer"
                                />
                                <button className="secondary">Send answer</button>
                              </form>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  <section className="contact-section" id="conversations">
                    <div className="section-heading">
                      <h2>Conversations</h2>
                      <button className="text-button" onClick={() => setModal('contacts')}>
                        <Settings2 size={14} /> Contacts
                      </button>
                    </div>
                    <div className="contact-grid">
                      {m.tasks.map((t) => {
                        const Icon = icons[t.kind],
                          c = m.contacts.find((c) => c.id === t.contactId)!,
                          a = [...m.attempts].reverse().find((a) => a.taskId === t.id),
                          o = current(m, t.id);
                        return (
                          <article className="contact-card" key={t.id}>
                            <div className="contact-top">
                              <span className="contact-icon">
                                <Icon size={18} />
                              </span>
                              <span className="eyebrow">{t.kind}</span>
                              <span className={`tiny-dot ${t.state}`} />
                            </div>
                            <h3>{c.name}</h3>
                            <span className="call-state">
                              <Phone size={12} />
                              {a?.status.replaceAll('-', ' ') || 'Awaiting approval'}{' '}
                              {m.mode === 'simulation' && '· simulated'}
                            </span>
                            <p className="contact-question">{t.question}</p>
                            {o ? (
                              <div className="offer-summary">
                                <strong>{money(o.priceMinor)}</strong>
                                <span className={`term-label ${o.confirmation}`}>
                                  {o.confirmation}
                                </span>
                                <p>{o.description}</p>
                                {o.readyAt && <small>Ready / access: {time(o.readyAt)}</small>}
                                {o.setupMinutes !== undefined && (
                                  <small>Setup: {o.setupMinutes} minutes</small>
                                )}
                                <button
                                  className="text-button"
                                  disabled={busy || m.status === 'paused'}
                                  onClick={() => action('decline', { offerId: o.id })}
                                >
                                  Decline terms
                                </button>
                              </div>
                            ) : (
                              <div className="no-terms">
                                {t.state === 'blocked'
                                  ? 'No acceptable terms received.'
                                  : 'Current terms will appear here.'}
                              </div>
                            )}
                            <div className="contact-footer">
                              <span>
                                Attempt {t.rounds} · Rev {a?.revision || m.revision}
                              </span>
                              <button
                                className="icon-button"
                                aria-label={`View ${c.name} evidence`}
                                onClick={() => openEvidence()}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </div>
                            {a?.mode === 'real' && a.providerStatus && (
                              <p className="caption">
                                {callOutcome(a)}
                                {a.providerDurationSeconds !== undefined &&
                                  ` · ${a.providerDurationSeconds}s`}
                                {a.providerCostCents !== undefined &&
                                  ` · provider cost $${(a.providerCostCents / 100).toFixed(2)} USD`}
                                {!a.providerBillingSettled && ' · billing pending'}
                              </p>
                            )}
                            {t.state === 'blocked' && (
                              <button
                                className="secondary"
                                disabled={busy || m.status === 'paused'}
                                onClick={() => action('retry', { taskId: t.id })}
                              >
                                <RefreshCw size={14} /> Retry research
                              </button>
                            )}
                            {a?.status === 'uncertain' && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void action('reconcile', {
                                    attemptId: a.id,
                                    executionId: new FormData(e.currentTarget).get('executionId'),
                                  });
                                }}
                              >
                                <p className="error-text">
                                  Dispatch uncertain. Check Bolna call history before any retry.
                                </p>
                                <input
                                  name="executionId"
                                  required
                                  placeholder="Matching provider execution UUID"
                                  aria-label="Provider execution UUID"
                                />
                                <button className="secondary">Reconcile execution</button>
                              </form>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                  <section className="panel activity-panel">
                    <div className="panel-header">
                      <h2>Coordination log</h2>
                      <button className="text-button" onClick={() => openEvidence()}>
                        View evidence <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="activity-list" aria-live="polite">
                      {m.events
                        .slice(-5)
                        .reverse()
                        .map((e) => (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18 }}
                            key={e.id}
                            className="activity-row"
                          >
                            <span
                              className={`event-mark ${e.type.includes('revised') ? 'violet' : ''}`}
                            >
                              <Activity size={12} />
                            </span>
                            <div>
                              <p>{e.message}</p>
                              <span>
                                {e.type} · {e.mode} · rev {e.revision}
                              </span>
                            </div>
                            <time>{time(e.at)}</time>
                          </motion.div>
                        ))}
                    </div>
                  </section>
                </div>
                <aside className="insights-column">
                  <section className="panel budget-panel">
                    <div className="panel-header">
                      <h2>Spending guardrail</h2>
                      <button
                        className="icon-button"
                        aria-label="Edit budget and constraints"
                        onClick={() => setModal('constraints')}
                      >
                        <Settings2 size={16} />
                      </button>
                    </div>
                    <span className="eyebrow">ADDITIONAL SPENDING</span>
                    <div className="budget-number">
                      {money(m.plan.totalMinor)}
                      <span>/ {money(m.constraints.budgetMinor)}</span>
                    </div>
                    <div className="budget-track">
                      <div
                        className={m.plan.totalMinor > m.constraints.budgetMinor ? 'over' : ''}
                        style={{
                          width: `${Math.min(100, (m.plan.totalMinor / Math.max(1, m.constraints.budgetMinor)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="budget-remaining">
                      <span>
                        {m.plan.totalMinor > m.constraints.budgetMinor
                          ? 'Over budget'
                          : 'Remaining'}
                      </span>
                      <strong>
                        {money(Math.abs(m.constraints.budgetMinor - m.plan.totalMinor))}
                      </strong>
                    </div>
                    <div className="budget-lines">
                      {m.tasks.map((t) => (
                        <div key={t.id}>
                          <span>{t.kind}</span>
                          <span>
                            {current(m, t.id)
                              ? money(current(m, t.id)!.priceMinor)
                              : 'Awaiting terms'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="caption">Quotes only. Nothing has been spent or booked.</p>
                    {m.mode === 'real' && (
                      <p className="caption">
                        Call costs authorized: {money(m.callBudgetMinor)} · Reserved:{' '}
                        {money(m.callReservedMinor)}
                      </p>
                    )}
                  </section>
                  <section className="panel timeline-panel">
                    <div className="panel-header">
                      <h2>Working timeline</h2>
                      <Clock size={15} />
                    </div>
                    <div className="timeline">
                      {m.tasks
                        .slice()
                        .sort(
                          (a, b) =>
                            Date.parse(current(m, a.id)?.readyAt || m.constraints.eventStart) -
                            Date.parse(current(m, b.id)?.readyAt || m.constraints.eventStart),
                        )
                        .flatMap((t) => {
                          const o = current(m, t.id);
                          return o?.readyAt
                            ? [
                                <div className="timeline-item" key={t.id}>
                                  <span className="timeline-dot" />
                                  <time>{time(o.readyAt)}</time>
                                  <strong>
                                    {t.kind === 'venue'
                                      ? 'Venue access'
                                      : `${t.kind.charAt(0).toUpperCase() + t.kind.slice(1)} ready`}
                                  </strong>
                                  <small>
                                    {o.confirmation} · {m.mode}
                                  </small>
                                </div>,
                              ]
                            : [];
                        })}
                      <div className="timeline-item event-start">
                        <span className="timeline-dot" />
                        <time>{time(m.constraints.eventStart)}</time>
                        <strong>Event begins</strong>
                        <small>
                          {m.constraints.quantity}{' '}
                          {m.scenario === 'relocation' ? 'guests' : 'capacity'} · fixed deadline
                        </small>
                      </div>
                    </div>
                    <p className="caption">
                      {m.constraints.timezone}. Setup time is checked against this deadline.
                    </p>
                  </section>
                  <section className="approval-section" id="decisions" tabIndex={-1}>
                    <div className="section-heading">
                      <h2>Your decisions</h2>
                      <span className="count">{pending.length}</span>
                    </div>
                    {pending.map((a) => (
                      <article key={a.id} className="approval-card">
                        <span className="eyebrow">
                          <ShieldCheck size={13} /> APPROVAL REQUIRED · REV {a.revision}
                        </span>
                        <h3>
                          {a.kind === 'research'
                            ? 'Start the conversations?'
                            : 'Review the coordinated plan'}
                        </h3>
                        <p>
                          {a.kind === 'research'
                            ? m.mode === 'simulation'
                              ? 'Authorize simulated research with the contacts above. No actual calls or spending.'
                              : 'Authorize AI research calls to the explicitly permitted contacts. No purchases or reservations.'
                            : `${money(m.plan.totalMinor)} in additional quotes. Timing and capacity checks pass. Approving records your preferred plan.`}
                        </p>
                        {m.mode === 'real' && a.kind === 'research' && (
                          <label>
                            Call-cost authorization (INR)
                            <input
                              type="number"
                              min="1"
                              value={callBudget}
                              onChange={(e) => setCallBudget(e.target.value)}
                            />
                          </label>
                        )}
                        <button
                          className="primary"
                          disabled={busy || m.status === 'paused'}
                          onClick={() =>
                            action('approve', {
                              approvalId: a.id,
                              revision: m.revision,
                              approved: true,
                              callBudgetMinor: Math.round(Number(callBudget) * 100),
                            })
                          }
                        >
                          <Check size={15} />
                          {a.kind === 'research'
                            ? m.mode === 'simulation'
                              ? 'Authorize simulated research'
                              : 'Authorize research calls'
                            : 'Approve proposed plan'}
                        </button>
                        <button
                          className="text-button"
                          disabled={busy || m.status === 'paused'}
                          onClick={() =>
                            action('approve', {
                              approvalId: a.id,
                              revision: m.revision,
                              approved: false,
                            })
                          }
                        >
                          Decline
                        </button>
                      </article>
                    ))}
                    {pending.length === 0 && (
                      <div className="decision-empty">
                        <ShieldCheck size={20} />
                        <p>
                          {m.status === 'approved'
                            ? 'Your plan is approved. No binding action has been taken.'
                            : 'New decisions will appear here when your input is needed.'}
                        </p>
                        {m.approvals.some(
                          (a) =>
                            a.kind === 'research' &&
                            a.revision === m.revision &&
                            a.status === 'declined',
                        ) &&
                          m.status !== 'paused' && (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => action('request-research')}
                            >
                              Request research approval again
                            </button>
                          )}
                      </div>
                    )}
                  </section>
                  <div className="operator-note">
                    <Headphones size={18} />
                    <p>
                      {m.mode === 'simulation'
                        ? 'Simulation is explicit. Business responses are configurable; the engine can return a blocked plan.'
                        : 'Phone calls identify the assistant as AI. Pause blocks new calls; active calls may finish.'}
                    </p>
                  </div>
                  {m.mode === 'simulation' && (
                    <button
                      className="secondary wide"
                      onClick={() => {
                        const k = m.tasks[0].kind;
                        setResponseKind(k);
                        setResponseText(JSON.stringify(m.responses?.[k] || [], null, 2));
                        setModal('responses');
                      }}
                    >
                      <Settings2 size={14} /> Business responses
                    </button>
                  )}
                </aside>
              </div>
              <footer className="page-footer">
                <span>CHORUS · Coordinated conversations, accountable decisions.</span>
                <span>
                  {m.mode === 'simulation'
                    ? 'SIMULATION ENVIRONMENT'
                    : 'AUTHORIZED LIVE ENVIRONMENT'}
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      <AnimatePresence>
        {drawer && (
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawer(false)}
          >
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Evidence drawer"
              className="evidence-drawer"
              initial={{ x: 32 }}
              animate={{ x: 0 }}
              exit={{ x: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="drawer-header">
                <div>
                  <span className="eyebrow">SOURCE OF TRUTH</span>
                  <h2>Mission evidence</h2>
                </div>
                <button
                  autoFocus
                  aria-label="Close evidence"
                  className="icon-button"
                  onClick={() => setDrawer(false)}
                >
                  <X />
                </button>
              </div>
              <EvidenceContent mission={m} initialFilter={evidenceFilter} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busyNow.current) setModal(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'conductor'
                ? 'Browser conductor'
                : modal === 'readiness'
                  ? 'Call readiness'
                  : modal === 'new'
                    ? 'New mission'
                    : modal === 'constraints'
                      ? 'Revise mission'
                      : modal === 'contacts'
                        ? 'Mission contacts'
                        : 'Business responses'
            }
            className={`modal ${modal === 'conductor' ? 'conductor-modal' : modal === 'readiness' ? 'readiness-modal' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {modal === 'conductor'
                  ? 'Your conductor'
                  : modal === 'readiness'
                    ? 'Ready for real conversations'
                    : modal === 'new'
                      ? 'Start with a goal'
                      : modal === 'constraints'
                        ? 'Revise the mission'
                        : modal === 'contacts'
                          ? 'Review your contacts'
                          : 'Configure business responses'}
              </h2>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
                disabled={busy && modal === 'conductor'}
              >
                <X size={18} />
              </button>
            </div>
            {modal === 'readiness' && <CallReadiness />}
            {modal === 'conductor' && (
              <ConductorPanel
                mission={m}
                providerActive={['active', 'ringing', 'connecting'].includes(voiceState)}
                onRefresh={load}
                onReview={reviewDecisions}
                onBusyChange={setBusy}
                onMission={async (next) => {
                  selected.current = next.id;
                  history.replaceState(null, '', `?mission=${next.id}`);
                  setM(next);
                  ++loadEpoch.current;
                  await load().catch((e) => setSyncError((e as Error).message));
                }}
              />
            )}
            {modal === 'new' && (
              <form onSubmit={create}>
                <label>
                  Mission type
                  <select
                    autoFocus
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value as typeof scenario)}
                  >
                    <option value="relocation">
                      Event relocation · venue, catering & transport
                    </option>
                    <option value="equipment">Equipment rental & delivery</option>
                  </select>
                </label>
                <label>
                  Goal
                  <textarea
                    rows={3}
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="Our venue cancelled. Find an alternative for 40 people…"
                  />
                </label>
                <label>
                  Environment
                  <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                    <option value="simulation">Simulation · no real calls</option>
                    <option value="real" disabled={!ready?.realEnabled}>
                      Real calls {ready?.realEnabled ? '' : '· configuration required'}
                    </option>
                  </select>
                </label>
                <p className="caption">
                  Include a budget, guest count and time in your goal to set them directly.
                  Otherwise the draft uses 40 guests, 18:00 tomorrow and {money(1200000)}. Review
                  before authorizing.
                </p>
                <button className="primary wide" disabled={busy}>
                  Propose mission <ArrowUpRight size={16} />
                </button>
              </form>
            )}
            {modal === 'constraints' && m && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void run(async () => {
                    const next = await api<Mission>(`missions/${m.id}/revise`, {
                      revision: editRevision.current,
                      constraints: {
                        ...m.constraints,
                        budgetMinor: Math.round(Number(form.get('budget')) * 100),
                        quantity: Number(form.get('quantity')),
                        eventStart: form.get('start'),
                        timezone: form.get('timezone'),
                      },
                      reason: form.get('reason'),
                    });
                    setM(next);
                    setModal(null);
                    await load().catch((e) => setSyncError((e as Error).message));
                  });
                }}
              >
                <p>
                  A new revision rechecks all terms and invalidates previous plan approvals. Agents
                  see it when they next refresh their brief.
                </p>
                <div className="form-grid">
                  <label>
                    Additional budget (INR)
                    <input
                      autoFocus
                      name="budget"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={m.constraints.budgetMinor / 100}
                      required
                    />
                  </label>
                  <label>
                    People / capacity
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      defaultValue={m.constraints.quantity}
                      required
                    />
                  </label>
                </div>
                <label>
                  Event start (ISO time with offset)
                  <input name="start" defaultValue={m.constraints.eventStart} required />
                </label>
                <label>
                  Time zone
                  <input name="timezone" defaultValue={m.constraints.timezone} required />
                </label>
                <label>
                  Reason for revision
                  <input name="reason" required placeholder="Reduce the budget to INR 9,000" />
                </label>
                <button className="primary wide" disabled={busy}>
                  Save new revision
                </button>
              </form>
            )}
            {modal === 'responses' && m && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api(`missions/${m.id}/responses`, {
                      kind: responseKind,
                      offers: JSON.parse(responseText) as Terms[],
                    });
                    setModal(null);
                    await load();
                  });
                }}
              >
                <p>
                  Pause the mission before editing. Responses are terms the simulated business can
                  offer; an empty list means it declines.
                </p>
                <label>
                  Business
                  <select
                    value={responseKind}
                    onChange={(e) => {
                      const k = e.target.value as TaskKind;
                      setResponseKind(k);
                      setResponseText(JSON.stringify(m.responses?.[k] || [], null, 2));
                    }}
                  >
                    {m.tasks.map((t) => (
                      <option key={t.id} value={t.kind}>
                        {t.kind}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Available offers (JSON)
                  <textarea
                    autoFocus
                    className="code-input"
                    rows={12}
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !['draft', 'paused'].includes(m.status)}
                  className="primary wide"
                >
                  Save business responses
                </button>
              </form>
            )}
            {modal === 'contacts' && m && (
              <div>
                <p>
                  Real participants must be explicitly authorized and present in the server
                  allowlist. Pause before changing contacts.
                </p>
                {m.contacts.map((c) => (
                  <form
                    className="contact-form"
                    key={c.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action('contact', {
                        contactId: c.id,
                        name: f.get('name'),
                        phone: f.get('phone'),
                        authorized: f.get('authorized') === 'on',
                      });
                    }}
                  >
                    <span className="eyebrow">{c.kind}</span>
                    <label>
                      Name
                      <input name="name" defaultValue={c.name} required />
                    </label>
                    <label>
                      E.164 phone
                      <input name="phone" defaultValue={c.phone} placeholder="+91…" />
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" name="authorized" defaultChecked={c.authorized} />
                      Participant explicitly authorized this AI test call
                    </label>
                    <button
                      disabled={busy || !['draft', 'paused'].includes(m.status)}
                      className="secondary"
                    >
                      Save contact
                    </button>
                  </form>
                ))}
              </div>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
