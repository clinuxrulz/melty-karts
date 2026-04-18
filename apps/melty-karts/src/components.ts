import { type ComponentSchema, type ComponentDef, type ResourceDef } from "@oasys/oecs";

export const Position = {
    def: { x: "f64", y: "f64", z: "f64" } as const,
    schema: { x: 0.0, y: 0.0, z: 0.0 },
    name: "Position"
};

export const Velocity = {
    def: { x: "f64", y: "f64", z: "f64" } as const,
    schema: { x: 0.0, y: 0.0, z: 0.0 },
    name: "Velocity"
};

export const Orientation = {
    def: { x: "f64", y: "f64", z: "f64", w: "f64", } as const,
    schema: { x: 0.0, y: 0.0, z: 0.0, w: 1.0, },
    name: "Orientation",
};

export type PlayerTypeEnum = 0 | 1;
export const PlayerConfig = {
    def: { playerType: "u8", facingForward: "u8" } as const,
    schema: { playerType: 0 as PlayerTypeEnum, facingForward: 0 },
    name: "PlayerConfig"
};

export const InputControlled = {
    def: [] as const,
    schema: {},
    name: "InputControlled"
}

export const Renderable = {
    def: { meshId: "u32" } as const,
    schema: { meshId: 0 },
    name: "Renderable"
};

export const KartConfig = {
    def: { speed: "f64" } as const,
    schema: { speed: 0.0 },
    name: "KartConfig"
};
