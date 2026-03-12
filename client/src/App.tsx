import React, { useState } from 'react';
import ForecastSection from './components/ForecastSection';
import CompareSection from './components/CompareSection';

type AppTab = 'forecast' | 'compare';

export default function App() {
  const [tab, setTab] = useState<AppTab>('forecast');

  return (
    <div className="min-h-screen bg-surface">
      {/* Tab bar */}
      <div className="border-b border-edge">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 pt-4">
            <button
              onClick={() => setTab('forecast')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === 'forecast'
                  ? 'bg-surface-card border border-b-0 border-edge text-primary'
                  : 'text-dim hover:text-primary'
              }`}
            >
              Single Forecast
            </button>
            <button
              onClick={() => setTab('compare')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === 'compare'
                  ? 'bg-surface-card border border-b-0 border-edge text-primary'
                  : 'text-dim hover:text-primary'
              }`}
            >
              Compare Tickers
            </button>
          </div>
        </div>
      </div>

      {tab === 'forecast' ? <ForecastSection /> : <CompareSection />}
    </div>
  );
}
