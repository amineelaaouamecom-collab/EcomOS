import { useEffect, useState, useRef } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { EnhancedHeader } from "./EnhancedHeader";
import { ToastContainer, toast } from "./Toast";
import { AdminPreviewBanner } from "./AdminPreviewBanner";
import { SupportTicketLauncher } from "./SupportTicketLauncher";
import { AnnouncementTray } from "./AnnouncementTray";
import { ActivityTracker } from "./ActivityTracker";
import { PageContent } from "./PageContent";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { supabase } from "../lib/supabase";
import { RefreshCw } from "lucide-react";

let lastPlayTime = 0;

function PullToRefresh({ children }: { children: React.ReactNode }) {
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    // Only enable on mobile viewports (approx)
    if (window.innerWidth > 768) return;

    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current !== null && el.scrollTop <= 0) {
        const y = e.touches[0].clientY;
        const delta = Math.max(0, y - startY.current);
        if (delta > 0) {
          // Adding exponential resistance to the pull
          const progress = Math.min(delta * 0.4, 80);
          setPullProgress(progress);
        }
      }
    };

    const onTouchEnd = () => {
      if (pullProgress >= 60 && !isRefreshing) {
        setIsRefreshing(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(20);
        }
        // Keep the application shell, route and scroll position intact. The
        // affected data stores already listen for this targeted refresh event.
        window.dispatchEvent(new Event("trigger-order-reload"));
        setPullProgress(0);
        setIsRefreshing(false);
      } else {
        setPullProgress(0);
      }
      startY.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [pullProgress, isRefreshing]);

  return (
    <div ref={containerRef} className="relative h-full min-h-0 w-full overflow-y-auto overscroll-contain">
      <div
        className="absolute top-0 left-0 w-full flex justify-center items-end pb-3 overflow-hidden transition-all duration-100 ease-out z-50 pointer-events-none"
        style={{ height: pullProgress > 0 ? pullProgress + 20 : 0, opacity: pullProgress / 80 }}
      >
        <div className={`p-2 bg-base-surface/80 backdrop-blur-md border border-base-border rounded-full shadow-lg text-ink ${isRefreshing ? 'animate-spin text-brand' : ''}`}>
          <RefreshCw size={16} className={isRefreshing ? "" : "transform rotate-180"} style={{ transform: isRefreshing ? '' : `rotate(${pullProgress * 3}deg)` }} />
        </div>
      </div>
      <div className="min-h-full w-full transition-transform duration-100 ease-out" style={{ transform: `translateY(${pullProgress}px)` }}>
        {children}
      </div>
    </div>
  );
}

