'use client';
import React, { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Radio,
  GitBranch,
  MapPin,
  Flag,
  Building2,
  X,
  Check,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Users,
  CalendarCheck,
  Activity,
  Trophy,
  PhoneCall,
  Mail,
} from 'lucide-react';
import { adminSettingsService, developersService } from '@/lib/services/crmService';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole, canManageUsers } from '@/lib/roles';
import { toast } from 'sonner';
import UsersTab from './UsersTab';
import AttendanceTab from './AttendanceTab';
import ActivityDashboard from './ActivityDashboard';
import ProductivityDashboard from './ProductivityDashboard';
import CallLogsTab from './CallLogsTab';
import EmailTemplatesTab from './EmailTemplatesTab';

type TabKey =
  | 'leadSources'
  | 'pipelineStages'
  | 'areas'
  | 'priorities'
  | 'developers'
  | 'users'
  | 'attendance'
  | 'activity'
  | 'productivity'
  | 'callLogs'
  | 'emailTemplates';

interface AdminItem {
  id: string;
  name: string;
  color?: string;
  order?: number;
  active: boolean;
}

const TABS: { key: TabKey; label: string; icon: React.ReactNode; description: string }[] = [
  {
    key: 'leadSources',
    label: 'Lead Sources',
    icon: <Radio size={16} />,
    description: 'Channels where leads originate (Facebook, Instagram, Referral, etc.)',
  },
  {
    key: 'pipelineStages',
    label: 'Pipeline Stages',
    icon: <GitBranch size={16} />,
    description: 'Sales pipeline stages from New Lead to Closed',
  },
  {
    key: 'areas',
    label: 'Areas',
    icon: <MapPin size={16} />,
    description: 'Geographic areas for lead and project targeting',
  },
  {
    key: 'priorities',
    label: 'Priorities',
    icon: <Flag size={16} />,
    description: 'Lead priority levels to help agents focus effort',
  },
  {
    key: 'developers',
    label: 'Developers',
    icon: <Building2 size={16} />,
    description: 'Real estate developers linked to projects and leads',
  },
  {
    key: 'users',
    label: 'Users',
    icon: <Users size={16} />,
    description: 'Manage team members, roles, and system access',
  },
  {
    key: 'attendance',
    label: 'Attendance',
    icon: <CalendarCheck size={16} />,
    description: 'Mark office check-ins and track daily attendance',
  },
  {
    key: 'activity',
    label: 'Activity',
    icon: <Activity size={16} />,
    description: 'Track user sessions, active hours, and usage history',
  },
  {
    key: 'productivity',
    label: 'Productivity',
    icon: <Trophy size={16} />,
    description: 'Leaderboard & per-user analytics: leads, calls, actions, active time',
  },
  {
    key: 'callLogs',
    label: 'Call Logs',
    icon: <PhoneCall size={16} />,
    description: 'Every call / WhatsApp logged by the team from the app',
  },
  {
    key: 'emailTemplates',
    label: 'Email Templates',
    icon: <Mail size={16} />,
    description: 'Reusable email subject & body templates for automated and manual emails',
  },
];

const hasColor = (key: TabKey) =>
  key === 'leadSources' || key === 'pipelineStages' || key === 'priorities';
const hasOrder = (key: TabKey) => key === 'pipelineStages' || key === 'priorities';

