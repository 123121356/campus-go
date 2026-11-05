// 커뮤니티 글·실시간 제보를 모든 사용자가 같이 보도록 서버(Upstash Redis)에 저장
// GET  /api/community?me=<내 토큰>            → { shared:true, posts:[...], reports:[...] }  (내 글이면 mine:true)
// POST /api/community  { kind:"post",   me, post:{type,title,body} }
//                      { kind:"report", me, report:{place,level,note} }
//                      { kind:"done",   me, id, done }   ← 내 글만
//                      { kind:"rm",     me, id }         ← 내 글만
// 필요한 환경변수 (Vercel › Storage › Upstash Redis 를 프로젝트에 연결하면 자동으로 들어감)
//   KV_REST_API_URL, KV_REST_API_TOKEN   (또는 UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
// 환경변수가 없으면 503 → 앱은 예전처럼 '이 기기에만 저장' 모드로 동작합니다.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const POSTS = "cg:posts", REPORTS = "cg:reports";
const MAX_POSTS = 300, MAX_REPORTS = 300;
const TYPES = ["분실물", "중고거래", "팀원모집", "동아리·행사", "주변정보", "학식메뉴"];

async function redis(cmds) {
  const r = await fetch(`${URL_.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`DB ${r.status}`);
  const out = await r.json();
  const bad = out.find((x) => x && x.error);
  if (bad) throw new Error(bad.error);
  return out.map((x) => x.result);
}

const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const maskPhone = (s) => s.replace(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, "(번호 가림)");
const tokenOk = (t) => typeof t === "string" && /^[a-z0-9]{8,40}$/i.test(t);
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function send(res, code, obj) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(code).send(JSON.stringify(obj));
}

function publicPost(p, me) {
  const { owner, ...rest } = p;
  return { ...rest, mine: !!me && owner === me };
}

export default async function handler(req, res) {
  if (!URL_ || !TOKEN) return send(res, 503, { shared: false, code: "NO_DB", error: "공유 저장소(Upstash Redis) 환경변수가 없어요" });
  try {
    if (req.method === "GET") {
      const me = tokenOk(req.query.me) ? req.query.me : "";
      const [h, reps] = await redis([["HVALS", POSTS], ["LRANGE", REPORTS, 0, 99]]);
      const posts = (h || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean)
        .sort((a, b) => b.at - a.at).map((p) => publicPost(p, me));
      const reports = (reps || []).map((s) => { try { const { owner, ...r } = JSON.parse(s); return r; } catch { return null; } }).filter(Boolean);
      return send(res, 200, { shared: true, posts, reports });
    }

    if (req.method !== "POST") return send(res, 405, { error: "GET 또는 POST만 돼요" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const me = tokenOk(b.me) ? b.me : "";
    if (!me) return send(res, 400, { error: "사용자 토큰이 없어요" });

    if (b.kind === "post") {
      const p = b.post || {};
      const title = maskPhone(clip(p.title || p.body, 60)), body = maskPhone(clip(p.body, 400));
      if (!title) return send(res, 400, { error: "제목이나 내용이 필요해요" });
      const post = { id: id(), type: TYPES.includes(p.type) ? p.type : "주변정보", title, body, at: Date.now(), done: false, owner: me };
      const [, n] = await redis([["HSET", POSTS, post.id, JSON.stringify(post)], ["HLEN", POSTS]]);
      if (n > MAX_POSTS) { // 오래된 글 정리
        const [all] = await redis([["HVALS", POSTS]]);
        const old = all.map((s) => JSON.parse(s)).sort((a, c) => a.at - c.at).slice(0, n - MAX_POSTS).map((x) => x.id);
        if (old.length) await redis([["HDEL", POSTS, ...old]]);
      }
      return send(res, 200, { ok: true, post: publicPost(post, me) });
    }

    if (b.kind === "report") {
      const r = b.report || {};
      const lv = /혼잡|많|붐/.test(r.level) ? "혼잡" : /여유|한산|적/.test(r.level) ? "여유" : "보통";
      const rep = { place: clip(r.place, 30), level: lv, note: maskPhone(clip(r.note, 80)), at: Date.now() };
      if (!rep.place) return send(res, 400, { error: "장소가 필요해요" });
      await redis([["LPUSH", REPORTS, JSON.stringify(rep)], ["LTRIM", REPORTS, 0, MAX_REPORTS - 1]]);
      return send(res, 200, { ok: true, report: rep });
    }

    if (b.kind === "done" || b.kind === "rm") {
      const [raw] = await redis([["HGET", POSTS, clip(b.id, 40)]]);
      if (!raw) return send(res, 404, { error: "글이 없어요" });
      const p = JSON.parse(raw);
      if (p.owner !== me) return send(res, 403, { error: "내가 쓴 글만 바꿀 수 있어요" });
      if (b.kind === "rm") await redis([["HDEL", POSTS, p.id]]);
      else { p.done = !!b.done; await redis([["HSET", POSTS, p.id, JSON.stringify(p)]]); }
      return send(res, 200, { ok: true });
    }

    return send(res, 400, { error: "알 수 없는 요청" });
  } catch (e) {
    return send(res, 502, { error: e.message });
  }
}