export function Layout() {
  // Global haptic feedback
  useEffect(() => {
    const handleHaptic = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const isClickable = target.closest('button') || target.closest('a') || window.getComputedStyle(target).cursor === 'pointer';
      if (isClickable && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    };
    document.addEventListener("click", handleHaptic, { capture: true, passive: true });
    return () => document.removeEventListener("click", handleHaptic, { capture: true });
  }, []);

  // Request desktop notification permission once on app load
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        // Ignore if permission cannot be requested
      });
    }
  }, []);

  // Listen for new-order events and show in-app toast + desktop notification
  useEffect(() => {
    const handler = (e: Event) => {
      const { msg } = (e as CustomEvent).detail;
      toast.success(`📦 ${msg}`, 6000);

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification("New order synced", {
                body: msg,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                vibrate: [200, 100, 200],
                silent: false,
              } as any);
            }).catch(() => {
              new Notification("New order synced", { body: msg, silent: false });
            });
          } else {
            new Notification("New order synced", { body: msg, silent: false });
          }
        } catch (err) {
          console.warn("Unable to show desktop/mobile notification:", err);
        }
      }

      // Play notification sound exactly playCount times sequentially (delay of 900ms between each)
      const count = typeof (e as CustomEvent).detail.playCount === "number" ? (e as CustomEvent).detail.playCount : 1;
      let remaining = count;

      const playNext = () => {
        try {
          const audio = new Audio("/audio_2026-07-12.mp3");
          audio.play().catch((err) => {
            console.warn("Audio play blocked by browser autoplay policy:", err);
          });
        } catch (err) {
          console.error("Failed to play audio:", err);
        }
        remaining--;
        if (remaining > 0) {
          setTimeout(playNext, 900);
        }
      };

      if (count > 0) {
        playNext();
      }
    };
    window.addEventListener("new-orders-toast", handler);
    return () => window.removeEventListener("new-orders-toast", handler);
  }, []);



  // Global Auto Sync timer (every 500ms) - works across all pages
  const { workspace } = useAuth();
  const { setAccent } = useTheme();

  useEffect(() => {
    if (!workspace?.id) return;

    const storedAccent = localStorage.getItem(`ecom-scale-accent:${workspace.id}`);
    if (storedAccent && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(storedAccent)) {
      setAccent(storedAccent);
    }
  }, [workspace?.id, setAccent]);

  // ── Background Meta Sync on Dashboard date change ──────────────────────────
  // Listens for the dashboard-date-changed event (already dispatched by Dashboard.tsx),
  // debounces 400ms, calls the meta-sync Edge Function with the new date range,
  // then dispatches meta-sync-complete so useDashboardData reloads automatically.
  const syncAbortRef = useRef<{ cancelled: boolean } | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { from, to, rangeType } = (e as CustomEvent<{ from: string; to: string; rangeType: string }>).detail;

      // Debounce: cancel pending timer and stale in-flight request
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
      if (syncAbortRef.current) syncAbortRef.current.cancelled = true;

      syncDebounceRef.current = setTimeout(async () => {
        const token = { cancelled: false };
        syncAbortRef.current = token;

        // Build the same payload that AdsManager's handleSync uses
        const rangeMap: Record<string, string> = {
          today: "today", "7d": "last_7d", "14d": "last_14d", "30d": "last_30d",
        };
        const datePreset = rangeMap[rangeType] ?? "custom";
        const payload: Record<string, unknown> = { date_preset: datePreset };

        if (datePreset === "custom") {
          if (!from || !to) return; // can't sync without both dates
          payload.time_range = { since: from, until: to };
        }

        try {
          const { data, error: fnErr } = await supabase.functions.invoke("meta-sync", { body: payload });
          if (token.cancelled) return; // response arrived after a newer request started

          if (fnErr) {
            console.error("[Layout] Meta sync function error:", fnErr);
            throw new Error(fnErr.message);
          }

          // Handle structured error responses from the improved Edge Function
          if (data && typeof data === "object") {
            if (!data.success && data.stage) {
              // Structured error response
              let errorMessage = "Meta sync failed";
              
              switch (data.stage) {
                case "authentication":
                  errorMessage = `Authentication failed: ${data.reason}`;
                  break;
                case "authorization":
                  errorMessage = `Authorization failed: ${data.reason}`;
                  break;
                case "environment":
                  errorMessage = `Server configuration error: ${data.reason}`;
                  break;
                case "database":
                  errorMessage = `Database error: ${data.reason}`;
                  break;
                case "configuration":
                  errorMessage = `Meta configuration: ${data.reason}`;
                  break;
                case "meta_api":
                  errorMessage = `Meta API error: ${data.reason}`;
                  break;
                default:
                  errorMessage = data.details || data.reason || "Unknown error";
              }

              console.error("[Layout] Meta sync structured error:", data);
              toast.error(errorMessage, 6000);
              return;
            }

            if (data.token_expired) {
              toast.error("Meta token expired — please reconnect in Meta Business Suite.", 7000);
              return;
            }

            if (data.error) {
              toast.error(`Meta auto-sync: ${data.error}`, 5000);
              return;
            }
          }

          // Signal useDashboardData (and AdsManager if mounted) to reload
          // Include currency in the event detail when available so Dashboard can format spend consistently
          const detail = data && typeof data === "object" && "currency" in data ? { currency: data.currency } : undefined;
          // Persist into a session-global variable so other components can read before an event listener runs
          try {
            if (detail && detail.currency) {
              (window as any).__meta_account_currency = detail.currency;
            }
          } catch (e) {
            // ignore
          }
          window.dispatchEvent(new CustomEvent("meta-sync-complete", { detail }));
        } catch (err: any) {
          if (token.cancelled) return;
          // Silent fail on network errors — keep existing data, do not crash
          console.warn("[Layout] Background Meta sync failed:", err?.message);
          // Only show toast for non-abort errors
          if (!String(err?.message).includes("AbortError")) {
            toast.error(`Ad Spend sync failed: ${err?.message ?? "unknown error"}`, 4000);
          }
        }
      }, 400);
    };

    window.addEventListener("dashboard-date-changed", handler);
    return () => {
      window.removeEventListener("dashboard-date-changed", handler);
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
      if (syncAbortRef.current) syncAbortRef.current.cancelled = true;
    };
  }, []); // no deps — handler reads only from the event payload
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!workspace?.id) return;

    let isExecuting = false;
    let lastSyncTime = Date.now();
    let wasHidden = false;
    let pauseUntil = 0;
    const SYNC_POLL_MS = 30_000;

    const performSync = async (skipVisibilityCheck = false) => {
      if (isExecuting) return;
      if (!skipVisibilityCheck && typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const isActive = Boolean(workspace.google_sheet_autosync);
      const urlToUse = workspace.google_sheet_url;
      if (!isActive || !urlToUse || Date.now() < pauseUntil) return;

      // Prevent immediate sync on tab return - only sync if at least 15 seconds have passed since last sync
      const timeSinceLastSync = Date.now() - lastSyncTime;
      if (wasHidden && timeSinceLastSync < 15000) {
        wasHidden = false;
        return;
      }
      wasHidden = false;

      isExecuting = true;
      lastSyncTime = Date.now();
      try {
        // dynamically import so we don't cause circular dependencies
        const { runGoogleSheetSync } = await import("../pages/Orders");
        const { inserted } = await runGoogleSheetSync(workspace.id, urlToUse);
        if (inserted > 0) {
          window.dispatchEvent(new Event("trigger-order-reload"));
          window.dispatchEvent(
            new CustomEvent("new-orders-toast", {
              detail: {
                msg: `Auto-sync: Synced ${inserted} new order${inserted !== 1 ? "s" : ""} from Google Sheet!`,
                playCount: inserted
              }
            })
          );
        }
      } catch (err: any) {
        // Quietly fail background sync errors
      } finally {
        isExecuting = false;
      }
    };

    // Track visibility changes to detect tab returns
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
      } else {
        // Returning to the tab must not immediately trigger an import, query
        // cascade or page-wide loading state. Realtime remains responsible for
        // already-published changes; the next controlled poll is deferred.
        wasHidden = false;
        lastSyncTime = Date.now();
        pauseUntil = Date.now() + SYNC_POLL_MS;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // A deliberate, controlled first sync is still allowed for an enabled
    // integration, but it does not use a synthetic fallback URL.
    void performSync(true);
    const interval = setInterval(() => performSync(), SYNC_POLL_MS);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [workspace?.id, workspace?.google_sheet_url, workspace?.google_sheet_autosync]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-base-surface text-text-main">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-base-surface">
        <ActivityTracker />
        <EnhancedHeader />
        <AdminPreviewBanner />
        <AnnouncementTray />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-base-surface">
          <div className="h-full w-full md:hidden">
            <PullToRefresh>
              <PageContent className="h-full min-h-full">
                <Outlet />
              </PageContent>
            </PullToRefresh>
          </div>
          <div className="hidden h-full w-full overflow-y-auto overscroll-contain md:block">
            <PageContent className="h-full min-h-full">
              <Outlet />
            </PageContent>
          </div>
        </main>
      </div>
      {/* Global toast notifications — mounted once here, used from anywhere */}
      <SupportTicketLauncher />
      <ToastContainer />
    </div>
  );
}
