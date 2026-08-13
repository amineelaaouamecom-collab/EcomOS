import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { PlatformLoading } from "./PlatformLoading";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PlatformLoading />;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.is_active === false) return <Navigate to="/disabled" replace />;
  
  // Redirect to dashboard if user is on login or home page after authentication
  // This handles the case where user is already authenticated but lands on login/home
  if ((location.pathname === "/" || location.pathname === "/login") && session && profile) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}
