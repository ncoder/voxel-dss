import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VoxelData } from "@/voxel/VoxelData";
import { buildVoxelMesh } from "@/voxel/meshBuilder";
import type { DssSettings } from "@/voxel/dss";
import type { AoSettings } from "@/voxel/ao";
import { useEditorStore } from "@/state/editorStore";
import type { BrushShape, MirrorAxis, ToolAction } from "@/state/editorStore";
import {
  fillStarterShape,
  type StarterShapeId,
} from "@/voxel/starterShapes";

const MAX_HISTORY = 64;

// Line strokes span at most one volume dimension (<= 256 cells); this cap leaves
// generous headroom for the instanced preview buffer.
const MAX_PREVIEW_CELLS = 1024;

// Preview tint by action, so the drag clearly reads as add / erase / paint.
const PREVIEW_COLORS: Record<string, number> = {
  attach: 0x9ec1ff,
  erase: 0xff6b6b,
  paint: 0x8fe39a,
};

interface Cell {
  x: number;
  y: number;
  z: number;
}

/**
 * Owns the Three.js scene and all imperative editing. React mounts it to a DOM
 * container and the editor store drives its settings; the engine pushes stats
 * back to the store.
 */
export class VoxelEngine {
  private container: HTMLElement;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private renderer: WebGLRenderer;
  private controls: OrbitControls;

  private data: VoxelData;
  private meshGroup = new Group();
  private mesh: Mesh | null = null;
  private edges: LineSegments | null = null;
  private material: MeshStandardMaterial;

  private grid: GridHelper;
  private groundPlane: Mesh;
  private hover: Mesh;

  // Live preview shown while dragging a box or line stroke.
  private previewGroup = new Group();
  private previewBox!: Mesh;
  private previewBoxEdges!: LineSegments;
  private previewCells!: InstancedMesh;
  private previewMatrix = new Matrix4();

  private dirLight: DirectionalLight;
  private raycaster = new Raycaster();
  private pointer = new Vector2();

  private unsubscribe: () => void;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private lightAngle = 0;
  private disposed = false;

  // Drag state for shape brushes.
  private isPainting = false;
  private dragStart: Cell | null = null;
  private paintedThisStroke = new Set<number>();

  // While Space is held, left-drag pans instead of drawing (MagicaVoxel).
  private spacePan = false;

  // Undo/redo snapshots.
  private undoStack: VoxelData[] = [];
  private redoStack: VoxelData[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    const { clientWidth: w, clientHeight: h } = container;

    this.data = new VoxelData({ x: 32, y: 32, z: 32 });

    this.scene.background = new Color(0x1a1c22);

    this.camera = new PerspectiveCamera(45, w / h, 0.1, 2000);
    const c = this.center();
    this.camera.position.set(c.x + 40, c.y + 38, c.z + 52);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.copy(c);
    // MagicaVoxel conventions: left = draw (reserved for editing, so it is
    // omitted here), right = orbit, middle = pan, wheel = zoom.
    this.controls.mouseButtons = { MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
    // Touch: one finger orbits, two fingers pan/zoom (editing uses the pen/tap
    // path via pointer events).
    this.controls.update();

    // Lighting.
    this.scene.add(new AmbientLight(0xffffff, 0.45));
    this.dirLight = new DirectionalLight(0xffffff, 2.0);
    this.dirLight.position.set(c.x + 30, c.y + 50, c.z + 20);
    this.scene.add(this.dirLight);

    // Grid + ground (ground is an invisible raycast target at y = 0).
    this.grid = new GridHelper(
      Math.max(this.data.dims.x, this.data.dims.z),
      Math.max(this.data.dims.x, this.data.dims.z),
      0x556070,
      0x33404d,
    );
    this.grid.position.set(this.data.dims.x / 2, 0, this.data.dims.z / 2);
    this.scene.add(this.grid);

    const planeSize = Math.max(this.data.dims.x, this.data.dims.z);
    this.groundPlane = new Mesh(
      new PlaneGeometry(planeSize, planeSize),
      new MeshBasicMaterial({ visible: false }),
    );
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.set(this.data.dims.x / 2, 0, this.data.dims.z / 2);
    this.scene.add(this.groundPlane);

    this.scene.add(this.meshGroup);

    // Hover highlight.
    this.hover = new Mesh(
      new BoxGeometry(1.02, 1.02, 1.02),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    this.hover.visible = false;
    this.scene.add(this.hover);

    // Drag preview: a translucent box for box-mode (the filled region) and an
    // instanced set of cells for line-mode (the actual voxels along the line).
    const previewFill = new MeshBasicMaterial({
      color: PREVIEW_COLORS.attach,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.previewBox = new Mesh(new BoxGeometry(1, 1, 1), previewFill);
    this.previewBoxEdges = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: PREVIEW_COLORS.attach }),
    );
    this.previewCells = new InstancedMesh(
      new BoxGeometry(1.02, 1.02, 1.02),
      previewFill.clone(),
      MAX_PREVIEW_CELLS,
    );
    this.previewCells.count = 0;
    this.previewCells.frustumCulled = false;
    this.previewGroup.add(this.previewBox, this.previewBoxEdges, this.previewCells);
    this.previewGroup.visible = false;
    this.scene.add(this.previewGroup);

    this.material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
    });

