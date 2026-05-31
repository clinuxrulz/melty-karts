import { Accessor, createMemo, createSignal, createStore, getObserver, onCleanup, untrack, type Signal } from "solid-js";
import type { ECS } from "@oasys/oecs";
import type { Query } from "@oasys/oecs";
import type { EntityID } from "@oasys/oecs";
import type { ComponentDef, ComponentSchema, FieldValues, ResourceKey } from "@oasys/oecs";

type ComponentMetadata = {
  fields: readonly string[];
};

type ResourceMetadata = {
  fields: readonly string[];
};

export type ReactiveECSSnapshot = {
  resources: Array<{
    resourceKey: string;
    values: Record<string, number>;
  }>;
  entities: Array<{
    id: number;
    components: Array<{
      componentKey: string;
      values: Record<string, number>;
    }>;
  }>;
};

class TriggerStore {
  #triggers = new Map<string, { signal: Signal<number>, refCount: number, }>();

  track(key: string): void {
    if (getObserver() == null) {
      return;
    }
    let trigger = this.#triggers.get(key);
    if (trigger === undefined) {
      trigger = { signal: createSignal(0, { ownedWrite: true }), refCount: 1, };
      this.#triggers.set(key, trigger);
    } else {
      trigger.refCount++;
    }
    onCleanup(() => {
      trigger.refCount--;
      if (trigger.refCount === 0) {
        queueMicrotask(() => {
          if (trigger.refCount === 0) {
            this.#triggers.delete(key);
          }
        });
      }
    });
    trigger.signal[0]();
  }

  dirty(key: string): void {
    let trigger = this.#triggers.get(key);
    if (trigger === undefined) {
      return;
    }
    trigger.signal[1]((s) => s ^ 1);
  }
}

class ReactiveRef<T> {
  #getValue: () => T;
  #dirty: () => void;
  #triggerStore: TriggerStore;
  #key: string;
  #refCount = 0;
  #onUnref: (() => void) | undefined;

  constructor(triggerStore: TriggerStore, key: string, getValue: () => T, dirty: () => void, onUnref?: () => void) {
    this.#triggerStore = triggerStore;
    this.#key = key;
    this.#getValue = getValue;
    this.#dirty = dirty;
    this.#onUnref = onUnref;
  }

  get value(): T {
    this.#triggerStore.track(this.#key);
    const observer = getObserver();
    if (observer !== null) {
      this.#refCount++;
      let cleanupCalled = false;
      onCleanup(() => {
        if (cleanupCalled) {
          console.warn("onCleanup overexecuted");
          return;
        }
        cleanupCalled = true;
        this.#refCount--;
        // microtask is to avoid removing the trigger used by a single listener updating 
        if (this.#refCount === 0) {
          queueMicrotask(() => {
            if (this.#refCount === 0) {
              this.#onUnref?.();
            }
          });
        }
      });
    }
    return this.#getValue();
  }

  dirty(): void {
    this.#dirty();
  }
}

class ReactiveResource<T> {
  #triggerStore: TriggerStore;
  #ecs: ECS;
  #key: ResourceKey<T>;
  #fieldRefs: Map<string, ReactiveRef<any>>;
  #resourceKeyStr: string;

  constructor(triggerStore: TriggerStore, ecs: ECS, key: ResourceKey<T>) {
    this.#triggerStore = triggerStore;
    this.#ecs = ecs;
    this.#key = key;
    this.#resourceKeyStr = `resource:${key.toString()}`;
    this.#fieldRefs = new Map();
  }

  get resourceKey(): string {
    return this.#resourceKeyStr;
  }

  #getField(field: string): any {
    const observer = getObserver();
    const resource = this.#ecs.resource(this.#key);
    if (observer === null) {
      return (resource as any)[field];
    }
    const key = `${this.#resourceKeyStr}:${field}`;
    let ref = this.#fieldRefs.get(field);
    if (ref === undefined) {
      ref = new ReactiveRef(
        this.#triggerStore,
        key,
        () => (this.#ecs.resource(this.#key) as any)[field],
        () => this.#triggerStore.dirty(key),
        () => {
          this.#fieldRefs.delete(field);
        },
      );
      this.#fieldRefs.set(field, ref);
    }
    return ref.value;
  }

