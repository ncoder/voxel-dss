import {
  useEditorStore,
  type BrushShape,
  type MirrorAxis,
  type ToolAction,
} from "../state/editorStore";

const ACTIONS: { id: ToolAction; label: string; key: string; hint: string }[] = [
  { id: "attach", label: "Attach", key: "T", hint: "Add voxels" },
  { id: "erase", label: "Erase", key: "R", hint: "Remove voxels" },
  { id: "paint", label: "Paint", key: "G", hint: "Recolor voxels" },
  { id: "pick", label: "Pick", key: "Alt", hint: "Pick color (Alt+click)" },
];

const BRUSHES: { id: BrushShape; label: string; key: string }[] = [
  { id: "voxel", label: "Voxel", key: "V" },
  { id: "box", label: "Box", key: "B" },
  { id: "line", label: "Line", key: "L" },
  { id: "face", label: "Face", key: "F" },
];

const MIRROR_AXES: MirrorAxis[] = ["x", "y", "z"];

export function Toolbar() {
  const action = useEditorStore((s) => s.action);
  const brush = useEditorStore((s) => s.brush);
  const brushSize = useEditorStore((s) => s.brushSize);
  const mirror = useEditorStore((s) => s.mirror);
  const setAction = useEditorStore((s) => s.setAction);
  const setBrush = useEditorStore((s) => s.setBrush);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const toggleMirror = useEditorStore((s) => s.toggleMirror);

  return (
    <nav className="toolbar">
      <div className="tool-group">
        <span className="tool-group__title">Tool</span>
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            className={`tool-btn ${action === a.id ? "is-active" : ""}`}
            onClick={() => setAction(a.id)}
            title={`${a.hint} (${a.key})`}
          >
            <span>{a.label}</span>
            <kbd>{a.key}</kbd>
          </button>
        ))}
      </div>

      <div className="tool-group">
        <span className="tool-group__title">Brush</span>
        {BRUSHES.map((b) => (
          <button
            key={b.id}
            className={`tool-btn ${brush === b.id ? "is-active" : ""}`}
            onClick={() => setBrush(b.id)}
            title={`${b.label} brush (${b.key})`}
          >
            <span>{b.label}</span>
            <kbd>{b.key}</kbd>
          </button>
        ))}
      </div>

      {brush === "voxel" && (
        <div className="tool-group">
          <span className="tool-group__title">Voxel size</span>
          <label className="brush-size">
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              title="Brush diameter in voxels"
            />
            <span className="brush-size__label">{brushSize} vx</span>
          </label>
        </div>
      )}

      <div className="tool-group">
        <span className="tool-group__title">Mirror</span>
        <div className="mirror-row">
          {MIRROR_AXES.map((axis) => (
            <button
              key={axis}
              className={`mirror-btn ${mirror[axis] ? "is-active" : ""}`}
              onClick={() => toggleMirror(axis)}
              title={`Mirror across ${axis.toUpperCase()} axis`}
            >
              {axis.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
