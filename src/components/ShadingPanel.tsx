import { useEditorStore } from "../state/editorStore";
import type { NormalField, ShadingMode } from "../voxel/dss";
import type { AoMode } from "../voxel/ao";

const FIELDS: { id: NormalField; label: string }[] = [
  { id: "gradient", label: "Density gradient" },
  { id: "centroid", label: "Occupancy centroid" },
];

const SHADING: { id: ShadingMode; label: string }[] = [
  { id: "cube", label: "Cube faces (classic)" },
  { id: "perVoxel", label: "Per-voxel (DSS)" },
  { id: "vertexInterpolated", label: "Vertex interpolated (DSS)" },
];

const AO_MODES: { id: AoMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "perVoxel", label: "Per-voxel (DSS)" },
  { id: "vertexInterpolated", label: "Vertex interpolated (DSS)" },
];

export function ShadingPanel() {
  const field = useEditorStore((s) => s.field);
  const shading = useEditorStore((s) => s.shading);
  const kernelRadius = useEditorStore((s) => s.kernelRadius);
  const aoMode = useEditorStore((s) => s.aoMode);
  const aoRadius = useEditorStore((s) => s.aoRadius);
  const aoIntensity = useEditorStore((s) => s.aoIntensity);
  const showGrid = useEditorStore((s) => s.showGrid);
  const showEdges = useEditorStore((s) => s.showEdges);
  const lightAutoRotate = useEditorStore((s) => s.lightAutoRotate);

  const setField = useEditorStore((s) => s.setField);
  const setShading = useEditorStore((s) => s.setShading);
  const setKernelRadius = useEditorStore((s) => s.setKernelRadius);
  const setAoMode = useEditorStore((s) => s.setAoMode);
  const setAoRadius = useEditorStore((s) => s.setAoRadius);
  const setAoIntensity = useEditorStore((s) => s.setAoIntensity);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const toggleEdges = useEditorStore((s) => s.toggleEdges);
  const toggleLightAutoRotate = useEditorStore((s) => s.toggleLightAutoRotate);

  const dssActive = shading !== "cube";
  const side = kernelRadius * 2 + 1;
  const aoActive = aoMode !== "off";
  const aoSide = aoRadius * 2 + 1;

  return (
    <section className="panel">
      <h2 className="panel__title">Shading (DSS)</h2>

      <label className="field">
        <span>Shading mode</span>
        <select
          value={shading}
          onChange={(e) => setShading(e.target.value as ShadingMode)}
        >
          {SHADING.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Normal field</span>
        <select
          value={field}
          disabled={!dssActive}
          onChange={(e) => setField(e.target.value as NormalField)}
        >
          {FIELDS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>
          Kernel radius <span className="muted">{kernelRadius} = {side}³</span>
        </span>
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={kernelRadius}
          disabled={!dssActive}
          onChange={(e) => setKernelRadius(Number(e.target.value))}
        />
      </label>

      <h3 className="panel__subtitle">Ambient occlusion</h3>

      <label className="field">
        <span>AO mode</span>
        <select
          value={aoMode}
          onChange={(e) => setAoMode(e.target.value as AoMode)}
        >
          {AO_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>
          AO radius <span className="muted">{aoRadius} = {aoSide}³</span>
        </span>
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={aoRadius}
          disabled={!aoActive}
          onChange={(e) => setAoRadius(Number(e.target.value))}
        />
      </label>

      <label className="field">
        <span>
          AO intensity{" "}
          <span className="muted">{Math.round(aoIntensity * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={aoIntensity}
          disabled={!aoActive}
          onChange={(e) => setAoIntensity(Number(e.target.value))}
        />
      </label>

      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={showGrid} onChange={toggleGrid} />
          <span>Ground grid</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={showEdges} onChange={toggleEdges} />
          <span>Voxel edges</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={lightAutoRotate}
            onChange={toggleLightAutoRotate}
          />
          <span>Rotate light</span>
        </label>
      </div>
    </section>
  );
}
