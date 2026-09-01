'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  Users,
  Search,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react';
import { usersService, teamsService } from '@/lib/services/crmService';
import { validateCreateUser } from '@/lib/userValidation';
import { toast } from 'sonner';

const ROLES = [
  { value: 'owner', label: 'Owner', color: 'bg-purple-100 text-purple-700' },
  { value: 'admin', label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  { value: 'broker', label: 'Broker', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'branch_manager', label: 'Branch Manager', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'team_leader', label: 'Team Leader', color: 'bg-teal-100 text-teal-700' },
  { value: 'senior_agent', label: 'Senior Agent', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'agent', label: 'Sales', color: 'bg-amber-100 text-amber-700' },
  { value: 'telecaller', label: 'Telecaller', color: 'bg-rose-100 text-rose-700' },
];

function getRoleBadge(role: string) {
  const found = ROLES.find((r) => r.value === role);
  return found ? found : { value: role, label: role, color: 'bg-muted text-muted-foreground' };
}

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  brokerageName: string;
  isActive: boolean;
  createdAt: string;
  agentCode?: string;
  adminId?: string | null;
  adminName?: string | null;
  teamId?: string | null;
}

const SALES_STRUCTURE_ROLES = ['team_leader', 'senior_agent', 'agent', 'telecaller'];
function isSalesStructureRole(role: string): boolean {
  return SALES_STRUCTURE_ROLES.includes(role);
}

