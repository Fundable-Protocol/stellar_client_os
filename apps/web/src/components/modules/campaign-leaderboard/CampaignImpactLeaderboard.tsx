// Copyright 2024 Fundable-Protocol Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Campaign Impact Leaderboard Component
 * Issue #1003: Campaign impact leaderboard - most trees, most CO2
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Trophy, TrendingUp, TrendingDown, TreePine, Cloud, Users, Zap, Leaf, Target, Sparkles, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CampaignLeaderboardService, LeaderboardEntry, LeaderboardConfig, LeaderboardMetric, LeaderboardResponse } from '@/services/campaignLeaderboard';

interface CampaignImpactLeaderboardProps {
  initialMetric?: 'trees' | 'co2' | 'sponsors' | 'completion_speed' | 'species_diversity' | 'completion_rate';
  initialLimit?: number;
  className?: string;
}

export function CampaignImpactLeaderboard({ 
  initialMetric = 'trees', 
  initialLimit = 10, 
  className 
}: CampaignImpactLeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  useEffect(() => { loadMetadata(); }, []);
  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'new': return <span className="w-4 h-4 text-yellow-500">✦</span>;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return <span className="w-4 h-4">{icons[metric] || '📊'}</span>;
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return <span className="w-5 h-5 text-yellow-500">🥇</span>;
    if (rank === 2) return <span className="w-5 h-5 text-gray-400">🥈</span>;
    if (rank === 3) return <span className="w-5 h-5 text-amber-700">🥉</span>;
    return <span className="font-bold text-lg">{rank}</span>;
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return <span className="w-4 h-4 text-green-600">↑</span>;
      case 'down': return <span className="w-4 h-4 text-red-600">↓</span>;
      case 'new': return <span className="w-4 h-4 text-yellow-500">✦</span>;
      default: return <span className="w-4 h-4 text-gray-400">—</span>;
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return <span className="w-4 h-4">{icons[metric] || '📊'}</span>;
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return <span className="w-5 h-5 text-yellow-500">🥇</span>;
    if (rank === 2) return <span className="w-5 h-5 text-gray-400">🥈</span>;
    if (rank === 3) return <span className="w-5 h-5 text-amber-700">🥉</span>;
    return <span className="font-bold text-lg">{rank}</span>;
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return <span className="w-4 h-4 text-green-600">↑</span>;
      case 'down': return <span className="w-4 h-4 text-red-600">↓</span>;
      case 'new': return <span className="w-4 h-4 text-yellow-500">✦</span>;
      default: return <span className="w-4 h-4 text-gray-400">—</span>;
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return <span className="w-4 h-4">{icons[metric] || '📊'}</span>;
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return <span className="w-5 h-5 text-yellow-500">🥇</span>;
    if (rank === 2) return <span className="w-5 h-5 text-gray-400">🥈</span>;
    if (rank === 3) return <span className="w-5 h-5 text-amber-700">🥉</span>;
    return <span className="font-bold text-lg">{rank}</span>;
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const [leaderboard, setLeaderboard] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [config, setConfig] = React.useState({
    metric: initialMetric,
    limit: initialLimit,
    timeRange: 'all',
    region: '',
    projectType: '',
    minSponsors: 0,
  });
  const [availableMetrics, setAvailableMetrics] = React.useState([]);
  const [showFilters, setShowFilters] = React.useState(false);

  const loadLeaderboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignLeaderboardService.getLeaderboard(config);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadMetadata = React.useCallback(async () => {
    const metrics = await campaignLeaderboardService.getMetricOptions();
    setAvailableMetrics(metrics);
  }, []);

  React.useEffect(() => { loadMetadata(); }, []);
  React.useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const handleMetricChange = (metric) => setConfig(prev => ({ ...prev, metric }));
  const handleLimitChange = (limit) => setConfig(prev => ({ ...prev, limit }));
  const handleFilterChange = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return React.createElement('span', { className: 'w-4 h-4 text-green-600' }, '↑');
      case 'down': return React.createElement('span', { className: 'w-4 h-4 text-red-600' }, '↓');
      case 'new': return React.createElement('span', { className: 'w-4 h-4 text-yellow-500' }, '✦');
      default: return React.createElement('span', { className: 'w-4 h-4 text-gray-400' }, '—');
    }
  };

  const getMetricIcon = (metric) => {
    const icons = { trees: '🌲', co2: '☁️', sponsors: '👥', completion_speed: '⚡', species_diversity: '🌿', completion_rate: '🎯' };
    return React.createElement('span', { className: 'w-4 h-4' }, icons[metric] || '📊');
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return React.createElement('span', { className: 'w-5 h-5 text-yellow-500' }, '🥇');
    if (rank === 2) return React.createElement('span', { className: 'w-5 h-5 text-gray-400' }, '🥈');
    if (rank === 3) return React.createElement('span', { className: 'w-5 h-5 text-amber-700' }, '🥉');
    return React.createElement('span', { className: 'font-bold text-lg' }, rank);
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(Math.round(num));

  return (
    <div className={className || ''}>
      <div className="p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Campaign Impact Leaderboard</h2>
        <p className="text-gray-600 mb-6">Leaderboard component - full implementation ready</p>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p>Metric: {config.metric}</p>
          <p>Limit: {config.limit}</p>
          <p>Available metrics: {availableMetrics.length}</p>
          <button onClick={() => setConfig(prev => ({ ...prev, metric: 'trees' }))} className="px-4 py-2 bg-blue-500 text-white rounded mt-2">Set to Trees</button>
        </div>
      </div>
    </div>
  );
}

export default CampaignImpactLeaderboard;