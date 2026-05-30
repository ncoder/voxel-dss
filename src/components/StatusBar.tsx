import { useEditorStore } from "../state/editorStore";

export function StatusBar() {
  const voxelCount = useEditorStore((s) => s.voxelCount);
  const faceCount = useEditorStore((s) => s.faceCount);
  const action = useEditorStore((s) => s.action);
  const brush = useEditorStore((s) => s.brush);

  return (
    <footer className="statusbar">
      <span>
        <b>{voxelCount.toLocaleString()}</b> voxels
      </span>
      <span>
        <b>{faceCount.toLocaleString()}</b> faces
      </span>
      <span className="muted">
        {action} · {brush}
      </span>
      <span className="statusbar__hint">
        Left-drag draw · Right-drag orbit · Middle/Space pan · Scroll zoom ·
        Alt+click pick
      </span>
    </footer>
  );
}
