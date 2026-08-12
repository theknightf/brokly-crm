'use client';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  Phone,
  Mail,
  MessageCircle,
  Video,
  Users,
  CalendarDays,
  ChevronDown,
  Pencil,
  Trash2,
  CheckCheck,
  RotateCcw,
  UserCircle2,
  TrendingUp,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { FollowUpStatusBadge, PriorityBadge } from './FollowUpStatusBadge';
import FollowUpForm from './FollowUpForm';
import {
  FollowUp,
  FollowUpStatus,
  FollowUpType,
  FollowUpPriority,
  RelationshipStatus,
  CustomerProfile,
  ALL_FOLLOW_UP_STATUSES,
  ALL_FOLLOW_UP_TYPES,
} from './mockFollowUps';
import { followUpsService, teamService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

const typeIcon: Record<FollowUpType, React.ReactNode> = {
  Call: <Phone size={13} />,
  Email: <Mail size={13} />,
  'Site Visit': <CalendarDays size={13} />,
  Meeting: <Users size={13} />,
  WhatsApp: <MessageCircle size={13} />,
  'Video Call': <Video size={13} />,
};

const typeColor: Record<FollowUpType, string> = {
  Call: 'bg-blue-50 text-blue-600',
  Email: 'bg-purple-50 text-purple-600',
  'Site Visit': 'bg-amber-50 text-amber-600',
  Meeting: 'bg-cyan-50 text-cyan-600',
  WhatsApp: 'bg-emerald-50 text-emerald-600',
  'Video Call': 'bg-pink-50 text-pink-600',
};

const relationshipConfig: Record<RelationshipStatus, { color: string; dot: string }> = {
  New: { color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  Nurturing: { color: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  Negotiating: { color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  'Closed Won': { color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  'Closed Lost': { color: 'bg-red-50 text-red-600', dot: 'bg-red-400' },
  'At Risk': { color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  Loyal: { color: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
};

function RelationshipBadge({ status }: { status: RelationshipStatus }) {
  const cfg = relationshipConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {status}
    </span>
  );
}

interface FilterState {
  search: string;
  status: FollowUpStatus | '';
  type: FollowUpType | '';
  priority: FollowUpPriority | '';
  agent: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function isOverdue(dueDate: string, status: FollowUpStatus) {
  if (status === 'Completed' || status === 'Cancelled') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export default function FollowUpsManagementScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    type: '',
    priority: '',
    agent: '',
  });
  const [agentList, setAgentList] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FollowUp | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FollowUp | null>(null);
  const [activeTab, setActiveTab] = useState<
    'all' | 'overdue' | 'today' | 'upcoming' | 'completed' | 'profiles'
  >('all');
  const [profileSearch, setProfileSearch] = useState('');
  const [scheduleFromProfile, setScheduleFromProfile] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fuData, teamData] = await Promise.all([
        followUpsService.getAll(),
        teamService.getAll(),
      ]);
      setFollowUps(fuData as FollowUp[]);
      const activeAgents = (teamData as any[])
        .filter((m) => m.status === 'Active')
        .map((m) => m.name);
      setAgentList(activeAgents);
    } catch (err: any) {
      // silently fall back to empty
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const tabFiltered = useMemo(() => {
    switch (activeTab) {
      case 'overdue':
        return followUps.filter((f) => f.status === 'Overdue' || isOverdue(f.dueDate, f.status));
      case 'today':
        return followUps.filter(
          (f) => f.dueDate === today && f.status !== 'Completed' && f.status !== 'Cancelled'
        );
      case 'upcoming':
        return followUps.filter(
          (f) => f.dueDate > today && f.status !== 'Completed' && f.status !== 'Cancelled'
        );
      case 'completed':
        return followUps.filter((f) => f.status === 'Completed');
      default:
        return followUps;
    }
  }, [followUps, activeTab, today]);

  const filtered = useMemo(() => {
    let r = [...tabFiltered];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      r = r.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.contactName.toLowerCase().includes(q) ||
          f.propertyInterest.toLowerCase().includes(q)
      );
    }
    if (filters.status) r = r.filter((f) => f.status === filters.status);
    if (filters.type) r = r.filter((f) => f.type === filters.type);
    if (filters.priority) r = r.filter((f) => f.priority === filters.priority);
    if (filters.agent) r = r.filter((f) => f.agent === filters.agent);
    return r.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.dueTime < b.dueTime ? -1 : 1;
    });
  }, [tabFiltered, filters]);

  const stats = useMemo(
    () => ({
      total: followUps.length,
      overdue: followUps.filter((f) => f.status === 'Overdue' || isOverdue(f.dueDate, f.status))
        .length,
      today: followUps.filter(
        (f) => f.dueDate === today && f.status !== 'Completed' && f.status !== 'Cancelled'
      ).length,
      completed: followUps.filter((f) => f.status === 'Completed').length,
    }),
    [followUps, today]
  );

  const derivedProfiles = useMemo(() => {
    const seen = new Set<string>();
    return followUps
      .filter((f) => {
        if (seen.has(f.contactName)) return false;
        seen.add(f.contactName);
        return true;
      })
      .map((f) => ({
        id: f.id,
        name: f.contactName,
        phone: f.contactPhone,
        email: f.contactEmail,
        contactType: f.contactType,
        relationshipStatus: f.relationshipStatus || 'New',
        propertyInterest: f.propertyInterest,
        agent: f.agent,
        agentInitials: f.agentInitials,
        lastContactDate: f.dueDate,
        totalFollowUps: followUps.filter((x) => x.contactName === f.contactName).length,
      }));
  }, [followUps]);

  const filteredProfiles = useMemo(() => {
    if (!profileSearch) return derivedProfiles;
    const q = profileSearch.toLowerCase();
    return derivedProfiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.propertyInterest.toLowerCase().includes(q) ||
        p.agent.toLowerCase().includes(q)
    );
  }, [profileSearch, derivedProfiles]);

  const handleAdd = async (fu: FollowUp) => {
    try {
      const created = await followUpsService.create(fu, user?.id || '');
      setFollowUps((p) => [created as FollowUp, ...p]);
    } catch {
      setFollowUps((p) => [fu, ...p]);
    }
    setAddModalOpen(false);
    setScheduleFromProfile(null);
  };

  const handleEdit = async (fu: FollowUp) => {
    try {
      const updated = await followUpsService.update(fu.id, fu);
      setFollowUps((p) => p.map((x) => (x.id === fu.id ? (updated as FollowUp) : x)));
    } catch {
      setFollowUps((p) => p.map((x) => (x.id === fu.id ? fu : x)));
    }
    setEditTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await followUpsService.delete(deleteTarget.id);
    } catch {
      // ignore — optimistic removal below
    }
    setFollowUps((p) => p.filter((x) => x.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleMarkComplete = async (id: string) => {
    const now = new Date().toISOString();
    try {
      await followUpsService.updateStatus(id, 'Completed', now);
    } catch {
      // ignore — optimistic update below
    }
    setFollowUps((p) =>
      p.map((x) =>
        x.id === id
          ? { ...x, status: 'Completed' as FollowUpStatus, completedAt: now.split('T')[0] }
          : x
      )
    );
  };

  const handleReopen = async (id: string) => {
    try {
      await followUpsService.updateStatus(id, 'Pending');
    } catch {
      // ignore — optimistic update below
    }
    setFollowUps((p) =>
      p.map((x) =>
        x.id === id ? { ...x, status: 'Pending' as FollowUpStatus, completedAt: undefined } : x
      )
    );
  };

  const handleScheduleFromProfile = (profile: CustomerProfile) => {
    setScheduleFromProfile(profile);
  };

  const activeFilterCount = [filters.status, filters.type, filters.priority, filters.agent].filter(
    Boolean
  ).length;

  const tabs: { key: typeof activeTab; label: string; count: number | null }[] = [
    { key: 'all', label: 'All', count: followUps.length },
    { key: 'overdue', label: 'Overdue', count: stats.overdue },
    { key: 'today', label: 'Today', count: stats.today },
    {
      key: 'upcoming',
      label: 'Upcoming',
      count: followUps.filter(
        (f) => f.dueDate > today && f.status !== 'Completed' && f.status !== 'Cancelled'
      ).length,
    },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'profiles', label: 'Customer Profiles', count: derivedProfiles.length },
  ];

  const profileInitial = scheduleFromProfile
    ? {
        contactName: scheduleFromProfile.name,
        contactType: scheduleFromProfile.contactType,
        contactPhone: scheduleFromProfile.phone,
        contactEmail: scheduleFromProfile.email,
        propertyInterest: scheduleFromProfile.propertyInterest,
        agent: scheduleFromProfile.agent,
        agentInitials: scheduleFromProfile.agentInitials,
        relationshipStatus: scheduleFromProfile.relationshipStatus,
      }
    : undefined;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Schedule, track, and complete follow-up tasks for leads and customers
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="btn-primary flex items-center gap-1.5 text-sm self-start sm:self-auto"
        >
          <Plus size={15} />
          Schedule Follow-up
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-base !p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <CalendarDays size={17} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground tabular-nums">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
        <div className="card-base !p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={17} className="text-red-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground tabular-nums">{stats.overdue}</p>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </div>
        </div>
        <div className="card-base !p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Clock size={17} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground tabular-nums">{stats.today}</p>
            <p className="text-xs text-muted-foreground">Due Today</p>
          </div>
        </div>
        <div className="card-base !p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={17} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground tabular-nums">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.key === 'profiles' && <UserCircle2 size={13} />}
            {tab.label}
            {tab.count !== null && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Customer Profiles Tab */}
      {activeTab === 'profiles' ? (
        <div className="space-y-4">
          {/* Profile search */}
          <div className="card-base !p-4">
            <div className="relative max-w-sm">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className="input-base pl-8"
                placeholder="Search by name, property, agent…"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Profile cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredProfiles.map((profile) => {
              const profileFollowUps = followUps.filter((f) => f.contactName === profile.name);
              const pendingCount = profileFollowUps.filter(
                (f) => f.status !== 'Completed' && f.status !== 'Cancelled'
              ).length;
              return (
                <div key={profile.id} className="card-base !p-5 flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold flex-shrink-0">
                        {profile.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {profile.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
                        profile.contactType === 'Customer'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {profile.contactType}
                    </span>
                  </div>

                  {/* Relationship status */}
                  <div className="flex items-center gap-2">
                    <TrendingUp size={13} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">Relationship:</span>
                    <RelationshipBadge status={profile.relationshipStatus} />
                  </div>

                  {/* Property & agent */}
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-1.5">
                      <CalendarDays size={12} className="mt-0.5 flex-shrink-0" />
                      <span className="truncate">{profile.propertyInterest}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-primary text-[8px] font-bold flex-shrink-0">
                        {profile.agentInitials}
                      </div>
                      <span>{profile.agent}</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 pt-1 border-t border-border text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">
                        {profile.totalFollowUps}
                      </span>{' '}
                      total follow-ups
                    </span>
                    {pendingCount > 0 && (
                      <span className="text-amber-600 font-medium">{pendingCount} pending</span>
                    )}
                    <span className="ml-auto">Last: {formatDate(profile.lastContactDate)}</span>
                  </div>

                  {/* Schedule button */}
                  <button
                    onClick={() => handleScheduleFromProfile(profile)}
                    className="btn-primary w-full flex items-center justify-center gap-1.5 text-xs !py-2"
                  >
                    <Plus size={13} />
                    Schedule Follow-up
                  </button>
                </div>
              );
            })}
          </div>

          {filteredProfiles.length === 0 && (
            <div className="card-base flex flex-col items-center justify-center py-16 text-center">
              <UserCircle2 size={40} className="text-muted-foreground mb-3 opacity-40" />
              <p className="text-base font-semibold text-foreground">No profiles found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="card-base !p-4">
            <div className="flex items-center gap-2 mb-3">
              <SlidersHorizontal size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-semibold">
                  {activeFilterCount}
                </span>
              )}
              {(activeFilterCount > 0 || filters.search) && (
                <button
                  onClick={() =>
                    setFilters({ search: '', status: '', type: '', priority: '', agent: '' })
                  }
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-2">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="input-base pl-8"
                  placeholder="Search by title, contact, property…"
                  value={filters.search}
                  onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                />
              </div>
              <div className="relative">
                <select
                  className="input-base appearance-none pr-8"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, status: e.target.value as FollowUpStatus | '' }))
                  }
                >
                  <option value="">All Statuses</option>
                  {ALL_FOLLOW_UP_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
              <div className="relative">
                <select
                  className="input-base appearance-none pr-8"
                  value={filters.type}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, type: e.target.value as FollowUpType | '' }))
                  }
                >
                  <option value="">All Types</option>
                  {ALL_FOLLOW_UP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
              <div className="relative">
                <select
                  className="input-base appearance-none pr-8"
                  value={filters.agent}
                  onChange={(e) => setFilters((p) => ({ ...p, agent: e.target.value }))}
                >
                  <option value="">All Agents</option>
                  {agentList.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Follow-ups list */}
          {filtered.length === 0 ? (
            <div className="card-base flex flex-col items-center justify-center py-16 text-center">
              <CalendarDays size={40} className="text-muted-foreground mb-3 opacity-40" />
              <p className="text-base font-semibold text-foreground">No follow-ups found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your filters or schedule a new follow-up.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((fu) => {
                const overdue = fu.status === 'Overdue' || isOverdue(fu.dueDate, fu.status);
                const isDone = fu.status === 'Completed';
                return (
                  <div
                    key={fu.id}
                    className={`card-base !p-0 overflow-hidden transition-all ${overdue && !isDone ? 'border-red-200' : ''}`}
                  >
                    <div className="flex items-stretch">
                      {/* Priority stripe */}
                      <div
                        className={`w-1 flex-shrink-0 ${
                          fu.priority === 'High'
                            ? 'bg-red-400'
                            : fu.priority === 'Medium'
                              ? 'bg-amber-400'
                              : 'bg-slate-300'
                        }`}
                      />

                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          {/* Main content */}
                          <div className="flex-1 min-w-0 space-y-2">
                            {/* Title row */}
                            <div className="flex items-start gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeColor[fu.type]}`}
                              >
                                {typeIcon[fu.type]}
                                {fu.type}
                              </span>
                              <PriorityBadge priority={fu.priority} />
                              <span
                                className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  fu.contactType === 'Customer'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {fu.contactType}
                              </span>
                              {fu.relationshipStatus && (
                                <RelationshipBadge status={fu.relationshipStatus} />
                              )}
                            </div>

                            <h3
                              className={`text-sm font-semibold leading-snug ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                            >
                              {fu.title}
                            </h3>

                            {/* Contact & property */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[9px] font-bold flex-shrink-0">
                                  {fu.agentInitials}
                                </span>
                                {fu.leadId ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      router.push(`/leads-management?lead=${fu.leadId}`)
                                    }
                                    className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                                    title="Open linked lead"
                                  >
                                    {fu.contactName}
                                    <UserCircle2 size={11} />
                                  </button>
                                ) : (
                                  <span>{fu.contactName}</span>
                                )}
                              </span>
                              {fu.propertyInterest && (
                                <span className="truncate max-w-[200px]">
                                  {fu.propertyInterest}
                                </span>
                              )}
                            </div>

                            {/* Notes */}
                            {fu.notes && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {fu.notes}
                              </p>
                            )}
                          </div>

                          {/* Right side: date, agent, status, actions */}
                          <div className="flex sm:flex-col items-start sm:items-end gap-2 sm:gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                            {/* Status */}
                            <FollowUpStatusBadge
                              status={overdue && !isDone ? 'Overdue' : fu.status}
                            />

                            {/* Due date/time */}
                            <div
                              className={`flex items-center gap-1 text-xs font-medium ${
                                overdue && !isDone ? 'text-red-500' : 'text-muted-foreground'
                              }`}
                            >
                              <Clock size={11} />
                              <span>{formatDate(fu.dueDate)}</span>
                              <span>·</span>
                              <span>{formatTime(fu.dueTime)}</span>
                            </div>

                            {/* Agent */}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-primary text-[9px] font-bold">
                                {fu.agentInitials}
                              </div>
                              <span>{fu.agent}</span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 mt-0.5">
                              {!isDone && fu.status !== 'Cancelled' && (
                                <button
                                  onClick={() => handleMarkComplete(fu.id)}
                                  title="Mark as completed"
                                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                                >
                                  <CheckCheck size={14} />
                                </button>
                              )}
                              {isDone && (
                                <button
                                  onClick={() => handleReopen(fu.id)}
                                  title="Reopen"
                                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => setEditTarget(fu)}
                                title="Edit"
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(fu)}
                                title="Delete"
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Results count */}
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground text-center pb-2">
              Showing {filtered.length} follow-up{filtered.length !== 1 ? 's' : ''}
            </p>
          )}
        </>
      )}

      {/* Add Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Schedule Follow-up"
        subtitle="Create a new follow-up task for a lead or customer"
        size="lg"
      >
        <FollowUpForm onSubmit={handleAdd} onCancel={() => setAddModalOpen(false)} />
      </Modal>

      {/* Schedule from Profile Modal */}
      <Modal
        open={!!scheduleFromProfile}
        onClose={() => setScheduleFromProfile(null)}
        title={`Schedule Follow-up — ${scheduleFromProfile?.name ?? ''}`}
        subtitle={
          scheduleFromProfile
            ? `${scheduleFromProfile.contactType} · ${scheduleFromProfile.relationshipStatus}`
            : ''
        }
        size="lg"
      >
        {scheduleFromProfile && (
          <FollowUpForm
            initial={profileInitial}
            onSubmit={handleAdd}
            onCancel={() => setScheduleFromProfile(null)}
          />
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Follow-up"
        subtitle="Update the follow-up task details"
        size="lg"
      >
        {editTarget && (
          <FollowUpForm
            initial={editTarget}
            onSubmit={handleEdit}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Follow-up"
        size="sm"
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-foreground">&quot;{deleteTarget?.title}&quot;</span>
            ? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleDelete} className="btn-danger">
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
