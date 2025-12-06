import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SymbolRanking } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";

interface ClusterScatterPlotProps {
  rankings: SymbolRanking[];
}

const CLUSTER_COLORS = [
  '#0066CC', // Aegean blue (C0)
  '#00A896', // Teal (C1)
  '#FF6B6B', // Coral (C2)
  '#FFD93D', // Yellow (C3)
  '#6BCB77', // Green (C4)
  '#9D4EDD', // Purple (C5)
  '#FF8C42', // Orange (C6)
  '#06BEE1', // Cyan (C7)
  '#F72585', // Pink (C8)
  '#B5838D', // Rose (C9)
];

export function ClusterScatterPlot({ rankings }: ClusterScatterPlotProps) {
  const { t } = useLanguage();

  // Transform rankings to chart data format
  const chartData = rankings.map((ranking) => {
    const normalizedRank = (rankings.length - ranking.rank) / rankings.length;
    return {
      x: normalizedRank,
      y: parseFloat(ranking.score),
      cluster: ranking.cluster_number ?? -1,
      rank: ranking.rank,
      symbolId: ranking.symbol_id,
      score: ranking.score,
    };
  });

  // Group data by cluster for separate scatter series
  const clusterGroups: { [key: number]: typeof chartData } = {};
  chartData.forEach(point => {
    const cluster = point.cluster;
    if (!clusterGroups[cluster]) {
      clusterGroups[cluster] = [];
    }
    clusterGroups[cluster].push(point);
  });

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-md p-3 shadow-lg" data-testid="chart-tooltip">
          <p className="font-semibold text-sm mb-1" data-testid="tooltip-rank">
            {t('assets.visualization.rank')}: #{data.rank}
          </p>
          <p className="text-xs text-muted-foreground mb-1" data-testid="tooltip-score">
            {t('assets.visualization.score')}: {parseFloat(data.score).toFixed(4)}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="tooltip-cluster">
            {t('assets.visualization.cluster')}: {data.cluster >= 0 ? `C${data.cluster}` : '-'}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card data-testid="card-cluster-visualization">
      <CardHeader>
        <CardTitle>{t('assets.visualization.title')}</CardTitle>
        <CardDescription>
          {t('assets.visualization.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart
            margin={{ top: 20, right: 30, bottom: 20, left: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              type="number"
              dataKey="x"
              name={t('assets.visualization.normalized_rank')}
              domain={[0, 1]}
              label={{
                value: t('assets.visualization.normalized_rank'),
                position: 'insideBottom',
                offset: -10,
                className: 'fill-foreground text-xs'
              }}
              className="text-xs"
            />
            <YAxis
              type="number"
              dataKey="y"
              name={t('assets.visualization.score')}
              label={{
                value: t('assets.visualization.score'),
                angle: -90,
                position: 'insideLeft',
                className: 'fill-foreground text-xs'
              }}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value: string) => {
                const clusterNum = parseInt(value.replace('C', ''));
                return isNaN(clusterNum) ? value : `${t('assets.cluster')} ${value}`;
              }}
            />
            {Object.entries(clusterGroups).map(([cluster, points]) => {
              const clusterNum = parseInt(cluster);
              const color = clusterNum >= 0 ? CLUSTER_COLORS[clusterNum] : '#94a3b8';
              const name = clusterNum >= 0 ? `C${clusterNum}` : t('assets.visualization.unclustered');

              return (
                <Scatter
                  key={cluster}
                  name={name}
                  data={points}
                  fill={color}
                  shape="circle"
                  data-testid={`scatter-cluster-${cluster}`}
                />
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
