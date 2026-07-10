import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { Command } from "./commands";
import { ComponentDef, ComponentSchema, EntityID } from "@oasys/oecs";
import { entityAddChild, entityAddChildBeforeChild, entityRemoveChild } from "@melty-karts/modelling";
import { ComponentRegistry } from "@melty-karts/modelling";

export class CommandExecutor {
  private componentRegistry: ComponentRegistry;
  private ecs: ReactiveECS;
  private freeEntityIdSet = new Set<EntityID>();
  private componentDefToFieldsMap = new Map<ComponentDef<ComponentSchema>,string[]>();

  constructor(
    componentRegistry: ComponentRegistry,
    ecs: ReactiveECS,
  ) {
    this.componentRegistry = componentRegistry;
    this.ecs = ecs;
  }

  private getFreeEntityId(): EntityID | undefined {
    let result: EntityID | undefined = undefined;
    for (let e of this.freeEntityIdSet) {
      result = e;
      break;
    }
    if (result !== undefined) {
      this.freeEntityIdSet.delete(result);
    }
    return result;
  }

  performCommand(command: Command): Command {
    switch (command.type) {
      case "noOperation": {
        return Command.noOperation();
      }
      case "seq": {
        let undoCommands: Command[] = new Array(command.commands.length);
        for (let i = 0; i < command.commands.length; ++i) {
          undoCommands[command.commands.length-1-i] = this.performCommand(command.commands[i]);
        }
        return Command.seq(undoCommands);
      }
      case "createEntity": {
        let entityId = this.getFreeEntityId();
        if (entityId === undefined) {
          entityId = this.ecs.spawn();
        }
        let nextCommand = command.fn(entityId);
        return Command.seq([
          this.performCommand(nextCommand),
          Command.destroyEntity(entityId),
        ]);
      }
      case "destroyEntity": {
        this.freeEntityIdSet.add(command.entityId);
        return Command.undestroyEntity(command.entityId);
      }
      case "undestroyEntity": {
        this.freeEntityIdSet.delete(command.entityId);
        return Command.destroyEntity(command.entityId);
      }
      case "addComponent": {
        {
          let fields = this.componentDefToFieldsMap.get(command.componentType);
          if (fields === undefined) {
            fields = Object.keys(command.component);
            this.componentDefToFieldsMap.set(command.componentType, fields);
          }
        }
        this.ecs.addComponent(command.entityId, command.componentType, command.component);
        return Command.removeComponent(command.entityId, command.componentType);
      }
      case "removeComponent": {
        let oldComponent: any = {};
        for (let field of this.componentDefToFieldsMap.get(command.componentType) ?? []) {
          oldComponent[field] = this.ecs.ecs.getField(command.entityId, command.componentType, field);
        }
        this.ecs.removeComponent(command.entityId, command.componentType);
        return Command.addComponent(command.entityId, command.componentType, oldComponent);
      }
      case "setField": {
        let oldValue = this.ecs.ecs.getField(command.entityId, command.componentType, command.field);
        this.ecs.setField(command.entityId, command.componentType, command.field, command.value);
        return Command.setField(command.entityId, command.componentType, command.field, oldValue);
      }
      case "addChild": {
        entityAddChild(
          this.componentRegistry,
          this.ecs,
          command.entityId,
          command.childEntityId,
        );
        return Command.removeChild(command.childEntityId);
      }
      case "addChildBeforeChild": {
        entityAddChildBeforeChild(
          this.componentRegistry,
          this.ecs,
          command.entityId,
          command.childEntityId,
          command.beforeChildEntityId,
        );
        return Command.removeChild(command.childEntityId);
      }
      case "removeChild": {
        let beforeChildEntityId = this.ecs.ecs.getField(
          command.childEntityId,
          this.componentRegistry.Child,
          "next"
        ) as EntityID | -1;
        let parentEntityId = this.ecs.ecs.getField(
          command.childEntityId,
          this.componentRegistry.Child,
          "parent"
        ) as EntityID;
        entityRemoveChild(this.componentRegistry, this.ecs, command.childEntityId);
        if (beforeChildEntityId === -1) {
          return Command.addChild(
            parentEntityId,
            command.childEntityId,
          );
        } else {
          return Command.addChildBeforeChild(
            parentEntityId,
            command.childEntityId,
            beforeChildEntityId,
          );
        }
      }
      default:
        let x: never = command;
        throw new Error(`Unreachable: ${x}`);
    }
  }
}
