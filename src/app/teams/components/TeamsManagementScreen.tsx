'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
  ChevronDown,
  Users,
  Crown,
  UserPlus,
  UserMinus,
  Shield,
  Check,
  Star,
  TrendingUp,
  PhoneCall,
  Target,
  Wallet,
  DollarSign,
  Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import { teamsService, usersService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Team {
  id: string;
  name: string;
  description: string;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
  createdAt: string;
}

interface TeamPerformance {
  id: string;
  name: string;
  leaderId: string | null;
  leaderName: string;
  memberCount: number;
  stats: {
    leads: number;
    won: number;
    revenue: number;
    calls: number;
    call_duration_seconds: number;
    expenses: number;
    profit: number;
    profitMargin: number;
    conversion: number;
  };
  leader: {
    id: string;
    name: string;
    email: string;
    role: string;
    isMemberOfTeam: boolean;
    leads: number;
    won: number;
    revenue: number;
    calls: number;
    call_duration_seconds: number;
    expenses: number;
  } | null;
  leaderRating: {
    id: string;
    rating: number;
    comment: string;
    ratedByName: string;
    updatedAt: string;
  } | null;
}

interface TeamMembership {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  isLeader: boolean;
}

interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: string;
  teamId: string | null;
  isActive?: boolean;
}

// ─── Team Form Modal ──────────────────────────────────────────────────────────
function TeamFormModal({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
  initial?: { name: string; description: string };
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setError('');
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Team name is required');
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), description.trim());
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-md p-6 fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-foreground">
            {initial ? 'Edit Team' : 'Create New Team'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Team Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g. Cairo Sales Team"
              className="input-base w-full"
              autoFocus
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Description{' '}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this team's focus…"
              rows={3}
              className="input-base w-full resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {initial ? 'Save Changes' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────
function AddMemberModal({
  open,
  onClose,
  onAdd,
  teamId,
  existingMemberIds,
  allUsers,
  usersLoading,
  usersError,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (userId: string, isLeader: boolean) => Promise<boolean>;
  teamId: string;
  existingMemberIds: string[];
  allUsers: UserProfile[];
  usersLoading: boolean;
  usersError?: string | null;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isLeader, setIsLeader] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const available = allUsers.filter((u) => !existingMemberIds.includes(u.id));
  const hasMembersInOtherTeams = available.some((u) => Boolean(u.teamId));

  useEffect(() => {
    if (open) {
      setSelectedUserId('');
      setIsLeader(false);
      setError('');
    }
  }, [open]);

  const handleAdd = async () => {
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }
    setSaving(true);
    try {
      const ok = await onAdd(selectedUserId, isLeader);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-md p-6 fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-foreground">Add Team Member</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Select User *
            </label>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setError('');
                }}
                disabled={usersLoading || available.length === 0}
                className="input-base w-full appearance-none pr-8 disabled:opacity-60"
              >
                <option value="">
                  {usersLoading
                    ? 'Loading users…'
                    : available.length === 0
                    ? 'No available users'
                    : 'Choose a user…'}
                </option>
                {!usersLoading &&
                  available.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.email} ({String(u.role || 'agent').replace('_', ' ')})
                      {u.teamId ? ' — currently in another team' : ''}
                    </option>
                  ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
            {usersLoading ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Fetching users…
              </p>
            ) : available.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">No available users</p>
            ) : hasMembersInOtherTeams ? (
              <p className="text-xs text-muted-foreground mt-1">
                Users in another team will be reassigned to this team when added.
              </p>
            ) : null}
            {usersError && (
              <p className="text-xs text-destructive mt-1">Could not load users: {usersError}</p>
            )}
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Role in Team</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsLeader(false)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${!isLeader ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
              >
                <Users size={15} />
                Team Member
              </button>
              <button
                type="button"
                onClick={() => setIsLeader(true)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${isLeader ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-border text-muted-foreground hover:border-amber-300'}`}
              >
                <Crown size={15} />
                Team Leader
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || usersLoading || available.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Add Member
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-sm p-6 fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-foreground mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Performance Panel ────────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled || !onChange}
          onClick={() => onChange?.(n)}
          className={`transition-transform ${disabled || !onChange ? '' : 'hover:scale-125 active:scale-95'}`}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star
            size={20}
            className={
              n <= value
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-muted-foreground/40'
            }
          />
        </button>
      ))}
    </div>
  );
}

