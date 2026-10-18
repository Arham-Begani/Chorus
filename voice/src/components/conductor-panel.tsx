'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Mic, Square, Volume2 } from 'lucide-react';
import type { Mission } from '../core/types';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: {
          length: number;
          [index: number]: { isFinal: boolean; [index: number]: { transcript: string } };
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
const errors: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Allow it in browser settings, or type below.',
  'service-not-allowed':
    'Speech recognition is unavailable in this browser. Type below or use a supported Chrome or Edge browser.',
  'audio-capture': 'No microphone is available. Connect one, or type your message.',
  network: 'The browser speech service could not connect. Retry or type your message.',
  'no-speech': 'No speech was detected. Try again or type your message.',
};
export default function ConductorPanel({
  mission,
  onMission,
  providerActive = false,
}: {
  mission: Mission | null;
  onMission: (mission: Mission) => Promise<void>;
  providerActive?: boolean;
}) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [supported, setSupported] = useState<boolean | null>(null),
    [listening, setListening] = useState(false),
    [starting, setStarting] = useState(false),
    [interim, setInterim] = useState(''),
    [error, setError] = useState(''),
    [reply, setReply] = useState(''),
    [readAloud, setReadAloud] = useState(false);
  const recognition = useRef<Recognition | null>(null),
    conversation = useRef<HTMLDivElement | null>(null),
    flight = useRef(false),
    mounted = useRef(true),
    current = useRef(mission),
    speaker = useRef(readAloud);
  current.current = mission;
  speaker.current = readAloud;
  useEffect(() => {
    mounted.current = true;
    const w = window as SpeechWindow;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      mounted.current = false;
      const previous = recognition.current;
      recognition.current = null;
      previous?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    const previous = recognition.current;
    recognition.current = null;
    previous?.abort();
    setListening(false);
    setStarting(false);
    setText('');
    setInterim('');
    setReply('');
    setError('');
  }, [mission?.id]);
  async function send(value: string, source: 'text' | 'voice') {
    if (flight.current || !value.trim()) return;
    flight.current = true;
    setBusy(true);
    setError('');
    setReply('');
    try {
      const m = current.current;
      const r = await fetch('/api/conductor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: crypto.randomUUID(),
          text: value,
          source,
          ...(m ? { missionId: m.id, revision: m.revision } : {}),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'Could not reach the conductor.');
      if (!mounted.current) return;
      if (result.mission) await onMission(result.mission);
      if (!mounted.current) return;
      setReply(result.message);
      setText('');
      setInterim('');
      if (speaker.current && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const line = new SpeechSynthesisUtterance(result.message);
        line.lang = 'en-IN';
        window.speechSynthesis.speak(line);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function microphone() {
    if (listening || starting) {
      const previous = recognition.current;
      recognition.current = null;
      previous?.abort();
      setListening(false);
      setStarting(false);
      return;
    }
    const Constructor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) return;
    window.speechSynthesis?.cancel();
    setError('');
    setInterim('');
    setStarting(true);
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = 'en-IN';
    instance.continuous = false;
    instance.interimResults = true;
    let submitted = false;
    instance.onstart = () => {
      if (mounted.current && recognition.current === instance) {
        setStarting(false);
        setListening(true);
      }
    };
    instance.onend = () => {
      if (mounted.current && recognition.current === instance) {
        setListening(false);
        setStarting(false);
      }
    };
    instance.onerror = (e) => {
      if (mounted.current && recognition.current === instance && e.error !== 'aborted')
        setError(errors[e.error] || 'Speech recognition stopped. Retry or type below.');
    };
    instance.onresult = (e) => {
      if (!mounted.current || recognition.current !== instance) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0].transcript.trim();
        if (result.isFinal && !submitted) {
          submitted = true;
          instance.abort();
          setListening(false);
          void send(transcript, 'voice');
          return;
        }
        if (!result.isFinal) setInterim(transcript);
      }
    };
    try {
      instance.start();
    } catch {
      setStarting(false);
      setError('The microphone could not start. Retry or type below.');
    }
  }
  const history = mission?.events.filter((e) => e.type.startsWith('conductor.')).slice(-8) || [];
  const lastMessage = history.at(-1)?.id;
  useEffect(() => {
    const log = conversation.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lastMessage, reply]);
  return (
    <div className="browser-conductor">
      <p className="conductor-intro">
        Speak or type a goal, then revise it as the conversations develop. Research uses the
        mission’s {mission?.mode === 'real' ? 'real-call' : 'simulation'} mode. No phone number is
        needed for browser commands.
      </p>
      <div className="conductor-mic-row">
        <button
          type="button"
          className={`voice-button ${listening ? 'listening' : ''}`}
          onClick={microphone}
          disabled={!supported || busy || providerActive}
          aria-pressed={listening || starting}
        >
          {listening || starting ? <Square size={16} /> : <Mic size={16} />}
          {listening ? 'Stop listening' : starting ? 'Starting microphone…' : 'Use microphone'}
        </button>
        <span role="status">
          {busy
            ? 'Updating your mission…'
            : listening
              ? 'Listening…'
              : supported === false
                ? 'Speech is unavailable here. Type below.'
                : providerActive
                  ? 'End the Bolna conversation before using this microphone.'
                  : 'English voice commands'}
        </span>
      </div>
      {interim && (
        <p className="conductor-interim" aria-live="polite">
          Heard so far: {interim}
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div
        className="conductor-history"
        ref={conversation}
        role="log"
        aria-label="Conductor conversation"
        aria-live="polite"
      >
        {history.map((e) => (
          <div
            key={e.id}
            className={`conductor-message ${e.type === 'conductor.reply' ? 'reply' : 'owner'}`}
          >
            <strong>
              {e.type === 'conductor.reply'
                ? 'CHORUS'
                : e.type === 'conductor.voice'
                  ? 'You · microphone'
                  : 'You · typed'}
            </strong>
            <p>{e.message}</p>
          </div>
        ))}
        {reply && (!history.length || history.at(-1)?.message !== reply) && (
          <div className="conductor-message reply">
            <strong>CHORUS</strong>
            <p>{reply}</p>
          </div>
        )}
        {!history.length && !reply && (
          <p className="caption">
            Try “Find a venue for 40 people tomorrow at 6 pm under 12000 rupees” or “Rent sound
            equipment with delivery for 40 people under 8000 rupees.”
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const previous = recognition.current;
          recognition.current = null;
          previous?.abort();
          setStarting(false);
          setListening(false);
          void send(text, 'text');
        }}
      >
        <label htmlFor="conductor-message">Message your conductor</label>
        <textarea
          id="conductor-message"
          rows={3}
          value={text}
          maxLength={3000}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder={
            mission
              ? 'Lower the budget to 9000 rupees, or ask what is blocking the plan…'
              : 'Describe the event or equipment you need…'
          }
        />
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
            <Volume2 size={14} />
            Read responses aloud
          </label>
          <button className="primary" disabled={busy || !text.trim()}>
            {busy ? 'Updating…' : 'Send message'}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
      <p className="caption conductor-privacy">
        Browser speech may use your browser’s speech service. Only recognized text is saved to your
        mission. The conductor supports these two mission types; business conversations remain
        clearly labelled {mission?.mode === 'real' ? 'real calls' : 'simulations'}.
      </p>
    </div>
  );
}
