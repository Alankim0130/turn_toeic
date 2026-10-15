/**
 * 시험용 ZIP 읽기 — `zip.ts` 로 묶은 파일(.docx)을 다시 푼다 (가운데 목록 → 로컬 머리 → inflate). CRC 가 맞지 않으면 던진다.
 * 테스트에서만 쓴다 (`zip.test.ts` · `class-roster-docx.test.ts`).
 */
import { inflateRawSync } from "node:zlib";
import { crc32 } from "../zip";

export type UnzippedEntry = { name: string; data: Buffer; method: number };

export function unzip(bytes: Uint8Array): UnzippedEntry[] {
  const buf = Buffer.from(bytes);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("unzip: 끝 머리가 없다");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out: UnzippedEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("unzip: 가운데 목록 머리가 아니다");
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const csize = buf.readUInt32LE(at + 20);
    const usize = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`unzip: ${name} 로컬 머리가 아니다`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const packed = buf.subarray(start, start + csize);
    const data = method === 8 ? inflateRawSync(packed) : Buffer.from(packed);
    if (data.length !== usize) throw new Error(`unzip: ${name} 크기가 다르다`);
    if (crc32(data) !== crc) throw new Error(`unzip: ${name} CRC 가 다르다`);
    out.push({ name, data, method });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
