import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { EntityID } from "@oasys/oecs";
import { System } from "./System";
import {
  RegisteredRaceStats,
  RegisteredAIControlled,
  RegisteredPosition,
  RegisteredRaceRankings,
  MAX_LAPS,
  RegisteredLocalPlayerPosition,
  RegisteredRaceResults,
} from "../World";
import { getTrackCurveForPhysics, trackGetClosestTToPointUsingLastT } from "../models/Track";
import * as THREE from "three";

export function createRaceSystem(ecs: ReactiveECS): System {
  return {
    update(dt: number) {
      const trackCurve = getTrackCurveForPhysics();
      if (!trackCurve) return;

      const entities: { id: EntityID; progress: number; finished: number; rank: number }[] = [];
      let allFinished = true;

      for (const arch of ecs.query(RegisteredRaceStats, RegisteredPosition)) {
        const entityIds = arch.entity_ids;
        for (let i = 0; i < arch.entity_count; i++) {
          const entityId = entityIds[i] as EntityID;
          const entity = ecs.entity(entityId);
          
          let laps = entity.getField(RegisteredRaceStats, "laps");
          let lastT = entity.getField(RegisteredRaceStats, "lastT");
          let finished = entity.getField(RegisteredRaceStats, "finished");
          let rank = entity.getField(RegisteredRaceStats, "rank");

          const posX = entity.getField(RegisteredPosition, "x");
          const posY = entity.getField(RegisteredPosition, "y");
          const posZ = entity.getField(RegisteredPosition, "z");
          const kartPos = new THREE.Vector3(posX, posY, posZ);

          // Find current T using the optimized lookup
          const currentT = trackGetClosestTToPointUsingLastT(trackCurve, kartPos, lastT);

          // Lap wrapping logic (detect crossing finish line)
          // Finish line is at T=0/1. If we go from ~0.9 to ~0.1, we wrapped forward.
          if (!finished) {
            allFinished = false;
            if (lastT > 0.8 && currentT < 0.2) {
              laps++;
              if (laps >= MAX_LAPS) {
                finished = 1;
                // Once finished, ensure AI takes over
                if (!ecs.entity(entityId).hasComponent(RegisteredAIControlled)) {
                  ecs.add_component(entityId, RegisteredAIControlled, { targetT: currentT });
                }
              }
            } else if (lastT < 0.2 && currentT > 0.8) {
              // Backward wrap (optional: penalize or just ignore)
              laps = Math.max(0, laps - 1);
            }
          }

          const progress = finished ? MAX_LAPS : laps + currentT;

          ecs.set_field(entityId, RegisteredRaceStats, "laps", laps);
          ecs.set_field(entityId, RegisteredRaceStats, "lastT", currentT);
          ecs.set_field(entityId, RegisteredRaceStats, "progress", progress);
          ecs.set_field(entityId, RegisteredRaceStats, "finished", finished);

          entities.push({ id: entityId, progress, finished, rank });
        }
      }

      // First pass: identify how many have already finished and what ranks are taken
      const finishedEntities = entities.filter(e => e.finished);
      const activeEntities = entities.filter(e => !e.finished);
      
      // Assign ranks to newly finished entities
      finishedEntities.forEach(ent => {
        if (ent.rank === 0) {
          // Find the next available rank
          const takenRanks = entities.map(e => e.rank).filter(r => r > 0);
          const nextRank = takenRanks.length > 0 ? Math.max(...takenRanks) + 1 : 1;
          ent.rank = nextRank;
          ecs.set_field(ent.id, RegisteredRaceStats, "rank", nextRank);
        }
      });

      // Update Rankings
      // Sort finished players by rank, and active players by progress
      entities.sort((a, b) => {
        if (a.finished && b.finished) {
          return a.rank - b.rank;
        }
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      });

      const rankings: Record<string, number> = {};
      entities.forEach((ent, index) => {
        const currentRank = index + 1;
        rankings[`rank${currentRank}`] = Number(ent.id);
        
        // Update individual rank if it has LocalPlayerPosition component
        if (ecs.entity(ent.id).hasComponent(RegisteredLocalPlayerPosition)) {
          ecs.set_field(ent.id, RegisteredLocalPlayerPosition, "rank", currentRank);
        }
      });

       ecs.set_resource(RegisteredRaceRankings, {
        rank1: rankings.rank1 ?? -1,
        rank2: rankings.rank2 ?? -1,
        rank3: rankings.rank3 ?? -1,
        rank4: rankings.rank4 ?? -1,
        rank5: rankings.rank5 ?? -1,
        rank6: rankings.rank6 ?? -1,
      });

      //console.log("RaceSystem: Updated rankings:", Array.from(rankings.entries()));

      // Check if all players finished - set race results
      if (allFinished && entities.length > 0) {
        const results = ecs.resource(RegisteredRaceResults);
        if (results.get("finished") === 0) {
          ecs.set_resource(RegisteredRaceResults, { finished: 1 });
        }
      }
    },
  };
}
