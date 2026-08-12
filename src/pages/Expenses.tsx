import { FormEvent, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Save,
  TrendingDown,
  Package,
  Truck,
  Phone,
  CircleDollarSign,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { supabase } from "../lib/supabase";
import type { Expense } from "../lib/types";
import { useBusinessConfig, type BusinessConfig } from "../hooks/useBusinessConfig";
import { useAuth } from "../hooks/useAuth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mad(n: number) {
  return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
}

const EXPENSE_CATEGORIES = [
  "Ad spend",
  "Livraison",
  "Fulfillment",
  "Confirmation",
  "Packaging",
  "Warehouse rent",
  "Salaries",
  "Other",
] as const;

// ─── Fee Card ────────────────────────────────────────────────────────────────

interface FeeCardProps {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}

function FeeCard({ icon, label, sublabel, value, onChange, color }: FeeCardProps) {
  return (
    <div className={`rounded-xl max-md:rounded-2xl max-md:bg-base-surface/60 max-md:backdrop-blur-xl border max-md:border-none ${color} bg-base-surface p-4 max-md:p-5 shadow-card max-md:shadow-lg flex flex-col gap-3 max-md:gap-4 relative overflow-hidden`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg max-md:rounded-xl p-2 max-md:p-2.5 ${color.replace("border", "bg").replace("/40", "/15").replace("/30", "/15")}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] max-md:text-[15px] font-semibold text-ink">{label}</div>
          <div className="text-[11.5px] max-md:text-[12px] text-ink-muted mt-0.5 max-md:mt-1">{sublabel}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg max-md:rounded-xl border border-base-border bg-base-raised px-3 py-1.5 max-md:px-4 max-md:py-2">
        <input
          type="number"
          min={0}
          step={0.5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 bg-transparent text-[14px] max-md:text-[16px] font-mono font-semibold text-ink focus:outline-none min-w-0"
        />
        <span className="text-[12px] max-md:text-[13px] text-ink-muted font-medium shrink-0">MAD</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Expenses() {
  const { workspace } = useAuth();
  const { config, save: saveConfig } = useBusinessConfig();
  const [draft, setDraft] = useState<BusinessConfig>(config);
  const [configDirty, setConfigDirty] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [range, setRange] = useState(30);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showExpenses, setShowExpenses] = useState(true);

  const load = () => {
    if (!workspace?.id) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - range);
    supabase
      .from("expenses")
      .select("*")
      .eq("workspace_id", workspace.id)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .then(({ data }) => {
        setExpenses((data ?? []) as Expense[]);
        setLoading(false);
      });
  };

  useEffect(load, [range, workspace?.id]);

  useEffect(() => {
    setDraft(config);
    setConfigDirty(false);
    setConfigSaved(false);
    setConfigError(null);
  }, [config]);

  // ── Config handlers ───────────────────────────────────────────────────────

  const handleConfigField = (field: keyof BusinessConfig, value: number) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setConfigDirty(true);
    setConfigSaved(false);
  };

  const handleSaveConfig = async () => {
    setConfigError(null);
    try {
      await saveConfig(draft);
      setConfigDirty(false);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2500);
    } catch (error: any) {
      setConfigError(error?.message ?? "Unable to save business fees.");
    }
  };

  // ── Derived totals ────────────────────────────────────────────────────────

  const filteredExpenses =
    categoryFilter === "all"
      ? expenses
      : expenses.filter((e) => e.category === categoryFilter);

  const totalExpenses = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);

  const categorySums: Record<string, number> = {};
  expenses.forEach((e) => {
    categorySums[e.category] = (categorySums[e.category] ?? 0) + Number(e.amount);
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await supabase.from("expenses").delete().eq("id", id);
    setDeletingId(null);
    load();
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Expenses"
        subtitle="Manage your fixed costs and expenses for accurate profit calculation."
        action={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand/90"
          >
            <Plus size={14} /> New Expense
          </button>
        }
      />

      {/* ── Business Fees Config ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-base-border bg-base-surface shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-border">
          <div>
            <div className="text-[14px] font-semibold text-ink flex items-center gap-2">
              <CircleDollarSign size={15} className="text-brand" />
              Fixed Fees — Configuration
            </div>
            <div className="text-[12px] text-ink-muted mt-0.5">
              These values are used to calculate net profit in the Dashboard.
            </div>
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={!configDirty}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium border transition-all
              ${configDirty
                ? "bg-brand/10 text-brand border-brand/20 hover:bg-brand/20 cursor-pointer"
                : configSaved
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-default"
                  : "text-ink-faint border-base-border cursor-not-allowed opacity-50"
              }`}
          >
            <Save size={13} />
            {configSaved ? "Saved ✓" : "Save"}
          </button>
        </div>

        {configError && (
          <div className="mx-5 mt-4 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
            {configError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 p-5">
          <FeeCard
            icon={<Truck size={16} className="text-blue-400" />}
            label="Delivery Fee"
            sublabel="Per delivered order (LIVRE)"
            value={draft.deliveryFee}
            onChange={(v) => handleConfigField("deliveryFee", v)}
            color="border-blue-500/30"
          />
          <FeeCard
            icon={<Phone size={16} className="text-emerald-400" />}
            label="Confirmation Fee"
            sublabel="Per delivered order (LIVRE)"
            value={draft.confirmationFee}
            onChange={(v) => handleConfigField("confirmationFee", v)}
            color="border-emerald-500/30"
          />
          <FeeCard
            icon={<Package size={16} className="text-amber-400" />}
            label="Fulfillment Fee"
            sublabel="Per confirmed order"
            value={draft.fulfillmentFee}
            onChange={(v) => handleConfigField("fulfillmentFee", v)}
            color="border-amber-500/30"
          />
          <FeeCard
            icon={<CircleDollarSign size={16} className="text-purple-400" />}
            label="Lead Fee"
            sublabel="Per lead entered (all orders)"
            value={draft.leadFee}
            onChange={(v) => handleConfigField("leadFee", v ?? 0)}
            color="border-purple-500/30"
          />
          <FeeCard
            icon={<TrendingDown size={16} className="text-red-400" />}
            label="Product Cost (fallback)"
            sublabel="If no SKU mapped"
            value={draft.productCostPerOrder}
            onChange={(v) => handleConfigField("productCostPerOrder", v)}
            color="border-red-500/30"
          />
        </div>

        {/* Summary row */}
        <div className="border-t border-base-border px-5 py-3 bg-base-raised/40 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-ink-muted">
          <span>
            Delivery: <strong className="text-blue-400 font-mono">{draft.deliveryFee} MAD</strong>/delivery
          </span>
          <span>
            Confirmation: <strong className="text-emerald-400 font-mono">{draft.confirmationFee} MAD</strong>/delivery
          </span>
          <span>
            Fulfillment: <strong className="text-amber-400 font-mono">{draft.fulfillmentFee} MAD</strong>/confirmed
          </span>
          <span>
            Lead: <strong className="text-purple-400 font-mono">{draft.leadFee} MAD</strong>/lead
          </span>
          {draft.productCostPerOrder > 0 && (
            <span>
              Product Cost: <strong className="text-red-400 font-mono">{draft.productCostPerOrder} MAD</strong>/order
            </span>
          )}
        </div>
      </div>

      {/* ── Category summary chips ────────────────────────────────────────── */}
      {Object.keys(categorySums).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(categorySums)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, total]) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-all
                  ${categoryFilter === cat
                    ? "bg-brand/15 border-brand/30 text-brand"
                    : "bg-base-surface border-base-border text-ink-muted hover:border-brand/20 hover:text-ink"
                  }`}
              >
                {cat} — <span className="font-mono">{mad(total)}</span>
              </button>
            ))}
          {categoryFilter !== "all" && (
            <button
              onClick={() => setCategoryFilter("all")}
              className="rounded-full border border-base-border px-3 py-1 text-[12px] text-ink-muted hover:text-ink"
            >
              Show All
            </button>
          )}
        </div>
      )}

      {/* ── Expenses Table ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-base-border bg-base-surface shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-border">
          <button
            onClick={() => setShowExpenses((p) => !p)}
            className="flex items-center gap-2 text-[13.5px] font-semibold text-ink"
          >
            {showExpenses ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            One-off Expenses
            {totalExpenses > 0 && (
              <span className="ml-1 font-mono text-[12px] text-ink-muted">
                — {mad(totalExpenses)}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
              className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1 text-[12px] text-ink focus:outline-none"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
            <button
              onClick={load}
              className="rounded-lg border border-base-border bg-base-raised p-1.5 text-ink-muted hover:text-ink transition-colors"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {showExpenses && (
          <div className="hidden md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-base-border text-left text-[12px] text-ink-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                      Loading…
                    </td>
                  </tr>
                ) : filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="No expressions recorded"
                        subtitle="Add your ad spend, rent, or other costs here."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-base-border last:border-0 hover:bg-base-raised/40 group"
                    >
                      <td className="px-4 py-3 text-ink-muted tabular-nums">
                        {new Date(e.date).toLocaleDateString("en-US")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-base-border bg-base-raised px-2 py-0.5 text-[11.5px] font-medium text-ink-muted">
                          {e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{e.description ?? "—"}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-ink text-right">
                        {mad(e.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deletingId === e.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          {deletingId === e.id ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredExpenses.length > 0 && (
                <tfoot>
                  <tr className="border-t border-base-border bg-base-raised/30">
                    <td colSpan={3} className="px-4 py-3 text-[12px] font-medium text-ink-muted">
                      Total ({filteredExpenses.length} entr{filteredExpenses.length > 1 ? "ies" : "y"})
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-ink text-right">
                      {mad(totalExpenses)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Mobile View */}
        {showExpenses && (
          <div className="md:hidden flex flex-col gap-3 p-4 bg-base-background">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center rounded-2xl bg-base-surface/80 border-none shadow-md backdrop-blur-md p-4 animate-pulse">
                  <div>
                    <div className="h-4 w-24 bg-base-raised rounded mb-2" />
                    <div className="h-3 w-32 bg-base-raised rounded" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="h-5 w-16 bg-base-raised rounded" />
                    <div className="h-6 w-6 rounded-full bg-base-raised" />
                  </div>
                </div>
              ))
            ) : filteredExpenses.length === 0 ? (
              <EmptyState title="No expenses recorded" subtitle="Add your ad spend or rent here." />
            ) : (
              filteredExpenses.map(e => (
                <div key={e.id} className="flex justify-between items-center rounded-2xl bg-base-surface/80 border-none shadow-md backdrop-blur-md p-4">
                  <div>
                    <div className="font-semibold text-ink mb-0.5">{e.category}</div>
                    <div className="text-[12px] text-ink-muted">{new Date(e.date).toLocaleDateString("en-US")} {e.description ? `• ${e.description}` : ""}</div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <span className="font-mono font-bold text-[15px] text-ink tracking-tight">{mad(e.amount)}</span>
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={deletingId === e.id}
                      className="p-1.5 rounded-full bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-40"
                    >
                      {deletingId === e.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              ))
            )}
            {filteredExpenses.length > 0 && (
              <div className="border-t border-base-border pt-4 mt-2 flex justify-between items-center px-1">
                <div className="text-[13px] text-ink-muted font-medium">Total</div>
                <div className="font-mono font-bold text-ink text-[18px]">{mad(totalExpenses)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {showNew && (
        <NewExpenseModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── New Expense Modal ────────────────────────────────────────────────────────

function NewExpenseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { workspace } = useAuth();
  const [category, setCategory] = useState<string>("Ad spend");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace?.id) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("expenses")
      .insert({ category, description, amount: Number(amount), date, workspace_id: workspace.id });
    setBusy(false);
    if (error) setError(error.message);
    else onCreated();
  };

  return (
    <Modal title="New Expense" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-[#18181b]">{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Facebook Ads – July"
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-muted">Amount (MAD)</label>
            <input
              type="number"
              required
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-muted">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
            />
          </div>
        </div>
        {error && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-lg bg-brand py-2 text-[13px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add Expense"}
        </button>
      </form>
    </Modal>
  );
}
