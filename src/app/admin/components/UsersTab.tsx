'use client';
import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { usersService } from '@/lib/services/crmService';
import { validateCreateUser } from '@/lib/userValidation';
import { toast } from 'sonner';

const ROLES = [
  { value: 'owner', label: 'Owner', color: 'bg-purple-100 text-purple-700' },
  { value: 'admin', label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  { value: 'broker', label: 'Broker', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'branch_manager', label: 'Branch Manager', color: 'bg-cyan-100 text-cyan-700' },
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
}

function UserModal({
  user,
  onSave,
  onClose,
}: {
  user: Partial<UserProfile> | null;
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState(user?.role ?? 'agent');
  const [isActive, setIsActive] = useState(user?.isActive !== false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setSaving(true);
    await onSave({ fullName: fullName.trim(), phone: phone.trim(), role, isActive });
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
          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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
  onConfirm: () => void;
  onClose: () => void;
}) {
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
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors"
          >
            Remove User
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordResetConfirm({
  email,
  onConfirm,
  onClose,
}: {
  email: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-sm p-6 fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <KeyRound size={18} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Reset Password</h3>
            <p className="text-sm text-muted-foreground">Send a password reset email</p>
          </div>
        </div>
        <p className="text-sm text-foreground mb-5">
          A password reset link will be sent to <span className="font-semibold">{email}</span>.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Send Reset Link
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
}: {
  admins: Partial<UserProfile>[];
  onSave: (data: {
    fullName: string;
    email: string;
    password: string;
    role: string;
    code: string;
    adminId: string | null;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('agent');
  const [code, setCode] = useState('');
  const [adminId, setAdminId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isAdminRole = role === 'admin' || role === 'owner';

  const handleSave = async () => {
    const e = validateCreateUser({ fullName, email, password, role, code, adminId });
    if (Object.keys(e).length > 0) {
      setErrors(e as Record<string, string>);
      return;
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

          <div className="grid grid-cols-2 gap-4">
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
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((p) => ({ ...p, password: '' }));
              }}
              placeholder="Min 8 chars with upper, lower, and number"
              className="input-base w-full"
            />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              Must be at least 8 characters, include uppercase, lowercase, and a number.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, adminsData] = await Promise.all([
        usersService.getAll(),
        usersService.getAdmins(),
      ]);
      setUsers(usersData as UserProfile[]);
      setAdmins(adminsData as UserProfile[]);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleEdit = (user: UserProfile) => setModalState({ open: true, user });
  const handleDeletePrompt = (user: UserProfile) =>
    setDeleteState({ open: true, id: user.id, name: user.fullName || user.email });
  const handleResetPrompt = (user: UserProfile) =>
    setResetState({ open: true, email: user.email, name: user.fullName || user.email });

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
        setUsers((prev) =>
          prev.map((u) => (u.id === modalState.user!.id ? { ...u, ...updated } : u))
        );
        toast.success('User updated successfully');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save user');
    }
    setModalState({ open: false, user: null });
  };

  const handleDelete = async () => {
    try {
      await usersService.update(deleteState.id, { isActive: false });
      setUsers((prev) =>
        prev.map((u) => (u.id === deleteState.id ? { ...u, isActive: false } : u))
      );
      toast.success('User deactivated successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove user');
    }
    setDeleteState({ open: false, id: '', name: '' });
  };

  const handlePasswordReset = async () => {
    try {
      await usersService.sendPasswordReset(resetState.email);
      toast.success(`Password reset email sent to ${resetState.email}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reset email');
    }
    setResetState({ open: false, email: '', name: '' });
  };

  const handleCreateUser = async (data: {
    fullName: string;
    email: string;
    password: string;
    role: string;
    code: string;
    adminId: string | null;
  }) => {
    const created = await usersService.createUser(data);
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
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${badge.color}`}
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
                        <button
                          onClick={() => handleResetPrompt(user)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                          title="Reset Password"
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
      {resetState.open && (
        <PasswordResetConfirm
          email={resetState.email}
          onConfirm={handlePasswordReset}
          onClose={() => setResetState({ open: false, email: '', name: '' })}
        />
      )}
      {createState && (
        <CreateUserModal
          admins={admins}
          onSave={handleCreateUser}
          onClose={() => setCreateState(false)}
        />
      )}
    </div>
  );
}
