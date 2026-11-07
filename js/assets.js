const imageUrl=name=>new URL(`../assets/images/${name}`,import.meta.url).href;

export const ASSETS=Object.freeze({
  brandLogo:imageUrl('loy-krathong-2026.png'),
  aboutMascot:imageUrl('learncraft-mascot.png'),
  deviceNoticeMascot:imageUrl('apologetic-tactical-penguin-bowing.png'),
  learncraftMascot:imageUrl('learncraft-mascot.png'),
  goLiveStatus:Object.freeze({
    running:imageUrl('golive-running.svg'),
    complete:imageUrl('golive-complete.svg'),
    attention:imageUrl('golive-attention.svg'),
  }),
});

const extensionAssetSources=Object.freeze({
  'assets/images/loy-krathong-2026.png':ASSETS.brandLogo,
});

export const extensionAssetUrl=path=>extensionAssetSources[path]||null;
