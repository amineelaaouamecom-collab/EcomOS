import { useState, useEffect } from "react";
import { CheckCircle2, MoreHorizontal, X, Loader2, Settings2, Link2 } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/Toast";
import GoogleSheetColumnMapping from "./GoogleSheetColumnMapping";

function GoogleSheetIntegrationCard() {
  const { workspace, refreshProfile } = useAuth();
  const [url, setUrl] = useState(workspace?.google_sheet_url ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUrl(workspace?.google_sheet_url ?? "");
  }, [workspace?.id, workspace?.google_sheet_url]);

  const connected = !!workspace?.google_sheet_url;

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    const trimmedUrl = url.trim();

    if (trimmedUrl) {
      try {
        const res = await fetch(trimmedUrl);
        if (!res.ok) throw new Error(`Erreur HTTP: ${res.status} ${res.statusText}`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0)
          throw new Error("Format invalide : ce lien ne renvoie pas un tableau JSON valide.");
      } catch (err: any) {
        setSaving(false);
        toast.error(`Impossible de lire ce Google Sheet — vérifiez qu'il est public. Détail: ${err.message}`, 8000);
        return;
      }
    }

    const { error } = await supabase
      .from("workspaces")
      .update({ google_sheet_url: trimmedUrl || null })
      .eq("id", workspace.id);

    setSaving(false);
    if (!error) {
      setModalOpen(false);
      refreshProfile();
      if (trimmedUrl) toast.success("Google Sheet connecté avec succès !");
    } else {
      toast.error(`Erreur de sauvegarde: ${error.message}`);
    }
  };

  const handleDisconnect = async () => {
    if (!workspace) return;
    setSaving(true);
    await supabase.from("workspaces").update({ google_sheet_url: null }).eq("id", workspace.id);
    setUrl("");
    setSaving(false);
    setModalOpen(false);
    refreshProfile();
  };

  return (
    <>
      {/* ── Card ── */}
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("google") || ""} alt="Google Sheets" className="h-full w-full object-contain" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">Google Sheets Sync</h3>
            <div className="flex items-center">
              {connected ? (
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
            Connect your Google Sheet web app URL to power auto-sync on the Orders page.
          </p>
        </div>

        <div className="mt-auto border-t border-base-border/60 pt-4 flex flex-col gap-2">
          {connected ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-base-raised py-2 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-60"
                >
                  Disconnect
                </button>
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex-1 rounded-xl border border-brand/20 bg-brand/5 py-2 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
                >
                  Manage
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setModalOpen(true)}
              className="w-full rounded-xl bg-brand py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* ── SaaS Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-11 w-11 rounded-2xl overflow-hidden border border-base-border/50 flex-shrink-0">
                <img src={getIntegrationLogo("google") || ""} alt="Google Sheets" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-ink">Google Sheets Sync</h2>
                <p className="text-[13px] text-ink-muted">Configure your web app URL</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors">
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div className="px-7 py-6 flex flex-col gap-5">
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Link2 size={13} className="text-brand" />
                  Google Sheet Web App URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[12.5px] font-mono text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                  placeholder="https://script.googleusercontent.com/macros/echo?user_content_key=..."
                />
                <p className="mt-2 text-[12px] text-ink-muted">
                  Publish your Apps Script as a web app and paste its URL here. The endpoint must return a valid JSON array.
                </p>
              </div>

              {connected && (
                <div className="flex flex-col gap-3 rounded-xl border border-base-border/60 bg-base-raised/30 p-5">
                  <div>
                    <span className="text-[14px] font-semibold text-ink">Column Mapping</span>
                    <p className="text-[12.5px] text-ink-muted mt-1">Map your sheet headers to the internal order fields to ensure accurate data sync.</p>
                  </div>
                  <GoogleSheetColumnMapping />
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center gap-3 px-7 py-5 border-t border-base-border/60 bg-base-raised/20">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="flex-1 rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Settings2 size={14} /> Save Connection</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default GoogleSheetIntegrationCard;
