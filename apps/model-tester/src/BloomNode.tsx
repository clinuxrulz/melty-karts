import { HalfFloatType, RenderTarget, Vector2, Vector3, TempNode, QuadMesh, NodeMaterial, RendererUtils, NodeUpdateType, TSL } from "three/webgpu";

const {
  nodeObject, Fn, float, uv, passTexture, uniform, Loop, texture,
  luminance, smoothstep, mix, vec4, uniformArray, add, int,
} = TSL;

const _quadMesh = new QuadMesh();
const _size = new Vector2();

const _BlurDirectionX = new Vector2(1.0, 0.0);
const _BlurDirectionY = new Vector2(0.0, 1.0);

let _rendererState: any;

class BloomNode extends TempNode {
  static get type() {
    return "BloomNode";
  }

  inputNode: any;
  strength: any;
  radius: any;
  threshold: any;
  smoothWidth: any;
  _renderTargetsHorizontal: RenderTarget[];
  _renderTargetsVertical: RenderTarget[];
  _nMips: number;
  _renderTargetBright: RenderTarget;
  _compositeMaterial: NodeMaterial | null;
  _highPassFilterMaterial: NodeMaterial | null;
  _separableBlurMaterials: any[];
  _textureNodeBright: any;
  _textureNodeBlur0: any;
  _textureNodeBlur1: any;
  _textureNodeBlur2: any;
  _textureNodeBlur3: any;
  _textureNodeBlur4: any;
  _textureOutput: any;

