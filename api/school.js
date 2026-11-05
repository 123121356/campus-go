// GET /api/school  → 강원대 홈페이지 공지(일반·학사·장학·행사) 중 삼척/전체 캠퍼스 글을 실시간으로 모아 줍니다.
// 학교 사이트가 느리거나 막히면 data/school.json(스냅샷)을 앱이 대신 씁니다.
// 로컬(dev-server)에서 ?save=1 로 부르면 data/school.json 스냅샷을 갱신합니다.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://www.kangwon.ac.kr";
const BOARDS = { general: 504, academic: 720, scholarship: 721, events: 715 };
const LABEL = { general: "일반공지", academic: "학사공지", scholarship: "장학공지", events: "행사안내" };
let CACHE = null; // { at, data } — 같은 서버 인스턴스에서 30분 재사용

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/<[^>]*$/, "")
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

async function get(url, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (CampusGO hackathon)", "Accept-Language": "ko" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

function parseList(html, board) {
  const out = [];
  const body = html.slice(html.indexOf("<thead"));
  for (const row of body.split(/<tr[\s>]/).slice(1)) {
    const a = row.match(/href="(\/ko\/bbs\/\d+\/detail\.do\?pstSn=(\d+))[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    const campus = (row.match(/photo-chip[^>]*>([^<]+)</g) || []).map((s) => s.replace(/.*>/, "").replace("<", "").trim()).join(" ") || tds[1] || "";
    const date = tds.find((x) => /^\d{4}\.\d\d\.\d\d$/.test(x)) || "";
    out.push({ board, id: a[2], campus, title: strip(a[3]), date, url: BASE + a[1], by: tds[3] && !/^\d{4}\./.test(tds[3]) ? tds[3] : "" });
  }
  return out;
}

function parseDetail(html) {
  const i = html.indexOf("editor-wrap");
  const body = i > 0 ? strip(html.slice(i, html.indexOf("view-file", i) > 0 ? html.indexOf("view-file", i) : i + 20000)).replace(/^[^>]*>/, "") : "";
  const tel = (strip(html).match(/문의전화\s*([\d-]{7,})/) || [])[1] || "";
  return { body: body.replace(/\n+/g, " ").slice(0, 700), tel };
}

async function collect() {
  const all = {};
  await Promise.all(Object.entries(BOARDS).map(async ([k, id]) => {
    const pages = await Promise.all([1, 2].map((p) => get(`${BASE}/ko/bbs/${id}/list.do?pageIndex=${p}`).catch(() => "")));
    const seen = new Set();
    all[k] = pages.flatMap((h) => parseList(h, k)).filter((x) => /ALL|삼척/.test(x.campus) && !seen.has(x.id) && seen.add(x.id))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }));
  // 본문 요약용 앞부분 (게시판별 최근 8개)
  const jobs = Object.values(all).flatMap((list) => list.slice(0, 8));
  await Promise.all(jobs.map(async (x) => { try { Object.assign(x, parseDetail(await get(x.url, 7000))); } catch {} }));
  return { source: "강원대학교 홈페이지 공지사항 (www.kangwon.ac.kr)", fetchedAt: new Date().toISOString(), labels: LABEL, notices: all };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    if (!CACHE || Date.now() - CACHE.at > 30 * 60 * 1000 || req.query?.fresh) {
      const data = await collect();
      const n = Object.values(data.notices).reduce((s, l) => s + l.length, 0);
      if (!n) throw new Error("학교 사이트에서 글을 찾지 못했어요");
      CACHE = { at: Date.now(), data };
    }
    // 로컬 개발 서버에서만 스냅샷 저장 (배포 환경은 파일 쓰기가 막혀 있어 무시됨)
    const host = String(req.headers?.host || "");
    if (req.query?.save && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
      try { fs.writeFileSync(fileURLToPath(new URL("../data/school.json", import.meta.url)), JSON.stringify(CACHE.data, null, 1)); CACHE.data.saved = true; } catch (e) { CACHE.data.saved = e.message; }
    }
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).send(JSON.stringify(CACHE.data));
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: e.message }));
  }
}
