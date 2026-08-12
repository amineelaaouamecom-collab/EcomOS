import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCw, Save, X } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { disconnectForceLog, getForceLogStatus, saveForceLogKey, testForceLogConnection, type ForceLogStatus } from "../../../services/forcelogService";

const EMPTY_STATUS: ForceLogStatus = { connected: false, key_last4: null, last_tested_at: null, last_test_status: null };

export default function ForceLogShippingIntegrationCard() {
  const { workspace } = useAuth();
  const [status, setStatus] = useState<ForceLogStatus>(EMPTY_STATUS);
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);

  const loadStatus = async () => {
    if (!workspace?.id) return;
    try { setStatus(await getForceLogStatus(workspace.id)); }
    catch (error: any) { setMessage({ success: false, text: error.message || "Could not load ForceLog status." }); }
  };

  useEffect(() => { void loadStatus(); }, [workspace?.id]);

  const save = async () => {
    if (!workspace?.id || !apiKey.trim()) return;
    setLoading(true); setMessage(null);
    try {
      const result = await saveForceLogKey(workspace.id, apiKey.trim());
      setStatus(previous => ({ ...previous, connected: result.connected, key_last4: result.key_last4 }));
      setApiKey("");
      setMessage({ success: true, text: "API key saved securely." });
    } catch (error: any) { setMessage({ success: false, text: error.message || "Could not save ForceLog." }); }
    finally { setLoading(false); }
  };

  const test = async () => {
    if (!workspace?.id) return;
    setTesting(true); setMessage(null);
    try {
      const result = await testForceLogConnection(workspace.id);
      setMessage({ success: true, text: result.message || "Connected successfully." });
      await loadStatus();
    } catch (error: any) { setMessage({ success: false, text: error.message || "Connection test failed." }); }
    finally { setTesting(false); }
  };

  const disconnect = async () => {
    if (!workspace?.id || !confirm("Disconnect ForceLog? Existing tracking data will be kept.")) return;
    setLoading(true); setMessage(null);
    try { await disconnectForceLog(workspace.id); setStatus(EMPTY_STATUS); setApiKey(""); setMessage({ success: true, text: "ForceLog disconnected." }); }
    catch (error: any) { setMessage({ success: false, text: error.message || "Could not disconnect ForceLog." }); }
    finally { setLoading(false); }
  };

  return <>
    <div className="group flex flex-col justify-between rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm transition-all duration-150 hover:scale-[1.02] hover:shadow-md">
      <div>
        <div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-base-border/50 bg-brand/10">
          <img src={getIntegrationLogo("forcelog") || ""} alt="ForceLog" className="h-full w-full object-contain" />
        </div>
        <h3 className="text-[16px] font-semibold tracking-tight text-ink">ForceLog Shipping</h3>
        <div className="mt-2">{status.connected ? <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-emerald-600"><CheckCircle2 size={11} /> Connected</span> : <span className="inline-flex h-[22px] items-center rounded-full bg-base-raised px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Not connected</span>}</div>
        <p className="mt-3 min-h-[40px] text-[13px] leading-relaxed text-ink-muted">Morocco delivery integration with secure parcel creation and tracking.</p>
        {status.connected && <p className="mt-2 text-[11px] text-ink-faint">API key configured ••••{status.key_last4}</p>}
      </div>
      <div className="mt-4 flex gap-2 border-t border-base-border/60 pt-4">
        <button onClick={() => { setOpen(true); setApiKey(""); setMessage(null); }} className="flex-1 rounded-xl border border-brand/20 bg-brand/5 py-2 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white">{status.connected ? "Manage" : "Connect"}</button>
        {status.connected && <button onClick={test} disabled={testing} className="rounded-xl bg-base-raised px-3 text-ink hover:bg-base-border disabled:opacity-60" title="Test connection">{testing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>}
      </div>
    </div>
    {open && <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={() => !loading && setOpen(false)}><div className="absolute inset-0 bg-black/50 backdrop-blur-sm" /><div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-base-border bg-base-surface shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center gap-4 border-b border-base-border/60 bg-base-raised/30 px-7 py-6"><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-brand/10"><img src={getIntegrationLogo("forcelog") || ""} alt="ForceLog" className="h-full w-full object-contain" /></div><div className="flex-1"><h2 className="text-[18px] font-bold text-ink">ForceLog Shipping</h2><p className="text-[13px] text-ink-muted">Your key is encrypted server-side and is never shown again.</p></div><button onClick={() => setOpen(false)} disabled={loading} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink"><X size={16} /></button></div><div className="space-y-4 px-7 py-6"><div><label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><KeyRound size={13} className="text-brand" /> {status.connected ? "Replace API key" : "ForceLog API key"}</label><input type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status.connected ? "Enter a new key only to replace the existing one" : "Enter your ForceLog API key"} className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink outline-none focus:border-brand/50" /></div>{message && <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] ${message.success ? "bg-emerald-500/10 text-emerald-600" : "bg-danger/10 text-danger"}`}>{message.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{message.text}</div>}<button onClick={test} disabled={testing || !status.connected} className="flex w-full items-center justify-center gap-2 rounded-xl border border-base-border bg-base-raised py-3 text-[13px] font-semibold text-ink hover:bg-base-border disabled:opacity-60">{testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Test connection</button></div><div className="flex gap-3 border-t border-base-border/60 bg-base-raised/20 px-7 py-5">{status.connected && <button onClick={disconnect} disabled={loading} className="rounded-xl bg-danger/10 px-4 text-[13px] font-semibold text-danger hover:bg-danger hover:text-white">Disconnect</button>}<button onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border">Cancel</button><button onClick={save} disabled={loading || !apiKey.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-60">{loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save</button></div></div></div>}
  </>;
}
