import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { ForecastHorizon } from '../api';

interface Props {
  horizons: ForecastHorizon[];
  spot: number;
}

export default function ForecastConeChart({ horizons, spot }: Props) {
  // Build chart data: week 0 (spot) + each horizon
  const data = [
    {
      week: 'Now',
      weekNum: 0,
      center: spot,
      range90Low: spot,
      range90High: spot,
      range68Low: spot,
      range68High: spot,
      range50Low: spot,
      range50High: spot,
    },
    ...horizons.map((h) => ({
      week: h.horizon,
      weekNum: h.horizonWeeks,
      center: h.center,
      range90Low: h.range90.low,
      range90High: h.range90.high,
      range68Low: h.range68.low,
      range68High: h.range68.high,
      range50Low: h.range50.low,
      range50High: h.range50.high,
    })),
  ];

  // Calculate Y-axis domain with some padding
  const allValues = data.flatMap(d => [d.range90Low, d.range90High]);
  const yMin = Math.floor(Math.min(...allValues) * 0.995);
  const yMax = Math.ceil(Math.max(...allValues) * 1.005);

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
          <XAxis
            dataKey="week"
            stroke="#8b8fa3"
            tick={{ fill: '#8b8fa3', fontSize: 12 }}
          />
          <YAxis
            domain={[yMin, yMax]}
            stroke="#8b8fa3"
            tick={{ fill: '#8b8fa3', fontSize: 12 }}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1d27',
              border: '1px solid #2a2e3a',
              borderRadius: '8px',
              color: '#e1e4ea',
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                range90High: '90% High',
                range90Low: '90% Low',
                range68High: '68% High',
                range68Low: '68% Low',
                range50High: '50% High',
                range50Low: '50% Low',
                center: 'Center',
              };
              return [`$${value.toFixed(2)}`, labels[name] || name];
            }}
          />

          {/* 90% band (lightest) */}
          <Area
            type="monotone"
            dataKey="range90High"
            stroke="none"
            fill="#4f8ff7"
            fillOpacity={0.1}
            stackId="none"
          />
          <Area
            type="monotone"
            dataKey="range90Low"
            stroke="none"
            fill="#4f8ff7"
            fillOpacity={0.1}
            stackId="none"
          />

          {/* 68% band (medium) */}
          <Area
            type="monotone"
            dataKey="range68High"
            stroke="none"
            fill="#4f8ff7"
            fillOpacity={0.2}
            stackId="none"
          />
          <Area
            type="monotone"
            dataKey="range68Low"
            stroke="none"
            fill="#4f8ff7"
            fillOpacity={0.2}
            stackId="none"
          />

          {/* 50% band (darkest) */}
          <Area
            type="monotone"
            dataKey="range50High"
            stroke="none"
            fill="#4f8ff7"
            fillOpacity={0.35}
            stackId="none"
          />
          <Area
            type="monotone"
            dataKey="range50Low"
            stroke="none"
            fill="#4f8ff7"
            fillOpacity={0.35}
            stackId="none"
          />

          {/* Center forecast line */}
          <Area
            type="monotone"
            dataKey="center"
            stroke="#4f8ff7"
            strokeWidth={2}
            fill="none"
            dot={{ fill: '#4f8ff7', r: 4 }}
          />

          {/* Spot price reference line */}
          <ReferenceLine
            y={spot}
            stroke="#8b8fa3"
            strokeDasharray="5 5"
            label={{ value: `Spot $${spot.toFixed(2)}`, fill: '#8b8fa3', fontSize: 11, position: 'right' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
