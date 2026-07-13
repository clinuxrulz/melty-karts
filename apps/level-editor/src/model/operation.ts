export type Operation =
  | {
      type: "editTrackNodes",
      trackId: string,
    }
  | {
      type: "insertModel",
    };

export namespace Operation {
  export function editTrackNodes(trackId: string): Operation {
    return { type: "editTrackNodes", trackId, };
  }

  export function insertModel(): Operation {
    return { type: "insertModel", };
  }
}
