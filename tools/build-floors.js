// 사용법:  node tools/build-floors.js
// photos/ 폴더 구조를 읽어 data/floors.json 을 만듭니다.
//
//   photos/
//     120/                 ← 건물 번호 (캠퍼스맵 번호: 120 = 제5공학관)
//       1F/                ← 층 이름: B1, 1F, 2F, 3F, 옥상 ...
//         01_로비.jpg      ← 파일명이 사진 설명이 됩니다 (앞의 숫자_ 는 순서용, 화면엔 안 보임)
//         02_강의실 복도.jpg
//         info.txt         ← (선택) 첫 줄 = 층 설명. 예: "강의실·학과사무실"
//       2F/ ...
//
// 사진은 가로 1600px 이하 JPG/WebP 권장 (휴대폰 원본은 너무 커서 느립니다).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS = path.join(ROOT, "photos");
const IMG = /\.(jpe?g|png|webp|avif)$/i;

const floorRank = (label) => {
  const l = label.toUpperCase();
  let m;
  if (/^외부/.test(l)) return -1000;          // 외관 사진을 맨 앞에
  if (/^로비|^본관/.test(l)) return -500;
  if ((m = l.match(/^별관\s*(\d+)/))) return 200 + Number(m[1]);
  if (/공용|생활|기타/.test(l)) return 800;
  if (/옆|주변/.test(l)) return 900;
  if ((m = l.match(/^B(\d+)/)) || (m = l.match(/^지하\s*(\d+)/))) return -Number(m[1]);
  if ((m = l.match(/^(\d+)/))) return Number(m[1]);
  if (/옥상|ROOF|RF/.test(l)) return 999;
  return 500;
};
const caption = (file) => path.parse(file).name.replace(/^\d+[\s._-]*/, "").replace(/[_]+/g, " ").trim();
const dirs = (p) => (fs.existsSync(p) ? fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

const out = { _note: "node tools/build-floors.js 로 photos/ 폴더에서 자동 생성됩니다. 직접 고쳐도 됩니다." };
let total = 0;
for (const bno of dirs(PHOTOS).sort()) {
  const floors = [];
  for (const fl of dirs(path.join(PHOTOS, bno)).sort((a, b) => floorRank(a) - floorRank(b))) {
    const dir = path.join(PHOTOS, bno, fl);
    const files = fs.readdirSync(dir).filter((f) => IMG.test(f)).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    const info = path.join(dir, "info.txt");
    const desc = fs.existsSync(info) ? fs.readFileSync(info, "utf8").split(/\r?\n/)[0].trim() : "";
    floors.push({
      label: fl,
      desc,
      photos: files.map((f) => ({ src: `photos/${bno}/${encodeURIComponent(fl)}/${encodeURIComponent(f)}`, caption: caption(f) })),
    });
    total += files.length;
  }
  if (floors.length) out[`n${bno}`] = { floors };
}
fs.writeFileSync(path.join(ROOT, "data", "floors.json"), JSON.stringify(out, null, 2));
console.log(`floors.json 생성: 건물 ${Object.keys(out).length - 1}개, 사진 ${total}장`);
