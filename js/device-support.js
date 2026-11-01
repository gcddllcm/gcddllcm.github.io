export function isMobileOrTabletDevice({userAgent = '', platform = '', maxTouchPoints = 0, userAgentData} = {}) {
  if (userAgentData?.mobile === true) return true;
  if (/iPhone|iPad|iPod|Android|Tablet|PlayBook|Silk|Windows Phone/i.test(userAgent)) return true;
  return /MacIntel/i.test(platform) && maxTouchPoints > 1;
}
