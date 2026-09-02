import { guns, type Gun, type Projectile } from './config/guns';
import { defaultMapId, gameMaps, type MapId, type GameMap } from './config/maps';
import {
  calculateAzimuth,
  calculateDistance,
  calculateHighElevation,
  calculateLowElevation,
  calculateTimeOfFlight,
  studsToMeters,
} from './utils/math';

export interface Vector {
  x: number;
  y: number;
}

export type MobileModes = 'gun' | 'target';

class AppState {
  // Canvas State
  canvasWidth = $state(0);
  canvasHeight = $state(0);
  zoom = $state(1); // 1 = fit to screen

  // Data State
  mapId = $state<MapId>(defaultMapId);

  projectile = $state({
    gunKey: Object.keys(guns)[0],
    index: 0,
  });

  // Target coordinates (normalized 0-1)
  target = $state<Vector>({ x: 0.75, y: 0.5 });

  // Gun coordinates (normalized 0-1)
  gun = $state<Vector>({ x: 0.25, y: 0.5 });

  // Heights in studs (from heightmap)
  gunHeight = $state(0);
  targetHeight = $state(0);

  mobileMode = $state<MobileModes>('gun');

  // UI state
  mapModalOpen = $state(false);
  gunModalOpen = $state(false);

  // Derived State
  get currentMap(): GameMap {
    return gameMaps[this.mapId] || gameMaps[defaultMapId];
  }

  get currentGun(): Gun {
    return guns[this.projectile.gunKey] || Object.values(guns)[0];
  }

  get currentProjectile(): Projectile {
    const gun = this.currentGun;
    return gun.projectiles[this.projectile.index] || gun.projectiles[0];
  }

  // Calculation Results
  get distance2DStuds(): number {
    const map = this.currentMap;
    return calculateDistance(
      this.gun.x * map.size,
      this.gun.y * map.size,
      this.target.x * map.size,
      this.target.y * map.size,
      0, 0
    );
  }

  get distance2DMeters(): number {
    return studsToMeters(this.distance2DStuds);
  }

  // 3D Distance for UI display
  get distanceStuds(): number {
    const map = this.currentMap;
    return calculateDistance(
      this.gun.x * map.size,
      this.gun.y * map.size,
      this.target.x * map.size,
      this.target.y * map.size,
      this.gunHeight,
      this.targetHeight,
    );
  }

  get distanceMeters(): number {
    return studsToMeters(this.distanceStuds);
  }

  get azimuth(): number {
    return calculateAzimuth(this.gun.x, this.gun.y, this.target.x, this.target.y);
  }

  get heightDifferenceMeters(): number {
    return studsToMeters(this.targetHeight - this.gunHeight);
  }

  get elevation(): [number | null, number | null] {
    // CRITICAL FIX: The trajectory equations (calculateLowElevation/calculateHighElevation) 
    // EXPECT HORIZONTAL 2D DISTANCE 'd'. The height difference is passed as 'h'.
    // Passing the 3D distance causes huge overshooting.
    const d = this.distance2DMeters; 
    const v = this.currentProjectile.velocity;
    const h = this.heightDifferenceMeters;

    const low = calculateLowElevation(d, v, h);
    const high = calculateHighElevation(d, v, h);

    return [
      Number.isFinite(low) && !Number.isNaN(low) ? low : null,
      Number.isFinite(high) && !Number.isNaN(high) ? high : null,
    ];
  }

  get timeOfFlight(): [number | null, number | null] {
    const [low, high] = this.elevation;
    // Time of flight formula t = d / (v * cos(elev)) ALSO expects horizontal distance
    const d = this.distance2DMeters;
    const v = this.currentProjectile.velocity;

    const lowTof = low !== null ? calculateTimeOfFlight(low, v, d) : null;
    const highTof = high !== null ? calculateTimeOfFlight(high, v, d) : null;

    return [
      lowTof !== null && Number.isFinite(lowTof) && !Number.isNaN(lowTof) ? Math.max(0, lowTof) : null,
      highTof !== null && Number.isFinite(highTof) && !Number.isNaN(highTof) ? Math.max(0, highTof) : null,
    ];
  }

  // Actions
  setCanvasDimensions(width: number, height: number) {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  setZoom(newZoom: number) {
    this.zoom = Math.max(0.2, Math.min(newZoom, 25));
  }

  setMap(id: MapId) {
    this.mapId = id;
  }

  setProjectile(gunKey: string, index: number) {
    this.projectile = { gunKey, index };
  }

  setTarget(x: number, y: number) {
    this.target = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  setGun(x: number, y: number) {
    this.gun = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  setHeights(gunH: number, targetH: number) {
    this.gunHeight = gunH;
    this.targetHeight = targetH;
  }

  setMobileMode(mode: MobileModes) {
    this.mobileMode = mode;
  }
}

// Global singleton instance
export const appState = new AppState();
