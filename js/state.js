export let rawData = [];
export const slsLookupMap = new Map();
export const uploadedTaggingMap = new Map();

export const googleBuildingsCache = new Map();
export let isDownloadingGoogle = false;
export function setIsDownloadingGoogle(val) { isDownloadingGoogle = val; }

export let cachedDbPoints = [];
export function setCachedDbPoints(val) { cachedDbPoints = val; }

export let lastFetchFilterKey = "";
export function setLastFetchFilterKey(val) { lastFetchFilterKey = val; }

export function setRawData(data) {
  rawData = data;
  slsLookupMap.clear();
  rawData.forEach(item => slsLookupMap.set(item.kd_sls, item));
}