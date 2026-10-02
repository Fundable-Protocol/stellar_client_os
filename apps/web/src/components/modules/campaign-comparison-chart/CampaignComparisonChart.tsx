/**
 * Campaign Comparison Chart
 * 
 * Issue #1015: Campaign comparison chart - historical impact
 * 
 * Displays historical CO2 sequestration over time for campaigns,
 * with comparison to baseline tree growth models and similar campaigns.
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Loader2, TrendingUp, TreePine, BarChart2, Info, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider as TooltipProviderUI } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  CampaignAnalyticsService,
  CampaignHistoricalData,
  HistoricalDataPoint,
  BaselineModel,
  SimilarCampaignComparison,
  CampaignComparisonConfig,
} from '@/services/campaignAnalytics';

interface CampaignComparisonChartProps {
  initialCampaignIds?: string[];
  className?: string;
}

export function CampaignComparisonChart({ initialCampaignIds = [], className }: CampaignComparisonChartProps) {
  const [allCampaigns, setAllCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialCampaignIds);
  const [campaignData, setCampaignData] = useState<CampaignHistoricalData[]>([]);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<CampaignComparisonConfig>({
    campaignIds: initialCampaignIds,
    timeRange: 'all',
    includeBaseline: true,
    includeSimilarCampaigns: true,
    maxSimilarCampaigns: 3,
  });
  const [activeTab, setActiveTab] = useState<'comparison' | 'baseline' | 'similar'>('comparison');
  const [showCampaignSelector, setShowCampaignSelector] = useState(false);

  // Load available campaigns on mount
  useEffect(() => {
    loadAvailableCampaigns();
  }, []);

  // Load campaign data when selection changes
  useEffect(() => {
    if (selectedIds.length > 0) {
      loadCampaignData();
    } else {
      setCampaignData([]);
    }
  }, [selectedIds, config.timeRange, config.includeBaseline, config.includeSimilarCampaigns, config.maxSimilarCampaigns]);

  const loadAvailableCampaigns = async () => {
    try {
      const campaigns = await campaignAnalyticsService.getAvailableCampaigns();
      setAllCampaigns(campaigns.map(c => ({ id: c.id, name: c.name })));
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    }
  };

  const loadCampaignData = async () => {
    if (selectedIds.length === 0) {
      setCampaignData([]);
      return;
    }

    setLoading(true);
    try {
      const data = await campaignAnalyticsService.getCampaignComparison({
        ...config,
        campaignIds: selectedIds,
      });
      setCampaignData(data);
    } catch (error) {
      console.error('Failed to load campaign data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCampaignSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(p => p !== id);
      }
      if (prev.length >= 5) {
        alert('Maximum 5 campaigns for comparison');
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const handleConfigChange = useCallback((key: keyof CampaignComparisonConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Format data for Recharts
  const chartData = useMemo(() => {
    if (campaignData.length === 0) return [];

    // Create unified timeline
    const allDates = new Set<string>();
    for (const campaign of campaignData) {
      for (const point of campaign.dataPoints) {
        allDates.add(point.date);
      }
    }
    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map(date => {
      const row: Record<string, any> = { date };
      for (const campaign of campaignData) {
        const point = campaign.dataPoints.find(p => p.date === date);
        if (point) {
          row[`${campaign.campaignId}_co2`] = point.cumulativeCo2;
          row[`${campaign.campaignId}_trees`] = point.cumulativeTrees;
        }
      }
      return row;
    });
  }, [campaignData]);

  // Baseline data for chart
  const baselineData = useMemo(() => {
    if (!config.includeBaseline || campaignData.length === 0) return [];
    return campaignData.flatMap(campaign => 
      campaign.baselineModel.growthCurve.map((point, year) => ({
        year: `Year ${year}`,
        expectedCo2PerTree: point.expectedCo2PerTree,
        survivalRate: point.survivalRate,
        campaignName: campaign.campaignName,
      }))
    );
  }, [campaignData, config.includeBaseline]);

  // Similar campaigns data
  const similarCampaignsData = useMemo(() => {
    if (!config.includeSimilarCampaigns || campaignData.length === 0) return [];
    return campaignData.flatMap(campaign => 
      campaign.similarCampaigns.map(sim => ({
        campaignName: sim.campaignName,
        similarityScore: sim.similarityScore,
        region: sim.region,
        projectType: sim.projectType,
        dataPoints: sim.dataPoints,
      }))
    );
  }, [campaignData, config.includeSimilarCampaigns]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(Math.round(num));
  };

  if (loading && campaignData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedIds.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5" />
            Campaign Comparison Chart
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-12">
          <TreePine className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Select campaigns to compare</h3>
          <p className="text-muted-foreground mb-6">
            Choose up to 5 campaigns to compare their historical CO₂ impact
          </p>
          <Button onClick={() => setShowCampaignSelector(true)}>
            <Info className="w-4 h-4 mr-2" />
            Browse Campaigns
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('space-y-6', className)}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Campaign Impact Comparison
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Compare {selectedIds.length} campaign{selectedIds.length !== 1 ? 's' : ''} 
              over {config.timeRange === 'all' ? 'all time' : config.timeRange}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <TreePine className="w-3 h-3" />
              {selectedIds.length}/5 selected
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setShowCampaignSelector(true)}>
              + Add Campaign
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Time Range:</label>
            <Select value={config.timeRange} onValueChange={v => handleConfigChange('timeRange', v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
                <SelectItem value="3y">3 Years</SelectItem>
                <SelectItem value="5y">5 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Show:</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={config.includeBaseline}
                  onChange={e => handleConfigChange('includeBaseline', e.target.checked)}
                  className="rounded border-input"
                />
                Baseline Model
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={config.includeSimilarCampaigns}
                  onChange={e => handleConfigChange('includeSimilarCampaigns', e.target.checked)}
                  className="rounded border-input"
                />
                Similar Campaigns
              </label>
            </div>
          </div>
          <Separator className="h-6" orientation="vertical" />
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList>
              <TabsTrigger value="comparison">CO₂ Comparison</TabsTrigger>
              <TabsTrigger value="baseline">Baseline Model</TabsTrigger>
              <TabsTrigger value="similar">Similar Campaigns</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Chart */}
        <div className="h-[500px]">
          {activeTab === 'comparison' && (
            <ResponsiveContainer width="100%" height="100%">
              <TooltipProviderUI>
                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 60, bottom: 20 }}>
                  <defs>
                    {campaignData.map((campaign, i) => (
                      <linearGradient key={campaign.campaignId} id={`colorCo2-${campaign.campaignId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getCampaignColor(i)} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={getCampaignColor(i)} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    label={{ value: 'Cumulative CO₂ (tons)', angle: -90, position: 'insideLeft', offset: 20 }}
                    tickFormatter={formatNumber}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    content={<CustomTooltip campaigns={campaignData} />}
                    formatter={(value: number) => [formatNumber(value), 'tons CO₂']}
                  />
                  <Legend />
                  {campaignData.map((campaign, i) => (
                    <Area
                      key={campaign.campaignId}
                      type="monotone"
                      dataKey={`${campaign.campaignId}_co2`}
                      name={campaign.campaignName}
                      stroke={getCampaignColor(i)}
                      fill={`url(#colorCo2-${campaign.campaignId})`}
                      strokeWidth={2}
                      fillOpacity={0.6}
                    />
                  ))}
                  {config.includeBaseline && campaignData[0]?.baselineModel.growthCurve.length > 0 && (
                    <Line
                      type="monotone"
                      dataKey="baseline_co2"
                      name="Baseline Model (per tree)"
                      stroke="gray"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </AreaChart>
              </TooltipProviderUI>
            </ResponsiveContainer>
          )}

          {activeTab === 'baseline' && (
            <ResponsiveContainer width="100%" height="100%">
              <TooltipProviderUI>
                <LineChart data={baselineData} margin={{ top: 20, right: 30, left: 60, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis 
                    label={{ value: 'Expected CO₂ per Tree (tons)', angle: -90, position: 'insideLeft', offset: 20 }}
                    tickFormatter={v => v.toFixed(2)}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toFixed(3), 'tons CO₂/tree']}
                  />
                  <Legend />
                  {campaignData.map((campaign, i) => (
                    <Line
                      key={`${campaign.campaignId}-baseline`}
                      type="monotone"
                      dataKey="expectedCo2PerTree"
                      name={campaign.campaignName}
                      stroke={getCampaignColor(i)}
                      strokeWidth={2}
                      dot={true}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="survivalRate"
                    name="Survival Rate"
                    stroke="red"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    yAxisId="right"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    label={{ value: 'Survival Rate', angle: 90, position: 'insideRight', offset: 20 }}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    domain={[0, 1]}
                  />
                </LineChart>
              </TooltipProviderUI>
            </ResponsiveContainer>
          )}

          {activeTab === 'similar' && (
            <div className="space-y-4">
              <h3 className="font-medium">Similar Campaigns Comparison</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {similarCampaignsData.map((sim, i) => (
                  <Card key={sim.campaignName}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{sim.campaignName}</CardTitle>
                        <Badge variant="outline">
                          {(sim.similarityScore * 100).toFixed(0)}% match
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2">
                        {sim.region} • {sim.projectType.replace('_', ' ')}
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={sim.dataPoints} margin={{ top: 10, right: 10, left: 40, bottom: 20 }}>
                          <defs>
                            <linearGradient id={`sim-color-${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={getCampaignColor(i)} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={getCampaignColor(i)} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="date" tickFormatter={formatDate} interval="preserveStartEnd" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={formatNumber} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => [formatNumber(value), 'tons CO₂']} />
                          <Area
                            type="monotone"
                            dataKey="cumulativeCo2"
                            stroke={getCampaignColor(i)}
                            fill={`url(#sim-color-${i})`}
                            strokeWidth={1.5}
                            fillOpacity={0.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
          {campaignData.map((campaign, i) => {
            const latestPoint = campaign.dataPoints[campaign.dataPoints.length - 1];
            return (
              <Card key={campaign.campaignId} className="border-l-4" style={{ borderLeftColor: getCampaignColor(i) }}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{campaign.campaignName}</p>
                      <p className="text-2xl font-bold">{formatNumber(latestPoint?.cumulativeCo2 || 0)}</p>
                      <p className="text-sm text-muted-foreground">tons CO₂ sequestered</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{formatNumber(latestPoint?.cumulativeTrees || 0)}</p>
                      <p className="text-sm text-muted-foreground">trees planted</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </CardContent>

      {/* Campaign Selector Modal */}
      {showCampaignSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Select Campaigns to Compare</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowCampaignSelector(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-muted-foreground mb-4">
                Select up to 5 campaigns. Currently selected: {selectedIds.length}/5
              </p>
              <div className="space-y-2">
                {allCampaigns.map(campaign => (
                  <label
                    key={campaign.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                      selectedIds.includes(campaign.id)
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <span className="font-medium">{campaign.name}</span>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(campaign.id)}
                      onChange={() => handleCampaignSelect(campaign.id)}
                      disabled={selectedIds.length >= 5 && !selectedIds.includes(campaign.id)}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCampaignSelector(false)}>Cancel</Button>
              <Button onClick={() => setShowCampaignSelector(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function CustomTooltip({ active, payload, label, campaigns }: { active?: boolean; payload?: any[]; label?: string; campaigns: CampaignHistoricalData[] }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 min-w-[200px]">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry, index) => {
        const campaign = campaigns.find(c => c.campaignId === entry.name.split('_')[0]);
        if (!campaign) return null;
        return (
          <div key={index} className="flex items-center gap-2" style={{ borderLeftColor: getCampaignColor(index) }}>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getCampaignColor(index) }} />
            <span className="text-sm font-medium">{campaign.campaignName}</span>
            <span className="text-sm font-bold ml-auto">{new Intl.NumberFormat().format(Math.round(entry.value))} tons</span>
          </div>
        );
      })}
    </div>
  );
}

function getCampaignColor(index: number): string {
  const colors = [
    '#22c55e', // green
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
  ];
  return colors[index % colors.length];
}