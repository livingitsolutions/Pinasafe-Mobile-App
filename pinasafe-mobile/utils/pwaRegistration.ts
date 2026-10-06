export const SERVICE_WORKER_URL = '/sw.js';

type ServiceWorkerHost = {
  location?: { protocol?: string; hostname?: string };
  navigator?: { serviceWorker?: { register: (url: string, options?: { scope?: string }) => Promise<unknown> } };
};

export function canRegisterServiceWorker(host: ServiceWorkerHost | undefined, isProduction: boolean): boolean {
  if (!isProduction || !host?.navigator?.serviceWorker) return false;
  const protocol = host.location?.protocol;
  const hostname = host.location?.hostname;
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

// Registration failure must never affect normal web use, so it resolves to false instead of throwing.
export async function registerServiceWorker(host: ServiceWorkerHost | undefined, isProduction: boolean): Promise<boolean> {
  if (!canRegisterServiceWorker(host, isProduction)) return false;
  try {
    await host!.navigator!.serviceWorker!.register(SERVICE_WORKER_URL, { scope: '/' });
    return true;
  } catch {
    return false;
  }
}
