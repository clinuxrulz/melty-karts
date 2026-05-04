import * as THREE from "three";
import { ReactiveECS } from "@melty-karts/reactive-ecs";
import { EntityID } from "@oasys/oecs";
import { System } from "./System";
import {
  RegisteredAIControlled,
  RegisteredPosition,
  RegisteredOrientation,
} from "../World";
import { simulateKartStep } from "./KartPhysicsSystem";
import { getTrackCurveForPhysics } from "../models/Track";

export function createAISystem(ecs: ReactiveECS): System {
  const trackCurve = getTrackCurveForPhysics();

  return {
    update(dt: number) {
      if (!trackCurve) return;

      for (const arch of ecs.query(RegisteredAIControlled)) {
        const entityIds = arch.entity_ids;
        const targetTs = arch.get_column(RegisteredAIControlled, "targetT") as Float64Array;

        for (let i = 0; i < arch.entity_count; i++) {
          const entityId = entityIds[i] as EntityID;
          let currentT = targetTs[i];

          const posX = ecs.entity(entityId).getField(RegisteredPosition, "x");
          const posY = ecs.entity(entityId).getField(RegisteredPosition, "y");
          const posZ = ecs.entity(entityId).getField(RegisteredPosition, "z");
          const kartPos = new THREE.Vector3(posX, posY, posZ);

          // Find the closest point on the track to update currentT
          let bestT = currentT;
          let minDistSq = Infinity;
          
          // Search in a small window around currentT
          for (let step = -0.05; step <= 0.05; step += 0.005) {
            let t = (currentT + step + 1) % 1;
            const p = trackCurve.getPointAt(t);
            const dSq = p.distanceToSquared(kartPos);
            if (dSq < minDistSq) {
              minDistSq = dSq;
              bestT = t;
            }
          }
          currentT = bestT;
          ecs.set_field(entityId, RegisteredAIControlled, "targetT", currentT);

          // Aim for a point further ahead (increasing T)
          const lookAheadT = (currentT + 0.01) % 1;
          const targetPos = trackCurve.getPointAt(lookAheadT);

          // Calculate steering
          const qX = ecs.entity(entityId).getField(RegisteredOrientation, "x");
          const qY = ecs.entity(entityId).getField(RegisteredOrientation, "y");
          const qZ = ecs.entity(entityId).getField(RegisteredOrientation, "z");
          const qW = ecs.entity(entityId).getField(RegisteredOrientation, "w");
          const q = new THREE.Quaternion(qX, qY, qZ, qW);

          const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
          forward.y = 0;
          forward.normalize();

          const toTarget = new THREE.Vector3().subVectors(targetPos, kartPos);
          toTarget.y = 0;
          toTarget.normalize();

          const cross = new THREE.Vector3().crossVectors(forward, toTarget);
          const dot = forward.dot(toTarget);
          
          let steerAmount = 0;
          if (dot < 0.9999) {
            // Use atan2 for more precise angle-based steering
            // cross.y > 0 means target is to the left
            // turnAmount < 0 is a left turn in KartPhysicsSystem
            const angle = Math.atan2(cross.y, dot);
            steerAmount = THREE.MathUtils.clamp(-angle * 2.0, -1, 1);
          }

          simulateKartStep({
            ecs,
            entityId,
            dt,
            turnAmount: steerAmount,
            upDown: true,
            downDown: false,
            actionDown: true,
            driftDown: false,
          });
        }
      }
    },
  };
}
