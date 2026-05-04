import * as THREE from "three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import {
  RegisteredPosition,
  RegisteredVelocity,
  RegisteredOrientation,
  RegisteredKartConfig,
  RegisteredKartRuntime,
  RegisteredGlobalGravity,
  RegisteredPreReadySteadyGoDelayFinished,
  RegisteredInGameState,
  ReadySteadyGoStage,
} from "../World";
import { EntityID } from "@oasys/oecs";
import { Accessor } from "solid-js";
import { getGroundHeight, getTrackCurveForPhysics, TRACK_WIDTH, getDistanceToTrackCenter } from "../models/Track";

// DEBUG: Wheel physics constants - START
export const WHEEL_OFFSET_X = 0.45;  // Doubled from 0.35
export const WHEEL_OFFSET_Z = 0.45;  // Doubled from 0.4
export const WHEEL_OFFSET_Y = 0.25;   // Vertical offset from kart center
export const SUSPENSION_REST_LENGTH = 0.15;
export const SUSPENSION_STRENGTH = 200.0;
export const SUSPENSION_DAMPER = 10.0;
export const KART_MASS = 1.0;
export const WHEEL_RADIUS = 0.1;
// DEBUG: Wheel physics constants - END

export function createKartPhysicsSystem(params: {
  ecs: ReactiveECS,
  entityId: EntityID,
  turnAmount: Accessor<number>,
  upDown: Accessor<boolean>,
  downDown: Accessor<boolean>,
  actionDown: Accessor<boolean>,
  driftDown: Accessor<boolean>,
}) {
  let { ecs, entityId, turnAmount, upDown, downDown, actionDown, driftDown, } = params;
  
  return {
    update(dt: number) {
      simulateKartStep({
        ecs,
        entityId,
        dt,
        turnAmount: turnAmount(),
        upDown: upDown(),
        downDown: downDown(),
        actionDown: actionDown(),
        driftDown: driftDown(),
      });
    },
  };
}

export type KartInputState = {
  turnAmount: number;
  upDown: boolean;
  downDown: boolean;
  actionDown: boolean;
  driftDown: boolean;
};

const MAX_SPEED = 35.0;
const MAX_BOOST_SPEED = 67.5;
const ACCELERATION = 15.0;
const DECELERATION = 10.0;
const TURN_SPEED = 3.0;
const DRIFT_FRICTION = 0.96;
const LATERAL_FRICTION = 0.92;
const GRIP_STRENGTH = 12.0;

const wheelOffsets = [
  new THREE.Vector3(-WHEEL_OFFSET_X, WHEEL_OFFSET_Y, WHEEL_OFFSET_Z),
  new THREE.Vector3(WHEEL_OFFSET_X, WHEEL_OFFSET_Y, WHEEL_OFFSET_Z),
  new THREE.Vector3(-WHEEL_OFFSET_X, WHEEL_OFFSET_Y, -WHEEL_OFFSET_Z),
  new THREE.Vector3(WHEEL_OFFSET_X, WHEEL_OFFSET_Y, -WHEEL_OFFSET_Z),
];

