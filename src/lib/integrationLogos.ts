import IconOzon from "../assets/integrationicon/imgi_27_ozonexpress.jpg";
import IconAmeex from "../assets/integrationicon/imgi_28_ameex.jpg";
import IconLivo from "../assets/integrationicon/imgi_30_livo.png";
import IconDigylog from "../assets/integrationicon/imgi_31_digylog.jpg";
import IconYouCan from "../assets/integrationicon/imgi_32_youcan.png";
import IconGoogleSheet from "../assets/integrationicon/imgi_33_google sheet.png";
import IconColiaty from "../assets/integrationicon/imgi_34_coliaty.jpg";
import IconMeta from "../assets/integrationicon/imgi_35_meta.jpg";
import IconForceLog from "../assets/integrationicon/imgi_36_forcelog.jpg";

export const integrationLogos = {
  ozon: IconOzon,
  ameex: IconAmeex,
  youcan: IconYouCan,
  google: IconGoogleSheet,
  coliaty: IconColiaty,
  meta: IconMeta,
  forcelog: IconForceLog,
  livo: IconLivo,
  digylog: IconDigylog,
  shopify: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Shopify_Logo.png",
} as const;

export type IntegrationLogoKey = keyof typeof integrationLogos;

export function getIntegrationLogo(key: string): string | undefined {
  return integrationLogos[key as IntegrationLogoKey];
}
