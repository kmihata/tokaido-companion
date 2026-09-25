/**
 * Sunrise and sunset, computed locally.
 *
 * Implemented from the NOAA solar-position equations rather than pulled from a
 * dependency, for one reason: "how much daylight is left" has to work in a
 * valley with no signal, and it must not depend on a network call or on a
 * package that might drop out of the offline precache.
 *
 * Accuracy is roughly +/- 1 minute at these latitudes. That is far tighter
 * than the uncertainty in any distance or pace this app is fed, but it is
 * still an astronomical sunset: it ignores terrain. In a mountain valley the
 * light goes long before the computed time. Treat it as an outer bound.
 *
 * Pure. Unit-tested in tests/unit/daylight.test.ts.
 */

const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

/** Julian day number at 00:00 UTC for a Gregorian calendar date. */
export function julianDayUTC(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

interface SolarTerms {
  /** Equation of time, minutes. */
  eqTimeMin: number;
  /** Solar declination, degrees. */
  declinationDeg: number;
}

function solarTerms(julianCentury: number): SolarTerms {
  const t = julianCentury;
  const geomMeanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const geomMeanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const eqOfCentre =
    Math.sin(toRad(geomMeanAnom)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(toRad(2 * geomMeanAnom)) * (0.019993 - 0.000101 * t) +
    Math.sin(toRad(3 * geomMeanAnom)) * 0.000289;
  const trueLong = geomMeanLong + eqOfCentre;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(toRad(125.04 - 1934.136 * t));
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(toRad(125.04 - 1934.136 * t));
  const declinationDeg = toDeg(
    Math.asin(Math.sin(toRad(obliqCorr)) * Math.sin(toRad(appLong))),
  );
  const varY = Math.tan(toRad(obliqCorr / 2)) ** 2;
  const eqTimeMin =
    4 *
    toDeg(
      varY * Math.sin(2 * toRad(geomMeanLong)) -
        2 * eccent * Math.sin(toRad(geomMeanAnom)) +
        4 * eccent * varY * Math.sin(toRad(geomMeanAnom)) * Math.cos(2 * toRad(geomMeanLong)) -
        0.5 * varY * varY * Math.sin(4 * toRad(geomMeanLong)) -
        1.25 * eccent * eccent * Math.sin(2 * toRad(geomMeanAnom)),
    );
  return { eqTimeMin, declinationDeg };
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Minutes between sunrise and sunset; null if the sun does not rise or set. */
  dayLengthMinutes: number | null;
}

/** Standard sunrise/sunset zenith: 90.833 deg, including refraction and solar radius. */
const ZENITH_SUNRISE = 90.833;
/** Civil twilight zenith. Useful light usually ends somewhere before this. */
export const ZENITH_CIVIL = 96;

/**
 * Sunrise, sunset and solar noon for a given UTC calendar date and location.
 *
 * `year`/`month`/`day` are the UTC calendar date. For Japan (UTC+9) the UTC
 * date and the local date coincide for every daylight hour, so passing the
 * local date is correct there. Elsewhere, take care.
 */
export function sunTimesUTC(
  year: number,
  month: number,
  day: number,
  latDeg: number,
  lonDeg: number,
  zenithDeg: number = ZENITH_SUNRISE,
): SunTimes {
  const jd = julianDayUTC(year, month, day);
  const t = (jd - 2451545) / 36525;
  const { eqTimeMin, declinationDeg } = solarTerms(t);

  const solarNoonMin = 720 - 4 * lonDeg - eqTimeMin;
  const atUTC = (minutes: number): Date =>
    new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + minutes * 60_000);

  const cosH =
    Math.cos(toRad(zenithDeg)) / (Math.cos(toRad(latDeg)) * Math.cos(toRad(declinationDeg))) -
    Math.tan(toRad(latDeg)) * Math.tan(toRad(declinationDeg));

  if (cosH > 1 || cosH < -1) {
    // Polar day or polar night. Not a Tokaido problem, but do not return a lie.
    return { sunrise: null, sunset: null, solarNoon: atUTC(solarNoonMin), dayLengthMinutes: null };
  }

  const haMin = 4 * toDeg(Math.acos(cosH));
  return {
    sunrise: atUTC(solarNoonMin - haMin),
    sunset: atUTC(solarNoonMin + haMin),
    solarNoon: atUTC(solarNoonMin),
    dayLengthMinutes: 2 * haMin,
  };
}

/** Convenience wrapper taking an ISO date string, "YYYY-MM-DD". */
export function sunTimesForIsoDate(
  isoDate: string,
  latDeg: number,
  lonDeg: number,
  zenithDeg: number = ZENITH_SUNRISE,
): SunTimes | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  return sunTimesUTC(Number(m[1]), Number(m[2]), Number(m[3]), latDeg, lonDeg, zenithDeg);
}