  get delta(): number {
    return this.#getField("delta");
  }

  get elapsed(): number {
    return this.#getField("elapsed");
  }

  get<K extends string & keyof T>(field: K): T[K] {
    return this.#getField(field);
  }
}

class ReactiveEntity {
  #triggerStore: TriggerStore;
  #ecs: ECS;
  #id: EntityID;
  #componentRefs: Map<string, ReactiveRef<boolean>>;
  #fieldRefs: Map<string, ReactiveRef<number>>;

  constructor(triggerStore: TriggerStore, ecs: ECS, id: EntityID) {
    this.#triggerStore = triggerStore;
    this.#ecs = ecs;
    this.#id = id;
    this.#componentRefs = new Map();
    this.#fieldRefs = new Map();
  }

  get id(): EntityID {
    return this.#id;
  }

  hasComponent(def: ComponentDef): boolean {
    const observer = getObserver();
    if (observer === null) {
      return this.#ecs.has_component(this.#id, def);
    }
    const key = `entity:${this.#id}:has:${def}`;
    let ref = this.#componentRefs.get(key);
    if (ref === undefined) {
      ref = new ReactiveRef(
        this.#triggerStore,
        key,
        () => this.#ecs.has_component(this.#id, def),
        () => this.#triggerStore.dirty(key),
        () => {
          this.#componentRefs.delete(key);
        },
      );
      this.#componentRefs.set(key, ref);
    }
    return ref.value;
  }

  getField<S extends ComponentSchema>(def: ComponentDef<S>, field: string & keyof S): number {
    const observer = getObserver();
    if (observer === null) {
      return this.#ecs.get_field(this.#id, def, field);
    }
    const key = `entity:${this.#id}:${def}:${field}`;
    let ref = this.#fieldRefs.get(key);
    if (ref === undefined) {
      ref = new ReactiveRef(
        this.#triggerStore,
        key,
        () => this.#ecs.get_field(this.#id, def, field),
        () => this.#triggerStore.dirty(key),
        () => {
          this.#fieldRefs.delete(key);
        },
      );
      this.#fieldRefs.set(key, ref);
    }
    return ref.value;
  }
}

class ReactiveQuery<Defs extends readonly ComponentDef[]> {
  #triggerStore: TriggerStore;
  #ecs: ECS;
  #query: Query<Defs>;
  #defs: Defs;
  #queryKey: string;

  constructor(triggerStore: TriggerStore, ecs: ECS, defs: Defs, queryKey: string) {
    this.#triggerStore = triggerStore;
    this.#ecs = ecs;
    this.#defs = defs;
    this.#queryKey = queryKey;
    this.#query = ecs.query(...defs);
  }

  get queryKey(): string {
    return this.#queryKey;
  }

  get archetype_count(): number {
    const observer = getObserver();
    if (observer === null) {
      return this.#query.archetype_count;
    }
    this.#triggerStore.track(`${this.#queryKey}:archetype_count`);
    this.#triggerStore.track("world:entities");
    return this.#query.archetype_count;
  }

  count(): number {
    const observer = getObserver();
    if (observer === null) {
      return this.#query.count();
    }
    this.#triggerStore.track(`${this.#queryKey}:count`);
    this.#triggerStore.track("world:entities");
    return this.#query.count();
  }

  get archetypes() {
    const observer = getObserver();
    if (observer === null) {
      return this.#query.archetypes;
    }
    this.#triggerStore.track(`${this.#queryKey}:archetypes`);
    this.#triggerStore.track("world:entities");
    return this.#query.archetypes;
  }

