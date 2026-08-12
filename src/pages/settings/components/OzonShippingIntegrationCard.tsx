import { useState, useEffect } from "react";
import { Truck, ExternalLink, KeyRound, User, Building2, X, CheckCircle2, Loader2, Save, MoreHorizontal } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";

function OzonShippingIntegrationCard() {
  const [isOzonModalOpen, setIsOzonModalOpen] = useState(false);

  // Lazy initialisers — read localStorage once on component mount so the
  // card badge reflects whether credentials are already saved.
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("ozon_api_key") ?? "");
  const [clientId, setClientId] = useState(() => localStorage.getItem("ozon_client_id") ?? "");
  const [warehouseId, setWarehouseId] = useState(() => localStorage.getItem("ozon_warehouse_id") ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Re-populate fields every time the modal opens so that values saved in a
  // previous session are always pre-filled, even after a hard refresh (F5).
  useEffect(() => {
    if (isOzonModalOpen) {
      setApiKey(localStorage.getItem("ozon_api_key") ?? "");
      setClientId(localStorage.getItem("ozon_client_id") ?? "");
      setWarehouseId(localStorage.getItem("ozon_warehouse_id") ?? "");
      setSaved(false);
    }
  }, [isOzonModalOpen]);

  const isConnected = Boolean(apiKey && clientId);

  const handleSaveIntegration = async () => {
    setSaving(true);

    // Save credentials to local storage so Delivering.tsx can use them
    localStorage.setItem("ozon_api_key", apiKey.trim());
    localStorage.setItem("ozon_client_id", clientId.trim());
    localStorage.setItem("ozon_warehouse_id", warehouseId.trim());

    // Simulate async save
    await new Promise((r) => setTimeout(r, 1200));
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setIsOzonModalOpen(false);
    }, 1500);
  };

  const handleDisconnect = () => {
    localStorage.removeItem("ozon_api_key");
    localStorage.removeItem("ozon_client_id");
    localStorage.removeItem("ozon_warehouse_id");
    setApiKey("");
    setClientId("");
    setWarehouseId("");
  };

  const handleClose = () => {
    if (!saving) {
      setIsOzonModalOpen(false);
      setSaved(false);
    }
  };

  return (
    <>
      {/* ── Integration Card ── */}
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("ozon") || ""} alt="Ozon Express" className="h-full w-full object-contain" />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">Ozon Shipping</h3>
            </div>
            <div className="flex items-center">
              {isConnected ? (
                <span className="flex h-[22px] items-center gap-1 rounded-full bg-[#10B981]/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[#10B981]">
                  <CheckCircle2 size={11} strokeWidth={2.5} /> Connected
                </span>
              ) : (
                <span className="flex h-[22px] items-center rounded-full bg-base-raised px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                  Not Connected
                </span>
              )}
            </div>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted min-h-[40px]">
            Connect Ozon Express for last-mile delivery tracking and shipment management.
          </p>
        </div>

        <div className="mt-auto border-t border-base-border/60 pt-4 flex flex-col gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOzonModalOpen(true)}
                className="flex-1 rounded-xl border border-brand/20 bg-brand/5 py-2 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                Configure
              </button>
              <button
                onClick={handleDisconnect}
                className="flex-1 rounded-xl border border-red-500/20 bg-red-500/5 py-2 text-[13px] font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsOzonModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {isOzonModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={handleClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-11 w-11 rounded-2xl overflow-hidden border border-base-border/50 flex-shrink-0">
                <img src={getIntegrationLogo("ozon") || ""} alt="Ozon" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-ink">Ozon Shipping</h2>
                <p className="text-[13px] text-ink-muted">Enter your API credentials below</p>
              </div>
              <button onClick={handleClose} disabled={saving} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-4 px-7 py-6">
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <KeyRound size={13} className="text-brand" /> API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Ozon API key"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <User size={13} className="text-brand" /> Client ID / Account ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Building2 size={13} className="text-brand" /> Sender Warehouse ID
                </label>
                <input
                  type="text"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  placeholder="Origin warehouse identifier"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              {saved && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-600">
                  <CheckCircle2 size={14} /> Integration saved successfully!
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-7 py-5 border-t border-base-border/60 bg-base-raised/20">
              <button onClick={handleClose} disabled={saving} className="flex-1 rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors disabled:opacity-60">
                Cancel
              </button>
              <button
                onClick={handleSaveIntegration}
                disabled={saving || saved}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><CheckCircle2 size={14} /> Saved ✓</> : <><Save size={14} /> Save Integration</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default OzonShippingIntegrationCard;
