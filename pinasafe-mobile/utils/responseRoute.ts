import type { CitizenResponseTracking, RoutePoint, TrackedPosition } from '@/services/apiService';
import { getLocationFreshness } from '@/utils/liveTracking';

export const NAVIGATION_POLL_MS = 10000;
export const ROUTE_STATUS_UNAVAILABLE = 'Route unavailable';
export const ETA_UNAVAILABLE = 'ETA unavailable';

const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 17;
const MAX_LATITUDE = 85;

export function isRoutePoint(value: unknown): value is RoutePoint {
  if (!value || typeof value !== 'object') return false;
  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

/** Formats a provider travel duration; returns null when there is no real value. */
export function formatEta(durationSeconds: number | null | undefined): string | null {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `~${minutes} min`;
  const rest = minutes % 60;
  return `~${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`;
}

export function formatDistance(distanceMeters: number | null | undefined): string | null {
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  if (distanceMeters < 1000) return `${Math.max(10, Math.round(distanceMeters / 10) * 10)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

/** External turn-by-turn directions to the incident destination. */
export function buildNavigationUrl(destination: unknown, platform: string): string | null {
  if (!isRoutePoint(destination)) return null;
  const target = `${destination.latitude},${destination.longitude}`;
  if (platform === 'ios') return `http://maps.apple.com/?daddr=${target}&dirflag=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${target}&travelmode=driving`;
}

export function toRoutePoints(route: unknown): RoutePoint[] {
  if (!Array.isArray(route)) return [];
  const points = route.map(pair => (Array.isArray(pair) ? { latitude: pair[0], longitude: pair[1] } : null));
  return points.every(isRoutePoint) ? (points as RoutePoint[]) : [];
}

export type CitizenResponseState = 'completed' | 'awaiting_team' | 'assigned' | 'waiting_location' | 'live' | 'stale';

export interface CitizenResponseView {
  state: CitizenResponseState;
  title: string;
  message: string;
  showMap: boolean;
  routeAvailable: boolean;
}

export function describeCitizenResponse(snapshot: CitizenResponseTracking, now: number): CitizenResponseView {
  const routeAvailable = snapshot.route_status === 'available' && formatEta(snapshot.duration_seconds) !== null;
  if (snapshot.response_complete) {
    return { state: 'completed', title: 'Response completed', message: 'This incident has been resolved. Live response tracking has ended.', showMap: false, routeAvailable: false };
  }
  if (!snapshot.tracking_active) {
    return snapshot.response_team_assigned
      ? { state: 'assigned', title: 'Response team assigned', message: 'Live location will appear once the team is on the way.', showMap: false, routeAvailable: false }
      : { state: 'awaiting_team', title: 'Waiting for a response team', message: 'Your report has been received. A team will be assigned shortly.', showMap: false, routeAvailable: false };
  }
  const position: TrackedPosition | null = isRoutePoint(snapshot.responder_location) ? snapshot.responder_location : null;
  if (!position) {
    return { state: 'waiting_location', title: 'Response team assigned', message: 'Waiting for live location...', showMap: false, routeAvailable: false };
  }
  if (getLocationFreshness(position.captured_at, now) !== 'fresh') {
    return { state: 'stale', title: 'Last known response location', message: 'Location update delayed.', showMap: true, routeAvailable };
  }
  return routeAvailable
    ? { state: 'live', title: 'Response Team en route', message: 'Your response team is on the way.', showMap: true, routeAvailable }
    : { state: 'live', title: 'Live response location available', message: 'Route estimate unavailable.', showMap: true, routeAvailable };
}

export interface CitizenTeamView {
  name: string;
  lifecycle: 'Dispatched' | 'Responding' | 'Resolved' | null;
}

export function describeCitizenTeam(snapshot: CitizenResponseTracking): CitizenTeamView | null {
  const name = typeof snapshot.response_team?.name === 'string' ? snapshot.response_team.name.trim() : '';
  if (!name) return null;
  const lifecycle = snapshot.response_complete || snapshot.status === 'resolved' ? 'Resolved'
    : snapshot.status === 'responding' ? 'Responding'
      : snapshot.status === 'dispatched' ? 'Dispatched'
        : null;
  return { name, lifecycle };
}

interface MapView {
  zoom: number;
  originX: number;
  originY: number;
}

export interface MapTile {
  key: string;
  url: string;
  left: number;
  top: number;
}

function toWorld(point: RoutePoint, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, point.latitude));
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Chooses the closest web-mercator zoom that keeps every point inside the frame. */
export function fitMapView(points: RoutePoint[], width: number, height: number, padding = 32): MapView | null {
  if (!points.length || width <= 0 || height <= 0) return null;
  let zoom = MAX_ZOOM;
  for (; zoom > MIN_ZOOM; zoom -= 1) {
    const world = points.map(point => toWorld(point, zoom));
    const spanX = Math.max(...world.map(p => p.x)) - Math.min(...world.map(p => p.x));
    const spanY = Math.max(...world.map(p => p.y)) - Math.min(...world.map(p => p.y));
    if (spanX <= width - padding * 2 && spanY <= height - padding * 2) break;
  }
  const world = points.map(point => toWorld(point, zoom));
  const centerX = (Math.max(...world.map(p => p.x)) + Math.min(...world.map(p => p.x))) / 2;
  const centerY = (Math.max(...world.map(p => p.y)) + Math.min(...world.map(p => p.y))) / 2;
  return { zoom, originX: centerX - width / 2, originY: centerY - height / 2 };
}

export function projectPoint(point: RoutePoint, view: MapView) {
  const world = toWorld(point, view.zoom);
  return { x: world.x - view.originX, y: world.y - view.originY };
}

export function mapTiles(view: MapView, width: number, height: number): MapTile[] {
  const count = 2 ** view.zoom;
  const tiles: MapTile[] = [];
  for (let tx = Math.floor(view.originX / TILE_SIZE); tx <= Math.floor((view.originX + width) / TILE_SIZE); tx += 1) {
    for (let ty = Math.floor(view.originY / TILE_SIZE); ty <= Math.floor((view.originY + height) / TILE_SIZE); ty += 1) {
      if (ty < 0 || ty >= count) continue;
      const wrappedX = ((tx % count) + count) % count;
      tiles.push({
        key: `${view.zoom}/${tx}/${ty}`,
        url: `https://tile.openstreetmap.org/${view.zoom}/${wrappedX}/${ty}.png`,
        left: tx * TILE_SIZE - view.originX,
        top: ty * TILE_SIZE - view.originY,
      });
    }
  }
  return tiles;
}
