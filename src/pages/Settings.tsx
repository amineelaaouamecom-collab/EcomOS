import { FormEvent, useState, useEffect } from "react";
import { CheckCircle2, ExternalLink, User, Building2, Lock, Save, X, Loader2, Store, Truck, RefreshCw, Star } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useIntegrations } from "../hooks/useIntegrations";
import { useTheme } from "../hooks/useTheme";
import { googleAuthorizeUrl, youcanAuthorizeUrl } from "../lib/oauth";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { resetWorkspaceData } from "../lib/admin";
import { toast } from "../components/Toast";
import { WorkspaceResetModal, WorkspaceResetProgressModal, WorkspaceResetSuccessModal } from "../components/WorkspaceResetModal";
import { ProfilePictureUploader } from "../components/ProfilePictureUploader";
import OzonShippingIntegrationCard from "./settings/components/OzonShippingIntegrationCard";
import ColiatyShippingIntegrationCard from "./settings/components/ColiatyShippingIntegrationCard";
import ForceLogShippingIntegrationCard from "./settings/components/ForceLogShippingIntegrationCard";
import AmeexShippingIntegrationCard from "./settings/components/AmeexShippingIntegrationCard";
import SenditShippingIntegrationCard from "./settings/components/SenditShippingIntegrationCard";
import GoogleSheetIntegrationCard from "./settings/components/GoogleSheetIntegrationCard";
import MetaIntegrationCard from "./settings/components/MetaIntegrationCard";
import YouCanIntegrationCard from "./settings/components/YouCanIntegrationCard";
import ShopifyIntegrationCard from "./settings/components/ShopifyIntegrationCard";
import { getIntegrationLogo } from "../lib/integrationLogos";
import type { ShippingCarrier } from "../lib/types";

const TABS = ["Profile", "Workspace", "Integrations", "Notifications"] as const;
const ACCENT_PRESETS = ["#DB6A8F", "#00B57F", "#3B82F6", "#F59E0B", "#8B5CF6"];
const WORKSPACE_ACCENT_PREFIX = "ecom-scale-accent:";

function isValidHex(value: string) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

type Tab = (typeof TABS)[number];

