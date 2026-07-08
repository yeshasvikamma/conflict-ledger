import { useEffect, useState } from 'react';
import {
  CounterBreakdown,
  CounterSnapshot,
  SourceSummary,
  getCounterBreakdown,
  getCounters,
  getSources,
} from './api/client';
import { CounterBreakdownModal } from './components/CounterBreakdownModal';
import { PageShell, type SectionKey } from './components/layout/PageShell';
import { SourcesPanel } from './components/SourcesPanel';
import { Timeline } from './components/Timeline';
import { VitalsBar } from './components/VitalsBar';

function App() {
  const [activeSection, setActiveSection] = useState<SectionKey>('timeline');
  const [counters, setCounters] = useState<CounterSnapshot[]>([]);
  const [sources, setSources] = useState<SourceSummary[]>([]);

  const [selectedKey, setSelectedKey] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<CounterBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [counterRows, sourceRows] = await Promise.all([
        getCounters(),
        getSources(),
      ]);
      setCounters(counterRows);
      setSources(sourceRows);
    }

    load();
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      setBreakdown(null);
      return;
    }

    let cancelled = false;
    setBreakdownLoading(true);

    getCounterBreakdown(selectedKey)
      .then((nextBreakdown) => {
        if (!cancelled) {
          setBreakdown(nextBreakdown);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBreakdownLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  function handleSelectCounter(key: string) {
    setSelectedKey(key);
    setModalOpen(true);
  }

  return (
    <>
      <PageShell
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        vitalsBar={
          <VitalsBar
            counters={counters}
            selectedKey={selectedKey}
            onSelectCounter={handleSelectCounter}
          />
        }
      >
        {activeSection === 'timeline' && <Timeline />}
        {activeSection === 'sources' && <SourcesPanel sources={sources} />}
      </PageShell>

      <CounterBreakdownModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        counterKey={selectedKey}
        breakdown={breakdown}
        loading={breakdownLoading}
      />
    </>
  );
}

export default App;
