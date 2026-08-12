import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { PlatformLoading } from "./PlatformLoading";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return <PlatformLoading />;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.is_active === false) return <Navigate to="/disabled" replace />;
  return <>{children}</>;
}
