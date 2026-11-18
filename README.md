# Épület-LCA

Épület életciklus-elemző (LCA) program az ÖKOBAUDAT 2024-II adatbázissal: anyaglista, élettartam- és szállításszámítás, üzemeltetés, elemzések, A–G besorolás, letölthető szakvélemény.

**Webes változat:** https://domos2002.github.io/epulet-lca/
**Windows-program:** a [Releases](../../releases/latest) oldalon az `Epulet-LCA-Setup-….exe`

## Felépítés

| Mappa | Tartalom |
|---|---|
| `web/` | A program (egyetlen `index.html`, benne az ÖKOBAUDAT-adatokkal). Ezt teszi közzé a GitHub Pages. |
| `desktop/` | Az asztali program (Electron). A `web/` közzétett változatát nyitja meg saját ablakban. |
| `src/platform.js` | Belépés, felhős mentés (Supabase), letöltés, MI-kulcs, frissítésfigyelés. |
| `supabase/schema.sql` | Az adatbázis-tábla és a jogosultságok (mindenki csak a saját adatait látja). |

## Hogyan frissül?

- **A program tartalma:** minden feltöltés után a GitHub Actions közzéteszi a `web/` mappát. Az asztali program minden indításkor ezt tölti be, futás közben pedig értesít, ha új változat jelent meg. Újratelepítés nem kell.
- **Maga az .exe:** csak ritkán változik. Új kiadás a `desktop-v1.0.1` formájú címkével készül; a telepített program ezt magától letölti és újraindításkor telepíti.

## Adatok

A projektek, a saját anyagok és az épületképek a Supabase-adatbázis `docs` táblájában vannak, felhasználónként elkülönítve (Row Level Security). Belépés e-mail-címmel és jelszóval; ugyanazzal a fiókkal minden eszközön ugyanazok a projektek látszanak.
