import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { ComponentDef, ComponentSchema, EntityID } from "@oasys/oecs";

enum CommandType {
  CreateEntity = 0,
  DestroyEntity = 1,
  AddComponent = 2,
  RemoveComponent = 3,
  SetField = 4,
  Defer = 5,
}

class EcsCommand {
  type: CommandType;
  callback: ((entityId: EntityID) => void) | (() => void) | undefined;
  entityId: EntityID | undefined;
  def: ComponentDef | undefined;
  field: string | undefined;
  value: object | number | undefined;

  constructor(
    type: CommandType,
    callback: ((entityId: EntityID) => void) | (() => void) | undefined,
    entityId: EntityID | undefined,
    def: ComponentDef | undefined,
    field: string | undefined,
    value: object | number | undefined,
  ) {
    this.type = type;
    this.callback = callback;
    this.entityId = entityId;
    this.def = def;
    this.field = field;
    this.value = value;
  }

}

export class EcsCommands {
  private commands: EcsCommand[] = new Array(128).fill(undefined).map(() => new EcsCommand(CommandType.CreateEntity, undefined, undefined, undefined, undefined, undefined));
  private commandsSize: number = 0;

  private addCommand(
    type: CommandType,
    callback: ((entityId: EntityID) => void) | undefined,
    entityId: EntityID | undefined,
    def: ComponentDef | undefined,
    field: string | undefined,
    value: object | number | undefined,
  ): void {
    if (this.commandsSize === this.commands.length) {
      let newCommands = new Array(this.commands.length << 1);
      for (let i = 0; i < this.commands.length; ++i) {
        newCommands[i] = this.commands[i];
      }
      for (let i = this.commands.length; i < newCommands.length; ++i) {
        newCommands[i] = new EcsCommand(CommandType.CreateEntity, undefined, undefined, undefined, undefined, undefined);
      }
    }
    let command = this.commands[this.commandsSize];
    this.commandsSize++;
    command.type = type;
    command.callback = callback;
    command.entityId = entityId;
    command.def = def;
    command.field = field;
    command.value = value;
  }

  createEntity(fn: (entityId: EntityID) => void): void {
    this.addCommand(
      CommandType.CreateEntity,
      fn,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  }

  destroy_entity(entityId: EntityID): void {
    this.addCommand(
      CommandType.DestroyEntity,
      undefined,
      entityId,
      undefined,
      undefined,
      undefined,
    );
  }

  addComponent<S extends ComponentSchema, S2 extends { [k in keyof S]: number }>(entityId: EntityID, def: ComponentDef<S>, s: S2): void {
    this.addCommand(
      CommandType.AddComponent,
      undefined,
      entityId,
      def as ComponentDef,
      undefined,
      s,
    );
  }

  removeComponent<S extends ComponentSchema>(entityId: EntityID, def: ComponentDef<S>): void {
    this.addCommand(
      CommandType.RemoveComponent,
      undefined,
      entityId,
      def as ComponentDef,
      undefined,
      undefined,
    );
  }

  setField<S extends ComponentSchema, K extends keyof S>(entityId: EntityID, def: ComponentDef<S>, field: K, value: number): void {
    this.addCommand(
      CommandType.SetField,
      undefined,
      entityId,
      def as ComponentDef,
      field as string,
      value,
    );
  }

  defer(fn: () => void) {
    this.addCommand(
      CommandType.Defer,
      fn,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  }

  executeCommands(ecs: ReactiveECS) {
    for (let i = 0; i < this.commandsSize; ++i) {
      let command = this.commands[i];
      switch (command.type) {
        case CommandType.CreateEntity: {
          let entityId = ecs.spawn();
          command.callback!(entityId);
          break;
        }
        case CommandType.DestroyEntity: {
          ecs.despawn(command.entityId!);
          break;
        }
        case CommandType.AddComponent: {
          ecs.addComponent(command.entityId!, command.def! as any, command.value as any);
          break;
        }
        case CommandType.RemoveComponent: {
          ecs.removeComponent(command.entityId!, command.def!);
          break;
        }
        case CommandType.SetField: {
          ecs.setField(command.entityId!, command.def! as any, command.field!, command.value as number);
          break;
        }
        case CommandType.Defer: {
          (command.callback! as () => void)();
          break;
        }
      }
    }
    this.commandsSize = 0;
  }
}

