import * as THREE from "three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import {
  RegisteredPosition,
  RegisteredVelocity,
  RegisteredOrientation,
  RegisteredKartConfig,
} from "../World";
import { EntityID } from "@oasys/oecs";
import { Accessor } from "solid-js";
import { getGroundHeight } from "../models/Track";

export function createKartPhysicsSystem(params: {
  ecs: ReactiveECS,
  entityId: EntityID,
  leftDown: Accessor<boolean>,
  rightDown: Accessor<boolean>,
  upDown: Accessor<boolean>,
  downDown: Accessor<boolean>,
  actionDown: Accessor<boolean>,
  driftDown: Accessor<boolean>,
}) {
  let { ecs, entityId, leftDown, rightDown, upDown, downDown, actionDown, driftDown, } = params;
  
  const MAX_SPEED = 15.0;
  const MAX_BOOST_SPEED = 25.0;
  const ACCELERATION = 3.0;
  const DECELERATION = 8.0;
  const TURN_SPEED = 6.0;
  const FRICTION = 0.98;
  const DRIFT_FRICTION = 0.96;
  const LATERAL_FRICTION = 0.92;
  
  let currentSpeed = 0;
  let driftCharge = 0;
  let isDrifting = false;
  let driftDirection = 0;
  
  return {
    update(dt: number) {
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

      let steering = 0;
      let turnDirection = 0;
      if (leftDown()) {
        steering += TURN_SPEED * dt;
        turnDirection = -1;
      }
      if (rightDown()) {
        steering -= TURN_SPEED * dt;
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
      ecs.set_field(entityId, RegisteredOrientation, "x", q.x);
      ecs.set_field(entityId, RegisteredOrientation, "y", q.y);
      ecs.set_field(entityId, RegisteredOrientation, "z", q.z);
      ecs.set_field(entityId, RegisteredOrientation, "w", q.w);

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

      ecs.set_field(entityId, RegisteredVelocity, "x", newVel.x);
      ecs.set_field(entityId, RegisteredVelocity, "y", newVel.y);
      ecs.set_field(entityId, RegisteredVelocity, "z", newVel.z);

      const newPos = kartPos.add(newVel.clone().multiplyScalar(dt));
      const groundY = getGroundHeight(newPos.x, newPos.z);
      const kartHeight = 0;
      if (newPos.y < groundY + kartHeight) {
        newPos.y = groundY + kartHeight;
        newVel.y = 0;
      }
      ecs.set_field(entityId, RegisteredPosition, "x", newPos.x);
      ecs.set_field(entityId, RegisteredPosition, "y", newPos.y);
      ecs.set_field(entityId, RegisteredPosition, "z", newPos.z);
    },
  };
}