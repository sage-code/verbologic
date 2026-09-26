// useMobileSidebar — shared open/close state for the roadmap topic sidebar's
// mobile drawer, plus whether the current page even has one. AppHeader reads
// both to show/hide and drive its hamburger button; RoadmapShell owns them.
export function useMobileSidebar() {
  const open = useState<boolean>('roadmap-mobile-sidebar-open', () => false)
  const available = useState<boolean>('roadmap-mobile-sidebar-available', () => false)
  return { open, available }
}
