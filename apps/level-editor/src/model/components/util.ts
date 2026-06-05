import { ComponentDef } from "@oasys/oecs";

type ComponentDefGetSchemaType<C> = C extends ComponentDef<infer S> ? S : never;

export type ComponentDefGetDataType<C> = {
  [k in keyof ComponentDefGetSchemaType<C>]: number
};
