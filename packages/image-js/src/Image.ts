import { invert, IInvertOptions } from './filters/invert';
import { validateChannel, validateValue } from './utils/validators';
import { convertColor, IConvertColorOptions } from './operations/convertColor';
import { convertDepth } from './operations/convertDepth';
import { split } from './operations/split';
import { IHistogramOptions, histogram } from './compute';
import {
  IBlurOptions,
  blur,
  IConvolutionOptions,
  directConvolution,
  separableConvolution,
  gaussianBlur,
  GaussianBlurOptions
} from './filters';
import {
  IResizeOptions,
  resize,
  IRotateOptions,
  rotate,
  ITransformOptions,
  transform
} from './geometry';
import { ThresholdOptions, threshold } from './operations';

type ImageDataArray = Uint8Array | Uint16Array;

export enum ColorDepth {
  UINT8 = 8,
  UINT16 = 16
}

export enum ImageKind {
  GREY = 'GREY',
  GREYA = 'GREYA',
  RGB = 'RGB',
  RGBA = 'RGBA'
}

export enum ImageCoordinates {
  CENTER = 'CENTER',
  TOP_LEFT = 'TOP_LEFT',
  TOP_RIGHT = 'TOP_RIGHT',
  BOTTOM_LEFT = 'BOTTOM_LEFT',
  BOTTOM_RIGHT = 'BOTTOM_RIGHT'
}

export interface INewImageOptions {
  /**
   * Number of bits per value in each channel.
   * Default: `ColorDepth.UINT8`.
   */
  depth?: ColorDepth;

  /**
   * Typed array holding the image data.
   */
  data?: ImageDataArray;

  /**
   * Height of the image.
   */
  height?: number;

  /**
   * Kind of the created image.
   * Default: `ImageKind.RGB`.
   */
  kind?: ImageKind;

  /**
   * Width of the image.
   */
  width?: number;
}

export type ImageValues = [number, number, number, number];

const kinds: { [key in ImageKind]: { components: number; alpha: boolean } } = {
  [ImageKind.GREY]: {
    components: 1,
    alpha: false
  },
  [ImageKind.GREYA]: {
    components: 1,
    alpha: true
  },
  [ImageKind.RGB]: {
    components: 3,
    alpha: false
  },
  [ImageKind.RGBA]: {
    components: 3,
    alpha: true
  }
};

export class Image {
  /**
   * The number of columns of the image.
   */
  public readonly width: number;

  /**
   * The number of rows of the image.
   */
  public readonly height: number;

  /**
   * The total number of pixels in the image (width x height).
   */
  public readonly size: number;

  /**
   * The number of bits per value in each channel.
   */
  public readonly depth: ColorDepth;

  /**
   * The kind of the image.
   */
  public readonly kind: ImageKind;

  /**
   * The number of color channels in the image, excluding the alpha channel.
   * A grey image has 1 component. An RGB image has 3 components.
   */
  public readonly components: number;

  /**
   * The total number of channels in the image, including the alpha channel.
   */
  public readonly channels: number;

  /**
   * Whether the image has an alpha channel or not.
   */
  public readonly alpha: boolean;

  /**
   * The maximum value that a pixel channel can have.
   */
  public readonly maxValue: number;

  /**
   * Typed array holding the image data.
   */
  public readonly data: ImageDataArray;