function UserModal({
  user,
  leaders,
  onSave,
  onClose,
}: {
  user: Partial<UserProfile> | null;
  leaders: { id: string; name: string; teamId: string | null; teamName: string }[];
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState(user?.role ?? 'agent');
  const [isActive, setIsActive] = useState(user?.isActive !== false);
  const [teamLeaderId, setTeamLeaderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const showTeamLeaderSection = isSalesStructureRole(role);
  const selectedLeader = leaders.find((l) => l.id === teamLeaderId) || null;
  const selectedTeamName = selectedLeader?.teamName || '';
  const selectedTeamId = selectedLeader?.teamId || null;

  useEffect(() => {
    if (user?.teamId && leaders.length > 0) {
      const leader = leaders.find((l) => l.teamId === user.teamId);
      if (leader) setTeamLeaderId(leader.id);
    }
  }, [user?.teamId, leaders]);

  // Initialize leader from user's current team
  const initLeader = (teamId: string | null | undefined) => {
    if (!teamId || leaders.length === 0) return;
    const leader = leaders.find((l) => l.teamId === teamId);
    if (leader) setTeamLeaderId(leader.id);
  };
  // Use effect to set initial leader when leaders load or user changes
  // We need to import useEffect - already imported, so inline effect:
  // This will be handled via a separate useEffect below - we inject it after state

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (showTeamLeaderSection && teamLeaderId) {
      const leader = leaders.find((l) => l.id === teamLeaderId);
      if (leader && !leader.teamId) e.teamLeaderId = 'Selected team leader has no team. Assign a team to this leader first.';
    }
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setSaving(true);
    await onSave({
      fullName: fullName.trim(),
      phone: phone.trim(),
      role,
      isActive,
      teamLeaderId: showTeamLeaderSection ? teamLeaderId || null : null,
      teamId: showTeamLeaderSection ? selectedTeamId : null,
      teamName: showTeamLeaderSection ? selectedTeamName : '',
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-lg p-6 fade-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users size={16} className="text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Edit User</h3>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setErrors((p) => ({ ...p, fullName: '' }));
                }}
                placeholder="John Smith"
                className="input-base w-full"
                autoFocus
              />
              {errors.fullName && (
                <p className="text-xs text-destructive mt-1">{errors.fullName}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+971 50 000 0000"
                className="input-base w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Email Address
            </label>
            <input type="email" value={user?.email ?? ''} className="input-base w-full" disabled />
            <p className="text-xs text-muted-foreground mt-1">
              Email cannot be changed after account creation
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Role *</label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input-base w-full appearance-none pr-8"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors w-full ${isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted text-muted-foreground'}`}
              >
                {isActive ? (
                  <ToggleRight size={18} className="text-emerald-500" />
                ) : (
                  <ToggleLeft size={18} />
                )}
                {isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
          {showTeamLeaderSection && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Team Leader</label>
                <div className="relative">
                  <select
                    value={teamLeaderId}
                    onChange={(e) => {
                      setTeamLeaderId(e.target.value);
                      setErrors((p) => ({ ...p, teamLeaderId: '' }));
                    }}
                    className="input-base w-full appearance-none pr-8"
                  >
                    <option value="">No leader — no team</option>
                    {leaders.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} {l.teamName ? `· ${l.teamName}` : '· No team'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                </div>
                {errors.teamLeaderId && (
                  <p className="text-xs text-destructive mt-1">{errors.teamLeaderId}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Assigning a leader automatically assigns their team.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Team</label>
                <div className="input-base w-full bg-muted/50 text-muted-foreground flex items-center min-h-[42px]">
                  {selectedTeamName || '— No team —'}
                </div>
                {selectedLeader && !selectedTeamId && (
                  <p className="text-xs text-amber-600 mt-1">This leader has no team assigned.</p>
                )}
              </div>
            </div>
          )}
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
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmRemove = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } catch {
      // error is handled inside onConfirm
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-sm p-6 fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Remove User</h3>
            <p className="text-sm text-muted-foreground">This will deactivate the account.</p>
          </div>
        </div>
        <p className="text-sm text-foreground mb-5">
          Are you sure you want to remove <span className="font-semibold">&quot;{name}&quot;</span>?
          They will lose access to Brokly.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmRemove}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
          >
            {isDeleting ? "Removing..." : "Remove User"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({
  user,
  onConfirm,
  onClose,
}: {
  user: UserProfile;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (password.length < 8) e.password = 'Password must be at least 8 characters';
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(password))
      e.password = 'Password must include uppercase, lowercase, and a number';
    if (password !== confirm) e.confirm = 'Passwords do not match';
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await onConfirm(password);
    } catch (err: any) {
      setErrors({ form: err?.message || 'Failed to change password' });
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-sm p-6 fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <KeyRound size={18} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Change Password</h3>
            <p className="text-sm text-muted-foreground truncate">
              {user.fullName || user.email}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Set a new password for this user. They will be logged out of existing sessions and must
          sign in again with the new password.
        </p>
        {errors.form && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-3 py-2 mb-4">
            {errors.form}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              New Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoFocus
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((p) => ({ ...p, password: '' }));
                }}
                placeholder="Min 8 chars, upper, lower, number"
                className="input-base w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Confirm New Password *
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrors((p) => ({ ...p, confirm: '' }));
                }}
                placeholder="Repeat the new password"
                className="input-base w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirm && <p className="text-xs text-destructive mt-1">{errors.confirm}</p>}
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Save Password
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({
  admins,
  onSave,
  onClose,
  leaders,
}: {
  admins: Partial<UserProfile>[];
  onSave: (data: {
    fullName: string;
    email: string;
    password: string;
    role: string;
    code: string;
    adminId: string | null;
    teamId: string;
    teamLeaderId: string | null;
  }) => Promise<void>;
  onClose: () => void;
  leaders: { id: string; name: string; teamId: string | null; teamName: string }[];
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('agent');
  const [code, setCode] = useState('');
  const [adminId, setAdminId] = useState('');
  const [teamLeaderId, setTeamLeaderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isAdminRole = role === 'admin' || role === 'owner';
  const showTeamLeaderSection = isSalesStructureRole(role);
  const selectedLeader = leaders.find((l) => l.id === teamLeaderId) || null;
  const selectedTeamId = selectedLeader?.teamId || '';
  const selectedTeamName = selectedLeader?.teamName || '';

  useEffect(() => {
    if (admins.length > 0 && !adminId) {
      setAdminId(admins[0].id ?? '');
    }
  }, [admins, adminId]);

  const handleSave = async () => {
    const e = validateCreateUser({ fullName, email, password, role, code, adminId });
    if (Object.keys(e).length > 0) {
      setErrors(e as Record<string, string>);
      return;
    }
    if (showTeamLeaderSection && teamLeaderId) {
      const leader = leaders.find((l) => l.id === teamLeaderId);
      if (leader && !leader.teamId) {
        setErrors({ teamLeaderId: 'Selected team leader has no team. Assign a team to this leader first.' });
        return;
      }
    }
    setSaving(true);
    setErrors({});
    try {
      await onSave({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role,
        code: code.trim(),
        adminId: adminId || null,
        teamId: showTeamLeaderSection ? selectedTeamId : '',
        teamLeaderId: showTeamLeaderSection ? teamLeaderId || null : null,
      });
    } catch (err: any) {
      if (err?.fields) setErrors(err.fields as Record<string, string>);
      else setErrors({ form: err?.message || 'Failed to create user' });
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-lg p-6 fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users size={16} className="text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Create New User</h3>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {errors.form && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-3 py-2">
              {errors.form}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setErrors((p) => ({ ...p, fullName: '' }));
                }}
                placeholder="John Smith"
                className="input-base w-full"
                autoFocus
              />
              {errors.fullName && (
                <p className="text-xs text-destructive mt-1">{errors.fullName}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email Address *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((p) => ({ ...p, email: '' }));
                }}
                placeholder="agent@brokerage.com"
                className="input-base w-full"
              />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Password *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((p) => ({ ...p, password: '' }));
                }}
                placeholder="Min 8 chars with upper, lower, and number"
                className="input-base w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              Must be at least 8 characters, include uppercase, lowercase, and a number.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Role *</label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input-base w-full appearance-none pr-8"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setErrors((p) => ({ ...p, code: '' }));
                }}
                placeholder="e.g. EGY001"
                className="input-base w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">Optional agent/branch code</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Assigned Admin *
            </label>
            <div className="relative">
              <select
                value={adminId}
                onChange={(e) => {
                  setAdminId(e.target.value);
                  setErrors((p) => ({ ...p, adminId: '' }));
                }}
                className="input-base w-full appearance-none pr-8"
              >
                <option value="">Select an admin…</option>
                {admins.length === 0 && <option value="" disabled>No admins available</option>}
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName || a.email}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
            {errors.adminId && <p className="text-xs text-destructive mt-1">{errors.adminId}</p>}
            {isAdminRole && (
              <p className="text-xs text-muted-foreground mt-1">
                Admins can also be assigned to themselves or an owner above them.
              </p>
            )}
          </div>

          {showTeamLeaderSection && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Team Leader</label>
                <div className="relative">
                  <select
                    value={teamLeaderId}
                    onChange={(e) => {
                      setTeamLeaderId(e.target.value);
                      setErrors((p) => ({ ...p, teamLeaderId: '' }));
                    }}
                    className="input-base w-full appearance-none pr-8"
                  >
                    <option value="">No leader — no team</option>
                    {leaders.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} {l.teamName ? `· ${l.teamName}` : '· No team'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                </div>
                {errors.teamLeaderId && (
                  <p className="text-xs text-destructive mt-1">{errors.teamLeaderId}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Select a leader to auto-assign their team.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Team</label>
                <div className="input-base w-full bg-muted/50 text-muted-foreground flex items-center min-h-[42px]">
                  {selectedTeamName || '— No team —'}
                </div>
                {selectedLeader && !selectedLeader.teamId && (
                  <p className="text-xs text-amber-600 mt-1">This leader has no team assigned.</p>
                )}
              </div>
            </div>
          )}
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
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Create User
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; leaderId: string | null; leaderName: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [modalState, setModalState] = useState<{
    open: boolean;
    user: Partial<UserProfile> | null;
  }>({
    open: false,
    user: null,
  });
  const [createState, setCreateState] = useState(false);
  const [deleteState, setDeleteState] = useState<{ open: boolean; id: string; name: string }>({
    open: false,
    id: '',
    name: '',
  });
  const [resetState, setResetState] = useState<{ open: boolean; email: string; name: string }>({
    open: false,
    email: '',
    name: '',
  });
  const [passwordState, setPasswordState] = useState<{
    open: boolean;
    user: UserProfile | null;
  }>({ open: false, user: null });
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, adminsData, teamsData] = await Promise.all([
        usersService.getAll(),
        usersService.getAdmins(),
        teamsService.getAll(),
      ]);
      setUsers(usersData as UserProfile[]);
      setAdmins(adminsData as UserProfile[]);
      setTeams(teamsData as { id: string; name: string; leaderId: string | null; leaderName: string | null }[]);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const leaders = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; teamId: string | null; teamName: string }>();
    for (const t of teams) {
      if (t.leaderId) {
        const u = users.find((x) => x.id === t.leaderId);
        byId.set(t.leaderId, {
          id: t.leaderId,
          name: u?.fullName || t.leaderName || 'Unknown',
          teamId: t.id,
          teamName: t.name,
        });
      }
    }
    for (const u of users) {
      if (u.role === 'team_leader' && !byId.has(u.id)) {
        byId.set(u.id, { id: u.id, name: u.fullName || u.email, teamId: null, teamName: '' });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, teams]);

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.agentCode || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' ? u.isActive : !u.isActive);
    return matchSearch && matchRole && matchStatus;
  });

  const handleEdit = (user: UserProfile) => setModalState({ open: true, user });
  const handleDeletePrompt = (user: UserProfile) =>
    setDeleteState({ open: true, id: user.id, name: user.fullName || user.email });
  const handlePasswordPrompt = (user: UserProfile) =>
    setPasswordState({ open: true, user });

  const handleToggleActive = async (user: UserProfile) => {
    const newActive = !user.isActive;
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: newActive } : u)));
    try {
      await usersService.update(user.id, { isActive: newActive });
      toast.success(newActive ? 'User activated' : 'User deactivated');
    } catch {
      toast.error('Failed to update status');
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !newActive } : u)));
    }
  };

  const handleSave = async (data: any) => {
    try {
      if (modalState.user?.id) {
        const updated = await usersService.update(modalState.user.id, {
          fullName: data.fullName,
          phone: data.phone,
          role: data.role,
          isActive: data.isActive,
        });
        const prevTeamId = (modalState.user as any)?.teamId || null;
        const nextTeamId = data.teamId || null;
        if (nextTeamId && nextTeamId !== prevTeamId) {
          try {
            await teamsService.addMember(nextTeamId, modalState.user.id, false);
          } catch (e: any) {
            toast.error(e?.message || 'User saved but could not assign to team');
          }
        } else if (!nextTeamId && prevTeamId) {
          try {
            await teamsService.removeMember(prevTeamId, modalState.user.id);
          } catch {}
        }
        await loadData();
        toast.success('User updated successfully');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save user');
    }
    setModalState({ open: false, user: null });
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/admin/users/${deleteState.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as any);
        throw new Error(data?.error || 'Failed to remove user');
      }
      setUsers((prev) => prev.filter((u) => u.id !== deleteState.id));
      toast.success('User removed successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove user');
    }
    setDeleteState({ open: false, id: '', name: '' });
  };

  const handleChangePassword = async (newPassword: string) => {
    if (!passwordState.user?.id) return;
    await usersService.changePassword(passwordState.user.id, newPassword, newPassword);
    toast.success(`Password updated for ${passwordState.user.fullName || passwordState.user.email}`);
  };

  const handleCreateUser = async (data: {
    fullName: string;
    email: string;
    password: string;
    role: string;
    code: string;
    adminId: string | null;
    teamId: string;
    teamLeaderId: string | null;
  }) => {
    if (data.teamLeaderId) {
      const leader = leaders.find((l) => l.id === data.teamLeaderId);
      if (leader && !leader.teamId) {
        toast.error('Selected team leader has no team. Assign a team to this leader first.');
        return;
      }
    }
    const created = await usersService.createUser(data);
    if (data.teamId && created?.id) {
      try {
        await teamsService.addMember(data.teamId, created.id, false);
      } catch (e: any) {
        toast.error(e?.message || 'User created but could not be added to the team');
      }
    }
    await loadData();
    setCreateState(false);
    toast.success(`User "${created.fullName || data.email}" created successfully`);
  };

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Users size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Users</h2>
            <p className="text-xs text-muted-foreground">
              Manage roles, status, and access for existing accounts
            </p>
          </div>
        </div>
        <button
          onClick={() => setCreateState(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          Add User
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 mb-5">
        {[
          { label: 'Total Users', value: users.length, color: 'text-foreground' },
          { label: 'Active', value: activeCount, color: 'text-emerald-600' },
          { label: 'Inactive', value: users.length - activeCount, color: 'text-muted-foreground' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="input-base w-full pl-9 text-sm"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="input-base appearance-none pr-8 text-sm"
          >
            <option value="all">All Roles</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="input-base appearance-none pr-8 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Users size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {search || roleFilter !== 'all' ? 'No users match your filters' : 'No users yet'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {search || roleFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Users appear here after they register via Supabase Auth'}
            </p>
          </div>
        ) : (
          <table className="w-full table-mobile">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  User
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Phone
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((user) => {
                const badge = getRoleBadge(user.role);
                const initials = user.fullName
                  ? user.fullName
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                  : user.email.slice(0, 2).toUpperCase();
                return (
                  <tr
                    key={user.id}
                    className={`hover:bg-muted/30 transition-colors ${!user.isActive ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary">{initials}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {user.fullName || '—'}
                            {user.agentCode && (
                              <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                                · {user.agentCode}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          {user.adminName && (
                            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                              Managed by {user.adminName}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{user.phone || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                      >
                        {user.isActive ? (
                          <>
                            <ToggleRight size={18} className="text-emerald-500" />
                            <span className="text-emerald-600">Active</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft size={18} className="text-muted-foreground" />
                            <span className="text-muted-foreground">Inactive</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/admin/employees/${user.id}/360`}
                          className="p-1.5 rounded-lg hover:bg-violet-100 text-muted-foreground hover:text-violet-600 transition-colors inline-flex"
                          title="View 360 Profile"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => handlePasswordPrompt(user)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                          title="Change Password"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit User"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDeletePrompt(user)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove User"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalState.open && (
        <UserModal
          user={modalState.user}
          leaders={leaders}
          onSave={handleSave}
          onClose={() => setModalState({ open: false, user: null })}
        />
      )}
      {deleteState.open && (
        <DeleteConfirm
          name={deleteState.name}
          onConfirm={handleDelete}
          onClose={() => setDeleteState({ open: false, id: '', name: '' })}
        />
      )}
      {passwordState.open && passwordState.user && (
        <ChangePasswordModal
          user={passwordState.user}
          onClose={() => setPasswordState({ open: false, user: null })}
          onConfirm={async (pwd) => {
            await handleChangePassword(pwd);
            setPasswordState({ open: false, user: null });
          }}
        />
      )}
      {createState && (
        <CreateUserModal
          admins={admins}
          leaders={leaders}
          onSave={handleCreateUser}
          onClose={() => setCreateState(false)}
        />
      )}
    </div>
  );
}
