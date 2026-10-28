#!/usr/bin/env python3
"""Haul data refresher: pulls public MT/ID DOT + NWS data along the Missoula->Coeur d'Alene corridor.
Town-level / rounded coordinates only. No addresses."""
import json, math, re, time, html, urllib.request, urllib.parse, datetime as dt, os, concurrent.futures as cf
UA = {"User-Agent": "haul-app (github.com/UAPMontana/haul, travel info for personal use)", "Accept": "application/json, */*"}
OUT = os.path.join(os.path.dirname(__file__), "..", "site", "data")
os.makedirs(OUT, exist_ok=True)
def get(url, raw=False, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                b = r.read()
                if b[:2] == b"\x1f\x8b":
                    import gzip; b = gzip.decompress(b)
                return b if raw else json.loads(b)
        except Exception as e:
            err = e; time.sleep(2 + i * 3)
    raise err
def strip(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<br\s*/?>", " · ", re.sub(r"<(?!br)[^>]+>", " ", s or "")))).strip(" ·")

# Key points along I-90 (rounded, town-level). mi = approx I-90 miles from Missoula start.
POINTS = [
 ("Missoula", 46.87, -114.03, 3200, 0), ("Alberton", 47.00, -114.48, 3000, 30),
 ("Superior", 47.19, -114.89, 2750, 57), ("St. Regis", 47.30, -115.10, 2650, 72),
 ("Lookout Pass", 47.46, -115.70, 4710, 105), ("Wallace", 47.47, -115.93, 2730, 118),
 ("Kellogg", 47.54, -116.13, 2310, 130), ("4th of July Pass", 47.56, -116.50, 3080, 148),
 ("Coeur d'Alene", 47.68, -116.78, 2190, 168)]
ROUTES = {
 "main": {"name": "I-90 via Lookout Pass", "via": [(-114.03,46.87),(-115.10,47.30),(-115.70,47.46),(-116.78,47.68)]},
 "alt_200": {"name": "MT-135 / MT-200 / ID-200 / US-95 (Clark Fork, Sandpoint)", "via": [(-114.03,46.87),(-115.10,47.30),(-115.32,47.60),(-115.62,47.85),(-116.55,48.27),(-116.78,47.68)]},
 "alt_12": {"name": "US-12 Lolo Pass / Lewiston / US-95 (long, 2-lane)", "via": [(-114.03,46.87),(-114.09,46.75),(-114.70,46.64),(-116.97,46.42),(-116.78,47.68)]},
}
def osrm(via):
    c = ";".join(f"{x},{y}" for x, y in via)
    j = get(f"https://router.project-osrm.org/route/v1/driving/{c}?overview=simplified&geometries=geojson")
    r = j["routes"][0]
    return {"coords": [[round(y, 4), round(x, 4)] for x, y in r["geometry"]["coordinates"]], "miles": round(r["distance"] / 1609.34), "car_minutes": round(r["distance"] / 1609.34 / 65 * 60)}
def load_routes():
    cache = os.path.join(OUT, "routes.json")
    if os.path.exists(cache):
        d = json.load(open(cache))
        if all(k in d for k in ROUTES): return d
    d = {}
    for k, v in ROUTES.items():
        try: d[k] = {"name": v["name"], **osrm(v["via"])}
        except Exception as e: print("osrm", k, e)
    json.dump(d, open(cache, "w"))
    return d
def hav(a, b):
    R = 6371; la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    return 2 * R * math.asin(math.sqrt(math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2))
def near(pt, line, km=12):
    best = (1e9, 0)
    for i, p in enumerate(line):
        d = hav(pt, p)
        if d < best[0]: best = (d, i)
    return best if best[0] <= km else None
def along(line, idx):  # miles along polyline to vertex idx
    return round(sum(hav(line[i], line[i+1]) for i in range(idx)) / 1.609, 1)

routes = load_routes(); MAIN = routes["main"]["coords"]
ALTS = {k: v["coords"] for k, v in routes.items()}
def corridor(lat, lon, km=12):
    for k in ["main", "alt_200", "alt_12"]:
        n = near((lat, lon), ALTS.get(k, []), km)
        if n: return k, along(ALTS[k], n[1])
    return None
errors = []
def safe(name, fn, default):
    try: return fn()
    except Exception as e:
        errors.append(f"{name}: {e}"); print("ERR", name, e); return default

# ---------- NWS ----------
def nws_point(p):
    name, lat, lon, elev, mi = p
    meta = get(f"https://api.weather.gov/points/{lat},{lon}")["properties"]
    fc = get(meta["forecast"])["properties"]["periods"][:8]
    hr = get(meta["forecastHourly"])["properties"]["periods"][:48]
    def mph(s):
        n = [int(x) for x in re.findall(r"\d+", s or "")]; return max(n) if n else 0
    hourly = [{"t": h["startTime"], "temp": h["temperature"], "wind": mph(h["windSpeed"]), "dir": h["windDirection"],
               "pop": (h.get("probabilityOfPrecipitation") or {}).get("value") or 0, "short": h["shortForecast"]} for h in hr]
    gusts = {}
    try:  # gridpoint raw data has gusts
        g = get(meta["forecastGridData"])["properties"]["windGust"]["values"]
        for v in g[:60]:
            gusts[v["validTime"].split("/")[0]] = round((v["value"] or 0) * 0.621371)
    except Exception as e: pass
    return {"name": name, "lat": lat, "lon": lon, "elev": elev, "mi": mi, "office": meta["gridId"],
            "periods": [{"name": f["name"], "temp": f["temperature"], "unit": f["temperatureUnit"], "wind": f["windSpeed"], "dir": f["windDirection"],
                          "short": f["shortForecast"], "detail": f["detailedForecast"], "icon": f["icon"], "pop": (f.get("probabilityOfPrecipitation") or {}).get("value") or 0,
                          "isDay": f["isDaytime"], "start": f["startTime"]} for f in fc],
            "hourly": hourly, "gusts": [{"t": k, "mph": v} for k, v in sorted(gusts.items())][:48]}
def nws_alerts():
    out = {}
    for p in POINTS:
        try:
            for f in get(f"https://api.weather.gov/alerts/active?point={p[1]},{p[2]}")["features"]:
                a = f["properties"]
                o = out.setdefault(a["id"], {"event": a["event"], "severity": a["severity"], "headline": a["headline"], "desc": a["description"],
                    "instr": a.get("instruction"), "ends": a.get("ends") or a.get("expires"), "onset": a.get("onset"), "areas": [], "url": a.get("@id") or a["id"]})
                o["areas"].append(p[0])
        except Exception as e: errors.append(f"alerts {p[0]}: {e}")
    return list(out.values())
def afd():
    out = {}
    for off in ["MSO", "OTX"]:
        try:
            l = get(f"https://api.weather.gov/products/types/AFD/locations/{off}")["@graph"][0]
            t = get(l["@id"])["productText"]
            m = re.search(r"\.KEY MESSAGES\.*\s*(.*?)(?:\n&&|\n\.[A-Z])", t, re.S) or re.search(r"\.(?:SYNOPSIS|DISCUSSION)\.*\s*(.*?)(?:\n&&|\n\.[A-Z])", t, re.S)
            out[off] = {"issued": l["issuanceTime"], "text": re.sub(r"\s+", " ", (m.group(1) if m else t[:1500]))[:1400]}
        except Exception as e: errors.append(f"afd {off}: {e}")
    return out

# ---------- Montana (MDT 511 / Iteris public CDN) ----------
MTCDN = "https://mt.cdn.iteris-atis.com/geojson/icons/metadata/"
def mt_layer(name, kind):
    out = []
    for f in get(MTCDN + f"icons.{name}.geojson")["features"]:
        g = f["geometry"]; c = g["coordinates"]
        while isinstance(c[0], list): c = c[0]
        lat, lon = float(c[1]), float(c[0]); cr = corridor(lat, lon)
        if not cr: continue
        p = f["properties"]
        out.append({"src": "MT 511", "kind": kind, "route": p.get("route"), "where": p.get("location_description") or p.get("label"),
                    "title": p.get("headline") or kind, "text": strip(p.get("enhanced_report") or p.get("report")), "lat": round(lat, 4), "lon": round(lon, 4),
                    "corr": cr[0], "mi": cr[1], "updated": p.get("last_update"), "category": p.get("category")})
    return out
def mt_rwis():
    out = []
    for f in get(MTCDN + "icons.rwis.geojson")["features"]:
        c = f["geometry"]["coordinates"]; cr = corridor(float(c[1]), float(c[0]), 5)
        if not cr: continue
        p = f["properties"]; a = (p.get("atmos") or [{}])[0]; s = (p.get("surface") or [{}])
        v = lambda d, k: (d.get(k) or {}).get("value")
        out.append({"src": "MDT RWIS", "name": p.get("name"), "where": p.get("description"), "lat": round(c[1], 4), "lon": round(c[0], 4), "corr": cr[0], "mi": cr[1],
            "air": v(a, "air_temperature"), "wind": v(a, "wind_speed"), "gust": v(a, "wind_gust"), "wdir": v(a, "wind_direction"), "precip": v(a, "precip_type"),
            "rh": v(a, "relative_humidity"), "obs": v(a, "observation_time"),
            "surface": [{"cond": v(x, "surface_condition"), "temp": v(x, "surface_temperature")} for x in s if v(x, "surface_condition") or v(x, "surface_temperature") is not None],
            "cams": [{"name": cm.get("name"), "img": cm.get("image"), "t": cm.get("updateTime")} for cm in p.get("cameras") or []]})
    return out
def mt_cams():
    out = []
    for f in get(MTCDN + "icons.cameras.geojson")["features"]:
        c = f["geometry"]["coordinates"]; cr = corridor(c[1], c[0], 8)
        if not cr: continue
        p = f["properties"]
        if re.search(r" ID$", p.get("description") or ""): continue  # Idaho cams come direct from Idaho 511
        out.append({"src": "MT 511", "name": p.get("description"), "lat": round(c[1], 4), "lon": round(c[0], 4), "corr": cr[0], "mi": cr[1],
                    "views": [{"name": v.get("name"), "img": v.get("image"), "t": v.get("updateTime")} for v in p.get("cameras", [])]})
    return out
def mt_facilities():
    out = []
    for lt in ["rest_area", "port_of_entry"]:
        for f in get(f"https://aggregator.iteris-atis.com/aggregator/services/layers/group/mdt/current/?layer_type={lt}")["features"]:
            c = f["geometry"]["coordinates"]; cr = corridor(c[1], c[0], 6)
            if not cr: continue
            p = f["properties"]
            out.append({"src": "MT 511", "type": p.get("facility_type") or p.get("content_type"), "name": p.get("title"), "lat": round(c[1], 4), "lon": round(c[0], 4),
                        "corr": cr[0], "mi": cr[1], "note": strip(p.get("message")), "dir": p.get("dir")})
    return out

# ---------- Idaho (511.idaho.gov public map layers) ----------
ID = "https://511.idaho.gov"
def id_icons(layer): return get(f"{ID}/map/mapIcons/{layer}").get("item2", [])
def id_tip(layer, iid):
    t = get(f"{ID}/tooltip/{layer}/{iid}?lang=en", raw=True).decode("utf8", "ignore")
    return t
def id_cams():
    items = [i for i in id_icons("Cameras") if corridor(*i["location"], 8)]
    def one(i):
        t = id_tip("Cameras", i["itemId"])
        m = re.search(r">\s*((?:I-90|US-\d+|SH-\d+|ID-\d+|D\d )[^<]{2,70}?)\s*<", t)
        title = m.group(1) if m else "Idaho camera"
        imgs = re.findall(r'data-lazy="(/map/Cctv/\d+)"', t) or re.findall(r'src="(/map/Cctv/\d+)"', t)
        alts = re.findall(r'<img[^>]+data-lazy="/map/Cctv/\d+"[^>]*alt="([^"]*)"', t)
        cr = corridor(*i["location"], 8)
        title = re.sub(r"^Camera\s*\d*\s*", "", re.sub(r"\s+", " ", title)).split(",")[0].strip()
        return {"src": "Idaho 511", "name": title[:80], "lat": round(i["location"][0], 4), "lon": round(i["location"][1], 4), "corr": cr[0], "mi": cr[1],
                "views": [{"name": (alts[k] if k < len(alts) else f"View {k+1}"), "img": ID + u} for k, u in enumerate(dict.fromkeys(imgs))]}
    with cf.ThreadPoolExecutor(6) as ex: res = [c for c in ex.map(one, items) if c["views"]]
    # drop CdA city-street cams; keep I-90 / highway cams
    return [c for c in res if not (c["corr"] == "main" and c["mi"] > 155 and not re.search(r"I-90", c["name"]))]
def id_events():
    out = []
    for layer, kind in [("Incidents", "incident"), ("Closures", "closure"), ("Construction", "construction"), ("TruckRestrictions", "restriction"),
                        ("WeatherEvents", "weather"), ("SpecialEvents", "event"), ("MessageSigns", "sign")]:
        try: items = id_icons(layer)
        except Exception as e: errors.append(f"ID {layer}: {e}"); continue
        for i in items:
            cr = corridor(*i["location"], 8 if kind != "sign" else 4)
            if not cr: continue
            try: t = strip(id_tip(layer, i["itemId"]))
            except Exception: t = ""
            t = re.sub(r"\s*(My Cameras|Close|&nbps;).*$", "", t)[:600]
            out.append({"src": "Idaho 511", "kind": kind, "title": layer, "text": t, "lat": round(i["location"][0], 4), "lon": round(i["location"][1], 4), "corr": cr[0], "mi": cr[1]})
    return out
def id_rest():
    out = []
    for i in id_icons("RestAreas"):
        cr = corridor(*i["location"], 6)
        if cr:
            try: t = strip(id_tip("RestAreas", i["itemId"]))[:300]
            except Exception: t = ""
            out.append({"src": "Idaho 511", "type": "Rest Area", "name": t.split(" Rest Area")[0][:60] + " Rest Area" if "Rest Area" in t else "Rest Area", "note": t,
                        "lat": round(i["location"][0], 4), "lon": round(i["location"][1], 4), "corr": cr[0], "mi": cr[1]})
    return out
def id_wx():
    out = []
    for i in id_icons("WeatherStations"):
        cr = corridor(*i["location"], 8)
        if cr and cr[0] == "main":
            try: t = strip(id_tip("WeatherStations", i["itemId"]))[:500]
            except Exception: t = ""
            out.append({"src": "ITD RWIS", "text": t, "lat": round(i["location"][0], 4), "lon": round(i["location"][1], 4), "corr": cr[0], "mi": cr[1]})
    return out

# ---------- FAA WeatherCams (public JSON used by weathercams.faa.gov) ----------
def faa_cams():
    out = []
    try:
        j = get("https://weathercams.faa.gov/api/sites?bounds=46.5,-117.2,48.5,-113.6")
        sites = j.get("payload") or j
    except Exception as e:
        errors.append(f"FAA cams: {e}"); return out
    for s in sites if isinstance(sites, list) else []:
        lat, lon = s.get("latitude"), s.get("longitude")
        if lat is None or not corridor(lat, lon, 15): continue
        cr = corridor(lat, lon, 15)
        out.append({"src": "FAA WeatherCams", "name": s.get("siteName") or s.get("name"), "id": s.get("siteId") or s.get("id"), "lat": round(lat, 3), "lon": round(lon, 3),
                    "corr": cr[0], "mi": cr[1], "url": f"https://weathercams.faa.gov/map/{lon},{lat},11"})
    return out

# ---------- Aviation surface obs (aviationweather.gov, same data ForeFlight shows) ----------
def metars():
    j = get("https://aviationweather.gov/api/data/metar?ids=KMSO,KMLP,KCOE,KSZT,KLWS&format=json")
    names = {"KMSO": "Missoula", "KMLP": "Mullan Pass (I-90, 1 mi W of Lookout)", "KCOE": "Coeur d'Alene", "KSZT": "Sandpoint (alt route)", "KLWS": "Lewiston (US-12 alt)"}
    return [{"id": m["icaoId"], "name": names.get(m["icaoId"], m.get("name")), "raw": m["rawOb"], "obs": m.get("obsTime"), "temp_c": m.get("temp"),
             "wind_kt": m.get("wspd"), "gust_kt": m.get("wgst"), "wdir": m.get("wdir"), "vis": m.get("visib"), "wx": m.get("wxString"), "cat": m.get("fltCat")} for m in j]

# ---------- Sun ----------
def sun():
    j = get("https://api.sunrise-sunset.org/json?lat=47.2&lng=-115.4&formatted=0&date=today")["results"]
    j2 = get("https://api.sunrise-sunset.org/json?lat=47.2&lng=-115.4&formatted=0&date=tomorrow")["results"]
    k = ("sunrise", "sunset", "civil_twilight_begin", "civil_twilight_end")
    return {"today": {x: j[x] for x in k}, "tomorrow": {x: j2[x] for x in k}}

# ---------- Departure planner ----------
TOW_MPH = {"dry": 55, "wet": 50, "snow": 35}
def plan(wx, alerts, events, rwis):
    """Score each departure hour over next 36h. Lower is better."""
    pts = {w["name"]: w for w in wx}
    now = dt.datetime.now(dt.timezone.utc)
    base_min = round(168 / 55 * 60) + 30  # 168 mi @55mph towing + 30 min fuel/stretch
    cands = []
    for h in range(1, 37):
        dep = (now + dt.timedelta(hours=h)).replace(minute=0, second=0, microsecond=0)
        score, why, mins = 0.0, [], base_min
        for w in wx:
            eta = dep + dt.timedelta(minutes=base_min * w["mi"] / 168)
            hr = next((x for x in w["hourly"] if abs((dt.datetime.fromisoformat(x["t"]) - eta).total_seconds()) < 3600), None)
            if not hr: score += 3; continue
            gust = next((g["mph"] for g in w["gusts"] if abs((dt.datetime.fromisoformat(g["t"]) - eta).total_seconds()) < 3*3600), 0)
            s = hr["short"].lower(); pass_w = 3 if w["name"] in ("Lookout Pass", "4th of July Pass") else 1
            snowy = any(k in s for k in ("snow", "sleet", "freezing", "ice", "wintry"))
            if snowy and hr["pop"] >= 30:
                score += 4 * pass_w * hr["pop"] / 100; mins += 6 * pass_w; why.append(f"{hr['short']} {hr['pop']}% at {w['name']}")
            elif "rain" in s and hr["pop"] >= 40: score += 0.8 * pass_w; mins += 2
            if hr["temp"] <= 34 and hr["pop"] >= 30: score += 2 * pass_w; why.append(f"near-freezing {hr['temp']}°F + precip at {w['name']}")
            g = max(gust, hr["wind"])
            if g >= 40: score += 8; why.append(f"gusts ~{g} mph at {w['name']} (high-profile trailer risk)")
            elif g >= 30: score += 3; why.append(f"gusts ~{g} mph at {w['name']}")
            elif g >= 22: score += 1
            if "fog" in s: score += 1; why.append(f"fog at {w['name']}")
            # darkness on the pass
            if w["name"] == "Lookout Pass" and not hr.get("isDay", True): pass
        # daylight: penalize driving in the dark (local MT hour)
        loc = dep.astimezone(dt.timezone(dt.timedelta(hours=-6 if 3 <= dep.month <= 10 else -7)))
        arr = loc + dt.timedelta(minutes=mins)
        dark = sum(1 for k in range(0, mins, 15) if not (7 <= (loc + dt.timedelta(minutes=k)).hour < 18))
        score += dark * 0.35
        if dark > 2: why.append(f"~{dark*15} min of driving in darkness")
        if 6 <= loc.hour <= 8 and loc.weekday() < 5: score += 0.5  # Missoula AM rush / frosty bridges
        cands.append({"depart": dep.isoformat(), "arrive": (dep + dt.timedelta(minutes=mins)).isoformat(), "minutes": mins, "score": round(score, 1),
                      "why": list(dict.fromkeys(why))[:4]})
    for a in alerts:
        if any(k in a["event"] for k in ("Winter Storm", "Blizzard", "High Wind", "Ice Storm")) and a.get("ends"):
            end = dt.datetime.fromisoformat(a["ends"])
            for c in cands:
                if dt.datetime.fromisoformat(c["depart"]) < end: c["score"] += 6; c["why"].insert(0, a["event"] + " in effect")
    closure = [e for e in events if e.get("corr") == "main" and e["kind"] == "closure" and re.search(r"\bI-90\b", e.get("text") or "") and not re.search(r"ramp", e.get("text") or "", re.I)]
    best = sorted(cands, key=lambda c: (c["score"], c["depart"]))
    return {"base_minutes": base_min, "candidates": cands, "best": best[:3], "main_closure": len(closure) > 0,
            "logic": ["Towing speed 55 mph dry / 50 wet / 35 snow (Montana trucks+trailers max 65; 6% grade descents in a low gear).",
                      "Each departure hour is simulated: ETA at each of 9 checkpoints, using the NWS hourly forecast and gust grid at that place and time.",
                      "Penalties: snow/ice/freezing precip (3x weight on Lookout & 4th of July passes), near-freezing temps with precip, gusts ≥22/30/40 mph, fog, minutes driven in darkness, weekday Missoula AM rush.",
                      "Active Winter Storm / High Wind / Blizzard warnings add a heavy penalty until they expire. A full closure on I-90 overrides everything (wait, or take an alternate).",
                      "Base trip 168 mi ≈ 3 h 35 m towing incl. one fuel/brake-check stop; car time ~2 h 35 m. Idaho is Pacific Time — clock goes back 1 h at the state line."]}

def main():
    t0 = time.time()
    with cf.ThreadPoolExecutor(5) as ex:
        wx = [w for w in ex.map(lambda p: safe("nws " + p[0], lambda: nws_point(p), None), POINTS) if w]
    alerts = safe("alerts", nws_alerts, [])
    events = safe("mt events", lambda: mt_layer("events", "incident"), []) + safe("mt construction", lambda: mt_layer("construction", "construction"), []) \
           + safe("mt restrictions", lambda: mt_layer("restrictions", "restriction"), []) + safe("id events", id_events, [])
    rwis = safe("mt rwis", mt_rwis, []); idwx = safe("id rwis", id_wx, [])
    cams = safe("mt cams", mt_cams, []) + safe("id cams", id_cams, [])
    for r in rwis:
        if r["cams"]: cams.append({"src": "MDT RWIS", "name": r["name"], "lat": r["lat"], "lon": r["lon"], "corr": r["corr"], "mi": r["mi"], "views": [{"name": c["name"], "img": c["img"], "t": c["t"]} for c in r["cams"]]})
    cams.sort(key=lambda c: (c["corr"] != "main", c["corr"], c["mi"]))
    events.sort(key=lambda e: (e["corr"] != "main", e["corr"], e["mi"]))
    fac = safe("mt facilities", mt_facilities, []) + safe("id rest", id_rest, [])
    data = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "points": wx, "alerts": alerts, "afd": safe("afd", afd, {}),
            "events": events, "rwis": rwis, "id_wx": idwx, "cams": cams, "facilities": fac,
            "sun": safe("sun", sun, {}), "metars": safe("metars", metars, []), "routes": routes, "errors": errors, "build_seconds": round(time.time() - t0)}
    data["plan"] = safe("plan", lambda: plan(wx, alerts, events, rwis), {})
    json.dump(data, open(os.path.join(OUT, "data.json"), "w"), separators=(",", ":"))
    print(f"ok: {len(wx)} pts, {len(alerts)} alerts, {len(events)} events, {len(cams)} cams, {len(rwis)} rwis, {len(fac)} facilities, errors={len(errors)} in {data['build_seconds']}s")
if __name__ == "__main__": main()