  /**
   * Construct a new image knowing its dimensions.
   * @param width
   * @param height
   * @param options
   */
  public constructor(width: number, height: number, options?: INewImageOptions);
  /**
   * Construct a new image only with options.
   * @param options
   */
  public constructor(options?: INewImageOptions);
  public constructor(
    width?: number | INewImageOptions,
    height?: number,
    options: INewImageOptions = {}
  ) {
    if (typeof width !== 'number') {
      options = width || {};
      width = undefined;
    }

    if (width === undefined) {
      width = options.width || 1;
    }

    if (height === undefined) {
      height = options.height || 1;
    }

    const { depth = ColorDepth.UINT8, data, kind = ImageKind.RGB } = options;

    if (width < 1 || !Number.isInteger(width)) {
      throw new RangeError(
        `width must be an integer and at least 1. Received ${width}`
      );
    }

    if (height < 1 || !Number.isInteger(height)) {
      throw new RangeError(
        `height must be an integer and at least 1. Received ${height}`
      );
    }

    this.width = width;
    this.height = height;
    this.size = width * height;
    this.depth = depth;
    this.kind = kind;

    const kindDef = kinds[kind];
    this.components = kindDef.components;
    this.channels = kindDef.components + Number(kindDef.alpha);
    this.alpha = kindDef.alpha;

    const maxValue = 2 ** depth - 1;
    this.maxValue = maxValue;

    if (data === undefined) {
      this.data = createPixelArray(
        this.size,
        this.channels,
        this.alpha,
        this.depth,
        maxValue
      );
    } else {
      if (depth === ColorDepth.UINT8 && data instanceof Uint16Array) {
        throw new Error(`depth is ${depth} but data is Uint16Array`);
      } else if (depth === ColorDepth.UINT16 && data instanceof Uint8Array) {
        throw new Error(`depth is ${depth} but data is Uint8Array`);
      }
      const expectedLength = this.size * this.channels;
      if (data.length !== expectedLength) {
        throw new RangeError(
          `incorrect data size: ${data.length}. Expected ${expectedLength}`
        );
      }
      this.data = data;
    }
  }

  /**
   * Create a new image base on the properties of an existing one.
   * @param other - Reference image.
   */
  public static createFrom(other: Image, options?: INewImageOptions): Image {
    return new Image({
      width: other.width,
      height: other.height,
      depth: other.depth,
      kind: other.kind,
      ...options
    });
  }

  /**
   * Get all the values of a pixel.
   * @param y - Row index.
   * @param x - Column index.
   * @returns Values of the pixel.
   */
  public get(y: number, x: number): number[] {
    const result = [];
    const start = (y * this.width + x) * this.channels;
    for (let i = 0; i < this.channels; i++) {
      result.push(this.data[start + i]);
    }
    return result;
  }

  /**
   * Set all the values of a pixel.
   * @param y - Row index.
   * @param x - Column index.
   * @param value - Values of the pixel to set.
   */
  public set(y: number, x: number, value: number[]): void {
    const start = (y * this.width + x) * this.channels;
    for (let i = 0; i < this.channels; i++) {
      this.data[start + i] = value[i];
    }
  }

  /**
   * Get the value of a specific pixel channel.
   * @param y - Row index.
   * @param x - Column index.
   * @param channel - Channel index.
   */
  public getValue(y: number, x: number, channel: number): number {
    return this.data[(y * this.width + x) * this.channels + channel];
  }

  /**
   * Set the value of a specific pixel channel.
   * @param y - Row index.
   * @param x - Column index.
   * @param channel - Channel index.
   * @param value - Value to set.
   */
  public setValue(y: number, x: number, channel: number, value: number): void {
    this.data[(y * this.width + x) * this.channels + channel] = value;
  }

  public [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `Image {
  width: ${this.width}
  height: ${this.height}
  depth: ${this.depth}
  kind: ${this.kind}
  channels: ${this.channels}
  data: ${printData(this)}
}`;
  }

  /**
   * Fill the image with a value or a color
   */
  public fill(value: number | number[]): this {
    if (typeof value === 'number') {
      validateValue(value, this);
      this.data.fill(value);
      return this;
    } else {
      if (value.length !== this.channels) {
        throw new RangeError(
          `the size of value must match the number of channels (${
            this.channels
          }). Got ${value.length} instead`
        );
      }
      value.forEach((val) => validateValue(val, this));
      for (let i = 0; i < this.data.length; i += this.channels) {
        for (let j = 0; j <= this.channels; j++) {
          this.data[i + j] = value[j];
        }
      }
      return this;
    }
  }

  /**
   * Fill one channel with a value
   * @param channel - The channel to fill.
   * @param value - The new value.
   */
  public fillChannel(channel: number, value: number): this {
    validateChannel(channel, this);
    validateValue(value, this);
    for (let i = channel; i < this.data.length; i += this.channels) {
      this.data[i] = value;
    }
    return this;
  }

  /**
   * Fill the alpha channel with the specified value.
   */
  public fillAlpha(value: number): this {
    validateValue(value, this);
    if (!this.alpha) {
      throw new Error(
        'fillAlpha can only be called if the image has an alpha channel'
      );
    }
    const alphaIndex = this.channels - 1;
    return this.fillChannel(alphaIndex, value);
  }

