type ResolutionSource = {
  status?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
};

function timestampMilliseconds(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function getResolutionDisplayTimestamp(report: ResolutionSource): string | null {
  if (report.status !== 'resolved') return null;
  if (timestampMilliseconds(report.resolved_at) !== null) return report.resolved_at as string;
  return timestampMilliseconds(report.updated_at) !== null ? report.updated_at as string : null;
}

export function getOperationalResolutionDisplayTimestamp(cluster: {
  status: string;
  memberReports: ResolutionSource[];
}): string | null {
  if (cluster.status !== 'resolved' || !cluster.memberReports.length
    || cluster.memberReports.some(member => member.status !== 'resolved')) return null;
  let latest: string | null = null;
  let latestMilliseconds = -Infinity;
  for (const member of cluster.memberReports) {
    const timestamp = getResolutionDisplayTimestamp(member);
    const milliseconds = timestampMilliseconds(timestamp);
    if (milliseconds !== null && milliseconds > latestMilliseconds) {
      latest = timestamp;
      latestMilliseconds = milliseconds;
    }
  }
  return latest;
}

export function formatResponseTime(start: string | null | undefined, end: string | null | undefined): string | null {
  const startMilliseconds = timestampMilliseconds(start);
  const endMilliseconds = timestampMilliseconds(end);
  if (startMilliseconds === null || endMilliseconds === null || endMilliseconds < startMilliseconds) return null;
  const seconds = Math.floor((endMilliseconds - startMilliseconds) / 1000);
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ${Math.floor(seconds / 60) % 60} min`;
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'} ${Math.floor(seconds / 3600) % 24} hr`;
}