  constructor(inputNode: any, strength = 1, radius = 0, threshold = 0) {
    super("vec4");

    this.inputNode = inputNode;

    this.strength = uniform(strength);
    this.radius = uniform(radius);
    this.threshold = uniform(threshold);
    this.smoothWidth = uniform(0.01);

    this._renderTargetsHorizontal = [];
    this._renderTargetsVertical = [];
    this._nMips = 5;

    this._renderTargetBright = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
    });
    this._renderTargetBright.texture.name = "UnrealBloomPass.bright";
    this._renderTargetBright.texture.generateMipmaps = false;

    for (let i = 0; i < this._nMips; i++) {
      const rtH = new RenderTarget(1, 1, {
        depthBuffer: false,
        type: HalfFloatType,
      });
      rtH.texture.name = "UnrealBloomPass.h" + i;
      rtH.texture.generateMipmaps = false;
      this._renderTargetsHorizontal.push(rtH);

      const rtV = new RenderTarget(1, 1, {
        depthBuffer: false,
        type: HalfFloatType,
      });
      rtV.texture.name = "UnrealBloomPass.v" + i;
      rtV.texture.generateMipmaps = false;
      this._renderTargetsVertical.push(rtV);
    }

    this._compositeMaterial = null;
    this._highPassFilterMaterial = null;
    this._separableBlurMaterials = [];

    this._textureNodeBright = texture(this._renderTargetBright.texture);
    this._textureNodeBlur0 = texture(this._renderTargetsVertical[0].texture);
    this._textureNodeBlur1 = texture(this._renderTargetsVertical[1].texture);
    this._textureNodeBlur2 = texture(this._renderTargetsVertical[2].texture);
    this._textureNodeBlur3 = texture(this._renderTargetsVertical[3].texture);
    this._textureNodeBlur4 = texture(this._renderTargetsVertical[4].texture);

    this._textureOutput = passTexture(this as any, this._renderTargetsHorizontal[0].texture as any);

    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  getTextureNode() {
    return this._textureOutput;
  }

  setSize(width: number, height: number) {
    let resx = Math.round(width / 2);
    let resy = Math.round(height / 2);

    this._renderTargetBright.setSize(resx, resy);

    for (let i = 0; i < this._nMips; i++) {
      this._renderTargetsHorizontal[i].setSize(resx, resy);
      this._renderTargetsVertical[i].setSize(resx, resy);
      this._separableBlurMaterials[i].invSize.value.set(1 / resx, 1 / resy);

      resx = Math.round(resx / 2);
      resy = Math.round(resy / 2);
    }
  }

  updateBefore(frame: any) {
    const renderer = frame.renderer;

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState);

    const size = renderer.getDrawingBufferSize(_size);
    this.setSize(size.width, size.height);

    renderer.setRenderTarget(this._renderTargetBright);
    _quadMesh.material = this._highPassFilterMaterial!;
    _quadMesh.name = "Bloom [ High Pass ]";
    _quadMesh.render(renderer);

    let inputRenderTarget = this._renderTargetBright;

    for (let i = 0; i < this._nMips; i++) {
      _quadMesh.material = this._separableBlurMaterials[i];

      this._separableBlurMaterials[i].colorTexture.value = inputRenderTarget.texture;
      this._separableBlurMaterials[i].direction.value = _BlurDirectionX;
      renderer.setRenderTarget(this._renderTargetsHorizontal[i]);
      _quadMesh.name = `Bloom [ Blur Horizontal - ${i} ]`;
      _quadMesh.render(renderer);

      this._separableBlurMaterials[i].colorTexture.value = this._renderTargetsHorizontal[i].texture;
      this._separableBlurMaterials[i].direction.value = _BlurDirectionY;
      renderer.setRenderTarget(this._renderTargetsVertical[i]);
      _quadMesh.name = `Bloom [ Blur Vertical - ${i} ]`;
      _quadMesh.render(renderer);

      inputRenderTarget = this._renderTargetsVertical[i];
    }

    renderer.setRenderTarget(this._renderTargetsHorizontal[0]);
    _quadMesh.material = this._compositeMaterial!;
    _quadMesh.name = "Bloom [ Composite ]";
    _quadMesh.render(renderer);

    RendererUtils.restoreRendererState(renderer, _rendererState);

    return undefined;
  }

  setup(builder: any) {
    const luminosityHighPass = Fn(() => {
      const texel = this.inputNode;
      const v = luminance(texel.rgb);
      const alpha = smoothstep(this.threshold, this.threshold.add(this.smoothWidth), v);
      return mix(vec4(0), texel, alpha);
    });

    this._highPassFilterMaterial =
      this._highPassFilterMaterial || new NodeMaterial();
    this._highPassFilterMaterial.fragmentNode = luminosityHighPass().context(
      builder.getSharedContext(),
    );
    this._highPassFilterMaterial.name = "Bloom_highPass";
    this._highPassFilterMaterial.needsUpdate = true;

    const kernelSizeArray = [6, 10, 14, 18, 22];

    for (let i = 0; i < this._nMips; i++) {
      this._separableBlurMaterials.push(
        this._getSeparableBlurMaterial(builder, kernelSizeArray[i]),
      );
    }

    const bloomFactors = uniformArray([1.0, 0.8, 0.6, 0.4, 0.2]);
    const bloomTintColors = uniformArray([
      new Vector3(1, 1, 1),
      new Vector3(1, 1, 1),
      new Vector3(1, 1, 1),
      new Vector3(1, 1, 1),
      new Vector3(1, 1, 1),
    ]);

    const lerpBloomFactor = (Fn as any)(
      ([factor, radius]: any) => {
        const mirrorFactor = float(1.2).sub(factor);
        return mix(factor, mirrorFactor, radius);
      },
    ).setLayout({
      name: "lerpBloomFactor",
      type: "float",
      inputs: [
        { name: "factor", type: "float" },
        { name: "radius", type: "float" },
      ],
    });

    const compositePass = Fn(() => {
      const c0 = lerpBloomFactor(bloomFactors.element(0), this.radius)
        .mul(vec4(bloomTintColors.element(0), 1.0))
        .mul(this._textureNodeBlur0);
      const c1 = lerpBloomFactor(bloomFactors.element(1), this.radius)
        .mul(vec4(bloomTintColors.element(1), 1.0))
        .mul(this._textureNodeBlur1);
      const c2 = lerpBloomFactor(bloomFactors.element(2), this.radius)
        .mul(vec4(bloomTintColors.element(2), 1.0))
        .mul(this._textureNodeBlur2);
      const c3 = lerpBloomFactor(bloomFactors.element(3), this.radius)
        .mul(vec4(bloomTintColors.element(3), 1.0))
        .mul(this._textureNodeBlur3);
      const c4 = lerpBloomFactor(bloomFactors.element(4), this.radius)
        .mul(vec4(bloomTintColors.element(4), 1.0))
        .mul(this._textureNodeBlur4);

      return c0.add(c1).add(c2).add(c3).add(c4).mul(this.strength);
    });

    this._compositeMaterial =
      this._compositeMaterial || new NodeMaterial();
    this._compositeMaterial.fragmentNode = compositePass().context(
      builder.getSharedContext(),
    );
    this._compositeMaterial.name = "Bloom_comp";
    this._compositeMaterial.needsUpdate = true;

    return this._textureOutput;
  }

  dispose() {
    for (let i = 0; i < this._renderTargetsHorizontal.length; i++) {
      this._renderTargetsHorizontal[i].dispose();
    }
    for (let i = 0; i < this._renderTargetsVertical.length; i++) {
      this._renderTargetsVertical[i].dispose();
    }
    this._renderTargetBright.dispose();
    if (this._highPassFilterMaterial !== null)
      this._highPassFilterMaterial.dispose();
    if (this._compositeMaterial !== null)
      this._compositeMaterial.dispose();
    for (let i = 0; i < this._separableBlurMaterials.length; i++) {
      this._separableBlurMaterials[i].dispose();
    }
  }

  _getSeparableBlurMaterial(builder: any, kernelRadius: number) {
    const coefficients = [];
    const sigma = kernelRadius / 3;

    for (let i = 0; i < kernelRadius; i++) {
      coefficients.push(
        (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma,
      );
    }

    const colorTexture = texture(null as any);
    const gaussianCoefficients = uniformArray(coefficients);
    const invSize = uniform(new Vector2());
    const direction = uniform(new Vector2(0.5, 0.5));
    const uvNode = uv();
    const sampleTexel = (uv: any) => colorTexture.sample(uv);

    const separableBlurPass = Fn(() => {
      const diffuseSum = sampleTexel(uvNode)
        .rgb.mul(gaussianCoefficients.element(0) as any)
        .toVar();

      Loop(
        { start: int(1), end: int(kernelRadius), type: "int", condition: "<" },
        ({ i }: any) => {
          const x = float(i);
          const w = gaussianCoefficients.element(i) as any;
          const uvOffset = direction.mul(invSize).mul(x);
          const sample1 = sampleTexel(uvNode.add(uvOffset)).rgb;
          const sample2 = sampleTexel(uvNode.sub(uvOffset)).rgb;
          diffuseSum.addAssign(add(sample1, sample2).mul(w));
        },
      );

      return vec4(diffuseSum, 1.0);
    });

    const separableBlurMaterial = new NodeMaterial();
    separableBlurMaterial.fragmentNode = separableBlurPass().context(
      builder.getSharedContext(),
    );
    separableBlurMaterial.name = "Bloom_separable";
    separableBlurMaterial.needsUpdate = true;
    (separableBlurMaterial as any).colorTexture = colorTexture;
    (separableBlurMaterial as any).direction = direction;
    (separableBlurMaterial as any).invSize = invSize;

    return separableBlurMaterial;
  }
}

export const bloom = (node: any, strength?: number, radius?: number, threshold?: number) =>
  new BloomNode(nodeObject(node), strength, radius, threshold);

export default BloomNode;
