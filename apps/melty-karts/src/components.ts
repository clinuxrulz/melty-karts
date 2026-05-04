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

export type PlayerTypeEnum = 0 | 1 | 2;
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

export const AIControlled = {
    def: {
        targetT: "f64", // Progress along the track curve (0 to 1)
    } as const,
    schema: {
        targetT: 0.0,
    },
    name: "AIControlled",
};

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

export const KartRuntime = {
    def: {
        driftCharge: "f64",
        isDrifting: "u8",
        driftDirection: "i8",
        verticalVelocity: "f64",
    } as const,
    schema: {
        driftCharge: 0.0,
        isDrifting: 0,
        driftDirection: 0,
        verticalVelocity: 0.0,
    },
    name: "KartRuntime",
};

export const NetworkSlot = {
    def: { slot: "u8" } as const,
    schema: { slot: 0 },
    name: "NetworkSlot",
};

export const RaceStats = {
    def: {
        laps: "u8",
        progress: "f64", // Total progress: laps + currentT
        finished: "u8", // 0 or 1
        lastT: "f64",
        rank: "u8", // 0 if not finished, 1-6 if finished
    } as const,
    schema: {
        laps: 0,
        progress: 0.0,
        finished: 0,
        lastT: 0.0,
        rank: 0,
    },
    name: "RaceStats",
};

export const LocalPlayerPosition = {
    def: {
        rank: "u8",
    } as const,
    schema: {
        rank: 0,
    },
    name: "LocalPlayerPosition",
};

export const GlobalGravity = {
    def: { x: "f64", y: "f64", z: "f64" } as const,
    schema: { x: 0.0, y: -10.0, z: 0.0 },
    name: "GlobalGravity"
};
