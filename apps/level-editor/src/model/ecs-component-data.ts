import { ComponentDef, ComponentSchema, FieldValues } from "@oasys/oecs";

export type IsEcsComponentType = ComponentDef;

export interface IsEcsComponentData {
  def: ComponentDef,
  data: FieldValues<ComponentSchema>,
}

export class EcsComponentData<S extends ComponentSchema> implements IsEcsComponentData {
  def: ComponentDef;
  data: FieldValues<S>;

  constructor(def: ComponentDef<S>, data: FieldValues<S>) {
    this.def = def as ComponentDef;
    this.data = data;
  }
};