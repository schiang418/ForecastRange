import { useState, useEffect } from 'react';
import { Check, ShieldCheck, ShieldAlert } from 'lucide-react';
import { VolatilityMetrics, fetchEvents, UpcomingEvent } from '../api';

interface Props {
  volatilityMetrics: VolatilityMetrics;
  ticker: string;
}

interface CheckItem {
  label: string;
  met: boolean;
  detail: string;
}

export default function PremiumChecklist({ volatilityMetrics: vm, ticker }: Props) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    fetchEvents(ticker)
      .then((data) => { if (!cancelled) setEvents(data.events); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [ticker]);

  const hasCatalyst = events.some(e => e.type === 'earnings' || e.type === 'fomc');

  const sellChecks: CheckItem[] = [
    {
      label: 'IV Percentile >= 60%',
      met: vm.ivPercentile != null && vm.ivPercentile >= 60,
      detail: vm.ivPercentile != null ? `${vm.ivPercentile.toFixed(0)}%` : 'N/A',
    },
    {
      label: 'IV/RV Ratio >= 1.3x',
      met: vm.ivRvRatio != null && vm.ivRvRatio >= 1.3,
      detail: vm.ivRvRatio != null ? `${vm.ivRvRatio.toFixed(2)}x` : 'N/A',
    },
    {
      label: 'Vol Regime Normal or Compressed',
      met: vm.regime === 'normal' || vm.regime === 'compressed',
      detail: vm.regime,
    },
    {
      label: 'Premium Score >= 50',
      met: vm.premiumScore != null && vm.premiumScore >= 50,
      detail: vm.premiumScore != null ? `${vm.premiumScore.toFixed(0)}` : 'N/A',
    },
  ];

  const avoidChecks: CheckItem[] = [
    {
      label: 'IV Percentile < 25%',
      met: vm.ivPercentile != null && vm.ivPercentile < 25,
      detail: vm.ivPercentile != null ? `${vm.ivPercentile.toFixed(0)}%` : 'N/A',
    },
    {
      label: 'IV/RV Ratio < 1.0x',
      met: vm.ivRvRatio != null && vm.ivRvRatio < 1.0,
      detail: vm.ivRvRatio != null ? `${vm.ivRvRatio.toFixed(2)}x` : 'N/A',
    },
    {
      label: 'Vol Regime Extreme',
      met: vm.regime === 'extreme',
      detail: vm.regime,
    },
    {
      label: 'Upcoming catalyst (earnings/FOMC)',
      met: hasCatalyst,
      detail: hasCatalyst
        ? events.filter(e => e.type === 'earnings' || e.type === 'fomc').map(e => e.label).join(', ')
        : 'None in next 20 days',
    },
  ];

  const sellCount = sellChecks.filter(c => c.met).length;
  const avoidCount = avoidChecks.filter(c => c.met).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Sell Premium Box */}
      <div className="bg-surface-card border border-edge rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-medium text-green-400">Sell Premium</h3>
          <span className="ml-auto text-xs font-mono text-dim">
            {sellCount}/4
          </span>
        </div>
        <div className="space-y-2.5">
          {sellChecks.map((check, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs">
              <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border ${
                check.met
                  ? 'bg-green-400/20 border-green-400'
                  : 'border-[#3a3f4b] bg-transparent'
              }`}>
                {check.met && <Check className="w-3 h-3 text-green-400" strokeWidth={3} />}
              </span>
              <span className={check.met ? 'text-white' : 'text-dim/60'}>
                {check.label}
              </span>
              <span className={`ml-auto font-mono ${check.met ? 'text-green-400' : 'text-dim/40'}`}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>
        {sellCount >= 3 && (
          <div className="mt-3 pt-2 border-t border-edge text-xs text-green-400">
            Conditions favorable for selling premium
          </div>
        )}
      </div>

      {/* Avoid Selling Box */}
      <div className="bg-surface-card border border-edge rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-red-400">Avoid Selling</h3>
          <span className="ml-auto text-xs font-mono text-dim">
            {avoidCount}/4
          </span>
        </div>
        <div className="space-y-2.5">
          {avoidChecks.map((check, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs">
              <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border ${
                check.met
                  ? 'bg-red-400/20 border-red-400'
                  : 'border-[#3a3f4b] bg-transparent'
              }`}>
                {check.met && <Check className="w-3 h-3 text-red-400" strokeWidth={3} />}
              </span>
              <span className={check.met ? 'text-white' : 'text-dim/60'}>
                {check.label}
              </span>
              <span className={`ml-auto font-mono ${check.met ? 'text-red-400' : 'text-dim/40'}`}>
                {check.detail}
              </span>
            </div>
          ))}
        </div>
        {avoidCount >= 2 && (
          <div className="mt-3 pt-2 border-t border-edge text-xs text-red-400">
            Caution — red flags present for premium selling
          </div>
        )}
      </div>
    </div>
  );
}
