import { createStore, getObserver, onCleanup, untrack } from "solid-js";
import type { ECS } from "@oasys/oecs";
import type { Query } from "@oasys/oecs";
import type { ResourceDef, ResourceReader } from "@oasys/oecs";
import type { EntityID } from "@oasys/oecs";
import type { ComponentDef, ComponentSchema, FieldValues } from "@oasys/oecs";

class TriggerStore {
  #triggers: { [key: string]: number };
  #setTriggers: (fn: (s: { [key: string]: number }) => { [key: string]: number }) => void;

  constructor() {
    const [triggers, setTriggers] = createStore<{ [key: string]: number }>({});
    this.#triggers = triggers;
    this.#setTriggers = setTriggers;
  }

  track(key: string): void {
    if (!(key in this.#triggers)) {
      queueMicrotask(() => {
        this.#setTriggers((s) => {
          s[key] = 0;
          return s;
        });
      });
    }
    const _ = this.#triggers[key];
  }

  untrack(key: string): void {
    this.#setTriggers((s) => {
      delete s[key];
      return s;
    });
  }

  dirty(key: string): void {
    if (!(key in this.#triggers)) return;
    this.#setTriggers((s) => {
      s[key] = 1 - s[key];
      return s;
    });
  }
}

class ReactiveRef<T> {
  #getValue: () => T;
  #dirty: () => void;
  #triggerStore: TriggerStore;
  #key: string;
  #refCount = 0;
  #tracked = false;
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
      if (!this.#tracked) {
        this.#tracked = true;
        onCleanup(() => {
          this.#refCount--;
          // microtask is to avoid removing the trigger used by a single listener
          if (this.#refCount === 0) {
            queueMicrotask(() => {
              if (this.#refCount === 0) {
                this.#tracked = false;
                this.#onUnref?.();
              }
            });
          }
        });
      }
    }
    return this.#getValue();
  }

  dirty(): void {
    this.#dirty();
  }
}

class ReactiveResource<F extends readonly string[]> {
  #triggerStore: TriggerStore;
  #def: ResourceDef<F>;
  #resource: ResourceReader<F>;
  #fieldRefs: Map<string, ReactiveRef<number>>;
  #resourceKey: string;

  constructor(triggerStore: TriggerStore, def: ResourceDef<F>, resource: ResourceReader<F>) {
    this.#triggerStore = triggerStore;
    this.#def = def;
    this.#resource = resource;
    this.#resourceKey = `resource:${def.toString()}`;
    this.#fieldRefs = new Map();
  }

  get resourceKey(): string {
    return this.#resourceKey;
  }

  #getField(field: F[number]): number {
    const observer = getObserver();
    if (observer === null) {
      return this.#resource[field];
    }
    const key = `${this.#resourceKey}:${field}`;
    let ref = this.#fieldRefs.get(field);
    if (ref === undefined) {
      ref = new ReactiveRef(
        this.#triggerStore,
        key,
        () => this.#resource[field],
        () => this.#triggerStore.dirty(key),
        () => {
          this.#triggerStore.untrack(key);
          this.#fieldRefs.delete(field);
        },
      );
      this.#fieldRefs.set(field, ref);
    }
    return ref.value;
  }

  get delta(): number {
    return this.#getField("delta" as F[number]);
  }

  get elapsed(): number {
    return this.#getField("elapsed" as F[number]);
  }

  get<K extends F[number]>(field: K): number {
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
          this.#triggerStore.untrack(key);
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
          this.#triggerStore.untrack(key);
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
    const archetypes = this.#query.archetypes;
    if (observer === null) {
      for (const arch of this.#query) {
        yield arch;
      }
      return;
    }
    this.#triggerStore.track(`${this.#queryKey}:archetypes`);
    for (const arch of this.#query) {
      yield new ReactiveArchetype(this.#triggerStore, this.#ecs, arch, this.#queryKey);
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

  constructor(ecs: ECS) {
    this.#ecs = ecs;
    this.#triggers = new TriggerStore();
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

  resource<F extends readonly string[]>(def: ResourceDef<F>): ReactiveResource<F> {
    return new ReactiveResource(this.#triggers, def, this.#ecs.resource(def));
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

  set_resource<F extends readonly string[]>(def: ResourceDef<F>, values: { readonly [K in F[number]]: number }): void {
    const reader = this.#ecs.resource(def);
    this.#ecs.set_resource(def, values);
    for (const field of Object.keys(reader) as F[number][]) {
      this.#triggers.dirty(`resource:${def.toString()}:${field}`);
    }
  }
}