function ItemModal({
  tabKey,
  item,
  onSave,
  onClose,
  isEdit,
}: {
  tabKey: TabKey;
  item: Partial<AdminItem> | null;
  onSave: (item: Partial<AdminItem>) => void;
  onClose: () => void;
  isEdit: boolean;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [color, setColor] = useState(item?.color ?? '#3b82f6');
  const [order, setOrder] = useState<number>(item?.order ?? 1);
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const payload: Partial<AdminItem> = { name: name.trim(), active: item?.active ?? true };
    if (hasColor(tabKey)) payload.color = color;
    if (hasOrder(tabKey)) payload.order = order;
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-md p-6 fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-foreground">
            {isEdit ? 'Edit' : 'Add'} {TABS.find((t) => t.key === tabKey)?.label.slice(0, -1)}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="Enter name…"
              className="input-base w-full"
              autoFocus
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
          {hasColor(tabKey) && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#3b82f6"
                  className="input-base flex-1 font-mono text-sm"
                />
                <div
                  className="w-8 h-8 rounded-lg border border-border flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              </div>
            </div>
          )}
          {hasOrder(tabKey) && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Order</label>
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                min={1}
                className="input-base w-24"
              />
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Check size={15} />
            {isEdit ? 'Save Changes' : 'Add'}
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
            <h3 className="text-base font-semibold text-foreground">Delete Item</h3>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-foreground mb-5">
          Are you sure you want to delete <span className="font-semibold">&quot;{name}&quot;</span>?
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminScreen() {
  const { profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('leadSources');
  const [settings, setSettings] = useState<
    Record<
      Exclude<TabKey, 'users' | 'attendance' | 'activity' | 'productivity' | 'callLogs'>,
      AdminItem[]
    >
  >({
    leadSources: [],
    pipelineStages: [],
    areas: [],
    priorities: [],
    developers: [],
    emailTemplates: [],
  });
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState<{
    open: boolean;
    isEdit: boolean;
    item: Partial<AdminItem> | null;
    editId?: string;
  }>({ open: false, isEdit: false, item: null });
  const [deleteState, setDeleteState] = useState<{ open: boolean; id: string; name: string }>({
    open: false,
    id: '',
    name: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [settingsData, devsData] = await Promise.all([
        adminSettingsService.getAll(),
        developersService.getAll(),
      ]);
      setSettings({
        leadSources: (settingsData as any)['leadSources'] || [],
        pipelineStages: (settingsData as any)['pipelineStages'] || [],
        areas: (settingsData as any)['areas'] || [],
        priorities: (settingsData as any)['priorities'] || [],
        developers: (devsData as any[]).map((d: any) => ({
          id: d.id,
          name: d.name,
          active: d.isActive,
        })),
        emailTemplates: (settingsData as any)['emailTemplate'] || [],
      });
    } catch (err: any) {
      toast.error('Failed to load admin settings');
    } finally {
      setLoading(false);
    }
  };

  const isPanelTab =
    activeTab === 'users' ||
    activeTab === 'attendance' ||
    activeTab === 'activity' ||
    activeTab === 'productivity' ||
    activeTab === 'callLogs';
  const items = !isPanelTab
    ? settings[
        activeTab as Exclude<
          TabKey,
          'users' | 'attendance' | 'activity' | 'productivity' | 'callLogs'
        >
      ] || []
    : [];
  const activeTabKey = isPanelTab ? 'leadSources' : activeTab;
  const activeTab_ = TABS.find((t) => t.key === activeTab)!;

  const handleAdd = () => setModalState({ open: true, isEdit: false, item: { active: true } });
  const handleEdit = (item: AdminItem) =>
    setModalState({ open: true, isEdit: true, item, editId: item.id });
  const handleDeletePrompt = (item: AdminItem) =>
    setDeleteState({ open: true, id: item.id, name: item.name });

  const handleToggleActive = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newActive = !item.active;
    setSettings((prev) => ({
      ...prev,
      [activeTabKey]: prev[activeTabKey].map((i) =>
        i.id === id ? { ...i, active: newActive } : i
      ),
    }));
    try {
      if (activeTab === 'developers') {
        await developersService.update(id, item.name, newActive);
      } else {
        await adminSettingsService.update(id, { ...item, active: newActive });
      }
    } catch (err: any) {
      toast.error('Failed to update status');
      setSettings((prev) => ({
        ...prev,
        [activeTabKey]: prev[activeTabKey].map((i) =>
          i.id === id ? { ...i, active: !newActive } : i
        ),
      }));
    }
  };

  const handleSave = async (payload: Partial<AdminItem>) => {
    try {
      if (modalState.isEdit && modalState.editId) {
        if (activeTab === 'developers') {
          await developersService.update(
            modalState.editId,
            payload.name || '',
            payload.active !== false
          );
        } else {
          await adminSettingsService.update(modalState.editId, payload);
        }
        setSettings((prev) => ({
          ...prev,
          [activeTabKey]: prev[activeTabKey].map((i) =>
            i.id === modalState.editId ? { ...i, ...payload } : i
          ),
        }));
        toast.success('Updated successfully');
      } else {
        let created: AdminItem;
        if (activeTab === 'developers') {
          const dev = await developersService.create(payload.name || '');
          created = { id: dev.id, name: dev.name, active: dev.isActive };
        } else {
          created = (await adminSettingsService.create(activeTab, payload)) as AdminItem;
        }
        setSettings((prev) => ({ ...prev, [activeTabKey]: [...prev[activeTabKey], created] }));
        toast.success('Added successfully');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    }
    setModalState({ open: false, isEdit: false, item: null });
  };

  const handleDelete = async () => {
    try {
      if (activeTab === 'developers') {
        await developersService.delete(deleteState.id);
      } else {
        await adminSettingsService.delete(deleteState.id);
      }
      setSettings((prev) => ({
        ...prev,
        [activeTabKey]: prev[activeTabKey].filter((i) => i.id !== deleteState.id),
      }));
      toast.success('Deleted successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
    setDeleteState({ open: false, id: '', name: '' });
  };

  const sortedItems = hasOrder(activeTab)
    ? [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : items;
  const activeCount = items.filter((i) => i.active).length;

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background gap-3 p-8">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading admin panel…</p>
      </div>
    );
  }

  const isAdminOrOwner = isAdminRole(profile?.role);
  if (!isAdminOrOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background gap-3 p-8">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldCheck size={20} className="text-destructive" />
        </div>
        <h1 className="text-lg font-bold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Only admins and owners can manage system settings and users. Contact your administrator if
          you need access.
        </p>
      </div>
    );
  }

  const canUsers = canManageUsers(profile?.role);
  const visibleTabs = TABS.filter((t) => t.key !== 'users' || canUsers);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 pt-6 pb-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage CRM configuration — no code changes needed
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <div className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-card overflow-y-auto py-2 px-2 flex flex-col gap-1">
          {visibleTabs.map((tab) => {
            const isUsers = tab.key === 'users';
            const isAttendance = tab.key === 'attendance';
            const isActivity = tab.key === 'activity';
            const isProductivity = tab.key === 'productivity';
            const isCallLogs = tab.key === 'callLogs';
            const isSpecial = isUsers || isAttendance || isActivity || isProductivity || isCallLogs;
            const count = isSpecial
              ? 0
              : (
                  settings[
                    tab.key as Exclude<
                      TabKey,
                      'users' | 'attendance' | 'activity' | 'productivity' | 'callLogs'
                    >
                  ] || []
                ).length;
            const active = isSpecial
              ? 0
              : (
                  settings[
                    tab.key as Exclude<
                      TabKey,
                      'users' | 'attendance' | 'activity' | 'productivity' | 'callLogs'
                    >
                  ] || []
                ).filter((i) => i.active).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${activeTab === tab.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <span className="flex-shrink-0">{tab.icon}</span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${activeTab === tab.key ? 'text-primary' : 'text-foreground'}`}
                  >
                    {tab.label}
                  </p>
                  {isUsers ? (
                    <p className="text-xs text-muted-foreground">Manage access</p>
                  ) : isAttendance ? (
                    <p className="text-xs text-muted-foreground">Office check-ins</p>
                  ) : isActivity ? (
                    <p className="text-xs text-muted-foreground">Sessions & usage</p>
                  ) : isProductivity ? (
                    <p className="text-xs text-muted-foreground">Leaderboard & ranking</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {active}/{count} active
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {activeTab === 'users' && canUsers ? (
            <UsersTab />
          ) : activeTab === 'attendance' ? (
            <AttendanceTab />
          ) : activeTab === 'activity' ? (
            <ActivityDashboard />
          ) : activeTab === 'productivity' ? (
            <ProductivityDashboard />
          ) : activeTab === 'callLogs' ? (
            <CallLogsTab />
          ) : activeTab === 'emailTemplates' ? (
            <EmailTemplatesTab />
          ) : loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    {activeTab_.icon}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{activeTab_.label}</h2>
                    <p className="text-xs text-muted-foreground">{activeTab_.description}</p>
                  </div>
                </div>
                <button onClick={handleAdd} className="btn-primary flex items-center gap-2 text-sm">
                  <Plus size={15} />
                  Add {activeTab_.label.slice(0, -1)}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 mb-5">
                {[
                  { label: 'Total', value: items.length, color: 'text-foreground' },
                  { label: 'Active', value: activeCount, color: 'text-emerald-600' },
                  {
                    label: 'Inactive',
                    value: items.length - activeCount,
                    color: 'text-muted-foreground',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-card border border-border rounded-xl px-4 py-3"
                  >
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-xl overflow-x-auto">
                {sortedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      {activeTab_.icon}
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      No {activeTab_.label} yet
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Add your first one to get started
                    </p>
                    <button
                      onClick={handleAdd}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      <Plus size={14} />
                      Add {activeTab_.label.slice(0, -1)}
                    </button>
                  </div>
                ) : (
                  <table className="w-full table-mobile">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8"></th>
                        {hasColor(activeTab) && (
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">
                            Color
                          </th>
                        )}
                        {hasOrder(activeTab) && (
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">
                            Order
                          </th>
                        )}
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">
                          Status
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortedItems.map((item) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-muted/30 transition-colors ${!item.active ? 'opacity-50' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <GripVertical
                              size={14}
                              className="text-muted-foreground/40 cursor-grab"
                            />
                          </td>
                          {hasColor(activeTab) && (
                            <td className="px-4 py-3">
                              <div
                                className="w-6 h-6 rounded-lg border border-border/50"
                                style={{ backgroundColor: item.color ?? '#94a3b8' }}
                              />
                            </td>
                          )}
                          {hasOrder(activeTab) && (
                            <td className="px-4 py-3">
                              <span className="text-sm text-muted-foreground font-mono">
                                #{item.order}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {hasColor(activeTab) && item.color && (
                                <span
                                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: item.color }}
                                />
                              )}
                              <span className="text-sm font-medium text-foreground">
                                {item.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleToggleActive(item.id)}
                              className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                            >
                              {item.active ? (
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
                                onClick={() => handleEdit(item)}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDeletePrompt(item)}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-border px-6 py-2 bg-card flex-shrink-0 flex items-center justify-between">
        <p className="text-xs text-muted-foreground/60">Brokly Admin Panel</p>
        <p className="text-xs text-muted-foreground/60">Made by Faris Mustafa</p>
      </div>

      {modalState.open && (
        <ItemModal
          tabKey={activeTab}
          item={modalState.item}
          isEdit={modalState.isEdit}
          onSave={handleSave}
          onClose={() => setModalState({ open: false, isEdit: false, item: null })}
        />
      )}
      {deleteState.open && (
        <DeleteConfirm
          name={deleteState.name}
          onConfirm={handleDelete}
          onClose={() => setDeleteState({ open: false, id: '', name: '' })}
        />
      )}
    </div>
  );
}
