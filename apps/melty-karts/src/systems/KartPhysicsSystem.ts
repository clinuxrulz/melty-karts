import * as THREE from "three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import {
  RegisteredPosition,
  RegisteredVelocity,
  RegisteredOrientation,
  RegisteredKartConfig,
  RegisteredGlobalGravity,
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
  
  const MAX_SPEED = 30.0;
  const MAX_BOOST_SPEED = 67.5;
  const ACCELERATION = 2.0;
  const DECELERATION = 6.0;
  const TURN_SPEED = 3.0;
  const FRICTION = 0.98;
  const DRIFT_FRICTION = 0.96;
  const LATERAL_FRICTION = 0.92;
  
// DEBUG: Wheel offsets definition - START
const wheelOffsets = [
  new THREE.Vector3(-WHEEL_OFFSET_X, WHEEL_OFFSET_Y, WHEEL_OFFSET_Z),
  new THREE.Vector3(WHEEL_OFFSET_X, WHEEL_OFFSET_Y, WHEEL_OFFSET_Z),
  new THREE.Vector3(-WHEEL_OFFSET_X, WHEEL_OFFSET_Y, -WHEEL_OFFSET_Z),
  new THREE.Vector3(WHEEL_OFFSET_X, WHEEL_OFFSET_Y, -WHEEL_OFFSET_Z),
];
// DEBUG: Wheel offsets definition - END
  
  let currentSpeed = 0;
  let driftCharge = 0;
  let isDrifting = false;
  let driftDirection = 0;
  let suspensionCompression = [0, 0, 0, 0];
  let prevSuspensionCompression = [0, 0, 0, 0];
  let verticalVelocity = 0;
  
  return {
    update(dt: number) {
      const gravity = ecs.resource(RegisteredGlobalGravity);
      const gravityY = gravity.get("y");
      
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

      const kartPos = new THREE.Vector3(posX, posY, posZ);
      const kartVel = new THREE.Vector3(velX, velY, velZ);
      const q = new THREE.Quaternion(qX, qY, qZ, qW);

      let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      forward.y = 0;
      forward.normalize();

      let right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      right.y = 0;
      right.normalize();

      const actualSpeed = Math.sqrt(kartVel.x * kartVel.x + kartVel.z * kartVel.z);
      currentSpeed = actualSpeed;
      
      let maxSpeed = MAX_SPEED;
      if (driftCharge > 0) {
        maxSpeed = MAX_BOOST_SPEED;
      }

      let newSpeed = speed;

      if (actionDown()) {
        newSpeed = Math.min(speed + ACCELERATION * dt, maxSpeed);
      } else {
        newSpeed = Math.max(speed - DECELERATION * dt, 0);
      }

      ecs.set_field(entityId, RegisteredKartConfig, "speed", newSpeed);

      let steering = -turnAmount() * TURN_SPEED * dt;
      let turnDirection = 0;
      if (turnAmount() < -0.1) {
        turnDirection = -1;
      } else if (turnAmount() > 0.1) {
        turnDirection = 1;
      }

      const isDriftInput = driftDown() && turnDirection !== 0 && actualSpeed > 3;
      
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
      }
      
      if (isDrifting) {
        driftCharge += dt;
        const driftTurnAmount = steering * 2.5;
        const driftQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), driftTurnAmount);
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

      let targetVel = newForward.multiplyScalar(newSpeed);
      
      const friction = isDrifting ? DRIFT_FRICTION : FRICTION;
      
      const forwardVel = newForward.clone().multiplyScalar(kartVel.dot(newForward));
      const lateralVel = kartVel.clone().sub(forwardVel).multiplyScalar(LATERAL_FRICTION);
      
      let newVel = forwardVel.add(lateralVel);
      
      const speedFactor = newVel.length() > 0.01 ? friction : 1;
      newVel.multiplyScalar(speedFactor);
      
      newVel.x += (targetVel.x - newVel.x) * (1 - friction) * dt * 10;
      newVel.z += (targetVel.z - newVel.z) * (1 - friction) * dt * 10;

      const maxSpeedCap = isDrifting && driftCharge > 1.5 ? MAX_BOOST_SPEED : MAX_SPEED;
      const velMagnitude = Math.sqrt(newVel.x * newVel.x + newVel.z * newVel.z);
      if (velMagnitude > maxSpeedCap) {
        const scale = maxSpeedCap / velMagnitude;
        newVel.x *= scale;
        newVel.z *= scale;
      }

      let newPos = kartPos.add(newVel.clone().multiplyScalar(dt));
      
      const trackCurve = getTrackCurveForPhysics();
      
      // Barrier collision detection
      if (trackCurve) {
        const trackHalfWidth = TRACK_WIDTH / 2;
        const distToTrack = getDistanceToTrackCenter(newPos.x, newPos.z);
        const barrierRadius = trackHalfWidth; // Strict barrier
        
        if (distToTrack > barrierRadius && distToTrack < 50 && Number.isFinite(newPos.x) && Number.isFinite(newPos.z)) {
          // Find nearest point on track
          const segments = 800; // Increased segments for better accuracy
          let nearestX = 0, nearestZ = 0, minDist = Infinity;
          for (let j = 0; j <= segments; j++) {
            const t = j / segments;
            const point = trackCurve.getPointAt(t);
            const dx = point.x - newPos.x;
            const dz = point.z - newPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
              minDist = dist;
              nearestX = point.x;
              nearestZ = point.z;
            }
          }
          
          // Normal direction from track center towards kart
          const normalX = (newPos.x - nearestX) / minDist;
          const normalZ = (newPos.z - nearestZ) / minDist;
          
          // Project position back to track boundary
          const overshoot = distToTrack - barrierRadius;
          newPos.x -= normalX * overshoot;
          newPos.z -= normalZ * overshoot;
          
          // Bounce off barrier and penalize speed
          const speed = ecs.entity(entityId).getField(RegisteredKartConfig, "speed");
          if (overshoot > 0.02 && speed > 2) {
            // Calculate bounce: reflect velocity about the barrier normal
            const dot = newVel.x * normalX + newVel.z * normalZ;
            newVel.x = newVel.x - 2 * dot * normalX;
            newVel.z = newVel.z - 2 * dot * normalZ;
            
            // Reduce speed by 30% on collision
            const bouncePenalty = 0.7;
            newVel.x *= bouncePenalty;
            newVel.z *= bouncePenalty;
            
            // Store collision intensity for sound system
            (ecs as any)._lastCollision = Math.min(overshoot * 5 + speed / 40, 1.0);
          }

          // Apply position change
         }
       }
    
      for (let i = 0; i < 4; i++) {
        prevSuspensionCompression[i] = suspensionCompression[i];
      }
      
      let wheelHeights: number[] = [];
      
      for (let i = 0; i < 4; i++) {
        const wheelOffset = wheelOffsets[i].clone();
        wheelOffset.applyQuaternion(q);
        const wheelPos = new THREE.Vector3(newPos.x, newPos.y, newPos.z).add(wheelOffset);
        
        let groundY = getGroundHeight(wheelPos.x, wheelPos.z);

        // If track curve is available, calculate the road height based on lateral distance
        if (trackCurve) {
          const segments = 200; // More segments for better precision
          let minDist = Infinity;
          let nearestY = 0;
          for (let j = 0; j <= segments; j++) {
            const t = j / segments;
            const trackPoint = trackCurve.getPointAt(t);
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
          let height = groundY;
          
          if (minDist <= halfWidth + blendMargin) {
            const roadSurfaceY = nearestY;
            if (minDist <= halfWidth) {
              height = roadSurfaceY;
            } else {
              const blendFactor = (minDist - halfWidth) / blendMargin;
              height = (roadSurfaceY * (1 - blendFactor)) + (height * blendFactor);
            }
          }
          groundY = Math.max(height, nearestY);
        }

        const targetWheelY = groundY + WHEEL_RADIUS + SUSPENSION_REST_LENGTH;
        
        wheelHeights.push(targetWheelY);
      }
      
      const frontAvgHeight = (wheelHeights[0] + wheelHeights[1]) / 2;
      const backAvgHeight = (wheelHeights[2] + wheelHeights[3]) / 2;
      const leftAvgHeight = (wheelHeights[0] + wheelHeights[2]) / 2;
      const rightAvgHeight = (wheelHeights[1] + wheelHeights[3]) / 2;
      
      const avgHeight = (frontAvgHeight + backAvgHeight) / 2;
      const targetY = avgHeight - WHEEL_OFFSET_Y;
      
      const suspensionError = targetY - newPos.y;
      const springForce = (suspensionError * SUSPENSION_STRENGTH) - (verticalVelocity * SUSPENSION_DAMPER);
      verticalVelocity += springForce * dt;
      newPos.y += verticalVelocity * dt;
      
      const targetPitch = Math.atan2(backAvgHeight - frontAvgHeight, WHEEL_OFFSET_Z * 2);
      const targetRoll = Math.atan2(rightAvgHeight - leftAvgHeight, WHEEL_OFFSET_X * 2);
      
      const currentEuler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      const smoothFactor = Math.min(1, dt * 8);
      currentEuler.x = THREE.MathUtils.lerp(currentEuler.x, targetPitch, smoothFactor);
      currentEuler.z = THREE.MathUtils.lerp(currentEuler.z, targetRoll, smoothFactor);
      
      q.setFromEuler(currentEuler);
      
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
    },
  };
}
