import { Component } from "solid-js";
import * as THREE from "three";
import { T } from "./t";
import {
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraProjectionMatrixInverse,
  cameraViewMatrix,
  cameraWorldMatrix,
  positionGeometry,
  positionWorld,
  glslFn,
  wgslFn,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn, Node, vec3, vec4, float, If,
  compileGLSLFn,
  compileWGSLFn,
} from "@random-mesh/rmsl";

// ----- Grid line shader -----
const rmslGetGrid = Fn((size: Node<"float">, p: Node<"vec3">) => {
  let r = p.xz.div(size).toVar();
  let grid = r.sub(0.5).fract().sub(0.5).abs().div(r.fwidth());
  let line = grid.x.min(grid.y);
  return float(1.0).sub(line.mult(0.5).min(1.0));
});

// ----- Colour fragment shader -----
const rmslCalcColour = Fn((
  projMat: Node<"mat4">,
  projInv: Node<"mat4">,
  worldMat: Node<"mat4">,
  viewMat: Node<"mat4">,
  camPos: Node<"vec3">,
  posGeo: Node<"vec3">,
  posWorld: Node<"vec3">,
) => {
  let isOrthographic = projMat.element(2).w.equal(float(0.0)).toVar();
  let ro = vec3().toVar();
  let rd = vec3().toVar();
  If(isOrthographic, () => {
    rd.assign(vec3(
      viewMat.element(0).z,
      viewMat.element(1).z,
      viewMat.element(2).z,
    ).negate().normalize());
    ro.assign(posWorld);
  }).Else(() => {
    ro.assign(camPos);
    let viewPos = projInv.mult(vec4(posGeo.x, posGeo.y, -1.0, 1.0));
    let worldDir = worldMat.mult(vec4(viewPos.x, viewPos.y, viewPos.z, 0.0));
    rd.assign(worldDir.xyz.normalize());
  });

  let colour = vec3(0.7, 0.7, 0.7).toVar();
  let groundColour = vec3(0.7, 0.7, 0.7).toVar();
  let gridColour = vec3(0.5, 0.5, 0.5).toVar();

  If(isOrthographic, () => {
    groundColour.assign(vec3(0.9, 0.9, 0.9));
    gridColour.assign(vec3(0.8, 0.8, 0.8));
  });

  let isPerspective = isOrthographic.not();
  If(isPerspective.and(ro.y.lessThan(0.0)), () => {
    colour.assign(vec3(0.3, 0.4, 0.6));
  }).ElseIf(isPerspective.and(rd.y.greaterThan(0.3)), () => {
    colour.assign(vec3(0.3, 0.4, 0.6));
  }).ElseIf(isPerspective.and(rd.y.greaterThan(0.0)), () => {
    let t = rd.y.div(0.03).clamp(0, 1);
    colour.assign(vec3(0.5, 0.5, 0.6).mix(vec3(0.3, 0.4, 0.6), t));
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
      let p = ro.add(rd.mult(ro.y.negate().div(rd.y))).toVar();
      let refDist = float(1.0).toVar();
      If(isOrthographic, () => {
        refDist.assign(float(1.0).div(projMat.element(0).x.abs().max(float(0.001))));
      }).Else(() => {
        refDist.assign(camPos.y.abs().mult(0.1).max(float(0.001)));
      });
      let exponent = refDist.log().div(float(Math.log(10))).floor().clamp(-3, 6);
      let minorSize = float(10.0).pow(exponent);
      let g1 = rmslGetGrid(minorSize, p).toVar();
      let g2 = rmslGetGrid(minorSize.mult(10.0), p).toVar();
      let fc = vec4(1.0, 1.0, 1.0, g2.mix(g1, g1).mult(fadeFactor)).toVar();
      let fca = fc.a.mult(0.5).mix(fc.a, g2);
      If(fca.lessThanEqual(0.0), () => {
        colour.assign(groundColour);
      }).Else(() => {
        colour.assign(groundColour.mix(gridColour, fca));
      });
    });
  });

  return vec4(colour, 0.5);
});

