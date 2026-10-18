/** Which commit is deployed — for QA (/version and the footer). */
export const BUILD_SHA: string = typeof __BUILD_SHA__ === "string" ? __BUILD_SHA__ : "dev";
export const BUILD_TIME: string = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";
export const BUILD_REF: string = typeof __BUILD_REF__ === "string" ? __BUILD_REF__ : "";
export const shortSha = (sha: string) => (/^[0-9a-f]{7,}$/i.test(sha) ? sha.slice(0, 7) : sha);