export default function Settings() {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const resolvedTab = TABS.find((value) => value.toLowerCase() === requestedTab?.toLowerCase()) ?? "Profile";
  const [tab, setTab] = useState<Tab>(resolvedTab);

  useEffect(() => {
    setTab(resolvedTab);
  }, [resolvedTab]);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your profile, workspace, and integrations." />

      <div className="mb-5 flex flex-wrap gap-2">
        <div className="inline-flex rounded-lg border border-base-border bg-base-surface p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${tab === t ? "bg-base-raised text-ink" : "text-ink-muted hover:text-ink"
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "Profile" && <ProfileTab />}
      {tab === "Workspace" && <WorkspaceTab />}
      {tab === "Integrations" && <IntegrationsTab autoOpenAmeex={searchParams.get("carrier") === "ameex"} initialAmeexCity={searchParams.get("city") ?? ""} />}
      {tab === "Notifications" && (
        <ComingNext title="Notifications" subtitle="SMS and email alerts for new orders. Coming next." />
      )}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { profile, refreshProfile, session, workspace } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);

  // Sync avatar URL with profile changes
  useEffect(() => {
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile?.avatar_url]);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", session!.user.id);
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
      refreshProfile();
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwBusy(false);
    if (error) {
      setPwMsg("Error: " + error.message);
    } else {
      setPwMsg("Password updated successfully.");
      setNewPassword("");
    }
  };

  const handleAvatarChange = (newUrl: string | null) => {
    setAvatarUrl(newUrl);
    refreshProfile(); // Refresh profile to update avatars across the app
  };

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      {/* Profile Picture */}
      <ProfilePictureUploader
        currentAvatarUrl={avatarUrl}
        fullName={profile?.full_name}
        onAvatarChange={handleAvatarChange}
      />
      {/* Profile Info */}
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent/15 text-brand-accent">
            <User size={15} />
          </div>
          <div className="text-[14px] font-semibold text-ink">Profile Information</div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-muted">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-muted">Email</label>
            <input
              type="email"
              value={session?.user?.email ?? ""}
              disabled
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink-muted cursor-not-allowed opacity-60"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 self-start rounded-lg bg-brand-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-brand-accentHover disabled:opacity-60"
          >
            <Save size={13} />
            {saved ? "Saved ✓" : busy ? "Saving…" : "Save Profile"}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-base-raised text-ink-muted">
            <Lock size={15} />
          </div>
          <div className="text-[14px] font-semibold text-ink">Change Password</div>
        </div>

        <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-muted">New Password</label>
            <input
              type="password"
              minLength={6}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 focus:outline-none"
              placeholder="Min 6 characters"
            />
          </div>
          {pwMsg && (
            <div
              className={`rounded-lg px-3 py-2 text-[12.5px] ${pwMsg.startsWith("Error") ? "bg-danger/10 text-danger" : "bg-brand-accent/10 text-brand-accent"
                }`}
            >
              {pwMsg}
            </div>
          )}
          <button
            type="submit"
            disabled={pwBusy}
            className="flex items-center gap-1.5 self-start rounded-lg bg-base-raised border border-base-border px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-base-surface disabled:opacity-60"
          >
            <Lock size={13} />
            {pwBusy ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Workspace Tab ────────────────────────────────────────────────────────────

function WorkspaceTab() {
  const { workspace, refreshProfile, profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(workspace?.name ?? "");
  const [shippingEnabled, setShippingEnabled] = useState<boolean>(workspace?.shipping_enabled ?? true);
  const [showShippingColumn, setShowShippingColumn] = useState<boolean>(workspace?.show_shipping_column ?? false);
  const [carrier, setCarrier] = useState<ShippingCarrier>((workspace?.carrier as ShippingCarrier) ?? "ozon");
  const [statusLanguage, setStatusLanguage] = useState<"en" | "fr">((workspace?.status_language as "en" | "fr") ?? "en");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has permission to edit workspace settings
  const canEditWorkspace = profile && (
    profile.role === "owner" ||
    profile.role === "supervisor" ||
    profile.role === "admin" ||
    profile.role === "founder" ||
    profile.role === "super_admin"
  );

  // Workspace reset state
  const [showResetModal, setShowResetModal] = useState(false);
  const [showResetProgress, setShowResetProgress] = useState(false);
  const [showResetSuccess, setShowResetSuccess] = useState(false);
  const [resetProgress, setResetProgress] = useState(0);
  const [resetStep, setResetStep] = useState("");

  useEffect(() => {
    setName(workspace?.name ?? "");
    setShippingEnabled(workspace?.shipping_enabled ?? true);
    setShowShippingColumn(workspace?.show_shipping_column ?? false);
    setCarrier((workspace?.carrier as ShippingCarrier) ?? "ozon");
    setStatusLanguage((workspace?.status_language as "en" | "fr") ?? "en");
  }, [
    workspace?.id,
    workspace?.name,
    workspace?.shipping_enabled,
    workspace?.show_shipping_column,
    workspace?.carrier,
    workspace?.status_language,
  ]);

  const { accent, setAccent } = useTheme();
  const workspaceAccentKey = workspace?.id ? `${WORKSPACE_ACCENT_PREFIX}${workspace.id}` : ACCENT_PRESETS[0];
  const [selectedAccent, setSelectedAccent] = useState(() => {
    if (workspace?.id && typeof window !== "undefined") {
      const stored = localStorage.getItem(workspaceAccentKey);
      if (stored && isValidHex(stored)) return stored;
    }
    return accent;
  });

  useEffect(() => {
    if (!workspace?.id) {
      setSelectedAccent(accent);
      return;
    }

    if (typeof window === "undefined") return;

    const storedAccent = localStorage.getItem(workspaceAccentKey);
    if (storedAccent && isValidHex(storedAccent)) {
      setSelectedAccent(storedAccent);
      if (storedAccent !== accent) {
        setAccent(storedAccent);
      }
      return;
    }

    setSelectedAccent(accent);
  }, [workspace?.id, accent, setAccent, workspaceAccentKey]);

  const handleAccentChange = (value: string) => {
    setSelectedAccent(value);
    setAccent(value);
    if (workspace?.id) {
      localStorage.setItem(`${WORKSPACE_ACCENT_PREFIX}${workspace.id}`, value);
    }
  };

  const handleWorkspaceReset = async () => {
    if (!workspace || !profile) return;

    setShowResetModal(false);
    setShowResetProgress(true);
    setResetProgress(0);

    const steps = [
      { progress: 0, step: "Initializing..." },
      { progress: 10, step: "Validating permissions..." },
      { progress: 20, step: "Removing orders..." },
      { progress: 30, step: "Removing customers..." },
      { progress: 40, step: "Removing products..." },
      { progress: 50, step: "Removing shipping data..." },
      { progress: 60, step: "Removing integrations..." },
      { progress: 70, step: "Removing Google Sheet configuration..." },
      { progress: 80, step: "Removing workspace settings..." },
      { progress: 90, step: "Final cleanup..." },
      { progress: 100, step: "Workspace reset complete." },
    ];

    let stepIndex = 0;

    const updateProgress = () => {
      if (stepIndex < steps.length) {
        const { progress, step } = steps[stepIndex];
        setResetProgress(progress);
        setResetStep(step);
        stepIndex++;
        setTimeout(updateProgress, progress === 0 ? 500 : 800);
      }
    };

    try {
      updateProgress();

      // Execute the workspace reset
      await resetWorkspaceData(workspace.id, profile.id);

      // Invalidate auth data and refresh
      await refreshProfile();

      // Show success modal
      setShowResetProgress(false);
      setShowResetSuccess(true);

      toast.success("Workspace reset successfully");
    } catch (err: any) {
      console.error("Workspace reset failed:", err);
      setShowResetProgress(false);
      toast.error(err?.message || "Failed to reset workspace");

      // Rollback by refreshing profile
      await refreshProfile();
    }
  };

  const handleNavigateToOrders = () => {
    setShowResetSuccess(false);
    navigate("/orders");
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    if (!canEditWorkspace) {
      setError("Only workspace owners, administrators, supervisors, and founders can change workspace settings.");
      return;
    }
    setBusy(true);
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setBusy(false);
      setError("Workspace name is required.");
      return;
    }

    try {
      const { data, error: updateError } = await supabase
        .from("workspaces")
        .update({ name: trimmedName, shipping_enabled: shippingEnabled, show_shipping_column: showShippingColumn, carrier, status_language: statusLanguage })
        .eq("id", workspace.id)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error("Settings were not saved. You do not have permission to update this workspace.");

      setSaved(true);
      setName(trimmedName);
      await refreshProfile();
      setTimeout(() => setSaved(false), 2500);
    } catch (saveError: any) {
      setError(saveError?.message || "Could not save workspace settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full pb-10">
      <div className="flex flex-col gap-4 border-b border-base-border bg-gradient-to-r from-brand-accent/10 via-base-surface to-base-surface py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-accent text-white shadow-sm">
              <Building2 size={20} />
            </div>
            <div>
              <div className="text-[17px] font-semibold text-ink">Workspace control center</div>
              <div className="mt-1 text-[13px] text-ink-muted">Set your workspace identity, delivery tools, and display preferences.</div>
            </div>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium ${canEditWorkspace ? "border-success/25 bg-success/10 text-success" : "border-base-border bg-base-raised text-ink-muted"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${canEditWorkspace ? "bg-success" : "bg-ink-faint"}`} />
            {canEditWorkspace ? "Editing enabled" : "View only"}
          </div>
        </div>

      <form onSubmit={handleSave} className="space-y-5 py-5 sm:py-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink">Workspace name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEditWorkspace}
                className="w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 text-[13px] text-ink outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink">Workspace ID</label>
              <input
                type="text"
                value={workspace?.id ?? ""}
                disabled
                className="w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 font-mono text-[11px] text-ink-muted opacity-70"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-base-border bg-base-surface p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-accent/15 text-brand-accent">
                <Store size={15} />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-ink">Brand appearance</div>
                <div className="text-[12px] text-ink-muted">Choose the accent used across this workspace. Changes apply instantly.</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleAccentChange(color)}
                  className={`h-10 w-10 rounded-xl border-2 transition-transform hover:scale-105 ${selectedAccent === color ? "border-ink shadow-sm ring-2 ring-brand-accent/20" : "border-transparent"}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Select accent ${color}`}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-3">
                <span className="text-[12px] text-ink-muted">Custom accent</span>
                <input
                  type="color"
                  value={selectedAccent}
                  onChange={(e) => handleAccentChange(e.target.value)}
                  className="h-10 w-16 rounded-lg border border-base-border bg-base-raised p-0"
                />
              </label>
              <div className="text-[12px] text-ink-muted">
                Current color: <span className="font-semibold" style={{ color: selectedAccent }}>{selectedAccent}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-base-border bg-base-surface p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-accent/15 text-brand-accent">
                  <Truck size={17} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-ink">Modules & delivery</div>
                  <div className="text-[12px] text-ink-muted">Turn delivery features on, then choose how orders are processed.</div>
                </div>
              </div>
              <span className="w-fit rounded-full bg-base-raised px-2.5 py-1 text-[11px] font-medium text-ink-muted">Workspace settings</span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="flex min-h-[108px] items-center justify-between gap-4 rounded-xl border border-base-border bg-base-raised/60 p-4">
                <div>
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    Shipping module
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${shippingEnabled ? "bg-success/10 text-success" : "bg-base-border text-ink-muted"}`}>{shippingEnabled ? "Active" : "Off"}</span>
                  </div>
                  <p className="mt-1 max-w-sm text-[12px] leading-5 text-ink-muted">Allow the team to use delivery and carrier workflows in this workspace.</p>
                </div>
                <label className="relative inline-flex flex-none cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={shippingEnabled}
                    onChange={(e) => setShippingEnabled(e.target.checked)}
                    disabled={!canEditWorkspace}
                    className="sr-only"
                    aria-label="Enable shipping module"
                  />
                  <span className={`block h-7 w-12 rounded-full transition-colors ${shippingEnabled ? "bg-brand-accent" : "bg-base-border"} ${!canEditWorkspace ? "cursor-not-allowed opacity-60" : ""}`} />
                  <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${shippingEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </label>
              </div>

              <div className="flex min-h-[108px] items-center justify-between gap-4 rounded-xl border border-base-border bg-base-raised/60 p-4">
                <div>
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    Delivery page & order costs
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${showShippingColumn ? "bg-success/10 text-success" : "bg-base-border text-ink-muted"}`}>{showShippingColumn ? "Shown" : "Hidden"}</span>
                  </div>
                  <p className="mt-1 max-w-sm text-[12px] leading-5 text-ink-muted">Show Shipping in the sidebar and the delivery-cost column on Orders.</p>
                </div>
                <label className="relative inline-flex flex-none cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={showShippingColumn}
                    onChange={(e) => setShowShippingColumn(e.target.checked)}
                    disabled={!canEditWorkspace}
                    className="sr-only"
                    aria-label="Show shipping page and costs"
                  />
                  <span className={`block h-7 w-12 rounded-full transition-colors ${showShippingColumn ? "bg-brand-accent" : "bg-base-border"} ${!canEditWorkspace ? "cursor-not-allowed opacity-60" : ""}`} />
                  <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${showShippingColumn ? "translate-x-5" : "translate-x-0"}`} />
                </label>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-base-border bg-base-raised/60 p-4">
                <div className="text-[13px] font-semibold text-ink">Shipping carrier</div>
                <div className="mt-1 text-[12px] leading-5 text-ink-muted">The provider used for new delivery operations.</div>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value as ShippingCarrier)}
                  disabled={!canEditWorkspace}
                  className="mt-3 w-full rounded-lg border border-base-border bg-base-surface px-3 py-2.5 text-[13px] text-ink outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="ozon">Ozon Express</option>
                  <option value="coliaty">Coliaty</option>
                  <option value="forcelog">ForceLog</option>
                  <option value="ameex">Ameex</option>
                  <option value="sendit">Sendit</option>
                </select>
              </div>

              <div className="rounded-xl border border-base-border bg-base-raised/60 p-4">
                <div className="text-[13px] font-semibold text-ink">Order status language</div>
                <div className="mt-1 text-[12px] leading-5 text-ink-muted">Language used for delivery statuses throughout the workspace.</div>
                <select
                  value={statusLanguage}
                  onChange={(e) => setStatusLanguage(e.target.value as "en" | "fr")}
                  disabled={!canEditWorkspace}
                  className="mt-3 w-full rounded-lg border border-base-border bg-base-surface px-3 py-2.5 text-[13px] text-ink outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>
          )}
          <button
            type="submit"
            disabled={busy || !canEditWorkspace}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-accentHover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <Save size={13} />
            {saved ? "Saved ✓" : busy ? "Saving…" : "Save Workspace"}
          </button>

          <div className="flex flex-col gap-4 rounded-2xl border border-danger/25 bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[13px] font-semibold text-ink">Danger zone</div>
              <div className="mt-1 max-w-2xl text-[12px] leading-5 text-ink-muted">
                Resetting permanently deletes this workspace's data and returns it to a brand-new state. This cannot be undone.
              </div>
            </div>
            <button
              type="button"
              disabled={!workspace || !canEditWorkspace}
              onClick={() => setShowResetModal(true)}
              className="inline-flex flex-none items-center justify-center gap-2 rounded-xl bg-danger px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={13} />
              Reset workspace
            </button>
          </div>
      </form>

        {/* Reset Modals */}
        <WorkspaceResetModal
          isOpen={showResetModal}
          onClose={() => setShowResetModal(false)}
          onConfirm={handleWorkspaceReset}
          workspaceName={workspace?.name}
        />
        <WorkspaceResetProgressModal
          isOpen={showResetProgress}
          progress={resetProgress}
          currentStep={resetStep}
        />
        <WorkspaceResetSuccessModal
          isOpen={showResetSuccess}
          onClose={() => setShowResetSuccess(false)}
          onNavigateToOrders={handleNavigateToOrders}
        />
    </div>
  );
}