function PerformancePanel({
  team,
  canRate,
}: {
  team: Team;
  canRate: boolean;
}) {
  const [data, setData] = useState<TeamPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'30' | 'all'>('all');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (rng: string) => {
    setLoading(true);
    try {
      const from = rng === '30' ? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0] : '';
      const { teams } = await teamsService.getPerformance(from || undefined, undefined);
      const mine = (teams as TeamPerformance[]).find((t) => t.id === team.id) || null;
      setData(mine);
      setRating(mine?.leaderRating?.rating || 0);
      setComment(mine?.leaderRating?.comment || '');
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  }, [team.id]);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const saveRating = async () => {
    if (!data?.leaderId || !rating) return;
    setSaving(true);
    try {
      await teamsService.rateLeader(data.id, data.leaderId, rating, comment);
      await load(range);
      toast.success('Leader rating saved');
    } catch (err: any) {
      toast.error(err?.message || 'Could not save rating');
    } finally {
      setSaving(false);
    }
  };

  const s = data?.stats;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <TrendingUp size={14} className="text-primary" />
            Performance & Profitability
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {team.name} — team KPIs, leader performance & rating
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {(
            [
              { value: '30', label: 'Last 30 days' },
              { value: 'all', label: 'All time' },
            ] as const
          ).map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                range === r.value ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <TrendingUp size={28} className="opacity-30" />
            <p className="text-sm">No performance data yet</p>
            <p className="text-xs text-center max-w-xs">
              Log calls and close deals to populate this team&apos;s performance.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Team KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="card-base !p-3.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Users size={11} /> Members
                </p>
                <p className="text-xl font-bold tabular-nums mt-1">{data.memberCount}</p>
              </div>
              <div className="card-base !p-3.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <PhoneCall size={11} /> Calls
                </p>
                <p className="text-xl font-bold tabular-nums mt-1">{s?.calls ?? 0}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtDuration(s?.call_duration_seconds ?? 0)}
                </p>
              </div>
              <div className="card-base !p-3.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Target size={11} /> Leads / Won
                </p>
                <p className="text-xl font-bold tabular-nums mt-1">
                  {s?.leads ?? 0}
                  <span className="text-sm font-medium text-muted-foreground">
                    {' '}
                    / {s?.won ?? 0}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {s?.conversion ?? 0}% conversion
                </p>
              </div>
              <div className="card-base !p-3.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <DollarSign size={11} /> Revenue
                </p>
                <p className="text-lg font-bold tabular-nums mt-1">{fmtMoney(s?.revenue ?? 0)}</p>
              </div>
              <div className="card-base !p-3.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Wallet size={11} /> Expenses
                </p>
                <p className="text-lg font-bold tabular-nums mt-1">{fmtMoney(s?.expenses ?? 0)}</p>
              </div>
              <div className="card-base !p-3.5">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Percent size={11} /> Profit
                </p>
                <p
                  className={`text-lg font-bold tabular-nums mt-1 ${
                    (s?.profit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {fmtMoney(s?.profit ?? 0)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {(s?.profitMargin ?? 0).toFixed(1)}% margin
                </p>
              </div>
            </div>

            {/* Team leader section */}
            <div className="card-base !p-4 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Crown size={15} className="text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {data.leaderName || data.leader?.name || 'Team Leader'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {data.leader?.email || ''}
                  </p>
                </div>
              </div>

              {data.leader && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Calls</p>
                    <p className="text-sm font-bold tabular-nums">
                      {data.leader.calls}
                      <span className="text-[11px] font-medium text-muted-foreground ml-1">
                        {fmtDuration(data.leader.call_duration_seconds)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Leads / Won</p>
                    <p className="text-sm font-bold tabular-nums">
                      {data.leader.leads} / {data.leader.won}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Revenue</p>
                    <p className="text-sm font-bold tabular-nums">{fmtMoney(data.leader.revenue)}</p>
                  </div>
                </div>
              )}

              {/* Leader rating */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold text-foreground">Team Leader Rating</p>
                  {data.leaderRating && (
                    <p className="text-[11px] text-muted-foreground">
                      by {data.leaderRating.ratedByName || 'an admin'} ·{' '}
                      {new Date(data.leaderRating.updatedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  )}
                </div>
                <div className="mt-2">
                  <StarRating value={rating} disabled={!canRate} onChange={setRating} />
                </div>
                {canRate ? (
                  <>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder="Add a comment about this team leader… (optional)"
                      className="input-base w-full mt-3 resize-none text-sm"
                    />
                    <button
                      onClick={saveRating}
                      disabled={saving || !rating || !data.leaderId}
                      className="btn-primary mt-3 flex items-center gap-1.5 text-sm disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save Rating
                    </button>
                  </>
                ) : data.leaderRating?.comment ? (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    “{data.leaderRating.comment}”
                  </p>
                ) : null}
                {!canRate && !data.leaderRating && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Rating not set yet — ask your Owner/Admin.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Team Detail Panel ────────────────────────────────────────────────────────
function TeamDetailPanel({
  team,
  members,
  allUsers,
  onAddMember,
  onRemoveMember,
  onSetLeader,
  loading,
  canManage,
  usersLoading,
  usersError,
}: {
  team: Team;
  members: TeamMembership[];
  allUsers: UserProfile[];
  onAddMember: (userId: string, isLeader: boolean) => Promise<boolean>;
  onRemoveMember: (userId: string, userName: string) => void;
  onSetLeader: (userId: string) => Promise<void>;
  loading: boolean;
  canManage: boolean;
  usersLoading: boolean;
  usersError?: string | null;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<'members' | 'performance'>('members');
  const existingMemberIds = members.map((m) => m.userId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{team.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && tab === 'members' && (
          <button
            onClick={() => setAddOpen(true)}
            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            <UserPlus size={13} />
            Add Member
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 px-5 pt-3 border-b border-border flex-shrink-0">
        <button
          onClick={() => setTab('members')}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
            tab === 'members'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Members
        </button>
        <button
          onClick={() => setTab('performance')}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 ${
            tab === 'performance'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Performance
        </button>
      </div>

      {team.description && tab === 'members' && (
        <div className="px-5 py-3 bg-muted/30 border-b border-border">
          <p className="text-xs text-muted-foreground">{team.description}</p>
        </div>
      )}

      {tab === 'performance' ? (
        <PerformancePanel team={team} canRate={canManage} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
              <Users size={28} className="opacity-30" />
              <p className="text-sm">No members yet</p>
              {canManage && (
                <button
                  onClick={() => setAddOpen(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Add the first member
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                    {(m.userName || m.userEmail)
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.userName || m.userEmail}
                      </p>
                      {m.isLeader && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                          <Crown size={10} />
                          Leader
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.userEmail}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!m.isLeader && (
                        <button
                          onClick={() => onSetLeader(m.userId)}
                          className="btn-ghost p-1.5 rounded-lg text-muted-foreground hover:text-amber-600"
                          title="Set as Team Leader"
                        >
                          <Crown size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => onRemoveMember(m.userId, m.userName || m.userEmail)}
                        className="btn-ghost p-1.5 rounded-lg text-muted-foreground hover:text-destructive"
                        title="Remove from team"
                      >
                        <UserMinus size={13} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canManage && (
        <AddMemberModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdd={onAddMember}
          teamId={team.id}
          existingMemberIds={existingMemberIds}
          allUsers={allUsers}
          usersLoading={usersLoading}
          usersError={usersError}
        />
      )}
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TeamsManagementScreen() {
  const { profile } = useAuth();
  const canManage = isAdminRole(profile?.role);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMembership[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);
  const [removeMember, setRemoveMember] = useState<{ userId: string; name: string } | null>(null);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setUsersLoaded(false);
    setUsersError(null);
    try {
      const [teamsData, usersData] = await Promise.all([
        teamsService.getAll(),
        usersService.getAll(),
      ]);
      setTeams(teamsData as Team[]);
      setAllUsers(usersData as UserProfile[]);
    } catch (err: any) {
      setUsersError(err?.message || 'Failed to load users');
      toast.error(err?.message || 'Failed to load teams');
    } finally {
      setUsersLoaded(true);
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (teamId: string) => {
    setMembersLoading(true);
    try {
      const data = await teamsService.getMembers(teamId);
      setMembers(data as TeamMembership[]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load team members');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedTeam) loadMembers(selectedTeam.id);
    else setMembers([]);
  }, [selectedTeam, loadMembers]);

  const handleCreateTeam = async (name: string, description: string) => {
    try {
      const created = await teamsService.create(name, description);
      setTeams((prev) => [created as Team, ...prev]);
      setCreateOpen(false);
      toast.success(`Team "${name}" created`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create team');
    }
  };

  const handleEditTeam = async (name: string, description: string) => {
    if (!editTeam) return;
    try {
      const updated = await teamsService.update(editTeam.id, name, description);
      setTeams((prev) =>
        prev.map((t) => (t.id === editTeam.id ? { ...t, ...(updated as Team) } : t))
      );
      if (selectedTeam?.id === editTeam.id)
        setSelectedTeam((prev) => (prev ? { ...prev, ...(updated as Team) } : prev));
      setEditTeam(null);
      toast.success('Team updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update team');
    }
  };

  const handleDeleteTeam = async () => {
    if (!deleteTeam) return;
    try {
      await teamsService.delete(deleteTeam.id);
      setTeams((prev) => prev.filter((t) => t.id !== deleteTeam.id));
      if (selectedTeam?.id === deleteTeam.id) setSelectedTeam(null);
      setDeleteTeam(null);
      toast.success(`Team "${deleteTeam.name}" deleted`);
      await loadTeams();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete team');
    }
  };

  const handleAddMember = async (userId: string, isLeader: boolean): Promise<boolean> => {
    if (!selectedTeam) return false;
    try {
      await teamsService.addMember(selectedTeam.id, userId, isLeader);
      await loadMembers(selectedTeam.id);
      await loadTeams();
      toast.success('Member added to team');
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add member');
      return false;
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedTeam || !removeMember) return;
    try {
      await teamsService.removeMember(selectedTeam.id, removeMember.userId);
      await loadMembers(selectedTeam.id);
      await loadTeams();
      setRemoveMember(null);
      toast.success(`${removeMember.name} removed from team`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove member');
    }
  };

  const handleSetLeader = async (userId: string) => {
    if (!selectedTeam) return;
    try {
      await teamsService.setLeader(selectedTeam.id, userId);
      await loadMembers(selectedTeam.id);
      await loadTeams();
      toast.success('Team leader updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to set team leader');
    }
  };

  const filteredTeams = teams.filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Teams</h1>
              <p className="text-sm text-muted-foreground">
                Create teams, assign members, and manage data access
              </p>
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => setCreateOpen(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              New Team
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Teams List */}
        <div className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className="input-base pl-8 text-sm w-full"
                placeholder="Search teams…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground px-4 text-center">
                <Users size={28} className="opacity-30" />
                <p className="text-sm">{search ? 'No teams match your search' : 'No teams yet'}</p>
                {!search && canManage && (
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Create your first team
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredTeams.map((team) => (
                  <li key={team.id}>
                    <button
                      onClick={() => setSelectedTeam(team)}
                      className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 ${
                        selectedTeam?.id === team.id ? 'bg-primary/5 border-l-2 border-primary' : ''
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Users size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {team.name}
                        </p>
                        {team.leaderName && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Crown size={10} className="text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground truncate">
                              {team.leaderName}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditTeam(team);
                            }}
                            className="btn-ghost p-1 rounded text-muted-foreground hover:text-foreground"
                            title="Edit team"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTeam(team);
                            }}
                            className="btn-ghost p-1 rounded text-muted-foreground hover:text-destructive"
                            title="Delete team"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground text-center">
              {teams.length} team{teams.length !== 1 ? 's' : ''} total
            </p>
          </div>
        </div>

        {/* Team Detail */}
        <div className="flex-1 overflow-hidden">
          {selectedTeam ? (
            <TeamDetailPanel
              team={selectedTeam}
              members={members}
              allUsers={allUsers}
              onAddMember={handleAddMember}
              onRemoveMember={(userId, name) => setRemoveMember({ userId, name })}
              onSetLeader={handleSetLeader}
              loading={membersLoading}
              canManage={canManage}
              usersLoading={!usersLoaded}
              usersError={usersError}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <Users size={28} className="opacity-40" />
              </div>
              <p className="text-sm font-medium">Select a team to manage its members</p>
              <p className="text-xs text-center max-w-xs">
                Team members share access to each other&apos;s leads and customers. Different teams
                cannot see each other&apos;s data.
              </p>
              {canManage && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="btn-primary flex items-center gap-2 mt-2"
                >
                  <Plus size={14} />
                  Create Team
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <TeamFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreateTeam}
      />
      <TeamFormModal
        open={!!editTeam}
        onClose={() => setEditTeam(null)}
        onSave={handleEditTeam}
        initial={editTeam ? { name: editTeam.name, description: editTeam.description } : undefined}
      />
      <DeleteConfirmModal
        open={!!deleteTeam}
        onClose={() => setDeleteTeam(null)}
        onConfirm={handleDeleteTeam}
        title="Delete Team"
        message={`Are you sure you want to delete "${deleteTeam?.name}"? All members will be unassigned from this team.`}
      />
      <DeleteConfirmModal
        open={!!removeMember}
        onClose={() => setRemoveMember(null)}
        onConfirm={handleRemoveMember}
        title="Remove Member"
        message={`Remove "${removeMember?.name}" from this team? They will no longer share data with team members.`}
      />
    </div>
  );
}
