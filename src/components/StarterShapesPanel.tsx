import { useState } from "react";
import { useEngineRef } from "../engine/EngineContext";
import {
  STARTER_SHAPES,
  type StarterShapeId,
} from "../voxel/starterShapes";

export function StarterShapesPanel() {
  const engineRef = useEngineRef();
  const [active, setActive] = useState<StarterShapeId>("sphere");

  const load = (id: StarterShapeId) => {
    engineRef.current?.loadStarterShape(id);
    setActive(id);
  };

  return (
    <section className="panel">
      <h2 className="panel__title">Starter shapes</h2>
      <p className="panel__hint">Replace the model with a white preset form.</p>
      <div className="shape-grid">
        {STARTER_SHAPES.map((shape) => (
          <button
            key={shape.id}
            className={`shape-btn ${active === shape.id ? "is-active" : ""}`}
            onClick={() => load(shape.id)}
            title={shape.description}
          >
            <span className="shape-btn__label">{shape.label}</span>
            <span className="shape-btn__desc">{shape.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
