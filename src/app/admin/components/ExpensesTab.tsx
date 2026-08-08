'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  Receipt,
  Wallet,
  CalendarDays,
  Layers,
  TrendingUp,
  RefreshCw,
  Search,
} from 'lucide-react';
import { expensesService, type Expense } from '@/lib/services/crmService';
import { toast } from 'sonner';

const DEFAULT_CATEGORIES = [
  'Electricity',
  'Water',
  'Rent',
  'Internet',
  'Phone',
  'Kitchen Staff',
  'Cleaning Staff',
  'Salaries',
  'Office Supplies',
  'Transport',
  'Fuel',
  'Marketing',
  'Maintenance',
  'Meals',
  'Miscellaneous',
];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatCurrency(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface ExpenseForm {
  title: string;
  category: string;
  amount: string;
  expense_date: string;
  notes: string;
}

const emptyForm: ExpenseForm = {
  title: '',
  category: 'Electricity',
  amount: '',
  expense_date: todayIso(),
  notes: '',
};

function ExpenseModal({
  expense,
  categories,
  onSave,
  onClose,
  isEdit,
}: {
  expense: Expense | null;
  categories: string[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isEdit: boolean;
}) {
  const [form, setForm] = useState<ExpenseForm>({
    title: expense?.title ?? '',
    category: expense?.category ?? 'Electricity',
    amount: expense ? String(expense.amount) : '',
    expense_date: expense?.expense_date || todayIso(),
    notes: expense?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amount = Number(form.amount);
    if (!form.title.trim() && (!form.amount || amount <= 0)) {
      setError('Enter a title or a valid amount');
      return;
    }
    if (form.amount && (!Number.isFinite(amount) || amount < 0)) {
      setError('Amount must be a positive number');
      return;
    }
    if (!form.expense_date) {
      setError('Select a date');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        category: form.category,
        amount: amount || 0,
        expense_date: form.expense_date,
        notes: form.notes.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-md p-6 fade-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt size={16} className="text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {isEdit ? 'Edit Expense' : 'Add Expense'}
            </h3>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => {
                setForm((p) => ({ ...p, title: e.target.value }));
                setError('');
              }}
              placeholder="e.g. Monthly electricity bill"
              className="input-base w-full"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="input-base w-full"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Amount (EGP)</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => {
                  setForm((p) => ({ ...p, amount: e.target.value }));
                  setError('');
                }}
                placeholder="0.00"
                className="input-base w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Date</label>
            <input
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm((p) => ({ ...p, expense_date: e.target.value }))}
              className="input-base w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional details…"
              rows={2}
              className="input-base w-full resize-none"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {isEdit ? 'Save Changes' : 'Add Expense'}
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
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-modal w-full max-w-sm p-6 fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Delete Expense</h3>
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
            onClick={async () => {
              setDeleting(true);
              await onConfirm();
              setDeleting(false);
            }}
            disabled={deleting}
            className="flex-1 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : null}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => monthStartIso());
  const [to, setTo] = useState(() => todayIso());
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; isEdit: boolean; expense: Expense | null }>({
    open: false,
    isEdit: false,
    expense: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const categories = useMemo(() => {
    const used = Array.from(new Set(expenses.map((e) => e.category))).filter(Boolean);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...used])).sort();
  }, [expenses]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await expensesService.getAll({ from, to, category });
      setExpenses(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [from, to, category]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q)
    );
  }, [expenses, search]);

  const total = filtered.reduce((sum, e) => sum + (e.amount || 0), 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      const k = e.category || 'Other';
      map.set(k, (map.get(k) || 0) + (e.amount || 0));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const topCategory = byCategory[0]?.name ?? '—';
  const topValue = byCategory[0]?.value ?? 0;
  const maxCategory = Math.max(1, ...byCategory.map((c) => c.value));

  const handleSave = async (data: any) => {
    try {
      if (modal.isEdit && modal.expense) {
        await expensesService.update(modal.expense.id, data);
        toast.success('Expense updated');
      } else {
        await expensesService.create(data);
        toast.success('Expense added');
      }
      setModal({ open: false, isEdit: false, expense: null });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save expense');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await expensesService.delete(deleteTarget.id);
      toast.success('Expense deleted');
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete expense');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Office Expenses</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track monthly running costs — electricity, rent, kitchen staff, and more.
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, isEdit: false, expense: null })}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} />
          Add Expense
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <Wallet size={16} className="text-primary" />
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(total)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total (filtered) · EGP</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
            <Layers size={16} className="text-amber-600" />
          </div>
          <p className="text-xl font-bold text-foreground">{filtered.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Expense entries</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-foreground truncate">{topCategory}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Top category · {formatCurrency(topValue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
            <CalendarDays size={16} className="text-blue-600" />
          </div>
          <p className="text-xl font-bold text-foreground">
            {fmtDate(from)} — {fmtDate(to)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Reporting period</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="input-base text-sm"
          title="From"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="input-base text-sm"
          title="To"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-base text-sm"
          title="Category"
        >
          <option value="All">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="input-base text-sm pl-9"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Apply
        </button>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Breakdown by category
          </p>
          <div className="space-y-2">
            {byCategory.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="text-xs font-medium text-foreground w-32 truncate">{c.name}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(c.value / maxCategory) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-20 text-right tabular-nums">
                  {formatCurrency(c.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Expense log</h3>
          <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Receipt size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No expenses yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Add electricity, rent, kitchen staff, and other costs to track them here.
            </p>
            <button
              onClick={() => setModal({ open: true, isEdit: false, expense: null })}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Plus size={14} />
              Add Expense
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Title
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Category
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {e.title || <span className="text-muted-foreground">Untitled</span>}
                      </p>
                      {e.notes && (
                        <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                          {e.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        {e.category || 'Other'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                      {formatCurrency(e.amount)} <span className="text-xs text-muted-foreground font-normal">EGP</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() =>
                            setModal({ open: true, isEdit: true, expense: e })
                          }
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(e)}
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
          </div>
        )}
      </div>

      {modal.open && (
        <ExpenseModal
          expense={modal.expense}
          categories={categories}
          isEdit={modal.isEdit}
          onSave={handleSave}
          onClose={() => setModal({ open: false, isEdit: false, expense: null })}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.title || deleteTarget.category}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
