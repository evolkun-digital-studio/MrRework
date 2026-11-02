import {
  Package, FolderTree, Users, ShoppingBag, Star, Newspaper, FileText, Image as ImageIcon,
  Download, HelpCircle, type LucideIcon,
} from "lucide-react";

// The registry (src/lib/import-export/registry.ts) stores icon choices as
// plain strings (server code shouldn't import client icon components) — this
// is the one place those strings get resolved back to real components.
const ICONS: Record<string, LucideIcon> = {
  Package, FolderTree, Users, ShoppingBag, Star, Newspaper, FileText, Image: ImageIcon, Download,
};

export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? HelpCircle;
}
