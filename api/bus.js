// GET /api/bus?nodeId=XXX            → 해당 정류소 실시간 도착 예정 버스
// GET /api/bus?name=강원대           → nodeId 를 모를 때 이름으로 찾아서 첫 정류소들의 도착정보
import { tago, cityCode, send } from "./_tago.js";

async function arrivals(city, nodeId) {
  const list = await tago("ArvlInfoInqireService", "getSttnAcctoArvlPrearngeInfoList", {
    cityCode: city,
    nodeId,
  });
  return list
    .map((a) => ({
      route: String(a.routeno),
      routeType: a.routetp,
      vehicle: a.vehicletp,
      stopsAway: Number(a.arrprevstationcnt),
      seconds: Number(a.arrtime),
      stopName: a.nodenm,
    }))
    .sort((x, y) => x.seconds - y.seconds);
}

export default async function handler(req, res) {
  const city = cityCode(req.query.city);
  try {
    let nodeIds = [];
    if (req.query.nodeId) {
      nodeIds = String(req.query.nodeId).split(",").filter(Boolean);
    } else {
      const name = (req.query.name || "강원대").toString();
      const stops = await tago("BusSttnInfoInqireService", "getSttnNoList", { cityCode: city, nodeNm: name });
      nodeIds = stops.slice(0, 4).map((s) => s.nodeid);
    }
    const results = await Promise.all(nodeIds.map((id) => arrivals(city, id).catch(() => [])));
    const list = results.flat().sort((x, y) => x.seconds - y.seconds);
    send(res, 200, { updatedAt: new Date().toISOString(), nodeIds, arrivals: list }, 20);
  } catch (e) {
    send(res, e.code === "NO_KEY" ? 503 : 502, { error: e.message, code: e.code || "UPSTREAM" });
  }
}
