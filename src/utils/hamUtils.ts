export const COMMON_ADIF_FIELDS = [
  "CALL", "QSO_DATE", "TIME_ON", "TIME_OFF", "BAND", "FREQ", "MODE", "SUBMODE",
  "RST_SENT", "RST_RCVD", "GRIDSQUARE", "MY_GRIDSQUARE", "STATION_CALLSIGN",
  "OPERATOR", "MY_CITY", "MY_STATE", "MY_CNTY", "MY_COUNTRY", "MY_CQ_ZONE",
  "MY_ITU_ZONE", "MY_SIG", "MY_SIG_INFO", "SIG", "SIG_INFO", "POTA_REF",
  "MY_POTA_REF", "SOTA_REF", "MY_SOTA_REF", "WWFF_REF", "TX_PWR", "NAME",
  "QTH", "STATE", "CNTY", "COUNTRY", "DXCC", "CQZ", "ITUZ", "COMMENT",
  "QSL_SENT", "QSL_RCVD", "LOTW_QSL_SENT", "LOTW_QSL_RCVD", "EQSL_QSL_SENT"
];

export function freqToBand(freqMhzStr: string): string | null {
  const f = parseFloat(freqMhzStr);
  if (isNaN(f)) return null;
  if (f >= 0.1357 && f <= 0.1378) return "2200m";
  if (f >= 0.472 && f <= 0.479) return "630m";
  if (f >= 1.8 && f <= 2.0) return "160m";
  if (f >= 3.5 && f <= 4.0) return "80m";
  if (f >= 5.06 && f <= 5.45) return "60m";
  if (f >= 7.0 && f <= 7.3) return "40m";
  if (f >= 10.1 && f <= 10.15) return "30m";
  if (f >= 14.0 && f <= 14.35) return "20m";
  if (f >= 18.068 && f <= 18.168) return "17m";
  if (f >= 21.0 && f <= 21.45) return "15m";
  if (f >= 24.89 && f <= 24.99) return "12m";
  if (f >= 28.0 && f <= 29.7) return "10m";
  if (f >= 50.0 && f <= 54.0) return "6m";
  if (f >= 70.0 && f <= 70.5) return "4m";
  if (f >= 144.0 && f <= 148.0) return "2m";
  if (f >= 219.0 && f <= 225.0) return "1.25m";
  if (f >= 420.0 && f <= 450.0) return "70cm";
  if (f >= 902.0 && f <= 928.0) return "33cm";
  if (f >= 1240.0 && f <= 1300.0) return "23cm";
  return null;
}
