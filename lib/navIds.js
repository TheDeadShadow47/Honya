// Double-encodes ids for expo-router so its two URL-decodes restore arbitrary Unicode ids exactly.
export const encodeNavParam = (id) => encodeURIComponent(encodeURIComponent(String(id ?? '')));

export const decodeNavParam = (param) => String(param ?? '');
