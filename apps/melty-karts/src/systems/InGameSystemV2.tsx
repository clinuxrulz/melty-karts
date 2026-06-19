import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { System } from "./System";
import { ComponentRegistry, entityGetComponentData, generateTrackCurve, obtainTrackPtNodes, RenderTrack, ShowAll, TrackState } from "@melty-karts/modelling";
import { Component, createMemo } from "solid-js";
import * as THREE from "three";
import { EntityID } from "@oasys/oecs";
import { Canvas } from "solid-three";

export function createInGameSystemV2(
  componentRegistry: ComponentRegistry,
  ecs: ReactiveECS,
): System {
  let track = createMemo(() => {
    let query = ecs.query(
      componentRegistry.Track
    );
    let result: {
      entityId: EntityID,
      track: TrackState,
    } | undefined = undefined;
    for (let arch of query) {
      for (let i = 0; i < arch.entity_count; ++i) {
        let entityId = arch.entity_ids[i] as EntityID;
        let trackState = entityGetComponentData(ecs, entityId, componentRegistry.Track);
        if (trackState === undefined) {
          continue;
        }
        if (result !== undefined) {
          return undefined;
        }
        result = {
          entityId,
          track: trackState
        };
      }
    }
    return result;
  });
  let trackPtNodes = createMemo(() => {
    let trackId = track()?.entityId;
    if (trackId === undefined) {
      return undefined;
    }
    return obtainTrackPtNodes({
      componentRegistry,
      ecs,
      trackId,
    })
  });
  let curve = createMemo(() => {
    let trackPtNodes2 = trackPtNodes();
    if (trackPtNodes2 === undefined) {
      return undefined;
    }
    return generateTrackCurve({
      trackPtNodes: trackPtNodes2,
    });
  });
  let UI: Component = () => {
    return (
      <ShowAll whenAll={[ track, trackPtNodes, curve, ]}>
        {([ track, trackPtNodes, curve, ]) => (
          <Canvas
            ref={(ref) => {
              ref.camera.position.set(5, 5, 5);
              ref.camera.lookAt(new THREE.Vector3(0.0, 0.0, 0.0));
            }}
            style={{
              "width": "100%",
              "height": "100%",
            }}
          >
            <RenderTrack
              ref={() => {}}
              track={track().track}
              trackPtNodes={trackPtNodes()}
              curve={curve()}
              isSelected={false}
            />
          </Canvas>
        )}
      </ShowAll>
    );
  };
  return {
    ui: () => UI,
  };
}
