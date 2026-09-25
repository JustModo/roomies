/** Root-mean-square level of the analyser's current time-domain window (0 = silence). */
export function rmsLevel(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sumSquares = 0;
  for (const sample of data) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / data.length);
}
