'use client';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
  ChevronDown,
  Users,
  TrendingUp,
  CheckCircle2,
  Mail,
  Phone,
} from 'lucide-react';
import { toast } from 'sonner';
import { TeamMember, TeamRole, TeamMemberStatus, ALL_ROLES } from './mockTeamMembers';
import { teamService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { canViewTeams, canManageTeams } from '@/lib/roles';
import { ShieldCheck } from 'lucide-react';

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<TeamRole, string> = {
  Broker: 'bg-purple-100 text-purple-700',
  'Senior Agent': 'bg-blue-100 text-blue-700',
  'Team Lead': 'bg-indigo-100 text-indigo-700',
  Agent: 'bg-emerald-100 text-emerald-700',
  'Junior Agent': 'bg-amber-100 text-amber-700',
};

function RoleBadge({ role }: { role: TeamRole }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role]}`}
    >
      {role}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TeamMemberStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === 'Active' ? 'bg-green-500' : 'bg-gray-400'}`}
      />
      {status}
    </span>
  );
}

// ─── Member Form Modal ────────────────────────────────────────────────────────
interface MemberFormData {
  name: string;
  role: TeamRole;
  email: string;
  phone: string;
  status: TeamMemberStatus;
  joinedAt: string;
}

function MemberFormModal({
  open,
  onClose,
  onSave,
  initial,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: MemberFormData) => void;
  initial?: MemberFormData;
  title: string;
}) {
  const [form, setForm] = useState<MemberFormData>(
    initial ?? {
      name: '',
      role: 'Agent',
      email: '',
      phone: '',
      status: 'Active',
      joinedAt: '2026-08-03',
    }
  );
  const [errors, setErrors] = useState<Partial<Record<keyof MemberFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(
        initial ?? {
          name: '',
          role: 'Agent',
          email: '',
          phone: '',
          status: 'Active',
          joinedAt: '2026-08-03',
        }
      );
      setErrors({});
    }
  }, [open, initial]);

  const set = (k: keyof MemberFormData, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  const validate = () => {
    const e: Partial<Record<keyof MemberFormData, string>> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.joinedAt) e.joinedAt = 'Join date is required';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    onSave(form);
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-lg fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-4">
            {/* Name */}
            <div>
              <label className="label-base">Full Name *</label>
              <input
                className={`input-base ${errors.name ? 'border-red-400' : ''}`}
                placeholder="e.g. Arjun Sharma"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Role */}
              <div>
                <label className="label-base">Role *</label>
                <div className="relative">
                  <select
                    className="input-base appearance-none pr-8"
                    value={form.role}
                    onChange={(e) => set('role', e.target.value as TeamRole)}
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="label-base">Status *</label>
                <div className="relative">
                  <select
                    className="input-base appearance-none pr-8"
                    value={form.status}
                    onChange={(e) => set('status', e.target.value as TeamMemberStatus)}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="label-base">Email Address *</label>
              <input
                type="email"
                className={`input-base ${errors.email ? 'border-red-400' : ''}`}
                placeholder="name@realtyflow.io"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Phone */}
              <div>
                <label className="label-base">
                  Phone{' '}
                  <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  className="input-base"
                  placeholder="+91-XXXXX-XXXXX"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </div>

              {/* Joined At */}
              <div>
                <label className="label-base">Join Date *</label>
                <input
                  type="date"
                  className={`input-base ${errors.joinedAt ? 'border-red-400' : ''}`}
                  value={form.joinedAt}
                  onChange={(e) => set('joinedAt', e.target.value)}
                />
                {errors.joinedAt && <p className="text-xs text-red-500 mt-1">{errors.joinedAt}</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {initial ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  member,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  member: TeamMember | null;
}) {
  if (!open || !member) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-sm fade-in p-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <Trash2 size={20} className="text-red-600" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Remove Team Member?</h3>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{member.name}</span> will be removed from
            the team. This will also remove them from agent dropdowns in Leads and Follow-ups.
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TeamsScreen() {
  const { profile } = useAuth();
  const canView = canViewTeams(profile?.role);
  const canManage = canManageTeams(profile?.role);
  const isLeader = !canManage && canView;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<TeamRole | ''>('');
  const [filterStatus, setFilterStatus] = useState<TeamMemberStatus | ''>('');
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<TeamMember | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await teamService.getAll();
      setMembers(data as TeamMember[]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q);
      const matchRole = !filterRole || m.role === filterRole;
      const matchStatus = !filterStatus || m.status === filterStatus;
      return matchSearch && matchRole && matchStatus;
    });
  }, [members, search, filterRole, filterStatus]);

  const stats = useMemo(
    () => ({
      total: members.length,
      active: members.filter((m) => m.status === 'Active').length,
      inactive: members.filter((m) => m.status === 'Inactive').length,
      totalLeads: members.reduce((s, m) => s + (m.assignedLeads || 0), 0),
      avgConversion: members.length
        ? Math.round(
            members.filter((m) => m.status === 'Active').reduce((s, m) => s + m.conversionRate, 0) /
              Math.max(members.filter((m) => m.status === 'Active').length, 1)
          )
        : 0,
    }),
    [members]
  );

  const handleAdd = async (data: MemberFormData) => {
    try {
      const created = await teamService.create(data);
      setMembers((prev) => [...prev, created as TeamMember]);
      setAddOpen(false);
      toast.success(`${data.name} added to the team`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add team member');
    }
  };

  const handleEdit = async (data: MemberFormData) => {
    if (!editMember) return;
    try {
      const updated = await teamService.update(editMember.id, data);
      setMembers((prev) => prev.map((m) => (m.id === editMember.id ? (updated as TeamMember) : m)));
      setEditMember(null);
      toast.success('Team member updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update team member');
    }
  };

  const handleDelete = async () => {
    if (!deleteMember) return;
    try {
      await teamService.delete(deleteMember.id);
      setMembers((prev) => prev.filter((m) => m.id !== deleteMember.id));
      setDeleteMember(null);
      toast.success(`${deleteMember.name} removed from the team`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove team member');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <ShieldCheck size={24} className="text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Access denied</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          You don&apos;t have permission to view team members. Only owners, admins and team leaders
          can access this area.
        </p>
      </div>
    );
  }

  const visibleMembers = isLeader ? members.filter((m) => m.status === 'Active') : members;
  const shown = isLeader ? filtered.filter((m) => m.status === 'Active') : filtered;
  const visibleStats = visibleMembers.length
    ? {
        total: visibleMembers.length,
        active: visibleMembers.filter((m) => m.status === 'Active').length,
        inactive: 0,
        totalLeads: visibleMembers.reduce((s, m) => s + (m.assignedLeads || 0), 0),
        avgConversion: Math.round(
          visibleMembers
            .filter((m) => m.status === 'Active')
            .reduce((s, m) => s + m.conversionRate, 0) /
            Math.max(visibleMembers.filter((m) => m.status === 'Active').length, 1)
        ),
      }
    : stats;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLeader
              ? 'Viewing your team — active members only'
              : 'Manage your brokerage team and agent assignments'}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Add Member
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          label="Total Members"
          value={visibleStats.total}
          sub={`${visibleStats.active} active`}
          color="text-foreground"
        />
        <KPICard
          label="Active Agents"
          value={visibleStats.active}
          sub="Available for leads"
          color="text-green-600"
        />
        <KPICard
          label="Assigned Leads"
          value={visibleStats.totalLeads}
          sub="Across active agents"
          color="text-blue-600"
        />
        <KPICard
          label="Avg. Conversion"
          value={`${visibleStats.avgConversion}%`}
          sub="Active agents only"
          color="text-primary"
        />
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="input-base pl-9"
              placeholder="Search by name, email, or role…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative">
            <select
              className="input-base appearance-none pr-8 min-w-[140px]"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as TeamRole | '')}
            >
              <option value="">All Roles</option>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
          </div>
          <div className="relative">
            <select
              className="input-base appearance-none pr-8 min-w-[130px]"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as TeamMemberStatus | '')}
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-mobile">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Member
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                  Contact
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Leads
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                  Closed
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                  Conv. Rate
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">
                  Revenue
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.filter.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users size={32} className="opacity-30" />
                      <p className="text-sm">No team members found</p>
                      {(search || filterRole || filterStatus) && (
                        <button
                          onClick={() => {
                            setSearch('');
                            setFilterRole('');
                            setFilterStatus('');
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                shown.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                          {m.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate hidden sm:block">
                            {m.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={m.role} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail size={11} />
                          <span className="truncate max-w-[160px]">{m.email}</span>
                        </div>
                        {m.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone size={11} />
                            <span>{m.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${(m.assignedLeads || 0) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}
                      >
                        {m.assignedLeads || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <div className="flex items-center justify-center gap-1 text-sm font-medium text-foreground">
                        <CheckCircle2 size={13} className="text-green-500" />
                        {m.closedDeals}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`text-sm font-semibold ${m.conversionRate >= 50 ? 'text-green-600' : m.conversionRate >= 35 ? 'text-amber-600' : 'text-red-500'}`}
                        >
                          {m.conversionRate}%
                        </span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.conversionRate >= 50 ? 'bg-green-500' : m.conversionRate >= 35 ? 'bg-amber-500' : 'bg-red-400'}`}
                            style={{ width: `${m.conversionRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden xl:table-cell">
                      <div className="flex items-center justify-center gap-1 text-sm font-medium text-foreground">
                        <TrendingUp size={13} className="text-primary" />
                        {m.totalRevenue ? `${(m.totalRevenue / 1000).toFixed(0)}K ج.م` : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canManage ? (
                          <>
                            <button
                              onClick={() => setEditMember(m)}
                              className="btn-ghost p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                              title="Edit member"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteMember(m)}
                              className="btn-ghost p-1.5 rounded-lg text-muted-foreground hover:text-red-600"
                              title="Remove member"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {shown.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {shown.length} of {members.length} members
            </p>
            <p className="text-xs text-muted-foreground">
              Active members appear as agents in Leads & Follow-ups
            </p>
          </div>
        )}
      </div>

      <MemberFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleAdd}
        title="Add Team Member"
      />
      <MemberFormModal
        open={!!editMember}
        onClose={() => setEditMember(null)}
        onSave={handleEdit}
        initial={
          editMember
            ? {
                name: editMember.name,
                role: editMember.role,
                email: editMember.email,
                phone: editMember.phone,
                status: editMember.status,
                joinedAt: editMember.joinedAt,
              }
            : undefined
        }
        title="Edit Team Member"
      />
      <DeleteConfirmModal
        open={!!deleteMember}
        onClose={() => setDeleteMember(null)}
        onConfirm={handleDelete}
        member={deleteMember}
      />
    </div>
  );
}