    this.seedDemoModel();
    this.rebuildMesh();
    this.syncStats();

    // Subscribe to store changes that require engine reaction.
    this.unsubscribe = useEditorStore.subscribe((state, prev) =>
      this.onStoreChange(state, prev),
    );

    // DOM events.
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    this.renderLoop();
  }

  private center(): Vector3 {
    return new Vector3(
      this.data.dims.x / 2,
      this.data.dims.y / 2,
      this.data.dims.z / 2,
    );
  }

  private dssSettings(): DssSettings {
    const s = useEditorStore.getState();
    return { field: s.field, shading: s.shading, kernelRadius: s.kernelRadius };
  }

  private aoSettings(): AoSettings {
    const s = useEditorStore.getState();
    return { mode: s.aoMode, radius: s.aoRadius, intensity: s.aoIntensity };
  }

  /** Initial white sphere so the viewport isn't empty on first load. */
  private seedDemoModel(): void {
    fillStarterShape(this.data, "sphere");
  }

  // ---------------------------------------------------------------- rendering

  private rebuildMesh(): void {
    if (this.mesh) {
      this.meshGroup.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.edges) {
      this.meshGroup.remove(this.edges);
      this.edges.geometry.dispose();
      (this.edges.material as LineBasicMaterial).dispose();
      this.edges = null;
    }

    const { geometry, faceCount } = buildVoxelMesh(
      this.data,
      useEditorStore.getState().palette,
      this.dssSettings(),
      this.aoSettings(),
    );

    this.mesh = new Mesh(geometry, this.material);
    this.meshGroup.add(this.mesh);

    if (useEditorStore.getState().showEdges && faceCount < 6000) {
      const eg = new EdgesGeometry(geometry, 1);
      this.edges = new LineSegments(
        eg,
        new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
      );
      this.meshGroup.add(this.edges);
    }

    this.lastFaceCount = faceCount;
  }

  private lastFaceCount = 0;
  private rebuildPending = false;

  private renderLoop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.renderLoop);

    this.flushRebuild();

    if (useEditorStore.getState().lightAutoRotate) {
      this.lightAngle += 0.01;
      const c = this.center();
      const radius = Math.max(this.data.dims.x, this.data.dims.z);
      this.dirLight.position.set(
        c.x + Math.cos(this.lightAngle) * radius,
        c.y + radius,
        c.z + Math.sin(this.lightAngle) * radius,
      );
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ------------------------------------------------------------------ picking

  private updatePointer(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /**
   * Resolve the cell under the cursor.
   * Returns the solid cell hit and the empty cell adjacent to the hit face.
   */
  private pickCell(): { solid: Cell | null; place: Cell | null } {
    // Prefer the voxel mesh.
    if (this.mesh) {
      const hits = this.raycaster.intersectObject(this.mesh, false);
      if (hits.length > 0 && hits[0].face) {
        const p = hits[0].point;
        const n = hits[0].face.normal;
        const solid: Cell = {
          x: Math.floor(p.x - n.x * 0.5),
          y: Math.floor(p.y - n.y * 0.5),
          z: Math.floor(p.z - n.z * 0.5),
        };
        const place: Cell = {
          x: Math.floor(p.x + n.x * 0.5),
          y: Math.floor(p.y + n.y * 0.5),
          z: Math.floor(p.z + n.z * 0.5),
        };
        return { solid, place };
      }
    }

    // Fall back to the ground plane (y = 0 layer).
    const hits = this.raycaster.intersectObject(this.groundPlane, false);
    if (hits.length > 0) {
      const p = hits[0].point;
      const cell: Cell = { x: Math.floor(p.x), y: 0, z: Math.floor(p.z) };
      if (this.data.inBounds(cell.x, cell.y, cell.z)) {
        return { solid: cell, place: cell };
      }
    }
    return { solid: null, place: null };
  }

  /** Cell targeted by the current action (place for attach, solid otherwise). */
  private targetCell(action: ToolAction): Cell | null {
    const { solid, place } = this.pickCell();
    return action === "attach" ? place : solid;
  }

  // ------------------------------------------------------------------- events

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // While Space is held, left-drag is a camera pan handled by OrbitControls.
    if (this.spacePan) return;
    this.updatePointer(e);

    const store = useEditorStore.getState();
    const action: ToolAction = e.altKey ? "pick" : store.action;

    if (action === "pick") {
      const { solid } = this.pickCell();
      if (solid && this.data.isSolid(solid.x, solid.y, solid.z)) {
        store.setCurrentColor(this.data.get(solid.x, solid.y, solid.z));
      }
      return;
    }

    const target = this.targetCell(action);
    if (!target) return;

    this.isPainting = true;
    this.paintedThisStroke.clear();
    this.snapshot();

    if (store.brush === "voxel" || store.brush === "face") {
      this.applyAction(target, action);
      this.commitEdit();
    } else {
      // box / line: remember the start and show a live preview; commit on up.
      this.dragStart = target;
      this.setPreviewColor(action);
      this.updateDragPreview(target, target, store.brush);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointer(e);
    const store = useEditorStore.getState();
    const action: ToolAction = e.altKey ? "pick" : store.action;
    const target = this.targetCell(action === "pick" ? "erase" : action);

    // While dragging a box/line stroke, show the shape preview instead of the
    // single-cell hover. The actual edit is still applied atomically on up.
    if (
      this.isPainting &&
      (store.brush === "box" || store.brush === "line") &&
      this.dragStart &&
      target
    ) {
      this.updateDragPreview(this.dragStart, target, store.brush);
      return;
    }

    // Hover highlight.
    if (target) {
      const previewSize =
        store.brush === "voxel" && action !== "pick" ? store.brushSize : 1;
      this.hover.visible = true;
      this.hover.scale.set(previewSize, previewSize, previewSize);
      this.hover.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    } else {
      this.hover.visible = false;
    }

    if (!this.isPainting) return;

    if (store.brush === "voxel" && target) {
      // Continuous freehand painting.
      this.applyAction(target, action);
      this.commitEdit();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isPainting) {
      this.discardSnapshotIfNoop();
      return;
    }
    this.updatePointer(e);
    const store = useEditorStore.getState();
    const action: ToolAction = store.action;

    if ((store.brush === "box" || store.brush === "line") && this.dragStart) {
      const end = this.targetCell(action);
      if (end) {
        const cells =
          store.brush === "box"
            ? this.boxCells(this.dragStart, end)
            : this.lineCells(this.dragStart, end);
        for (const cell of cells) this.applyAction(cell, action);
        this.commitEdit();
      }
    }

    this.hideDragPreview();
    this.isPainting = false;
    this.dragStart = null;
    this.discardSnapshotIfNoop();
  };

  private onPointerLeave = (): void => {
    this.hover.visible = false;
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.code === "Space" && !this.spacePan) {
      e.preventDefault();
      this.spacePan = true;
      // Temporarily let left-drag pan the camera.
      this.controls.mouseButtons.LEFT = MOUSE.PAN;
      this.renderer.domElement.style.cursor = "grab";
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space" && this.spacePan) {
      this.spacePan = false;
      delete this.controls.mouseButtons.LEFT;
      this.renderer.domElement.style.cursor = "";
    }
  };

  // -------------------------------------------------------------- editing ops

  private applyAction(cell: Cell, action: ToolAction): void {
    const store = useEditorStore.getState();
    const cells =
      store.brush === "voxel" && store.brushSize > 1
        ? this.brushFootprint(cell, store.brushSize)
        : [cell];

    for (const c of cells) {
      for (const m of this.mirrored(c, store.mirror)) {
        const k = (m.x << 16) | (m.y << 8) | m.z;
        if (this.paintedThisStroke.has(k)) continue;
        this.paintedThisStroke.add(k);

        if (action === "attach") {
          this.data.set(m.x, m.y, m.z, store.currentColor);
        } else if (action === "erase") {
          this.data.remove(m.x, m.y, m.z);
        } else if (action === "paint") {
          if (this.data.isSolid(m.x, m.y, m.z)) {
            this.data.set(m.x, m.y, m.z, store.currentColor);
          }
        }
      }
    }
  }

  /** Spherical brush footprint centered on `center` (MagicaVoxel voxel-mode style). */
  private brushFootprint(center: Cell, size: number): Cell[] {
    const radius = size / 2;
    const r = Math.ceil(radius - 1e-6);
    const cells: Cell[] = [];

    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
          const x = center.x + dx;
          const y = center.y + dy;
          const z = center.z + dz;
          if (this.data.inBounds(x, y, z)) cells.push({ x, y, z });
        }

    return cells;
  }

  private mirrored(cell: Cell, mirror: Record<MirrorAxis, boolean>): Cell[] {
    const cells: Cell[] = [cell];
    const expand = (axis: MirrorAxis, dim: number) => {
      if (!mirror[axis]) return;
      const copy: Cell[] = [];
      for (const c of cells) {
        const m = { ...c };
        m[axis] = dim - 1 - c[axis];
        copy.push(m);
      }
      cells.push(...copy);
    };
    expand("x", this.data.dims.x);
    expand("y", this.data.dims.y);
    expand("z", this.data.dims.z);
    return cells;
  }

  private boxCells(a: Cell, b: Cell): Cell[] {
    const cells: Cell[] = [];
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const [z0, z1] = [Math.min(a.z, b.z), Math.max(a.z, b.z)];
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) cells.push({ x, y, z });
    return cells;
  }

  /** 3D DDA line between two cells. */
  private lineCells(a: Cell, b: Cell): Cell[] {
    const cells: Cell[] = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      cells.push({
        x: Math.round(a.x + dx * t),
        y: Math.round(a.y + dy * t),
        z: Math.round(a.z + dz * t),
      });
    }
    return cells;
  }

  // --------------------------------------------------------------- drag preview

  private setPreviewColor(action: ToolAction): void {
    const color = PREVIEW_COLORS[action] ?? PREVIEW_COLORS.attach;
    (this.previewBox.material as MeshBasicMaterial).color.setHex(color);
    (this.previewBoxEdges.material as LineBasicMaterial).color.setHex(color);
    (this.previewCells.material as MeshBasicMaterial).color.setHex(color);
  }

  /** Show the box/line stroke that would be committed between `start` and `end`. */
  private updateDragPreview(start: Cell, end: Cell, brush: BrushShape): void {
    this.hover.visible = false;
    this.previewGroup.visible = true;

    if (brush === "box") {
      const x0 = Math.min(start.x, end.x);
      const y0 = Math.min(start.y, end.y);
      const z0 = Math.min(start.z, end.z);
      const sx = Math.abs(end.x - start.x) + 1;
      const sy = Math.abs(end.y - start.y) + 1;
      const sz = Math.abs(end.z - start.z) + 1;

      this.previewBox.visible = true;
      this.previewBoxEdges.visible = true;
      this.previewCells.visible = false;

      this.previewBox.scale.set(sx, sy, sz);
      this.previewBox.position.set(x0 + sx / 2, y0 + sy / 2, z0 + sz / 2);
      this.previewBoxEdges.scale.copy(this.previewBox.scale);
      this.previewBoxEdges.position.copy(this.previewBox.position);
      return;
    }

    // Line: stamp an instanced cube at each cell along the stroke.
    this.previewBox.visible = false;
    this.previewBoxEdges.visible = false;
    this.previewCells.visible = true;

    const cells = this.lineCells(start, end);
    const count = Math.min(cells.length, MAX_PREVIEW_CELLS);
    for (let i = 0; i < count; i++) {
      const c = cells[i];
      this.previewMatrix.makeTranslation(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      this.previewCells.setMatrixAt(i, this.previewMatrix);
    }
    this.previewCells.count = count;
    this.previewCells.instanceMatrix.needsUpdate = true;
  }

  private hideDragPreview(): void {
    this.previewGroup.visible = false;
    this.previewCells.count = 0;
  }

  /**
   * Mark the mesh dirty. The actual rebuild (which recomputes the normal and
   * AO fields and regenerates geometry) is coalesced to at most once per
   * animation frame in the render loop, so a fast brush drag that fires many
   * pointer-move events only triggers one recompute per displayed frame.
   */
  private commitEdit(): void {
    this.rebuildPending = true;
  }

  /** Run a pending rebuild, if any. Called once per frame from the render loop. */
  private flushRebuild(): void {
    if (!this.rebuildPending) return;
    this.rebuildPending = false;
    this.rebuildMesh();
    this.syncStats();
  }

  // -------------------------------------------------------------- undo / redo

  private snapshot(): void {
    this.pendingSnapshot = this.data.clone();
  }

  private pendingSnapshot: VoxelData | null = null;

  private discardSnapshotIfNoop(): void {
    if (!this.pendingSnapshot) return;
    if (this.paintedThisStroke.size > 0) {
      this.undoStack.push(this.pendingSnapshot);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack = [];
    }
    this.pendingSnapshot = null;
    this.syncStats();
  }

  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push(this.data.clone());
    this.data = snap;
    this.commitEdit();
  }

  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.data.clone());
    this.data = snap;
    this.commitEdit();
  }

  // -------------------------------------------------------- volume operations

  clearVolume(): void {
    this.snapshot();
    this.data.clear();
    this.undoStack.push(this.pendingSnapshot!);
    this.pendingSnapshot = null;
    this.commitEdit();
  }

  fillVolume(): void {
    this.snapshot();
    const color = useEditorStore.getState().currentColor;
    const { x: dx, y: dy, z: dz } = this.data.dims;
    for (let x = 0; x < dx; x++)
      for (let y = 0; y < dy; y++)
        for (let z = 0; z < dz; z++) this.data.set(x, y, z, color);
    this.undoStack.push(this.pendingSnapshot!);
    this.pendingSnapshot = null;
    this.commitEdit();
  }

  loadStarterShape(shape: StarterShapeId): void {
    this.snapshot();
    fillStarterShape(this.data, shape);
    this.undoStack.push(this.pendingSnapshot!);
    this.pendingSnapshot = null;
    this.redoStack = [];
    this.commitEdit();
  }

  // -------------------------------------------------------------------- store

  private onStoreChange(state: ReturnType<typeof useEditorStore.getState>, prev: typeof state): void {
    const needsRebuild =
      state.field !== prev.field ||
      state.shading !== prev.shading ||
      state.kernelRadius !== prev.kernelRadius ||
      state.aoMode !== prev.aoMode ||
      state.aoRadius !== prev.aoRadius ||
      state.aoIntensity !== prev.aoIntensity ||
      state.palette !== prev.palette ||
      state.showEdges !== prev.showEdges;
    // Coalesce through the same per-frame flush so dragging a slider (e.g. AO
    // intensity) doesn't trigger a full recompute on every input event.
    if (needsRebuild) this.commitEdit();

    if (state.showGrid !== prev.showGrid) {
      this.grid.visible = state.showGrid;
    }
  }

  private syncStats(): void {
    useEditorStore.getState().setStats({
      voxelCount: this.data.count,
      faceCount: this.lastFaceCount,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    });
  }

  // ------------------------------------------------------------------ cleanup

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.unsubscribe();
    this.resizeObserver.disconnect();

    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    el.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);

    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.previewBox.geometry.dispose();
    (this.previewBox.material as MeshBasicMaterial).dispose();
    this.previewBoxEdges.geometry.dispose();
    (this.previewBoxEdges.material as LineBasicMaterial).dispose();
    this.previewCells.geometry.dispose();
    (this.previewCells.material as MeshBasicMaterial).dispose();
    this.renderer.dispose();
    if (el.parentElement === this.container) this.container.removeChild(el);
  }
}
