import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { ComponentDef, ComponentSchema, EntityID, FieldValues } from "@oasys/oecs";
import { Accessor, createMemo, untrack } from "solid-js";
import { JSX } from "@solidjs/web";

export function entityGetComponentData<S extends ComponentSchema>(ecs: ReactiveECS, entityId: EntityID, componentDef: ComponentDef<S>): FieldValues<S> | undefined {
  let entity = ecs.entity(entityId);
  if (!entity.hasComponent(componentDef as ComponentDef)) {
    return undefined;
  }
  return new Proxy<FieldValues<S>>(
    {} as any,
    {
      get(target, p, receiver) {
        if (typeof p !== 'string') return undefined;
        try {
          return entity.getField(componentDef as ComponentDef, p as any);
        } catch {
          return undefined;
        }
      },
    },
  );
}

type AccessorArrayMaybeUndefined<T> = [...Extract<{ [K in keyof T]: Accessor<T[K] | undefined> }, readonly unknown[]>];
type AccessorArray<T> = [...Extract<{ [K in keyof T]: Accessor<T[K]> }, readonly unknown[]>];

export function ShowAll<T>(props: {
  whenAll: AccessorArrayMaybeUndefined<T>,
  children: (a: AccessorArray<T>) => JSX.Element
}): JSX.Element {
  let allDefined = createMemo(() => {
    for (let a of props.whenAll) {
      if (a() === undefined) {
        return false;
      }
    }
    return true;
  });
  return (
    <>
      {(() => {
        if (!allDefined()) {
          return undefined;
        }
        return untrack(() => props.children(props.whenAll as AccessorArray<T>));
      })()}
    </>
  );
}
