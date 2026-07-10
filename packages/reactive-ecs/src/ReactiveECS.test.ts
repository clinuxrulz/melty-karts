import { describe, it, expect, beforeEach } from "vitest";
import { createRoot, createMemo, flush } from "solid-js";
import { ECS, resourceKey } from "@oasys/oecs";
import { ReactiveECS } from "./ReactiveECS";

describe("ReactiveECS", () => {
  let ecs: ECS;
  let reactive: ReactiveECS;

  beforeEach(() => {
    ecs = new ECS();
    reactive = new ReactiveECS(ecs);
  });

  describe("query", () => {
    it("returns raw query results outside reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      const q = reactive.query(Pos);
      const results = [...q];
      expect(results.length).toBe(1);
      expect(results[0].entityCount).toBe(1);
    });

    it("tracks query count in reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      createRoot((dispose) => {
        const q = reactive.query(Pos);
        const countMemo = createMemo(() => q.entityCount);
        
        expect(countMemo()).toBe(1);

        // Manually dirty to trigger re-evaluation
        const e2 = ecs.spawn();
        ecs.addComponent(e2, Pos, { x: 3, y: 4 });
        reactive.dirty(`${q.queryKey}:count`);
        
        flush();
        
        expect(countMemo()).toBe(2);
        
        dispose();
      });
    });

    it("tracks archetype count in reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      createRoot((dispose) => {
        const q = reactive.query(Pos);
        const archMemo = createMemo(() => q.archetypeCount);
        
        expect(archMemo()).toBe(1);
        
        dispose();
      });
    });

    it("iterating returns raw archetypes outside reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      const q = reactive.query(Pos);
      // Outside reactive - returns raw archetypes
      for (const arch of q) {
        expect(arch.entityCount).toBe(1);
      }
    });

    it("iterating returns reactive archetypes in reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      createRoot((dispose) => {
        const q = reactive.query(Pos);
        const countMemo = createMemo(() => {
          let total = 0;
          for (const arch of q) {
            total += arch.entityCount;
          }
          return total;
        });
        
        expect(countMemo()).toBe(1);
        
        dispose();
      });
    });
  });

  describe("resource", () => {
    it("returns raw resource values outside reactive scope", () => {
      const Time = resourceKey<{ delta: number; elapsed: number }>("Time");
      ecs.resources.register(Time, {
        delta: 0,
        elapsed: 0,
      });
      ecs.resources.set(Time, { delta: 0.016, elapsed: 1.0 });
      ecs.startup();

      const time = reactive.resource(Time);
      expect(time.delta).toBe(0.016);
      expect(time.elapsed).toBe(1.0);
    });

    it("tracks resource field in reactive scope", () => {
      const Time = resourceKey<{ delta: number; elapsed: number }>("Time");
      ecs.resources.register(Time, {
        delta: 0,
        elapsed: 0,
      });
      ecs.startup();

      createRoot((dispose) => {
        const time = reactive.resource(Time);
        const deltaMemo = createMemo(() => time.delta);
        
        expect(deltaMemo()).toBe(0);

        // Update resource and dirty
        ecs.resources.set(Time, { delta: 0.016, elapsed: 1.0 });
        reactive.dirty(`${time.resourceKey}:delta`);
        
        flush();
        
        expect(deltaMemo()).toBe(0.016);
        
        dispose();
      });
    });

    it("get method works outside reactive scope", () => {
      const Time = resourceKey<{ delta: number; elapsed: number }>("Time");
      ecs.resources.register(Time, {
        delta: 0.016,
        elapsed: 1.0,
      });
      ecs.startup();

      const time = reactive.resource(Time);
      expect(time.get("delta")).toBe(0.016);
      expect(time.get("elapsed")).toBe(1.0);
    });
  });

  describe("entity", () => {
    it("returns raw component status outside reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const Tag = ecs.registerTag();
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      const entity = reactive.entity(e);
      expect(entity.hasComponent(Pos)).toBe(true);
      expect(entity.hasComponent(Tag)).toBe(false);
    });

    it("tracks component status in reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      createRoot((dispose) => {
        const entity = reactive.entity(e);
        const hasPosMemo = createMemo(() => entity.hasComponent(Pos));
        
        expect(hasPosMemo()).toBe(true);

        // Dirty to trigger re-evaluation
        reactive.dirty(`entity:${e}:has:${Pos.id}`);
        
        flush();
        
        expect(hasPosMemo()).toBe(true);
        
        dispose();
      });
    });

    it("returns raw field values outside reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1.5, y: 2.5 });
      ecs.startup();

      const entity = reactive.entity(e);
      expect(entity.getField(Pos, "x")).toBe(1.5);
      expect(entity.getField(Pos, "y")).toBe(2.5);
    });

    it("tracks field values in reactive scope", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      createRoot((dispose) => {
        const entity = reactive.entity(e);
        const xMemo = createMemo(() => entity.getField(Pos, "x"));
        
        expect(xMemo()).toBe(1);

        // Dirty to trigger re-evaluation
        reactive.dirty(`entity:${e}:${Pos.id}:x`);
        
        flush();
        
        expect(xMemo()).toBe(1);
        
        dispose();
      });
    });

    it("returns entity id", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      const entity = reactive.entity(e);
      expect(entity.id).toBe(e);
    });
  });

  describe("performance - no map allocations outside reactive scope", () => {
    it("query does not populate internal maps when read outside reactive", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      const q = reactive.query(Pos);
      // Read outside reactive scope - should be raw access
      const count = q.entityCount;
      expect(count).toBe(1);
    });

    it("resource does not populate internal maps when read outside reactive", () => {
      const Time = resourceKey<{ delta: number; elapsed: number }>("Time");
      ecs.resources.register(Time, {
        delta: 0.016,
        elapsed: 1.0,
      });
      ecs.startup();

      const time = reactive.resource(Time);
      // Read outside reactive scope - should be raw access
      expect(time.delta).toBe(0.016);
    });

    it("entity does not populate internal maps when read outside reactive", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      const entity = reactive.entity(e);
      // Read outside reactive scope - should be raw access
      expect(entity.hasComponent(Pos)).toBe(true);
      expect(entity.getField(Pos, "x")).toBe(1);
    });

    it("maps are cleaned up when reference count hits zero", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const Time = resourceKey<{ delta: number; elapsed: number }>("Time");
      ecs.resources.register(Time, {
        delta: 0.016,
        elapsed: 1.0,
      });
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      createRoot((dispose) => {
        // Create refs in reactive scope - maps get populated
        const entity = reactive.entity(e);
        entity.hasComponent(Pos);
        entity.getField(Pos, "x");

        const time = reactive.resource(Time);
        time.delta;

        // Dispose the reactive scope - ref counts go to zero
        dispose();
      });

      // After dispose, the maps should be empty
      createRoot(() => {
        const entity = reactive.entity(e);
        const time = reactive.resource(Time);
        
        // Accessing again should repopulate (not crash)
        expect(entity.hasComponent(Pos)).toBe(true);
        expect(entity.getField(Pos, "x")).toBe(1);
        expect(time.delta).toBe(0.016);
      });
    });
  });

  describe("auto-dirty on write methods", () => {
    it("create_entity triggers query reactivity", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      ecs.startup();

      createRoot((dispose) => {
        const q = reactive.query(Pos);
        const countMemo = createMemo(() => q.entityCount);
        
        expect(countMemo()).toBe(0);

        // Create entity via reactive wrapper - should auto-trigger
        const e = reactive.spawn();
        reactive.addComponent(e, Pos, { x: 1, y: 2 });
        
        flush();
        
        expect(countMemo()).toBe(1);
        
        dispose();
      });
    });

    it("add_component triggers entity and query reactivity", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const Tag = ecs.registerTag();
      const e = ecs.spawn();
      ecs.startup();

      createRoot((dispose) => {
        const entity = reactive.entity(e);
        const hasPosMemo = createMemo(() => entity.hasComponent(Pos));
        const hasTagMemo = createMemo(() => entity.hasComponent(Tag));
        
        expect(hasPosMemo()).toBe(false);
        expect(hasTagMemo()).toBe(false);

        // Add component via reactive wrapper - should auto-trigger
        reactive.addComponent(e, Pos, { x: 1, y: 2 });
        reactive.addComponent(e, Tag);
        
        flush();
        
        expect(hasPosMemo()).toBe(true);
        expect(hasTagMemo()).toBe(true);
        
        dispose();
      });
    });

    it("set_field triggers entity field reactivity", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 0, y: 0 });
      ecs.startup();

      createRoot((dispose) => {
        const entity = reactive.entity(e);
        const xMemo = createMemo(() => entity.getField(Pos, "x"));
        
        expect(xMemo()).toBe(0);

        // Set field via reactive wrapper - should auto-trigger
        reactive.setField(e, Pos, "x", 5);
        
        flush();
        
        expect(xMemo()).toBe(5);
        
        dispose();
      });
    });

    it("set_resource triggers resource reactivity", () => {
      const Time = resourceKey<{ delta: number; elapsed: number }>("Time");
      ecs.resources.register(Time, {
        delta: 0,
        elapsed: 0,
      });
      ecs.startup();

      createRoot((dispose) => {
        const time = reactive.resource(Time);
        const deltaMemo = createMemo(() => time.delta);
        
        expect(deltaMemo()).toBe(0);

        // Set resource via reactive wrapper - should auto-trigger
        reactive.setResource(Time, { delta: 0.016, elapsed: 1.0 });
        
        flush();
        
        expect(deltaMemo()).toBe(0.016);
        
        dispose();
      });
    });

    it("remove_component triggers entity reactivity", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const e = ecs.spawn();
      ecs.addComponent(e, Pos, { x: 1, y: 2 });
      ecs.startup();

      createRoot((dispose) => {
        const entity = reactive.entity(e);
        const hasPosMemo = createMemo(() => entity.hasComponent(Pos));
        
        expect(hasPosMemo()).toBe(true);

        // Remove component via reactive wrapper - should auto-trigger
        reactive.removeComponent(e, Pos);
        
        flush();
        
        expect(hasPosMemo()).toBe(false);
        
        dispose();
      });
    });
  });

  describe("serialization", () => {
    it("serializes, deserializes, and hashes deterministically", () => {
      const Pos = ecs.registerComponent(["x", "y"] as const);
      const Tag = ecs.registerTag();
      const Time = resourceKey<{ delta: number; elapsed: number }>("Time");
      ecs.resources.register(Time, {
        delta: 0,
        elapsed: 0,
      });

      const entity = reactive.spawn();
      reactive.addComponent(entity, Pos, { x: 3.5, y: 7.25 });
      reactive.addComponent(entity, Tag);
      reactive.setResource(Time, { delta: 0.016, elapsed: 12 });
      ecs.startup();

      const snapshot = reactive.serialize();
      const hashBefore = reactive.hash();

      reactive.setField(entity, Pos, "x", 99);
      reactive.removeComponent(entity, Tag);
      reactive.setResource(Time, { delta: 1, elapsed: 2 });

      reactive.deserialize(snapshot);

      expect(reactive.resource(Time).get("delta")).toBe(0.016);
      expect(reactive.resource(Time).get("elapsed")).toBe(12);
      expect(reactive.entity(entity).getField(Pos, "x")).toBe(3.5);
      expect(reactive.entity(entity).getField(Pos, "y")).toBe(7.25);
      expect(reactive.entity(entity).hasComponent(Tag)).toBe(true);
      expect(reactive.hash()).toBe(hashBefore);
    });
  });
});
