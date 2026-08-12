import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { lazy, Suspense, Component, type ErrorInfo, type ReactNode } from "react";
import { AuthProvider } from "./hooks/useAuth";
import { WorkspaceScopeProvider } from "./contexts/WorkspaceScopeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { PermissionGuard } from "./components/PermissionGuard";
import { FounderRoute } from "./components/FounderRoute";
import { AdminProLayout } from "./components/AdminProLayout";

import Login from "./pages/Login";
import DemoDashboard from "./pages/DemoDashboard";
import OAuthCallback from "./pages/OAuthCallback";
import Disabled from "./pages/Disabled";
import AccessDenied from "./pages/AccessDenied";
import { OrdersProvider } from "./contexts/OrdersContext";
const EcomOSLanding = lazy(() => import("./pages/ecomos_landing_2.jsx"));

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const Delivering = lazy(() => import("./pages/Delivering"));
const Shipping = lazy(() => import("./pages/Shipping"));
const Customers = lazy(() => import("./pages/Customers"));
const ProductsAndInventory = lazy(() => import("./pages/ProductsAndInventory"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const AdsManager = lazy(() => import("./pages/AdsManager"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Finance = lazy(() => import("./pages/Finance"));
const CodScenarios = lazy(() => import("./pages/CodScenarios"));
const Team = lazy(() => import("./pages/Team"));
const Settings = lazy(() => import("./pages/Settings"));
const Amine = lazy(() => import("./pages/AmineTools"));

const AdminPro = lazy(() => import("./pages/admin/AdminPro"));
const PublicLandingPage = lazy(() => import("./pages/public/LandingPage"));

function LoadablePage({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary fallback={<PageSpinner />}>
      <Suspense fallback={<PageSpinner />}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  );
}

class RouteErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[App] Route render failed", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function PageSpinner() {
  return (
    <div className="flex h-32 w-full items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-brand-accent border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceScopeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LoadablePage><EcomOSLanding /></LoadablePage>} />
            <Route path="/login" element={<Login />} />
            <Route path="/demo-dashboard" element={<DemoDashboard />} />
            <Route path="/disabled" element={<Disabled />} />
            <Route path="/403" element={<AccessDenied />} />
            <Route path="/landing-page/:id" element={<LoadablePage><PublicLandingPage /></LoadablePage>} />

            {/* OAuth redirect landing pages — must match GOOGLE_REDIRECT_URI / YOUCAN_REDIRECT_URI exactly (path only; host changes per environment). */}
            <Route path="/api/google/callback" element={<OAuthCallback provider="google" />} />
            <Route path="/api/youcan/callback" element={<OAuthCallback provider="youcan" />} />

            <Route
              element={
                <ProtectedRoute>
                  <OrdersProvider>
                    <Layout />
                  </OrdersProvider>
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<LoadablePage><PermissionGuard permission="dashboard"><Dashboard /></PermissionGuard></LoadablePage>} />
              <Route path="/orders" element={<LoadablePage><PermissionGuard permission="orders"><Orders /></PermissionGuard></LoadablePage>} />
              <Route path="/confirmation" element={<LoadablePage><PermissionGuard permission="confirmation"><Confirmation /></PermissionGuard></LoadablePage>} />
              <Route path="/delivering" element={<LoadablePage><PermissionGuard permission="shipping"><Delivering /></PermissionGuard></LoadablePage>} />
              <Route path="/shipping" element={<LoadablePage><PermissionGuard permission="shipping"><Shipping /></PermissionGuard></LoadablePage>} />
              <Route path="/customers" element={<LoadablePage><PermissionGuard permission="customers"><Customers /></PermissionGuard></LoadablePage>} />
              <Route path="/products-inventory" element={<LoadablePage><PermissionGuard permission="products"><ProductsAndInventory /></PermissionGuard></LoadablePage>} />
              <Route path="/products-inventory/:id" element={<LoadablePage><PermissionGuard permission="products"><ProductDetails /></PermissionGuard></LoadablePage>} />
              <Route path="/ads-manager" element={<LoadablePage><PermissionGuard permission="ads"><AdsManager /></PermissionGuard></LoadablePage>} />
              <Route path="/expenses" element={<LoadablePage><PermissionGuard permission="expenses"><Expenses /></PermissionGuard></LoadablePage>} />
              <Route path="/finance" element={<LoadablePage><PermissionGuard permission="expenses"><Finance /></PermissionGuard></LoadablePage>} />
              <Route path="/cod-scenarios" element={<LoadablePage><PermissionGuard permission="codscenarios"><CodScenarios /></PermissionGuard></LoadablePage>} />
              <Route path="/team" element={<LoadablePage><PermissionGuard permission="team"><Team /></PermissionGuard></LoadablePage>} />
              <Route path="/settings" element={<LoadablePage><PermissionGuard permission="settings"><Settings /></PermissionGuard></LoadablePage>} />
              <Route path="/tools" element={<LoadablePage><Amine /></LoadablePage>} />
              <Route path="/amine" element={<LoadablePage><Amine /></LoadablePage>} />
              {/* Preserve legacy bookmarks without exposing a monetization screen. */}
              <Route path="/premium-dashboard" element={<Navigate to="/dashboard" replace />} />
            </Route>

            <Route element={<FounderRoute><AdminProLayout /></FounderRoute>}>
              <Route path="/admin" element={<LoadablePage><AdminPro /></LoadablePage>} />
              <Route path="/admin/*" element={<LoadablePage><AdminPro /></LoadablePage>} />
            </Route>

            {/* Permanent compatibility redirect: the old Super Admin surface has been retired. */}
            <Route path="/super-admin/*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </AuthProvider>
      </WorkspaceScopeProvider>
    </BrowserRouter>
  );
}
