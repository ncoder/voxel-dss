import { useEditorStore } from "../state/editorStore";
import { PALETTE_SIZE } from "../voxel/palette";

export function PalettePanel() {
  const palette = useEditorStore((s) => s.palette);
  const currentColor = useEditorStore((s) => s.currentColor);
  const setCurrentColor = useEditorStore((s) => s.setCurrentColor);
  const setPaletteColor = useEditorStore((s) => s.setPaletteColor);

  // Palette index 0 is reserved for "empty"; show 1..PALETTE_SIZE-1.
  const indices = Array.from({ length: PALETTE_SIZE - 1 }, (_, i) => i + 1);

  return (
    <section className="panel">
      <h2 className="panel__title">Palette</h2>

      <div className="palette-current">
        <input
          type="color"
          value={palette[currentColor] ?? "#ffffff"}
          onChange={(e) => setPaletteColor(currentColor, e.target.value)}
          title="Edit selected color"
        />
        <div className="palette-current__meta">
          <span>#{currentColor}</span>
          <span className="muted">{palette[currentColor]}</span>
        </div>
      </div>

      <div className="palette-grid">
        {indices.map((i) => (
          <button
            key={i}
            className={`swatch ${i === currentColor ? "is-active" : ""}`}
            style={{ background: palette[i] }}
            onClick={() => setCurrentColor(i)}
            title={`#${i} ${palette[i]}`}
          />
        ))}
      </div>
    </section>
  );
}
