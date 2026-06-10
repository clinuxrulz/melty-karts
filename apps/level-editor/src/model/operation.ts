export type Operation =
  | {
      type: "editTrackNodes",
      trackId: string,
    };

export namespace Operation {
  export function editTrackNodes(trackId: string): Operation {
    return { type: "editTrackNodes", trackId, };
  }
}
