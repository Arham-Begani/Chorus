'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  Check,
  Mic,
  RotateCcw,
  Square,
  Volume2,
  ArrowUpRight,
} from 'lucide-react';
import type { Mission } from '../core/types';
import { ApiError, requestJSON } from '../client/api';
import { formatMoney } from '../core/presentation';
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult:
    | ((e: {
        resultIndex: number;
        results: {
          length: number;
          [i: number]: { isFinal: boolean; [i: number]: { transcript: string } };
        };
      }) => void)
    | null;
  start: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
type Command = {
  key: string;
  text: string;
  source: 'text' | 'voice';
  missionId?: string;
  revision?: number;
};
const errors: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Allow it in browser settings, or type below.',
  'service-not-allowed': 'Speech is unavailable in this browser. You can keep going by typing.',
  'audio-capture': 'No microphone is available. Connect one, or type your message.',
  network: 'The browser speech service could not connect. Your typed controls are ready.',
  'no-speech': 'No speech was detected. Try again or type your message.',
};
export default function ConductorPanel({
  mission,
  onMission,
  onRefresh,
  onReview,
  onBusyChange,
  providerActive = false,
}: {
  mission: Mission | null;
  onMission: (m: Mission) => Promise<void>;
  onRefresh: () => Promise<void>;
  onReview: () => void;
  onBusyChange: (busy: boolean) => void;
  providerActive?: boolean;
}) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [supported, setSupported] = useState<boolean | null>(null),
    [mic, setMic] = useState<'idle' | 'starting' | 'listening'>('idle'),
    [interim, setInterim] = useState(''),
    [error, setError] = useState(''),
    [retryable, setRetryable] = useState(false),
    [stale, setStale] = useState(false),
    [reply, setReply] = useState(''),
    [readAloud, setReadAloud] = useState(false);
  const recognition = useRef<Recognition | null>(null),
    conversation = useRef<HTMLDivElement | null>(null),
    composer = useRef<HTMLTextAreaElement | null>(null),
    flight = useRef(false),
    mounted = useRef(true),
    current = useRef(mission),
    speaker = useRef(readAloud),
    pending = useRef<Command | null>(null),
    microphoneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  current.current = mission;
  speaker.current = readAloud;
  function stopMicrophone() {
    clearTimeout(microphoneTimer.current);
    const previous = recognition.current;
    recognition.current = null;
    previous?.abort();
    if (mounted.current) setMic('idle');
  }
  useEffect(() => {
    mounted.current = true;
    const w = window as SpeechWindow;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      mounted.current = false;
      stopMicrophone();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    stopMicrophone();
    setText(pending.current?.text || '');
    setInterim('');
    setReply('');
    if (!pending.current) setError('');
  }, [mission?.id]);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  async function submit(command: Command) {
    if (flight.current) return;
    flight.current = true;
    pending.current = command;
    setBusy(true);
    setError('');
    setRetryable(false);
    setStale(false);
    try {
      const result = await requestJSON<{ mission: Mission | null; message: string }>(
        'conductor',
        command,
      );
      if (!mounted.current) return;
      if (result.mission) await onMission(result.mission);
      if (!mounted.current) return;
      pending.current = null;
      setReply(result.message);
      setText('');
      setInterim('');
      if (speaker.current && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(result.message);
        utterance.lang = 'en-IN';
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      if (mounted.current) {
        setText(command.text);
        setError((e as Error).message);
        setRetryable(e instanceof ApiError && e.retryable);
        setStale(e instanceof ApiError && e.status === 409);
      }
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function send(value: string, source: 'text' | 'voice') {
    if (!value.trim() || flight.current) return;
    stopMicrophone();
    const previous = pending.current;
    // A lost response reuses the exact original command, including its revision and key.
    if (previous && previous.text === value && retryable) {
      void submit(previous);
      return;
    }
    const m = current.current;
    void submit({
      key: crypto.randomUUID(),
      text: value.trim(),
      source,
      ...(m ? { missionId: m.id, revision: m.revision } : {}),
    });
  }
  function microphone() {
    if (mic !== 'idle') {
      stopMicrophone();
      return;
    }
    const Constructor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) return;
    window.speechSynthesis?.cancel();
    setError('');
    setInterim('');
    setMic('starting');
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = 'en-IN';
    instance.continuous = false;
    instance.interimResults = true;
    const watchdog = (duration: number, message: string) => {
      clearTimeout(microphoneTimer.current);
      microphoneTimer.current = setTimeout(() => {
        if (recognition.current === instance) {
          stopMicrophone();
          setError(message);
        }
      }, duration);
    };
    watchdog(12000, 'The microphone did not start. Check permission or type your message.');
    instance.onstart = () => {
      if (mounted.current && recognition.current === instance) {
        setMic('listening');
        watchdog(
          45000,
          'Listening stopped after 45 seconds. Try a shorter request, or type below.',
        );
      }
    };
    instance.onend = () => {
      if (mounted.current && recognition.current === instance) {
        recognition.current = null;
        clearTimeout(microphoneTimer.current);
        setMic('idle');
      }
    };
    instance.onerror = (e) => {
      if (mounted.current && recognition.current === instance) {
        stopMicrophone();
        if (e.error !== 'aborted')
          setError(errors[e.error] || 'Speech stopped. Retry or type your message.');
      }
    };
    instance.onresult = (e) => {
      if (!mounted.current || recognition.current !== instance) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i],
          transcript = result[0].transcript.trim();
        if (result.isFinal && transcript) {
          setText(transcript);
          stopMicrophone();
          send(transcript, 'voice');
          return;
        }
        if (!result.isFinal) setInterim(transcript);
      }
    };
    try {
      instance.start();
    } catch {
      stopMicrophone();
      setError('The microphone could not start. Your typed controls are ready.');
    }
  }
  const history = mission?.events.filter((e) => e.type.startsWith('conductor.')).slice(-24) || [];
  const lastMessage = history.at(-1)?.id;
  useEffect(() => {
    const log = conversation.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lastMessage, reply, busy]);
  const decision = mission?.approvals.find(
    (a) => a.status === 'requested' && a.revision === mission.revision,
  );
  const suggestions = mission
    ? [
        'What is blocking the plan?',
        mission.status === 'paused' ? 'Resume' : 'Pause',
        'Lower the budget to 9000 rupees',
      ]
    : [
        'Find a venue for 40 people tomorrow at 6 pm under 12000 rupees',
        'Rent sound equipment with delivery for 40 people tomorrow at 6 pm under 8000 rupees',
      ];
  function draft(value: string) {
    setText(value);
    pending.current = null;
    setRetryable(false);
    setError('');
    composer.current?.focus();
  }
  return (
    <div className="browser-conductor">
      <div className="conductor-context">
        <span className="tiny-dot" />
        <span>
          {mission
            ? `${mission.mode === 'simulation' ? 'Simulation' : 'Real calls'} · Revision ${mission.revision}`
            : 'A new mission starts here'}
        </span>
        {mission && <span>{formatMoney(mission.constraints.budgetMinor)} limit</span>}
      </div>
      <div className="conductor-mic-row">
        <button
          type="button"
          className={`voice-button ${mic === 'listening' ? 'listening' : ''}`}
          onClick={microphone}
          disabled={!supported || busy || providerActive}
          aria-pressed={mic !== 'idle'}
        >
          {mic !== 'idle' ? <Square size={16} /> : <Mic size={16} />}{' '}
          {mic === 'listening'
            ? 'Stop listening'
            : mic === 'starting'
              ? 'Starting microphone…'
              : 'Use microphone'}
        </button>
        <span role="status">
          {busy
            ? 'Updating your mission…'
            : mic === 'listening'
              ? 'Listening. Say one request.'
              : mic === 'starting'
                ? 'Waiting for microphone…'
                : supported === false
                  ? 'Speech is unavailable here. Type below.'
                  : providerActive
                    ? 'End the Bolna conversation to use this mic.'
                    : 'Speak a request, or type below.'}
        </span>
      </div>
      <div
        ref={conversation}
        className="conductor-history"
        role="log"
        aria-label="Conductor conversation"
        aria-live="polite"
      >
        {!history.length && !reply && (
          <div className="conductor-welcome">
            <span className="welcome-mark">
              <AudioLines size={24} />
            </span>
            <h3>
              {mission ? 'A fresh perspective on your plan.' : 'What needs to come together?'}
            </h3>
            <p>
              {mission
                ? 'Ask about the current brief, revise a constraint, or pause while you think.'
                : 'Tell me the event or equipment you need. I’ll draft the tasks, budget and deadline for you to review.'}
            </p>
            <div className="conductor-starters">
              {suggestions.map((s) => (
                <button type="button" key={s} onClick={() => draft(s)} disabled={busy}>
                  {s}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
        {history.map((e) => (
          <div
            key={e.id}
            className={`conductor-message ${e.type === 'conductor.reply' ? 'reply' : 'owner'}`}
          >
            <strong>
              {e.type === 'conductor.reply' ? (
                <>
                  <AudioLines size={13} />
                  CHORUS
                </>
              ) : e.type === 'conductor.voice' ? (
                'You · microphone'
              ) : (
                'You · typed'
              )}
            </strong>
            <p>{e.message}</p>
          </div>
        ))}
        {reply && history.at(-1)?.message !== reply && (
          <div className="conductor-message reply">
            <strong>
              <AudioLines size={13} />
              CHORUS
            </strong>
            <p>{reply}</p>
          </div>
        )}
        {busy && (
          <div className="conductor-working">
            <span className="progress-pulse" />
            Checking your brief…
          </div>
        )}
      </div>
      <div className="conductor-composer">
        {interim && (
          <p className="conductor-interim" aria-live="polite">
            Heard so far: {interim}
          </p>
        )}
        {error && (
          <div className="conductor-error">
            <p role="alert">{error}</p>
            {retryable && pending.current && (
              <button
                type="button"
                className="text-button"
                onClick={() => void submit(pending.current!)}
                disabled={busy}
              >
                <RotateCcw size={14} />
                Retry message
              </button>
            )}
            {stale && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  try {
                    await onRefresh();
                    setStale(false);
                    setError('');
                    pending.current = null;
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <RotateCcw size={14} />
                Load latest mission
              </button>
            )}
          </div>
        )}
        {history.length > 0 && (
          <div className="conductor-quick" aria-label="Suggested commands">
            {suggestions.slice(0, 2).map((s) => (
              <button type="button" key={s} disabled={busy} onClick={() => draft(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {decision && (
          <button type="button" className="conductor-decision" onClick={onReview} disabled={busy}>
            <Check size={15} />
            {decision.kind === 'research' ? 'Review research approval' : 'Review proposed plan'}
            <ArrowUpRight size={15} />
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text, 'text');
          }}
        >
          <label htmlFor="conductor-message">Message your conductor</label>
          <div className="composer-field">
            <textarea
              ref={composer}
              id="conductor-message"
              rows={2}
              value={text}
              maxLength={3000}
              onChange={(e) => {
                setText(e.target.value);
                if (pending.current?.text !== e.target.value) {
                  pending.current = null;
                  setRetryable(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send(text, 'text');
                }
              }}
              disabled={busy}
              placeholder={mission ? 'Ask a question or change a detail…' : 'Describe your goal…'}
            />
            <button
              className="primary composer-send"
              aria-label="Send message"
              disabled={busy || !text.trim()}
            >
              <ArrowUp size={17} />
            </button>
          </div>
          <div className="conductor-send-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={readAloud}
                onChange={(e) => {
                  setReadAloud(e.target.checked);
                  if (!e.target.checked) window.speechSynthesis?.cancel();
                }}
              />
              <Volume2 size={14} /> Read responses aloud
            </label>
            <span>⌘ / Ctrl + Enter</span>
          </div>
        </form>
        <p className="caption conductor-privacy">
          Speech uses your browser’s service. CHORUS saves recognized text, not audio. Research and
          plans need your approval.
        </p>
      </div>
    </div>
  );
}
