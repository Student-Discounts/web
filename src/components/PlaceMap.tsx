import { useEffect, useRef, useState } from 'react';
import { MapPinOff } from 'lucide-react';
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useNavigate } from 'react-router-dom';
import { getPlace } from '@/api/catalog';
import { ApiError } from '@/api/http';
import type { SearchPlace } from '@/api/search';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useRead } from '@/lib/requests';

setWorkerUrl(workerUrl);

const customUrl: string | undefined = import.meta.env.VITE_MAP_TILE_URL?.trim();
const customAttribution: string | undefined = import.meta.env.VITE_MAP_TILE_ATTRIBUTION?.trim();
const customTiles = customUrl && customAttribution ? { url: customUrl, attribution: customAttribution } : null;
const tileUrl = customTiles?.url ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

type MapPoint = { placeId: string; name: string; coordinates: [number, number] };

async function loadPoints(places: SearchPlace[], signal: AbortSignal) {
  const points = new Array<MapPoint | undefined>(places.length);
  let next = 0;
  let failures = 0;

  async function worker() {
    while (!signal.aborted && next < places.length) {
      const index = next++;
      const { placeId } = places[index];
      try {
        const place = await getPlace(placeId, signal);
        points[index] = { placeId, name: place.name, coordinates: [place.location.lon, place.location.lat] };
      } catch (error) {
        if (signal.aborted) return;
        if (!(error instanceof ApiError && error.status === 404)) failures++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, places.length) }, worker));
  return { points: points.filter((point) => point !== undefined), failures };
}

export default function PlaceMap({ places, returnTo }: { places: SearchPlace[]; returnTo: string }) {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [mapError, setMapError] = useState(false);
  const result = useRead((signal) => loadPoints(places, signal), places.map(({ placeId }) => placeId).join(','));
  const points = result.data?.points;

  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreMap | undefined;
    const onError = () => setMapError(true);
    try {
      instance = new MapLibreMap({
        container: container.current,
        center: [30.3083, 59.9571],
        zoom: 12,
        attributionControl: false,
        scrollZoom: false,
        locale: {
          'Map.Title': 'Карта найденных мест',
          'NavigationControl.ZoomIn': 'Приблизить',
          'NavigationControl.ZoomOut': 'Отдалить',
        },
        style: {
          version: 8,
          sources: { streets: { type: 'raster', tiles: [tileUrl], tileSize: 256, scheme: 'xyz', maxzoom: 19 } },
          layers: [{ id: 'streets', type: 'raster', source: 'streets' }],
        },
      });
      instance.on('error', onError);
      instance.addControl(new NavigationControl({ showCompass: false }));
      map.current = instance;
    } catch {
      instance?.off('error', onError);
      instance?.remove();
      setUnavailable(true);
      return;
    }

    return () => {
      map.current = null;
      instance.off('error', onError);
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !points?.length) return;
    const bounds = new LngLatBounds();
    const cleanups = points.map((point) => {
      const href = `/places/${point.placeId}`;
      const element = document.createElement('a');
      element.href = href;
      element.title = point.name;
      element.className = 'grid size-9 place-items-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-md hover:z-10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-white';
      const name = document.createElement('span');
      name.className = 'sr-only';
      name.textContent = point.name;
      const dot = document.createElement('span');
      dot.className = 'size-2.5 rounded-full bg-current';
      dot.setAttribute('aria-hidden', 'true');
      element.append(name, dot);
      function openPlace(event: MouseEvent) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void navigate(href, { state: { returnTo } });
      }
      element.addEventListener('click', openPlace);
      const marker = new Marker({ element }).setLngLat(point.coordinates).addTo(instance);
      bounds.extend(point.coordinates);
      return () => {
        element.removeEventListener('click', openPlace);
        marker.remove();
      };
    });

    if (points.length === 1) instance.jumpTo({ center: points[0].coordinates, zoom: 15 });
    else instance.fitBounds(bounds, { padding: 48, maxZoom: 15, animate: false });

    return () => { for (const cleanup of cleanups) cleanup(); };
  }, [points, navigate, returnTo]);

  const partial = result.error != null || (result.data?.failures ?? 0) > 0;
  return (
    <div className="min-w-0 space-y-3 lg:sticky lg:top-4">
      <figure aria-label="Карта результатов текущей страницы" className="relative overflow-hidden rounded-xl border bg-muted">
        <div ref={container} className={unavailable ? 'hidden' : 'h-80 w-full sm:h-96 lg:h-[min(65vh,34rem)]'} />
        {unavailable && (
          <div className="grid min-h-36 place-content-center justify-items-center gap-2 px-4 pt-3 pb-10 text-center text-sm text-muted-foreground" role="alert">
            <MapPinOff className="size-6" aria-hidden="true" />
            <p>Не удалось открыть карту. Места доступны в списке.</p>
          </div>
        )}
        <figcaption className="pointer-events-none absolute inset-x-2 bottom-2 z-20 text-right text-xs">
          <span className="pointer-events-auto inline-block max-w-full rounded-md border bg-background px-2 py-1 text-foreground shadow-sm [overflow-wrap:anywhere]">
            {customTiles ? customTiles.attribution : (
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                © OpenStreetMap contributors
              </a>
            )}
          </span>
        </figcaption>
      </figure>
      {!unavailable && mapError && (
        <Alert role="alert"><AlertDescription>Не удалось загрузить фрагменты карты. Вы можете открыть места из списка.</AlertDescription></Alert>
      )}
      {!unavailable && result.loading && <p className="text-sm text-muted-foreground" role="status">Загружаем точки текущей страницы…</p>}
      {!unavailable && partial && (
        <Alert role="alert">
          <AlertDescription>
            <p>Не удалось загрузить все точки. Карточки мест по-прежнему доступны из списка.</p>
            <Button type="button" variant="outline" size="sm" onClick={result.reload}>Повторить загрузку точек</Button>
          </AlertDescription>
        </Alert>
      )}
      {!unavailable && !partial && points?.length === 0 && (
        <p className="text-sm text-muted-foreground" role="status">Для этой страницы нет доступных точек на карте.</p>
      )}
    </div>
  );
}