// ----- Depth fragment shader -----
const rmslCalcDepth = Fn((
  projMat: Node<"mat4">,
  viewMat: Node<"mat4">,
  projInv: Node<"mat4">,
  worldMat: Node<"mat4">,
  camPos: Node<"vec3">,
  posGeo: Node<"vec3">,
  posWorld: Node<"vec3">,
) => {
  let isOrthographic = projMat.element(2).w.equal(float(0.0)).toVar();
  let ro = vec3().toVar();
  let rd = vec3().toVar();
  If(isOrthographic, () => {
    rd.assign(vec3(
      viewMat.element(0).z,
      viewMat.element(1).z,
      viewMat.element(2).z,
    ).negate().normalize());
    ro.assign(posWorld);
  }).Else(() => {
    ro.assign(camPos);
    let viewPos = projInv.mult(vec4(posGeo.x, posGeo.y, -1.0, 1.0));
    let worldDir = worldMat.mult(vec4(viewPos.x, viewPos.y, viewPos.z, 0.0));
    rd.assign(worldDir.xyz.normalize());
  });

  let d = float(1.0).toVar();
  If(rd.y.lessThan(-0.001), () => {
    let t = ro.y.negate().div(rd.y);
    let p = ro.add(rd.mult(t));
    let clipPos = projMat.mult(viewMat).mult(vec4(p.x, p.y, p.z, 1.0)).toVar();
    let ndcZ = clipPos.z.div(clipPos.w);
    d.assign(ndcZ.mult(0.5).add(0.5));
  });
  return d;
});

// ----- Vertex shader -----
const vertexMain = Fn((position: Node<"vec3">) => {
  return vec4(position.x, position.y, 0.0, 1.0);
});

// ----- Pre-compile both GLSL and WGSL -----
const vertexGLSL = compileGLSLFn(vertexMain, {
  name: "vertexMain",
  params: [{ name: "position", type: "vec3" }],
});

const vertexWGSL = compileWGSLFn(vertexMain, {
  name: "vertexMain",
  params: [{ name: "position", type: "vec3" }],
});

const colourGLSL = compileGLSLFn(rmslCalcColour, {
  name: "calcColour",
  params: [
    { name: "projMat", type: "mat4" },
    { name: "projInv", type: "mat4" },
    { name: "worldMat", type: "mat4" },
    { name: "viewMat", type: "mat4" },
    { name: "camPos", type: "vec3" },
    { name: "posGeo", type: "vec3" },
    { name: "posWorld", type: "vec3" },
  ],
});

const colourWGSL = compileWGSLFn(rmslCalcColour, {
  name: "calcColour",
  params: [
    { name: "projMat", type: "mat4" },
    { name: "projInv", type: "mat4" },
    { name: "worldMat", type: "mat4" },
    { name: "viewMat", type: "mat4" },
    { name: "camPos", type: "vec3" },
    { name: "posGeo", type: "vec3" },
    { name: "posWorld", type: "vec3" },
  ],
});

const depthGLSL = compileGLSLFn(rmslCalcDepth, {
  name: "calcDepth",
  params: [
    { name: "projMat", type: "mat4" },
    { name: "viewMat", type: "mat4" },
    { name: "projInv", type: "mat4" },
    { name: "worldMat", type: "mat4" },
    { name: "camPos", type: "vec3" },
    { name: "posGeo", type: "vec3" },
    { name: "posWorld", type: "vec3" },
  ],
});

const depthWGSL = compileWGSLFn(rmslCalcDepth, {
  name: "calcDepth",
  params: [
    { name: "projMat", type: "mat4" },
    { name: "projInv", type: "mat4" },
    { name: "worldMat", type: "mat4" },
    { name: "viewMat", type: "mat4" },
    { name: "camPos", type: "vec3" },
    { name: "posGeo", type: "vec3" },
    { name: "posWorld", type: "vec3" },
  ],
});

// ----- TSL inputs -----
const vertexTSLInputs = { position: attribute("position") };

const fragmentTSLInputs = {
  projMat: cameraProjectionMatrix,
  projInv: cameraProjectionMatrixInverse,
  worldMat: cameraWorldMatrix,
  viewMat: cameraViewMatrix,
  camPos: cameraPosition,
  posGeo: positionGeometry,
  posWorld: positionWorld,
};

// ----- Custom material that selects GLSL/WGSL at build time -----
class GridNodeMaterial extends MeshBasicNodeMaterial {
  constructor() {
    super();
    this.depthWrite = false;
    this.depthTest = true;
    this.transparent = true;
  }

  build(builder: any) {
    const isWebGL = builder.renderer?.backend?.isWebGLBackend === true;
    const vertexFn = isWebGL ? glslFn(vertexGLSL) : wgslFn(vertexWGSL);
    const colourFn = isWebGL ? glslFn(colourGLSL) : wgslFn(colourWGSL);
    const depthFn = isWebGL ? glslFn(depthGLSL) : wgslFn(depthWGSL);

    this.vertexNode = vertexFn(vertexTSLInputs) as any;
    this.colorNode = colourFn(fragmentTSLInputs) as any;
    this.depthNode = depthFn(fragmentTSLInputs) as any;

    super.build(builder);
  }
}

// ----- Geometry and material instances -----
const gridNodeGeometry = new THREE.PlaneGeometry(2, 2);
const gridNodeMaterial = new GridNodeMaterial();

// ----- Solid component -----
const InfiniteGrid: Component = () => {
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
