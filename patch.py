import pathlib

path = pathlib.Path('src/pages/Settings.tsx')
c = path.read_text(encoding='utf-8')

# 1. Imports
t1 = 'import { FormEvent, useState, useEffect } from "react";'
r1 = 'import { FormEvent, useState, useEffect, useCallback } from "react";'
c = c.replace(t1, r1)

t2 = 'import { CheckCircle2, ExternalLink, User, Building2, Lock, Save, X, Loader2, Store, Truck, RefreshCw, Star } from "lucide-react";'
r2 = 'import { CheckCircle2, ExternalLink, User, Building2, Lock, Save, X, Loader2, Store, Truck, RefreshCw, Star, Bell, ShoppingCart, Package, Users, AlertTriangle } from "lucide-react";'
c = c.replace(t2, r2)

# 2. Render Notifications
import re

c = re.sub(
    r'\{tab === "Notifications" && \(\s*<ComingNext[^>]*/>\s*\)\}',
    '{tab === "Notifications" && <NotificationsTab />}',
    c
)


# 3. Add Component before Integrations
notifications_tab_code = """
// ─── Notifications Tab ────────────────────────────────────────────────────────

const NOTIF_TYPES = [
  { type: "new_order", label: "New orders", description: "When a new order is synced", icon: ShoppingCart },
  { type: "order_confirmed", label: "Order confirmed", description: "When an order is confirmed", icon: CheckCircle2 },
  { type: "order_cancelled", label: "Order cancelled", description: "When an order is cancelled or returned", icon: X },
  { type: "shipping_update", label: "Shipping updates", description: "Status changes from your carrier", icon: Truck },
  { type: "low_stock", label: "Low stock", description: "When a product is running low", icon: Package },
  { type: "new_customer", label: "New customer", description: "First order from a new customer", icon: Users },
  { type: "system_alert", label: "System alerts", description: "Platform and workspace messages", icon: AlertTriangle },
];

function NotificationsTab() {
  const { workspace, profile } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<string>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!workspace?.id || !profile?.id) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("notification_preferences")
          .select("type, enabled")
          .eq("workspace_id", workspace.id)
          .eq("user_id", profile.id);
        const map: Record<string, boolean> = {};
        NOTIF_TYPES.forEach(({ type }) => { map[type] = true; });
        (data || []).forEach((row: any) => { map[row.type] = row.enabled; });
        setPrefs(map);
      } catch { /* use defaults */ } finally { setLoading(false); }
    };
    load();
  }, [workspace?.id, profile?.id]);

  const toggle = useCallback(async (type: string) => {
    if (!workspace?.id || !profile?.id) return;
    const next = !prefs[type];
    setPrefs(prev => ({ ...prev, [type]: next }));
    setSaving(type);
    try {
      await supabase.from("notification_preferences").upsert(
        { workspace_id: workspace.id, user_id: profile.id, type, enabled: next, push_enabled: true, email_enabled: false },
        { onConflict: "workspace_id,user_id,type" }
      );
    } catch {
      setPrefs(prev => ({ ...prev, [type]: !next }));
      toast.error("Could not save.");
    } finally { setSaving(null); }
  }, [prefs, workspace?.id, profile?.id]);

  const requestPush = async () => {
    if (!('Notification' in window)) return;
    const res = await Notification.requestPermission();
    setPushPermission(res);
    if (res === 'granted') toast.success("Push notifications enabled");
    else toast.error("Notifications blocked in browser settings");
  };

  return (
    <div className="flex flex-col gap-4 max-w-lg pb-10">
      {/* Push status */}
      {'Notification' in window && (
        <div className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${
          pushPermission === 'granted'
            ? 'border-success/30 bg-success/5'
            : 'border-base-border bg-base-raised/40'
        }`}>
          <div className="flex items-center gap-3">
            <Bell size={15} className={pushPermission === 'granted' ? 'text-success' : 'text-ink-muted'} />
            <div>
              <div className="text-[13px] font-medium text-ink">
                {pushPermission === 'granted' ? 'Push notifications on' : 'Push notifications off'}
              </div>
              <div className="text-[11.5px] text-ink-muted mt-0.5">
                {pushPermission === 'granted' ? 'You get alerts even when the app is closed.' : 'Enable to receive alerts when the app is closed.'}
              </div>
            </div>
          </div>
          {pushPermission !== 'granted' && (
            <button
              type="button"
              onClick={requestPush}
              className="shrink-0 rounded-lg bg-brand-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-accentHover transition-colors"
            >
              Enable
            </button>
          )}
        </div>
      )}

      {/* Per-type toggles */}
      <div className="rounded-xl border border-base-border bg-base-surface shadow-card overflow-hidden">
        <div className="border-b border-base-border px-5 py-3.5">
          <div className="text-[13px] font-semibold text-ink">Notify me when…</div>
        </div>
        <div className="divide-y divide-base-border">
          {NOTIF_TYPES.map(({ type, label, description, icon: Icon }) => {
            const enabled = prefs[type] ?? true;
            const busy = saving === type;
            return (
              <div key={type} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon size={14} className="shrink-0 text-ink-faint" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">{label}</div>
                    <div className="text-[11.5px] text-ink-muted truncate">{description}</div>
                  </div>
                </div>
                <label className="relative inline-flex flex-none cursor-pointer items-center" aria-label={label}>
                  {loading || busy ? (
                    <Loader2 size={18} className="animate-spin text-ink-muted" />
                  ) : (
                    <>
                      <input type="checkbox" checked={enabled} onChange={() => toggle(type)} className="sr-only" />
                      <span className={`block h-6 w-10 rounded-full transition-colors ${enabled ? 'bg-brand-accent' : 'bg-base-border'}`} />
                      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </>
                  )}
                </label>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────"""

c = c.replace('// ─── Integrations Tab ─────────────────────────────────────────────────────────', notifications_tab_code)

path.write_text(c, encoding='utf-8')
