import { createEffect, createMemo, onCleanup, createRoot, mapArray, createRenderEffect, createSignal, Show, untrack, Accessor, Component, For, Switch, Match } from "solid-js";
import * as THREE from "three";
import { Entity, Portal } from "solid-three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import {
  RegisteredPosition,
  RegisteredPlayerConfig,
  RegisteredKartConfig,
  RegisteredOrientation,
  RegisteredInGameState,
  ReadySteadyGoStage,
  RegisteredMysteryBox,
  RegisteredSlotMachine,
  SLOT_MACHINE_SPIN_TIMEOUT,
  RegisteredCarriedItem,
  Item,
  RegisteredTime,
  RegisteredBanana,
  RegisteredBomb
} from "../World";
import { createSolidLogo } from "../models/SolidLogo";
import { loadKartModel } from "../models/Kart";
import Melty, { createMelty } from "../models/melty";
import { createCubey } from "../models/cubey";
import { createReadySteadyGoTrafficLight } from "../models/ReadySteadyGoTrafficLight";

import { T } from "../t";
import MysteryBox from "../models/MysteryBox";
import SlotMachine from "../models/SlotMachine";
import Bomb from "../models/Bomb";
import { createBanana } from "../models/banana";

export function createRenderSystem(
  ecs: ReactiveECS,
  scene: THREE.Scene,
  camera: THREE.Camera,
  ownPlayerEntityId: Accessor<number | undefined>,
  canvasSize: Accessor<THREE.Vector2>,
  hudScene: THREE.Scene,
): { update: (dt: number) => void; three: Accessor<Component | undefined>; dispose: () => void } {
  return createRoot((dispose) => {

    let isReadySteadyGo = createMemo(() => ecs.resource(RegisteredInGameState).get("isReadySteadyGo"));
    let trafficLight = createMemo(() => {
      if (!isReadySteadyGo()) {
        return undefined;
      }
      let light = createMemo(() => {
        let stage = ecs.resource(RegisteredInGameState).get("readySteadyGoStage");
        switch (stage) {
          case ReadySteadyGoStage.READY:
            return "Red" as const;
          case ReadySteadyGoStage.STEADY:
            return "Yellow" as const;
          default:
            return "Green" as const;
        }
      });
      let trafficLight = createReadySteadyGoTrafficLight(light);
      let [ position, setPosition, ] = createSignal<THREE.Vector3>(new THREE.Vector3());
      let [ quaternion, setQuaternion, ] = createSignal<THREE.Quaternion>(new THREE.Quaternion());
      let lookAtCamera = () => {
        let matrix = new THREE.Matrix4();
        let offset = new THREE.Vector3(0, 0, -3);
        offset.applyMatrix4(camera.matrixWorld);
        matrix.lookAt(offset, camera.position, camera.up);
        let flipMatrix = new THREE.Matrix4().makeRotationY(Math.PI);
        matrix.multiply(flipMatrix);
        matrix.setPosition(offset);
        let position = new THREE.Vector3();
        let quaternion = new THREE.Quaternion();
        let scale = new THREE.Vector3();
        matrix.decompose(position, quaternion, scale);
        setPosition(position);
        setQuaternion(quaternion);
      };
      return ({
        three: () => (
          <T.Group
            position={position()}
            quaternion={quaternion()}
          >
            <T.Mesh>
              <T.BoxGeometry args={[100,100,100]}/>
              <T.MeshNormalMaterial/>
            </T.Mesh>
            <Entity
              from={trafficLight}
            />
          </T.Group>
        ),
        lookAtCamera,
      });
    });
    let updateListeners: ((dt: number) => void)[] = [];
    let time = createMemo(() => ecs.resource(RegisteredTime).get("time"));
    return {
      update: (dt) => {
        {
          let stage = ecs.resource(RegisteredInGameState).get("readySteadyGoStage");
          if (stage !== ReadySteadyGoStage.GO) {
            trafficLight()?.lookAtCamera();
          }
        }
        for (let arch of ecs.query(RegisteredMysteryBox)) {
          let entityIds = arch.entity_ids;
          for (let i = 0; i < arch.entity_count; ++i) {
            let mysteryBoxId = entityIds[i] as EntityID;
            let mysteryBox = ecs.entity(mysteryBoxId);
            let angle = mysteryBox.getField(RegisteredMysteryBox, "angle");
            angle += 2.0 * dt;
            ecs.set_field(mysteryBoxId, RegisteredMysteryBox, "angle", angle);
          }
        }
        updateListeners.forEach((u) => u(dt));
      },
      three: createMemo(() => () => {
        let bananaEntityIds = ecs.createQueryEntityIds(RegisteredBanana, RegisteredPosition);
        let bombEntityIds = ecs.createQueryEntityIds(RegisteredBomb, RegisteredPosition);
        return (
          <>
            <For each={(() => {
              let result: EntityID[] = [];
              for (let arch of ecs.query(RegisteredPosition, RegisteredOrientation, RegisteredPlayerConfig)) {
                let entityIds = arch.entity_ids;
                for (let i = 0; i < arch.entity_count; ++i) {
                  result.push(entityIds[i] as EntityID);
                }
              }
              return result;
            })()}>
              {(kartEntityId) => {
                let kartEntity = ecs.entity(kartEntityId());
                let playerConfig = { 
                  playerType: kartEntity.getField(RegisteredPlayerConfig, "playerType"), 
                  facingForward: kartEntity.getField(RegisteredPlayerConfig, "facingForward") 
                };
                
                let kartModel = createMemo(async () => await loadKartModel());
                
                let Player = () => (
                  <Switch>
                    <Match when={playerConfig.playerType == 0}>
                      <T.Group
                        position={[ 0.0, 0.32, 0.0, ]}
                        scale={[ 0.5, 0.5, 0.5, ]}
                      >
                        <Melty/>
                      </T.Group>
                    </Match>
                    <Match when={playerConfig.playerType == 1}>
                      <T.Group
                        position={[ 0.0, 0.32, 0.0, ]}
                        scale={[ 0.5, 0.5, 0.5, ]}
                      >
                        <Entity from={createCubey()}/>
                      </T.Group>
                    </Match>
                    <Match when={playerConfig.playerType == 2}>
                      <T.Group
                        position={[ 0.0, 0.32, 0.0, ]}
                        scale={[ 0.5, 0.5, 0.5, ]}
                      >
                        <Entity from={createSolidLogo()}/>
                      </T.Group>
                    </Match>
                  </Switch>
                );

                return (
                  <T.Group
                    position={[
                      kartEntity.getField(RegisteredPosition, "x"),
                      kartEntity.getField(RegisteredPosition, "y"),
                      kartEntity.getField(RegisteredPosition, "z"),
                    ]}
                    quaternion={[
                      kartEntity.getField(RegisteredOrientation, "x"),
                      kartEntity.getField(RegisteredOrientation, "y"),
                      kartEntity.getField(RegisteredOrientation, "z"),
                      kartEntity.getField(RegisteredOrientation, "w"),
                    ]}
                  >
                    <>{(() => {
                      let kartModel2 = kartModel();
                      return untrack(() => (<Entity from={kartModel2}/>));
                    })()}</>
                    <Player/>
                  </T.Group>
                );
              }}
            </For>
            <For each={(() => {
              let result: EntityID[] = [];
              for (let arch of ecs.query(RegisteredPosition, RegisteredMysteryBox)) {
                let entityIds = arch.entity_ids;
                for (let i = 0; i < arch.entity_count; ++i) {
                  result.push(entityIds[i] as EntityID);
                }
              }
              return result;
            })()}>
              {(mysteryBox) => {
                let mysteryBoxEntity = ecs.entity(mysteryBox());
                let position = createMemo(() =>
                  new THREE.Vector3(
                    mysteryBoxEntity.getField(RegisteredPosition, "x"),
                    mysteryBoxEntity.getField(RegisteredPosition, "y"),
                    mysteryBoxEntity.getField(RegisteredPosition, "z"),
                  )
                );
                let quaternion = createMemo(() =>
                  new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0.0, 1.0, 0.0),
                    mysteryBoxEntity.getField(RegisteredMysteryBox, "angle"),
                  )
                );
                return (
                  <Show when={mysteryBoxEntity.getField(RegisteredMysteryBox, "spawned")}>
                    <T.Group position={position()} quaternion={quaternion()}>
                      <MysteryBox/>
                    </T.Group>
                  </Show>
                );
              }}
            </For>
            <For
              each={(() => {
                let result: EntityID[] = [];
                for (let arch of ecs.query(RegisteredCarriedItem, RegisteredPosition)) {
                  for (let i = 0; i < arch.entity_count; ++i) {
                    let entityId: EntityID = arch.entity_ids[i] as EntityID;
                    result.push(entityId);
                  }
                }
                return result;
              })()}
            >
              {(entityId) => {
                let entity = ecs.entity(untrack(() => entityId()));
                let item = createMemo(() => entity.getField(RegisteredCarriedItem, "item") as Item);
                let pos = createMemo(() =>
                  new THREE.Vector3(
                    entity.getField(RegisteredPosition, "x"),
                    entity.getField(RegisteredPosition, "y"),
                    entity.getField(RegisteredPosition, "z"),
                  )
                );
                return (
                  <Switch>
                    <Match when={item() === Item.Banana}>
                      <T.Group position={pos()} scale={3.0}>
                        {(() => {
                          let banana = createBanana();
                          return untrack(() => (<Entity from={banana}/>));
                        })()}
                      </T.Group>
                    </Match>
                    <Match when={item() === Item.Bomb}>
                      <T.Group
                        position={pos()}
                      >
                        <T.Group position={[ 0.0, 0.25, 0.0, ]}>
                          <Bomb time={time()}/>
                        </T.Group>
                      </T.Group>
                    </Match>
                  </Switch>
                );
              }}
            </For>
            <For each={bananaEntityIds()}>
              {(bananaEntityId) => {
                let bananaEntity = ecs.entity(untrack(bananaEntityId));
                let positionX = () => bananaEntity.getField(RegisteredPosition, "x");
                let positionY = () => bananaEntity.getField(RegisteredPosition, "y");
                let positionZ = () => bananaEntity.getField(RegisteredPosition, "z");
                let banana = createBanana();
                return (
                  <T.Group
                    position={[
                      positionX(),
                      positionY(),
                      positionZ(),
                    ]}
                  >
                    <Entity
                      from={banana}
                    />
                  </T.Group>
                );
              }}
            </For>
            <For each={bombEntityIds()}>
              {(entityId) => {
                let bombEntity = ecs.entity(untrack(entityId));
                let positionX = () => bombEntity.getField(RegisteredPosition, "x");
                let positionY = () => bombEntity.getField(RegisteredPosition, "y");
                let positionZ = () => bombEntity.getField(RegisteredPosition, "z");
                return (
                  <T.Group
                    position={[
                      positionX(),
                      positionY(),
                      positionZ(),
                    ]}
                  >
                    <Bomb
                      time={time()}
                    />
                  </T.Group>
                );
              }}
            </For>
            <Show when={trafficLight()}>
              {(trafficLight) => (<>{(() => {
                let Three = trafficLight().three;
                return untrack(() => (<Three/>))
              })()}</>)}
            </Show>
            {/* 2D HUD */}
            <Portal element={hudScene}>
              <Show when={(() => {
                let entityId = ownPlayerEntityId();
                if (entityId === undefined) {
                  return undefined;
                }
                let entity = ecs.entity(entityId as EntityID);
                if (!entity.hasComponent(RegisteredSlotMachine)) {
                  return undefined;
                }
                let time = SLOT_MACHINE_SPIN_TIMEOUT - entity.getField(RegisteredSlotMachine, "phaseTimeout");
                return {
                  time: time,
                  spinningOffset: entity.getField(RegisteredSlotMachine, "spinningOffset"),
                };
              })()}>
                {(timeAndSpinningOffset) => {
                  let time = () => timeAndSpinningOffset().time;
                  let spinningOffset = () => timeAndSpinningOffset().spinningOffset;
                  return (
                    <T.Group
                      position={[
                        canvasSize().x - 150.0,
                        canvasSize().y - 150.0,
                        -300
                      ]}
                      scale={100}
                    >
                      <SlotMachine
                        time={time()}
                        wheelRotation={spinningOffset()}
                      />
                    </T.Group>
                  );
                }}
              </Show>
            </Portal>
          </>
        );
      }),
      dispose,
    };
  });
}
