import { Accessor, Component } from "solid-js";

export type System = {
  update?: (dt: number) => void;
  ui?: Accessor<Component | undefined>;
  subsystems?: Accessor<System[]>;
}
