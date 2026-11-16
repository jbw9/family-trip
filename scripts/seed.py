"""Turn the original itinerary spreadsheet into supabase/seed.sql.

    python3 -I scripts/seed.py "path/to/US & JPN TRIP ITINERARY .xlsx" > supabase/seed.sql

The places list comes straight from the spreadsheet's Sheet2. The day plan, hotels and flights
were written out by hand from the Schedule sheet, because its cells mix several things in one.
Running seed.sql wipes the trip tables first, so only run it before the family starts editing.
"""
import sys
import uuid
import zipfile
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = uuid.UUID("6f1c1b8e-6a43-4c3e-9a57-0f1e5b6a7c01")


def pid(name):
    return str(uuid.uuid5(ROOT, name))


def maps(query):
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(query)


def sql(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, rows):
    cols = list(rows[0].keys())
    out = [f"insert into public.{table} ({', '.join(cols)}) values"]
    out.append(",\n".join("  (" + ", ".join(sql(r[c]) for c in cols) + ")" for r in rows) + ";")
    return "\n".join(out)


def read_places(path):
    z = zipfile.ZipFile(path)
    strings = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"]))
               for si in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    # Sheet2 is the third sheet file in this workbook (Schedule, Sheet3, Sheet2).
    sheet = ET.fromstring(z.read("xl/worksheets/sheet3.xml"))
    rows = {}
    for c in sheet.iter("{%s}c" % NS["m"]):
        v = c.find("m:v", NS)
        if v is None:
            continue
        val = strings[int(v.text)] if c.get("t") == "s" else v.text
        ref = c.get("r")
        col, row = ref[0], int(ref[1:])
        rows.setdefault(row, {})[col] = val.strip()
    return [rows[r] for r in sorted(rows) if r > 1 and rows[r].get("C")]


# Spreadsheet rows (by place name) the family marked with a star or heart in their notes.
FAVOURITES = {
    "Tsujihan (Nihonbashi)", "Gyukatsu Motomura (Shibuya)", "Katsudon-ya Zuicho", "Udon Shin",
    "Menchirashi", "Ginza Sand (listed as Ginza Stand)", "Pizza Strada", "The Matcha Tokyo (Omotesando)",
    "Bongen Coffee Ginza (matcha espresso)", "Le Café Ami", "Camelback (egg sando, castella)",
    "Kith Treats Tokyo", "Cremia", "Ginza Tsuboyaki-imo", "I'm donut? (Shibuya)",
}
UNKNOWN = {"NOT FOUND", "Unclear", "Chain, many branches", "Various"}


def places(path):
    out = []
    for r in read_places(path):
        name, city = r["C"], r.get("A", "")
        area = r.get("D", "")
        addr = r.get("E", "")
        if addr in UNKNOWN:
            addr = ""
        if area in UNKNOWN:
            area = ""
        out.append(dict(
            id=pid("place:" + name), name=name, city=city, category=r.get("B", ""), area=area,
            address=addr, maps_url=maps(f"{name}, {addr}" if addr else f"{name} {city}"),
            notes=r.get("F", ""), starred=name in FAVOURITES,
        ))
    return out


KEIHAN = ("Hotel Keihan Tsukiji Ginza Grande", "3 Chome-5-4 Tsukiji, Chuo City, Tokyo 104-0045",
          "https://www.google.com/maps/place/Hotel+Keihan+Tsukiji+Ginza+Grande/@35.6684358,139.7740277,17z")
RICHMOND = ("Richmond Hotel Premier Kyoto Shijō", "",
            maps("Richmond Hotel Premier Kyoto Shijo"))
STAYS = [
    ("I Hotel & Illinois Conference Center", "2026-12-17", "2026-12-20", "1900 S 1st St, Champaign, IL 61820",
     "https://www.google.com/maps/place/I+Hotel+and+Illinois+Conference+Center/data=!4m2!3m1!1s0x880cd728e3feb9c9:0x23d1b0ed6de4e24e", ""),
    ("InterContinental Chicago Magnificent Mile", "2026-12-20", "2026-12-24", "505 N Michigan Ave, Chicago, IL 60611",
     "https://www.google.com/maps/place/intercontinental+chicago+magnificent+mile+an+ihg+hotel/data=!4m2!3m1!1s0x880e2cac0e1257b9:0x828ce9c1f3602ee3", ""),
    (KEIHAN[0], "2026-12-25", "2026-12-28", KEIHAN[1], KEIHAN[2], ""),
    (RICHMOND[0], "2026-12-28", "2026-12-29", RICHMOND[1], RICHMOND[2], ""),
    ("FUFU Kyoto", "2026-12-29", "2026-12-30", "",
     "https://www.google.com/maps/place/fufu+kyoto/data=!4m2!3m1!1s0x60010988ac4ed839:0xb6a7a167328a79c1", "Ryokan, dinner included"),
    (RICHMOND[0], "2026-12-30", "2026-12-31", RICHMOND[1], RICHMOND[2], ""),
    (KEIHAN[0], "2026-12-31", "2027-01-02", KEIHAN[1], KEIHAN[2], "Leave for the airport on the evening of 1 Jan (flight 00:15)"),
]

