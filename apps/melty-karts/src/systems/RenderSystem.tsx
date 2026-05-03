import { createEffect, createMemo, onCleanup, createRoot, mapArray, createRenderEffect, createSignal, Show, untrack, Accessor, Component, For, Switch, Match } from "solid-js";
import * as THREE from "three";
import { Entity } from "solid-three";
import type { ReactiveECS } from "@melty-karts/reactive-ecs";
import type { EntityID } from "@oasys/oecs";
import {
  RegisteredPosition,
  RegisteredPlayerConfig,
  RegisteredKartConfig,
  RegisteredOrientation,
  RegisteredInGameState,
  ReadySteadyGoStage,
} from "../World";
import { createSolidLogo } from "../models/SolidLogo";
import { loadKartModel } from "../models/Kart";
import Melty, { createMelty } from "../models/melty";
import { createCubey } from "../models/cubey";
import { createReadySteadyGoTrafficLight } from "../models/ReadySteadyGoTrafficLight";

import { T } from "../t";

export function createRenderSystem(ecs: ReactiveECS, scene: THREE.Scene, camera: THREE.Camera): { update: () => void; three: Accessor<Component | undefined>; dispose: () => void } {
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

    return {
      update: () => {
        trafficLight()?.lookAtCamera();
      },
      three: createMemo(() => () => {
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
            <Show when={trafficLight()}>
              {(trafficLight) => (<>{(() => {
                let Three = trafficLight().three;
                return untrack(() => (<Three/>))
              })()}</>)}
            </Show>
          </>
        );
      }),
      dispose,
    };
  });
}
