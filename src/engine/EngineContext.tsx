import { createContext, useContext, type MutableRefObject } from "react";
import type { VoxelEngine } from "./VoxelEngine";

/** Shares the live VoxelEngine instance with UI components (menus, panels). */
export const EngineContext = createContext<MutableRefObject<VoxelEngine | null> | null>(
  null,
);

/** Returns the engine ref; read `.current` inside event handlers. */
export function useEngineRef(): MutableRefObject<VoxelEngine | null> {
  const ref = useContext(EngineContext);
  if (!ref) throw new Error("useEngineRef must be used within EngineContext");
  return ref;
}
