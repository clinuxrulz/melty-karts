import { Howl } from "howler";

export interface BeepConfig {
  frequency: number;
  duration: number;
  startTime: number;
}

export interface ReadySteadyGoConfig {
  readyBeep: BeepConfig;
  steadyBeep: BeepConfig;
  goBeep: BeepConfig;
}

export const defaultReadySteadyGoConfig: ReadySteadyGoConfig = {
  readyBeep: { frequency: 220, duration: 0.15, startTime: 0 },
  steadyBeep: { frequency: 220, duration: 0.15, startTime: 1.0 },
  goBeep: { frequency: 440, duration: 0.3, startTime: 2.0 },
};

function generateTone(
  audioCtx: AudioContext,
  frequency: number,
  duration: number,
  startTime: number
): Float32Array {
  const sampleRate = audioCtx.sampleRate;
  const samples = Math.floor(duration * sampleRate);
  const buffer = audioCtx.createBuffer(1, samples, sampleRate);
  const channelData = buffer.getChannelData(0);

  const angularFrequency = 2 * Math.PI * frequency;
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, Math.min(t * 50, (duration - t) * 50));
    channelData[i] = Math.sin(angularFrequency * t) * envelope;
  }

  return channelData;
}

export function generateReadySteadyGoAudio(
  config: ReadySteadyGoConfig = defaultReadySteadyGoConfig
): AudioBuffer {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const totalDuration =
    config.goBeep.startTime + config.goBeep.duration + 0.1;
  const sampleRate = audioCtx.sampleRate;
  const totalSamples = Math.ceil(totalDuration * sampleRate);

  const outputBuffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
  const output = outputBuffer.getChannelData(0);

  const readyData = generateTone(
    audioCtx,
    config.readyBeep.frequency,
    config.readyBeep.duration,
    config.readyBeep.startTime
  );
  const steadyData = generateTone(
    audioCtx,
    config.steadyBeep.frequency,
    config.steadyBeep.duration,
    config.steadyBeep.startTime
  );
  const goData = generateTone(
    audioCtx,
    config.goBeep.frequency,
    config.goBeep.duration,
    config.goBeep.startTime
  );

  for (let i = 0; i < readyData.length; i++) {
    const targetIndex = Math.floor(config.readyBeep.startTime * sampleRate) + i;
    if (targetIndex < totalSamples) {
      output[targetIndex] += readyData[i] * 0.5;
    }
  }

  for (let i = 0; i < steadyData.length; i++) {
    const targetIndex = Math.floor(config.steadyBeep.startTime * sampleRate) + i;
    if (targetIndex < totalSamples) {
      output[targetIndex] += steadyData[i] * 0.5;
    }
  }

  for (let i = 0; i < goData.length; i++) {
    const targetIndex = Math.floor(config.goBeep.startTime * sampleRate) + i;
    if (targetIndex < totalSamples) {
      output[targetIndex] += goData[i] * 0.7;
    }
  }

  return outputBuffer;
}

export function audioBufferToHowlSrc(
  audioBuffer: AudioBuffer
): string {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const wavBuffer = audioBufferToWav(audioCtx, audioBuffer);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  return url;
}

function audioBufferToWav(audioCtx: AudioContext, buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const channelData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

let cachedReadySteadyGoHowl: Howl | undefined;
let cachedBlobUrl: string | undefined;

export function createReadySteadyGoSound(): Howl {
  if (cachedReadySteadyGoHowl) {
    return cachedReadySteadyGoHowl;
  }

  const audioBuffer = generateReadySteadyGoAudio();
  const src = audioBufferToHowlSrc(audioBuffer);
  cachedBlobUrl = src;

  cachedReadySteadyGoHowl = new Howl({
    src: [src],
    format: ["wav"],
    volume: 0.7,
  });

  return cachedReadySteadyGoHowl;
}

export function playReadySteadyGo(): void {
  const sound = createReadySteadyGoSound();
  sound.play();
}

export function disposeReadySteadyGoSound(): void {
  if (cachedReadySteadyGoHowl) {
    cachedReadySteadyGoHowl.unload();
    cachedReadySteadyGoHowl = undefined;
  }
  if (cachedBlobUrl) {
    URL.revokeObjectURL(cachedBlobUrl);
    cachedBlobUrl = undefined;
  }
}