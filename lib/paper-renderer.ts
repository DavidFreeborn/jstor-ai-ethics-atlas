import type { MapData, PaperPoint } from './atlas-types';
import {
  backingSize,
  basis3D,
  cameraFor3D,
  clamp,
  openingCamera,
  orbit3D,
  pan2D,
  pan3D,
  project2D,
  project3D,
  scale2D,
  wheelFactor,
  zoom2D,
  zoom3D,
  type Camera2D,
  type Camera3D,
  type Vec3,
  type XY,
} from './map-camera';
import { groupFingerprint, type PaperGroup } from './paper-selection';

export type PaperMark = { colours: string[]; missing?: boolean };
export type HoverPoint = XY & {
  paper: PaperPoint;
  width: number;
  height: number;
};
type VisualState = {
  marks: PaperMark[];
  group: PaperGroup | null;
  selectedId: string | null;
};
type Pointer = XY & { origin: XY; moved: boolean; pan: boolean };
type Projected = XY & { index: number; depth: number; visible: boolean };
type Callbacks = {
  select: (paper: PaperPoint | null) => void;
  hover: (point: HoverPoint | null) => void;
  box: (ids: Set<string>) => void;
  error: (error: Error) => void;
  clear: () => void;
};

/** Owns camera/event lifetime. Camera changes never enqueue React state updaters. */
export class PaperRenderer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private data: MapData;
  private callbacks: Callbacks;
  private visual: VisualState;
  private size = { width: 1, height: 1 };
  private ratio = 1;
  private camera2: Camera2D;
  private camera3: Camera3D | null = null;
  private coordinates3: Vec3[] | null = null;
  private positionSource = 'titles';
  private savedCameras = new Map<
    string,
    { camera2: Camera2D; camera3: Camera3D | null; coordinates3: Vec3[] | null }
  >();
  private dimension: '2d' | '3d' = '2d';
  private projected: Projected[];
  private drawOrder: Projected[] = [];
  private projectionDirty = true;
  private pointers = new Map<number, Pointer>();
  private boxMode = false;
  private boxRect: { start: XY; end: XY } | null = null;
  private hoverAt: XY | null = null;
  private hoveredId: string | null = null;
  private frame: number | null = null;
  private destroyed = false;
  private observer: ResizeObserver;
  private listeners: Array<() => void> = [];
  private stats = { frames: 0, allocations: 0, lastDrawMs: 0, maxDrawMs: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    data: MapData,
    visual: VisualState,
    callbacks: Callbacks,
    positionSource = 'titles',
  ) {
    this.canvas = canvas;
    this.data = data;
    this.positionSource = positionSource;
    this.visual = visual;
    this.callbacks = callbacks;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context)
      throw new Error('A canvas renderer is unavailable in this browser.');
    this.context = context;
    this.camera2 = openingCamera(data.points, data.geometry.opening_zoom);
    this.projected = data.points.map((_, index) => ({
      index,
      x: 0,
      y: 0,
      depth: 1,
      visible: false,
    }));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement!);
    this.listen(canvas, 'pointerdown', this.pointerDown as EventListener);
    this.listen(canvas, 'pointermove', this.pointerMove as EventListener);
    this.listen(canvas, 'pointerup', this.pointerUp as EventListener);
    this.listen(canvas, 'pointercancel', this.cancel);
    this.listen(
      canvas,
      'lostpointercapture',
      this.lostCapture as EventListener,
    );
    this.listen(canvas, 'pointerleave', () => {
      this.hoverAt = null;
      this.hideHover();
    });
    this.listen(canvas, 'wheel', this.wheel as EventListener, {
      passive: false,
    });
    this.listen(canvas, 'dblclick', () => this.reset());
    this.listen(canvas, 'keydown', this.keydown as EventListener);
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(window, 'blur', this.cancel);
    this.listen(window, 'resize', () => this.resize());
    this.resize();
  }
  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener, options);
    this.listeners.push(() =>
      target.removeEventListener(type, listener, options),
    );
  }
  setVisual(visual: VisualState, callbacks: Callbacks) {
    this.visual = visual;
    this.callbacks = callbacks;
    this.request();
  }
  setData(data: MapData, positionSource: string) {
    if (this.data === data && this.positionSource === positionSource) return;
    this.savedCameras.set(this.positionSource, {
      camera2: this.camera2,
      camera3: this.camera3,
      coordinates3: this.coordinates3,
    });
    const saved = this.savedCameras.get(positionSource);
    this.data = data;
    this.positionSource = positionSource;
    this.camera2 =
      saved?.camera2 ?? openingCamera(data.points, data.geometry.opening_zoom);
    this.camera3 = saved?.camera3 ?? null;
    this.coordinates3 = saved?.coordinates3 ?? null;
    this.dimension = '2d';
    this.projected = data.points.map((_, index) => ({
      index,
      x: 0,
      y: 0,
      depth: 1,
      visible: false,
    }));
    this.drawOrder = [];
    this.cancel();
    this.changed();
  }
  setDimension(dimension: '2d' | '3d', coordinates: Vec3[] | null) {
    if (coordinates && this.coordinates3 !== coordinates) {
      this.coordinates3 = coordinates;
      this.camera3 = cameraFor3D(coordinates);
    }
    if (dimension === '3d' && !this.camera3) return;
    if (this.dimension !== dimension) {
      this.dimension = dimension;
      this.cancel();
      this.changed();
    }
  }
  setBoxMode(enabled: boolean) {
    this.boxMode = enabled;
    this.cancel();
    this.canvas.style.cursor = enabled ? 'crosshair' : 'grab';
  }
  zoom(
    factor: number,
    anchor: XY = { x: this.size.width / 2, y: this.size.height / 2 },
  ) {
    if (this.dimension === '3d' && this.camera3)
      this.camera3 = zoom3D(this.camera3, factor);
    else
      this.camera2 = zoom2D(
        this.camera2,
        factor,
        anchor,
        scale2D(this.data.geometry.bounds, this.size),
        this.size,
      );
    this.changed();
  }
  reset(fitAll = false) {
    this.cancel();
    if (this.dimension === '3d' && this.coordinates3)
      this.camera3 = cameraFor3D(this.coordinates3, fitAll);
    else if (fitAll) {
      const b = this.data.geometry.bounds;
      this.camera2 = {
        x: (b.x[0] + b.x[1]) / 2,
        y: (b.y[0] + b.y[1]) / 2,
        zoom: 1,
      };
    } else
      this.camera2 = openingCamera(
        this.data.points,
        this.data.geometry.opening_zoom,
      );
    this.changed();
  }
  private resize() {
    const host = this.canvas.parentElement!;
    const width = Math.max(1, Math.floor(host.clientWidth)),
      height = Math.max(1, Math.floor(host.clientHeight));
    const size = { width, height },
      backing = backingSize(size, window.devicePixelRatio || 1);
    if (
      width === this.size.width &&
      height === this.size.height &&
      backing.ratio === this.ratio
    )
      return;
    this.size = size;
    this.ratio = backing.ratio;
    // The backing store changes only with viewport size/density, never on navigation.
    if (this.canvas.width !== backing.width) {
      this.canvas.width = backing.width;
      this.stats.allocations++;
    }
    if (this.canvas.height !== backing.height) {
      this.canvas.height = backing.height;
      this.stats.allocations++;
    }
    this.cancel();
    this.changed();
  }
  private changed() {
    this.projectionDirty = true;
    this.hoverAt = null;
    this.hideHover();
    this.request();
  }
  private request() {
    if (this.destroyed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.destroyed) return;
      try {
        this.draw();
      } catch (error) {
        this.cancel();
        this.callbacks.error(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
  }
  private project() {
    if (!this.projectionDirty) return;
    const base = scale2D(this.data.geometry.bounds, this.size),
      basis = this.camera3 ? basis3D(this.camera3) : null;
    this.drawOrder.length = 0;
    for (const p of this.projected) {
      const position =
        this.dimension === '3d' && this.coordinates3 && this.camera3 && basis
          ? project3D(
              this.coordinates3[p.index],
              this.camera3,
              this.size,
              basis,
            )
          : {
              ...project2D(
                this.data.points[p.index],
                this.camera2,
                base,
                this.size,
              ),
              depth: 1,
            };
      p.visible =
        !!position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        position.x >= -10 &&
        position.y >= -10 &&
        position.x <= this.size.width + 10 &&
        position.y <= this.size.height + 10;
      if (position) {
        p.x = position.x;
        p.y = position.y;
        p.depth = position.depth;
      }
      if (p.visible) this.drawOrder.push(p);
    }
    if (this.dimension === '3d')
      this.drawOrder.sort((a, b) => b.depth - a.depth);
    this.projectionDirty = false;
  }
  private draw() {
    const started = performance.now();
    this.project();
    const ctx = this.context;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#090c10';
    ctx.fillRect(0, 0, this.size.width, this.size.height);
    const group = this.visual.group,
      baseRadius =
        this.dimension === '2d'
          ? clamp(
              1.9 + Math.log2(Math.max(1, this.camera2.zoom)) * 0.55,
              1.9,
              4,
            )
          : 2.3;
    const radiusFor = (p: Projected) =>
      this.dimension === '3d'
        ? clamp(
            baseRadius * Math.sqrt((this.camera3?.distance ?? 1) / p.depth),
            1.4,
            5,
          )
        : baseRadius;
    const circle = (p: Projected, radius: number, colour: string) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    // Opaque background marks keep context crisp; no blur/shadow/alpha accumulation.
    if (group)
      for (const p of this.drawOrder)
        if (!group.ids.has(this.data.points[p.index].id))
          circle(
            p,
            Math.max(1.2, radiusFor(p) * 0.63),
            this.visual.marks[p.index]?.missing ? '#242d35' : '#52606b',
          );
    for (const p of this.drawOrder) {
      const paper = this.data.points[p.index];
      if (group && !group.ids.has(paper.id)) continue;
      const mark = this.visual.marks[p.index],
        radius = radiusFor(p);
      if (!mark || mark.missing) {
        circle(
          p,
          group ? radius : Math.max(1.1, radius * 0.6),
          group ? '#090c10' : '#242d35',
        );
        if (group) {
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        continue;
      }
      const colours = mark.colours;
      if (colours.length <= 1) circle(p, radius, colours[0] ?? '#ddf6ff');
      else {
        const step = (Math.PI * 2) / colours.length;
        for (let i = 0; i < colours.length; i++) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.arc(
            p.x,
            p.y,
            radius + 0.6,
            -Math.PI / 2 + step * i,
            -Math.PI / 2 + step * (i + 1),
          );
          ctx.closePath();
          ctx.fillStyle = colours[i];
          ctx.fill();
        }
      }
    }
    const selected = this.visual.selectedId
      ? this.drawOrder.find(
          (p) => this.data.points[p.index].id === this.visual.selectedId,
        )
      : null;
    if (selected) {
      ctx.beginPath();
      ctx.arc(selected.x, selected.y, radiusFor(selected) + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
    if (this.boxRect) {
      const { start, end } = this.boxRect;
      ctx.fillStyle = 'rgba(180,220,255,.08)';
      ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.strokeStyle = '#c6e6ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.setLineDash([]);
    }
    if (this.hoverAt && !this.pointers.size) {
      const p = this.nearest(this.hoverAt);
      const id = p?.paper.id ?? null;
      if (id !== this.hoveredId) {
        this.hoveredId = id;
        this.callbacks.hover(p);
      }
    }
    this.stats.frames++;
    this.stats.lastDrawMs = performance.now() - started;
    this.stats.maxDrawMs = Math.max(
      this.stats.maxDrawMs,
      this.stats.lastDrawMs,
    );
    if (this.canvas.dataset.audit === 'true')
      this.canvas.dataset.renderer = JSON.stringify({
        ...this.stats,
        dimension: this.dimension,
        camera: this.dimension === '2d' ? this.camera2 : this.camera3,
        visible: this.drawOrder.length,
        selected: group?.ids.size ?? 0,
        selectionHash: group ? groupFingerprint(group.ids) : null,
        papers: this.data.points.length,
        positionSource: this.positionSource,
        pointers: this.pointers.size,
        backingPixels: this.canvas.width * this.canvas.height,
      });
  }
  private nearest(at: XY): HoverPoint | null {
    this.project();
    let best: Projected | null = null,
      bestDistance = 100;
    // First hit-test painted glyphs in reverse paint order. A rear glyph cannot
    // steal a click through an opaque foreground glyph merely because its centre is closer.
    const group = this.visual.group;
    for (const pass of group ? [true, false] : [true]) {
      for (let i = this.drawOrder.length - 1; i >= 0; i--) {
        const point = this.drawOrder[i],
          member = !group || group.ids.has(this.data.points[point.index].id);
        if (member !== pass) continue;
        let radius =
          this.dimension === '3d'
            ? clamp(
                2.3 * Math.sqrt((this.camera3?.distance ?? 1) / point.depth),
                1.4,
                5,
              )
            : clamp(
                1.9 + Math.log2(Math.max(1, this.camera2.zoom)) * 0.55,
                1.9,
                4,
              );
        if (!member) radius = Math.max(1.2, radius * 0.63);
        else if (this.visual.marks[point.index]?.missing && !group)
          radius = Math.max(1.1, radius * 0.6);
        else if ((this.visual.marks[point.index]?.colours.length ?? 0) > 1)
          radius += 0.6;
        if ((point.x - at.x) ** 2 + (point.y - at.y) ** 2 <= radius ** 2)
          return {
            paper: this.data.points[point.index],
            x: point.x,
            y: point.y,
            ...this.size,
          };
      }
    }
    // A small nearest-centre tolerance makes isolated small points usable by mouse/touch.
    for (const point of this.drawOrder) {
      const d = (point.x - at.x) ** 2 + (point.y - at.y) ** 2;
      if (
        d < bestDistance ||
        (d === bestDistance && point.depth < (best?.depth ?? Infinity))
      ) {
        best = point;
        bestDistance = d;
      }
    }
    return best
      ? {
          paper: this.data.points[best.index],
          x: best.x,
          y: best.y,
          ...this.size,
        }
      : null;
  }
  private point(event: PointerEvent | WheelEvent): XY {
    const b = this.canvas.getBoundingClientRect();
    return { x: event.clientX - b.left, y: event.clientY - b.top };
  }
  private hideHover() {
    if (this.hoveredId !== null) {
      this.hoveredId = null;
      if (!this.destroyed) this.callbacks.hover(null);
    }
  }
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    const point = this.point(event);
    this.pointers.set(event.pointerId, {
      ...point,
      origin: point,
      moved: false,
      pan: event.shiftKey || event.button !== 0,
    });
    if (this.pointers.size > 1) {
      this.boxRect = null;
      for (const p of this.pointers.values()) p.moved = true;
    } else if (this.boxMode) this.boxRect = { start: point, end: point };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic or already-cancelled pointers do not have capture. */
    }
    this.hideHover();
  };
  private pointerMove = (event: PointerEvent) => {
    const at = this.point(event),
      pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      this.hoverAt = at;
      this.request();
      return;
    }
    const previous = { x: pointer.x, y: pointer.y };
    if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(
        ([id]) => id !== event.pointerId,
      )![1];
      const oldDistance = Math.hypot(
          previous.x - other.x,
          previous.y - other.y,
        ),
        distance = Math.hypot(at.x - other.x, at.y - other.y);
      if (oldDistance > 3 && distance > 3)
        this.zoom(distance / oldDistance, {
          x: (at.x + other.x) / 2,
          y: (at.y + other.y) / 2,
        });
      this.pan((at.x - previous.x) / 2, (at.y - previous.y) / 2);
      pointer.moved = true;
    } else if (this.pointers.size === 1) {
      if (Math.hypot(at.x - pointer.origin.x, at.y - pointer.origin.y) > 4)
        pointer.moved = true;
      if (this.boxRect) {
        this.boxRect.end = at;
        this.request();
      } else if (pointer.moved) {
        if (this.dimension === '3d' && this.camera3 && !pointer.pan)
          this.camera3 = orbit3D(
            this.camera3,
            at.x - previous.x,
            at.y - previous.y,
          );
        else this.pan(at.x - previous.x, at.y - previous.y);
        this.changed();
      }
    }
    pointer.x = at.x;
    pointer.y = at.y;
  };
  private pan(dx: number, dy: number) {
    if (this.dimension === '3d' && this.camera3)
      this.camera3 = pan3D(this.camera3, dx, dy, this.size);
    else
      this.camera2 = pan2D(
        this.camera2,
        dx,
        dy,
        scale2D(this.data.geometry.bounds, this.size),
      );
    this.changed();
  }
  private pointerUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.pointers.delete(event.pointerId);
    const rect = this.boxRect;
    this.boxRect = null;
    if (rect && pointer.moved) {
      this.project();
      const end = this.point(event);
      this.callbacks.box(
        new Set(
          this.drawOrder
            .filter(
              (p) =>
                p.x >= Math.min(rect.start.x, end.x) &&
                p.x <= Math.max(rect.start.x, end.x) &&
                p.y >= Math.min(rect.start.y, end.y) &&
                p.y <= Math.max(rect.start.y, end.y),
            )
            .map((p) => this.data.points[p.index].id),
        ),
      );
    } else if (!pointer.moved && !this.pointers.size)
      this.callbacks.select(this.nearest(this.point(event))?.paper ?? null);
    try {
      if (this.canvas.hasPointerCapture(event.pointerId))
        this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* Pointer may have been cancelled by the browser. */
    }
    this.request();
  };
  private lostCapture = (event: PointerEvent) => {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.delete(event.pointerId);
      this.boxRect = null;
      this.request();
    }
  };
  private cancel = () => {
    const ids = [...this.pointers.keys()];
    this.pointers.clear();
    this.boxRect = null;
    this.hoverAt = null;
    this.hideHover();
    for (const id of ids)
      try {
        if (this.canvas.hasPointerCapture(id))
          this.canvas.releasePointerCapture(id);
      } catch {
        /* Already released. */
      }
    this.request();
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.boxRect = null;
    for (const p of this.pointers.values()) p.moved = true;
    this.zoom(
      wheelFactor(event.deltaY, event.deltaMode, this.size.height),
      this.point(event),
    );
  };
  private keydown = (event: KeyboardEvent) => {
    if (event.key === '+' || event.key === '=') this.zoom(1.25);
    else if (event.key === '-') this.zoom(1 / 1.25);
    else if (event.key === 'Home') this.reset(event.shiftKey);
    else if (event.key === 'Escape') {
      this.cancel();
      this.callbacks.clear();
    } else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      const dx =
          event.key === 'ArrowLeft' ? 35 : event.key === 'ArrowRight' ? -35 : 0,
        dy = event.key === 'ArrowUp' ? 35 : event.key === 'ArrowDown' ? -35 : 0;
      if (this.dimension === '3d' && this.camera3 && !event.shiftKey) {
        this.camera3 = orbit3D(this.camera3, dx, dy);
        this.changed();
      } else this.pan(dx, dy);
    } else return;
    event.preventDefault();
  };
  destroy() {
    this.destroyed = true;
    this.observer.disconnect();
    this.listeners.forEach((remove) => remove());
    this.cancel();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