DAYS = [
    ("2026-12-17", "Chicago", "Fly in, then on to Champaign", ""),
    ("2026-12-18", "Champaign (UIUC)", "UIUC", ""),
    ("2026-12-19", "Champaign (UIUC)", "Joey's graduation", ""),
    ("2026-12-20", "Chicago", "Chicago", ""),
    ("2026-12-21", "Chicago", "Chicago", ""),
    ("2026-12-22", "Chicago", "Chicago", ""),
    ("2026-12-23", "Chicago", "Chicago", ""),
    ("2026-12-24", "Chicago → Tokyo", "Fly to Tokyo", ""),
    ("2026-12-25", "Tokyo", "Land in Tokyo 21:10", ""),
    ("2026-12-26", "Tokyo", "Tsukiji & Ginza", ""),
    ("2026-12-27", "Tokyo", "Harajuku → Shibuya → Shinjuku", ""),
    ("2026-12-28", "Tokyo → Kyoto", "Asakusa, then Shinkansen to Kyoto", ""),
    ("2026-12-29", "Kyoto", "Ryokan night at FUFU", ""),
    ("2026-12-30", "Kyoto", "Biwako Valley ski day", ""),
    ("2026-12-31", "Kyoto → Tokyo", "teamLab, Shinkansen, New Year's Eve dinner", ""),
    ("2027-01-01", "Tokyo", "New Year's Day", "Flight home leaves 00:15 tonight, so head to the airport this evening."),
    ("2027-01-02", "Tokyo → Jakarta", "Fly home", ""),
]

GINZA = """Shops
• GINZA SIX ⭐️ (10:30–20:30)
• MUJI flagship
• KINDAL & CASANOVA VINTAGE (Chanel, LV)
• UNIQLO flagship (11–21), GU
• Dover Street Market (11–20)
• Onitsuka Tiger (11–20)
• KOMEHYO, second-hand luxury (11–20)
Food
• Sando
• Kyushu Jangara Ramen ⭐️
• Manneken waffle
• Go Go Curry"""

TSUKIJI = """Best 8–11am. Food to try:
• Wagyu & uni skewers
• Tuna / toro sushi and sashimi
• Solatsuki strawberry daifuku
• Yamacho tamago skewer
• Matcha stand Maruni
• Uni bowl at Tsukiji Itadori Unitora"""

HARAJUKU = """• I'm donut? (10–20)
• Cas Space: phone cases, charms
• @cosme Tokyo (11–21)
• Kiddy Land
• Tokyu Plaza Harakado (11–21)"""

OMOTESANDO = """• Menchirashi (carbonara udon), The Little Bakery Tokyo
• Vintage: AMORE, QOO, Ragtag
• Omotesando Hills (11–20)
• LOVE & TABLE: crepe cake afternoon tea
• SAMA Curry, soup curry (11–21, closed 15–17)"""

SHIBUYA = """• Shibuya Crossing
• Sakura Street, Yoyogi Park
• ON, Don Quijote, @cosme, Matsumoto Kiyoshi, GU, Daiso, ABC Mart
  Buy: pimple patches, mascara, mascara primer
• QOO Vintage
• Shibuya PARCO: Nintendo, Pokémon Center, Jump Shop (11–21)"""

SHINJUKU = """• Shinjuku Gyoen
• Disney Flagship Store (10–21)
• LUMINE 1, 2 & EST
• BEAMS (11–20)
• Isetan (10–20)
• Kinokuniya main store (10:30–21)
• Kabukicho, Golden Gai, Godzilla head
• ME TOKYO SHINJUKU arcade"""

ASAKUSA = """• Sensō-ji Temple
• Kimono rental nearby (~¥6,700 pp, all day)
• Mameshiba café (Shiba Inu)
Snacks
• Katsudo: ice cream melon bread (¥650)
• Asakusa Menchi: croquette (¥350)
• Suzukien: matcha ice cream by intensity"""


