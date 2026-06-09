import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { Command } from "./commands";
import { ComponentDef, ComponentSchema, EntityID } from "@oasys/oecs";

export class CommandExecutor {
  private ecs: ReactiveECS;
  private freeEntityIdSet = new Set<EntityID>();
  private componentDefToFieldsMap = new Map<ComponentDef<ComponentSchema>,string[]>();

  constructor(ecs: ReactiveECS) {
    this.ecs = ecs;
  }

  private getFreeEntityId(): EntityID | undefined {
    for (let e of this.freeEntityIdSet) {
      return e;
    }
    return undefined;
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
          entityId = this.ecs.create_entity();
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
        this.ecs.add_component(command.entityId, command.componentType, command.component);
        return Command.removeComponent(command.entityId, command.componentType);
      }
      case "removeComponent": {
        let oldComponent: any = {};
        for (let field of this.componentDefToFieldsMap.get(command.componentType) ?? []) {
          oldComponent[field] = this.ecs.ecs.get_field(command.entityId, command.componentType, field);
        }
        this.ecs.remove_component(command.entityId, command.componentType);
        return Command.addComponent(command.entityId, command.componentType, oldComponent);
      }
      case "setField": {
        let oldValue = this.ecs.ecs.get_field(command.entityId, command.componentType, command.field);
        this.ecs.set_field(command.entityId, command.componentType, command.field, command.value);
        return Command.setField(command.entityId, command.componentType, command.field, oldValue);
      }
      default:
        let x: never = command;
        throw new Error(`Unreachable: ${x}`);
    }
  }
}
