import { useEngineRef } from "../engine/EngineContext";
import { useEditorStore } from "../state/editorStore";

export function TopMenu() {
  const engineRef = useEngineRef();
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);

  return (
    <header className="topmenu">
      <div className="topmenu__brand">
        <span className="topmenu__logo">◧</span>
        <span>Voxel DSS Editor</span>
      </div>

      <div className="topmenu__actions">
        <button
          className="menu-btn"
          disabled={!canUndo}
          onClick={() => engineRef.current?.undo()}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className="menu-btn"
          disabled={!canRedo}
          onClick={() => engineRef.current?.redo()}
          title="Redo (Ctrl+Y)"
        >
          Redo
        </button>
        <span className="topmenu__sep" />
        <button
          className="menu-btn"
          onClick={() => engineRef.current?.fillVolume()}
          title="Fill volume with current color (I)"
        >
          Fill
        </button>
        <button
          className="menu-btn menu-btn--danger"
          onClick={() => {
            if (confirm("Clear the entire model?")) {
              engineRef.current?.clearVolume();
            }
          }}
          title="Clear all voxels"
        >
          Clear
        </button>
      </div>
    </header>
  );
}
