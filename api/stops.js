// GET /api/stops?name=강원대        → 삼척시에서 이름으로 정류소 검색 (nodeId 찾기용)
// GET /api/stops?cities=1          → TAGO 도시코드 목록 (삼척시 코드 확인용)
import { tago, cityCode, send } from "./_tago.js";

export default async function handler(req, res) {
  try {
    if (req.query.cities) {
      const list = await tago("BusSttnInfoInqireService", "getCtyCodeList", {});
      return send(res, 200, { cities: list }, 86400);
    }
    const name = (req.query.name || "강원대").toString();
    const list = await tago("BusSttnInfoInqireService", "getSttnNoList", {
      cityCode: cityCode(req.query.city),
      nodeNm: name,
    });
    const stops = list.map((s) => ({
      nodeId: s.nodeid,
      name: s.nodenm,
      no: s.nodeno,
      lat: Number(s.gpslati),
      lng: Number(s.gpslong),
    }));
    send(res, 200, { stops }, 3600);
  } catch (e) {
    send(res, e.code === "NO_KEY" ? 503 : 502, { error: e.message, code: e.code || "UPSTREAM" });
  }
}
