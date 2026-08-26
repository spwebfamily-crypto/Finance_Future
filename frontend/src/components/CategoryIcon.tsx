import {
  Baby,
  Banknote,
  CarFront,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Luggage,
  PawPrint,
  PartyPopper,
  ShoppingBag,
  Sparkles,
  Tag,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export interface CategoryIconOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { value: "utensils", label: "Alimentação", icon: Utensils },
  { value: "car", label: "Transportes", icon: CarFront },
  { value: "house", label: "Casa", icon: House },
  { value: "heart-pulse", label: "Saúde", icon: HeartPulse },
  { value: "party-popper", label: "Lazer", icon: PartyPopper },
  { value: "shopping-bag", label: "Compras", icon: ShoppingBag },
  { value: "sparkles", label: "Outros", icon: Sparkles },
  { value: "banknote", label: "Finanças", icon: Banknote },
  { value: "graduation-cap", label: "Educação", icon: GraduationCap },
  { value: "luggage", label: "Viagens", icon: Luggage },
  { value: "dumbbell", label: "Desporto", icon: Dumbbell },
  { value: "paw-print", label: "Animais", icon: PawPrint },
  { value: "baby", label: "Família", icon: Baby },
  { value: "gift", label: "Presentes", icon: Gift },
];

const iconByName = new Map(CATEGORY_ICON_OPTIONS.map((option) => [option.value, option.icon]));

function fallbackIconForCategory(categoryName = "") {
  const name = categoryName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (name.includes("aliment")) return "utensils";
  if (name.includes("transport")) return "car";
  if (name.includes("casa")) return "house";
  if (name.includes("saud")) return "heart-pulse";
  if (name.includes("lazer")) return "party-popper";
  if (name.includes("compr")) return "shopping-bag";
  return "sparkles";
}

export function categoryIconName(icon: string | null | undefined, categoryName = "") {
  return icon && iconByName.has(icon) ? icon : fallbackIconForCategory(categoryName);
}

export function CategoryIcon({
  icon,
  categoryName,
  size = 18,
  strokeWidth = 1.8,
  className,
}: {
  icon?: string | null;
  categoryName?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = iconByName.get(categoryIconName(icon, categoryName)) || Tag;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}
