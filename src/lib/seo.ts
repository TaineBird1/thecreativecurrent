import { useEffect } from "react";

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

type SEOOptions = {
  title: string;
  description: string;
  noindex?: boolean;
};

export function useSEO({ title, description, noindex = false }: SEOOptions) {
  useEffect(() => {
    document.title = title;
    setMetaTag("name", "description", description);
    setMetaTag("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    setMetaTag("property", "og:title", title);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:url", window.location.href);
    setCanonical(`${window.location.origin}${window.location.pathname}`);
  }, [title, description, noindex]);
}
