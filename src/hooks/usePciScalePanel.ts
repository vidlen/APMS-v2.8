import { useState } from "react";

interface PciPanelState {
  docked: boolean;
  pos: { x: number; y: number } | null;
}

const STORAGE_KEY = "apms.pciScalePanel";
const DEFAULTS: PciPanelState = { docked: false, pos: null };

function loadState(): PciPanelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveState(state: PciPanelState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Shared floating/docked state for the PCI scale reference panel. Docking
// always drops the dragged position, so floating it back out later starts
// fresh at the default anchor instead of wherever it was last dropped.
export function usePciScalePanel() {
  const [state, setState] = useState<PciPanelState>(loadState);

  const setDocked = (docked: boolean) => {
    setState(() => {
      const next = { docked, pos: null };
      saveState(next);
      return next;
    });
  };

  const setPos = (pos: { x: number; y: number }) => {
    setState((prev) => {
      const next = { ...prev, pos };
      saveState(next);
      return next;
    });
  };

  return { docked: state.docked, pos: state.pos, setDocked, setPos };
}
