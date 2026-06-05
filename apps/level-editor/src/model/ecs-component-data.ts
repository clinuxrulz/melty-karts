import { ComponentDef, ComponentSchema, FieldValues } from "@oasys/oecs";

export interface IsEcsComponentData {
  def: ComponentDef<ComponentSchema>,
  data: FieldValues<ComponentSchema>,
}

export class EcsComponentData<S extends ComponentSchema> implements IsEcsComponentData {
  def: ComponentDef<S>;
  data: FieldValues<S>;

  constructor(def: ComponentDef<S>, data: FieldValues<S>) {
    this.def = def;
    this.data = data;
  }
};