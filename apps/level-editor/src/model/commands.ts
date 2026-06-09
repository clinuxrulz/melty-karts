import { ComponentDef, ComponentSchema, EntityID, FieldValues } from "@oasys/oecs";

export type Command =
  | { type: "noOperation", }
  | { type: "seq", commands: Command[], }
  | { type: "createEntity", fn: (entityId: EntityID) => Command, }
  | { type: "destroyEntity", entityId: EntityID }
  | { type: "undestroyEntity", entityId: EntityID }
  | { type: "addComponent", entityId: EntityID, componentType: ComponentDef<ComponentSchema>, component: FieldValues<ComponentSchema>, }
  | { type: "removeComponent", entityId: EntityID, componentType: ComponentDef<ComponentSchema>, }
  | { type: "setField", entityId: EntityID, componentType: ComponentDef<ComponentSchema>, field: string, value: number, };

export namespace Command {
  export function noOperation(): Command {
    return { type: "noOperation", };
  }

  export function seq(commands: Command[]): Command {
    return { type: "seq", commands, };
  }

  export function createEntity(fn: (entityId: EntityID) => Command): Command {
    return { type: "createEntity", fn, };
  }

  export function destroyEntity(entityId: EntityID): Command {
    return { type: "destroyEntity", entityId, };
  }

  export function undestroyEntity(entityId: EntityID): Command {
    return { type: "undestroyEntity", entityId, };
  }

  export function addComponent<S extends ComponentSchema>(entityId: EntityID, componentType: ComponentDef<S>, component: FieldValues<S>): Command {
    return { type: "addComponent", entityId, componentType, component, };
  }

  export function removeComponent<S extends ComponentSchema>(entityId: EntityID, componentType: ComponentDef<S>): Command {
    return { type: "removeComponent", entityId, componentType, };
  }

  export function setField<S extends ComponentSchema>(entityId: EntityID, componentType: ComponentDef<S>, field: keyof S, value: number): Command {
    return { type: "setField", entityId, componentType, field: field as string, value, };
  }
}
