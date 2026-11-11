import {
  cmsBlockFor as findCmsBlock,
  cmsMenuFor as findCmsMenu,
  cmsPageFor as findCmsPage,
} from '../../../utils/cmsUtils';
import type { Screen } from '../../../types';
import { CMS_BLOCKS, CMS_MENUS, CMS_PAGES } from '../cmsSnapshot';

// Ekran metinleri ve menüler derleme anında sabittir; ağdan veya realtime
// kanalından arayüz değişikliği alınmaz.
const cmsRuntimeCss = `
  :root{
    --tp-cms-radius:18px;
    --tp-cms-gap:16px;
    --tp-cms-max:1440px;
    --tp-cms-sidebar:260px;
    --tp-cms-bottom:72px;
    --tp-cms-font-scale:1;
  }
  .content,.tp-content,.tp-placeholder-main,.tp-admin-main{max-width:var(--tp-cms-max);}
  .tp-desktop-sidebar{width:var(--tp-cms-sidebar)!important;}
  .bottomNav{min-height:var(--tp-cms-bottom)!important;}
  .tp-home-panel,.tp-placeholder-cards article,.fieldCard,.card,.weatherCard{border-radius:var(--tp-cms-radius)!important;}
  .tp-home-dashboard,.tp-placeholder-cards{gap:var(--tp-cms-gap)!important;}
  .app,.tp-desktop-shell{font-size:calc(1em * var(--tp-cms-font-scale));}
`;

const cms = {
  cmsPages: CMS_PAGES,
  cmsBlocks: CMS_BLOCKS,
  cmsMenus: CMS_MENUS,
  cmsRuntimeCss,
  cmsPageFor: (pageKey: string) => findCmsPage(CMS_PAGES, pageKey),
  cmsBlockFor: (pageKey: string, blockKey: string) => findCmsBlock(CMS_BLOCKS, pageKey, blockKey),
  cmsMenuFor: (menuKey: string) => findCmsMenu(CMS_MENUS, menuKey),
};

// `screen` parametresi çağıran tarafla uyum için korunuyor.
export function useAppCms(_screen: Screen) {
  return cms;
}
