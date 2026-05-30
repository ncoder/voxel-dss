import { useEffect, useRef, type MutableRefObject } from "react";
import { VoxelEngine } from "../engine/VoxelEngine";

interface Props {
  engineRef: MutableRefObject<VoxelEngine | null>;
}

export function Viewport({ engineRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new VoxelEngine(containerRef.current);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [engineRef]);

  return <div className="viewport" ref={containerRef} />;
}