def item(date, title, kind="sight", time="", notes="", query=None, place=None, **booking):
    d = dict(id=pid(f"item:{date}:{title}"), date=date, time=time, kind=kind, title=title,
             place_id=pid("place:" + place) if place else None, address="",
             maps_url=maps(query) if query else "", notes=notes,
             booking_status="none", booking_time="", party="", confirmation="", booking_url="", done=False, sort=0)
    d.update(booking)
    return d


ITEMS = [
    item("2026-12-17", "NH 836 · Jakarta → Tokyo", "flight", "06:20", "Lands Tokyo 15:40"),
    item("2026-12-17", "NH 12 · Tokyo → Chicago", "flight", "17:05", "Lands Chicago 13:50 (same day)"),
    item("2026-12-19", "Joey's graduation", "sight"),
    item("2026-12-24", "NH 111 · Chicago → Tokyo", "flight", "16:25", "Lands Tokyo 21:10 on 25 Dec"),
    item("2026-12-25", "Land in Tokyo", "flight", "21:10", "NH 111. Then to Hotel Keihan Tsukiji Ginza Grande"),
    item("2026-12-26", "Tsukiji Outer Market", "food", "08:00", TSUKIJI, "Tsukiji Outer Market, Tokyo"),
    item("2026-12-26", "Atelier Matcha", "food", "11:00", "13 min walk from Tsukiji", place="Atelier Matcha"),
    item("2026-12-26", "Ginza", "shop", "12:00", GINZA, "Ginza Six, Tokyo"),
    item("2026-12-26", "Azabudai Hills", "sight", "", "", "Azabudai Hills, Tokyo"),
    item("2026-12-26", "Aoyama (maybe)", "sight", "", "", "Aoyama, Tokyo"),
    item("2026-12-27", "Harajuku", "shop", "10:00", HARAJUKU, "Takeshita Street, Harajuku, Tokyo"),
    item("2026-12-27", "Omotesando", "shop", "", OMOTESANDO, "Omotesando Hills, Tokyo"),
    item("2026-12-27", "Aoyama", "sight", "", "", "Aoyama, Tokyo"),
    item("2026-12-27", "Shibuya", "shop", "", SHIBUYA, "Shibuya Crossing, Tokyo"),
    item("2026-12-27", "Shinjuku", "shop", "", SHINJUKU, "Shinjuku Station, Tokyo"),
    item("2026-12-27", "Omakase · Sushi Kakida Shinjuku Main Store", "food", "", "",
         "Sushi Kakida Shinjuku Main Store, Tokyo", booking_status="booked"),
    item("2026-12-28", "Asakusa", "sight", "09:00", ASAKUSA, "Senso-ji, Asakusa, Tokyo"),
    item("2026-12-28", "Shinkansen Tokyo → Kyoto", "train", "", "Evening train", "Tokyo Station", booking_status="needed"),
    item("2026-12-29", "Dinner at the ryokan", "food", "", "FUFU Kyoto", "FUFU Kyoto", booking_status="booked"),
    item("2026-12-30", "Biwako Valley ski", "sight", "", "About 1 hour's drive from Kyoto", "Biwako Valley, Otsu, Shiga"),
    item("2026-12-31", "teamLab Kyoto", "sight", "", "", "teamLab Biovortex Kyoto", booking_status="needed"),
    item("2026-12-31", "Shinkansen Kyoto → Tokyo", "train", "", "Afternoon train", "Kyoto Station", booking_status="needed"),
    item("2026-12-31", "New Year's Eve dinner · The Peninsula", "food", "20:00", "", "The Peninsula Tokyo",
         booking_status="booked", booking_time="20:00"),
    item("2027-01-02", "NH 871 · Tokyo → Jakarta", "flight", "00:15", "Lands Jakarta 06:00"),
]


def main():
    pl = places(sys.argv[1])
    for i, it in enumerate(ITEMS):
        it["sort"] = i
    stays = [dict(name=n, check_in=a, check_out=b, address=ad, maps_url=u, confirmation="", notes=no)
             for n, a, b, ad, u, no in STAYS]
    days = [dict(date=d, city=c, title=t, notes=n) for d, c, t, n in DAYS]
    print("-- Generated by scripts/seed.py. Wipes the trip tables, then loads the spreadsheet.")
    print("truncate public.trip_items, public.trip_places, public.trip_stays, public.trip_days;")
    for table, rows in [("trip_days", days), ("trip_stays", stays), ("trip_places", pl), ("trip_items", ITEMS)]:
        print(insert(table, rows))


main()
