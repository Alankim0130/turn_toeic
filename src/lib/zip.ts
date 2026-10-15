/**
 * 작은 ZIP 쓰기 — Word(.docx) 파일을 묶는다 (2026-10-15 학생명단 Word 받기, `class-roster-docx.ts`). .docx 는 XML 파일 몇 개를 ZIP 으로 묶은 것이다.
 * 라이브러리를 들이지 않았다 — 필요한 것은 "파일 몇 개를 deflate 로 묶기" 뿐이다 (ZIP64 · 암호 · 읽기는 없다. 파일 하나 4GB 아래).
 * 서버에서만 쓴다 (node:zlib). `zip.test.ts` 가 다시 풀어 내용 · CRC 를 본다.
 */
import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** ZIP 이 쓰는 CRC-32 (IEEE) */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array | string };

/** ZIP 안의 시각 (DOS 꼴 — 2초 단위). 파일마다 같은 값을 쓴다 */
function dosTime(d: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, d.getUTCFullYear()));
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/**
 * 파일들을 ZIP 하나로 — 넣은 순서대로 (.docx 는 `[Content_Types].xml` 을 맨 앞에 두는 것이 관례다).
 * 이름은 ASCII 경로만 받는다 (`word/document.xml` 같은 꼴 — 한글 이름은 쓰지 않는다).
 */
export function zipFiles(entries: readonly ZipEntry[], at: Date = new Date()): Uint8Array {
  const { time, date } = dosTime(at);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!/^[\x21-\x7e]+$/.test(entry.name)) throw new Error(`zip: 이름은 ASCII 경로만 — ${entry.name}`);
    const name = Buffer.from(entry.name, "ascii");
    const raw = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    const packed = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 로컬 파일 머리
    local.writeUInt16LE(20, 4); // 풀 때 필요한 판 (2.0 — deflate)
    local.writeUInt16LE(0, 6); // 깃발 없음
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // 덧붙임 없음
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // 가운데 목록 머리
    central.writeUInt16LE(20, 4); // 만든 판
    central.writeUInt16LE(20, 6); // 풀 때 필요한 판
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    // 덧붙임 · 설명 · 디스크 · 속성은 0
    central.writeUInt32LE(offset, 42); // 로컬 머리 자리
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 끝 머리
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}
