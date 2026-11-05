// 국토교통부 TAGO(국가대중교통정보센터) 공공데이터 API 공통 함수
// 공공데이터포털(data.go.kr)에서 아래 두 API를 '활용신청' 해야 합니다.
//  - 국토교통부_(TAGO)_버스정류소정보 : BusSttnInfoInqireService
//  - 국토교통부_(TAGO)_버스도착정보   : ArvlInfoInqireService
// 환경변수 DATA_GO_KR_KEY 에는 '일반 인증키(Decoding)' 값을 넣으세요.

const BASE = "https://apis.data.go.kr/1613000";

function toList(json) {
  const items = json?.response?.body?.items;
  if (!items || items === "") return [];
  const item = items.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export async function tago(service, op, params) {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) {
    const err = new Error("DATA_GO_KR_KEY 환경변수가 없습니다");
    err.code = "NO_KEY";
    throw err;
  }
  const qs = new URLSearchParams({ _type: "json", numOfRows: "100", pageNo: "1", ...params });
  const url = `${BASE}/${service}/${op}?serviceKey=${encodeURIComponent(key)}&${qs}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 키 오류 등은 XML 로 내려옵니다
    const msg = (text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/) || [])[1] || text.slice(0, 200);
    throw new Error(`TAGO 응답 오류: ${msg}`);
  }
  const code = json?.response?.header?.resultCode;
  if (code && code !== "00") throw new Error(`TAGO 오류 ${code}: ${json.response.header.resultMsg}`);
  return toList(json);
}

export function cityCode(q) {
  return q || process.env.TAGO_CITY_CODE || "32070"; // 삼척시 (getCtyCodeList 로 확인 가능)
}

export function send(res, status, body, cacheSec = 0) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cacheSec) res.setHeader("Cache-Control", `s-maxage=${cacheSec}, stale-while-revalidate=${cacheSec}`);
  res.status(status).send(JSON.stringify(body));
}
