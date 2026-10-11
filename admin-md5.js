function telaoMd5Hex(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  function mix(block, offset) {
    const view = block.buffer ? new DataView(block.buffer, block.byteOffset + offset, 64) : new DataView(block, offset, 64);
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j += 1) M[j] = view.getUint32(j * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i += 1) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      const rotated = ((F << shifts[i]) | (F >>> (32 - shifts[i]))) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotated) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const blocks = Math.floor(bytes.length / 64);
  for (let block = 0; block < blocks; block += 1) mix(bytes, block * 64);
  const rest = bytes.length % 64;
  const tailLen = rest < 56 ? 64 : 128;
  const tail = new Uint8Array(tailLen);
  tail.set(bytes.subarray(blocks * 64));
  tail[rest] = 0x80;
  const tailView = new DataView(tail.buffer);
  const bits = bytes.length * 8;
  tailView.setUint32(tailLen - 8, bits >>> 0, true);
  tailView.setUint32(tailLen - 4, Math.floor(bits / 4294967296), true);
  for (let offset = 0; offset < tailLen; offset += 64) mix(tail, offset);

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return [...out].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
