// Double-encoding cancels expo-router's two decodeURIComponent passes so ids survive the DB lookup byte-for-byte.
export const encodeNavParam = (id) => encodeURIComponent(encodeURIComponent(String(id ?? '')));

export const decodeNavParam = (param) => String(param ?? '');