  /**
   * Create a copy of this image.
   */
  public clone(): Image {
    return Image.createFrom(this, { data: this.data.slice() });
  }

  public changeEach(cb: (value: number) => number): void {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = cb(this.data[i]);
    }
  }

  // COMPUTE

  /**
   * Returns a histogram of pixel intensities.
   * @param image
   */
  public histogram(options?: IHistogramOptions): number[] {
    return histogram(this, options);
  }

  // FILTERS

  public blur(options: IBlurOptions): Image {
    return blur(this, options);
  }

  public directConvolution(
    kernel: number[][],
    options?: IConvolutionOptions
  ): Image {
    return directConvolution(this, kernel, options);
  }

  public separableConvolution(
    kernelX: number[],
    kernelY: number[],
    options?: IConvolutionOptions
  ): Image {
    return separableConvolution(this, kernelX, kernelY, options);
  }

  public gaussianBlur(options: GaussianBlurOptions): Image {
    return gaussianBlur(this, options);
  }

  /**
   * Invert the colors of the image.
   */
  public invert(options?: IInvertOptions): Image {
    return invert(this, options);
  }

  // GEOMETRY

  public resize(options: IResizeOptions): Image {
    return resize(this, options);
  }

  public rotate(angle: number, options?: IRotateOptions): Image {
    return rotate(this, angle, options);
  }

  public transform(
    transformMatrix: number[][],
    options?: ITransformOptions
  ): Image {
    return transform(this, transformMatrix, options);
  }

  // OPERATIONS

  public convertColor(kind: ImageKind, options?: IConvertColorOptions): Image {
    return convertColor(this, kind, options);
  }

  public convertDepth(newDepth: ColorDepth): Image {
    return convertDepth(this, newDepth);
  }

  public split(): Image[] {
    return split(this);
  }

  public threshold(options: ThresholdOptions): Image {
    return threshold(this, options);
  }

  public getCoordinates(
    coordinates: ImageCoordinates,
    round: boolean = false
  ): [number, number] {
    switch (coordinates) {
      case ImageCoordinates.CENTER: {
        const centerX = (this.width - 1) / 2;
        const centerY = (this.height - 1) / 2;
        if (round) {
          return [Math.round(centerX), Math.round(centerY)];
        } else {
          return [centerX, centerY];
        }
      }
      case ImageCoordinates.TOP_LEFT:
        return [0, 0];
      case ImageCoordinates.TOP_RIGHT:
        return [this.width - 1, 0];
      case ImageCoordinates.BOTTOM_LEFT:
        return [0, this.height - 1];
      case ImageCoordinates.BOTTOM_RIGHT:
        return [this.width - 1, this.height - 1];
      default:
        throw new Error(`Unknow image coordinates ${coordinates}`);
    }
  }
}

function createPixelArray(
  size: number,
  channels: number,
  alpha: boolean,
  depth: ColorDepth,
  maxValue: number
): ImageDataArray {
  const length = channels * size;
  let arr;
  switch (depth) {
    case ColorDepth.UINT8:
      arr = new Uint8Array(length);
      break;
    case ColorDepth.UINT16:
      arr = new Uint16Array(length);
      break;
    default:
      throw new Error(`unexpected color depth: ${depth}`);
  }

  // Alpha channel is 100% by default.
  if (alpha) {
    for (let i = channels - 1; i < length; i += channels) {
      arr[i] = maxValue;
    }
  }

  return arr;
}

function printData(img: Image): string {
  const channels = [];
  for (let c = 0; c < img.channels; c++) {
    channels.push(`[${printChannel(img, c)}]`);
  }
  return `{
    ${channels.join('\n\n    ')}
  }`;
}

function printChannel(img: Image, c: number): string {
  const result = [];
  const padding = img.depth === 8 ? 3 : 5;
  for (let i = 0; i < img.height; i++) {
    const line = [];
    for (let j = 0; j < img.width; j++) {
      line.push(String(img.getValue(i, j, c)).padStart(padding, ' '));
    }
    result.push(`[${line.join(' ')}]`);
  }
  return result.join('\n     ');
}
