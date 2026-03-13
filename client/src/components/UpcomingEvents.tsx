import { useState, useEffect } from 'react';
import { Calendar, DollarSign, Scissors, Landmark } from 'lucide-react';
import { fetchEvents, UpcomingEvent } from '../api';

interface Props {
  ticker: string;
}

const EVENT_STYLES: Record<string, { icon: typeof Calendar; color: string; bg: string }> = {
  fomc: { icon: Landmark, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
  dividend: { icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  split: { icon: Scissors, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
};

function formatEventDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function UpcomingEvents({ ticker }: Props) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    fetchEvents(ticker)
      .then((data) => { if (!cancelled) setEvents(data.events); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading || events.length === 0) return null;

  return (
    <div className="bg-surface-card border border-edge rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-dim" />
        <h3 className="text-sm font-medium text-dim">Upcoming Events (Next 20 Trading Days)</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {events.map((event, i) => {
          const style = EVENT_STYLES[event.type] || EVENT_STYLES.fomc;
          const Icon = style.icon;
          const days = daysUntil(event.date);
          const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`;
          return (
            <div
              key={`${event.type}-${event.date}-${i}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${style.bg}`}
              title={event.description}
            >
              <Icon className={`w-3.5 h-3.5 ${style.color}`} />
              <span className="text-white font-medium">{event.label}</span>
              <span className="text-dim">{formatEventDate(event.date)}</span>
              <span className={`font-mono ${days <= 3 ? 'text-amber-400' : 'text-dim'}`}>
                {daysLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