// ─── Coming Next placeholder ──────────────────────────────────────────────────

function ComingNext({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-base-raised text-ink-muted">
          <Store size={16} />
        </div>
        <div>
          <div className="text-[13.5px] font-medium text-ink">{title}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

// ─── Shared Imports for New UI ────────────────────────────────────────────────
import { MoreHorizontal } from "lucide-react";

// ─── Integrations Tab ─────────────────────────────────────────────────────────

function IntegrationsTab({ autoOpenAmeex = false, initialAmeexCity = "" }: { autoOpenAmeex?: boolean; initialAmeexCity?: string }) {
  const { statuses, loading, disconnect } = useIntegrations();
  const google = statuses["google"];

  return (
    <div className="flex flex-col w-full h-full pb-10">
      {/* SaaS Marketplace Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-[28px] font-bold tracking-tight text-ink">Integrations</h2>
          <p className="mt-1 text-[14px] text-ink-muted">
            Connect your favorite apps and services to automate your business.
          </p>
        </div>
        <button className="rounded-xl border border-base-border px-4 py-2 text-[13px] font-semibold text-ink shadow-sm transition-all hover:bg-base-raised hover:shadow">
          Need Help?
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Active Native Integrations */}
        <YouCanIntegrationCard />

        <GenericIntegrationCard
          name="Google"
          description="Export reports to Google Sheets and connect Google Ads spend."
          logoSrc={getIntegrationLogo("google")}
          connected={!!google?.connected}
          connectedAt={google?.connected_at}
          loading={loading}
          onConnect={() => (window.location.href = googleAuthorizeUrl())}
          onDisconnect={() => disconnect("google")}
        />

        <OzonShippingIntegrationCard />
        <ColiatyShippingIntegrationCard />
        <ForceLogShippingIntegrationCard />
        <AmeexShippingIntegrationCard autoOpen={autoOpenAmeex} initialCity={initialAmeexCity} />
        <SenditShippingIntegrationCard />
        <GoogleSheetIntegrationCard />
        <MetaIntegrationCard />
        <ShopifyIntegrationCard />

        {/* Local Folder Placeholders */}
        <PlaceholderIntegrationCard name="Livo" description="Shipment tracking and customer satisfaction updates." logoSrc={getIntegrationLogo("livo")} />
        <PlaceholderIntegrationCard name="Digylog" description="Smart supply chain management and automated logistics." logoSrc={getIntegrationLogo("digylog")} />

        {/* Global Placeholders */}
        <PlaceholderIntegrationCard name="Facebook Ads" description="Sync your product catalog and optimize dynamic retargeting campaigns automatically." logoUrl="https://upload.wikimedia.org/wikipedia/commons/b/b8/2021_Facebook_icon.svg" />
        <PlaceholderIntegrationCard name="TikTok Ads" description="Run automated catalog ads for viral e-commerce products and track conversions." logoUrl="https://upload.wikimedia.org/wikipedia/en/a/ad/TikTok_logo.svg" />
      </div>

      <div className="mt-16 flex flex-col items-center justify-center pt-8 border-t border-base-border/50 text-ink-muted">
        <Lock size={20} className="mb-2 text-brand/60" />
        <p className="text-[13px] font-medium">Your data is securely encrypted and all integrations are protected.</p>
      </div>
    </div>
  );
}

// ─── UI Generic Card for Google Integration ───────────────────────────────────

function GenericIntegrationCard({
  name,
  description,
  logoSrc,
  logoUrl,
  connected,
  connectedAt,
  loading,
  onConnect,
  onDisconnect,
}: {
  name: string;
  description: string;
  logoSrc?: string;
  logoUrl?: string;
  connected: boolean;
  connectedAt?: string | null;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150 relative">
      <div className="absolute right-4 top-4">
        <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
      </div>

      <div className="flex flex-col pb-4">
        <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
          {(logoSrc || logoUrl) ? (
            <img src={logoSrc || logoUrl} alt={name} className="h-full w-full object-contain" />
          ) : (
            <Store size={22} className="text-ink-muted" />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">{name}</h3>
          </div>
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
          {description}
        </p>
      </div>

      <div className="mt-auto border-t border-base-border/60 pt-4 flex flex-col gap-2">
        {loading ? (
          <div className="h-9 w-full animate-pulse rounded-xl bg-base-raised" />
        ) : connected ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onDisconnect}
              className="flex-1 rounded-xl bg-base-raised py-2 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors"
            >
              Disconnect
            </button>
            <button className="flex-1 rounded-xl border border-brand/20 bg-brand/5 py-2 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors">
              Manage
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            className="w-full rounded-xl bg-brand py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

// ─── UI Placeholder Card for Coming Soon Integrations ─────────────────────────

function PlaceholderIntegrationCard({
  name,
  description,
  logoSrc,
  logoUrl
}: {
  name: string;
  description: string;
  logoSrc?: string;
  logoUrl?: string;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmitDemand = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate network request
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      toast.success("Demand received successfully!");
    }, 800);
  };

  return (
    <>
      <div className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150 relative">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            {(logoSrc || logoUrl) ? (
              <img src={logoSrc || logoUrl} alt={name} className="h-full w-full object-contain" />
            ) : (
              <Store size={22} className="text-ink-muted" />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">{name}</h3>
            </div>
            <div className="flex items-center">
              <span className="flex h-[22px] items-center rounded-full bg-amber-500/10 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-600">
                Coming Soon
              </span>
            </div>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted min-h-[40px]">
            {description}
          </p>
        </div>

        <div className="mt-auto border-t border-base-border/60 pt-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full rounded-xl border border-brand/20 bg-brand/5 py-2 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
          >
            Demand Integration
          </button>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="relative w-full max-w-md scale-100 animate-in fade-in zoom-in-95 rounded-[24px] border border-base-border bg-base-surface p-7 shadow-xl">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-6 top-6 text-ink-faint hover:text-ink transition-colors bg-base-raised rounded-full p-1"
            >
              <X size={16} />
            </button>
            <div className="mb-6 flex flex-col gap-2">
              <div className="h-12 w-12 rounded-xl bg-brand/10 flex items-center justify-center text-brand mb-2">
                <Star size={24} />
              </div>
              <h2 className="text-[22px] font-bold text-ink">Demand {name}</h2>
              <p className="text-[14px] text-ink-muted">
                Be the first to know when <b>{name}</b> goes live.
              </p>
            </div>

            {isSubmitted ? (
              <div className="rounded-xl bg-emerald-500/10 p-5 text-center flex flex-col items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-emerald-600">You're on the list!</h3>
                  <p className="text-emerald-600/80 text-[13px] mt-1">We will notify you immediately once {name} is available. Thank you!</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitDemand} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">Full Name</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[14px] text-ink focus:border-brand/50 focus:outline-none transition-colors"
                    placeholder="Enter your name"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">Phone Number</label>
                  <input
                    type="tel"
                    required
                    className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[14px] text-ink focus:border-brand/50 focus:outline-none transition-colors"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">Message (Optional)</label>
                  <textarea
                    rows={3}
                    className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-2.5 text-[14px] text-ink focus:border-brand/50 focus:outline-none transition-colors resize-none"
                    placeholder="Why do you need this integration?"
                  />
                </div>

                <div className="rounded-xl bg-brand/5 p-4 border border-brand/10">
                  <p className="text-center text-[13px] font-medium text-brand">
                    🎉 You'll get <span className="font-bold">1 FREE MONTH</span> after the integration is active!
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 w-full rounded-xl bg-brand py-3 text-[14px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                  ) : (
                    "Demand Now"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

