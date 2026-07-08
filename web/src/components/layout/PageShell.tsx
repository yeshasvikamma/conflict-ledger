import type { ReactNode } from 'react';
import { BodyText, Eyebrow, Heading } from '../ui/Typography';

export type SectionKey = 'timeline' | 'sources';

const SECTION_LABELS: Record<SectionKey, string> = {
  timeline: 'Timeline',
  sources: 'Sources',
};

/**
 * The VitalsBar sits in its own sticky strip so it stays visible while the
 * masthead scrolls away — sections (Timeline, Map, ...) slot into `children`
 * without touching this frame.
 */
export function PageShell({
  activeSection,
  onSectionChange,
  vitalsBar,
  children,
}: {
  activeSection: SectionKey;
  onSectionChange: (section: SectionKey) => void;
  vitalsBar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Eyebrow>Live Conflict Ledger</Eyebrow>
              <Heading level="display" className="mt-2 max-w-3xl">
                A ledger of sourced claims, not a feed of rumors.
              </Heading>
            </div>
            <BodyText
              muted
              className="max-w-sm border-l border-rule pl-4 sm:text-right"
            >
              Every figure below resolves to a verbatim quote and a rated source.
              Nothing here is estimated.
            </BodyText>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Sections">
            {(Object.keys(SECTION_LABELS) as SectionKey[]).map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => onSectionChange(section)}
                aria-current={activeSection === section ? 'page' : undefined}
                className={`border px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                  activeSection === section
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
                }`}
              >
                {SECTION_LABELS[section]}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="border-b border-rule bg-paper/95 backdrop-blur-sm sm:sticky sm:top-0 sm:z-10">
        <div className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-8">{vitalsBar}</div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">{children}</main>
    </div>
  );
}
