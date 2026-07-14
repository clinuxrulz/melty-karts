import { Component } from "solid-js";
import * as THREE from "three";
import { T } from "./t";
import { bool, cameraPosition, cameraProjectionMatrix, cameraProjectionMatrixInverse, cameraViewMatrix, cameraWorldMatrix, float, Fn, If, mix, normalize, positionGeometry, positionWorld, vec3, vec4 } from "three/tsl";
import { MeshBasicNodeMaterial, Node } from "three/webgpu";

let getGrid = Fn(([ size, p ]: [ Node<"float">, Node<"vec3"> ]) => {
  let r = p.xz.div(size).toVar();
  let grid = r.sub(0.5).fract().sub(0.5).abs().div(r.fwidth());
  let line = grid.x.min(grid.y);
  return float(1.0).sub(line.mul(0.5).min(1.0));
});

let calcColourAndDepth = Fn(() => {
  let uScale = float(1.0).toConst();
  let isOrthographic = (cameraProjectionMatrix as any)[2][3].equal(0.0).toVar();

  let skyColour = vec3(0.3, 0.4, 0.6);
  let horizSkyColour = vec3(0.5, 0.5, 0.6);

  let ro = vec3().toVar();
  let rd = vec3().toVar();

  If(isOrthographic, () => {
      rd.assign(normalize(vec3((cameraViewMatrix as any)[0][2], (cameraViewMatrix as any)[1][2], (cameraViewMatrix as any)[2][2]).negate()));
      ro.assign(positionWorld);
  }).Else(() => {
      ro.assign(cameraPosition);
      let viewPos = cameraProjectionMatrixInverse.mul(vec4(positionGeometry.xy, -1.0, 1.0));
      let worldDir = cameraWorldMatrix.mul(vec4(viewPos.xyz, 0.0));
      rd.assign(worldDir.xyz.normalize());
  });

  let colour = vec3(0.7, 0.7, 0.7).toVar();
  let fragDepth = float(1.0).toVar();

  let groundColour = vec3(0.7, 0.7, 0.7).toVar();
  let gridColour = vec3(0.5, 0.5, 0.5).toVar();
  If(isOrthographic, () => {
    groundColour.assign(vec3(0.9, 0.9, 0.9));
    gridColour.assign(vec3(0.8, 0.8, 0.8));
  });

  let isPerspective = isOrthographic.not();

  If(isPerspective.and(ro.y.lessThan(0.0)), () => {
    colour.assign(skyColour);
  }).ElseIf(isPerspective.and(rd.y.greaterThan(0.3)), () => {
    colour.assign(skyColour);
  }).ElseIf(isPerspective.and(rd.y.greaterThan(0.0)), () => {
    let t = rd.y.div(0.03).clamp(0, 1);
    colour.assign(mix(horizSkyColour, skyColour, t));
  }).Else(() => {
    let fadeFactor = float(1.0).toVar();
    If(isOrthographic, () => {
      fadeFactor.assign(rd.y.abs());
    }).Else(() => {
      fadeFactor.assign(float(1.0).sub(ro.y.div(float(8000.0))).clamp(0.0, 1.0));
      fadeFactor.assign(fadeFactor.pow(3.0));
    });
    If(rd.y.abs().lessThan(0.0001), () => {
      colour.assign(groundColour);
    }).Else(() => {
      let p = ro.add(rd.mul(ro.y.negate().div(rd.y))).toVar();
      let g1 = getGrid(uScale.mul(1.0), p).toVar();
      let g2 = getGrid(uScale.mul(10.0), p).toVar();
      let fc = vec4(1.0, 1.0, 1.0, g2.mix(g1, g1).mul(fadeFactor)).toVar();
      let fca = fc.a.mul(0.5).mix(fc.a, g2);
      If(fca.lessThanEqual(0.0), () => {
        colour.assign(groundColour);
      }).Else(() => {
        colour.assign(mix(groundColour, gridColour, fca));
      });
    });
  });

  If(rd.y.lessThan(-0.001), () => {
    let t = ro.y.negate().div(rd.y);
    let p = ro.add(rd.mul(t));
    let clipPos = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(p.x, p.y, p.z, 1.0)).toVar();
    let ndcZ = clipPos.z.div(clipPos.w);
    fragDepth.assign(ndcZ.mul(0.5).add(0.5));
  });

  return vec4(colour, fragDepth);
});

let result = calcColourAndDepth();

const gridNodeGeometry = new THREE.PlaneGeometry(2, 2);
const gridNodeMaterial = new MeshBasicNodeMaterial();
gridNodeMaterial.vertexNode = vec4(positionGeometry.xy, 0.0, 1.0);
gridNodeMaterial.colorNode = vec4(result.xyz, 0.5);
gridNodeMaterial.depthNode = result.w;
gridNodeMaterial.depthWrite = false;
gridNodeMaterial.depthTest = true;
gridNodeMaterial.transparent = true;

const InfiniteGrid: Component = (props) => {
  return (
    <T.Mesh
      renderOrder={10}
      frustumCulled={false}
      geometry={gridNodeGeometry}
      material={gridNodeMaterial}
    />
  );
};

export default InfiniteGrid;
