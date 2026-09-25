import type { ReactNode } from 'react';
import { useRoute } from './router';
import { AppStateProvider } from './state/AppState';
import { StatusStrip } from './components/StatusStrip';
import { TabBar } from './components/TabBar';
import { Today } from './screens/Today';
import { Decide } from './screens/Decide';
import { MapScreen } from './screens/MapScreen';
import { Capture } from './screens/Capture';
import { More } from './screens/More';
import { Days } from './screens/Days';
import { DayDetail } from './screens/DayDetail';
import { Places } from './screens/Places';
import { RouteScreen } from './screens/RouteScreen';
import { PlanScreen } from './screens/PlanScreen';
import { PrepareScreen } from './screens/PrepareScreen';
import { AddPlaceScreen } from './screens/AddPlaceScreen';
import { ImportRouteScreen } from './screens/ImportRouteScreen';
import { SectionScreen } from './screens/SectionScreen';
import { AdjustAnchorScreen } from './screens/AdjustAnchorScreen';
import { PlaceDetail } from './screens/PlaceDetail';
import { Offline } from './screens/Offline';
import { Settings } from './screens/Settings';
import { About } from './screens/About';
import { href } from './router';

function Screen(): ReactNode {
  const route = useRoute();
  switch (route.name) {
    case 'today':
      return <Today />;
    case 'decide':
      return <Decide />;
    case 'map':
      return <MapScreen focusId={route.param} />;
    case 'capture':
      return <Capture />;
    case 'more':
      return <More />;
    case 'days':
      return <Days />;
    case 'day':
      return <DayDetail dayId={route.param ?? ''} />;
    case 'route':
      return <RouteScreen />;
    case 'plan':
      return <PlanScreen />;
    case 'prepare':
      return <PrepareScreen dayId={route.param} />;
    case 'add-place':
      return <AddPlaceScreen editId={route.param} />;
    case 'import-route':
      return <ImportRouteScreen />;
    case 'section':
      return <SectionScreen />;
    case 'adjust':
      return <AdjustAnchorScreen anchorId={route.param} />;
    case 'places':
      return <Places />;
    case 'place':
      return <PlaceDetail placeId={route.param ?? ''} />;
    case 'offline':
      return <Offline />;
    case 'settings':
      return <Settings />;
    case 'about':
      return <About />;
    default:
      return (
        <>
          <h1>Not found</h1>
          <p className="mono">{route.raw}</p>
          <a className="btn btn--primary" href={href('/')}>
            Today
          </a>
        </>
      );
  }
}

function Shell(): ReactNode {
  const route = useRoute();
  return (
    <div className="app">
      <a className="skiplink" href="#main">
        Skip to content
      </a>
      <StatusStrip />
      <main className="app__main" id="main">
        <Screen />
      </main>
      <TabBar current={route.name} />
    </div>
  );
}

export function App(): ReactNode {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
