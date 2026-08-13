import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Box, Activity, User, Bell, Menu } from "lucide-react";
import { openMobileDrawer } from "./Sidebar";
import { useAuth } from "../hooks/useAuth";

export function MobileBottomNav() {
    const location = useLocation();

    const navItems = [
        { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
        { name: "Orders", path: "/orders", icon: ShoppingCart },
        { name: "Products", path: "/products-inventory", icon: Box },
        { name: "Delivering", path: "/delivering", icon: Activity },
    ];

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] border-t border-base-border bg-base-surface/80 backdrop-blur-md pb-safe">
            <div className="flex h-16 items-center justify-around px-2">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path ||
                        (item.path !== "/" && location.pathname.startsWith(item.path));

                    return (
                        <Link
                            key={item.name}
                            to={item.path}
                            className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors
                ${isActive ? "text-brand" : "text-ink-muted hover:text-ink"}
              `}
                        >
                            <item.icon size={22} className={isActive ? "fill-brand/10" : ""} />
                            <span className="text-[10px] font-medium leading-none">{item.name}</span>
                        </Link>
                    );
                })}
                <button
                    onClick={openMobileDrawer}
                    className="flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors text-ink-muted hover:text-ink"
                >
                    <Menu size={22} />
                    <span className="text-[10px] font-medium leading-none">Menu</span>
                </button>
            </div>
        </nav>
    );
}
