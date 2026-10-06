import React, { useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import type { RoutePoint } from '@/services/apiService';
import { fitMapView, mapTiles, projectPoint } from '@/utils/responseRoute';
import { colors, radius, space, type } from '@/theme/tokens';

interface RouteMapProps {
  team: RoutePoint | null;
  destination: RoutePoint | null;
  route: RoutePoint[];
  stale?: boolean;
  teamLabel: string;
  destinationLabel: string;
}

const HEIGHT = 220;

/** Draws only the points it is given; it never invents a missing marker. */
export default function RouteMap({ team, destination, route, stale = false, teamLabel, destinationLabel }: RouteMapProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

  const frame = useMemo(() => {
    const points = [...route, ...(team ? [team] : []), ...(destination ? [destination] : [])];
    const view = fitMapView(points, width, HEIGHT);
    if (!view) return null;
    return {
      tiles: mapTiles(view, width, HEIGHT),
      line: route.map(point => projectPoint(point, view)).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      team: team ? projectPoint(team, view) : null,
      destination: destination ? projectPoint(destination, view) : null,
    };
  }, [route, team, destination, width]);

  const teamColor = stale ? colors.warning : colors.info;
  return <View style={styles.wrap}>
    <View style={styles.map} onLayout={onLayout} accessibilityLabel="Map of the response route">
      {frame ? <>
        {frame.tiles.map(tile => <Image key={tile.key} source={{ uri: tile.url }} style={[styles.tile, { left: tile.left, top: tile.top }]} />)}
        <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill}>
          {frame.line ? <Polyline points={frame.line} fill="none" stroke={colors.white} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {frame.line ? <Polyline points={frame.line} fill="none" stroke={teamColor} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={stale ? '8,6' : undefined} /> : null}
          {frame.destination ? <Circle cx={frame.destination.x} cy={frame.destination.y} r={9} fill={colors.critical} stroke={colors.white} strokeWidth={3} /> : null}
          {frame.team ? <Circle cx={frame.team.x} cy={frame.team.y} r={14} fill={teamColor} opacity={0.25} /> : null}
          {frame.team ? <Circle cx={frame.team.x} cy={frame.team.y} r={8} fill={teamColor} stroke={colors.white} strokeWidth={3} /> : null}
        </Svg>
      </> : null}
      <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
    </View>
    <View style={styles.legend}>
      {team ? <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: teamColor }]} /><Text style={styles.legendText}>{teamLabel}</Text></View> : null}
      {destination ? <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.critical }]} /><Text style={styles.legendText}>{destinationLabel}</Text></View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  map: { height: HEIGHT, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  tile: { position: 'absolute', width: 256, height: 256 },
  attribution: { position: 'absolute', right: 0, bottom: 0, paddingHorizontal: space.xs, backgroundColor: 'rgba(255,255,255,0.8)', fontSize: 10, color: colors.ink },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  legendText: { ...type.caption, color: colors.muted },
});
