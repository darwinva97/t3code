export * from "@t3tools/shared/advertisedEndpoint";

/**
 * Server paths are absolute; a base URL served under a prefix
 * (`https://host/env/`) keeps it: `/api/x` → `https://host/env/api/x`.
 */
export const environmentEndpointPath = (httpBaseUrl: string, pathname: string): string =>
  `${new URL(httpBaseUrl).pathname.replace(/\/+$/, "")}${pathname}`;

export const environmentEndpointUrl = (httpBaseUrl: string, pathname: string): string => {
  const url = new URL(httpBaseUrl);
  url.pathname = environmentEndpointPath(httpBaseUrl, pathname);
  url.search = "";
  url.hash = "";
  return url.toString();
};
