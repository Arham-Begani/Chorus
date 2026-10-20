'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Mic,
  Package,
  ShieldCheck,
  Truck,
  Users,
  Utensils,
  RotateCcw,
} from 'lucide-react';
import { Brand } from './brand';

const examples = {
  relocation: {
    name: 'Event relocation',
    goal: 'Our venue cancelled. Find a new space for 40 people, coordinate catering and get everyone there by 6 pm.',
    roles: [
      { name: 'The Courtyard', label: 'Venue', Icon: MapPin },
      { name: 'Saffron Kitchen', label: 'Catering', Icon: Utensils },
      { name: 'City Shuttle', label: 'Transport', Icon: Truck },
    ],
    prices: ['₹5,500', '₹2,500', '₹2,500'],
    revised: ['₹4,500', '₹2,000', '₹2,000'],
    total: '₹10,500',
    revisedTotal: '₹8,500',
  },
  equipment: {
    name: 'Equipment & delivery',
    goal: 'Find sound equipment for 40 people and arrange delivery and setup before doors open at 6 pm.',
    roles: [
      { name: 'Signal Rentals', label: 'Equipment', Icon: Package },
      { name: 'Swift Logistics', label: 'Delivery', Icon: Truck },
    ],
    prices: ['₹5,000', '₹1,500'],
    revised: ['₹5,000', '₹1,500'],
    total: '₹6,500',
    revisedTotal: '₹6,500',
  },
};
export function MissionPreview() {
  const [scenario, setScenario] = useState<keyof typeof examples>('relocation');
  const [step, setStep] = useState(0);
  const example = examples[scenario];
  return (
    <div className="mission-preview" aria-label="Interactive mission example">
      <div className="preview-chrome">
        <span>
          <i />
          <i />
          <i />
        </span>
        <span>CHORUS / mission control</span>
        <span className="preview-example">Illustrative simulation</span>
      </div>
      <div className="preview-body">
        <div className="preview-tabs" role="group" aria-label="Example scenario">
          {Object.entries(examples).map(([key, e]) => (
            <button
              key={key}
              aria-pressed={scenario === key}
              onClick={() => {
                setScenario(key as typeof scenario);
                setStep(0);
              }}
            >
              {e.name}
            </button>
          ))}
        </div>
        <div className="preview-goal">
          <AudioLines size={20} />
          <p>{example.goal}</p>
        </div>
        <div className="preview-brief">
          <span>
            <Users size={13} />
            40 people
          </span>
          <span>
            <Clock3 size={13} />
            6:00 pm
          </span>
          <span>{step === 2 ? '₹9,000' : '₹12,000'} budget</span>
        </div>
        <div className={`preview-network roles-${example.roles.length}`}>
          <div className="preview-conductor">
            <span className="brand-symbol">
              <AudioLines size={20} />
            </span>
            <div>
              <strong>One shared brief</strong>
              <small>
                {step === 2
                  ? 'Revision 2 · budget updated'
                  : step === 1
                    ? 'Timing resolved across conversations'
                    : 'Revision 1 · everyone in sync'}
              </small>
            </div>
            <span className="preview-revision">0{step + 1}</span>
          </div>
          <div className="preview-connectors" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="preview-agents">
            {example.roles.map((r, i) => (
              <div className="preview-agent" key={r.name}>
                <r.Icon size={18} />
                <small>{r.label}</small>
                <strong>{r.name}</strong>
                <span>
                  {step === 0
                    ? 'Research task'
                    : step === 2
                      ? example.revised[i]
                      : example.prices[i]}
                </span>
                {step > 0 && <Check size={12} />}
              </div>
            ))}
          </div>
        </div>
        <div className={`preview-result step-${step}`} aria-live="polite">
          <span>{step === 0 ? <AudioLines size={17} /> : <Check size={17} />}</span>
          <div>
            <strong>
              {step === 0
                ? 'Different conversations. Shared context.'
                : step === 1
                  ? 'A scheduling conflict, resolved.'
                  : 'A new budget. A fresh plan.'}
            </strong>
            <p>
              {step === 0
                ? 'Each agent works from the same goal, budget and deadline.'
                : step === 1
                  ? scenario === 'relocation'
                    ? 'Catering needs 45 minutes. Venue access moves to 5 pm so setup fits.'
                    : 'Delivery and equipment availability leave time for installation.'
                  : `Current quotes total ${example.revisedTotal}, within a ₹9,000 limit. Your approval comes next.`}
            </p>
          </div>
        </div>
        <div className="preview-controls">
          <span>EXPLORE THE EXAMPLE</span>
          <div>
            {['The brief', 'Resolve timing', 'Revise budget'].map((label, i) => (
              <button key={label} aria-pressed={step === i} onClick={() => setStep(i)}>
                <span>0{i + 1}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
export default function Landing() {
  return (
    <div className="landing">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="landing-nav landing-width">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#possibilities">Use cases</a>
          <a href="#questions">Questions</a>
        </nav>
        <Link className="secondary" href="/app">
          Open workspace <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="main">
        <section className="landing-hero landing-width">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-dot" /> ONE GOAL. A SHARED UNDERSTANDING.
            </span>
            <h1>
              Let the details
              <br />
              talk to each other.
            </h1>
            <p>
              One request becomes coordinated conversations. CHORUS connects the moving parts,
              adapts when plans change, and brings the decision back to you.
            </p>
            <div className="hero-actions">
              <Link className="primary" href="/app?start=conductor">
                Try a mission <ArrowRight size={17} />
              </Link>
              <a className="hero-secondary" href="#interactive-example">
                Explore an example <ChevronDown size={15} />
              </a>
            </div>
            <div className="hero-footnote">
              <ShieldCheck size={14} />
              <span>Start in simulation. Every action stays yours to approve.</span>
            </div>
          </div>
          <aside className="hero-aside" aria-label="An example mission">
            <div className="hero-field-note">
              <span>01 / THE REQUEST</span>
              <strong>
                40 guests.
                <br />A new venue.
                <br />
                One evening.
              </strong>
            </div>
            <div className="hero-field-note">
              <span>02 / THE CHECK</span>
              <p>Will access, setup and transport fit the same deadline?</p>
            </div>
            <div className="hero-field-note">
              <span>03 / YOUR DECISION</span>
              <p>
                Review the evidence.
                <br />
                Approve the plan.
              </p>
            </div>
          </aside>
        </section>
        <section className="landing-width landing-demo" id="interactive-example">
          <div className="section-overline">
            <span>THE PRODUCT, IN PRACTICE</span>
            <span>
              Explore without an account <ArrowDownIcon />
            </span>
          </div>
          <MissionPreview />
        </section>
        <section className="landing-width landing-process" id="how-it-works">
          <div className="section-intro">
            <span className="eyebrow">FROM REQUEST TO RESOLUTION</span>
            <h2>
              You set the goal.
              <br />
              CHORUS connects the dots.
            </h2>
            <p>When one conversation changes the plan, the others get the context they need.</p>
          </div>
          <div className="process-list">
            {[
              {
                n: '01',
                title: 'Say what needs to happen.',
                text: 'Speak or type your goal. Review the proposed tasks, contacts, budget and deadline before research begins.',
                Icon: Mic,
              },
              {
                n: '02',
                title: 'Give every conversation the whole picture.',
                text: 'New terms become shared evidence. A venue’s access time can change what the caterer needs to ask next.',
                Icon: AudioLines,
              },
              {
                n: '03',
                title: 'Change your mind. Keep the context.',
                text: 'Revise a budget or deadline, pause work, and review a fresh proposal. Earlier terms stay visible as history.',
                Icon: RotateCcw,
              },
              {
                n: '04',
                title: 'Make an informed decision.',
                text: 'Check the quotes, timing and sources. Approve a preferred plan when it fits. Nothing is automatically booked.',
                Icon: ShieldCheck,
              },
            ].map((s) => (
              <article key={s.n}>
                <span className="process-number">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
                <s.Icon size={21} />
              </article>
            ))}
          </div>
        </section>
        <section className="landing-scenarios" id="possibilities">
          <div className="landing-width">
            <div className="section-intro">
              <span className="eyebrow">BUILT FOR THE MOVING PARTS</span>
              <h2>
                A plan is only as good
                <br />
                as the details that agree.
              </h2>
            </div>
            <div className="scenario-rows">
              <Link href="/app?start=relocation" className="scenario-row">
                <span className="scenario-symbol">
                  <MapPin size={28} />
                </span>
                <div>
                  <span className="eyebrow">VENUE / CATERING / TRANSPORT</span>
                  <h3>Bring the evening back together.</h3>
                  <p>
                    A cancelled venue doesn’t have to unravel the event. Find a new space and
                    coordinate everyone around it.
                  </p>
                </div>
                <ArrowUpRight size={24} />
              </Link>
              <Link href="/app?start=equipment" className="scenario-row">
                <span className="scenario-symbol">
                  <Package size={28} />
                </span>
                <div>
                  <span className="eyebrow">EQUIPMENT / DELIVERY / SETUP</span>
                  <h3>Everything in place before doors open.</h3>
                  <p>
                    Source the equipment, fit delivery around availability, and leave enough time to
                    get it ready.
                  </p>
                </div>
                <ArrowUpRight size={24} />
              </Link>
            </div>
          </div>
        </section>
        <section className="landing-width landing-principle">
          <span className="principle-mark">
            <ShieldCheck size={32} />
          </span>
          <div>
            <span className="eyebrow">CONTEXT IS SHARED. CONTROL IS YOURS.</span>
            <h2>
              A proposal you can inspect.
              <br />A decision you can own.
            </h2>
            <p>
              See where each quote came from, what changed, and what still needs resolving.
              Simulation is clearly labelled. Research and plan approvals are explicit.
            </p>
            <Link href="/app" className="text-button">
              See mission control <ArrowRight size={16} />
            </Link>
          </div>
        </section>
        <section className="landing-width landing-faq" id="questions">
          <div className="section-intro">
            <span className="eyebrow">A FEW USEFUL DETAILS</span>
            <h2>Before the first conversation.</h2>
          </div>
          <div>
            {[
              {
                q: 'Can I try it without making a phone call?',
                a: 'Yes. Both mission types run in a clearly labelled simulation with configurable business responses. You can create and revise a mission, inspect evidence, and approve a proposal without a phone number.',
              },
              {
                q: 'Do I have to use my voice?',
                a: 'No. Every conductor command can be typed. Microphone input depends on your browser and its speech service; typed control remains available if speech is unsupported or permission is denied.',
              },
              {
                q: 'Does CHORUS book or pay for anything?',
                a: 'No. CHORUS researches and proposes a plan. Approving that plan records your preference; it does not make a reservation, payment or cancellation.',
              },
              {
                q: 'What is available for real calls?',
                a: 'A Bolna integration is prepared. Real browser and telephone executions still need an authorized provider rehearsal. Live calling is disabled by default and requires explicitly permitted participants and a separate call-cost approval.',
              },
            ].map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <ChevronDown size={17} />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="landing-width landing-final">
          <div>
            <span className="eyebrow">START WITH ONE REQUEST</span>
            <h2>What needs to come together?</h2>
          </div>
          <Link className="primary" href="/app?start=conductor">
            Open your workspace <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer className="landing-width landing-footer">
        <Brand compact />
        <p>Coordinated conversations. Accountable decisions.</p>
        <a href="#main">Back to top ↑</a>
      </footer>
    </div>
  );
}
function ArrowDownIcon() {
  return <ChevronDown size={13} />;
}
