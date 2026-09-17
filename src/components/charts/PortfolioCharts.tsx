"use client";

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AllocationSlice, EquityPoint } from "@/services/trading/portfolio";

const PIE_COLORS = ["#7c5cff", "#22d3ee", "#22c55e", "#f59e0b", "#f43f5e", "#9d86ff", "#5a6178"];

export function EquityCurveChart({ data }: { data: EquityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" stroke="#5a6178" fontSize={11} tickLine={false} />
        <YAxis
          stroke="#5a6178"
          fontSize={11}
          tickLine={false}
          domain={["auto", "auto"]}
          width={64}
        />
        <Tooltip
          contentStyle={{
            background: "#141722",
            border: "1px solid #232838",
            borderRadius: 8,
            color: "#e7e9ee",
          }}
        />
        <Area
          type="monotone"
          dataKey="equity"
          stroke="#7c5cff"
          strokeWidth={2}
          fill="url(#eq)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AllocationChart({ data }: { data: AllocationSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#141722",
            border: "1px solid #232838",
            borderRadius: 8,
            color: "#e7e9ee",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
