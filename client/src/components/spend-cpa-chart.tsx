import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Loaded on its own (React.lazy in the dashboard): recharts is most of the
// dashboard's code, and the numbers above the chart need none of it.
export default function SpendCpaChart({ data }: { data: Array<{ name: string; spend: number; cpa: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
      >
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={1} />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0.3)" stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F472B6" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(156, 163, 175, 0.1)" vertical={false} />
        <XAxis 
          dataKey="name" 
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontFamily: "'Inter', sans-serif" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          yAxisId="left"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontFamily: "'Inter', sans-serif" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `€${value}`}
        />
        <YAxis 
          yAxisId="right"
          orientation="right"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontFamily: "'Inter', sans-serif" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `€${value}`}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            borderRadius: '12px',
            padding: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
          }}
          formatter={(value: number, name: string) => [
            `€${value.toFixed(2)}`,
            name === 'spend' ? 'Ad Spend' : 'CPA'
          ]}
        />
        <Bar 
          yAxisId="left"
          dataKey="spend" 
          fill="url(#barGradient)"
          radius={[6, 6, 0, 0]}
          name="spend"
          barSize={40}
        />
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="cpa" 
          stroke="hsl(var(--chart-5))"
          strokeWidth={3}
          dot={{ fill: '#fff', strokeWidth: 2, stroke: 'hsl(var(--chart-5))', r: 5 }}
          activeDot={{ r: 7, fill: 'hsl(var(--chart-5))', stroke: '#fff', strokeWidth: 2 }}
          name="cpa"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