export function simulateKartStep(params: {
  ecs: ReactiveECS,
  entityId: EntityID,
  dt: number,
} & KartInputState): void {
  const { ecs, entityId, dt, turnAmount, actionDown, driftDown } = params;

  {
    let preReadySteadyGoFinished = ecs.resource(RegisteredPreReadySteadyGoDelayFinished).get("value");
    if (!preReadySteadyGoFinished) {
      return;
    }
    let isReadySteadyGo = ecs.resource(RegisteredInGameState).get("isReadySteadyGo");
    if (isReadySteadyGo) {
      let isGo = ecs.resource(RegisteredInGameState).get("readySteadyGoStage") == ReadySteadyGoStage.GO;
      if (!isGo) {
        return;
      }
    }
  }

  const gravityY = ecs.resource(RegisteredGlobalGravity).get("y");

  const posX = ecs.entity(entityId).getField(RegisteredPosition, "x");
  const posY = ecs.entity(entityId).getField(RegisteredPosition, "y");
  const posZ = ecs.entity(entityId).getField(RegisteredPosition, "z");

  const velX = ecs.entity(entityId).getField(RegisteredVelocity, "x");
  const velY = ecs.entity(entityId).getField(RegisteredVelocity, "y");
  const velZ = ecs.entity(entityId).getField(RegisteredVelocity, "z");

  const qX = ecs.entity(entityId).getField(RegisteredOrientation, "x");
  const qY = ecs.entity(entityId).getField(RegisteredOrientation, "y");
  const qZ = ecs.entity(entityId).getField(RegisteredOrientation, "z");
  const qW = ecs.entity(entityId).getField(RegisteredOrientation, "w");

  const speed = ecs.entity(entityId).getField(RegisteredKartConfig, "speed");
  let driftCharge = ecs.entity(entityId).getField(RegisteredKartRuntime, "driftCharge");
  let isDrifting = ecs.entity(entityId).getField(RegisteredKartRuntime, "isDrifting") !== 0;
  let driftDirection = ecs.entity(entityId).getField(RegisteredKartRuntime, "driftDirection");
  let verticalVelocity = ecs.entity(entityId).getField(RegisteredKartRuntime, "verticalVelocity");

  const kartPos = new THREE.Vector3(posX, posY, posZ);
  const kartVel = new THREE.Vector3(velX, velY, velZ);
  const q = new THREE.Quaternion(qX, qY, qZ, qW);

  const actualSpeed = Math.sqrt(kartVel.x * kartVel.x + kartVel.z * kartVel.z);

  let maxSpeed = MAX_SPEED;
  if (driftCharge > 0) {
    maxSpeed = MAX_BOOST_SPEED;
  }

  let newSpeed = actionDown
    ? Math.min(speed + ACCELERATION * dt, maxSpeed)
    : Math.max(speed - DECELERATION * dt, 0);

  let steering = -turnAmount * TURN_SPEED * dt;
  let turnDirection = 0;
  if (turnAmount < -0.1) {
    turnDirection = -1;
  } else if (turnAmount > 0.1) {
    turnDirection = 1;
  }

  const isDriftInput = driftDown && turnDirection !== 0 && actualSpeed > 3;

  if (isDriftInput && !isDrifting) {
    isDrifting = true;
    driftDirection = turnDirection;
    driftCharge = 0;
  } else if (!isDriftInput && isDrifting) {
    if (driftCharge > 1.5) {
      newSpeed = Math.min(newSpeed * 1.5, MAX_BOOST_SPEED);
    }
    isDrifting = false;
    driftCharge = 0;
    driftDirection = 0;
  }

  if (isDrifting) {
    driftCharge += dt;
    const driftQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steering * 2.5);
    q.multiply(driftQ);
  } else if (actualSpeed > 0.1) {
    const steerAmount = steering * (newSpeed / MAX_SPEED);
    const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steerAmount);
    q.multiply(steerQ);
  }

  q.normalize();

  const newForward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  newForward.y = 0;
  newForward.normalize();

  const targetVel = newForward.clone().multiplyScalar(newSpeed);
  
  // Apply lateral friction to allow for some "drifting" (sideways sliding)
  // Scaling lateral friction by dt for frame-rate independence
  const latFric = Math.pow(LATERAL_FRICTION, dt * 60);
  const forwardVelComponent = kartVel.dot(newForward);
  const forwardVel = newForward.clone().multiplyScalar(forwardVelComponent);
  const lateralVel = kartVel.clone().sub(forwardVel).multiplyScalar(latFric);

  // Reconstruct velocity and smoothly interpolate towards the target speed/direction
  // Use a responsive lerp that depends on dt
  const combinedVel = forwardVel.add(lateralVel);
  const lerpFactor = 1 - Math.exp(-GRIP_STRENGTH * dt);
  const newVel = combinedVel.lerp(targetVel, lerpFactor);

  // Apply a small amount of speed-independent drag if not accelerating
  if (!actionDown && newSpeed < 0.1) {
    newVel.multiplyScalar(Math.pow(0.95, dt * 60));
  }

  const maxSpeedCap = isDrifting && driftCharge > 1.5 ? MAX_BOOST_SPEED : MAX_SPEED;
  const velMagnitude = Math.sqrt(newVel.x * newVel.x + newVel.z * newVel.z);
  if (velMagnitude > maxSpeedCap) {
    const scale = maxSpeedCap / velMagnitude;
    newVel.x *= scale;
    newVel.z *= scale;
  }

  const newPos = kartPos.add(newVel.clone().multiplyScalar(dt));
  const trackCurve = getTrackCurveForPhysics();

  if (trackCurve) {
    const barrierRadius = TRACK_WIDTH / 2;
    const distToTrack = getDistanceToTrackCenter(newPos.x, newPos.z);
    if (distToTrack > barrierRadius && distToTrack < 50 && Number.isFinite(newPos.x) && Number.isFinite(newPos.z)) {
      // Find nearest point - Track is segmented so we can use a fast local search
      // (Simplified search using the approximated points from Track.ts)
      let nearestX = 0;
      let nearestZ = 0;
      let minDist = Infinity;
      
      // Get the current progress (T) to narrow search if available
      // but getDistanceToTrackCenter already did the heavy lifting
      // We'll use the track points directly for the collision normal
      for (let j = 0; j <= 800; j++) {
        const point = trackCurve.getPointAt(j / 800);
        const dx = point.x - newPos.x;
        const dz = point.z - newPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) {
          minDist = dist;
          nearestX = point.x;
          nearestZ = point.z;
        }
      }

      const normalX = (newPos.x - nearestX) / minDist;
      const normalZ = (newPos.z - nearestZ) / minDist;
      const overshoot = distToTrack - barrierRadius;
      newPos.x -= normalX * overshoot;
      newPos.z -= normalZ * overshoot;

      if (overshoot > 0.02 && newSpeed > 2) {
        const dot = newVel.x * normalX + newVel.z * normalZ;
        newVel.x = (newVel.x - 2 * dot * normalX) * 0.3;
        newVel.z = (newVel.z - 2 * dot * normalZ) * 0.3;
        (ecs as any)._lastCollision = Math.min(overshoot * 5 + newSpeed / 40, 1.0);
      }
    }
  }

  const wheelHeights: number[] = [];
  for (let i = 0; i < 4; i++) {
    const wheelOffset = wheelOffsets[i].clone().applyQuaternion(q);
    const wheelPos = new THREE.Vector3(newPos.x, newPos.y, newPos.z).add(wheelOffset);
    let groundY = getGroundHeight(wheelPos.x, wheelPos.z);

    if (trackCurve) {
      // For wheel height, we only need to check if we are near the track height
      const dToCenter = getDistanceToTrackCenter(wheelPos.x, wheelPos.z);
      if (dToCenter <= TRACK_WIDTH / 2 + 3.0) {
          // Use track height if on/near track
          // A more optimized way would be to get the T from the j above
          // but for now this is consistent
          let minDist = Infinity;
          let nearestY = 0;
          for (let j = 0; j <= 200; j++) {
            const trackPoint = trackCurve.getPointAt(j / 200);
            const dx = trackPoint.x - wheelPos.x;
            const dz = trackPoint.z - wheelPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
              minDist = dist;
              nearestY = trackPoint.y;
            }
          }

          const halfWidth = TRACK_WIDTH / 2;
          const blendMargin = 3.0;
          let h = groundY;
          if (minDist <= halfWidth + blendMargin) {
            if (minDist <= halfWidth) {
              h = nearestY;
            } else {
              const blendFactor = (minDist - halfWidth) / blendMargin;
              h = (nearestY * (1 - blendFactor)) + (h * blendFactor);
            }
          }
          groundY = Math.max(h, nearestY);
      }
    }

    wheelHeights.push(groundY + WHEEL_RADIUS + SUSPENSION_REST_LENGTH);
  }

  const frontAvgHeight = (wheelHeights[0] + wheelHeights[1]) / 2;
  const backAvgHeight = (wheelHeights[2] + wheelHeights[3]) / 2;
  const leftAvgHeight = (wheelHeights[0] + wheelHeights[2]) / 2;
  const rightAvgHeight = (wheelHeights[1] + wheelHeights[3]) / 2;

  const targetY = ((frontAvgHeight + backAvgHeight) / 2) - WHEEL_OFFSET_Y;
  const suspensionError = targetY - newPos.y;
  const springForce = (suspensionError * SUSPENSION_STRENGTH) - (verticalVelocity * SUSPENSION_DAMPER);
  verticalVelocity += (springForce + gravityY * KART_MASS) * dt;
  newPos.y += verticalVelocity * dt;

  const targetPitch = Math.atan2(backAvgHeight - frontAvgHeight, WHEEL_OFFSET_Z * 2);
  const targetRoll = Math.atan2(rightAvgHeight - leftAvgHeight, WHEEL_OFFSET_X * 2);
  const currentEuler = new THREE.Euler().setFromQuaternion(q, "YXZ");
  const smoothFactor = Math.min(1, dt * 8);
  currentEuler.x = THREE.MathUtils.lerp(currentEuler.x, targetPitch, smoothFactor);
  currentEuler.z = THREE.MathUtils.lerp(currentEuler.z, targetRoll, smoothFactor);
  q.setFromEuler(currentEuler);

  ecs.set_field(entityId, RegisteredKartConfig, "speed", newSpeed);
  ecs.set_field(entityId, RegisteredKartRuntime, "driftCharge", driftCharge);
  ecs.set_field(entityId, RegisteredKartRuntime, "isDrifting", isDrifting ? 1 : 0);
  ecs.set_field(entityId, RegisteredKartRuntime, "driftDirection", driftDirection);
  ecs.set_field(entityId, RegisteredKartRuntime, "verticalVelocity", verticalVelocity);
  ecs.set_field(entityId, RegisteredOrientation, "x", q.x);
  ecs.set_field(entityId, RegisteredOrientation, "y", q.y);
  ecs.set_field(entityId, RegisteredOrientation, "z", q.z);
  ecs.set_field(entityId, RegisteredOrientation, "w", q.w);
  ecs.set_field(entityId, RegisteredVelocity, "x", newVel.x);
  ecs.set_field(entityId, RegisteredVelocity, "y", newVel.y);
  ecs.set_field(entityId, RegisteredVelocity, "z", newVel.z);
  ecs.set_field(entityId, RegisteredPosition, "x", newPos.x);
  ecs.set_field(entityId, RegisteredPosition, "y", newPos.y);
  ecs.set_field(entityId, RegisteredPosition, "z", newPos.z);
}
