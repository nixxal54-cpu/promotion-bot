/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Film,
  Send,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Power,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Copy,
  ExternalLink,
  Terminal,
  Activity,
  Layers,
  HelpCircle,
  Database,
  Lock,
  Search,
} from 'lucide-react';

interface BotState {
  requestCount: number;
  promoThreshold: number;
  promoCooldownMinutes: number;
  isPromoEnabled: boolean;
  lastPromotionAt: number | null;
  totalPromotionsSent: number;
  totalEligibleRequests: number;
  lastError: string | null;
  updatedAt: number;
}

interface SafeConfig {
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
  hasDatabaseUrl: boolean;
  groupId: string | null;
  websiteUrl: string;
  promoThreshold: number;
  promoCooldownMinutes: number;
  runMode: string;
  nodeEnv: string;
  adminCount: number;
}

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details?: Record<string, unknown>;
}

interface DetectionResult {
  isMatch: boolean;
  confidence: number;
  reason: string;
  detectedYear?: number;
  detectedQuality?: string;
  normalizedTitle?: string;
}

export default function App() {
  const [state, setState] = useState<BotState | null>(null);
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Playground detection tester
  const [testText, setTestText] = useState('Leo 2023');
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [testingDetector, setTestingDetector] = useState(false);

  // Simulation lab
  const [simText, setSimText] = useState('Interstellar 1080p');
  const [simIsBot, setSimIsBot] = useState(false);
  const [simFeedback, setSimFeedback] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Reset confirmation modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Copied toast indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'simulator' | 'detector' | 'architecture' | 'deployment'>('dashboard');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
        setConfig(data.config);
        setLogs(data.auditLogs || []);
      }
    } catch {
      // In static or test preview fallback
      setState((prev) => prev || {
        requestCount: 7,
        promoThreshold: 10,
        promoCooldownMinutes: 30,
        isPromoEnabled: true,
        lastPromotionAt: Date.now() - 45 * 60 * 1000,
        totalPromotionsSent: 14,
        totalEligibleRequests: 147,
        lastError: null,
        updatedAt: Date.now(),
      });
      setConfig((prev) => prev || {
        hasBotToken: false,
        hasWebhookSecret: true,
        hasDatabaseUrl: false,
        groupId: '-1001234567890',
        websiteUrl: 'https://socialmingle.example.com',
        promoThreshold: 10,
        promoCooldownMinutes: 30,
        runMode: 'webhook',
        nodeEnv: 'development',
        adminCount: 1,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Run detection check
  const handleTestDetection = async (textToTest = testText) => {
    setTestingDetector(true);
    try {
      const res = await fetch('/api/test-detector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToTest }),
      });
      if (res.ok) {
        const result = await res.json();
        setDetectionResult(result);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTestingDetector(false);
    }
  };

  useEffect(() => {
    handleTestDetection('Leo 2023');
  }, []);

  // Run simulation
  const handleSimulateRequest = async (text = simText, isBot = simIsBot) => {
    setSimulating(true);
    setSimFeedback(null);
    try {
      const res = await fetch('/api/simulate-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, isBot }),
      });
      const data = await res.json();
      if (data.processed) {
        setSimFeedback(`✅ Processed: ${data.result.reason}`);
        if (data.updatedState) {
          setState(data.updatedState);
        }
      } else {
        setSimFeedback(`ℹ️ Filtered: ${data.reason}`);
      }
      fetchStatus();
    } catch (err) {
      setSimFeedback(`❌ Error: ${(err as Error).message}`);
    } finally {
      setSimulating(false);
    }
  };

  // Toggle promo enabled
  const handleTogglePromo = async () => {
    if (!state) return;
    const newEnabled = !state.isPromoEnabled;
    try {
      const res = await fetch('/api/admin/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (res.ok) {
        setState((prev) => (prev ? { ...prev, isPromoEnabled: newEnabled } : null));
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Reset counter
  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) {
        setShowResetModal(false);
        fetchStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setResetting(false);
    }
  };

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const calculateCooldown = () => {
    if (!state?.lastPromotionAt) return { active: false, remainingMin: 0 };
    const elapsed = Date.now() - state.lastPromotionAt;
    const cooldownMs = (state.promoCooldownMinutes || 30) * 60 * 1000;
    if (elapsed < cooldownMs) {
      return {
        active: true,
        remainingMin: Math.ceil((cooldownMs - elapsed) / 60000),
      };
    }
    return { active: false, remainingMin: 0 };
  };

  const cooldownStatus = calculateCooldown();
  const currentCount = state?.requestCount ?? 0;
  const threshold = state?.promoThreshold ?? 10;
  const progressPercent = Math.min(100, Math.round((currentCount / threshold) * 100));

  if (loading && !state) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-slate-400 font-mono text-sm">Initializing Movie Promo Bot Service...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-0 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-gradient-to-tr from-rose-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20 flex-shrink-0">
              <Film className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-white tracking-tight whitespace-nowrap">
                  Movie Promo Bot
                </h1>
                <span className="hidden md:inline-block text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  grammY • Node 22
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block truncate">
                Autonomous Telegram Group Promotion Engine for Social Connection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 sm:py-1.5 rounded-lg border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${state?.isPromoEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="font-medium text-slate-300 text-[11px] sm:text-xs whitespace-nowrap">
                {state?.isPromoEnabled ? 'Active' : 'Paused'}
              </span>
            </div>

            <button
              onClick={() => {
                setRefreshing(true);
                fetchStatus();
              }}
              title="Refresh status"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto text-sm border-t border-slate-800/60">
          {[
            { id: 'dashboard', label: 'Overview & Metrics', icon: Activity },
            { id: 'simulator', label: 'Simulation Lab', icon: Send },
            { id: 'detector', label: 'Title Detector', icon: Search },
            { id: 'architecture', label: 'Group Flow & Privacy', icon: Layers },
            { id: 'deployment', label: 'Render & Production Guide', icon: Database },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap ${
                  active
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Status Alert Bar */}
        {state?.lastError && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Recent Promotion Notice:</p>
              <p className="text-amber-300/90 text-xs mt-0.5">{state.lastError}</p>
              <p className="text-xs text-amber-400/70 mt-1">
                Note: The request count was safely preserved; no requests were discarded.
              </p>
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW & METRICS */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Request Counter */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Eligible Requests</span>
                  <Film className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white tracking-tight">{currentCount}</span>
                  <span className="text-slate-400 font-mono text-sm">/ {threshold} trigger</span>
                </div>
                {/* Progress bar */}
                <div className="mt-3 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-rose-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {threshold - currentCount > 0
                    ? `${threshold - currentCount} more movie requests until trigger`
                    : 'Threshold reached! Ready on next request'}
                </p>
              </div>

              {/* Card 2: Cooldown Timer */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Cooldown State</span>
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  {cooldownStatus.active ? (
                    <>
                      <span className="text-2xl font-bold text-amber-400 tracking-tight">
                        {cooldownStatus.remainingMin}m
                      </span>
                      <span className="text-xs text-amber-300 font-mono">active cooldown</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-emerald-400 tracking-tight">Ready</span>
                      <span className="text-xs text-slate-400 font-mono">No active cooldown</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                  Configured window: {state?.promoCooldownMinutes || 30} mins between promotions
                </p>
              </div>

              {/* Card 3: Promotions Sent */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Promotions Posted</span>
                  <CheckCircle2 className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-3xl font-extrabold text-white tracking-tight">
                  {state?.totalPromotionsSent ?? 0}
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                  Lifetime posts in group: {config?.groupId || 'Configured Group'}
                </p>
              </div>

              {/* Card 4: Engine Status & Kill Switch */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Promotion Engine</span>
                  <Power className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold text-lg ${
                      state?.isPromoEnabled ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {state?.isPromoEnabled ? 'ENABLED' : 'PAUSED'}
                  </span>
                  <button
                    onClick={handleTogglePromo}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      state?.isPromoEnabled
                        ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
                    }`}
                  >
                    {state?.isPromoEnabled ? 'Pause (/promo_off)' : 'Enable (/promo_on)'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">Instant administrator kill switch</p>
              </div>
            </div>

            {/* Quick Actions & Live Message Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Promotion Copy & Admin Controls */}
              <div className="lg:col-span-2 space-y-4">
                {/* Promotional Message Copy Box */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <h3 className="font-semibold text-sm text-white">Live Telegram Promotional Copy</h3>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      link_preview_options.is_disabled = true
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-sans text-sm text-slate-200 leading-relaxed space-y-2">
                    <p className="font-semibold text-rose-400">❤️ Looking to make new connections?</p>
                    <p className="text-slate-300">Discover our social-connection platform:</p>
                    <p className="text-indigo-400 underline font-mono text-xs break-all">
                      {config?.websiteUrl || 'https://your-social-website.com'}
                    </p>
                    <p className="text-slate-400 text-xs italic">Check it out if you're interested.</p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <span>Configured via <code>WEBSITE_URL</code></span>
                    <button
                      onClick={() =>
                        copyToClipboard('copy_msg', `❤️ Looking to make new connections?\n\nDiscover our social-connection platform:\n${config?.websiteUrl}\n\nCheck it out if you're interested.`)
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedKey === 'copy_msg' ? 'Copied!' : 'Copy Text'}
                    </button>
                  </div>
                </div>

                {/* Counter Management & Reset */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-sm text-white">Counter State & Two-Step Reset</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Reset counter to 0 manually. Requires explicit verification to prevent accidental resets.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowResetModal(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/10 hover:text-rose-400 text-slate-300 border border-slate-700 hover:border-rose-500/30 text-xs font-semibold transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                    Reset Counter (/promo_reset)
                  </button>
                </div>
              </div>

              {/* Right Col: Configuration & Guardrails */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-sm text-white">Security & Guardrails</h3>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <span className="text-slate-400">Telegram Bot Token:</span>
                    <span className="font-mono text-emerald-400">
                      {config?.hasBotToken ? 'Configured ✅' : 'Sandbox Simulated 🧪'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <span className="text-slate-400">Webhook Secret Check:</span>
                    <span className="font-mono text-emerald-400">
                      {config?.hasWebhookSecret ? 'Enforced (X-Telegram-Secret) ✅' : 'Optional'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <span className="text-slate-400">Target Group Lock:</span>
                    <span className="font-mono text-indigo-300">
                      {config?.groupId ? config.groupId : 'Fail-safe active'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <span className="text-slate-400">Database Storage:</span>
                    <span className="font-mono text-cyan-300">
                      {config?.hasDatabaseUrl ? 'PostgreSQL (Render)' : 'SQLite WAL (Local)'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <span className="text-slate-400">Admin Allowlist:</span>
                    <span className="font-mono text-slate-300">
                      {config?.adminCount ? `${config.adminCount} IDs + Group Admins` : 'Group Admins Only'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <p className="font-medium text-slate-300">Bot Isolation Guarantee:</p>
                  <p>• Completely independent of third-party movie file bot.</p>
                  <p>• Ignores all bot messages, service notifications, and commands.</p>
                </div>
              </div>
            </div>

            {/* Audit Log Stream */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-sm text-white">Recent Event Audit Trail</h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {logs.length} logged events
                </span>
              </div>

              {logs.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No audit events recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs flex items-start justify-between gap-4 font-mono"
                    >
                      <div className="space-y-0.5">
                        <span
                          className={`font-semibold ${
                            log.action.includes('SUCCESS')
                              ? 'text-emerald-400'
                              : log.action.includes('FAILED')
                              ? 'text-rose-400'
                              : 'text-indigo-400'
                          }`}
                        >
                          {log.action}
                        </span>
                        {log.details && (
                          <p className="text-slate-400 text-[11px] truncate max-w-md">
                            {JSON.stringify(log.details)}
                          </p>
                        )}
                      </div>
                      <span className="text-slate-500 text-[10px] flex-shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SIMULATION LAB */}
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2 className="text-base font-bold text-white">Telegram Group Message Simulator</h2>
                  <p className="text-xs text-slate-400">
                    Test how the live bot processes requests, increments counters, enforces cooldowns, and triggers promotions.
                  </p>
                </div>
              </div>

              {/* Preset Buttons */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Click a preset query to test:</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '🎬 Leo 2023', text: 'Leo 2023', isBot: false },
                    { label: '🚀 Interstellar 1080p', text: 'Interstellar 1080p Bluray', isBot: false },
                    { label: '🏜️ Dune: Part Two', text: 'Dune: Part Two (2024)', isBot: false },
                    { label: '⚡ Avengers Endgame', text: 'Avengers Endgame', isBot: false },
                    { label: '🤖 Movie Bot Response (is_bot: true)', text: 'Found 3 files for Leo 2023', isBot: true },
                    { label: '💬 Chatter: "hi admin"', text: 'hi admin please send link', isBot: false },
                    { label: '⚙️ Command: /start', text: '/start', isBot: false },
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSimText(preset.text);
                        setSimIsBot(preset.isBot);
                        handleSimulateRequest(preset.text, preset.isBot);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input Form */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Message Text</label>
                  <input
                    type="text"
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    placeholder="Enter movie title query..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Sender Type</label>
                  <select
                    value={simIsBot ? 'bot' : 'user'}
                    onChange={(e) => setSimIsBot(e.target.value === 'bot')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="user">Regular Group Member (is_bot: false)</option>
                    <option value="bot">Third-Party Bot (is_bot: true)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400">
                  Target Group ID: <code>{config?.groupId || '-1001234567890'}</code>
                </span>
                <button
                  onClick={() => handleSimulateRequest(simText, simIsBot)}
                  disabled={simulating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${simulating ? 'animate-pulse' : ''}`} />
                  {simulating ? 'Processing...' : 'Dispatch Request Update'}
                </button>
              </div>

              {/* Result Feedback Banner */}
              {simFeedback && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200">
                  {simFeedback}
                </div>
              )}
            </div>

            {/* Pipeline Step Walkthrough */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="font-semibold text-sm text-white">How Each Message Is Handled:</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-indigo-400">1. Filter Gate</span>
                  <p className="text-slate-400 mt-1">
                    Ignores bots, bot's self messages, commands (/), service notices, and wrong groups.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-indigo-400">2. Title Detection</span>
                  <p className="text-slate-400 mt-1">
                    Heuristic analyzer strips resolution tags, identifies release year, rejects chat fillers.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-indigo-400">3. Deduplication</span>
                  <p className="text-slate-400 mt-1">
                    Tracks <code>update_id</code> in SQLite/Postgres to prevent duplicate counting on network retries.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-indigo-400">4. Trigger & Reset</span>
                  <p className="text-slate-400 mt-1">
                    At 10 requests, sends promo if cooldown permits. Resets counter ONLY after Telegram send success.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TITLE DETECTOR PLAYGROUND */}
        {activeTab === 'detector' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2 className="text-base font-bold text-white">Heuristic Title Detector Playground</h2>
                  <p className="text-xs text-slate-400">
                    Analyze free-text messages to test heuristic extraction of movie titles, release years, quality tags, and chatter blocklist.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={testText}
                  onChange={(e) => {
                    setTestText(e.target.value);
                    handleTestDetection(e.target.value);
                  }}
                  placeholder="Type any message (e.g. Leo 2023, Interstellar 1080p, hi admin)..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => handleTestDetection(testText)}
                  disabled={testingDetector}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors"
                >
                  Analyze
                </button>
              </div>

              {/* Sample Suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                <span>Quick tests:</span>
                {[
                  'Leo 2023',
                  'Inception 1080p bluray',
                  'K.G.F: Chapter 2',
                  'RRR 2022',
                  'Spider-Man No Way Home 4k',
                  'thanks',
                  'good morning',
                  'https://spam.link',
                  '/movie Inception',
                ].map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTestText(sample);
                      handleTestDetection(sample);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px]"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {/* Detection Analysis Result Box */}
              {detectionResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    detectionResult.isMatch
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {detectionResult.isMatch ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-rose-400" />
                      )}
                      <span
                        className={`font-bold text-sm ${
                          detectionResult.isMatch ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {detectionResult.isMatch ? 'MATCHED: Eligible Movie Request' : 'REJECTED: Non-Movie Message'}
                      </span>
                    </div>

                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                      Confidence: {(detectionResult.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mb-3">
                    <span className="font-semibold">Evaluator Verdict:</span> {detectionResult.reason}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Clean Title:</span>
                      <span className="text-indigo-300 font-semibold truncate block">
                        {detectionResult.normalizedTitle || 'None'}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Detected Year:</span>
                      <span className="text-amber-300 font-semibold">
                        {detectionResult.detectedYear ?? 'None'}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Quality Tags:</span>
                      <span className="text-cyan-300 font-semibold truncate block">
                        {detectionResult.detectedQuality || 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: GROUP FLOW & PRIVACY MODE ARCHITECTURE */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            {/* Architecture Overview */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Three-Party Architecture Diagram</h2>
              </div>

              <p className="text-xs text-slate-400">
                How Movie Promo Bot coexists peacefully with the existing third-party movie bot without requiring any modifications or permissions on it:
              </p>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4 font-mono text-xs">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-indigo-400 font-bold">1. Group Member</span>
                    <p className="text-slate-400 text-[11px]">Sends title: "Leo 2023"</p>
                  </div>
                  <span className="text-slate-500">───┬───&gt;</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Third party bot branch */}
                  <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5 opacity-80">
                    <span className="text-amber-400 font-bold">Existing Movie Bot (Untouched)</span>
                    <p className="text-slate-400 text-[11px]">
                      • Detects "Leo 2023"<br />
                      • Replies with file button / opens private chat<br />
                      • Delivers movie file to user via /start
                    </p>
                  </div>

                  {/* Our promo bot branch */}
                  <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-500/40 space-y-1.5">
                    <span className="text-emerald-400 font-bold">Movie Promo Bot (This Bot)</span>
                    <p className="text-slate-300 text-[11px]">
                      • Detects "Leo 2023" as an eligible movie query<br />
                      • Increments persistent counter (e.g. 7 → 8 / 10)<br />
                      • Ignores the third-party movie bot's reply<br />
                      • When threshold 10 is reached: posts respectful promo
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Telegram Privacy Mode Guide */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Telegram Privacy Mode Setup (Critical)</h3>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                <p className="font-semibold text-amber-300">Why Privacy Mode must be disabled:</p>
                <p>
                  By default, Telegram bots added to groups run in "Group Privacy Mode", meaning Telegram only forwards messages starting with <code>/</code> (commands), replies to the bot, or mentions (<code>@bot</code>).
                </p>
                <p>
                  Because group members send plain text titles (e.g. <i>"Leo 2023"</i>) without mentioning the bot, Privacy Mode must be turned <b>OFF</b> in @BotFather so Telegram sends ordinary text messages to the webhook.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <h4 className="font-semibold text-slate-200">Step-by-Step Instructions:</h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                  <li>Open Telegram and start a chat with <code className="text-indigo-400">@BotFather</code>.</li>
                  <li>Send the command: <code>/setprivacy</code>.</li>
                  <li>Choose your bot username.</li>
                  <li>Select <b>Disable</b>. Telegram will confirm: <i>"Privacy mode is now disabled for..."</i></li>
                  <li>Add your bot to the movie group as a member (or administrator).</li>
                  <li>
                    <i>Note:</i> If the bot was already in the group, remove it and re-add it to immediately refresh Telegram's cached permissions.
                  </li>
                  <li>
                    Send <code>/diagnostics</code> inside the group to verify that the bot receives updates!
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: RENDER DEPLOYMENT & PRODUCTION GUIDE */}
        {activeTab === 'deployment' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Render Production Deployment Guide</h2>
              </div>

              <p className="text-xs text-slate-400">
                Deploying to Render takes under 3 minutes using the provided <code>render.yaml</code> or manual web service configuration.
              </p>

              {/* Exact Build & Start Commands */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[11px] block">Render Build Command:</span>
                  <div className="flex items-center justify-between text-indigo-300">
                    <code>npm install --legacy-peer-deps --include=dev && npm run build</code>
                    <button
                      onClick={() => copyToClipboard('build_cmd', 'npm install --legacy-peer-deps --include=dev && npm run build')}
                      className="p-1 hover:text-white"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[11px] block">Render Start Command:</span>
                  <div className="flex items-center justify-between text-emerald-300">
                    <code>npm run start</code>
                    <button
                      onClick={() => copyToClipboard('start_cmd', 'npm run start')}
                      className="p-1 hover:text-white"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Required Environment Variables Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-200">Required Environment Variables on Render:</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-slate-400">
                        <th className="py-2 px-3">Variable</th>
                        <th className="py-2 px-3">Purpose</th>
                        <th className="py-2 px-3">Example Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      <tr>
                        <td className="py-2 px-3 text-indigo-400">BOT_TOKEN</td>
                        <td className="py-2 px-3 text-slate-400">Telegram Bot Token from @BotFather</td>
                        <td className="py-2 px-3">7123456789:ABCdef...</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-indigo-400">WEBHOOK_URL</td>
                        <td className="py-2 px-3 text-slate-400">Your Render public service URL</td>
                        <td className="py-2 px-3">https://movie-promo-bot.onrender.com</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-indigo-400">WEBHOOK_SECRET</td>
                        <td className="py-2 px-3 text-slate-400">Secret for Telegram header auth</td>
                        <td className="py-2 px-3">a-secure-random-32-char-string</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-indigo-400">GROUP_ID</td>
                        <td className="py-2 px-3 text-slate-400">Target Telegram group ID</td>
                        <td className="py-2 px-3">-1001234567890</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-indigo-400">WEBSITE_URL</td>
                        <td className="py-2 px-3 text-slate-400">Your website to promote</td>
                        <td className="py-2 px-3">https://your-social-website.com</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-indigo-400">DATABASE_URL</td>
                        <td className="py-2 px-3 text-slate-400">Render PostgreSQL connection string</td>
                        <td className="py-2 px-3">postgres://user:pass@host/db</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Token Rotation Instructions */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <h4 className="font-semibold text-rose-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  How to Rotate a Compromised Telegram Bot Token:
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Message <code className="text-indigo-400">@BotFather</code> on Telegram.</li>
                  <li>Send <code>/revoke</code> and select your bot. BotFather immediately invalidates the old token and issues a new one.</li>
                  <li>Open your <b>Render Dashboard → Environment</b> tab.</li>
                  <li>Update the <code>BOT_TOKEN</code> variable with the new token and click <i>Save Changes</i>.</li>
                  <li>Render will automatically re-deploy, update the Telegram webhook, and resume processing.</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal for Resetting Counter */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Confirm Counter Reset</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to reset the current movie request counter from{' '}
              <span className="font-mono font-bold text-rose-400">{currentCount}</span> to{' '}
              <span className="font-mono font-bold text-emerald-400">0</span>?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={resetting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Yes, Reset Counter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>Movie Promo Bot • Built with grammY, TypeScript & Express • Production Ready for Render</p>
      </footer>
    </div>
  );
}
