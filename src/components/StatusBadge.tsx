import { memo } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  getStatusBadgeClasses,
  getStatusIcon,
  type CanonicalStatus,
  type StatusLanguage
} from "../lib/statusEngine";
import { CheckCircle2, Clock, Phone, Calendar, XCircle, Ban, Copy, UserX, Truck, Package, Edit, CreditCard, Navigation, Map, FileCheck, PhoneOff, PhoneMissed, Voicemail, Circle, ArrowLeft } from "lucide-react";

interface StatusBadgeProps {
  status: CanonicalStatus | string;
  language?: StatusLanguage;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ICONS: Record<string, any> = {
  'clock': Clock,
  'check-circle': CheckCircle2,
  'phone-off': PhoneOff,
  'phone-missed': PhoneMissed,
  'voicemail': Voicemail,
  'phone': Phone,
  'calendar': Calendar,
  'map-pin': Map,
  'x-circle': XCircle,
  'ban': Ban,
  'copy': Copy,
  'user-x': UserX,
  'truck': Truck,
  'package-check': Package,
  'arrow-return': ArrowLeft,
  'x': XCircle,
  'edit': Edit,
  'credit-card': CreditCard,
  'package': Package,
  'file-text': Edit,
  'check': CheckCircle2,
  'navigation': Navigation,
  'map': Map,
  'file-check': FileCheck,
  'circle': Circle,
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-[12px]",
  lg: "px-3 py-1.5 text-[13px]",
};

const ICON_SIZES = {
  sm: 11,
  md: 13,
  lg: 15,
};

export const StatusBadge = memo(function StatusBadge({
  status,
  language: propLanguage,
  showIcon = true,
  size = "md",
  className = ""
}: StatusBadgeProps) {
  const { workspace } = useAuth();

  // If status is null/undefined/empty we must NOT coerce it to a default
  // Display exactly what exists in the database
  if (status === null || status === undefined || String(status).trim() === "") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface px-2 py-0.5 text-[11px] text-ink-muted whitespace-nowrap ${className}`}>
        —
      </span>
    );
  }

  // Display the raw status value from the database - NO normalization, NO translation
  const rawStatus = String(status).trim();

  // Determine language from workspace setting or prop (not used for display, only for color mapping if needed)
  const language: StatusLanguage = propLanguage ||
    (workspace?.status_language as StatusLanguage) ||
    'en';

  // Get color classes based on the raw status value
  // Try to get classes for the exact status first, then fallback to canonical mapping
  let colorClasses = getStatusBadgeClasses(rawStatus as CanonicalStatus);
  let iconName = getStatusIcon(rawStatus as CanonicalStatus);

  // If no color mapping found for exact status, try to infer from status text
  if (!colorClasses || colorClasses === "") {
    const lowerStatus = rawStatus.toLowerCase();
    if (lowerStatus.includes('delivered') || lowerStatus.includes('livre') || lowerStatus.includes('livré')) {
      colorClasses = "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
      iconName = 'check-circle';
    } else if (lowerStatus.includes('pending') || lowerStatus.includes('attente') || lowerStatus.includes('en attente')) {
      colorClasses = "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400";
      iconName = 'clock';
    } else if (lowerStatus.includes('transit') || lowerStatus.includes('en route') || lowerStatus.includes('shipping') || lowerStatus.includes('expédié')) {
      colorClasses = "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
      iconName = 'truck';
    } else if (lowerStatus.includes('cancel') || lowerStatus.includes('refus') || lowerStatus.includes('refused')) {
      colorClasses = "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
      iconName = 'x-circle';
    } else if (lowerStatus.includes('return') || lowerStatus.includes('retour')) {
      colorClasses = "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
      iconName = 'arrow-return';
    } else {
      // Default gray for unknown statuses
      colorClasses = "border-gray-500/30 bg-gray-500/10 text-gray-600 dark:text-gray-400";
      iconName = 'circle';
    }
  }

  const sizeClasses = SIZE_CLASSES[size];
  const IconComponent = ICONS[iconName] || Circle;
  const iconSize = ICON_SIZES[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${colorClasses} ${sizeClasses} ${className}`}
    >
      {showIcon && <IconComponent size={iconSize} />}
      {rawStatus}
    </span>
  );
});
