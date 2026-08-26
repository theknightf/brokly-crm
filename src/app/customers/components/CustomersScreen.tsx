'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  UserCheck,
  Phone,
  Mail,
  MapPin,
  Building2,
  Loader2,
  RefreshCw,
  Banknote,
  TrendingUp,
} from 'lucide-react';
import { customersService } from '@/lib/services/crmService';
import { toast } from 'sonner';

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  propertyType: string;
  budgetMin: number;
  budgetMax: number;
  source: string;
  agent: string;
  agentInitials: string;
  location: string;
  developer: string;
  project: string;
  notes: string;
  lastContact: string;
  createdAt: string;
  updatedAt: string;
}

function formatCurrency(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M ج.م`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K ج.م`;
  return `${value.toLocaleString()} ج.م`;
}

export default function CustomersScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterPropertyType, setFilterPropertyType] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await customersService.getAll();
      setCustomers(data as Customer[]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const sources = useMemo(
    () => [...new Set(customers.map((c) => c.source).filter(Boolean))],
    [customers]
  );
  const propertyTypes = useMemo(
    () => [...new Set(customers.map((c) => c.propertyType).filter(Boolean))],
    [customers]
  );

  const filtered = useMemo(() => {
    let result = [...customers];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.location?.toLowerCase().includes(q) ||
          c.agent?.toLowerCase().includes(q)
      );
    }
    if (filterSource) result = result.filter((c) => c.source === filterSource);
    if (filterPropertyType) result = result.filter((c) => c.propertyType === filterPropertyType);
    return result;
  }, [customers, search, filterSource, filterPropertyType]);

  const totalRevenue = useMemo(
    () => customers.reduce((sum, c) => sum + (c.budgetMax || 0), 0),
    [customers]
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <UserCheck size={22} className="text-primary" />
            Customers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Customers who have won a deal</p>
        </div>
        <button
          onClick={loadCustomers}
          disabled={loading}
          className="btn-ghost p-2 rounded-lg"
          title="Refresh list"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-6 py-4 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <UserCheck size={18} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Customers</p>
            <p className="text-xl font-bold text-foreground">{loading ? '—' : customers.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0">
            <Banknote size={18} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Deal Value</p>
            <p className="text-xl font-bold text-foreground">
              {loading ? '—' : formatCurrency(totalRevenue)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-primary flex-shrink-0">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Showing</p>
            <p className="text-xl font-bold text-foreground">{loading ? '—' : filtered.length}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 h-9 text-sm w-full"
          />
        </div>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="input h-9 text-sm min-w-[130px]"
        >
          <option value="">All Sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterPropertyType}
          onChange={(e) => setFilterPropertyType(e.target.value)}
          className="input h-9 text-sm min-w-[150px]"
        >
          <option value="">All Property Types</option>
          {propertyTypes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {(search || filterSource || filterPropertyType) && (
          <button
            onClick={() => {
              setSearch('');
              setFilterSource('');
              setFilterPropertyType('');
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <UserCheck size={40} className="text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">
              {customers.length === 0 ? 'No customers yet' : 'No customers match your filters'}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {customers.length === 0
                ? 'Customers appear here once a deal is won'
                : 'Try adjusting your search or filters'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((customer) => (
              <CustomerCard
                key={customer.id}
                customer={customer}
                onClick={() => setSelectedCustomer(customer)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedCustomer && (
        <CustomerDetailPanel
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </div>
  );
}

function CustomerCard({ customer, onClick }: { customer: Customer; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all w-full"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
          {customer.agentInitials || customer.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{customer.name}</p>
          <p className="text-xs text-muted-foreground truncate">{customer.email || '—'}</p>
        </div>
        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
          Won
        </span>
      </div>
      <div className="space-y-1.5">
        {customer.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone size={12} className="flex-shrink-0" />
            <span className="truncate">{customer.phone}</span>
          </div>
        )}
        {customer.location && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">{customer.location}</span>
          </div>
        )}
        {customer.project && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 size={12} className="flex-shrink-0" />
            <span className="truncate">{customer.project}</span>
          </div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{customer.propertyType || '—'}</span>
        <span className="text-sm font-semibold text-foreground">
          {customer.budgetMax ? formatCurrency(customer.budgetMax) : '—'}
        </span>
      </div>
    </button>
  );
}

function CustomerDetailPanel({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {customer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-foreground">{customer.name}</h2>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                Won Customer
              </span>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg text-muted-foreground">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <DetailRow icon={<Phone size={15} />} label="Phone" value={customer.phone} />
          <DetailRow icon={<Mail size={15} />} label="Email" value={customer.email} />
          <DetailRow icon={<MapPin size={15} />} label="Location" value={customer.location} />
          <DetailRow icon={<Building2 size={15} />} label="Project" value={customer.project} />
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Property Type</p>
              <p className="text-sm font-semibold text-foreground">
                {customer.propertyType || '—'}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Deal Value</p>
              <p className="text-sm font-semibold text-foreground">
                {customer.budgetMax ? formatCurrency(customer.budgetMax) : '—'}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Source</p>
              <p className="text-sm font-semibold text-foreground">{customer.source || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Assigned Agent</p>
              <p className="text-sm font-semibold text-foreground">{customer.agent || '—'}</p>
            </div>
          </div>
          {customer.notes && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-foreground">{customer.notes}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-right">
            Won on {customer.updatedAt || customer.createdAt || '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground flex-shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
