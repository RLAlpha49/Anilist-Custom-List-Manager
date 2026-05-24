import type { MetadataRoute } from "next";

const getBaseUrl = (): string => {
  const fromPublicEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromPublicEnv) {
    return fromPublicEnv.replace(/\/$/, "");
  }

  const vercelProdDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProdDomain) {
    return `https://${vercelProdDomain.replace(/\/$/, "")}`;
  }

  const vercelPreviewDomain = process.env.VERCEL_URL;
  if (vercelPreviewDomain) {
    return `https://${vercelPreviewDomain.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
};

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const lastModified = new Date();

  return [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
