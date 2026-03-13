import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../config/theme';
import { api } from '../services/api';
import { UpcomingEvent } from '../types/forecast';

interface Props {
  ticker: string;
}

const EVENT_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  earnings: { text: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  fomc: { text: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.2)' },
  dividend: { text: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)' },
  split: { text: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
};

const EVENT_ICONS: Record<string, string> = {
  earnings: 'E',
  fomc: 'F',
  dividend: '$',
  split: 'S',
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
    api.fetchEvents(ticker)
      .then((data) => { if (!cancelled) setEvents(data.events); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading || events.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Upcoming Events (Next 20 Trading Days)</Text>
      <View style={styles.eventList}>
        {events.map((event, i) => {
          const style = EVENT_COLORS[event.type] || EVENT_COLORS.fomc;
          const icon = EVENT_ICONS[event.type] || '?';
          const days = daysUntil(event.date);
          const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`;

          return (
            <View
              key={`${event.type}-${event.date}-${i}`}
              style={[styles.eventChip, { backgroundColor: style.bg, borderColor: style.border }]}
            >
              <Text style={[styles.eventIcon, { color: style.text }]}>{icon}</Text>
              <Text style={styles.eventLabel}>{event.label}</Text>
              <Text style={styles.eventDate}>{formatEventDate(event.date)}</Text>
              <Text style={[styles.eventDays, days <= 3 && { color: '#fbbf24' }]}>
                {daysLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  eventList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  eventIcon: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  eventLabel: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '600',
  },
  eventDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  eventDays: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
});
