import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isOwnerLikeRole } from "../lib/rbac";
import type { TeamPermissions } from "../lib/types";

interface PermissionGuardProps {
  children: ReactNode;
  permission: keyof TeamPermissions;
}

export function PermissionGuard({ children, permission }: PermissionGuardProps) {
  const { profile, teamPermissions: permissions, permissionsLoading: loading, defaultRoute, workspace } = useAuth();
  const location = useLocation();

  // Owners and supervisors have access to everything
  if (isOwnerLikeRole(profile?.role)) {
    return <>{children}</>;
  }

  if (loading) {
    return null;
  }

  // If shipping module is disabled for this workspace, deny access only to the Shipping page
  if (permission === "shipping" && workspace?.shipping_enabled === false) {
    if (location.pathname.startsWith("/shipping")) {
      return <Navigate to="/dashboard" replace />;
    }
    // allow other routes that reuse the 'shipping' permission (eg. /delivering)
  }

  if (!permissions[permission]) {
    if (defaultRoute) {
      return <Navigate to={defaultRoute} replace />;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-base px-4 py-10">
        <div className="w-full max-w-2xl rounded-3xl border border-base-border bg-base-surface p-8 text-center shadow-card">
          <h1 className="text-[22px] font-semibold text-ink mb-3">Access restricted</h1>
          <p className="text-[14px] text-ink-muted">
            Your administrator has not assigned any sections yet.
          </p>
          <div className="mt-6 rounded-2xl border border-amber-200/70 bg-amber-100/60 p-4 text-[13px] text-amber-900">
            Please contact your workspace owner to get started.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