  *[Symbol.iterator]() {
    const observer = getObserver();
    if (observer === null) {
      for (const arch of this.#query.archetypes) {
        yield arch;
      }
      return;
    }
    this.#triggerStore.track(`${this.#queryKey}:archetypes`);
    this.#triggerStore.track("world:entities");
    for (const arch of this.#query.archetypes) {
      yield new ReactiveArchetype(this.#triggerStore, this.#ecs, arch as any, this.#queryKey);
    }
  }

  and<D extends ComponentDef[]>(...comps: D): ReactiveQuery<[...Defs, ...D]> {
    return new ReactiveQuery(this.#triggerStore, this.#ecs, [...this.#defs, ...comps], `${this.#queryKey}:and`);
  }

  not(...comps: ComponentDef[]): ReactiveQuery<Defs> {
    return new ReactiveQuery(this.#triggerStore, this.#ecs, this.#defs, `${this.#queryKey}:not`);
  }

  any_of(...comps: ComponentDef[]): ReactiveQuery<Defs> {
    return new ReactiveQuery(this.#triggerStore, this.#ecs, this.#defs, `${this.#queryKey}:any_of`);
  }
}

interface ArchetypeLike {
  readonly id: number;
  readonly entity_ids: Uint32Array;
  readonly entity_count: number;
  has_component(id: number): boolean;
  get_column<S extends ComponentSchema, K extends string & keyof S>(def: ComponentDef<S>, field: K): any;
}

class ReactiveArchetype {
  #triggerStore: TriggerStore;
  #ecs: ECS;
  #archetype: ArchetypeLike;
  #queryKey: string;

  constructor(triggerStore: TriggerStore, ecs: ECS, archetype: ArchetypeLike, queryKey: string) {
    this.#triggerStore = triggerStore;
    this.#ecs = ecs;
    this.#archetype = archetype;
    this.#queryKey = queryKey;
  }

  get entity_ids(): Uint32Array {
    const observer = getObserver();
    if (observer === null) {
      return this.#archetype.entity_ids;
    }
    const key = `arch:${this.#archetype.id}:entity_ids`;
    this.#triggerStore.track(key);
    return this.#archetype.entity_ids;
  }

  get entity_count(): number {
    const observer = getObserver();
    if (observer === null) {
      return this.#archetype.entity_count;
    }
    const key = `arch:${this.#archetype.id}:count`;
    this.#triggerStore.track(key);
    return this.#archetype.entity_count;
  }

  has_component(id: number): boolean {
    const observer = getObserver();
    if (observer === null) {
      return this.#archetype.has_component(id);
    }
    const key = `arch:${this.#archetype.id}:has:${id}`;
    this.#triggerStore.track(key);
    return this.#archetype.has_component(id);
  }

  get_column<S extends ComponentSchema, K extends string & keyof S>(def: ComponentDef<S>, field: K): any {
    const observer = getObserver();
    if (observer === null) {
      return this.#archetype.get_column(def, field);
    }
    const key = `arch:${this.#archetype.id}:col`;
    this.#triggerStore.track(key);
    return this.#archetype.get_column(def, field);
  }
}

export class ReactiveECS {
  #ecs: ECS;
  #triggers: TriggerStore;
  #componentMetadata = new Map<ComponentDef, ComponentMetadata>();
  #resourceMetadata = new Map<ResourceKey<any>, ResourceMetadata>();
  #componentsByKey = new Map<string, ComponentDef>();
  #resourcesByKey = new Map<string, ResourceKey<any>>();
  #aliveEntities = new Set<EntityID>();

  constructor(ecs: ECS) {
    this.#ecs = ecs;
    this.#triggers = new TriggerStore();
    this.#instrumentEcs();
  }

  #instrumentEcs(): void {
    const ecs = this.#ecs as ECS & Record<string, any>;

    const registerComponent = ecs.register_component.bind(ecs);
    ecs.register_component = ((schemaOrFields: Record<string, any> | readonly string[], type?: string) => {
      const def = (Array.isArray(schemaOrFields)) 
          ? registerComponent(schemaOrFields, type as any) 
          : registerComponent(schemaOrFields as any);
      const fields = Array.isArray(schemaOrFields)
        ? [...schemaOrFields]
        : Object.keys(schemaOrFields);
      this.#componentMetadata.set(def, { fields });
      this.#componentsByKey.set(def.toString(), def);
      return def;
    }) as typeof ecs.register_component;

    const registerTag = ecs.register_tag.bind(ecs);
    ecs.register_tag = (() => {
      const def = registerTag();
      this.#componentMetadata.set(def, { fields: [] });
      this.#componentsByKey.set(def.toString(), def);
      return def;
    }) as typeof ecs.register_tag;

    const registerResource = ecs.register_resource.bind(ecs);
    ecs.register_resource = (<T>(key: ResourceKey<T>, value: T) => {
      registerResource(key, value);
      const fields = Object.keys(value as any);
      this.#resourceMetadata.set(key, { fields: [...fields] });
      this.#resourcesByKey.set(key.toString(), key);
    }) as typeof ecs.register_resource;

    const setResource = ecs.set_resource.bind(ecs);
    ecs.set_resource = (<T>(key: ResourceKey<T>, value: T) => {
      setResource(key, value);
      for (const field of Object.keys(value as any)) {
        this.#triggers.dirty(`resource:${key.toString()}:${field}`);
      }
    }) as typeof ecs.set_resource;

    const createEntity = ecs.create_entity.bind(ecs);
    ecs.create_entity = (() => {
      const id = createEntity();
      this.#aliveEntities.add(id);
      return id;
    }) as typeof ecs.create_entity;

    const destroyEntityDeferred = ecs.destroy_entity_deferred.bind(ecs);
    ecs.destroy_entity_deferred = ((id: EntityID) => {
      this.#aliveEntities.delete(id);
      destroyEntityDeferred(id);
    }) as typeof ecs.destroy_entity_deferred;
  }

  get ecs(): ECS {
    return this.#ecs;
  }

  dirty(key: string): void {
    this.#triggers.dirty(key);
  }

  query<Defs extends ComponentDef[]>(...defs: Defs): ReactiveQuery<Defs> {
    const queryKey = `query:${defs.map(d => d.toString()).join(",")}`;
    return new ReactiveQuery(this.#triggers, this.#ecs, defs, queryKey);
  }

  createQueryEntityIds<Defs extends ComponentDef[]>(...defs: Defs): Accessor<EntityID[]> {
    let result: EntityID[] = [];
    return createMemo(
      () => {
        let i = 0;
        for (let arch of this.query(...defs)) {
          for (let j = 0; j < arch.entity_count; ++j) {
            let entityId = arch.entity_ids[j] as EntityID;
            if (i < result.length) {
              result[i++] = entityId;
            } else {
              ++i;
              result.push(entityId);
            }
          }
        }
        while (result.length > i) {
          result.pop();
        }
        return result;
      },
      {
        equals: false,
      },
    );
  }

  resource<T>(key: ResourceKey<T>): ReactiveResource<T> {
    return new ReactiveResource(this.#triggers, this.#ecs, key);
  }

  entity(id: EntityID): ReactiveEntity {
    return new ReactiveEntity(this.#triggers, this.#ecs, id);
  }

  create_entity(): EntityID {
    const id = this.#ecs.create_entity();
    untrack(() => this.#triggers.dirty("world:entities"));
    return id;
  }

  destroy_entity_deferred(id: EntityID): void {
    this.#ecs.destroy_entity_deferred(id);
    untrack(() => this.#triggers.dirty("world:entities"));
  }

  add_component(entity_id: EntityID, def: ComponentDef<Record<string, never>>): this;
  add_component<S extends ComponentSchema>(entity_id: EntityID, def: ComponentDef<S>, values: FieldValues<S>): this;
  add_component(entity_id: EntityID, def: ComponentDef, values?: Record<string, number>): this {
    const key = `entity:${entity_id}:has:${def}`;
    this.#ecs.add_component(entity_id, def, values as any);
    untrack(() => {
      this.#triggers.dirty(key);
      this.#triggers.dirty("world:entities");
    });
    return this;
  }

  remove_component(entity_id: EntityID, def: ComponentDef): this {
    const key = `entity:${entity_id}:has:${def}`;
    this.#ecs.remove_component(entity_id, def);
    untrack(() => {
      this.#triggers.dirty(key);
      this.#triggers.dirty("world:entities");
    });
    return this;
  }

  set_field<S extends ComponentSchema>(entity_id: EntityID, def: ComponentDef<S>, field: string & keyof S, value: number): void {
    const key = `entity:${entity_id}:${def}:${field}`;
    this.#ecs.set_field(entity_id, def, field, value);
    untrack(() => this.#triggers.dirty(key));
  }

  set_resource<T>(key: ResourceKey<T>, values: T): void {
    this.#ecs.set_resource(key, values);
  }

  serialize(ignoredResourceKeys: Set<string> = new Set()): ReactiveECSSnapshot {
    const resources = [...this.#resourceMetadata.entries()]
      .filter(([key]) => !ignoredResourceKeys.has(key.toString()))
      .sort(([a], [b]) => a.toString().localeCompare(b.toString()))
      .map(([key, metadata]) => {
        const reader = this.#ecs.resource(key);
        const values: Record<string, number> = {};
        for (const field of metadata.fields) {
          values[field] = (reader as any)[field];
        }
        return {
          resourceKey: key.toString(),
          values,
        };
      });

    const entities = [...this.#aliveEntities]
      .filter((id) => this.#ecs.is_alive(id))
      .sort((a, b) => Number(a) - Number(b))
      .map((id) => {
        const components = [...this.#componentMetadata.entries()]
          .filter(([def]) => this.#ecs.has_component(id, def))
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([def, metadata]) => {
            const values: Record<string, number> = {};
            for (const field of metadata.fields) {
              values[field] = this.#ecs.get_field(id, def as ComponentDef<any>, field as never);
            }
            return {
              componentKey: def.toString(),
              values,
            };
          });
        return {
          id: Number(id),
          components,
        };
      });

    return {
      resources,
      entities,
    };
  }

  deserialize(snapshot: ReactiveECSSnapshot): void {
    const targetIds = new Set(snapshot.entities.map((entity) => entity.id as EntityID));

    for (const id of [...this.#aliveEntities]) {
      if (!targetIds.has(id) && this.#ecs.is_alive(id)) {
        this.destroy_entity_deferred(id);
      }
    }
    // Note: base ECS doesn't have flush() exposed in d.ts, but it might be internal or part of update.
    // Actually World.ts calls startup() but not flush.
    // The previous code had this.#ecs.flush(). 
    // I'll check if ECS has flush.
    if ((this.#ecs as any).flush) (this.#ecs as any).flush();

    for (const resource of snapshot.resources) {
      const key = this.#resourcesByKey.get(resource.resourceKey);
      if (key !== undefined) {
        this.set_resource(key, resource.values as any);
      }
    }

    for (const entity of snapshot.entities.sort((a, b) => a.id - b.id)) {
      while (!this.#ecs.is_alive(entity.id as EntityID)) {
        const created = this.create_entity();
        if (Number(created) > entity.id) {
          throw new Error(`Cannot recreate entity ${entity.id}; ECS entity sequence has advanced past snapshot`);
        }
      }

      const entityId = entity.id as EntityID;
      const targetComponentKeys = new Set(entity.components.map((component) => component.componentKey));

      for (const [def] of this.#componentMetadata) {
        if (this.#ecs.has_component(entityId, def) && !targetComponentKeys.has(def.toString())) {
          this.remove_component(entityId, def);
        }
      }

      for (const component of entity.components) {
        const def = this.#componentsByKey.get(component.componentKey);
        if (def === undefined) {
          continue;
        }
        const metadata = this.#componentMetadata.get(def);
        if (!this.#ecs.has_component(entityId, def)) {
          if ((metadata?.fields.length ?? 0) === 0) {
            this.add_component(entityId, def as ComponentDef<Record<string, never>>);
          } else {
            this.add_component(entityId, def as ComponentDef<any>, component.values);
          }
          continue;
        }
        for (const field of metadata?.fields ?? []) {
          this.set_field(entityId, def as ComponentDef<any>, field as never, component.values[field] ?? 0);
        }
      }
    }
  }

  hash(ignoredResourceKeys: Set<string> = new Set()): number {
    const json = JSON.stringify(this.serialize(ignoredResourceKeys));
    let hash = 2166136261;
    for (let i = 0; i < json.length; i++) {
      hash ^= json.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
