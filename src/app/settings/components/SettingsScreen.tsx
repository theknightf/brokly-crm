'use client';
import React, { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Bell,
  Shield,
  Palette,
  Building2,
  Save,
  Loader2,
  Check,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { isAdminRole } from '@/lib/roles';

type SettingsTab = 'profile' | 'notifications' | 'appearance' | 'security' | 'brokerage';

const TABS: { key: SettingsTab; label: string; icon: React.ReactNode; description: string }[] = [
  {
    key: 'profile',
    label: 'Profile',
    icon: <User size={16} />,
    description: 'Your personal information and contact details',
  },
  {
    key: 'brokerage',
    label: 'Brokerage',
    icon: <Building2 size={16} />,
    description: 'Brokerage name and company settings',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: <Bell size={16} />,
    description: 'Email and in-app notification preferences',
  },
  {
    key: 'appearance',
    label: 'Appearance',
    icon: <Palette size={16} />,
    description: 'Theme and display preferences',
  },
  {
    key: 'security',
    label: 'Security',
    icon: <Shield size={16} />,
    description: 'Password and account security',
  },
];

// ─── Profile Tab ──────────────────────────────────────────────────────────────
function ProfileTab({ profile, user }: { profile: any; user: any }) {
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Personal Information</h2>
        <p className="text-sm text-muted-foreground">Update your name and contact details.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold flex-shrink-0">
          {(fullName || user?.email || 'U')
            .split(' ')
            .map((p: string) => p[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)}
        </div>
        <div>
          <p className="font-semibold text-foreground">
            {fullName || user?.email?.split('@')[0] || 'User'}
          </p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mt-1 capitalize">
            {profile?.role?.replace('_', ' ') || 'agent'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+20 10 0000 0000"
            className="input-base w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="input-base w-full opacity-60 cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Role</label>
          <input
            type="text"
            value={(profile?.role || 'agent').replace('_', ' ')}
            disabled
            className="input-base w-full opacity-60 cursor-not-allowed capitalize"
          />
          <p className="text-xs text-muted-foreground mt-1">Role is assigned by your admin</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save Changes
        </button>
      </div>
    </div>
  );
}

// ─── Brokerage Tab ────────────────────────────────────────────────────────────
function BrokerageTab({ profile, user }: { profile: any; user: any }) {
  const [brokerageName, setBrokerageName] = useState(profile?.brokerage_name || '');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ brokerage_name: brokerageName.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Brokerage settings saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save brokerage settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Brokerage Information</h2>
        <p className="text-sm text-muted-foreground">Your company and brokerage details.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Brokerage Name</label>
        <input
          type="text"
          value={brokerageName}
          onChange={(e) => setBrokerageName(e.target.value)}
          placeholder="e.g. Brokly Realty"
          className="input-base w-full max-w-md"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save Changes
        </button>
      </div>

      <div className="border-t border-border pt-6">
        <RotationToggle profile={profile} />
      </div>
    </div>
  );
}

// ─── Lead Rotation Toggle (admin) ─────────────────────────────────────────────
function RotationToggle({ profile }: { profile: any }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/api/rotation', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((body) => {
        if (mounted) setEnabled(!!body.enabled);
      })
      .catch(() => {
        if (mounted) setEnabled(false);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      setEnabled(!enabled);
      toast.success(enabled ? 'Lead rotation turned off' : 'Lead rotation turned on');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save rotation setting');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdminRole(profile?.role)) return null;

  return (
    <div className="flex items-start justify-between gap-4 p-5 bg-card border border-border rounded-xl">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Lead Rotation</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          When on, new and imported leads without an explicit assignee are
          automatically assigned to the least-recently-assigned active
          salesperson (round-robin).
        </p>
      </div>
      {loading ? (
        <Loader2 size={18} className="animate-spin text-primary flex-shrink-0 mt-1" />
      ) : (
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-primary' : 'bg-muted'}`}
          aria-label="Toggle lead rotation"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      )}
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────
function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    emailLeads: true,
    emailFollowUps: true,
    emailReports: false,
    inAppLeads: true,
    inAppFollowUps: true,
  });

  const toggle = (key: keyof typeof prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const items = [
    {
      key: 'emailLeads' as const,
      label: 'New Lead Assigned',
      desc: 'Email when a lead is assigned to you',
      group: 'Email',
    },
    {
      key: 'emailFollowUps' as const,
      label: 'Follow-up Reminders',
      desc: 'Email reminders for due follow-ups',
      group: 'Email',
    },
    {
      key: 'emailReports' as const,
      label: 'Weekly Reports',
      desc: 'Weekly performance summary email',
      group: 'Email',
    },
    {
      key: 'inAppLeads' as const,
      label: 'Lead Updates',
      desc: 'In-app alerts for lead status changes',
      group: 'In-App',
    },
    {
      key: 'inAppFollowUps' as const,
      label: 'Follow-up Alerts',
      desc: 'In-app reminders for overdue follow-ups',
      group: 'In-App',
    },
  ];

  const groups = ['Email', 'In-App'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Notification Preferences</h2>
        <p className="text-sm text-muted-foreground">Choose what you want to be notified about.</p>
      </div>
      {groups.map((group) => (
        <div key={group}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {group} Notifications
          </h3>
          <div className="space-y-3">
            {items
              .filter((i) => i.group === group)
              .map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => toggle(item.key)}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${prefs[item.key] ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${prefs[item.key] ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────
function AppearanceTab() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  const themes = [
    { value: 'light' as const, label: 'Light', icon: <Sun size={18} /> },
    { value: 'dark' as const, label: 'Dark', icon: <Moon size={18} /> },
    { value: 'system' as const, label: 'System', icon: <Monitor size={18} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Appearance</h2>
        <p className="text-sm text-muted-foreground">Customize how Brokly looks for you.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">Theme</label>
        <div className="grid grid-cols-3 gap-3 max-w-sm">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                theme === t.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <span className={theme === t.value ? 'text-primary' : 'text-muted-foreground'}>
                {t.icon}
              </span>
              <span
                className={`text-xs font-medium ${theme === t.value ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {t.label}
              </span>
              {theme === t.value && <Check size={12} className="text-primary" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Theme switching will be applied in a future update.
        </p>
      </div>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
function SecurityTab({ user }: { user: any }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/sign-up-login`,
      });
      if (error) throw error;
      setSent(true);
      toast.success('Password reset email sent');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reset email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Security Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your password and account security.</p>
      </div>

      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Password</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Send a password reset link to{' '}
              <span className="font-medium text-foreground">{user?.email}</span>
            </p>
          </div>
          <button
            onClick={handlePasswordReset}
            disabled={sending || sent}
            className="btn-secondary flex items-center gap-2 flex-shrink-0"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : sent ? (
              <Check size={14} className="text-green-500" />
            ) : (
              <Shield size={14} />
            )}
            {sent ? 'Email Sent' : 'Reset Password'}
          </button>
        </div>
      </div>

      <div className="p-5 bg-card border border-border rounded-xl">
        <h3 className="text-sm font-semibold text-foreground mb-1">Account ID</h3>
        <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded-lg mt-2 break-all">
          {user?.id}
        </p>
      </div>
    </div>
  );
}

// ─── Main Settings Screen ─────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 pt-6 pb-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-border bg-card overflow-y-auto py-3 px-2 space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span className="flex-shrink-0">{tab.icon}</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium truncate ${activeTab === tab.key ? 'text-primary' : 'text-foreground'}`}
                >
                  {tab.label}
                </p>
                <p className="text-xs text-muted-foreground truncate hidden lg:block">
                  {tab.description.split(' ').slice(0, 3).join(' ')}…
                </p>
              </div>
              {activeTab === tab.key && (
                <ChevronRight size={14} className="text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'profile' && <ProfileTab profile={profile} user={user} />}
          {activeTab === 'brokerage' && <BrokerageTab profile={profile} user={user} />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'security' && <SecurityTab user={user} />}
        </div>
      </div>
    </div>
  );
}
